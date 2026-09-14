import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Eye, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import {
  getReturnLeaderLineQty,
  returnLeaderStatusBadgeClass,
  returnLeaderStatusLabel,
  type ReturnLeaderHandover,
  type ReturnLeaderStatus,
} from './returnLeaderApi';
import {
  DEFAULT_RETURN_LEADER_SORT_DIRECTION,
  DEFAULT_RETURN_LEADER_SORT_KEY,
  sortReturnLeaderHandovers,
  type ReturnLeaderSortKey,
} from './utils/clientReturnsSorting';

const PAGE_SIZE: PageSize = 25;

type StatusFilter = 'all' | ReturnLeaderStatus;

type ReturnToLeaderPanelProps = {
  rows: ReturnLeaderHandover[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  canReviewLeader: (row: ReturnLeaderHandover) => boolean;
  canReviewSuperAdmin: (row: ReturnLeaderHandover) => boolean;
  onView: (row: ReturnLeaderHandover) => void;
  onApprove: (row: ReturnLeaderHandover) => void;
  onReject: (row: ReturnLeaderHandover) => void;
};

function ReturnLeaderCard({
  row,
  canReview,
  onView,
  onApprove,
  onReject,
}: {
  row: ReturnLeaderHandover;
  canReview: boolean;
  onView: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const qty = getReturnLeaderLineQty(row);
  const pending = canReview && (row.status === 'pending_leader' || row.status === 'pending_super_admin');
  const skuCount = row.lines.length;
  const previewLines = row.lines.slice(0, 3);

  return (
    <div
      className={`rounded-xl border bg-background p-3.5 ${
        pending ? 'border-l-[3px] border-l-amber-400' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left space-y-1.5" onClick={onView}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[13px] font-semibold leading-tight break-all">
              {row.returnNumber}
            </p>
            <Badge
              variant="outline"
              className={`h-5 px-1.5 text-[10px] font-medium ${returnLeaderStatusBadgeClass(row.status)}`}
            >
              {returnLeaderStatusLabel(row.status)}
            </Badge>
          </div>
          <p className="text-sm font-medium text-foreground/90 truncate">{row.submittedByName}</p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(row.createdAt), 'MMM d · h:mm a')}
            <span className="mx-1.5 text-border">·</span>
            <span className="font-semibold tabular-nums text-rose-700">
              {qty} unit{qty === 1 ? '' : 's'}
            </span>
            {skuCount > 0 ? (
              <>
                <span className="mx-1.5 text-border">·</span>
                <span className="tabular-nums">
                  {skuCount} SKU{skuCount === 1 ? '' : 's'}
                </span>
              </>
            ) : null}
          </p>
        </button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onView}
          aria-label={`View ${row.returnNumber}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      {previewLines.length > 0 ? (
        <button type="button" className="mt-3 w-full text-left space-y-1.5" onClick={onView}>
          {previewLines.map((line) => (
            <div
              key={`${line.variantId}-${line.variantName}`}
              className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">
                  <span className="text-muted-foreground">{line.brandName}</span>
                  <span className="mx-1 text-muted-foreground/60">·</span>
                  {line.variantName}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-rose-700">
                {line.quantity}
              </span>
            </div>
          ))}
          {row.lines.length > previewLines.length ? (
            <p className="px-0.5 text-[11px] text-muted-foreground">
              +{row.lines.length - previewLines.length} more · tap View
            </p>
          ) : null}
        </button>
      ) : skuCount === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Tap View for full details.</p>
      ) : null}

      {pending ? (
        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 text-red-700 border-red-200"
            onClick={onReject}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
          <Button
            type="button"
            className="h-10 bg-emerald-600 hover:bg-emerald-700"
            onClick={onApprove}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Confirm
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ReturnToLeaderPanel({
  rows,
  isLoading,
  isError,
  error,
  canReviewLeader,
  canReviewSuperAdmin,
  onView,
  onApprove,
  onReject,
}: ReturnToLeaderPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<ReturnLeaderSortKey>>(createInitialTableSortCycle);

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending_leader: rows.filter((row) => row.status === 'pending_leader').length,
      pending_super_admin: rows.filter((row) => row.status === 'pending_super_admin').length,
      received: rows.filter((row) => row.status === 'received').length,
      rejected: rows.filter((row) => row.status === 'rejected').length,
      cancelled: rows.filter((row) => row.status === 'cancelled').length,
    }),
    [rows]
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matched = rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        row.returnNumber,
        row.submittedByName,
        row.notes || '',
        returnLeaderStatusLabel(row.status),
        ...row.lines.map((line) => `${line.brandName} ${line.variantName}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
    const { key, direction } = resolveTableSortDirection(
      sortState,
      DEFAULT_RETURN_LEADER_SORT_KEY,
      DEFAULT_RETURN_LEADER_SORT_DIRECTION
    );
    return sortReturnLeaderHandovers(matched, key, direction);
  }, [rows, searchQuery, statusFilter, sortState]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, statusFilter, sortState]);

  const handleSort = (key: ReturnLeaderSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const filterOptions: Array<{ id: StatusFilter; label: string; shortLabel: string }> = [
    { id: 'all', label: 'All', shortLabel: 'All' },
    { id: 'pending_leader', label: 'Pending TL', shortLabel: 'Pending' },
    { id: 'pending_super_admin', label: 'Pending SA', shortLabel: 'SA' },
    { id: 'received', label: 'Received', shortLabel: 'Received' },
    { id: 'rejected', label: 'Rejected', shortLabel: 'Rejected' },
  ];

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3 space-y-3 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Return to leader</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {rows.length} record{rows.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search RL, agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="flex gap-2 min-w-max pb-0.5">
            {filterOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={statusFilter === option.id ? 'default' : 'outline'}
                className="h-8 shrink-0"
                onClick={() => setStatusFilter(option.id)}
              >
                <span className="sm:hidden">{option.shortLabel}</span>
                <span className="hidden sm:inline">{option.label}</span>
                <span className="ml-1 tabular-nums opacity-80">{counts[option.id]}</span>
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading return to leader...
          </div>
        ) : isError ? (
          <div className="py-12 text-center space-y-1">
            <p className="text-sm font-medium">Could not load return to leader</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Refresh the page and try again.'}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <RotateCcw className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
            <p className="font-medium">{rows.length === 0 ? 'No return to leader yet' : 'No matching records'}</p>
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {pagedItems.map((row) => {
                const canReview = canReviewLeader(row) || canReviewSuperAdmin(row);
                return (
                  <ReturnLeaderCard
                    key={row.id}
                    row={row}
                    canReview={canReview}
                    onView={() => onView(row)}
                    onApprove={() => onApprove(row)}
                    onReject={() => onReject(row)}
                  />
                );
              })}
            </div>

            <div className="hidden md:block rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="RL #"
                      sortKey="returnNumber"
                      sortDirection={getTableSortDisplayDirection(sortState, 'returnNumber')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Submitted by"
                      sortKey="submittedByName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'submittedByName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Submitted"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Status"
                      sortKey="status"
                      sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Qty"
                      sortKey="qty"
                      sortDirection={getTableSortDisplayDirection(sortState, 'qty')}
                      onSort={handleSort}
                      className="text-right"
                    />
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((row) => {
                    const qty = getReturnLeaderLineQty(row);
                    const canReview = canReviewLeader(row) || canReviewSuperAdmin(row);
                    const pending =
                      canReview &&
                      (row.status === 'pending_leader' || row.status === 'pending_super_admin');
                    return (
                      <TableRow key={row.id} className="cursor-pointer" onClick={() => onView(row)}>
                        <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                          {row.returnNumber}
                        </TableCell>
                        <TableCell className="font-medium">{row.submittedByName}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`font-normal ${returnLeaderStatusBadgeClass(row.status)}`}
                          >
                            {returnLeaderStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-rose-700">
                          {qty}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => onView(row)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>
                            {pending ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-red-700 border-red-200"
                                  onClick={() => onReject(row)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => onApprove(row)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Confirm
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
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
  );
}
