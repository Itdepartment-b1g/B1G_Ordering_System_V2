/**
 * Client-order return UI scaffolding. Flip to false to hide the feature until RPC wiring.
 * History starts empty; wizard confirm still does not write to the database.
 */
export const SHOW_CLIENT_RETURN_MOCK = true;

export const CLIENT_RETURN_REASON_OPTIONS = [
  { value: 'defect', label: 'Defect' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'missing_parts', label: 'Missing parts' },
  { value: 'other', label: 'Other' },
] as const;

export type ClientReturnReasonOption = (typeof CLIENT_RETURN_REASON_OPTIONS)[number]['value'];

export type MockClientReturnLine = {
  variantName: string;
  brandName: string;
  variantType: string;
  quantity: number;
};

export type MockClientReturnStatus = 'pending_leader' | 'posted' | 'rejected' | 'cancelled';

export type MockClientReturn = {
  id: string;
  returnNumber: string;
  orderNumber: string;
  clientName: string;
  returnedByName: string;
  returnDate: string;
  createdAt: string;
  reason: string;
  notes: string | null;
  lines: MockClientReturnLine[];
  proofLabels: string[];
  status: MockClientReturnStatus;
  rejectionNote: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
};

export const MOCK_CLIENT_RETURNS: MockClientReturn[] = [];

export function getReturnActionActor(row: MockClientReturn): {
  kind: 'approve' | 'reject' | null;
  name: string | null;
  at: string | null;
} {
  if (row.status === 'posted') {
    return { kind: 'approve', name: row.approvedByName, at: row.approvedAt };
  }
  if (row.status === 'rejected') {
    return { kind: 'reject', name: row.rejectedByName, at: row.rejectedAt };
  }
  return { kind: null, name: null, at: null };
}

export function formatClientReturnStatus(status: MockClientReturnStatus): string {
  if (status === 'pending_leader') return 'Pending';
  if (status === 'posted') return 'Approve';
  if (status === 'rejected') return 'Reject';
  return 'Cancelled';
}

export function clientReturnStatusBadgeClass(status: MockClientReturnStatus): string {
  if (status === 'pending_leader') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  if (status === 'posted') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export function isPostedClientReturn(row: MockClientReturn): boolean {
  return row.status === 'posted';
}

export function formatClientReturnReason(reason: string): string {
  const option = CLIENT_RETURN_REASON_OPTIONS.find((o) => o.value === reason);
  if (option && option.value !== 'other') return option.label;
  if (reason === 'other') return 'Other';
  return reason;
}

/** Dummy preview URL for mock proof photos. */
export function getMockProofPhotoUrl(fileName: string): string {
  const seed = fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'proof';
  return `https://picsum.photos/seed/${seed}/800/600`;
}

export function getMockReturnedQtyForName(variantName: string): number {
  const needle = variantName.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.filter(isPostedClientReturn).reduce((sum, cr) => {
    return (
      sum +
      cr.lines
        .filter((line) => line.variantName.trim().toLowerCase() === needle)
        .reduce((lineSum, line) => lineSum + line.quantity, 0)
    );
  }, 0);
}

export type MockReturnedStock = {
  qty: number;
  returns: MockClientReturn[];
};

function addMockReturnedStock(
  map: Map<string, MockReturnedStock>,
  variantId: string,
  qty: number,
  cr: MockClientReturn
) {
  const current = map.get(variantId) || { qty: 0, returns: [] };
  current.qty += qty;
  if (!current.returns.some((row) => row.id === cr.id)) {
    current.returns.push(cr);
  }
  map.set(variantId, current);
}

/** Map catalog variants → returned qty and the CRs that make up that qty. */
export function buildMockReturnedStockByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, MockReturnedStock> {
  const map = new Map<string, MockReturnedStock>();
  if (variants.length === 0) return map;

  const catalogByName = new Map<string, string>();
  for (const variant of variants) {
    catalogByName.set(variant.name.trim().toLowerCase(), variant.id);
  }

  for (const cr of MOCK_CLIENT_RETURNS) {
    if (!isPostedClientReturn(cr)) continue;
    for (const line of cr.lines) {
      const id = catalogByName.get(line.variantName.trim().toLowerCase());
      if (id) addMockReturnedStock(map, id, line.quantity, cr);
    }
  }

  return map;
}

/** Map catalog variants → returned qty. */
export function buildMockReturnedQtyByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, number> {
  const qtyMap = new Map<string, number>();
  for (const [id, stock] of buildMockReturnedStockByVariantId(variants)) {
    qtyMap.set(id, stock.qty);
  }
  return qtyMap;
}

export function getMockReturnsForVariant(variantName: string): MockClientReturn[] {
  const needle = variantName.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.filter(
    (cr) =>
      isPostedClientReturn(cr) && cr.lines.some((line) => line.variantName.trim().toLowerCase() === needle)
  );
}

export function getMockReturnLineQty(row: MockClientReturn): number {
  return row.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function getMockReturnsForOrder(orderNumber: string): MockClientReturn[] {
  const needle = orderNumber.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.filter((cr) => cr.orderNumber.trim().toLowerCase() === needle);
}

export function getMockAlreadyReturnedQty(orderNumber: string, variantName: string): number {
  const orderNeedle = orderNumber.trim().toLowerCase();
  const variantNeedle = variantName.trim().toLowerCase();
  return MOCK_CLIENT_RETURNS.filter(
    (cr) => isPostedClientReturn(cr) && cr.orderNumber.trim().toLowerCase() === orderNeedle
  ).reduce(
    (sum, cr) =>
      sum +
      cr.lines
        .filter((line) => line.variantName.trim().toLowerCase() === variantNeedle)
        .reduce((lineSum, line) => lineSum + line.quantity, 0),
    0
  );
}

export type MockChangeItemSku = {
  id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  sellableQty: number;
};

/** Dummy sellable SKUs for the change-item step, scoped to brands on the order. */
export function buildMockChangeItemCatalog(
  orderItems: Array<{ brandName: string; variantName: string; variantType?: string }>
): MockChangeItemSku[] {
  const byBrand = new Map<string, MockChangeItemSku[]>();

  for (const item of orderItems) {
    const brand = item.brandName?.trim() || 'Unknown';
    const list = byBrand.get(brand) || [];
    const already = list.some(
      (sku) => sku.variantName.trim().toLowerCase() === item.variantName.trim().toLowerCase()
    );
    if (!already) {
      list.push({
        id: `chg-${brand}-${item.variantName}`.toLowerCase().replace(/\s+/g, '-'),
        brandName: brand,
        variantName: item.variantName,
        variantType: item.variantType || 'flavor',
        sellableQty: 6,
      });
    }
    byBrand.set(brand, list);
  }

  return Array.from(byBrand.values()).flat();
}
