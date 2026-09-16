import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Banknote, Check, Eye, Loader2, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import {
  canReviewClientReturn,
  clientReturnStatusBadgeClass,
  formatClientReturnPeso,
  formatClientReturnReason,
  formatClientReturnStatus,
  getClientReturnRefundAmount,
  getMockReturnLineQty,
  type MockClientReturn,
  type MockClientReturnStatus,
} from './clientReturnMock';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  approveClientOrderReturn,
  fetchClientOrderReturns,
  rejectClientOrderReturn,
} from './clientReturnApi';
import { ClientReturnViewDialog } from './ClientReturnViewDialog';
import {
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION,
  DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY,
  sortClientReturnHistory,
  type ClientReturnHistorySortKey,
} from './utils/clientReturnsSorting';

const PAGE_SIZE: PageSize = 25;

type StatusFilter = 'all' | 'pending_super_admin' | 'pending_finance' | 'posted' | 'rejected';

function ReturnStatusBadge({ status }: { status: MockClientReturnStatus }) {
  return (
    <Badge variant="outline" className={`font-normal shrink-0 ${clientReturnStatusBadgeClass(status)}`}>
      {formatClientReturnStatus(status)}
    </Badge>
  );
}

function PendingRefundActions({
  onApprove,
  onReject,
  layout = 'row',
}: {
  onApprove: () => void;
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
        onClick={onApprove}
      >
        <Check className="h-3.5 w-3.5" />
        Approve
      </Button>
    </div>
  );
}

export default function FinanceRefundsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [viewRow, setViewRow] = useState<MockClientReturn | null>(null);
  const [actionRow, setActionRow] = useState<MockClientReturn | null>(null);
  const [confirmKind, setConfirmKind] = useState<'approve' | 'reject' | null>(null);
  const [acting, setActing] = useState(false);
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

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = refunds.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
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
  }, [refunds, searchQuery, statusFilter, historySortState]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, statusFilter, historySortState, pageSize]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  const startApprove = (row: MockClientReturn) => {
    if (!canReviewClientReturn(user?.role, row)) return;
    setViewRow(null);
    setActionRow(row);
    setConfirmKind('approve');
  };

  const startReject = (row: MockClientReturn) => {
    if (!canReviewClientReturn(user?.role, row)) return;
    setViewRow(null);
    setActionRow(row);
    setConfirmKind('reject');
  };

  const handleApproveConfirm = async () => {
    if (!actionRow || acting || !canReviewClientReturn(user?.role, actionRow)) return;
    setActing(true);
    try {
      await approveClientOrderReturn(actionRow.id);
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
            ? 'Review refunds after Super Admin approval. Approve or reject the refund amount only.'
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
              <div className="relative w-full md:max-w-64 md:ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search CR, ORD, client..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-10"
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
                  const qty = getMockReturnLineQty(row);
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
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0 rounded-full"
                          onClick={() => setViewRow(row)}
                          aria-label={`View ${row.returnNumber}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
                            onApprove={() => startApprove(row)}
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
                      <TableHead className="w-[12rem] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => {
                      const canAct = canReviewClientReturn(user?.role, row);
                      const qty = getMockReturnLineQty(row);
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
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setViewRow(row)}
                                  aria-label={`View ${row.returnNumber}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {canAct ? (
                                  <PendingRefundActions
                                    onApprove={() => startApprove(row)}
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
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !acting) {
            setConfirmKind(null);
            setActionRow(null);
          }
        }}
        onApprove={() => void handleApproveConfirm()}
        onReject={(note) => void handleRejectConfirm(note)}
      />
    </div>
  );
}
