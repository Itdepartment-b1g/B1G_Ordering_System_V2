import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BATCH_SOURCE_LABELS,
  daysBadgeClass,
  matchesAgeBucket,
  summarizeBatchAging,
  type AgeBucket,
  type BatchAgingRow,
} from '../warehouseBatchAging';

type WarehouseBatchAgingPanelProps = {
  rows: BatchAgingRow[];
  loading: boolean;
  error: Error | null;
  locationLabel: string;
  search: string;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export function WarehouseBatchAgingPanel({
  rows,
  loading,
  error,
  locationLabel,
  search,
}: WarehouseBatchAgingPanelProps) {
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [variantFilter, setVariantFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [ageBucket, setAgeBucket] = useState<AgeBucket>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.brandId, r.brandName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const variantOptions = useMemo(() => {
    const map = new Map<string, { name: string; brandId: string }>();
    for (const r of rows) {
      if (brandFilter !== 'all' && r.brandId !== brandFilter) continue;
      map.set(r.variantId, { name: r.variantName, brandId: r.brandId });
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, brandFilter]);

  const batchOptions = useMemo(() => {
    const numbers = new Set<string>();
    for (const r of rows) {
      if (brandFilter !== 'all' && r.brandId !== brandFilter) continue;
      if (variantFilter !== 'all' && r.variantId !== variantFilter) continue;
      numbers.add(r.batchNumber);
    }
    return Array.from(numbers).sort((a, b) => b.localeCompare(a));
  }, [rows, brandFilter, variantFilter]);

  const receivedDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (brandFilter !== 'all' && r.brandId !== brandFilter) return false;
      if (variantFilter !== 'all' && r.variantId !== variantFilter) return false;
      if (batchFilter !== 'all' && r.batchNumber !== batchFilter) return false;
      if (!matchesAgeBucket(r.daysInWarehouse, ageBucket)) return false;
      if (!isDateInRange(r.receivedAt, receivedDateRange.start, receivedDateRange.end)) return false;
      if (!q) return true;
      return (
        r.batchNumber.toLowerCase().includes(q) ||
        r.brandName.toLowerCase().includes(q) ||
        r.variantName.toLowerCase().includes(q) ||
        r.variantType.toLowerCase().includes(q)
      );
    });
  }, [rows, brandFilter, variantFilter, batchFilter, ageBucket, receivedDateRange, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.daysInWarehouse - a.daysInWarehouse),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [brandFilter, variantFilter, batchFilter, ageBucket, dateRangeFilter, search, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (batchFilter !== 'all' && !batchOptions.includes(batchFilter)) {
      setBatchFilter('all');
    }
  }, [batchFilter, batchOptions]);

  const summary = useMemo(() => summarizeBatchAging(filtered), [filtered]);

  const hasActiveFilters =
    search.trim() !== '' ||
    brandFilter !== 'all' ||
    variantFilter !== 'all' ||
    batchFilter !== 'all' ||
    ageBucket !== 'all' ||
    dateRangeFilter.preset !== 'all';

  const paginationStart = sorted.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, sorted.length);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        Could not load batch aging data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Active batch lots with remaining stock. Aging is measured from{' '}
          <span className="font-medium text-foreground">received date</span> at each location.{' '}
          <span className="font-medium text-foreground">{locationLabel}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-foreground">{summary.totalLots}</span> lot
          {summary.totalLots === 1 ? '' : 's'}
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-foreground">{summary.totalUnits.toLocaleString()}</span> units
          remaining
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{summary.bucket0to30}</span>{' '}
          ≤30 days
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-amber-700 dark:text-amber-400">{summary.bucket31to60}</span>{' '}
          31–60 days
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-red-700 dark:text-red-400">{summary.bucket61plus}</span> 61+ days
          ({summary.oldUnits.toLocaleString()} units)
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="aging-brand" className="text-xs text-muted-foreground">
            Brand
          </Label>
          <Select
            value={brandFilter}
            onValueChange={(v) => {
              setBrandFilter(v);
              setVariantFilter('all');
              setBatchFilter('all');
            }}
          >
            <SelectTrigger id="aging-brand" className="h-9 w-[180px]">
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

        <div className="space-y-1">
          <Label htmlFor="aging-variant" className="text-xs text-muted-foreground">
            Variant
          </Label>
          <Select
            value={variantFilter}
            onValueChange={(v) => {
              setVariantFilter(v);
              setBatchFilter('all');
            }}
            disabled={variantOptions.length === 0}
          >
            <SelectTrigger id="aging-variant" className="h-9 w-[200px]">
              <SelectValue placeholder="All variants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All variants</SelectItem>
              {variantOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="aging-batch" className="text-xs text-muted-foreground">
            Batch
          </Label>
          <Select
            value={batchFilter}
            onValueChange={setBatchFilter}
            disabled={batchOptions.length === 0}
          >
            <SelectTrigger id="aging-batch" className="h-9 w-[220px]">
              <SelectValue placeholder="All batches" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All batches</SelectItem>
              {batchOptions.map((batchNumber) => (
                <SelectItem key={batchNumber} value={batchNumber}>
                  {batchNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DateRangeFilterPopover value={dateRangeFilter} onChange={setDateRangeFilter} />
      </div>

      <ToggleGroup
        type="single"
        value={ageBucket}
        onValueChange={(v) => v && setAgeBucket(v as AgeBucket)}
        className="justify-start"
        aria-label="Filter by age bucket"
      >
        <ToggleGroupItem value="all" size="sm">
          All ages
        </ToggleGroupItem>
        <ToggleGroupItem value="0-30" size="sm">
          0–30 days
        </ToggleGroupItem>
        <ToggleGroupItem value="31-60" size="sm">
          31–60 days
        </ToggleGroupItem>
        <ToggleGroupItem value="61+" size="sm">
          61+ days
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', daysBadgeClass(15))} aria-hidden />
          0–30 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', daysBadgeClass(45))} aria-hidden />
          31–60 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', daysBadgeClass(90))} aria-hidden />
          61+ days
        </span>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground text-sm">
          Loading batch aging…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground text-sm">
          {hasActiveFilters
            ? 'No batch lots match your filters.'
            : 'No active batch lots at this location.'}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch #</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((r) => (
                <TableRow
                  key={r.lotId}
                  className={cn(r.daysInWarehouse >= 61 && 'bg-red-50/60 dark:bg-red-950/20')}
                >
                  <TableCell className="font-medium">{r.batchNumber}</TableCell>
                  <TableCell>{r.brandName}</TableCell>
                  <TableCell>
                    <div>{r.variantName}</div>
                    <div className="text-xs text-muted-foreground capitalize">{r.variantType}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {BATCH_SOURCE_LABELS[r.sourceType] ?? r.sourceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.quantityRemaining.toLocaleString()}
                  </TableCell>
                  <TableCell>{format(new Date(r.receivedAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-xs font-bold tabular-nums',
                        daysBadgeClass(r.daysInWarehouse)
                      )}
                    >
                      {r.daysInWarehouse}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing {paginationStart}–{paginationEnd} of {sorted.length}
              </span>
              <div className="flex items-center gap-2">
                <Label htmlFor="aging-page-size" className="text-xs whitespace-nowrap">
                  Rows per page
                </Label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger id="aging-page-size" className="h-8 w-[72px]">
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
    </div>
  );
}
