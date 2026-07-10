import type { Brand, Variant } from './InventoryContext';

export type WarehouseMovementAggregate = {
  released: number;
  /** Outbound from rebate fulfillment POs (change-item replacement shipments). */
  rebateReplacementReleased: number;
  pendingRelease: number;
  /** Good-condition rebate returns (change-item disputed goods back). */
  returnedIn: number;
  disposed: number;
};

export type WarehouseProductMovementRow = {
  variantId: string;
  variantName: string;
  brandId: string;
  brandName: string;
  variantType: string;
  /** Available stock at this location (on-hand minus allocated reservations). */
  stock: number;
  released: number;
  rebateReplacementReleased: number;
  pendingRelease: number;
  returnedIn: number;
  disposed: number;
  netMovement: number;
};

export type WarehouseMovementSummary = {
  released: number;
  rebateReplacementReleased: number;
  pendingRelease: number;
  returnedIn: number;
  disposed: number;
  netMovement: number;
  totalSkus: number;
  skusWithActivity: number;
};

export function createEmptyMovementAggregate(): WarehouseMovementAggregate {
  return {
    released: 0,
    rebateReplacementReleased: 0,
    pendingRelease: 0,
    returnedIn: 0,
    disposed: 0,
  };
}

export function accumulateMovement(
  map: Map<string, WarehouseMovementAggregate>,
  variantId: string,
  patch: Partial<WarehouseMovementAggregate>
) {
  const existing = map.get(variantId) ?? createEmptyMovementAggregate();
  if (patch.released) existing.released += patch.released;
  if (patch.rebateReplacementReleased) existing.rebateReplacementReleased += patch.rebateReplacementReleased;
  if (patch.pendingRelease) existing.pendingRelease += patch.pendingRelease;
  if (patch.returnedIn) existing.returnedIn += patch.returnedIn;
  if (patch.disposed) existing.disposed += patch.disposed;
  map.set(variantId, existing);
}

/** Main inventory: stock minus allocated. Sub-warehouse rows have no allocation. */
export function getVariantAvailableStock(variant: Variant): number {
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
}

export function buildWarehouseProductMovementRows(
  brands: Brand[],
  movementByVariant: Map<string, WarehouseMovementAggregate>
): WarehouseProductMovementRow[] {
  const rows: WarehouseProductMovementRow[] = [];

  for (const brand of brands) {
    for (const variant of brand.allVariants) {
      const agg = movementByVariant.get(variant.id) ?? createEmptyMovementAggregate();
      const netMovement = agg.released - agg.returnedIn;
      rows.push({
        variantId: variant.id,
        variantName: variant.name,
        brandId: brand.id,
        brandName: brand.name,
        variantType: variant.variantType,
        stock: getVariantAvailableStock(variant),
        released: agg.released,
        rebateReplacementReleased: agg.rebateReplacementReleased,
        pendingRelease: agg.pendingRelease,
        returnedIn: agg.returnedIn,
        disposed: agg.disposed,
        netMovement,
      });
    }
  }

  return rows.sort((a, b) => {
    const activityA = a.released + a.pendingRelease + a.returnedIn + a.disposed;
    const activityB = b.released + b.pendingRelease + b.returnedIn + b.disposed;
    if (activityB !== activityA) return activityB - activityA;
    if (b.netMovement !== a.netMovement) return b.netMovement - a.netMovement;
    const brandCmp = a.brandName.localeCompare(b.brandName);
    if (brandCmp !== 0) return brandCmp;
    return a.variantName.localeCompare(b.variantName);
  });
}

export function summarizeWarehouseMovement(rows: WarehouseProductMovementRow[]): WarehouseMovementSummary {
  let released = 0;
  let rebateReplacementReleased = 0;
  let pendingRelease = 0;
  let returnedIn = 0;
  let disposed = 0;
  let skusWithActivity = 0;

  for (const row of rows) {
    released += row.released;
    rebateReplacementReleased += row.rebateReplacementReleased;
    pendingRelease += row.pendingRelease;
    returnedIn += row.returnedIn;
    disposed += row.disposed;
    if (row.released + row.pendingRelease + row.returnedIn + row.disposed > 0) {
      skusWithActivity += 1;
    }
  }

  return {
    released,
    rebateReplacementReleased,
    pendingRelease,
    returnedIn,
    disposed,
    netMovement: released - returnedIn,
    totalSkus: rows.length,
    skusWithActivity,
  };
}
