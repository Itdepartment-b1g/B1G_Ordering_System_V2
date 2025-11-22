import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Package, CheckCircle2, XCircle, ArrowUp, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

interface AgentRequest {
  id: string;
  variant_id: string;
  requested_quantity: number;
  requester_notes: string | null;
  requested_at: string;
  requester?: {
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
  leader_stock?: number;
}

interface GroupedRequest {
  id: string; // Use first request ID as group ID
  agentId: string;
  agentName: string;
  requested_at: string;
  requests: AgentRequest[];
  totalQuantity: number;
  productCount: number;
  requester_notes: string | null;
}

interface ForwardedRequest {
  id: string;
  variant_id: string;
  requested_quantity: number;
  status: string;
  requested_at: string;
  responded_at: string | null;
  approver_notes: string | null;
  denial_reason: string | null;
  parent_request_id: string | null;
  requester?: {
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

type ReviewAction = 'approve' | 'forward' | 'deny' | null;

export default function PendingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [forwardedRequests, setForwardedRequests] = useState<ForwardedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [selectedRequest, setSelectedRequest] = useState<AgentRequest | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [approveQuantity, setApproveQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchRequests();
    }

    // Real-time subscriptions for inventory requests and agent inventory
    const channels = [
      subscribeToTable('inventory_requests', (payload) => {
        console.log('🔄 Real-time: Request updated', payload);
        if (user?.id) {
          fetchRequests();
        }
      }),
      subscribeToTable('agent_inventory', () => {
        console.log('🔄 Real-time: Leader inventory updated');
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
      // Fetch agent requests - from agents in my team
      const { data: teamData, error: teamError } = await supabase
        .from('leader_teams')
        .select('agent_id')
        .eq('leader_id', user.id);

      if (teamError) throw teamError;

      const agentIds = teamData?.map(t => t.agent_id) || [];

      if (agentIds.length > 0) {
        // Fetch pending requests from team agents
        const { data: requests, error: requestsError } = await supabase
          .from('inventory_requests')
          .select(`
            *,
            requester:profiles!inventory_requests_requester_id_fkey(id, full_name),
            variants(
              id,
              name,
              variant_type,
              brand:brands(name)
            )
          `)
          .in('requester_id', agentIds)
          .eq('request_level', 'agent_to_leader')
          .eq('status', 'pending')
          .order('requested_at', { ascending: false });

        if (requestsError) throw requestsError;

        // Get team members once (outside the loop for efficiency)
        const { data: teamData } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);

        const teamMemberIds = teamData?.map(t => t.agent_id) || [];

        // For each request, fetch leader's available stock
        // Calculate using the same logic as LeaderInventoryPage:
        // Available = Total Stock - Allocated to Team Members - Pending Orders (not yet approved)
        const requestsWithStock = await Promise.all(
          (requests || []).map(async (req) => {
            // Get leader's total stock
            const { data: inventoryData, error: inventoryError } = await supabase
              .from('agent_inventory')
              .select('stock')
              .eq('agent_id', user.id)
              .eq('variant_id', req.variant_id)
              .maybeSingle();

            if (inventoryError || !inventoryData) {
              return {
                ...req,
                leader_stock: 0
              };
            }

            const leaderStock = inventoryData.stock || 0;

            if (teamMemberIds.length === 0) {
              // No team members, all stock is available (but still need to check pending orders)
              // Get pending orders quantity
              const { data: allPendingOrders } = await supabase
                .from('client_orders')
                .select('id, stage')
                .eq('status', 'pending');

              // Filter out orders that have been approved (stage = 'leader_approved' or 'admin_approved')
              const pendingOrders = allPendingOrders?.filter((o: any) =>
                o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
              ) || [];

              const pendingOrderIds = pendingOrders?.map((o: any) => o.id) || [];

              // Get quantities from order items for this variant
              const { data: pendingOrdersData } = pendingOrderIds.length > 0
                ? await supabase
                  .from('client_order_items')
                  .select('quantity')
                  .eq('variant_id', req.variant_id)
                  .in('client_order_id', pendingOrderIds)
                : { data: [] };

              const pendingOrdersQuantity = (pendingOrdersData || []).reduce((sum: number, orderItem: any) => {
                return sum + (orderItem.quantity || 0);
              }, 0);

              const availableStock = Math.max(0, leaderStock - pendingOrdersQuantity);

              return {
                ...req,
                leader_stock: availableStock
              };
            }

            // Get allocated stock (sum of team members' stock for this variant)
            const { data: allocatedData } = await supabase
              .from('agent_inventory')
              .select('stock')
              .eq('variant_id', req.variant_id)
              .in('agent_id', teamMemberIds);

            const allocatedStock = allocatedData?.reduce((sum, item) => sum + (item.stock || 0), 0) || 0;

            // Get pending orders quantity from ALL team members
            // These orders reserve stock, so it should not be available for allocation
            // Filter out orders that have been approved (stage = 'leader_approved' or 'admin_approved')
            // because stock has already been deducted from leader's inventory
            const { data: allPendingOrders } = await supabase
              .from('client_orders')
              .select('id, stage')
              .in('agent_id', teamMemberIds)
              .eq('status', 'pending');

            // Filter out orders that have been approved (stage = 'leader_approved' or 'admin_approved')
            const pendingOrders = allPendingOrders?.filter((o: any) =>
              o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
            ) || [];

            const pendingOrderIds = pendingOrders?.map((o: any) => o.id) || [];

            // Get quantities from order items for this variant
            const { data: pendingOrdersData } = pendingOrderIds.length > 0
              ? await supabase
                .from('client_order_items')
                .select('quantity')
                .eq('variant_id', req.variant_id)
                .in('client_order_id', pendingOrderIds)
              : { data: [] };

            const pendingOrdersQuantity = (pendingOrdersData || []).reduce((sum: number, orderItem: any) => {
              return sum + (orderItem.quantity || 0);
            }, 0);

            // Available = Total - Allocated - Pending Orders
            // Pending orders reserve stock, so it's not available for new allocations
            const availableStock = Math.max(0, leaderStock - allocatedStock - pendingOrdersQuantity);

            return {
              ...req,
              leader_stock: availableStock
            };
          })
        );

        setAgentRequests(requestsWithStock);

        // Group requests by agent and timestamp (bulk requests)
        const grouped = requestsWithStock.reduce((acc: GroupedRequest[], req) => {
          const agentId = req.requester?.id || '';
          const agentName = req.requester?.full_name || 'Unknown';

          // Find existing group with same agent and timestamp (within 1 second)
          const existingGroup = acc.find(g => {
            const timeDiff = Math.abs(new Date(g.requested_at).getTime() - new Date(req.requested_at).getTime());
            return g.agentId === agentId && timeDiff < 1000; // Within 1 second
          });

          if (existingGroup) {
            existingGroup.requests.push(req);
            existingGroup.totalQuantity += req.requested_quantity;
            existingGroup.productCount++;
          } else {
            acc.push({
              id: req.id, // Use first request ID as group ID
              agentId: agentId,
              agentName: agentName,
              requested_at: req.requested_at,
              requests: [req],
              totalQuantity: req.requested_quantity,
              productCount: 1,
              requester_notes: req.requester_notes
            });
          }

          return acc;
        }, []);

        setGroupedRequests(grouped);

        // Fetch forwarded requests (leader's own requests to admin)
        const { data: forwarded, error: forwardedError } = await supabase
          .from('inventory_requests')
          .select(`
            *,
            requester:profiles!inventory_requests_requester_id_fkey(id, full_name),
            variants(
              id,
              name,
              variant_type,
              brand:brands(name)
            )
          `)
          .eq('requester_id', user.id)
          .eq('request_level', 'leader_to_admin')
          .order('requested_at', { ascending: false });

        if (forwardedError) throw forwardedError;

        setForwardedRequests(forwarded || []);
      } else {
        setAgentRequests([]);
        setForwardedRequests([]);
      }
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

  const handleReviewRequest = (request: AgentRequest) => {
    setSelectedRequest(request);
    setApproveQuantity(request.requested_quantity.toString());
    setNotes('');
    setDenialReason('');
    setReviewAction(null);
    setReviewDialogOpen(true);
  };

  const handleConfirmAction = async () => {
    if ((!selectedRequest && !selectedGroup) || !reviewAction || !user?.id) return;

    setProcessing(true);
    try {
      // Get requests to process (all in group or single request)
      const requestsToProcess = selectedGroup?.requests || (selectedRequest ? [selectedRequest] : []);

      if (reviewAction === 'approve') {
        // Process each request in the group
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const { data, error } = await supabase.rpc('approve_agent_request', {
              p_request_id: req.id,
              p_leader_id: user.id,
              p_approved_quantity: req.requested_quantity, // Approve full requested quantity
              p_leader_notes: notes || null
            });

            if (error) throw error;
            return data;
          })
        );

        // Check if all succeeded
        const allSuccess = results.every(r => r?.success);
        if (allSuccess) {
          toast({
            title: 'Success',
            description: `Successfully approved ${requestsToProcess.length} product request(s)`
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find(r => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to approve',
            variant: 'destructive'
          });
        }
      } else if (reviewAction === 'forward') {
        // Process each request in the group
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const { data, error } = await supabase.rpc('forward_request_to_admin', {
              p_agent_request_id: req.id,
              p_leader_id: user.id,
              p_leader_notes: notes || null
            });

            if (error) throw error;
            return data;
          })
        );

        // Check if all succeeded
        const allSuccess = results.every(r => r?.success);
        if (allSuccess) {
          toast({
            title: 'Success',
            description: `Successfully forwarded ${requestsToProcess.length} product request(s) to admin`
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find(r => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to forward',
            variant: 'destructive'
          });
        }
      } else if (reviewAction === 'deny') {
        // Process each request in the group
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const { data, error } = await supabase.rpc('deny_agent_request', {
              p_request_id: req.id,
              p_leader_id: user.id,
              p_reason: denialReason
            });

            if (error) throw error;
            return data;
          })
        );

