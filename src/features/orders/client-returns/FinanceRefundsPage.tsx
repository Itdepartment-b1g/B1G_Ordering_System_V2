import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Banknote, ClipboardCheck, Clock, Eye, ImagePlus, Loader2, MoreVertical, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
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
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { ALL_TIME_DATE_RANGE } from '@/features/shared/components/DateRangeFilterPopover';
import { ConditionFilterSheet } from '@/features/shared/components/ConditionFilterSheet';
import { QuickFilterSheet, createQuickFilterAndClause, countActiveQuickFilterAndClauses, type QuickFilterColumn } from '@/features/shared/components/QuickFilterSheet';
import {
  CLIENT_RETURN_REASON_OPTIONS,
  canReviewClientReturn,
  clientReturnStatusBadgeClass,
  formatClientReturnPeso,
  formatClientReturnReason,
  formatClientReturnStatus,
  getClientReturnRefundAmount,
  getPreviewReturnLineQty,
  type PreviewClientReturn,
  type PreviewClientReturnStatus,
} from './clientReturnPreview';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  approveClientOrderReturn,
  fetchClientOrderReturns,
  rejectClientOrderReturn,
} from './clientReturnApi';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import { ClientReturnViewDialog } from './ClientReturnViewDialog';
import { ClientOrderReturnTimeline } from './ClientOrderReturnTimeline';
import { ClientReturnPayoutProofDialog } from './ClientReturnPayoutProofDialog';
import { useOrders, type Order } from '../OrderContext';
import {
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION,
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY,
  sortClientReturnHistory,
  type ClientReturnHistorySortKey,
} from './utils/clientReturnsSorting';
import {
  buildClientReturnHistoryFilterFields,
  matchesClientReturnHistory,
  uniqueBrandNames,
  uniqueClientNames,
  uniqueFinancePostedNames,
  uniqueOrderNumbers,
  uniqueRejectedByNames,
  uniqueReturnedByNames,
  uniqueReturnNumbers,
  uniqueSaApprovedNames,
  uniqueTlApprovedNames,
  type ClientReturnHistoryCondition,
  type ClientReturnHistoryQuickColumn,
} from './utils/clientReturnsHistoryFilters';

const PAGE_SIZE: PageSize = 25;

type StatusFilter = 'all' | 'pending_super_admin' | 'pending_finance' | 'posted' | 'rejected';

const FinanceQuickFilterSheet = QuickFilterSheet<ClientReturnHistoryQuickColumn, StatusFilter>;

function ReturnStatusBadge({ status }: { status: PreviewClientReturnStatus }) {
  return (
    <Badge variant="outline" className={`font-normal shrink-0 ${clientReturnStatusBadgeClass(status)}`}>
      {formatClientReturnStatus(status)}
    </Badge>
  );
}

function orderFromRefund(row: PreviewClientReturn, orders: Order[]): Order | null {
  if (!row.clientOrderId) return null;
  const found = orders.find((order) => order.id === row.clientOrderId);
  if (found) return found;
  return {
    id: row.clientOrderId,
    orderNumber: row.orderNumber,
    agentId: row.originalAgentId || row.returnedBy || '',
    agentName: row.returnedByName,
    clientId: '',
    clientName: row.clientName,
    date: row.returnDate,
    createdAt: row.createdAt,
    items: [],
    subtotal: 0,
    tax: 0,
    discount: 0,
    total: 0,
    notes: '',
    status: 'approved',
  };
}

