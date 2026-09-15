import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  History,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Package,
  Printer,
  Search,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import {
  groupTlRequests,
  invalidateTlTransferQueries,
  mapTlTransferRows,
  type TLRequestGroup,
} from './tl-stock-transfer/tlStockTransferShared';
import {
  DEFAULT_TL_TRANSFER_SORT_DIRECTION,
  DEFAULT_TL_TRANSFER_SORT_KEY,
  filterTlTransferGroups,
  sortTlTransferGroups,
  type TlTransferListSortKey,
} from './tl-stock-transfer/tlStockTransferListHelpers';
import { useTlTransferRealtime } from './tl-stock-transfer/useTlTransferRealtime';
import { printTlStockTransferRequest } from './tl-stock-transfer/exportTlTransferPdfs';
import { TLTransferDetailsDialog } from './tl-stock-transfer/TLTransferDetailsDialog';
import { TLTransferHistoryDialog } from './tl-stock-transfer/TLTransferHistoryDialog';

type ReviewLine = TLRequestWithDetails & { source_available_quantity: number };
type SelectedGroup = Omit<TLRequestGroup, 'items'> & { items: ReviewLine[] };

export default function AdminTLRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<TlTransferListSortKey>>(createInitialTableSortCycle);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRequest, setDetailsRequest] = useState<TLRequestWithDetails | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLines, setHistoryLines] = useState<TLRequestWithDetails[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
  
  const [modifiedQtyById, setModifiedQtyById] = useState<Record<string, number>>({});
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  
  const [processing, setProcessing] = useState(false);
  
  // Fetch TL requests
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['admin-tl-requests', user?.company_id],
    queryFn: async () => {
      if (!user?.company_id) return [];
      
      const { data, error } = await supabase
        .from('tl_stock_requests')
        .select(`
          *,
          requester:profiles!requester_leader_id(id, full_name, region, email),
          source:profiles!source_leader_id(id, full_name, region, email),
          tdrs:tl_stock_request_tdrs(tdr_number, kind, created_at),
          items:tl_stock_request_items(
            *,
            variant:variants(
              id,
              name,
              variant_type,
              brand_id,
              brand:brands(name)
            )
          )
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return mapTlTransferRows(data || []);
    },
    enabled: !!user?.company_id && (user?.role === 'admin' || user?.role === 'super_admin'),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  
  useTlTransferRealtime({
    enabled: !!user?.company_id && (user?.role === 'admin' || user?.role === 'super_admin'),
    companyId: user?.company_id,
    channelKey: 'admin',
  });
  
  const groupedRequests = useMemo(() => groupTlRequests(requests), [requests]);

  const tabGroups = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return groupedRequests.filter((group) => group.status === 'pending_admin');
      case 'approved':
        return groupedRequests.filter((group) =>
          ['pending_source_tl', 'pending_receipt', 'completed', 'incomplete'].includes(group.status)
        );
      case 'rejected':
        return groupedRequests.filter(
          (group) => group.status === 'admin_rejected' || group.status === 'source_tl_rejected'
        );
      default:
        return groupedRequests;
    }
  }, [groupedRequests, activeTab]);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_TL_TRANSFER_SORT_KEY,
        DEFAULT_TL_TRANSFER_SORT_DIRECTION
      ),
    [sortState]
  );

  const filteredGroups = useMemo(
    () => filterTlTransferGroups(tabGroups, searchQuery, dateRange),
    [tabGroups, searchQuery, dateRange]
  );

  const sortedGroups = useMemo(
    () =>
      sortTlTransferGroups(
        filteredGroups,
        resolvedSortKey,
        resolvedSortDirection,
        'requester'
      ),
    [filteredGroups, resolvedSortKey, resolvedSortDirection]
  );

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(sortedGroups, page, pageSize),
    [sortedGroups, page, pageSize]
  );

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchQuery, dateRangeFilter, pageSize, sortState]);
  
  const stats = useMemo(() => {
    return {
      total: groupedRequests.length,
      pending: groupedRequests.filter((group) => group.status === 'pending_admin').length,
      approved: groupedRequests.filter((group) =>
        ['pending_source_tl', 'pending_receipt', 'completed', 'incomplete'].includes(group.status)
      ).length,
      rejected: groupedRequests.filter(
        (group) => group.status === 'admin_rejected' || group.status === 'source_tl_rejected'
      ).length,
    };
  }, [groupedRequests]);

  const pendingItems = selectedGroup?.items.filter((item) => item.status === 'pending_admin') ?? [];
  const insufficientItems = pendingItems.filter(
    (item) => item.source_available_quantity < item.requested_quantity
  );
  const canApproveFull = pendingItems.length > 0 && insufficientItems.length === 0;
  const canApproveModified = pendingItems.some((item) => item.source_available_quantity > 0);

  const handleSort = (key: TlTransferListSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };
  
  const openDetails = (group: TLRequestGroup) => {
    setDetailsRequest(group.items[0] ?? null);
    setDetailsOpen(true);
  };

  const openHistory = (group: TLRequestGroup) => {
    setHistoryLines(group.items);
    setHistoryOpen(true);
  };

  const handleReview = async (group: TLRequestGroup) => {
    const variantIds = [...new Set(group.items.map((item) => item.variant_id).filter(Boolean))];
    const sourceId = group.items[0]?.source_leader_id;
    let stockRows: { variant_id: string; stock: number }[] = [];
    if (sourceId && variantIds.length > 0) {
      const { data } = await supabase
        .from('agent_inventory')
        .select('variant_id, stock')
        .eq('agent_id', sourceId)
        .in('variant_id', variantIds);
      stockRows = (data || []) as { variant_id: string; stock: number }[];
    }

    const stockByVariant = new Map(
      stockRows.map((row) => [row.variant_id, Number(row.stock || 0)])
    );
    const items: ReviewLine[] = group.items.map((item) => ({
      ...item,
      source_available_quantity: stockByVariant.get(item.variant_id) || 0,
    }));

    setSelectedGroup({ ...group, items });
    setModifiedQtyById(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          Math.min(item.requested_quantity, stockByVariant.get(item.variant_id) || 0) ||
            item.requested_quantity,
        ])
      )
    );
    setAdminNotes('');
    setRejectionReason('');
    setReviewDialogOpen(true);
  };

  const runOnPendingItems = async (
    action: (item: ReviewLine) => Promise<void>
  ) => {
    if (!selectedGroup) return;
    for (const item of pendingItems) {
      await action(item);
    }
  };
  
  const handleApproveFull = async () => {
    if (!selectedGroup || !canApproveFull) return;
    
    setProcessing(true);
    try {
      await runOnPendingItems(async (item) => {
        const { data, error } = await supabase.rpc('admin_approve_tl_request', {
          p_request_id: item.id,
          p_approved_quantity: item.requested_quantity,
          p_notes: adminNotes || null,
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Failed to approve request');
      });
      
      toast({
        title: 'Request Approved',
        description: `Approved ${pendingItems.length} item(s) for ${selectedGroup.requester.full_name}`,
      });
      
      setApproveDialogOpen(false);
      setReviewDialogOpen(false);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  const handleApproveModified = async () => {
    if (!selectedGroup) return;

    for (const item of pendingItems) {
      const qty = Number(modifiedQtyById[item.id] || 0);
      if (qty <= 0) {
        toast({
          title: 'Invalid Quantity',
          description: `Enter a quantity greater than 0 for ${item.variant.brand_name} ${item.variant.name}.`,
          variant: 'destructive',
        });
        return;
      }
      if (qty > item.requested_quantity) {
        toast({
          title: 'Invalid Quantity',
          description: `Approved qty cannot exceed requested qty for ${item.variant.name}.`,
          variant: 'destructive',
        });
        return;
      }
      if (qty > item.source_available_quantity) {
        toast({
          title: 'Invalid Quantity',
          description: `Approved qty exceeds available stock for ${item.variant.name}.`,
          variant: 'destructive',
        });
        return;
      }
    }
    
    setProcessing(true);
    try {
      await runOnPendingItems(async (item) => {
        const { data, error } = await supabase.rpc('admin_approve_tl_request', {
          p_request_id: item.id,
          p_approved_quantity: Number(modifiedQtyById[item.id] || 0),
          p_notes: adminNotes || null,
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Failed to approve request');
      });
      
      toast({
        title: 'Request Approved',
        description: `Approved modified quantities for ${pendingItems.length} item(s)`,
      });
      
      setModifyDialogOpen(false);
      setReviewDialogOpen(false);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  const handleReject = async () => {
    if (!selectedGroup || !rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejection',
        variant: 'destructive',
      });
      return;
    }
    
    setProcessing(true);
    try {
      await runOnPendingItems(async (item) => {
        const { data, error } = await supabase.rpc('admin_reject_tl_request', {
          p_request_id: item.id,
          p_reason: rejectionReason,
        });
        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Failed to reject request');
      });
      
      toast({
        title: 'Request Rejected',
        description: 'Request has been rejected and requester notified',
      });
      
      setRejectDialogOpen(false);
      setReviewDialogOpen(false);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };
  
  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_admin':
        return (
          <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending Admin
          </Badge>
        );
      case 'pending_source_tl':
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3 mr-1" />
            Awaiting Dispatch
          </Badge>
        );
      case 'pending_receipt':
        return (
          <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            In Transit
          </Badge>
        );
      case 'incomplete':
        return (
          <Badge variant="secondary" className="bg-orange-50 text-orange-800 border-orange-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Incomplete
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'admin_rejected':
      case 'source_tl_rejected':
        return (
          <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only admins can access this page</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Team Leader Stock Transfers</h1>
        <p className="text-muted-foreground">
          Approve requests before the source TL can dispatch. Open any transfer to see TDRs, receive
          counts, and print receipts when a team leader asks.{' '}
          <Link
            to="/inventory/tl-transfer-shortages"
            className="text-primary underline-offset-4 hover:underline"
          >
            Transfer shortages
          </Link>{' '}
          are investigated by the dispatching team leader.
        </p>
      </div>
      
      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Requests Table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Stock Requests</CardTitle>
              <CardDescription>Review and manage TL stock requests</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-[240px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transfer #, TDR, name…"
                  className="h-9 pl-8"
                />
              </div>
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="w-full sm:w-[220px] justify-between h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">
                Pending ({stats.pending})
              </TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab}>
              {requestsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : tabGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No requests found</p>
                </div>
              ) : sortedGroups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No transfers match this search or date range.
                </p>
              ) : (
                <div className="space-y-4">
                <div className="border rounded-lg overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead
                          label="Request #"
                          sortKey="request_number"
                          sortDirection={getTableSortDisplayDirection(sortState, 'request_number')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="TDR"
                          sortKey="tdr_number"
                          sortDirection={getTableSortDisplayDirection(sortState, 'tdr_number')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="Requested by"
                          sortKey="counterpart"
                          sortDirection={getTableSortDisplayDirection(sortState, 'counterpart')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="To"
                          sortKey="source"
                          sortDirection={getTableSortDisplayDirection(sortState, 'source')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="Items"
                          sortKey="item"
                          sortDirection={getTableSortDisplayDirection(sortState, 'item')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="Qty"
                          sortKey="requested_quantity"
                          sortDirection={getTableSortDisplayDirection(sortState, 'requested_quantity')}
                          onSort={handleSort}
                          className="text-right"
                        />
                        <SortableTableHead
                          label="Status"
                          sortKey="status"
                          sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                          onSort={handleSort}
                        />
                        <SortableTableHead
                          label="Date"
                          sortKey="created_at"
                          sortDirection={getTableSortDisplayDirection(sortState, 'created_at')}
                          onSort={handleSort}
                        />
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedItems.map((group) => (
                        <TableRow key={group.request_number}>
                          <TableCell className="font-medium">{group.request_number}</TableCell>
                          <TableCell className="font-mono text-sm">{group.tdr_number || '—'}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{group.requester.full_name}</p>
                              {group.requester.region && (
                                <p className="text-sm text-muted-foreground">{group.requester.region}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{group.source.full_name}</p>
                              {group.source.region && (
                                <p className="text-sm text-muted-foreground">{group.source.region}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">
                              {group.items[0]?.variant.brand_name} · {group.items[0]?.variant.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {group.items.length === 1
                                ? group.items[0]?.variant.type
                                : `${group.items.length} items`}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{group.totalRequested}</TableCell>
                          <TableCell>{getStatusBadge(group.status)}</TableCell>
                          <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Print transfer"
                                onClick={() => {
                                  void printTlStockTransferRequest(group.items).catch((error: any) => {
                                    toast({
                                      title: 'Could not print transfer',
                                      description: error?.message || 'Failed to open the print view.',
                                      variant: 'destructive',
                                    });
                                  });
                                }}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="History"
                                onClick={() => openHistory(group)}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Transfer details / TDR"
                                onClick={() => openDetails(group)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {group.status === 'pending_admin' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleReview(group)}
                                >
                                  Review
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={setPageSize}
                  onPrevious={() => setPage(Math.max(0, safePage - 1))}
                  onNext={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
            <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 pr-12 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle>Review Stock Request</DialogTitle>
                <DialogDescription>
                  {selectedGroup
                    ? `${selectedGroup.request_number} · ${selectedGroup.items.length} item(s)`
                    : 'Compare and approve stock request'}
                </DialogDescription>
              </div>
              {selectedGroup ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openHistory(selectedGroup)}
                  >
                    <History className="mr-1 h-4 w-4" />
                    History
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openDetails(selectedGroup)}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    View TDRs
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void printTlStockTransferRequest(selectedGroup.items).catch((error: any) => {
                        toast({
                          title: 'Could not print transfer',
                          description: error?.message || 'Failed to open the print view.',
                          variant: 'destructive',
                        });
                      });
                    }}
                  >
                    <Printer className="mr-1 h-4 w-4" />
                    Print transfer
                  </Button>
                </div>
              ) : null}
            </div>
          </DialogHeader>
          {selectedGroup && (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-secondary p-4 text-sm lg:grid-cols-4">
                <div>
                  <Label className="text-muted-foreground">Request Number</Label>
                  <p className="font-medium font-mono">{selectedGroup.request_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Latest TDR</Label>
                  <p className="font-medium font-mono">{selectedGroup.tdr_number || '—'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedGroup.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Requested by</Label>
                  <p className="font-medium">{selectedGroup.requester.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedGroup.requester.region || 'No region'} · {selectedGroup.requester.email}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">To</Label>
                  <p className="font-medium">{selectedGroup.source.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedGroup.source.region || 'No region'} · {selectedGroup.source.email}
                  </p>
                </div>
              </div>

              {selectedGroup.requester_notes ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
                  <p className="font-medium">Requester notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {selectedGroup.requester_notes}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Requested items</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedGroup.items.length} item{selectedGroup.items.length === 1 ? '' : 's'} ·{' '}
                    {selectedGroup.totalRequested} units
                  </p>
                </div>
                <div className="max-h-[42vh] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[220px] bg-muted/40">Item</TableHead>
                        <TableHead className="bg-muted/40 text-right">Requested</TableHead>
                        <TableHead className="bg-muted/40 text-right">Source stock</TableHead>
                        <TableHead className="bg-muted/40 text-right">Approved</TableHead>
                        <TableHead className="bg-muted/40">Availability</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedGroup.items.map((item) => {
                        const enough = item.source_available_quantity >= item.requested_quantity;
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <p className="font-medium">
                                {item.variant.brand_name} · {item.variant.name}
                              </p>
                              <p className="text-xs text-muted-foreground">{item.variant.type}</p>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {item.requested_quantity}
                            </TableCell>
                            <TableCell
                              className={`text-right tabular-nums font-medium ${
                                enough ? 'text-green-700' : 'text-red-700'
                              }`}
                            >
                              {item.source_available_quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {item.admin_approved_quantity ?? '—'}
                            </TableCell>
                            <TableCell>
                              {enough ? (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 border-green-200"
                                >
                                  In stock
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-red-50 text-red-700 border-red-200"
                                >
                                  Short {item.requested_quantity - item.source_available_quantity}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              {insufficientItems.length > 0 && selectedGroup.status === 'pending_admin' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-900">Insufficient stock on {insufficientItems.length} item(s)</p>
                    <p className="text-sm text-red-700">
                      Approve Full is disabled. Use Approve Modified to send only what the source TL
                      currently holds.
                    </p>
                  </div>
                </div>
              )}
              
              {selectedGroup.status === 'pending_admin' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!canApproveFull}
                    onClick={() => setApproveDialogOpen(true)}
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Approve Full
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!canApproveModified}
                    onClick={() => setModifyDialogOpen(true)}
                  >
                    <Edit3 className="mr-2 h-4 w-4" />
                    Approve Modified
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setRejectDialogOpen(true)}
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}

              {selectedGroup.admin_notes && (
                <div>
                  <Label className="text-muted-foreground">Admin Notes</Label>
                  <p className="text-sm mt-1">{selectedGroup.admin_notes}</p>
                </div>
              )}
              
              {selectedGroup.rejection_reason && (
                <div>
                  <Label className="text-muted-foreground text-destructive">Rejection Reason</Label>
                  <p className="text-sm mt-1 text-destructive">{selectedGroup.rejection_reason}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Approve Full Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Full Request</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedGroup && (
                <>
                  Approve all requested quantities for {selectedGroup.requester.full_name}?{' '}
                  {selectedGroup.items.length} item(s), {selectedGroup.totalRequested} units total.
                  The request will be forwarded to {selectedGroup.source.full_name} for dispatch.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              placeholder="Add any notes for the source team leader..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveFull} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Approve Modified Dialog */}
      <AlertDialog open={modifyDialogOpen} onOpenChange={setModifyDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve Modified Quantity</AlertDialogTitle>
            <AlertDialogDescription>
              Set an approved quantity for each item. It cannot exceed requested qty or source stock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="w-28">Approve</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <p className="font-medium">
                          {item.variant.brand_name} · {item.variant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.variant.type}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.requested_quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.source_available_quantity}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={Math.min(item.requested_quantity, item.source_available_quantity)}
                          value={modifiedQtyById[item.id] ?? ''}
                          onChange={(e) =>
                            setModifiedQtyById((prev) => ({
                              ...prev,
                              [item.id]: parseInt(e.target.value, 10) || 0,
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Explain why the quantity was modified..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApproveModified} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Request</AlertDialogTitle>
            <AlertDialogDescription>
              Provide a reason for rejecting this stock request. All items on the transfer will be
              rejected and the requester will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea
              placeholder="Enter reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              required
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={processing || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TLTransferDetailsDialog
        open={detailsOpen}
        request={detailsRequest}
        allRequests={requests}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) setDetailsRequest(null);
        }}
      />
      <TLTransferHistoryDialog
        open={historyOpen}
        lines={historyLines}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryLines([]);
        }}
      />
    </div>
  );
}
