import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refetchSuperAdminAllocationHistory } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useSuperAdminAllocationHistory';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Package, CheckCircle2, XCircle, ArrowUp, ArrowDown, ArrowUpDown, AlertCircle, Loader2, Printer, MoreVertical, Search } from 'lucide-react';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { exportMobileSalesStockRequestPdf } from './utils/exportMobileSalesStockRequestPdf';
import { exportLeaderStockRequestPdf } from './utils/exportLeaderStockRequestPdf';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_TEAM_GROUPED_SORT_DIRECTION,
  DEFAULT_TEAM_GROUPED_SORT_KEY,
  sortTeamGroupedRequests,
  type TeamGroupedRequestSortKey,
} from '@/features/inventory/utils/pendingRequestsSorting';

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
  denial_reason?: string | null;
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
  status: string;
  source: 'team' | 'leader';
}

function variantTypeLabel(type: string | null | undefined): string {
  if (!type?.trim()) return '';
  const key = type.trim().toLowerCase();
  if (key === 'foc' || key === 'posm' || key === 'ncv') return key.toUpperCase();
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function isApprovedRequestStatus(status: string): boolean {
  return status === 'approved_by_admin' || status === 'fulfilled';
}

const queueColumns =
  'grid grid-cols-[1.25rem_minmax(8rem,1.15fr)_minmax(14rem,1.7fr)_6.5rem_11.5rem_7.5rem_13.5rem] items-center gap-x-3 px-3';

function buildRequestGroups(requests: AgentRequest[], source: 'team' | 'leader'): GroupedRequest[] {
  return requests.reduce((acc: GroupedRequest[], req) => {
    const agentId = req.requester?.id || req.agent_id || '';
    const agentName = req.requester?.full_name || 'Unknown';
    const status = req.status || 'pending';
    const lineQuantity = req.requested_quantity + (req.leader_additional_quantity || 0);
    const existingGroup = acc.find((group) => {
      const timeDiff = Math.abs(new Date(group.requested_at).getTime() - new Date(req.requested_at).getTime());
      return group.agentId === agentId && group.status === status && timeDiff < 1000;
    });

    if (existingGroup) {
      existingGroup.requests.push(req);
      existingGroup.totalQuantity += lineQuantity;
      existingGroup.productCount += 1;
      return acc;
    }

    acc.push({
      id: req.id,
      agentId,
      agentName,
      requested_at: req.requested_at,
      requests: [req],
      totalQuantity: lineQuantity,
      productCount: 1,
      requester_notes: req.requester_notes,
      status,
      source,
    });
    return acc;
  }, []);
}

interface ForwardedRequest {
  id: string;
  agent_id?: string;
  variant_id: string;
  requested_quantity: number;
  leader_additional_quantity?: number;
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

function parseRpcResult<T extends Record<string, unknown>>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === 'object') return data as T;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

export default function PendingRequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
  const [groupedRequests, setGroupedRequests] = useState<GroupedRequest[]>([]);
  const [forwardedRequests, setForwardedRequests] = useState<ForwardedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Simple filters/search for scalability
  const [teamSearch, setTeamSearch] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [queuePage, setQueuePage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [teamSortState, setTeamSortState] =
    useState<TableSortCycleState<TeamGroupedRequestSortKey>>(createInitialTableSortCycle);

  const [selectedRequest, setSelectedRequest] = useState<AgentRequest | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupedRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [notes, setNotes] = useState('');
  const [denialReason, setDenialReason] = useState('');
  const [allocatingId, setAllocatingId] = useState<string | null>(null);

  // Leader's additional quantity per request (for pre-order system)
  const [leaderAdditionalQuantities, setLeaderAdditionalQuantities] = useState<Record<string, string>>({});

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

            // Get other pending stock requests from team members for this same variant
            // (so we don't double-allocate stock to multiple simultaneous requests)
            const { data: otherPendingRequests } = await supabase
              .from('stock_requests')
              .select('requested_quantity')
              .eq('variant_id', req.variant_id)
              .eq('leader_id', user.id)
              .eq('status', 'pending')
              .neq('id', req.id);

            const otherPendingQuantity = otherPendingRequests?.reduce(
              (sum, r) => sum + (r.requested_quantity || 0), 0
            ) || 0;

            // Available = Total Stock in leader's agent_inventory - other pending requests
            // Pending orders do NOT deduct agent_inventory stock (only fulfilled/approved orders do),
            // so we must NOT subtract them here or the stock will always read 0.
            const availableStock = Math.max(0, leaderStock - otherPendingQuantity);

            console.log(`[Available Stock Calculation] Variant ${req.variant_id}:`, {
              leaderStock,
              otherPendingQuantity,
              availableStock,
              formula: `${leaderStock} - ${otherPendingQuantity} = ${availableStock}`
            });

            return {
              ...req,
              leader_stock: availableStock
            };
          })
        );

        setAgentRequests(requestsWithStock);
        setGroupedRequests(buildRequestGroups(requestsWithStock, 'team'));

        // Fetch forwarded requests (leader's own requests to admin)
        const { data: rawForwarded, error: forwardedError } = await supabase
          .from('stock_requests')
          .select(`
            id,
            agent_id,
            leader_id,
            variant_id,
            requested_quantity,
            leader_additional_quantity,
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
          .eq('leader_id', user.id)
          .neq('status', 'pending')
          .order('requested_at', { ascending: false });

        if (forwardedError) throw forwardedError;

        const forwarded: ForwardedRequest[] = (rawForwarded || []).map((row: any) => ({
          id: row.id,
          agent_id: row.agent_id,
          variant_id: row.variant_id,
          requested_quantity: row.requested_quantity,
          leader_additional_quantity: row.leader_additional_quantity || 0,
          status: row.status,
          requested_at: row.requested_at,
          responded_at: null,
          approver_notes: row.admin_notes || null,
          denial_reason: row.rejection_reason || null,
          requester: row.agent ? { id: row.agent.id, full_name: row.agent.full_name } : undefined,
          variant: row.variant || undefined,
        }));

        setForwardedRequests(forwarded);
      } else {
        setAgentRequests([]);
        setGroupedRequests([]);
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

  const handleConfirmAction = async () => {
    if ((!selectedRequest && !selectedGroup) || !reviewAction || !user?.id) return;

    setProcessing(true);
    try {
      // Get requests to process (all in group or single request)
      const requestsToProcess = selectedGroup?.requests || (selectedRequest ? [selectedRequest] : []);

      if (reviewAction === 'approve') {
        const requestIds = requestsToProcess.map((req) => req.id);
        const { data, error } = await supabase.rpc('approve_stock_requests_batch_by_leader', {
          p_request_ids: requestIds,
          p_leader_id: user.id,
          p_notes: notes || null,
        });

        if (error) throw error;

        const result = parseRpcResult<{
          success?: boolean;
          error?: string;
          message?: string;
          allocation_id?: string;
        }>(data);

        if (result?.success) {
          toast({
            title: 'Success',
            description: `Successfully approved ${requestsToProcess.length} product request(s)`,
          });

          await refetchSuperAdminAllocationHistory(queryClient, user);

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
                referenceId: requestsToProcess[0].id,
              });
            }
          }

          setReviewDialogOpen(false);
          fetchRequests();
        } else {
          toast({
            title: 'Error',
            description: result?.error || result?.message || 'Failed to approve requests',
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
    const brand = request.variant?.brand?.name?.trim();
    const variant = request.variant?.name?.trim() || 'Item';
    const type = variantTypeLabel(request.variant?.variant_type);
    const name = brand ? `${brand} — ${variant}` : variant;
    return type ? `${name} (${type})` : name;
  };

  const openReview = (group: GroupedRequest, action: ReviewAction) => {
    setSelectedGroup(group);
    setSelectedRequest(group.requests[0] ?? null);
    setReviewAction(action);
    setNotes('');
    setDenialReason('');
    setLeaderAdditionalQuantities({});
    setReviewDialogOpen(true);
  };

  const handleDistributeGroup = async (group: GroupedRequest) => {
    if (!user?.id) return;
    setAllocatingId(group.id);
    try {
      for (const request of group.requests) {
        const { data, error } = await supabase.rpc('leader_accept_and_distribute_stock', {
          p_request_id: request.id,
          p_leader_id: user.id,
        });
        if (error) throw error;
        if (data && !data.success) throw new Error(data.message || 'Failed to distribute stock');
      }
      toast({
        title: 'Success',
        description: `Distributed ${group.requests.length} product request(s).`,
      });
      fetchRequests();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to distribute stock',
        variant: 'destructive',
      });
    } finally {
      setAllocatingId(null);
    }
  };

  const handlePrintGroup = (group: GroupedRequest) => {
    const teamSheet = group.source === 'team' && (group.status === 'pending' || group.status === 'approved_by_admin');
    if (!teamSheet) {
      void (async () => {
        try {
          await exportLeaderStockRequestPdf({
            companyId: user?.company_id,
            requestNumber: '—',
            statusLabel: forwardedStatusLabel(group.status),
            requestedAt: group.requested_at,
            requestedByName: user?.full_name || null,
            notes: group.requester_notes,
            denialReason: group.requests.find((request) => request.denial_reason)?.denial_reason ?? null,
            lines: group.requests.map((request) =>
              toPdfLine(request, request.requested_quantity + (request.leader_additional_quantity || 0))
            ),
          });
        } catch (error) {
          toast({
            title: 'Could not open print view',
            description: error instanceof Error ? error.message : 'Try again.',
            variant: 'destructive',
          });
        }
      })();
      return;
    }
    handlePrintTeamGroup(group);
  };

  const toPdfLine = (
    request: AgentRequest | ForwardedRequest,
    quantity = request.requested_quantity
  ) => ({
    brandName: request.variant?.brand?.name ?? null,
    variantName: request.variant?.name ?? null,
    variantType: request.variant?.variant_type ?? null,
    requestedQuantity: quantity,
  });

  const handlePrintTeamGroup = (group: GroupedRequest) => {
    try {
      exportMobileSalesStockRequestPdf({
        requestNumber: '—',
        status: group.status === 'approved_by_admin' ? 'approved_by_admin' : 'pending',
        statusLabel: group.status === 'approved_by_admin' ? 'Approved' : 'Pending',
        requestedAt: group.requested_at,
        requestedByName: group.agentName,
        requestedFromName: user?.full_name || null,
        notes: group.requester_notes,
        lines: group.requests.map((request) =>
          toPdfLine(request, request.requested_quantity + (request.leader_additional_quantity || 0))
        ),
      });
    } catch (error) {
      toast({
        title: 'Could not open print view',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintReady = (request: AgentRequest) => {
    try {
      exportMobileSalesStockRequestPdf({
        requestNumber: '—',
        status: request.status || 'approved_by_admin',
        requestedAt: request.requested_at,
        requestedByName: request.requester?.full_name || null,
        requestedFromName: user?.full_name || null,
        notes: request.requester_notes,
        lines: [
          toPdfLine(
            request,
            request.requested_quantity + (request.leader_additional_quantity || 0)
          ),
        ],
      });
    } catch (error) {
      toast({
        title: 'Could not open print view',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const forwardedStatusLabel = (status: string) => {
    switch (status) {
      case 'approved_by_leader':
        return 'Waiting for Admin';
      case 'approved_by_admin':
      case 'fulfilled':
        return 'Approved';
      case 'rejected':
        return 'Denied';
      default:
        return status?.trim() || 'Submitted';
    }
  };

  const { key: teamSortKey, direction: teamSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        teamSortState,
        DEFAULT_TEAM_GROUPED_SORT_KEY,
        DEFAULT_TEAM_GROUPED_SORT_DIRECTION
      ),
    [teamSortState]
  );

  const queueGroups = useMemo(() => {
    const history: AgentRequest[] = forwardedRequests.map((request) => ({
      id: request.id,
      agent_id: request.agent_id,
      variant_id: request.variant_id,
      requested_quantity: request.requested_quantity,
      leader_additional_quantity: request.leader_additional_quantity || 0,
      requested_at: request.requested_at,
      requester_notes: request.approver_notes,
      requester: request.requester,
      variant: request.variant,
      status: request.status,
      denial_reason: request.denial_reason,
    }));
    const teamHistory = history.filter((request) => request.agent_id !== user?.id);
    const leaderOwn = history.filter((request) => request.agent_id === user?.id);
    return [
      ...groupedRequests,
      ...buildRequestGroups(teamHistory, 'team'),
      ...buildRequestGroups(leaderOwn, 'leader'),
    ].sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
  }, [groupedRequests, forwardedRequests, user?.id]);

  const queueStatusBadge = (status: string) => {
    if (status === 'pending') {
      return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
    if (status === 'approved_by_leader') {
      return <Badge className="bg-blue-100 text-blue-800">Waiting for admin</Badge>;
    }
    if (isApprovedRequestStatus(status)) {
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    }
    if (status === 'rejected') {
      return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    }
    return <Badge>{status}</Badge>;
  };

  const renderRequestActions = (group: GroupedRequest, compact = false) => {
    const pending = group.status === 'pending' && group.source === 'team';
    const canDistribute = group.status === 'approved_by_admin';
    const cannotApprove = group.requests.some((request) => !request.leader_stock);

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact && pending && (
          <>
            <Button size="sm" disabled={cannotApprove} onClick={() => openReview(group, 'approve')}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => openReview(group, 'deny')}>
              Reject
            </Button>
          </>
        )}
        {!compact && canDistribute && (
          <Button size="sm" disabled={allocatingId === group.id} onClick={() => void handleDistributeGroup(group)}>
            {allocatingId === group.id ? 'Distributing...' : 'Accept & Distribute'}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {compact && pending && (
              <>
                <DropdownMenuItem disabled={cannotApprove} onClick={() => openReview(group, 'approve')}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openReview(group, 'deny')}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </DropdownMenuItem>
              </>
            )}
            {compact && canDistribute && (
              <DropdownMenuItem
                disabled={allocatingId === group.id}
                onClick={() => void handleDistributeGroup(group)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept & Distribute
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handlePrintGroup(group)}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </DropdownMenuItem>
            {pending && (
              <DropdownMenuItem onClick={() => openReview(group, 'forward')}>
                <ArrowUp className="mr-2 h-4 w-4" />
                Forward to admin
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const handleTeamSort = (key: TeamGroupedRequestSortKey) => {
    setTeamSortState((current) => getNextTableSortCycleState(current, key));
  };

  const requestLines = (group: GroupedRequest) =>
    [...group.requests].sort((a, b) => {
      const brand = (a.variant?.brand?.name || '').localeCompare(b.variant?.brand?.name || '', undefined, { sensitivity: 'base' });
      if (brand !== 0) return brand;
      const variant = (a.variant?.name || '').localeCompare(b.variant?.name || '', undefined, { sensitivity: 'base' });
      if (variant !== 0) return variant;
      return (a.variant?.variant_type || '').localeCompare(b.variant?.variant_type || '', undefined, { sensitivity: 'base' });
    });

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  useEffect(() => {
    setQueuePage(0);
  }, [teamSearch, dateRange.start, dateRange.end, pageSize]);

  const visibleQueue = (statuses: string[] | null) => {
    const filtered = queueGroups.filter((group) => {
      if (statuses && !statuses.includes(group.status)) return false;
      if (!isDateInRange(group.requested_at, dateRange.start, dateRange.end)) return false;
      if (!teamSearch.trim()) return true;
      const query = teamSearch.toLowerCase();
      const matchesAgent = group.agentName.toLowerCase().includes(query);
      const matchesProduct = group.requests.some((request) => formatProductName(request).toLowerCase().includes(query));
      return matchesAgent || matchesProduct;
    });
    return sortTeamGroupedRequests(filtered, teamSortKey, teamSortDirection);
  };

  const lineQuantity = (request: AgentRequest) =>
    request.requested_quantity + (request.leader_additional_quantity || 0);

  const renderRequestDetails = (group: GroupedRequest, lines: AgentRequest[]) => {
    const denial = lines.find((request) => request.denial_reason)?.denial_reason;
    const showLeaderQty = lines.some((request) => (request.leader_additional_quantity || 0) > 0);

    return (
      <div className="space-y-3 rounded-md border bg-muted/30 p-3">
        {group.status === 'pending' && group.requester_notes && (
          <p className="text-sm">
            <span className="font-medium">Agent notes: </span>
            {group.requester_notes}
          </p>
        )}
        {group.status !== 'pending' && group.requester_notes && (
          <p className="text-sm">
            <span className="font-medium">Admin notes: </span>
            {group.requester_notes}
          </p>
        )}
        {denial && (
          <p className="text-sm text-red-700">
            <span className="font-medium">Denial reason: </span>
            {denial}
          </p>
        )}
        <div className="space-y-2 md:hidden">
          {lines.map((request) => (
            <div key={request.id} className="rounded-md border bg-background p-2 text-sm">
              <div className="font-medium leading-snug">{formatProductName(request)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Agent qty</dt>
                <dd className="text-right">{request.requested_quantity}</dd>
                {showLeaderQty && (
                  <>
                    <dt className="text-muted-foreground">Your qty</dt>
                    <dd className="text-right">{request.leader_additional_quantity || 0}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-right font-semibold">{lineQuantity(request)}</dd>
                {group.status === 'pending' && (
                  <>
                    <dt className="text-muted-foreground">Your stock</dt>
                    <dd
                      className={`text-right font-semibold ${(request.leader_stock || 0) >= request.requested_quantity ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {request.leader_stock || 0}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table className="min-w-[40rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Agent qty</TableHead>
                {showLeaderQty && <TableHead className="text-right">Your qty</TableHead>}
                <TableHead className="text-right">Total</TableHead>
                {group.status === 'pending' && <TableHead className="text-right">Your stock</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="whitespace-nowrap font-medium">{formatProductName(request)}</TableCell>
                  <TableCell className="text-right">{request.requested_quantity}</TableCell>
                  {showLeaderQty && (
                    <TableCell className="text-right">{request.leader_additional_quantity || 0}</TableCell>
                  )}
                  <TableCell className="text-right font-semibold">{lineQuantity(request)}</TableCell>
                  {group.status === 'pending' && (
                    <TableCell
                      className={`text-right font-semibold ${(request.leader_stock || 0) >= request.requested_quantity ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {request.leader_stock || 0}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderQueue = (groups: GroupedRequest[]) => {
    const { pageCount, safePage, pagedItems } = getListPaginationSlice(groups, queuePage, pageSize);

    if (pagedItems.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No requests</p>
        </div>
      );
    }

    const sortIcon = (key: TeamGroupedRequestSortKey) => {
      const direction = getTableSortDisplayDirection(teamSortState, key);
      if (direction === 'asc') return <ArrowUp className="h-3.5 w-3.5" />;
      if (direction === 'desc') return <ArrowDown className="h-3.5 w-3.5" />;
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />;
    };

    return (
      <>
      <Accordion type="multiple" className="space-y-2 md:hidden">
        {pagedItems.map((group) => {
          const lines = requestLines(group);
          const rowKey = `mobile-${group.source}-${group.id}`;
          return (
            <AccordionItem key={rowKey} value={rowKey} className="rounded-lg border bg-card px-3">
              <div className="flex items-start gap-2">
                <AccordionTrigger className="mt-3 h-8 w-5 shrink-0 justify-center p-0 hover:no-underline" />
                <div className="min-w-0 flex-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{group.agentName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {lines.length === 1 ? formatProductName(lines[0]) : `${lines.length} products`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {group.totalQuantity} units · {format(new Date(group.requested_at), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                    {queueStatusBadge(group.status)}
                  </div>
                  <div className="mt-2 flex justify-end">{renderRequestActions(group, true)}</div>
                </div>
              </div>
              <AccordionContent className="pb-3">
                {renderRequestDetails(group, lines)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[72rem] overflow-hidden rounded-lg border bg-card">
        <div className={`${queueColumns} border-b py-2 text-xs font-medium text-muted-foreground`}>
          <span aria-hidden />
          <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => handleTeamSort('agentName')}>
            Agent {sortIcon('agentName')}
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => handleTeamSort('products')}>
            Products {sortIcon('products')}
          </button>
          <button type="button" className="inline-flex items-center justify-end gap-1" onClick={() => handleTeamSort('totalQuantity')}>
            Total {sortIcon('totalQuantity')}
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-left" onClick={() => handleTeamSort('requestedDate')}>
            Requested {sortIcon('requestedDate')}
          </button>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        <Accordion type="multiple">
          {pagedItems.map((group) => {
            const lines = requestLines(group);
            const rowKey = `${group.source}-${group.id}`;
            return (
              <AccordionItem key={rowKey} value={rowKey} className="border-b last:border-b-0">
                <div className={queueColumns}>
                  <AccordionTrigger className="h-10 w-5 justify-center p-0 hover:no-underline" />
                  <span className="truncate font-medium">{group.agentName}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {lines.length === 1 ? formatProductName(lines[0]) : `${lines.length} products`}
                  </span>
                  <span className="text-right text-sm font-semibold">{group.totalQuantity} units</span>
                  <span className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(group.requested_at), 'MMM dd, yyyy HH:mm')}
                  </span>
                  <span className="justify-self-start">{queueStatusBadge(group.status)}</span>
                  <div className="flex justify-end">{renderRequestActions(group)}</div>
                </div>
                <AccordionContent className="pb-3">
                  {renderRequestDetails(group, lines)}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
        </div>
      </div>
      <ListPagination
        pageSize={pageSize}
        safePage={safePage}
        pageCount={pageCount}
        onPageSizeChange={setPageSize}
        onPrevious={() => setQueuePage((current) => Math.max(0, current - 1))}
        onNext={() => setQueuePage((current) => Math.min(pageCount - 1, current + 1))}
      />
      </>
    );
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
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">All</p>
              <p className="text-lg md:text-xl font-semibold">
                {queueGroups.filter((group) => isDateInRange(group.requested_at, dateRange.start, dateRange.end)).length}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none border-dashed">
            <CardContent className="py-2 md:py-3 px-2 md:px-4">
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">Pending</p>
              <p className="text-lg md:text-xl font-semibold text-amber-600">
                {queueGroups.filter((group) => group.status === 'pending' && isDateInRange(group.requested_at, dateRange.start, dateRange.end)).length}
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-none border-dashed">
            <CardContent className="py-2 md:py-3 px-2 md:px-4">
              <p className="text-[10px] md:text-xs text-muted-foreground truncate">Approved</p>
              <p className="text-lg md:text-xl font-semibold text-green-600">
                {queueGroups.filter((group) => isApprovedRequestStatus(group.status) && isDateInRange(group.requested_at, dateRange.start, dateRange.end)).length}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Request Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <Tabs
            defaultValue="all"
            className="space-y-3 md:space-y-4"
            onValueChange={() => setQueuePage(0)}
          >
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="all" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">All</TabsTrigger>
              <TabsTrigger value="pending" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">Pending</TabsTrigger>
              <TabsTrigger value="approved" className="text-[10px] md:text-sm py-2 md:py-2.5 px-1 md:px-3">Approved</TabsTrigger>
            </TabsList>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search agent or product..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="h-9 md:h-10 pl-9 text-sm"
                />
              </div>
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="h-9 w-full justify-between sm:h-10 sm:w-[220px] shrink-0"
                align="end"
              />
            </div>

            <TabsContent value="all">{renderQueue(visibleQueue(null))}</TabsContent>
            <TabsContent value="pending">{renderQueue(visibleQueue(['pending']))}</TabsContent>
            <TabsContent value="approved">
              {renderQueue(visibleQueue(['approved_by_admin', 'fulfilled']))}
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
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-2 border-b">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle>Review Request</DialogTitle>
                <DialogDescription>
                  Review and process inventory request from {selectedGroup?.agentName || selectedRequest?.requester?.full_name}
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedGroup) handlePrintTeamGroup(selectedGroup);
                  else if (selectedRequest) handlePrintReady(selectedRequest);
                }}
              >
                <Printer className="mr-1 h-3 w-3" />
                Print
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {(selectedRequest || selectedGroup) && (
              <div className="space-y-6">
                {/* Request Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Total Products</p>
                    <p className="font-semibold text-lg">{selectedGroup?.productCount || 1}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Total Quantity</p>
                    <p className="font-semibold text-lg text-primary">{selectedGroup?.totalQuantity || selectedRequest?.requested_quantity}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <p className="text-muted-foreground text-xs">Requested At</p>
                    <p className="font-medium">{format(new Date(selectedGroup?.requested_at || selectedRequest?.requested_at || ''), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                </div>

                {/* Agent Notes */}
                {(selectedGroup?.requester_notes || selectedRequest?.requester_notes) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-yellow-800 flex items-center gap-2 mb-1">
                      <AlertCircle className="h-4 w-4" /> Agent's Notes
                    </p>
                    <p className="text-yellow-900 ml-6 italic">"{selectedGroup?.requester_notes || selectedRequest?.requester_notes}"</p>
                  </div>
                )}

                {/* Products Grouped by Brand */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" /> Requested Items
                  </h3>

                  {(() => {
                    const requests = selectedGroup?.requests || (selectedRequest ? [selectedRequest] : []);
                    // Group by brand
                    const byBrand: Record<string, typeof requests> = {};
                    requests.forEach(req => {
                      const brandName = req.variant?.brand?.name || 'Other';
                      if (!byBrand[brandName]) byBrand[brandName] = [];
                      byBrand[brandName].push(req);
                    });

                    return (
                      <div className="space-y-4">
                        {Object.entries(byBrand).map(([brandName, brandRequests]) => (
                          <div key={brandName} className="border rounded-lg overflow-hidden">
                            <div className="bg-muted/30 px-3 py-2 border-b font-medium text-sm flex justify-between items-center">
                              <span>{brandName}</span>
                              <Badge variant="secondary" className="text-[10px]">{brandRequests.length} items</Badge>
                            </div>
                            <div className="divide-y">
                              {brandRequests.map(req => (
                                <div key={req.id} className="p-3 text-sm flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                  <div className="flex-1">
                                    <div className="font-medium">{formatProductName(req)}</div>
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                                    <div className="text-right">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Requested</div>
                                      <div className="font-bold">{req.requested_quantity}</div>
                                    </div>
                                    <div className="text-right min-w-[3rem]">
                                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Stock</div>
                                      <div className={`font-bold ${(req.leader_stock || 0) >= req.requested_quantity ? 'text-green-600' : 'text-red-500'}`}>
                                        {req.leader_stock || 0}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Action Buttons - Only Show if No Action Selected */}
                {!reviewAction && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t">
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors"
                      onClick={() => setReviewAction('approve')}
                      disabled={selectedGroup ? selectedGroup.requests.some(req => !req.leader_stock || req.leader_stock === 0) : (!selectedRequest?.leader_stock || selectedRequest.leader_stock === 0)}
                    >
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                      <span className="font-semibold">Approve</span>
                      <span className="text-[10px] text-muted-foreground text-center">
                        Allocate from my stock
                      </span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                      onClick={() => setReviewAction('forward')}
                    >
                      <ArrowUp className="h-6 w-6 text-blue-600" />
                      <span className="font-semibold">Forward</span>
                      <span className="text-[10px] text-muted-foreground text-center">
                        Request from Admin
                      </span>
                    </Button>

                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-2 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                      onClick={() => setReviewAction('deny')}
                    >
                      <XCircle className="h-6 w-6 text-red-600" />
                      <span className="font-semibold">Deny</span>
                      <span className="text-[10px] text-muted-foreground text-center">
                        Reject request
                      </span>
                    </Button>
                  </div>
                )}

                {/* Approve Form */}
                {reviewAction === 'approve' && (
                  <div className="space-y-4 pt-4 border-t animate-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-4 w-4" /> Confirm Allocation
                      </h4>
                      <Button variant="ghost" size="sm" onClick={() => setReviewAction(null)} className="h-6 text-xs">Change Action</Button>
                    </div>

                    <div className="bg-green-50 p-3 rounded-lg text-sm text-green-800">
                      You are about to allocate <span className="font-bold">{selectedGroup?.totalQuantity || selectedRequest?.requested_quantity} units</span> from your inventory to {selectedGroup?.agentName || selectedRequest?.requester?.full_name}.
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notes (Optional)</label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes for the agent..."
                        className="min-h-[80px]"
                      />
                    </div>

                    <Button onClick={handleConfirmAction} disabled={processing} className="w-full bg-green-600 hover:bg-green-700">
                      {processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Allocating...</> : 'Confirm & Allocate Stock'}
                    </Button>
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
              <div className="pt-4 border-t mt-4 pb-2">
                <Button variant="outline" onClick={() => setReviewDialogOpen(false)} className="w-full">
                  Cancel / Close Review
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
