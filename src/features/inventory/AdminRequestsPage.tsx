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
  variant_id: string;
  requested_quantity: number;
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
  variants?: {
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
  variants?: {
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

    // Real-time subscriptions for inventory requests and main inventory
    const channels = [
      subscribeToTable('inventory_requests', (payload) => {
        console.log('🔄 Real-time: Admin request updated', payload);
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
      // Fetch pending requests forwarded by leaders
      const { data: pending, error: pendingError } = await supabase
        .from('inventory_requests')
        .select(`
          *,
          requester:profiles!inventory_requests_requester_id_fkey(id, full_name),
          approver:profiles!inventory_requests_approver_id_fkey(id, full_name),
          variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .eq('request_level', 'leader_to_admin')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (pendingError) throw pendingError;

      // For each pending request, fetch admin's main inventory stock AND original agent request info
      const requestsWithStock = await Promise.all(
        (pending || []).map(async (req) => {
          // Fetch admin's main inventory
          const { data: inventoryData } = await supabase
            .from('main_inventory')
            .select('stock')
            .eq('variant_id', req.variant_id)
            .single();

          // Fetch original agent request info (parent request)
          let agentInfo = null;
          if (req.parent_request_id) {
            const { data: parentRequest } = await supabase
              .from('inventory_requests')
              .select(`
                requester_id,
                requester_notes,
                requester:profiles!inventory_requests_requester_id_fkey(id, full_name)
              `)
              .eq('id', req.parent_request_id)
              .single();

            if (parentRequest) {
              const requesterData = parentRequest.requester as any;
              agentInfo = {
                id: requesterData?.id,
                full_name: requesterData?.full_name,
                notes: parentRequest.requester_notes
              };
            }
          }

          return {
            ...req,
            admin_stock: inventoryData?.stock || 0,
            agent_info: agentInfo
          };
        })
      );

      setPendingRequests(requestsWithStock);

      // Fetch all leader-to-admin requests (for history)
      const { data: all, error: allError } = await supabase
        .from('inventory_requests')
        .select(`
          *,
          requester:profiles!inventory_requests_requester_id_fkey(id, full_name),
          approver:profiles!inventory_requests_approver_id_fkey(id, full_name),
          variants(
            id,
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .eq('request_level', 'leader_to_admin')
        .order('requested_at', { ascending: false });

      if (allError) throw allError;

      setAllRequests(all || []);
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
        const { data, error } = await supabase.rpc('approve_admin_request', {
          p_request_id: selectedRequest.id,
          p_admin_id: user.id,
          p_quantity: parseInt(approveQuantity),
          p_notes: notes || null
        });

        if (error) throw error;

        if (data.success) {
          toast({
            title: 'Success',
            description: data.message
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          toast({
            title: 'Error',
            description: data.message,
            variant: 'destructive'
          });
        }
      } else if (reviewAction === 'deny') {
        const { data, error } = await supabase.rpc('deny_request', {
          p_request_id: selectedRequest.id,
          p_user_id: user.id,
          p_reason: denialReason
        });

        if (error) throw error;

        if (data.success) {
          toast({
            title: 'Success',
            description: data.message
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          toast({
            title: 'Error',
            description: data.message,
            variant: 'destructive'
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
    if (request.variants?.brand) {
      return `${request.variants.brand.name} - ${request.variants.name}`;
    }
    return request.variants?.name || 'Unknown Product';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'denied':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
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
                      <TableHead className="text-right">Requested</TableHead>
                      <TableHead className="text-right">Main Stock</TableHead>
                      <TableHead>Requested Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.requester?.full_name}</TableCell>
                        <TableCell>{request.agent_info?.full_name || 'N/A'}</TableCell>
                        <TableCell>{formatProductName(request)}</TableCell>
                        <TableCell className="text-right">{request.requested_quantity} units</TableCell>
                        <TableCell className="text-right">
                          <span className={request.admin_stock && request.admin_stock >= request.requested_quantity ? 'text-green-600 font-semibold' : request.admin_stock && request.admin_stock > 0 ? 'text-yellow-600 font-semibold' : 'text-red-600 font-semibold'}>
                            {request.admin_stock || 0} units
                          </span>
                        </TableCell>
                        <TableCell>{format(new Date(request.requested_at), 'MMM dd, yyyy')}</TableCell>
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
                    ))}
                    {pendingRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Product</p>
                  <p className="font-semibold">{formatProductName(selectedRequest)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requested Quantity</p>
                  <p className="font-semibold">{selectedRequest.requested_quantity} units</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Main Inventory Stock</p>
                  <p className={`font-semibold ${selectedRequest.admin_stock && selectedRequest.admin_stock >= selectedRequest.requested_quantity ? 'text-green-600' : selectedRequest.admin_stock && selectedRequest.admin_stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {selectedRequest.admin_stock || 0} units
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requested Date</p>
                  <p className="font-semibold">{format(new Date(selectedRequest.requested_at), 'MMM dd, yyyy')}</p>
                </div>
              </div>

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
              {!reviewAction && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto flex-col gap-2 p-4"
                    onClick={() => setReviewAction('approve')}
                    disabled={!selectedRequest.admin_stock || selectedRequest.admin_stock === 0}
                  >
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span>Approve & Allocate</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedRequest.admin_stock && selectedRequest.admin_stock > 0 ? 'Stock available' : 'No stock available'}
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
              )}

              {/* Approve Form */}
              {reviewAction === 'approve' && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Approve Quantity</label>
                    <Input
                      type="number"
                      value={approveQuantity}
                      onChange={(e) => setApproveQuantity(e.target.value)}
                      max={selectedRequest.admin_stock}
                      min="1"
                    />
                    <p className="text-xs text-muted-foreground">
                      Max: {selectedRequest.admin_stock} units (main inventory)
                    </p>
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
                      <strong>Note:</strong> This will allocate stock from Main Inventory → Leader → Agent automatically
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
              )}

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