        // Check if all succeeded
        const allSuccess = results.every(r => r?.success);
        if (allSuccess) {
          toast({
            title: 'Success',
            description: `Successfully denied ${requestsToProcess.length} product request(s)`
          });
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find(r => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to deny',
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

  const formatProductName = (request: AgentRequest | ForwardedRequest) => {
    if (request.variants?.brand) {
      return `${request.variants.brand.name} - ${request.variants.name}`;
    }
    return request.variants?.name || 'Unknown Product';
  };

  const getForwardedStatusBadge = (status: string) => {
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
        <h1 className="text-3xl font-bold">Pending Requests</h1>
        <p className="text-muted-foreground mt-1">
          Review inventory requests from your team
        </p>
      </div>

      {/* Tabs for different request types */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="team">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team">From My Team ({groupedRequests.length})</TabsTrigger>
              <TabsTrigger value="forwarded">My Requests to Admin ({forwardedRequests.length})</TabsTrigger>
            </TabsList>

            {/* Team Requests */}
            <TabsContent value="team">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead className="text-right">Total Quantity</TableHead>
                      <TableHead>Requested Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedRequests.map(group => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.agentName}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {group.requests.slice(0, 3).map((req, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {formatProductName(req)} ({req.requested_quantity})
                              </Badge>
                            ))}
                            {group.requests.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{group.requests.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{group.totalQuantity} units</TableCell>
                        <TableCell>{format(new Date(group.requested_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedGroup(group);
                              setSelectedRequest(group.requests[0]); // Set first request for compatibility
                              setReviewDialogOpen(true);
                            }}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {groupedRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No pending requests from your team</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* Forwarded Requests */}
            <TabsContent value="forwarded">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Forwarded Date</TableHead>
                      <TableHead>Admin Response</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forwardedRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{formatProductName(request)}</TableCell>
                        <TableCell className="text-right">{request.requested_quantity} units</TableCell>
                        <TableCell>{getForwardedStatusBadge(request.status)}</TableCell>
                        <TableCell>{format(new Date(request.requested_at), 'MMM dd, yyyy')}</TableCell>
                        <TableCell>
                          {request.status === 'approved' && request.approver_notes && (
                            <span className="text-green-600 text-sm">{request.approver_notes}</span>
                          )}
                          {request.status === 'denied' && request.denial_reason && (
                            <span className="text-red-600 text-sm">{request.denial_reason}</span>
                          )}
                          {request.status === 'pending' && (
                            <span className="text-muted-foreground text-sm">Waiting for admin...</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {forwardedRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No forwarded requests</p>
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
      <Dialog open={reviewDialogOpen} onOpenChange={(open) => {
        setReviewDialogOpen(open);
        if (!open) {
          setSelectedGroup(null);
          setSelectedRequest(null);
          setReviewAction(null);
          setNotes('');
          setDenialReason('');
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
            <DialogDescription>
              Choose how to handle this inventory request
            </DialogDescription>
          </DialogHeader>

          {(selectedRequest || selectedGroup) && (
            <div className="space-y-4">
              {/* Request Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Agent</p>
                  <p className="font-semibold">{selectedGroup?.agentName || selectedRequest?.requester?.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Products</p>
                  <p className="font-semibold">{selectedGroup?.productCount || 1}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Quantity</p>
                  <p className="font-semibold">{selectedGroup?.totalQuantity || selectedRequest?.requested_quantity} units</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requested Date</p>
                  <p className="font-semibold">{format(new Date(selectedGroup?.requested_at || selectedRequest?.requested_at || ''), 'MMM dd, yyyy HH:mm')}</p>
                </div>
              </div>

              {/* Products List */}
              {selectedGroup && selectedGroup.requests.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Requested Products:</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Requested</TableHead>
                          <TableHead className="text-right">Your Stock</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGroup.requests.map((req) => (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">{formatProductName(req)}</TableCell>
                            <TableCell className="text-right">{req.requested_quantity} units</TableCell>
                            <TableCell className="text-right">
                              <span className={req.leader_stock && req.leader_stock >= req.requested_quantity ? 'text-green-600 font-semibold' : req.leader_stock && req.leader_stock > 0 ? 'text-yellow-600 font-semibold' : 'text-red-600 font-semibold'}>
                                {req.leader_stock || 0} units
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Agent Notes */}
              {(selectedGroup?.requester_notes || selectedRequest?.requester_notes) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Agent's Notes</p>
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <p className="text-sm">{selectedGroup?.requester_notes || selectedRequest?.requester_notes}</p>
                  </div>
                </div>
              )}

              {/* Action Selection */}
              {!reviewAction && (
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto flex-col gap-2 p-4"
                    onClick={() => setReviewAction('approve')}
                    disabled={selectedGroup ? selectedGroup.requests.some(req => !req.leader_stock || req.leader_stock === 0) : (!selectedRequest?.leader_stock || selectedRequest.leader_stock === 0)}
                  >
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                    <span>Approve & Allocate</span>
                    <span className="text-xs text-muted-foreground">
                      {selectedGroup
                        ? (selectedGroup.requests.every(req => req.leader_stock && req.leader_stock >= req.requested_quantity)
                          ? 'All products in stock'
                          : selectedGroup.requests.some(req => req.leader_stock && req.leader_stock > 0)
                            ? 'Some products available'
                            : 'No stock available')
                        : (selectedRequest?.leader_stock && selectedRequest.leader_stock > 0 ? 'You have stock' : 'No stock available')
                      }
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto flex-col gap-2 p-4"
                    onClick={() => setReviewAction('forward')}
                  >
                    <ArrowUp className="h-6 w-6 text-blue-600" />
                    <span>Forward to Admin</span>
                    <span className="text-xs text-muted-foreground">
                      Request from main inventory
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
                  {selectedGroup && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900 mb-1">Approval Summary</p>
                      <p className="text-xs text-blue-700">
                        You are about to approve {selectedGroup.productCount} product(s) with a total quantity of {selectedGroup.totalQuantity} units.
                        Each product will be approved for its full requested quantity.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes (Optional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g., Approved and allocated"
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleConfirmAction} disabled={processing} className="flex-1">
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        `Confirm Approval${selectedGroup ? ` (${selectedGroup.productCount} products)` : ''}`
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => setReviewAction(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {/* Forward Form */}
              {reviewAction === 'forward' && (
                <div className="space-y-4 border-t pt-4">
                  {selectedGroup && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900 mb-1">Forward Summary</p>
                      <p className="text-xs text-blue-700">
                        You are about to forward {selectedGroup.productCount} product request(s) to admin.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes to Admin (Optional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g., I don't have this product in stock"
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleConfirmAction} disabled={processing} className="flex-1">
                      {processing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        `Confirm Forward${selectedGroup ? ` (${selectedGroup.productCount} products)` : ''}`
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
                  {selectedGroup && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-900 mb-1">Denial Summary</p>
                      <p className="text-xs text-red-700">
                        You are about to deny {selectedGroup.productCount} product request(s). This action cannot be undone.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Denial Reason *</label>
                    <Textarea
                      value={denialReason}
                      onChange={(e) => setDenialReason(e.target.value)}
                      placeholder="e.g., This product is discontinued"
                      rows={3}
                      required
                    />
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
                        `Confirm Denial${selectedGroup ? ` (${selectedGroup.productCount} products)` : ''}`
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
