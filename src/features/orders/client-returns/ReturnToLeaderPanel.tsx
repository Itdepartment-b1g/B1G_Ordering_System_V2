import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Clock, Eye, FilterX, Loader2, MoreVertical, Printer, RotateCcw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { ALL_TIME_DATE_RANGE } from '@/features/shared/components/DateRangeFilterPopover';
import { ConditionFilterSheet } from '@/features/shared/components/ConditionFilterSheet';
import { QuickFilterSheet, createQuickFilterAndClause, countActiveQuickFilterAndClauses, type QuickFilterColumn } from '@/features/shared/components/QuickFilterSheet';
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
import {
  buildReturnLeaderFilterFields,
  matchesReturnLeaderFilters,
  uniqueReturnNumbers,
  uniqueSubmittedByNames,
  type ReturnLeaderFilterCondition,
  type ReturnLeaderQuickColumn,
} from './utils/returnLeaderFilters';
import { ReturnLeaderTimeline } from './ReturnLeaderTimeline';
import { generateAndOpenReturnLeaderPdf } from './generateReturnLeaderPdf';

const PAGE_SIZE: PageSize = 25;

type RlQuickStatus = 'all' | ReturnLeaderStatus;

const LeaderQuickFilterSheet = QuickFilterSheet<ReturnLeaderQuickColumn, RlQuickStatus>;

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

