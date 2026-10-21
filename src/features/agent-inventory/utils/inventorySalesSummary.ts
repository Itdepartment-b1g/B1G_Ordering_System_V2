export type InventorySoldVariant = {
  agentId?: string;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  variantType: string;
  quantity: number;
};

export type InventoryOrderSalesRow = InventorySoldVariant & {
  itemId: string;
  status: string;
  stage: string | null;
};

export function inventoryVariantKey(line: Pick<InventorySoldVariant, 'brandId' | 'variantId' | 'variantType'>): string {
  return JSON.stringify([line.brandId, line.variantId, line.variantType?.trim().toLowerCase() || '']);
}

/** Gross ordered units, matching Orders page item quantities; pending orders count. */
export function aggregateInventoryOrderSales(rows: InventoryOrderSalesRow[]): InventorySoldVariant[] {
  const variants = new Map<string, InventorySoldVariant>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!['pending', 'approved'].includes(row.status) || ['leader_rejected', 'admin_rejected'].includes(row.stage ?? '')) continue;
    if (seen.has(row.itemId)) continue;
    seen.add(row.itemId);
    if (!row.variantId || !Number.isFinite(row.quantity) || row.quantity < 0) {
      throw new Error('Invalid order item quantity found while exporting sold units.');
    }
    const key = JSON.stringify([row.agentId ?? null, inventoryVariantKey(row)]);
    const existing = variants.get(key);
    if (existing) existing.quantity += row.quantity;
    else variants.set(key, {
      agentId: row.agentId,
      brandId: row.brandId, brandName: row.brandName, variantId: row.variantId,
      variantName: row.variantName, variantType: row.variantType?.trim().toLowerCase() || '',
      quantity: row.quantity,
    });
  }
  return [...variants.values()];
}
