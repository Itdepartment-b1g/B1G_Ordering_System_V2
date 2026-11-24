import { Fragment, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check,
  ChevronDown,
  Clock,
  Eye,
  FilterX,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
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
import { QuickFilterSheet, createQuickFilterAndClause, countActiveQuickFilterAndClauses, type QuickFilterColumn } from '@/features/shared/components/QuickFilterSheet';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { AccordionBrandLinesTable } from './AccordionBrandLinesTable';
import {
  getReturnLeaderLineQty,
  returnLeaderStatusBadgeClass,
  returnLeaderStatusLabel,
  uniqueReturnLeaderClientNames,
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
  matchesReturnLeaderFilters,
  uniqueReturnNumbers,
  uniqueSubmittedByNames,
  type ReturnLeaderQuickColumn,
} from './utils/returnLeaderFilters';
import { ReturnLeaderTimeline } from './ReturnLeaderTimeline';
import { generateAndOpenReturnLeaderPdf } from './generateReturnLeaderPdf';

const TABLE_COL_SPAN = 9;
const VIEW_MODE_KEY = 'return-to-leader-view';
type RlViewMode = 'table' | 'cards';

function readStoredViewMode(): RlViewMode {
  if (typeof window === 'undefined') return 'table';
  const saved = window.localStorage.getItem(VIEW_MODE_KEY);
  return saved === 'cards' ? 'cards' : 'table';
}

function receivedByLabel(row: ReturnLeaderHandover): string {
  if (row.status === 'received') return row.approvedByName || '—';
  if (row.status === 'rejected') return '—';
  return 'Waiting';
}

function receivedAtLabel(row: ReturnLeaderHandover): string {
  if (row.status !== 'received') return '—';
  return formatHandoverWhen(row.approvedAt, 'MMM d, yyyy · h:mm a');
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: RlViewMode;
  onChange: (mode: RlViewMode) => void;
}) {
  const options: { id: RlViewMode; label: string; icon: typeof List }[] = [
    { id: 'table', label: 'Table', icon: List },
    { id: 'cards', label: 'Cards', icon: LayoutGrid },
  ];

  return (
    <div className="flex rounded-md border p-0.5 shrink-0">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            variant={active ? 'default' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => onChange(option.id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function ReturnLeaderDetails({ row }: { row: ReturnLeaderHandover }) {
  const disposalLines = (row.lines || []).map((line) => ({
    ...line,
    stockFate: 'disposal' as const,
  }));
  const clientNames = uniqueReturnLeaderClientNames(row.lines);
  const sourceRows = (row.lines || []).flatMap((line) =>
    (line.sources || []).map((source) => ({
      key: `${line.variantId}-${source.clientOrderReturnId}-${source.returnNumber}-${source.clientName}`,
      variantName: line.variantName,
      returnNumber: source.returnNumber,
      clientName: source.clientName,
      quantity: source.quantity,
    }))
  );

  return (
    <div className="w-max min-w-full space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs text-muted-foreground min-w-[36rem]">
        <p>
          Submitted by{' '}
          <span className="font-medium text-foreground">{row.submittedByName || '—'}</span>
        </p>
        <p>
          Submitted{' '}
          <span className="font-medium text-foreground">
            {formatHandoverWhen(row.createdAt, 'MMM d, yyyy · h:mm a')}
          </span>
        </p>
        <p>
          Status{' '}
          <span className="font-medium text-foreground">{returnLeaderStatusLabel(row.status)}</span>
        </p>
        <p>
          Received by{' '}
          <span className="font-medium text-foreground">
            {row.status === 'received'
              ? row.approvedByName || '—'
              : row.status === 'rejected'
                ? '—'
                : 'Waiting'}
          </span>
        </p>
        <p>
          Received at{' '}
          <span className="font-medium text-foreground">
            {row.status === 'received'
              ? formatHandoverWhen(row.approvedAt, 'MMM d, yyyy · h:mm a')
              : '—'}
          </span>
        </p>
        {row.status === 'rejected' ? (
          <p>
            Rejected by{' '}
            <span className="font-medium text-foreground">{row.rejectedByName || '—'}</span>
            {row.rejectedAt ? (
              <>
                {' · '}
                <span className="font-medium text-foreground">
                  {formatHandoverWhen(row.rejectedAt, 'MMM d, yyyy · h:mm a')}
                </span>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="sm:col-span-3 space-y-1">
          <p>
            Clients{' '}
            {clientNames.length === 0 ? (
              <span className="font-medium text-foreground">—</span>
            ) : (
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {clientNames.map((name) => (
                  <Badge key={name} variant="secondary" className="font-normal text-[11px] px-1.5 py-0 h-5">
                    {name}
                  </Badge>
                ))}
              </span>
            )}
          </p>
        </div>
        <p className="sm:col-span-3">
          Notes{' '}
          <span className="font-medium text-foreground">{row.notes?.trim() || '—'}</span>
        </p>
      </div>
      <div className="w-[32rem] shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold">Disposal items</p>
          <Badge
            variant="outline"
            className="font-normal text-[11px] px-1.5 py-0 h-5 bg-rose-50 text-rose-700 border-rose-200"
          >
            Disposal
          </Badge>
        </div>
        <AccordionBrandLinesTable lines={disposalLines} showStockFate />
      </div>
      {sourceRows.length > 0 ? (
        <div className="w-[36rem] shrink-0 space-y-2">
          <p className="text-xs font-semibold">Source clients</p>
          <div className="rounded-md border bg-background overflow-hidden">
            <Table className="w-full min-w-[32rem]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Client
                  </TableHead>
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    CR
                  </TableHead>
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Variant
                  </TableHead>
                  <TableHead className="h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground text-right">
                    Unit
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceRows.map((source) => (
                  <TableRow key={source.key} className="hover:bg-transparent">
                    <TableCell className="px-3 py-2 text-sm font-medium whitespace-nowrap">
                      {source.clientName}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm font-mono text-muted-foreground whitespace-nowrap">
                      {source.returnNumber || '—'}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                      {source.variantName}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-rose-700">
                      {source.quantity.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatHandoverWhen(value: string | null | undefined, pattern: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern);
}

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
  const lines = row.lines || [];
  const skuCount = lines.length;
  const previewLines = lines.slice(0, 3);
  const clientNames = uniqueReturnLeaderClientNames(lines);

  return (
    <div
      className={`rounded-2xl border bg-background p-4 shadow-sm ${
        pending ? 'border-l-[3px] border-l-amber-400' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono font-semibold text-sm truncate">{row.returnNumber}</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant="outline"
              className={`font-normal text-[11px] px-1.5 py-0 h-5 ${returnLeaderStatusBadgeClass(row.status)}`}
            >
              {returnLeaderStatusLabel(row.status)}
            </Badge>
            <Badge
              variant="outline"
              className="font-normal text-[11px] px-1.5 py-0 h-5 bg-rose-50 text-rose-700 border-rose-200"
            >
              Disposal
            </Badge>
          </div>
        </div>
        <ReturnLeaderRowMenu
          row={row}
          onView={onView}
          onOpenTimeline={onOpenTimeline}
          onPrint={onPrint}
        />
      </div>

      <button type="button" className="mt-3 w-full text-left space-y-3" onClick={onView}>
        <p className="text-lg font-bold tracking-tight truncate">{row.submittedByName}</p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Submitted</p>
            <p className="font-semibold text-sm">
              {formatHandoverWhen(row.createdAt, 'MMM d, yyyy · h:mm a')}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Qty</p>
            <p className="font-semibold text-sm tabular-nums text-rose-700">
              {qty} unit{qty === 1 ? '' : 's'}
              {skuCount > 0 ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  · {skuCount} SKU{skuCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Received by</p>
            <p className="font-semibold text-sm truncate">{receivedByLabel(row)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Received at</p>
            <p className="font-semibold text-sm">{receivedAtLabel(row)}</p>
          </div>
          <div className="min-w-0 col-span-2">
            <p className="text-xs text-muted-foreground">Clients</p>
            {clientNames.length === 0 ? (
              <p className="font-semibold text-sm">—</p>
            ) : (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {clientNames.map((name) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="font-normal text-[11px] px-1.5 py-0 h-5 max-w-[9rem] truncate"
                  >
                    {name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 col-span-2">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="font-semibold text-sm break-words">{row.notes?.trim() || '—'}</p>
          </div>
        </div>

        {previewLines.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Disposal items</p>
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
            {lines.length > previewLines.length ? (
              <p className="px-0.5 text-[11px] text-muted-foreground">
                +{lines.length - previewLines.length} more
              </p>
            ) : null}
          </div>
        ) : null}
      </button>

      {pending ? (
        <div className="mt-4 pt-3 border-t grid grid-cols-2 gap-2">
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<ReturnLeaderSortKey>>(createInitialTableSortCycle);
  const [timelineRow, setTimelineRow] = useState<ReturnLeaderHandover | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<RlViewMode>(readStoredViewMode);

  const setAndStoreViewMode = (mode: RlViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const filters = useMemo(
    () => ({
      conditions: [],
      search: searchQuery,
      status: statusFilter,
      dateRange: dateRangeFilter,
      columnClauses,
    }),
    [searchQuery, statusFilter, dateRangeFilter, columnClauses]
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
    setSearchQuery('');
    clearQuickFilters();
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  }, [searchQuery, pageSize, statusFilter, dateRangeFilter, columnClauses, sortState]);

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
            <div className="hidden md:block">
              <ViewModeToggle value={viewMode} onChange={setAndStoreViewMode} />
            </div>
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
            <div className={viewMode === 'table' ? 'space-y-3 md:hidden' : 'space-y-3'}>
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

            {viewMode === 'table' ? (
            <div className="hidden md:block rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 px-2" />
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
                      label="Received by"
                      sortKey="approvedByName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'approvedByName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Received at"
                      sortKey="approvedAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'approvedAt')}
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
                    const isOpen = expandedRows.has(row.id);
                    return (
                      <Fragment key={row.id}>
                        <TableRow className={isOpen ? 'bg-muted/20' : undefined}>
                          <TableCell className="px-2">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                              onClick={() => toggleExpanded(row.id)}
                              aria-expanded={isOpen}
                              aria-label={isOpen ? 'Collapse handover details' : 'Expand handover details'}
                            >
                              <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform ${
                                  isOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                            {row.returnNumber}
                          </TableCell>
                          <TableCell className="font-medium">{row.submittedByName}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatHandoverWhen(row.createdAt, 'MMM d, yyyy · h:mm a')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`font-normal ${returnLeaderStatusBadgeClass(row.status)}`}
                            >
                              {returnLeaderStatusLabel(row.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium truncate max-w-[10rem]" title={receivedByLabel(row)}>
                            {receivedByLabel(row)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {receivedAtLabel(row)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-rose-700">
                            {qty}
                          </TableCell>
                          <TableCell className="text-right">
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
                        {isOpen ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={TABLE_COL_SPAN} className="bg-muted/10 p-0">
                              <div
                                className="sticky left-0 overflow-x-auto overscroll-x-contain p-4"
                                style={{ width: 'min(56rem, calc(100vw - 3rem))' }}
                              >
                                <ReturnLeaderDetails row={row} />
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            ) : null}

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