function ReturnLeaderRowMenu({
  row,
  onView,
  onOpenTimeline,
  onPrint,
}: {
  row: ReturnLeaderHandover;
  onView: () => void;
  onOpenTimeline: () => void;
  onPrint: () => void;
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
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => window.setTimeout(onView, 0)}>
          <Eye className="h-4 w-4 mr-2" />
          View
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.setTimeout(onOpenTimeline, 0)}>
          <Clock className="h-4 w-4 mr-2" />
          Returned timeline
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.setTimeout(onPrint, 0)}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReturnLeaderCard({
  row,
  canReview,
  onView,
  onOpenTimeline,
  onPrint,
  onApprove,
  onReject,
}: {
  row: ReturnLeaderHandover;
  canReview: boolean;
  onView: () => void;
  onOpenTimeline: () => void;
  onPrint: () => void;
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
        <ReturnLeaderRowMenu
          row={row}
          onView={onView}
          onOpenTimeline={onOpenTimeline}
          onPrint={onPrint}
        />
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
              +{row.lines.length - previewLines.length} more
            </p>
          ) : null}
        </button>
      ) : skuCount === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Open View for full details.</p>
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
  const [statusFilter, setStatusFilter] = useState<RlQuickStatus>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState(ALL_TIME_DATE_RANGE);
  const [columnClauses, setColumnClauses] = useState(() => [
    createQuickFilterAndClause<ReturnLeaderQuickColumn>(),
  ]);
  const [conditions, setConditions] = useState<ReturnLeaderFilterCondition[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<ReturnLeaderSortKey>>(createInitialTableSortCycle);
  const [timelineRow, setTimelineRow] = useState<ReturnLeaderHandover | null>(null);

  const filters = useMemo(
    () => ({
      conditions,
      search: searchQuery,
      status: statusFilter,
      dateRange: dateRangeFilter,
      columnClauses,
    }),
    [conditions, searchQuery, statusFilter, dateRangeFilter, columnClauses]
  );

  const counts = useMemo(() => {
    const scoped = rows.filter((row) => matchesReturnLeaderFilters(row, filters, { status: true }));
    return {
      all: scoped.length,
      pending_leader: scoped.filter((row) => row.status === 'pending_leader').length,
      pending_super_admin: scoped.filter((row) => row.status === 'pending_super_admin').length,
      received: scoped.filter((row) => row.status === 'received').length,
      rejected: scoped.filter((row) => row.status === 'rejected').length,
      cancelled: scoped.filter((row) => row.status === 'cancelled').length,
    };
  }, [rows, filters]);

  const submittedByOptions = useMemo(() => uniqueSubmittedByNames(rows), [rows]);
  const returnNumberOptions = useMemo(() => uniqueReturnNumbers(rows), [rows]);
  const filterFields = useMemo(
    () => buildReturnLeaderFilterFields({ counts, submittedByOptions, returnNumberOptions }),
    [counts, submittedByOptions, returnNumberOptions]
  );

  const filtered = useMemo(() => {
    const matched = rows.filter((row) => matchesReturnLeaderFilters(row, filters));
    const { key, direction } = resolveTableSortDirection(
      sortState,
      DEFAULT_RETURN_LEADER_SORT_KEY,
      DEFAULT_RETURN_LEADER_SORT_DIRECTION
    );
    return sortReturnLeaderHandovers(matched, key, direction);
  }, [rows, filters, sortState]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);
  const hasActiveFilters =
    conditions.length > 0 ||
    searchQuery.trim().length > 0 ||
    statusFilter !== 'all' ||
    dateRangeFilter.preset !== 'all' ||
    (countActiveQuickFilterAndClauses(columnClauses) > 0);

  const clearQuickFilters = () => {
    setStatusFilter('all');
    setDateRangeFilter(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<ReturnLeaderQuickColumn>()]);
  };

  const clearFilters = () => {
    setConditions([]);
    setSearchQuery('');
    clearQuickFilters();
  };

  const rlQuickColumns = useMemo(
    (): QuickFilterColumn<ReturnLeaderQuickColumn>[] => [
      {
        key: 'returnNumber',
        label: 'RL Number',
        options: returnNumberOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search RL number...',
      },
      {
        key: 'submittedBy',
        label: 'Submitted by',
        options: submittedByOptions.map((value) => ({ value, label: value })),
        searchPlaceholder: 'Search person...',
      },
    ],
    [returnNumberOptions, submittedByOptions]
  );

  const rlStatusOptions = useMemo(
    () =>
      (
        [
          'all',
          'pending_leader',
          'pending_super_admin',
          'received',
          'rejected',
          'cancelled',
        ] as const
      ).map((status) => ({
        value: status,
        label: status === 'all' ? 'All' : returnLeaderStatusLabel(status),
        count: counts[status],
      })),
    [counts]
  );

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize, conditions, statusFilter, dateRangeFilter, columnClauses, sortState]);

  const handleSort = (key: ReturnLeaderSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3 space-y-3 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Return to leader</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} record{filtered.length === 1 ? '' : 's'}
            </p>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs shrink-0" onClick={clearFilters}>
              <FilterX className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search RL, agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <div className="flex w-full gap-2 sm:w-auto shrink-0">
            <LeaderQuickFilterSheet
              dateRange={dateRangeFilter}
              onDateRangeChange={setDateRangeFilter}
              columns={rlQuickColumns}
              columnClauses={columnClauses}
              onColumnClausesChange={setColumnClauses}
              status={statusFilter}
              statusOptions={rlStatusOptions}
              onStatusChange={setStatusFilter}
              onClear={clearQuickFilters}
            />
            <ConditionFilterSheet
              fields={filterFields}
              conditions={conditions}
              onAddCondition={(condition) => setConditions((current) => [...current, condition])}
              onRemoveCondition={(id) =>
                setConditions((current) => current.filter((condition) => condition.id !== id))
              }
              onClear={() => setConditions([])}
            />
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
            {rows.length > 0 ? (
              <p className="text-sm text-muted-foreground mt-1">Try another status, person, date, or search.</p>
            ) : null}
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
                    onOpenTimeline={() => setTimelineRow(row)}
                    onPrint={() => generateAndOpenReturnLeaderPdf(row)}
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
                      label="RL Number"
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
                          <div className="inline-flex items-center justify-end gap-1.5">
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
                            <ReturnLeaderRowMenu
                              row={row}
                              onView={() => onView(row)}
                              onOpenTimeline={() => setTimelineRow(row)}
                              onPrint={() => generateAndOpenReturnLeaderPdf(row)}
                            />
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
      <ReturnLeaderTimeline
        open={!!timelineRow}
        onOpenChange={(open) => {
          if (!open) setTimelineRow(null);
        }}
        row={timelineRow}
      />
    </Card>
  );
}
