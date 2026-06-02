import type { Brand } from './InventoryContext';

export type FsnClass = 'fast' | 'slow' | 'non-moving';

export const FSN_PERIOD_DAYS_OPTIONS = [30, 60, 90] as const;
export type FsnPeriodDays = (typeof FSN_PERIOD_DAYS_OPTIONS)[number];

/** Cumulative share of units moved (within a variant type) at or below this % → Fast. */
export const PARETO_FAST_CUMULATIVE_PCT = 70;

export type FsnMovementAggregate = {
  unitsMoved: number;
  fulfillEvents: number;
};

export type FsnVariantRow = {
  variantId: string;
  variantName: string;
  brandId: string;
  brandName: string;
  variantType: string;
  stock: number;
  unitsMoved: number;
  fulfillEvents: number;
  fsnClass: FsnClass;
  /** Cumulative % of type movement (movers only); undefined for non-moving. */
  cumulativePct?: number;
};

export type FsnSummary = {
  fast: number;
  slow: number;
  nonMoving: number;
  totalSkus: number;
  totalUnitsMoved: number;
};

function normalizeTypeKey(variantType: string): string {
  return variantType.trim().toLowerCase() || 'other';
}

/**
 * Classify movers with Pareto (70% cumulative units per variant type).
 * Tie-break: higher fulfill event count, then variant name.
 */
export function classifyMoversByPareto(
  movers: { variantId: string; variantType: string; unitsMoved: number; fulfillEvents: number }[]
): Map<string, { fsnClass: 'fast' | 'slow'; cumulativePct: number }> {
  const byType = new Map<string, typeof movers>();
  for (const row of movers) {
    const key = normalizeTypeKey(row.variantType);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(row);
  }

  const result = new Map<string, { fsnClass: 'fast' | 'slow'; cumulativePct: number }>();

  for (const [, group] of byType) {
    const sorted = [...group].sort((a, b) => {
      if (b.unitsMoved !== a.unitsMoved) return b.unitsMoved - a.unitsMoved;
      if (b.fulfillEvents !== a.fulfillEvents) return b.fulfillEvents - a.fulfillEvents;
      return a.variantId.localeCompare(b.variantId);
    });

    const typeTotal = sorted.reduce((s, r) => s + r.unitsMoved, 0);
    if (typeTotal <= 0) continue;

    let cumulative = 0;
    for (const row of sorted) {
      const prevPct = (cumulative / typeTotal) * 100;
      cumulative += row.unitsMoved;
      const cumulativePct = (cumulative / typeTotal) * 100;
      // Fast = SKUs that contribute to the first 70% of movement (standard Pareto bucket).
      const fsnClass: 'fast' | 'slow' = prevPct < PARETO_FAST_CUMULATIVE_PCT ? 'fast' : 'slow';
      result.set(row.variantId, { fsnClass, cumulativePct });
    }
  }

  return result;
}

export function buildFsnVariantRows(
  brands: Brand[],
  movementByVariant: Map<string, FsnMovementAggregate>
): FsnVariantRow[] {
  const catalogRows: {
    variantId: string;
    variantName: string;
    brandId: string;
    brandName: string;
    variantType: string;
    stock: number;
    unitsMoved: number;
    fulfillEvents: number;
  }[] = [];

  for (const brand of brands) {
    for (const v of brand.allVariants) {
      const agg = movementByVariant.get(v.id);
      catalogRows.push({
        variantId: v.id,
        variantName: v.name,
        brandId: brand.id,
        brandName: brand.name,
        variantType: v.variantType,
        stock: v.stock,
        unitsMoved: agg?.unitsMoved ?? 0,
        fulfillEvents: agg?.fulfillEvents ?? 0,
      });
    }
  }

  const movers = catalogRows
    .filter((r) => r.unitsMoved > 0)
    .map((r) => ({
      variantId: r.variantId,
      variantType: r.variantType,
      unitsMoved: r.unitsMoved,
      fulfillEvents: r.fulfillEvents,
    }));

  const pareto = classifyMoversByPareto(movers);

  return catalogRows
    .map((r) => {
      if (r.unitsMoved <= 0) {
        return { ...r, fsnClass: 'non-moving' as const };
      }
      const p = pareto.get(r.variantId);
      return {
        ...r,
        fsnClass: p?.fsnClass ?? 'slow',
        cumulativePct: p?.cumulativePct,
      };
    })
    .sort((a, b) => {
      const order: Record<FsnClass, number> = { fast: 0, slow: 1, 'non-moving': 2 };
      if (order[a.fsnClass] !== order[b.fsnClass]) return order[a.fsnClass] - order[b.fsnClass];
      if (b.unitsMoved !== a.unitsMoved) return b.unitsMoved - a.unitsMoved;
      const brandCmp = a.brandName.localeCompare(b.brandName);
      if (brandCmp !== 0) return brandCmp;
      return a.variantName.localeCompare(b.variantName);
    });
}

export function summarizeFsn(rows: FsnVariantRow[]): FsnSummary {
  let fast = 0;
  let slow = 0;
  let nonMoving = 0;
  let totalUnitsMoved = 0;
  for (const r of rows) {
    totalUnitsMoved += r.unitsMoved;
    if (r.fsnClass === 'fast') fast += 1;
    else if (r.fsnClass === 'slow') slow += 1;
    else nonMoving += 1;
  }
  return {
    fast,
    slow,
    nonMoving,
    totalSkus: rows.length,
    totalUnitsMoved,
  };
}

export function fsnClassLabel(fsnClass: FsnClass): string {
  switch (fsnClass) {
    case 'fast':
      return 'Fast';
    case 'slow':
      return 'Slow';
    case 'non-moving':
      return 'Non-moving';
  }
}
