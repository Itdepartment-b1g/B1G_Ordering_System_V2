import { useState, useEffect } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, CheckCircle2, XCircle, ArrowUp, AlertCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';

interface AgentRequest {
  id: string;
  agent_id?: string;
  variant_id: string;
  requested_quantity: number;
  leader_additional_quantity?: number; // Leader's own stock added to request
  is_combined_request?: boolean; // True if includes leader's additional qty
  requester_notes: string | null; // from stock_requests.leader_notes (agent → leader)
  requested_at: string;
  requester?: {
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
  leader_stock?: number;
  status?: string;
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
  responded_at: string | null; // not directly present in stock_requests; kept for UI compatibility
  approver_notes: string | null; // from stock_requests.admin_notes
  denial_reason: string | null; // from stock_requests.rejection_reason
  requester?: {
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

type ReviewAction = 'approve' | 'forward' | 'deny' | null;

export default function PendingRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [forwardedRequests, setForwardedRequests] = useState<ForwardedRequest[]>([]);
  const [readyRequests, setReadyRequests] = useState<AgentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Simple filters/search for scalability
  const [teamSearch, setTeamSearch] = useState('');
  const [readySearch, setReadySearch] = useState('');
  const [forwardSearch, setForwardSearch] = useState('');

  const [selectedRequest, setSelectedRequest] = useState<AgentRequest | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [approveQuantity, setApproveQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [allocatingId, setAllocatingId] = useState<string | null>(null);

  // Leader's additional quantity per request (for pre-order system)
  const [leaderAdditionalQuantities, setLeaderAdditionalQuantities] = useState<Record<string, string>>({});

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    // Initial fetch
    fetchRequests();

    // Debounce timer for smooth real-time updates
    let updateTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing stock requests...');
        fetchRequests();
      }, 300);
    };