function RefundRowMenu({
  row,
  onView,
  onOpenTimeline,
  onOpenPayoutProof,
}: {
  row: PreviewClientReturn;
  onView: () => void;
  onOpenTimeline?: () => void;
  onOpenPayoutProof?: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${row.returnNumber}`}
        >
          <MoreVertical className="h-4 w-4 text-gray-600" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => window.setTimeout(onView, 0)}>
          <Eye className="h-4 w-4 mr-2" />
          View
        </DropdownMenuItem>
        {onOpenTimeline ? (
          <DropdownMenuItem onSelect={() => window.setTimeout(onOpenTimeline, 0)}>
            <Clock className="h-4 w-4 mr-2" />
            Order timeline
          </DropdownMenuItem>
        ) : null}
        {onOpenPayoutProof ? (
          <DropdownMenuItem onSelect={() => window.setTimeout(onOpenPayoutProof, 0)}>
            <ImagePlus className="h-4 w-4 mr-2" />
            View cash-sent proof
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PendingRefundActions({
  onReview,
  onReject,
  layout = 'row',
}: {
  onReview: () => void;
  onReject: () => void;
  layout?: 'row' | 'stack';
}) {
  return (
    <div className={layout === 'stack' ? 'grid grid-cols-2 gap-2 w-full' : 'flex items-center justify-end gap-1.5 shrink-0'}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          layout === 'stack'
            ? 'h-10 w-full text-red-700 border-red-200 hover:bg-red-50'
            : 'h-8 px-2 text-red-700 border-red-200 hover:bg-red-50'
        }
        onClick={onReject}
      >
        <X className="h-3.5 w-3.5" />
        Reject
      </Button>
      <Button
        type="button"
        size="sm"
        className={
          layout === 'stack'
            ? 'h-10 w-full bg-emerald-600 hover:bg-emerald-700'
            : 'h-8 px-2 bg-emerald-600 hover:bg-emerald-700'
        }
        onClick={onReview}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Review
      </Button>
    </div>
  );
}

export default function FinanceRefundsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { orders } = useOrders();
  const { hasWarehouseHubLink } = usePermissions();
  const isFinance = user?.role === 'finance';
  const canSeePage =
    hasWarehouseHubLink &&
    (user?.role === 'finance' ||
      user?.role === 'accounting' ||
      user?.role === 'admin' ||
      user?.role === 'super_admin');

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'finance-refunds', user?.company_id],
    enabled: canSeePage && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const refunds = useMemo(() => rows.filter((row) => row.returnType === 'refund'), [rows]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_finance');
  const [quickDateRange, setQuickDateRange] = useState(ALL_TIME_DATE_RANGE);
  const [quickStatus, setQuickStatus] = useState<StatusFilter>('all');
  const [columnClauses, setColumnClauses] = useState(() => [
    createQuickFilterAndClause<ClientReturnHistoryQuickColumn>(),
  ]);
  const [conditions, setConditions] = useState<ClientReturnHistoryCondition[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [viewRow, setViewRow] = useState<PreviewClientReturn | null>(null);
  const [actionRow, setActionRow] = useState<PreviewClientReturn | null>(null);
  const [confirmKind, setConfirmKind] = useState<'approve' | 'reject' | null>(null);
  const [acting, setActing] = useState(false);
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [payoutProofRow, setPayoutProofRow] = useState<PreviewClientReturn | null>(null);
  const [historySortState, setHistorySortState] =
    useState<TableSortCycleState<ClientReturnHistorySortKey>>(createInitialTableSortCycle);

  const counts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: refunds.length,
      pending_super_admin: refunds.filter((row) => row.status === 'pending_super_admin').length,
      pending_finance: refunds.filter((row) => row.status === 'pending_finance').length,
      posted: refunds.filter((row) => row.status === 'posted').length,
      rejected: refunds.filter((row) => row.status === 'rejected').length,
    }),
    [refunds]
  );

  const extraFilters = useMemo(
    () => ({
      conditions,
      search: '',
      status: quickStatus,
      role: user?.role,
      dateRange: quickDateRange,
      columnClauses,
    }),
    [conditions, quickStatus, user?.role, quickDateRange, columnClauses]
  );

  const returnedByOptions = useMemo(() => uniqueReturnedByNames(refunds), [refunds]);
  const returnNumberOptions = useMemo(() => uniqueReturnNumbers(refunds), [refunds]);
  const orderNumberOptions = useMemo(() => uniqueOrderNumbers(refunds), [refunds]);
  const clientNameOptions = useMemo(() => uniqueClientNames(refunds), [refunds]);
  const brandNameOptions = useMemo(() => uniqueBrandNames(refunds), [refunds]);
  const tlApprovedOptions = useMemo(() => uniqueTlApprovedNames(refunds), [refunds]);
  const saApprovedOptions = useMemo(() => uniqueSaApprovedNames(refunds), [refunds]);
  const financePostedOptions = useMemo(() => uniqueFinancePostedNames(refunds), [refunds]);
  const rejectedByOptions = useMemo(() => uniqueRejectedByNames(refunds), [refunds]);

  const historyFilterFields = useMemo(
    () =>
      buildClientReturnHistoryFilterFields({
        counts: {
          all: refunds.length,
          open: 0,
          needs_action: 0,
          pending_leader: 0,
          pending_super_admin: counts.pending_super_admin,
          pending_finance: counts.pending_finance,
          posted: counts.posted,
          rejected: counts.rejected,
        },
        typeCounts: { all: refunds.length, change_item: 0, refund: refunds.length },
        returnNumberOptions,
        orderNumberOptions,
        returnedByOptions,
        tlApprovedOptions,
        saApprovedOptions,
        financePostedOptions,
        rejectedByOptions,
      }),
    [
      refunds.length,
      counts,
      returnNumberOptions,
      orderNumberOptions,
      returnedByOptions,
      tlApprovedOptions,
      saApprovedOptions,
      financePostedOptions,
      rejectedByOptions,
    ]
  );

  const historyQuickColumns = useMemo(
    (): QuickFilterColumn<ClientReturnHistoryQuickColumn>[] => [
      {
        key: 'returnNumber',
        label: 'Return Number',
        options: returnNumberOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search return number...',
      },
      {
        key: 'orderNumber',
        label: 'Order Number',
        options: orderNumberOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search order number...',
      },
      {
        key: 'client',
        label: 'Client',
        options: clientNameOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search client...',
      },
      {
        key: 'returnedBy',
        label: 'Returned by',
        options: returnedByOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search person...',
      },
      {
        key: 'brand',
        label: 'Brand',
        options: brandNameOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search brand...',
      },
      {
        key: 'reason',
        label: 'Reason',
        options: CLIENT_RETURN_REASON_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
        searchPlaceholder: 'Search reason...',
      },
      {
        key: 'financePosted',
        label: 'Finance posted',
        options: financePostedOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search name...',
      },
      {
        key: 'rejectedBy',
        label: 'Rejected by',
        options: rejectedByOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search name...',
      },
    ],
    [
      returnNumberOptions,
      orderNumberOptions,
      clientNameOptions,
      returnedByOptions,
      brandNameOptions,
      financePostedOptions,
      rejectedByOptions,
    ]
  );

  const historyStatusOptions = useMemo(
    () =>
      (['all', 'pending_super_admin', 'pending_finance', 'posted', 'rejected'] as StatusFilter[]).map((status) => ({
        value: status,
        label: status === 'all' ? 'All' : formatClientReturnStatus(status),
        count: counts[status],
      })),
    [counts]
  );

  const clearQuickFilters = () => {
    setQuickStatus('all');
    setQuickDateRange(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<ClientReturnHistoryQuickColumn>()]);
  };

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = refunds.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!matchesClientReturnHistory(row, extraFilters)) return false;
      if (!query) return true;
      const haystack = [
        row.returnNumber,
        row.orderNumber,
        row.clientName,
        row.returnedByName,
        formatClientReturnReason(row.reason),
        formatClientReturnStatus(row.status),
        row.notes || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    const { key, direction } = resolveTableSortDirection(
      historySortState,
      DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY,
      DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION
    );
    return sortClientReturnHistory(matched, key, direction);
  }, [refunds, searchQuery, statusFilter, extraFilters, historySortState]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, statusFilter, extraFilters, historySortState, pageSize]);

  useEffect(() => {
    setViewRow((current) => {
      if (!current) return current;
      return refunds.find((row) => row.id === current.id) ?? current;
    });
    setPayoutProofRow((current) => {
      if (!current) return current;
      return refunds.find((row) => row.id === current.id) ?? current;
    });
  }, [refunds]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  const startReview = (row: PreviewClientReturn) => {
    if (!canReviewClientReturn(user?.role, row)) return;
    setViewRow(null);
    setTimelineOpen(false);
    setPayoutProofRow(null);
    setActionRow(row);
    setConfirmKind('approve');
  };

  const startReject = (row: PreviewClientReturn) => {
    if (!canReviewClientReturn(user?.role, row)) return;
    setViewRow(null);
    setTimelineOpen(false);
    setPayoutProofRow(null);
    setActionRow(row);
    setConfirmKind('reject');
  };

  const openTimeline = (row: PreviewClientReturn) => {
    const order = orderFromRefund(row, orders);
    if (!order) {
      toast({
        title: 'Timeline unavailable',
        description: 'This refund is not linked to an order.',
        variant: 'destructive',
      });
      return;
    }
    setViewRow(null);
    setConfirmKind(null);
    setActionRow(null);
    setPayoutProofRow(null);
    setTimelineOrder(order);
    setTimelineOpen(true);
  };

  const openPayoutProof = (row: PreviewClientReturn) => {
    if ((row.payoutPhotos?.length ?? 0) === 0) {
      toast({
        title: 'No cash-sent proof',
        description: 'Finance has not attached a cash-sent photo for this refund yet.',
      });
      return;
    }
    setViewRow(null);
    setConfirmKind(null);
    setActionRow(null);
    setTimelineOpen(false);
    setPayoutProofRow(row);
  };

  const handleApproveConfirm = async (photos?: PackageProofPhotoItem[]) => {
    if (!actionRow || acting || !canReviewClientReturn(user?.role, actionRow)) return;
    const companyId = user?.company_id;
    if (!companyId) return;
    if (!photos?.length) {
      toast({
        title: 'Photo required',
        description: 'Attach a photo as proof that cash was sent.',
        variant: 'destructive',
      });
      return;
    }
    setActing(true);
    try {
      await approveClientOrderReturn(actionRow.id, { companyId, photos });
      await queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: 'Refund posted',
        description: `${actionRow.returnNumber} posted. Returned stock was updated.`,
      });
      setConfirmKind(null);
      setActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not approve refund',
        description: err instanceof Error ? err.message : 'Failed to approve refund',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  const handleRejectConfirm = async (note?: string) => {
    if (!actionRow || acting || !canReviewClientReturn(user?.role, actionRow)) return;
    setActing(true);
    try {
      await rejectClientOrderReturn(actionRow.id, note);
      await queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] });
      toast({
        title: 'Refund rejected',
        description: `${actionRow.returnNumber} is closed. Agent can file a new CR on the same ORD.`,
      });
      setConfirmKind(null);
      setActionRow(null);
    } catch (err) {
      toast({
        title: 'Could not reject refund',
        description: err instanceof Error ? err.message : 'Failed to reject refund',
        variant: 'destructive',
      });
    } finally {
      setActing(false);
    }
  };

  if (!canSeePage) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Refunds</h1>
        <p className="text-muted-foreground mt-2">
          Client refunds are available to finance when this company is linked to a warehouse.
        </p>
      </div>
    );
  }

  const statusOptions: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pending_super_admin', label: 'Pending SA' },
    { id: 'pending_finance', label: 'Pending Finance' },
    { id: 'posted', label: 'Approve' },
    { id: 'rejected', label: 'Reject' },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Client Refunds</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          {isFinance
            ? 'Review refunds after Super Admin approval. Open Review, then Approve and attach proof that cash was sent.'
            : 'View client refunds. Finance approves after Super Admin.'}
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Banknote className="h-4 w-4 text-violet-600 shrink-0" />
              <h2 className="font-semibold truncate">
                {filtered.length} refund{filtered.length === 1 ? '' : 's'}
              </h2>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin min-w-0 flex-1">
                {statusOptions.map((option) => {
                  const active = statusFilter === option.id;
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-3 text-xs rounded-full shrink-0"
                      onClick={() => setStatusFilter(option.id)}
                    >
                      {option.label}
                      <span className="ml-1 tabular-nums opacity-80">{counts[option.id]}</span>
                    </Button>
                  );
                })}
              </div>
              <div className="flex w-full md:w-auto md:ml-auto gap-2 shrink-0">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search CR, ORD, client..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-10"
                  />
                </div>
                <FinanceQuickFilterSheet
                  dateRange={quickDateRange}
                  onDateRangeChange={setQuickDateRange}
                  columns={historyQuickColumns}
                  columnClauses={columnClauses}
                  onColumnClausesChange={setColumnClauses}
                  status={quickStatus}
                  statusOptions={historyStatusOptions}
                  onStatusChange={setQuickStatus}
                  onClear={clearQuickFilters}
                />
                <ConditionFilterSheet
                  fields={historyFilterFields}
                  conditions={conditions}
                  onAddCondition={(condition) => setConditions((current) => [...current, condition])}
                  onRemoveCondition={(id) =>
                    setConditions((current) => current.filter((item) => item.id !== id))
                  }
                  onClear={() => setConditions([])}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading refunds...
            </div>
          ) : isError ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">Could not load refunds</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'Refresh the page and try again.'}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center space-y-1">
              <p className="text-sm font-medium">
                {refunds.length === 0 ? 'No client refunds yet' : 'No matching refunds'}
              </p>
              <p className="text-sm text-muted-foreground">
                {refunds.length === 0
                  ? 'Refunds Super Admin has approved will show here for finance review.'
                  : 'Try another status filter or search.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {pagedItems.map((row) => {
                  const canAct = canReviewClientReturn(user?.role, row);
                  const qty = getPreviewReturnLineQty(row);
                  const amount = getClientReturnRefundAmount(row);
                  return (
                    <div
                      key={row.id}
                      className={`rounded-2xl border bg-background p-4 shadow-sm ${
                        canAct ? 'border-l-[3px] border-l-violet-400' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-mono font-semibold text-sm truncate">{row.returnNumber}</p>
                          <p className="font-mono text-xs text-muted-foreground truncate">{row.orderNumber}</p>
                          <ReturnStatusBadge status={row.status} />
                        </div>
                        <RefundRowMenu
                          row={row}
                          onView={() => setViewRow(row)}
                          onOpenTimeline={() => openTimeline(row)}
                          onOpenPayoutProof={
                            (row.payoutPhotos?.length ?? 0) > 0 ? () => openPayoutProof(row) : undefined
                          }
                        />
                      </div>
                      <h3 className="text-lg font-bold tracking-tight mt-3 truncate">{row.clientName}</h3>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Returned by</p>
                          <p className="font-semibold text-sm truncate">{row.returnedByName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Amount</p>
                          <p className="font-semibold text-sm tabular-nums">{formatClientReturnPeso(amount)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <Badge variant="outline" className="font-normal">
                          {formatClientReturnReason(row.reason)}
                        </Badge>
                        <span className="text-sm font-semibold tabular-nums">
                          {qty} {qty === 1 ? 'unit' : 'units'}
                        </span>
                      </div>
                      {canAct ? (
                        <div className="mt-4 pt-3 border-t">
                          <PendingRefundActions
                            layout="stack"
                            onReview={() => startReview(row)}
                            onReject={() => startReject(row)}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="hidden lg:block rounded-md border overflow-hidden">
                <Table className="table-fixed min-w-[72rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <SortableTableHead
                        label="Return"
                        sortKey="returnNumber"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'returnNumber')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-[12rem]"
                      />
                      <SortableTableHead
                        label="Client"
                        sortKey="clientName"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'clientName')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-[10rem]"
                      />
                      <SortableTableHead
                        label="Returned by"
                        sortKey="returnedByName"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'returnedByName')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-[9rem]"
                      />
                      <SortableTableHead
                        label="Returned date"
                        sortKey="returnDate"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'returnDate')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-[8rem]"
                      />
                      <SortableTableHead
                        label="Status"
                        sortKey="status"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'status')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-[9rem]"
                      />
                      <TableHead className="w-[8rem] text-right">Amount</TableHead>
                      <SortableTableHead
                        label="Qty"
                        sortKey="qty"
                        sortDirection={getTableSortDisplayDirection(historySortState, 'qty')}
                        onSort={(key) =>
                          setHistorySortState((current) => getNextTableSortCycleState(current, key))
                        }
                        className="w-16 text-right"
                      />
                      <TableHead className="w-[14rem] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => {
                      const canAct = canReviewClientReturn(user?.role, row);
                      const qty = getPreviewReturnLineQty(row);
                      return (
                        <Fragment key={row.id}>
                          <TableRow>
                            <TableCell className="align-top">
                              <p className="font-mono text-xs font-semibold truncate" title={row.returnNumber}>
                                {row.returnNumber}
                              </p>
                              <p className="font-mono text-[11px] text-muted-foreground truncate" title={row.orderNumber}>
                                {row.orderNumber}
                              </p>
                            </TableCell>
                            <TableCell className="align-top truncate" title={row.clientName}>
                              {row.clientName}
                            </TableCell>
                            <TableCell className="align-top truncate">{row.returnedByName}</TableCell>
                            <TableCell className="align-top whitespace-nowrap">
                              {format(new Date(row.returnDate), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="align-top">
                              <ReturnStatusBadge status={row.status} />
                            </TableCell>
                            <TableCell className="align-top text-right font-semibold tabular-nums">
                              {formatClientReturnPeso(getClientReturnRefundAmount(row))}
                            </TableCell>
                            <TableCell className="align-top text-right font-semibold tabular-nums text-rose-700">
                              {qty}
                            </TableCell>
                            <TableCell className="align-top text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <RefundRowMenu
                                  row={row}
                                  onView={() => setViewRow(row)}
                                  onOpenTimeline={() => openTimeline(row)}
                                  onOpenPayoutProof={
                                    (row.payoutPhotos?.length ?? 0) > 0
                                      ? () => openPayoutProof(row)
                                      : undefined
                                  }
                                />
                                {canAct ? (
                                  <PendingRefundActions
                                    onReview={() => startReview(row)}
                                    onReject={() => startReject(row)}
                                  />
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4">
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(0);
                  }}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ClientReturnViewDialog
        open={!!viewRow}
        onOpenChange={(open) => {
          if (!open) setViewRow(null);
        }}
        row={viewRow}
      />

      <ClientReturnViewDialog
        mode={confirmKind === 'reject' ? 'reject' : confirmKind === 'approve' ? 'approve' : 'view'}
        open={confirmKind === 'approve' || confirmKind === 'reject'}
        row={actionRow}
        acting={acting}
        skipNameConfirm
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !acting) {
            setConfirmKind(null);
            setActionRow(null);
          }
        }}
        onApprove={(photos) => void handleApproveConfirm(photos)}
        onReject={(note) => void handleRejectConfirm(note)}
      />

      <ClientOrderReturnTimeline
        open={timelineOpen && !!timelineOrder}
        onOpenChange={(open) => {
          setTimelineOpen(open);
          if (!open) setTimelineOrder(null);
        }}
        order={timelineOrder}
      />

      <ClientReturnPayoutProofDialog
        open={!!payoutProofRow}
        onOpenChange={(open) => {
          if (!open) setPayoutProofRow(null);
        }}
        row={payoutProofRow}
      />
    </div>
  );
}
