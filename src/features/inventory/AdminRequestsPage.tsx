import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Package, CheckCircle2, XCircle, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

interface PendingRequest {
  id: string;
  agent_id: string;
  variant_id: string;
  requested_quantity: number;
  leader_additional_quantity: number; // Leader's own stock request
  is_combined_request: boolean; // True if includes leader qty
  requester_notes: string | null;
  approver_notes: string | null;
  requested_at: string;
  parent_request_id: string | null;
  requester?: {
    id: string;
    full_name: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
  variant?: {
    id: string;
    name: string;
    variant_type: string;
    brand?: {
      name: string;
    };
  };
  agent_info?: {
    id: string;
    full_name: string;
    notes: string | null;
  };
  admin_stock?: number;
  available_stock?: number; // Available stock from main inventory
}

interface AllRequest {
  id: string;
  variant_id: string;
  requested_quantity: number;
  status: string;
  requested_at: string;
  responded_at: string | null;
  requester_notes: string | null;
  approver_notes: string | null;
  denial_reason: string | null;
  requester?: {
    id: string;
    full_name: string;
  };
  approver?: {
    id: string;
    full_name: string;
  };
  variant?: {
    id: string;
    name: string;
    variant_type: string;
    brand?: {
      name: string;
    };
  };
}

type ReviewAction = 'approve' | 'deny' | null;

export default function AdminRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [allRequests, setAllRequests] = useState<AllRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [approveQuantity, setApproveQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchRequests();
    }