    // Subscribe to stock_requests changes
    const requestsChannel = supabase
      .channel(`stock-requests-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'stock_requests',
        },
        (payload) => {
          console.log('🔔 Stock request change detected:', payload.eventType, payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for stock_requests');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for stock_requests');
        }
      });

    // Subscribe to agent_inventory changes (affects available stock calculations)
    const inventoryChannel = supabase
      .channel(`stock-requests-inventory-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'agent_inventory',
        },
        (payload) => {
          console.log('🔔 Inventory change detected (affects stock requests):', payload.eventType, payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for agent_inventory (stock requests view)');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for agent_inventory');
        }
      });

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(inventoryChannel);
    };
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
        // Fetch pending stock requests from team agents
        const { data: rawRequests, error: requestsError } = await supabase
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
            agent:profiles!stock_requests_agent_id_fkey(id, full_name),
            variant:variants(
              id,
              name,
              variant_type,
              brand:brands(name)
            )
          `)
          .in('agent_id', agentIds)
          .eq('leader_id', user.id)
          .eq('status', 'pending')
          .order('requested_at', { ascending: false });

        if (requestsError) throw requestsError;

        const requests: AgentRequest[] = (rawRequests || []).map((row: any) => ({
          id: row.id,
          agent_id: row.agent_id,
          variant_id: row.variant_id,
          requested_quantity: row.requested_quantity,
          requested_at: row.requested_at,
          requester_notes: row.leader_notes || null,
          requester: row.agent ? { id: row.agent.id, full_name: row.agent.full_name } : undefined,
          variant: row.variant || undefined,
          status: row.status,
        }));

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
            
            console.log(`[Stock Check] Variant ${req.variant_id}:`, {
              inventoryData,
              leaderStock: inventoryData?.stock || 0,
              userId: user.id
            });

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

            // Get pending stock requests from team members for this variant
            // These requests are already counted in this fetch, so we should exclude the current request
            const { data: otherPendingRequests } = await supabase
              .from('stock_requests')
              .select('requested_quantity')
              .eq('variant_id', req.variant_id)
              .eq('leader_id', user.id)
              .eq('status', 'pending')
              .neq('id', req.id);

            const otherPendingQuantity = otherPendingRequests?.reduce((sum, r) => sum + (r.requested_quantity || 0), 0) || 0;

            // Get pending orders quantity from team members that haven't been approved yet
            // These orders will need stock allocation, so they should be reserved
            const { data: allPendingOrders } = await supabase
              .from('client_orders')
              .select('id, stage, agent_id')
              .in('agent_id', teamMemberIds)
              .eq('status', 'pending');

            // Only count orders that are still pending approval (not yet approved by leader/admin)
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

            // Available = Total Stock - Other Pending Requests - Pending Orders
            // Note: We don't subtract already allocated stock because allocations already deducted from inventory
            const availableStock = Math.max(0, leaderStock - otherPendingQuantity - pendingOrdersQuantity);
            
            console.log(`[Available Stock Calculation] Variant ${req.variant_id}:`, {
              leaderStock,
              otherPendingQuantity,
              pendingOrdersQuantity,
              availableStock,
              formula: `${leaderStock} - ${otherPendingQuantity} - ${pendingOrdersQuantity} = ${availableStock}`
            });

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
        const { data: rawForwarded, error: forwardedError } = await supabase
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
            variant:variants(
              id,
              name,
              variant_type,
              brand:brands(name)
            )
          `)
          .eq('leader_id', user.id)
          .neq('status', 'pending')
          .order('requested_at', { ascending: false });

        if (forwardedError) throw forwardedError;

        const forwarded: ForwardedRequest[] = (rawForwarded || []).map((row: any) => ({
          id: row.id,
          variant_id: row.variant_id,
          requested_quantity: row.requested_quantity,
          status: row.status,
          requested_at: row.requested_at,
          responded_at: null,
          approver_notes: row.admin_notes || null,
          denial_reason: row.rejection_reason || null,
          requester: undefined,
          variant: row.variant || undefined,
        }));

        setForwardedRequests(forwarded);

        // Fetch requests that have been approved by admin and are ready for allocation
        const { data: rawReady, error: readyError } = await supabase
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
            variant:variants(
              id,
              name,
              variant_type,
              brand:brands(name)
            )
          `)
          .in('agent_id', agentIds)
          .eq('leader_id', user.id)
          .eq('status', 'approved_by_admin')
          .order('requested_at', { ascending: false });

        if (readyError) throw readyError;

        const ready: AgentRequest[] = (rawReady || []).map((row: any) => ({
          id: row.id,
          agent_id: row.agent_id,
          variant_id: row.variant_id,
          requested_quantity: row.requested_quantity,
          leader_additional_quantity: row.leader_additional_quantity || 0,
          is_combined_request: row.is_combined_request || false,
          requested_at: row.requested_at,
          requester_notes: row.leader_notes || null,
          requester: row.agent ? { id: row.agent.id, full_name: row.agent.full_name } : undefined,
          variant: row.variant || undefined,
          status: row.status,
        }));

        setReadyRequests(ready);
      } else {
        setAgentRequests([]);
        setForwardedRequests([]);
        setReadyRequests([]);
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

  const handleAllocateToAgent = async (request: AgentRequest) => {
    if (!user?.id || !request.requester?.id) return;

    setAllocatingId(request.id);
    try {
      // Use the new RPC function that handles combined distribution
      // (leader gets their portion, agent gets theirs)
      const { data, error } = await supabase.rpc('leader_accept_and_distribute_stock', {
        p_request_id: request.id,
        p_leader_id: user.id,
      });

      if (error) {
        console.error('Error distributing stock:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to distribute stock',
          variant: 'destructive',
        });
        return;
      }

      if (data && !data.success) {
        toast({
          title: 'Error',
          description: data.message || 'Failed to distribute stock',
          variant: 'destructive',
        });
        return;
      }

      // Show success with distribution details
      const agentReceived = data?.agent_received || request.requested_quantity;
      const leaderReceived = data?.leader_received || 0;

      toast({
        title: 'Success',
        description: `Stock distributed! Agent received ${agentReceived} units${leaderReceived > 0 ? `, you received ${leaderReceived} units` : ''}.`,
      });

      // Refresh so the row disappears
      fetchRequests();
    } catch (error: any) {
      console.error('Error allocating stock to agent:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to allocate stock to agent',
        variant: 'destructive',
      });
    } finally {
      setAllocatingId(null);
    }
  };

  const handleConfirmAction = async () => {
    if ((!selectedRequest && !selectedGroup) || !reviewAction || !user?.id) return;

    setProcessing(true);
    try {
      // Get requests to process (all in group or single request)
      const requestsToProcess = selectedGroup?.requests || (selectedRequest ? [selectedRequest] : []);

      if (reviewAction === 'approve') {
        // Approve & allocate using stock_requests RPC
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const { data, error } = await supabase.rpc('approve_stock_request_by_leader', {
              p_request_id: req.id,
              p_leader_id: user.id,
              p_notes: notes || null,
            });

            if (error) throw error;
            return data;
          })
        );

        const allSuccess = results.every((r) => r?.success);
        if (allSuccess) {
          toast({
            title: 'Success',
            description: `Successfully approved ${requestsToProcess.length} product request(s)`,
          });

          // Notify Agent
          if (user?.company_id) {
            const agentId = requestsToProcess[0]?.agent_id;
            if (agentId) {
              await sendNotification({
                userId: agentId,
                companyId: (user as any).company_id,
                type: 'stock_request_approved',
                title: 'Stock Request Approved',
                message: `Your leader ${user.full_name} has approved your stock request.`,
                referenceType: 'stock_request',
                referenceId: requestsToProcess[0].id
              });
            }
          }

          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find((r) => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to approve',
            variant: 'destructive',
          });
        }
      } else if (reviewAction === 'forward') {
        // Forward with leader's additional quantity using new RPC
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const leaderAdditionalQty = parseInt(leaderAdditionalQuantities[req.id] || '0') || 0;

            const { data, error } = await supabase.rpc('forward_stock_request_with_leader_qty', {
              p_request_id: req.id,
              p_leader_id: user.id,
              p_leader_additional_quantity: leaderAdditionalQty,
              p_notes: notes || null,
            });

            if (error) throw error;
            return data;
          })
        );

        const allSuccess = results.every((r) => r?.success);
        if (allSuccess) {
          // Calculate totals for notification
          const totalAgentQty = requestsToProcess.reduce((sum, r) => sum + r.requested_quantity, 0);
          const totalLeaderQty = requestsToProcess.reduce((sum, r) => sum + (parseInt(leaderAdditionalQuantities[r.id] || '0') || 0), 0);

          toast({
            title: 'Success',
            description: `Forwarded ${requestsToProcess.length} product(s) to admin${totalLeaderQty > 0 ? ` (includes ${totalLeaderQty} units for yourself)` : ''}`,
          });

          // Notify Agent
          if (user?.company_id) {
            const agentId = requestsToProcess[0]?.agent_id;
            if (agentId) {
              await sendNotification({
                userId: agentId,
                companyId: (user as any).company_id,
                type: 'system_message',
                title: 'Stock Request Escalated',
                message: `Your leader ${user.full_name} has forwarded your stock request to Admin for approval.`,
                referenceType: 'stock_request',
                referenceId: requestsToProcess[0].id
              });
            }
          }

          // Reset leader additional quantities
          setLeaderAdditionalQuantities({});
          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find((r) => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to forward',
            variant: 'destructive',
          });
        }
      } else if (reviewAction === 'deny') {
        // Deny via reject_stock_request RPC
        const results = await Promise.all(
          requestsToProcess.map(async (req) => {
            const { data, error } = await supabase.rpc('reject_stock_request', {
              p_request_id: req.id,
              p_rejector_id: user.id,
              p_reason: denialReason,
            });

            if (error) throw error;
            return data;
          })
        );

        const allSuccess = results.every((r) => r?.success);
        if (allSuccess) {
          toast({
            title: 'Success',
            description: `Successfully denied ${requestsToProcess.length} product request(s)`,
          });

          // Notify Agent
          if (user?.company_id) {
            const agentId = requestsToProcess[0]?.agent_id;
            if (agentId) {
              await sendNotification({
                userId: agentId,
                companyId: (user as any).company_id,
                type: 'stock_request_rejected',
                title: 'Stock Request Denied',
                message: `Your stock request was denied by ${user.full_name}. Reason: ${denialReason || 'No reason provided'}`,
                referenceType: 'stock_request',
                referenceId: requestsToProcess[0].id
              });
            }
          }

          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          const failed = results.find((r) => !r?.success);
          toast({
            title: 'Error',
            description: failed?.message || 'Some requests failed to deny',
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

  const formatProductName = (request: AgentRequest | ForwardedRequest) => {
    if (request.variant?.brand) {
      return `${request.variant.brand.name} - ${request.variant.name}`;
    }
    return request.variant?.name || 'Unknown Product';
  };

  const getForwardedStatusBadge = (status: string) => {
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
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Apply basic filtering for large datasets
  const filteredGroupedRequests = groupedRequests.filter((group) => {
    if (!teamSearch.trim()) return true;
    const q = teamSearch.toLowerCase();
    const matchesAgent = group.agentName.toLowerCase().includes(q);
    const matchesProduct = group.requests.some((req) =>
      formatProductName(req).toLowerCase().includes(q)
    );
    return matchesAgent || matchesProduct;
  });

  const filteredReadyRequests = readyRequests.filter((req) => {
    if (!readySearch.trim()) return true;
    const q = readySearch.toLowerCase();
    const agentName = req.requester?.full_name?.toLowerCase() || '';
    const productName = formatProductName(req).toLowerCase();
    return agentName.includes(q) || productName.includes(q);
  });

  const filteredForwardedRequests = forwardedRequests.filter((req) => {
    if (!forwardSearch.trim()) return true;
    const q = forwardSearch.toLowerCase();
    const productName = formatProductName(req).toLowerCase();
    const status = req.status.toLowerCase();
    return productName.includes(q) || status.includes(q);
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header + high-level stats */}
      <div className="flex flex-col gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Stock Requests</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Review inventory requests
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-3 text-sm">
          <Card className="shadow-none border-dashed">
            <CardContent className="py-2 md:py-3 px-2 md:px-4">
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">From Team</p>
              <p className="text-lg md:text-xl font-semibold">{groupedRequests.length}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none border-dashed">
            <CardContent className="py-2 md:py-3 px-2 md:px-4">
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">Ready</p>
              <p className="text-lg md:text-xl font-semibold text-green-600">{readyRequests.length}</p>
            </CardContent>
          </Card>
          <Card className="shadow-none border-dashed">
            <CardContent className="py-2 md:py-3 px-2 md:px-4">
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">To Admin</p>
              <p className="text-lg md:text-xl font-semibold">{forwardedRequests.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main partitions via tabs */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Request Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <Tabs defaultValue="team" className="space-y-3 md:space-y-4">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="team" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">My Team</TabsTrigger>
              <TabsTrigger value="ready" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">Ready</TabsTrigger>
              <TabsTrigger value="forwarded" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">To Admin</TabsTrigger>
            </TabsList>

            {/* Team Requests */}
            <TabsContent value="team">
              {/* Controls */}
              <div className="flex flex-col gap-2 md:gap-3 mb-3">
                <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
                  Pending requests grouped by agent and request time.
                </p>
                <Input
                  placeholder="Search..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="h-9 md:h-10 text-sm"
                />
              </div>

              {isMobile ? (
                // Mobile Cards View
                <div className="space-y-3">
                  {filteredGroupedRequests.map(group => (
                    <Card key={group.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{group.agentName}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(group.requested_at), 'MMM dd, yyyy')}
                            </div>
                          </div>
                          <Badge variant="outline" className="ml-2 text-[10px] h-5 flex-shrink-0">
                            {group.totalQuantity} units
                          </Badge>
                        </div>

                        {/* Products */}
                        <div className="space-y-1 mb-3 pb-3 border-b">
                          <div className="text-[10px] font-medium text-muted-foreground">Products:</div>
                          <div className="flex flex-wrap gap-1">
                            {group.requests.slice(0, 2).map((req, idx) => (
                              <Badge key={idx} variant="outline" className="text-[9px] h-5">
                                {formatProductName(req)} ({req.requested_quantity})
                              </Badge>
                            ))}
                            {group.requests.length > 2 && (
                              <Badge variant="secondary" className="text-[9px] h-5">
                                +{group.requests.length - 2}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Review Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-xs"
                          onClick={() => {
                            setSelectedGroup(group);
                            setSelectedRequest(group.requests[0]);
                            setReviewAction(null);
                            setNotes('');
                            setDenialReason('');
                            setLeaderAdditionalQuantities({});
                            setReviewDialogOpen(true);
                          }}
                        >
                          Review Request
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredGroupedRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No pending requests</p>
                    </div>
                  )}
                </div>
              ) : (
                // Desktop Table View
                <div className="border rounded-lg overflow-hidden bg-card">
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
                      {filteredGroupedRequests.map(group => (
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
                                setReviewAction(null);
                                setNotes('');
                                setDenialReason('');
                                setLeaderAdditionalQuantities({});
                                setReviewDialogOpen(true);
                              }}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredGroupedRequests.length === 0 && (
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
              )}
            </TabsContent>

            {/* Ready to Allocate (Admin Approved) */}
            <TabsContent value="ready">
              <div className="flex flex-col gap-2 md:gap-3 mb-3">
                <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
                  Requests approved by admin and ready to allocate from your inventory.
                </p>
                <Input
                  placeholder="Search..."
                  value={readySearch}
                  onChange={(e) => setReadySearch(e.target.value)}
                  className="h-9 md:h-10 text-sm"
                />
              </div>

              {isMobile ? (
                // Mobile Cards View
                <div className="space-y-3">
                  {filteredReadyRequests.map(req => (
                    <Card key={req.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {req.requester?.full_name || 'Unknown Agent'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {formatProductName(req)}
                            </div>
                          </div>
                          <Badge variant="outline" className="ml-2 text-[10px] h-5 flex-shrink-0">
                            {req.requested_quantity} units
                          </Badge>
                        </div>

                        {/* Stock Info */}
                        <div className="grid grid-cols-2 gap-2 mb-3 pb-3 border-b text-xs">
                          <div>
                            <div className="text-[10px] text-muted-foreground">Your Stock</div>
                            <div className="font-semibold">{req.leader_stock || 0} units</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">Requested</div>
                            <div className="font-semibold text-primary">{format(new Date(req.requested_at), 'MMM dd')}</div>
                          </div>
                        </div>

                        {/* Allocate Button */}
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full h-8 text-xs"
                          onClick={() => handleAllocateToAgent(req)}
                          disabled={allocatingId === req.id || (req.leader_stock || 0) < req.requested_quantity}
                        >
                          {allocatingId === req.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Allocating...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="mr-2 h-3 w-3" />
                              Allocate Stock
                            </>
                          )}
                        </Button>
                        {(req.leader_stock || 0) < req.requested_quantity && (
                          <p className="text-[10px] text-red-600 mt-1 text-center">
                            Insufficient stock
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {filteredReadyRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No ready requests</p>
                    </div>
                  )}
                </div>
              ) : (
                // Desktop Table View
                <div className="border rounded-lg overflow-hidden bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Agent Qty</TableHead>
                        <TableHead className="text-right">Your Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReadyRequests.map((req) => {
                        const totalQty = req.requested_quantity + (req.leader_additional_quantity || 0);

                        return (
                          <TableRow key={req.id}>
                            <TableCell className="font-medium">
                              {req.requester?.full_name || 'Unknown'}
                            </TableCell>
                            <TableCell>{formatProductName(req)}</TableCell>
                            <TableCell className="text-right">
                              {req.requested_quantity}
                            </TableCell>
                            <TableCell className="text-right">
                              {req.leader_additional_quantity ? (
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                  +{req.leader_additional_quantity}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {totalQty}
                            </TableCell>
                            <TableCell>
                              {format(new Date(req.requested_at), 'MMM dd')}
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleAllocateToAgent(req)}
                                disabled={allocatingId === req.id}
                              >
                                {allocatingId === req.id ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Distributing...
                                  </>
                                ) : (
                                  'Accept & Distribute'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedGroup(null);
                                  setSelectedRequest(req);
                                  setReviewAction(null);
                                  setNotes('');
                                  setDenialReason('');
                                  setLeaderAdditionalQuantities({});
                                  setReviewDialogOpen(true);
                                }}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredReadyRequests.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No admin-approved requests waiting for distribution</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* Forwarded Requests */}
            <TabsContent value="forwarded">
              <div className="flex flex-col gap-2 md:gap-3 mb-3">
                <p className="text-xs md:text-sm text-muted-foreground hidden md:block">
                  Track the status of the requests you escalated to admin.
                </p>
                <Input
                  placeholder="Search..."
                  value={forwardSearch}
                  onChange={(e) => setForwardSearch(e.target.value)}
                  className="h-9 md:h-10 text-sm"
                />
              </div>

              {isMobile ? (
                // Mobile Cards View
                <div className="space-y-3">
                  {filteredForwardedRequests.map(req => {
                    const statusColor =
                      req.status === 'approved_by_admin' ? 'bg-green-50 border-green-200' :
                        req.status === 'rejected' ? 'bg-red-50 border-red-200' :
                          'bg-background';

                    return (
                      <Card key={req.id} className={`hover:shadow-md transition-shadow ${statusColor}`}>
                        <CardContent className="p-3">
                          {/* Header */}
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {formatProductName(req)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(req.requested_at), 'MMM dd, yyyy')}
                              </div>
                            </div>
                            {req.status === 'approved_by_admin' && (
                              <Badge variant="default" className="ml-2 text-[10px] h-5 flex-shrink-0 bg-green-600">
                                Approved
                              </Badge>
                            )}
                            {req.status === 'rejected' && (
                              <Badge variant="destructive" className="ml-2 text-[10px] h-5 flex-shrink-0">
                                Rejected
                              </Badge>
                            )}
                            {req.status === 'forwarded_to_admin' && (
                              <Badge variant="secondary" className="ml-2 text-[10px] h-5 flex-shrink-0">
                                Pending
                              </Badge>
                            )}
                          </div>

                          {/* Info */}
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Quantity:</span>
                              <span className="font-semibold">{req.requested_quantity} units</span>
                            </div>
                            {req.approver_notes && (
                              <div className="pt-2 border-t">
                                <div className="text-[10px] text-muted-foreground mb-1">Admin Notes:</div>
                                <div className="text-xs">{req.approver_notes}</div>
                              </div>
                            )}
                            {req.denial_reason && (
                              <div className="pt-2 border-t">
                                <div className="text-[10px] text-muted-foreground mb-1">Denial Reason:</div>
                                <div className="text-xs text-red-600">{req.denial_reason}</div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {filteredForwardedRequests.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No forwarded requests</p>
                    </div>
                  )}
                </div>
              ) : (
                // Desktop Table View
                <div className="border rounded-lg overflow-hidden bg-card">
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
                      {filteredForwardedRequests.map(request => (
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
                      {filteredForwardedRequests.length === 0 && (
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
              )}
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
          setLeaderAdditionalQuantities({});
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

              {/* Action Selection (only for pending requests) */}
              {!reviewAction && (selectedGroup || selectedRequest?.status === 'pending') && (
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
                        Forward {selectedGroup.productCount} product request(s) to admin. You can add your own quantity for each product below.
                      </p>
                    </div>
                  )}

                  {/* Leader Additional Quantity Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Add Your Own Stock Quantity (Optional)</label>
                    <p className="text-xs text-muted-foreground">
                      Request additional stock for yourself alongside the agent's request. This will be combined into a single request to admin.
                    </p>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right w-24">Agent Qty</TableHead>
                            <TableHead className="text-right w-32">Your Additional Qty</TableHead>
                            <TableHead className="text-right w-24">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(selectedGroup?.requests || (selectedRequest ? [selectedRequest] : [])).map((req) => {
                            const leaderQty = parseInt(leaderAdditionalQuantities[req.id] || '0') || 0;
                            const totalQty = req.requested_quantity + leaderQty;
                            return (
                              <TableRow key={req.id}>
                                <TableCell className="font-medium text-sm">{formatProductName(req)}</TableCell>
                                <TableCell className="text-right">{req.requested_quantity}</TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={leaderAdditionalQuantities[req.id] || ''}
                                    onChange={(e) => setLeaderAdditionalQuantities(prev => ({
                                      ...prev,
                                      [req.id]: e.target.value
                                    }))}
                                    className="w-24 text-right h-8"
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold text-primary">{totalQty}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Total Summary */}
                    {(() => {
                      const requests = selectedGroup?.requests || (selectedRequest ? [selectedRequest] : []);
                      const totalAgentQty = requests.reduce((sum, r) => sum + r.requested_quantity, 0);
                      const totalLeaderQty = requests.reduce((sum, r) => sum + (parseInt(leaderAdditionalQuantities[r.id] || '0') || 0), 0);
                      const grandTotal = totalAgentQty + totalLeaderQty;

                      return (
                        <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Agent's Request</p>
                            <p className="text-lg font-semibold">{totalAgentQty}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Your Addition</p>
                            <p className="text-lg font-semibold text-blue-600">+{totalLeaderQty}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total to Admin</p>
                            <p className="text-lg font-semibold text-primary">{grandTotal}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

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
