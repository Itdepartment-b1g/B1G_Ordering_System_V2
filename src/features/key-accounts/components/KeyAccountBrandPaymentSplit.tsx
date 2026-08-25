import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type BrandPaymentSplitRow = {
  brandId: string;
  brandName: string;
  /** Max cash+discount this brand can take (remaining or billed). */
  remaining: number;
};

export type BrandPaymentAllocationDraft = {
  brandId: string;
  amount: number;
  discount: number;
};

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseMoney(raw: string) {
  if (raw.trim() === '') return 0;
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? money(n) : NaN;
}

function sumAllocatedCash(
  brands: BrandPaymentSplitRow[],
  cashByBrand: Record<string, string>,
  excludeBrandId?: string
) {
  return brands.reduce((sum, brand) => {
    if (excludeBrandId && brand.brandId === excludeBrandId) return sum;
    const n = parseMoney(cashByBrand[brand.brandId] ?? '');
    return money(sum + (Number.isFinite(n) ? n : 0));
  }, 0);
}

/** Max cash this brand can take: min(brand remaining, room left in payment total). */
function maxCashForBrand(
  brand: BrandPaymentSplitRow,
  cashTotal: number,
  brands: BrandPaymentSplitRow[],
  cashByBrand: Record<string, string>
) {
  const cash = money(Math.max(0, cashTotal));
  const otherAllocated = sumAllocatedCash(brands, cashByBrand, brand.brandId);
  const roomInPayment = money(Math.max(0, cash - otherAllocated));
  return money(Math.min(Math.max(0, brand.remaining), roomInPayment));
}