    // Real-time subscriptions for stock requests and main inventory
    const channels = [
      subscribeToTable('stock_requests', (payload) => {
        console.log('🔄 Real-time: Admin stock request updated', payload);
        if (user?.id) {
          fetchRequests();
        }
      }),
      subscribeToTable('main_inventory', () => {
        console.log('🔄 Real-time: Main inventory updated');
        if (user?.id) {
          fetchRequests(); // Re-fetch to update stock levels
        }
      })
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id]);

  const fetchRequests = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Fetch pending requests forwarded by leaders (approved_by_leader → awaiting admin)
      const { data: rawPending, error: pendingError } = await supabase
        .from('stock_requests')
        .select(`
          id,
          agent_id,
          leader_id,
          variant_id,
          requested_quantity,
          leader_additional_quantity,
          is_combined_request,
          requested_at,
          status,
          leader_notes,
          admin_notes,
          rejection_reason,
          agent:profiles!stock_requests_agent_id_fkey(id, full_name),
          leader:profiles!stock_requests_leader_id_fkey(id, full_name),
          variant:variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .eq('status', 'approved_by_leader')
        .order('requested_at', { ascending: false });

      if (pendingError) throw pendingError;

      const basePending: PendingRequest[] = (rawPending || []).map((row: any) => {
        // Supabase can return joined relations as arrays or single objects
        const rawAgent = (row as any).agent;
        const rawLeader = (row as any).leader;
        const agent = Array.isArray(rawAgent) ? rawAgent[0] : rawAgent;
        const leader = Array.isArray(rawLeader) ? rawLeader[0] : rawLeader;

        return {
          id: row.id,
          agent_id: row.agent_id,
          variant_id: row.variant_id,
          requested_quantity: row.requested_quantity,
          leader_additional_quantity: row.leader_additional_quantity || 0,
          is_combined_request: row.is_combined_request || false,
          requested_at: row.requested_at,
          requester_notes: row.leader_notes || null,
          approver_notes: row.admin_notes || null,
          parent_request_id: null,
          requester: leader ? { id: leader.id, full_name: leader.full_name } : undefined,
          approver: undefined,
          variant: row.variant || undefined,
          agent_info: agent
            ? { id: agent.id, full_name: agent.full_name, notes: row.leader_notes || null }
            : undefined,
          admin_stock: 0,
          available_stock: 0,
        };
      });

      // For each pending request, fetch admin's main inventory stock (with available calculation)
      const requestsWithStock = await Promise.all(
        basePending.map(async (req) => {
          // Start with any agent_info from the join
          let agentInfo = req.agent_info;

          // Fallback: if join didn't return an agent, fetch profile directly
          if (!agentInfo && req.agent_id) {
            const { data: agentProfile } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', req.agent_id)
              .maybeSingle();

            if (agentProfile) {
              agentInfo = {
                id: agentProfile.id,
                full_name: agentProfile.full_name,
                notes: req.requester_notes,
              };
            }
          }

          // Fetch admin's main inventory with allocated_stock
          const { data: inventoryData } = await supabase
            .from('main_inventory')
            .select('stock, allocated_stock')
            .eq('variant_id', req.variant_id)
            .single();

          const totalStock = inventoryData?.stock || 0;
          const allocatedStock = inventoryData?.allocated_stock || 0;
          const availableStock = totalStock - allocatedStock;

          return {
            ...req,
            admin_stock: totalStock,
            available_stock: availableStock,
            agent_info: agentInfo,
          };
        })
      );

      setPendingRequests(requestsWithStock);

      // Fetch all leader-to-admin related requests (for history)
      const { data: rawAll, error: allError } = await supabase
        .from('stock_requests')
        .select(`
          id,
          agent_id,
          leader_id,
          variant_id,
          requested_quantity,
          requested_at,
          status,
          leader_notes,
          admin_notes,
          rejection_reason,
          leader:profiles!stock_requests_leader_id_fkey(id, full_name),
          variant:variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .order('requested_at', { ascending: false });

      if (allError) throw allError;

      const allMapped: AllRequest[] = (rawAll || []).map((row: any) => ({
        id: row.id,
        variant_id: row.variant_id,
        requested_quantity: row.requested_quantity,
        status: row.status,
        requested_at: row.requested_at,
        responded_at: null,
        requester_notes: row.leader_notes || null,
        approver_notes: row.admin_notes || null,
        denial_reason: row.rejection_reason || null,
        requester: row.leader ? { id: row.leader.id, full_name: row.leader.full_name } : undefined,
        approver: undefined,
        variant: row.variant || undefined,
      }));

      setAllRequests(allMapped);
    } catch (error: any) {
      console.error('Error fetching requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load requests',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReviewRequest = (request: PendingRequest) => {
    setSelectedRequest(request);
    setApproveQuantity(request.requested_quantity.toString());
    setNotes('');
    setDenialReason('');
    setReviewAction(null);
    setReviewDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest || !reviewAction || !user?.id) return;

    setProcessing(true);
    try {
      if (reviewAction === 'approve') {
        // Calculate total quantity needed
        const totalQty = selectedRequest.requested_quantity + (selectedRequest.leader_additional_quantity || 0);

        // Check available stock first
        if ((selectedRequest.available_stock || 0) < totalQty) {
          toast({
            title: 'Insufficient Stock',
            description: `Available: ${selectedRequest.available_stock || 0}, Requested: ${totalQty}`,
            variant: 'destructive',
          });
          setProcessing(false);
          return;
        }

        // Approve using new RPC function that handles inventory allocation
        const { data, error } = await supabase.rpc('admin_approve_stock_request', {
          p_request_id: selectedRequest.id,
          p_admin_id: user.id,
          p_notes: notes || null,
        });

        if (error) throw error;

        if (data?.success) {
          toast({
            title: 'Success',
            description: `Request approved! ${totalQty} units allocated (Agent: ${selectedRequest.requested_quantity}, Leader: ${selectedRequest.leader_additional_quantity || 0})`,
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          toast({
            title: 'Error',
            description: data?.message || 'Failed to approve request',
            variant: 'destructive',
          });
        }
      } else if (reviewAction === 'deny') {
        // Deny request via new RPC
        const { data, error } = await supabase.rpc('admin_reject_stock_request', {
          p_request_id: selectedRequest.id,
          p_admin_id: user.id,
          p_reason: denialReason,
        });

        if (error) throw error;

        if (data?.success) {
          toast({
            title: 'Success',
            description: data.message || 'Request denied',
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          toast({
            title: 'Error',
            description: data?.message || 'Failed to deny request',
            variant: 'destructive',
          });
        }
      }
    } catch (error: any) {
      console.error('Error processing request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process request',
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
    }
  };

  const formatProductName = (request: PendingRequest | AllRequest) => {
    if (request.variant?.brand) {
      return `${request.variant.brand.name} - ${request.variant.name}`;
    }
    return request.variant?.name || 'Unknown Product';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved_by_admin':
      case 'fulfilled':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Inventory Requests</h1>
        <p className="text-muted-foreground mt-1">
          Review and manage inventory requests from team leaders
        </p>
      </div>

      {/* Tabs for different request views */}
      <Card>
        <CardHeader>
          <CardTitle>Request Management</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending">Pending Requests ({pendingRequests.length})</TabsTrigger>
              <TabsTrigger value="all">All Requests ({allRequests.length})</TabsTrigger>
            </TabsList>

            {/* Pending Requests */}
            <TabsContent value="pending">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leader</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Agent Qty</TableHead>
                      <TableHead className="text-right">Leader Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(request => {
                      const totalQty = request.requested_quantity + (request.leader_additional_quantity || 0);
                      const hasEnoughStock = (request.available_stock || 0) >= totalQty;

                      return (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.requester?.full_name}</TableCell>
                          <TableCell>{request.agent_info?.full_name || 'N/A'}</TableCell>
                          <TableCell>{formatProductName(request)}</TableCell>
                          <TableCell className="text-right">{request.requested_quantity}</TableCell>
                          <TableCell className="text-right">
                            {request.leader_additional_quantity ? (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                +{request.leader_additional_quantity}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{totalQty}</TableCell>
                          <TableCell className="text-right">
                            <span className={hasEnoughStock ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                              {request.available_stock || 0}
                            </span>
                          </TableCell>
                          <TableCell>{format(new Date(request.requested_at), 'MMM dd')}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReviewRequest(request)}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pendingRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No pending requests</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* All Requests */}
            <TabsContent value="all">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leader</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested Date</TableHead>
                      <TableHead>Response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.requester?.full_name}</TableCell>
                        <TableCell>{formatProductName(request)}</TableCell>
                        <TableCell className="text-right">{request.requested_quantity} units</TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell>{format(new Date(request.requested_at), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          {request.status === 'approved' && request.approver_notes && (
                            <span className="text-green-600 text-sm">{request.approver_notes}</span>
                          )}
                          {request.status === 'denied' && request.denial_reason && (
                            <span className="text-red-600 text-sm">{request.denial_reason}</span>
                          )}
                          {request.status === 'pending' && (
                            <span className="text-muted-foreground text-sm">Awaiting review...</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {allRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No requests found</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Review Request Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>
              Complete request chain: Agent → Leader → Admin
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Request Chain */}
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-semibold mb-3">Request Chain:</p>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded">
                    <span className="font-medium">{selectedRequest.agent_info?.full_name || 'Agent'}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded">
                    <span className="font-medium">{selectedRequest.requester?.full_name} (Leader)</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded">
                    <span className="font-medium">You (Admin)</span>
                  </div>
                </div>
              </div>

              {/* Request Details */}
              {(() => {
                const totalQty = selectedRequest.requested_quantity + (selectedRequest.leader_additional_quantity || 0);
                const hasEnoughStock = (selectedRequest.available_stock || 0) >= totalQty;

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">Product</p>
                        <p className="font-semibold">{formatProductName(selectedRequest)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Requested Date</p>
                        <p className="font-semibold">{format(new Date(selectedRequest.requested_at), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>

                    {/* Quantity Breakdown */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold">Quantity Breakdown</p>
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-xs text-blue-600">Agent Request</p>
                          <p className="text-xl font-bold text-blue-700">{selectedRequest.requested_quantity}</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-xs text-green-600">Leader Addition</p>
                          <p className="text-xl font-bold text-green-700">+{selectedRequest.leader_additional_quantity || 0}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg border-2 border-purple-200">
                          <p className="text-xs text-purple-600">Total Needed</p>
                          <p className="text-xl font-bold text-purple-700">{totalQty}</p>
                        </div>
                        <div className={`p-3 rounded-lg ${hasEnoughStock ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <p className={`text-xs ${hasEnoughStock ? 'text-emerald-600' : 'text-red-600'}`}>Available Stock</p>
                          <p className={`text-xl font-bold ${hasEnoughStock ? 'text-emerald-700' : 'text-red-700'}`}>
                            {selectedRequest.available_stock || 0}
                          </p>
                        </div>
                      </div>

                      {!hasEnoughStock && (
                        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          <AlertCircle className="h-4 w-4" />
                          <span>Insufficient stock! Need {totalQty - (selectedRequest.available_stock || 0)} more units.</span>
                        </div>
                      )}

                      {selectedRequest.is_combined_request && (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                          <Package className="h-4 w-4" />
                          <span>This is a combined request. After approval, leader will distribute: {selectedRequest.leader_additional_quantity || 0} for themselves, {selectedRequest.requested_quantity} for the agent.</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Agent's Original Notes */}
              {selectedRequest.agent_info?.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Agent's Original Notes</p>
                  <div className="border rounded-lg p-3 bg-blue-50/50">
                    <p className="text-sm">{selectedRequest.agent_info.notes}</p>
                  </div>
                </div>
              )}

              {/* Leader's Notes */}
              {selectedRequest.requester_notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Leader's Notes</p>
                  <div className="border rounded-lg p-3 bg-green-50/50">
                    <p className="text-sm">{selectedRequest.requester_notes}</p>
                  </div>
                </div>
              )}

              {/* Action Selection */}
              {!reviewAction && (() => {
                const totalQty = selectedRequest.requested_quantity + (selectedRequest.leader_additional_quantity || 0);
                const hasEnoughStock = (selectedRequest.available_stock || 0) >= totalQty;

                return (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-auto flex-col gap-2 p-4"
                      onClick={() => setReviewAction('approve')}
                      disabled={!hasEnoughStock}
                    >
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <span>Approve & Allocate</span>
                      <span className="text-xs text-muted-foreground">
                        {hasEnoughStock ? `Allocate ${totalQty} units` : 'Insufficient stock'}
                      </span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto flex-col gap-2 p-4"
                      onClick={() => setReviewAction('deny')}
                    >
                      <XCircle className="h-6 w-6 text-red-600" />
                      <span>Deny Request</span>
                      <span className="text-xs text-muted-foreground">
                        Cannot fulfill
                      </span>
                    </Button>
                  </div>
                );
              })()}

              {/* Approve Form */}
              {reviewAction === 'approve' && (() => {
                const totalQty = selectedRequest.requested_quantity + (selectedRequest.leader_additional_quantity || 0);

                return (
                  <div className="space-y-4 border-t pt-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-emerald-800 mb-2">Allocation Summary</p>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-xs text-emerald-600">Total Allocated</p>
                          <p className="text-lg font-bold text-emerald-700">{totalQty} units</p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-600">→ For Leader</p>
                          <p className="text-lg font-bold text-emerald-700">{selectedRequest.leader_additional_quantity || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-600">→ For Agent</p>
                          <p className="text-lg font-bold text-emerald-700">{selectedRequest.requested_quantity}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notes (Optional)</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g., Approved and allocated to leader and agent"
                        rows={2}
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Note:</strong> Stock will be reserved in allocated_stock. Leader will distribute to themselves and the agent when they accept.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={handleConfirmAction} disabled={processing} className="flex-1">
                        {processing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          'Confirm Approval'
                        )}
                      </Button>
                      <Button variant="outline" onClick={() => setReviewAction(null)}>
                        Back
                      </Button>
                    </div>
                  </div>
                );
              })()}

              {/* Deny Form */}
              {reviewAction === 'deny' && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Denial Reason *</label>
                    <Textarea
                      value={denialReason}
                      onChange={(e) => setDenialReason(e.target.value)}
                      placeholder="e.g., Out of stock - supplier delayed"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">
                      <strong>Note:</strong> This will deny both the leader's request and the original agent's request
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleConfirmAction}
                      disabled={processing || !denialReason.trim()}
                      variant="destructive"
                      className="flex-1"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Confirm Denial'
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setReviewAction(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!reviewAction && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
