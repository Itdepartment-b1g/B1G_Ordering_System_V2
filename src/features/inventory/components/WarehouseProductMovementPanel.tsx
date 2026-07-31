import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Package,
  Recycle,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { summarizeWarehouseMovement, type WarehouseProductMovementRow } from '../warehouseProductMovement';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const METRIC_HEAD_CLASS =
  'text-right whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const LABEL_HEAD_CLASS =
  'whitespace-nowrap px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const METRIC_CELL_CLASS = 'text-right tabular-nums px-2';

type WarehouseProductMovementPanelProps = {
  rows: WarehouseProductMovementRow[];
  loading: boolean;
  error: Error | null;
  dateRangeFilter: DateRangeFilterValue;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  dateRangeLabel: string;
  locationLabel: string;
  search: string;
};

function num(n: number) {
  return n.toLocaleString();
}

export function WarehouseProductMovementPanel({
  rows,
  loading,
  error,
  dateRangeFilter,
  onDateRangeFilterChange,
  dateRangeLabel,
  locationLabel,
  search,
}: WarehouseProductMovementPanelProps) {
  const [brandFilter, setBrandFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const summary = useMemo(() => summarizeWarehouseMovement(rows), [rows]);

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.brandId, row.brandName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (brandFilter !== 'all' && row.brandId !== brandFilter) return false;
      if (!q) return true;
      return (
        row.brandName.toLowerCase().includes(q) ||
        row.variantName.toLowerCase().includes(q) ||
        row.variantType.toLowerCase().includes(q)
      );
    });
  }, [rows, search, brandFilter]);

  const filteredSummary = useMemo(() => summarizeWarehouseMovement(filtered), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, brandFilter, pageSize, rows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, filtered.length);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
        Failed to load product movement: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{locationLabel}</p>
          <p className="text-xs text-muted-foreground max-w-3xl">
            Physical stock movement by SKU — {dateRangeLabel}. Key Account: pending while workflow is
            warehouse reserved or partial delivered; released only when status is fulfilled and
            workflow is delivered. Standard Account: pending while status is pending or approved for
            fulfilled. Pending is filtered by PO order date (same as the PO page). Released,
            returned in, disposed, and shortage write-offs use fulfill/dispatch/receipt/resolve
            dates. Available is current on-hand minus allocated. Net (out − in − loss) = released
            minus returned in minus shortage write-offs for the selected period. Change-item rebates:
            disputed goods return via Returned in; replacement SKUs ship out under Replacement out
            (rebate fulfillment PO). Shortage write-offs link to Delivery Shortages.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 shrink-0">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={onDateRangeFilterChange}
              triggerClassName="h-9 w-[220px] justify-between"
              align="end"
            />
          </div>
          {brandOptions.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Brand</Label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brandOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        <SummaryCard
          icon={<ArrowUpRight className="h-4 w-4" />}
          label="Released (out)"
          value={filteredSummary.released}
          hint="Key Account: fulfilled + delivered · Standard: fulfilled"
        />
        <SummaryCard
          icon={<Package className="h-4 w-4" />}
          label="Replacement out"
          value={filteredSummary.rebateReplacementReleased}
          hint="Change-item rebate shipments"
          accent="teal"
        />
        <SummaryCard
          icon={<Clock className="h-4 w-4" />}
          label="Pending release"
          value={filteredSummary.pendingRelease}
          hint="Reserved / awaiting warehouse release"
          accent="amber"
        />
        <SummaryCard
          icon={<ArrowDownLeft className="h-4 w-4" />}
          label="Returned in"
          value={filteredSummary.returnedIn}
          hint="Good rebate returns"
          accent="blue"
        />
        <SummaryCard
          icon={<Trash2 className="h-4 w-4" />}
          label="Disposed"
          value={filteredSummary.disposed}
          hint="Damaged / unsellable"
          accent="red"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Shortage write-off"
          value={filteredSummary.shortageWriteOff}
          hint="Buyer shortfall confirmed lost · View delivery shortages"
          accent="orange"
          href="/inventory/delivery-shortages?status=resolved"
        />
        <SummaryCard
          icon={<Recycle className="h-4 w-4" />}
          label="Net (out − in − loss)"
          value={filteredSummary.netMovement}
          hint="Released minus returned in minus shortage write-offs"
        />
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          Loading product movement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          {search.trim() || brandFilter !== 'all'
            ? 'No variants match your filter.'
            : 'No movement recorded for this location in the selected date range.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[980px] table-fixed w-full">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[9%]" />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={LABEL_HEAD_CLASS}>Brand</TableHead>
                <TableHead className={LABEL_HEAD_CLASS}>Variant</TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Available stock (on-hand minus allocated)">
                  Avail.
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Released outbound">
                  Released
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Change-item rebate replacement shipments">
                  Repl. out
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Reserved / awaiting release">
                  Pending
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Good rebate returns">
                  Returned
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Damaged / unsellable disposals">
                  Disposed
                </TableHead>
                <TableHead className={METRIC_HEAD_CLASS} title="Buyer delivery shortage write-offs">
                  Write-off
                </TableHead>
                <TableHead
                  className={METRIC_HEAD_CLASS}
                  title="Released minus returned in minus shortage write-offs"
                >
                  Net
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((row) => (
                <TableRow key={row.variantId}>
                  <TableCell className="px-3 font-medium truncate max-w-0">{row.brandName}</TableCell>
                  <TableCell className="px-3 max-w-0">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate">{row.variantName}</span>
                      <span className="text-xs text-muted-foreground truncate">{row.variantType}</span>
                    </div>
                  </TableCell>
                  <TableCell className={METRIC_CELL_CLASS}>{num(row.stock)}</TableCell>
                  <TableCell className={METRIC_CELL_CLASS}>{num(row.released)}</TableCell>
                  <TableCell className={METRIC_CELL_CLASS}>
                    {row.rebateReplacementReleased > 0 ? (
                      <Badge variant="secondary" className="font-mono tabular-nums">
                        {num(row.rebateReplacementReleased)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className={cn(METRIC_CELL_CLASS, 'text-amber-700 dark:text-amber-400')}>
                    {row.pendingRelease > 0 ? num(row.pendingRelease) : '—'}
                  </TableCell>
                  <TableCell className={cn(METRIC_CELL_CLASS, 'text-blue-700 dark:text-blue-400')}>
                    {row.returnedIn > 0 ? num(row.returnedIn) : '—'}
                  </TableCell>
                  <TableCell className={cn(METRIC_CELL_CLASS, 'text-destructive')}>
                    {row.disposed > 0 ? num(row.disposed) : '—'}
                  </TableCell>
                  <TableCell className={METRIC_CELL_CLASS}>
                    {row.shortageWriteOff > 0 ? (
                      <Link
                        to={`/inventory/delivery-shortages?status=resolved&search=${encodeURIComponent(row.variantName)}`}
                        className="text-orange-700 hover:underline dark:text-orange-400 font-medium"
                      >
                        {num(row.shortageWriteOff)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      METRIC_CELL_CLASS,
                      'font-medium',
                      row.netMovement > 0 && 'text-emerald-700 dark:text-emerald-400',
                      row.netMovement < 0 && 'text-destructive'
                    )}
                  >
                    {num(row.netMovement)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing {paginationStart}–{paginationEnd} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Label htmlFor="movement-page-size" className="text-xs whitespace-nowrap">
                  Rows per page
                </Label>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger id="movement-page-size" className="h-8 w-[72px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="min-w-[100px] text-center tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filteredSummary.skusWithActivity} of {summary.totalSkus} SKUs with movement · Totals reflect
          {brandFilter !== 'all' || search.trim() ? ' filtered' : ''} rows
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  accent,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  accent?: 'teal' | 'amber' | 'blue' | 'red' | 'orange';
  href?: string;
}) {
  const accentClass =
    accent === 'teal'
      ? 'text-teal-700 dark:text-teal-400'
      : accent === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : accent === 'blue'
          ? 'text-blue-700 dark:text-blue-400'
          : accent === 'orange'
            ? 'text-orange-700 dark:text-orange-400'
          : accent === 'red'
            ? 'text-destructive'
            : '';

  const content = (
    <>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn('mt-1 text-2xl font-bold tabular-nums', accentClass)}>{value.toLocaleString()}</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="rounded-lg border bg-card px-3 py-3 block transition-colors hover:bg-muted/40 hover:border-orange-200 dark:hover:border-orange-900"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg border bg-card px-3 py-3">{content}</div>;
}