/** Cap typed cash to brand + payment total limits (keeps empty / in-progress typing under max). */
function clampCashInput(raw: string, maxAllowed: number): string {
  if (raw.trim() === '') return '';
  const cleaned = String(raw).replace(/,/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return '';
  if (n < 0) return '0';
  const max = money(Math.max(0, maxAllowed));
  if (n - max > 0.0001) return max > 0 ? String(max) : '';
  return cleaned;
}

/** When payment total drops, trim brand rows (last brands first) so split does not exceed cash. */
function trimCashByBrandToTotal(
  brands: BrandPaymentSplitRow[],
  cashByBrand: Record<string, string>,
  cashTotal: number
): Record<string, string> {
  const cash = money(Math.max(0, cashTotal));
  const next = { ...cashByBrand };
  let total = sumAllocatedCash(brands, next);
  if (total <= cash + 0.011) return next;

  for (let i = brands.length - 1; i >= 0 && total > cash + 0.011; i--) {
    const brand = brands[i];
    const current = parseMoney(next[brand.brandId] ?? '');
    if (!Number.isFinite(current) || current <= 0) continue;
    const excess = money(total - cash);
    const reduced = money(Math.max(0, current - excess));
    next[brand.brandId] = reduced > 0 ? String(reduced) : '';
    total = sumAllocatedCash(brands, next);
  }
  return next;
}

/** Fill brands in list order until cash is used (A 1000 + B 200 from 1200). */
export function autoSplitCashAcrossBrands(
  brands: BrandPaymentSplitRow[],
  cashTotal: number
): Record<string, string> {
  let left = money(Math.max(0, cashTotal));
  const next: Record<string, string> = {};
  for (const brand of brands) {
    if (left <= 0) {
      next[brand.brandId] = '';
      continue;
    }
    const take = money(Math.min(left, Math.max(0, brand.remaining)));
    next[brand.brandId] = take > 0 ? String(take) : '';
    left = money(left - take);
  }
  return next;
}

export function buildBrandPaymentAllocations(params: {
  brands: BrandPaymentSplitRow[];
  cashByBrand: Record<string, string>;
  cashTotal: number;
  discountTotal?: number;
}): { allocations: BrandPaymentAllocationDraft[]; error: string | null; allocatedCash: number } {
  const discountTotal = money(params.discountTotal || 0);
  const cashTotal = money(params.cashTotal);
  const allocations: BrandPaymentAllocationDraft[] = [];
  let allocatedCash = 0;

  for (const brand of params.brands) {
    const raw = params.cashByBrand[brand.brandId] ?? '';
    if (raw.trim() === '') continue;
    const cash = parseMoney(raw);
    if (!Number.isFinite(cash) || cash < 0) {
      return {
        allocations: [],
        error: `Invalid amount for ${brand.brandName}.`,
        allocatedCash: 0,
      };
    }
    if (cash <= 0) continue;
    if (cash - brand.remaining > 0.011) {
      return {
        allocations: [],
        error: `${brand.brandName} can take at most ₱${brand.remaining.toFixed(2)}.`,
        allocatedCash: 0,
      };
    }
    allocations.push({ brandId: brand.brandId, amount: cash, discount: 0 });
    allocatedCash = money(allocatedCash + cash);
  }

  if (cashTotal > 0 && allocations.length === 0) {
    return {
      allocations: [],
      error: 'Split the cash across one or more brands.',
      allocatedCash: 0,
    };
  }

  if (Math.abs(allocatedCash - cashTotal) > 0.011) {
    return {
      allocations: [],
      error: `Brand split ₱${allocatedCash.toFixed(2)} must equal cash ₱${cashTotal.toFixed(2)}.`,
      allocatedCash,
    };
  }

  // Attach settlement discount to brands in order using room left after cash.
  let discountLeft = discountTotal;
  if (discountLeft > 0) {
    const withRoom = allocations.length > 0 ? allocations : [];
    if (withRoom.length === 0) {
      // Discount-only: apply to brands in order.
      for (const brand of params.brands) {
        if (discountLeft <= 0) break;
        const take = money(Math.min(discountLeft, Math.max(0, brand.remaining)));
        if (take <= 0) continue;
        allocations.push({ brandId: brand.brandId, amount: 0, discount: take });
        discountLeft = money(discountLeft - take);
      }
    } else {
      for (const row of withRoom) {
        if (discountLeft <= 0) break;
        const brand = params.brands.find((b) => b.brandId === row.brandId);
        if (!brand) continue;
        const room = money(Math.max(0, brand.remaining - row.amount));
        const take = money(Math.min(discountLeft, room));
        if (take <= 0) continue;
        row.discount = take;
        discountLeft = money(discountLeft - take);
      }
    }
    if (discountLeft > 0.011) {
      return {
        allocations: [],
        error: `Settlement discount exceeds remaining room on the selected brands (₱${discountLeft.toFixed(2)} left).`,
        allocatedCash,
      };
    }
  }

  return {
    allocations: allocations.filter((row) => row.amount > 0 || row.discount > 0),
    error: null,
    allocatedCash,
  };
}

export function KeyAccountBrandPaymentSplit({
  brands,
  cashTotal,
  cashByBrand,
  onCashByBrandChange,
  required = true,
  emptyHint,
}: {
  brands: BrandPaymentSplitRow[];
  /** Parsed cash total being recorded (0 if empty/invalid). */
  cashTotal: number;
  cashByBrand: Record<string, string>;
  onCashByBrandChange: (next: Record<string, string>) => void;
  required?: boolean;
  emptyHint?: string;
}) {
  if (brands.length === 0) {
    return emptyHint ? <p className="text-xs text-muted-foreground">{emptyHint}</p> : null;
  }

  const allocated = sumAllocatedCash(brands, cashByBrand);
  const cash = money(Math.max(0, cashTotal));
  const diff = money(cash - allocated);
  const showSplit = brands.length > 1 || required;

  useEffect(() => {
    if (cash <= 0) return;
    if (allocated <= cash + 0.011) return;
    const trimmed = trimCashByBrandToTotal(brands, cashByBrand, cash);
    const changed = brands.some(
      (brand) => (trimmed[brand.brandId] ?? '') !== (cashByBrand[brand.brandId] ?? '')
    );
    if (changed) onCashByBrandChange(trimmed);
  }, [allocated, brands, cash, cashByBrand, onCashByBrandChange]);

  if (!showSplit && brands.length === 1) {
    return (
      <p className="text-sm">
        {brands[0].brandName} · up to ₱{brands[0].remaining.toFixed(2)}
        <span className="text-muted-foreground text-xs block mt-0.5">
          Single brand — payment is applied here automatically when you save.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>
          Split cash by brand{required && brands.length > 1 ? ' *' : ''}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={cash <= 0}
          onClick={() => onCashByBrandChange(autoSplitCashAcrossBrands(brands, cash))}
        >
          Auto-split
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Example: Brand A ₱1,000 + Brand B ₱200 for a ₱1,200 payment. Auto-split fills brands in order until
        cash is used.
      </p>
      <div className="rounded-md border overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right w-[140px]">Cash (₱)</TableHead>
              <TableHead className="w-[72px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => {
              const value = cashByBrand[brand.brandId] ?? '';
              const maxCash = maxCashForBrand(brand, cashTotal, brands, cashByBrand);
              return (
                <TableRow key={brand.brandId}>
                  <TableCell className="font-medium whitespace-nowrap">{brand.brandName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₱{brand.remaining.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={maxCash}
                      step="0.01"
                      className="h-8 text-right tabular-nums"
                      value={value}
                      onChange={(e) =>
                        onCashByBrandChange({
                          ...cashByBrand,
                          [brand.brandId]: clampCashInput(e.target.value, maxCash),
                        })
                      }
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[11px]"
                      disabled={maxCash <= 0}
                      onClick={() =>
                        onCashByBrandChange({
                          ...cashByBrand,
                          [brand.brandId]: maxCash > 0 ? String(maxCash) : '',
                        })
                      }
                    >
                      Max
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p
        className={`text-xs tabular-nums ${
          cash > 0 && Math.abs(diff) > 0.011
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-muted-foreground'
        }`}
      >
        Split total ₱{allocated.toFixed(2)}
        {cash > 0 ? ` / cash ₱${cash.toFixed(2)}` : ''}
        {cash > 0 && Math.abs(diff) > 0.011
          ? diff > 0
            ? ` · ₱${diff.toFixed(2)} still unassigned`
            : ` · over by ₱${Math.abs(diff).toFixed(2)}`
          : cash > 0
            ? ' · balanced'
            : ''}
      </p>
    </div>
  );
}
