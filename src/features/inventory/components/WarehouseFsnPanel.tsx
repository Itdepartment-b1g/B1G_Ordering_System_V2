import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  FSN_PERIOD_DAYS_OPTIONS,
  PARETO_FAST_CUMULATIVE_PCT,
  fsnClassLabel,
  summarizeFsn,
  type FsnClass,
  type FsnPeriodDays,
  type FsnVariantRow,
} from '../warehouseFsnAnalysis';

type FsnFilter = 'all' | FsnClass;

function fsnBadgeClass(fsnClass: FsnClass): string {
  switch (fsnClass) {
    case 'fast':
      return 'bg-emerald-600 text-white';
    case 'slow':
      return 'bg-amber-500 text-amber-950';
    case 'non-moving':
      return 'bg-muted text-muted-foreground border border-border';
  }
}

function FsnIcon({ fsnClass }: { fsnClass: FsnClass }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  switch (fsnClass) {
    case 'fast':
      return <TrendingUp className={cls} aria-hidden />;
    case 'slow':
      return <TrendingDown className={cls} aria-hidden />;
    case 'non-moving':
      return <Minus className={cls} aria-hidden />;
  }
}

type WarehouseFsnPanelProps = {
  rows: FsnVariantRow[];
  loading: boolean;
  error: Error | null;
  periodDays: FsnPeriodDays;
  onPeriodDaysChange: (days: FsnPeriodDays) => void;
  locationLabel: string;
  search: string;
  /** When true, period is controlled from a parent sidebar (e.g. Key Account analytics). */
  hidePeriodSelector?: boolean;
  dataSourceDescription?: string;
  /** Label for units in row detail, e.g. "fulfilled" or "delivered". */
  movementMetricLabel?: string;
  /** Show warehouse available stock on every row (Key Account FSN). */
  showLocationStock?: boolean;
  /** Label for stock column when showLocationStock is true. */
  stockLabel?: string;
};

export function WarehouseFsnPanel({
  rows,
  loading,
  error,
  periodDays,
  onPeriodDaysChange,
  locationLabel,
  search,
  hidePeriodSelector = false,
  dataSourceDescription = 'Transfer PO fulfillments only (no supplier POs).',
  movementMetricLabel = 'fulfilled',
  showLocationStock = false,
  stockLabel = 'Avail. stock',
}: WarehouseFsnPanelProps) {
  const [fsnFilter, setFsnFilter] = useState<FsnFilter>('all');
  const summary = useMemo(() => summarizeFsn(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fsnFilter !== 'all' && r.fsnClass !== fsnFilter) return false;
      if (!q) return true;
      return (
        r.brandName.toLowerCase().includes(q) ||
        r.variantName.toLowerCase().includes(q) ||
        r.variantType.toLowerCase().includes(q)
      );
    });
  }, [rows, fsnFilter, search]);

  const byBrand = useMemo(() => {
    const map = new Map<string, { brandName: string; variants: FsnVariantRow[] }>();
    for (const r of filtered) {
      const existing = map.get(r.brandId) ?? { brandName: r.brandName, variants: [] };
      existing.variants.push(r);
      map.set(r.brandId, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.brandName.localeCompare(b.brandName));
  }, [filtered]);

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
        Could not load FSN data: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {dataSourceDescription}{' '}
            <span className="font-medium text-foreground">{locationLabel}</span>
          </p>
          <p>
            Fast / Slow split uses {PARETO_FAST_CUMULATIVE_PCT}% Pareto of {movementMetricLabel} units per variant
            type.
          </p>
        </div>
        {!hidePeriodSelector && (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="fsn-period" className="sr-only">
              Analysis period
            </Label>
            <Select
              value={String(periodDays)}
              onValueChange={(v) => onPeriodDaysChange(Number(v) as FsnPeriodDays)}
            >
              <SelectTrigger id="fsn-period" className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FSN_PERIOD_DAYS_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Last {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{summary.fast}</span> Fast
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-amber-700 dark:text-amber-400">{summary.slow}</span> Slow
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums">
          <span className="font-semibold text-muted-foreground">{summary.nonMoving}</span> Non-moving
        </span>
        <span className="rounded-md border bg-card px-2.5 py-1.5 tabular-nums text-muted-foreground">
          {summary.totalUnitsMoved.toLocaleString()} units {movementMetricLabel}
        </span>
      </div>

      <ToggleGroup
        type="single"
        value={fsnFilter}
        onValueChange={(v) => v && setFsnFilter(v as FsnFilter)}
        className="justify-start"
        aria-label="Filter by FSN class"
      >
        <ToggleGroupItem value="all" size="sm">
          All ({summary.totalSkus})
        </ToggleGroupItem>
        <ToggleGroupItem value="fast" size="sm">
          Fast ({summary.fast})
        </ToggleGroupItem>
        <ToggleGroupItem value="slow" size="sm">
          Slow ({summary.slow})
        </ToggleGroupItem>
        <ToggleGroupItem value="non-moving" size="sm">
          Non-moving ({summary.nonMoving})
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', fsnBadgeClass('fast'))} aria-hidden />
          Fast moving
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', fsnBadgeClass('slow'))} aria-hidden />
          Slow moving
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-3 w-3 rounded-sm', fsnBadgeClass('non-moving'))} aria-hidden />
          Non-moving (0 {movementMetricLabel})
        </span>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground text-sm">
          Loading FSN analysis…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground text-sm">
          {search.trim() || fsnFilter !== 'all'
            ? 'No SKUs match your filter.'
            : 'No catalog SKUs to analyze.'}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex flex-row gap-4 min-w-min">
            {byBrand.map((group) => (
              <div
                key={group.brandName}
                className="flex w-[min(100%,300px)] shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden"
              >
                <div className="bg-primary px-2 py-2 text-center text-xs font-bold uppercase text-primary-foreground">
                  {group.brandName}
                </div>
                <div className="max-h-[min(55vh,520px)] overflow-y-auto">
                  {group.variants.map((r) => (
                    <div
                      key={r.variantId}
                      className="flex items-start gap-2 border-b border-border px-2 py-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground break-words">{r.variantName}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">{r.variantType}</div>
                        <div className="mt-0.5 tabular-nums text-muted-foreground">
                          {r.unitsMoved > 0 ? (
                            <>
                              {r.unitsMoved.toLocaleString()} {movementMetricLabel}
                              {r.fulfillEvents > 0 && (
                                <span> · {r.fulfillEvents} event{r.fulfillEvents === 1 ? '' : 's'}</span>
                              )}
                              {r.cumulativePct != null && r.fsnClass !== 'non-moving' && (
                                <span> · {r.cumulativePct.toFixed(0)}% cum.</span>
                              )}
                              {showLocationStock && (
                                <span> · {stockLabel}: {r.stock.toLocaleString()}</span>
                              )}
                            </>
                          ) : (
                            <>
                              {stockLabel}: {r.stock.toLocaleString()}
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase',
                          fsnBadgeClass(r.fsnClass)
                        )}
                        title={fsnClassLabel(r.fsnClass)}
                      >
                        <FsnIcon fsnClass={r.fsnClass} />
                        {r.fsnClass === 'non-moving' ? 'N' : r.fsnClass === 'fast' ? 'F' : 'S'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
