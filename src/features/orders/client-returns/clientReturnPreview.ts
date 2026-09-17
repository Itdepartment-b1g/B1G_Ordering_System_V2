/**
 * Client-order return preview types and display helpers.
 * Persistence goes through RPCs in clientReturnApi.ts.
 */
export const SHOW_CLIENT_RETURN_PREVIEW = true;

export const CLIENT_RETURN_REASON_OPTIONS = [
  { value: 'defect', label: 'Defect' },
  { value: 'duplicate_order', label: 'Duplicate order' },
  { value: 'missing_parts', label: 'Missing parts' },
  { value: 'other', label: 'Other' },
] as const;

export type ClientReturnReasonOption = (typeof CLIENT_RETURN_REASON_OPTIONS)[number]['value'];

export type ClientReturnProofPhoto = {
  fileName: string;
  url: string;
  path: string;
};

export type PreviewClientReturnLine = {
  variantName: string;
  brandName: string;
  variantType: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  variantId?: string;
  brandId?: string;
  variantTypeId?: string;
  clientOrderItemId?: string;
};

export type ClientReturnKind = 'change_item' | 'refund';

export type PreviewClientReturnStatus =
  | 'pending_leader'
  | 'pending_super_admin'
  | 'pending_finance'
  | 'posted'
  | 'rejected'
  | 'cancelled';

export type PreviewClientReturn = {
  id: string;
  returnNumber: string;
  clientOrderId?: string;
  orderNumber: string;
  clientName: string;
  returnedByName: string;
  returnDate: string;
  createdAt: string;
  reason: string;
  notes: string | null;
  returnType: ClientReturnKind;
  lines: PreviewClientReturnLine[];
  changeLines?: PreviewClientReturnLine[];
  proofLabels: string[];
  proofPhotos?: ClientReturnProofPhoto[];
  status: PreviewClientReturnStatus;
  rejectionNote: string | null;
  saApprovedByName: string | null;
  saApprovedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  originalAgentId?: string | null;
  returnedBy?: string | null;
};

export const PREVIEW_CLIENT_RETURNS: PreviewClientReturn[] = [];

export function getReturnActionActor(row: PreviewClientReturn): {
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

export function parseClientReturnType(value: unknown): ClientReturnKind {
  return String(value || '').toLowerCase() === 'refund' ? 'refund' : 'change_item';
}

export function parseClientReturnStatus(value: unknown): PreviewClientReturnStatus {
  const raw = String(value || '');
  if (
    raw === 'pending_leader' ||
    raw === 'pending_super_admin' ||
    raw === 'pending_finance' ||
    raw === 'posted' ||
    raw === 'rejected' ||
    raw === 'cancelled'
  ) {
    return raw;
  }
  return 'pending_leader';
}

export function formatClientReturnType(type: ClientReturnKind): string {
  return type === 'refund' ? 'Refund' : 'Change item';
}

export function clientReturnTypeBadgeClass(type: ClientReturnKind): string {
  if (type === 'refund') return 'bg-violet-50 text-violet-700 border-violet-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
}

export function formatClientReturnStatus(status: PreviewClientReturnStatus): string {
  if (status === 'pending_leader') return 'Pending TL';
  if (status === 'pending_super_admin') return 'Pending SA';
  if (status === 'pending_finance') return 'Pending Finance';
  if (status === 'posted') return 'Approve';
  if (status === 'rejected') return 'Reject';
  return 'Cancelled';
}

export function clientReturnStatusBadgeClass(status: PreviewClientReturnStatus): string {
  if (
    status === 'pending_leader' ||
    status === 'pending_super_admin' ||
    status === 'pending_finance'
  ) {
    return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  }
  if (status === 'posted') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export function canReviewClientReturn(
  role: string | null | undefined,
  row: Pick<PreviewClientReturn, 'returnType' | 'status'>
): boolean {
  if (row.returnType === 'change_item' && row.status === 'pending_leader') {
    return role === 'team_leader';
  }
  if (row.returnType === 'refund' && row.status === 'pending_super_admin') {
    return role === 'super_admin';
  }
  if (row.returnType === 'refund' && row.status === 'pending_finance') {
    return role === 'finance';
  }
  return false;
}

export function formatClientReturnPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function getClientReturnRefundAmount(row: PreviewClientReturn): number {
  return row.lines.reduce((sum, line) => {
    const lineTotal = Number(line.lineTotal);
    if (Number.isFinite(lineTotal) && lineTotal > 0) return sum + lineTotal;
    return sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  }, 0);
}

export function isPostedClientReturn(row: PreviewClientReturn): boolean {
  return row.status === 'posted';
}

export function formatClientReturnReason(reason: string): string {
  const option = CLIENT_RETURN_REASON_OPTIONS.find((o) => o.value === reason);
  if (option && option.value !== 'other') return option.label;
  if (reason === 'other') return 'Other';
  return reason;
}

/** Dummy preview URL for proof photos. */
export function getPreviewProofPhotoUrl(fileName: string): string {
  const seed = fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'proof';
  return `https://picsum.photos/seed/${seed}/800/600`;
}

export function getPreviewReturnedQtyForName(variantName: string): number {
  const needle = variantName.trim().toLowerCase();
  return PREVIEW_CLIENT_RETURNS.filter(isPostedClientReturn).reduce((sum, cr) => {
    return (
      sum +
      cr.lines
        .filter((line) => line.variantName.trim().toLowerCase() === needle)
        .reduce((lineSum, line) => lineSum + line.quantity, 0)
    );
  }, 0);
}

export type PreviewReturnedStock = {
  qty: number;
  returns: PreviewClientReturn[];
};

function addPreviewReturnedStock(
  map: Map<string, PreviewReturnedStock>,
  variantId: string,
  qty: number,
  cr: PreviewClientReturn
) {
  const current = map.get(variantId) || { qty: 0, returns: [] };
  current.qty += qty;
  if (!current.returns.some((row) => row.id === cr.id)) {
    current.returns.push(cr);
  }
  map.set(variantId, current);
}

/** Map catalog variants → returned qty and the CRs that make up that qty. */
export function buildPreviewReturnedStockByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, PreviewReturnedStock> {
  const map = new Map<string, PreviewReturnedStock>();
  if (variants.length === 0) return map;

  const catalogByName = new Map<string, string>();
  for (const variant of variants) {
    catalogByName.set(variant.name.trim().toLowerCase(), variant.id);
  }

  for (const cr of PREVIEW_CLIENT_RETURNS) {
    if (!isPostedClientReturn(cr)) continue;
    for (const line of cr.lines) {
      const id = catalogByName.get(line.variantName.trim().toLowerCase());
      if (id) addPreviewReturnedStock(map, id, line.quantity, cr);
    }
  }

  return map;
}

/** Map catalog variants → returned qty. */
export function buildPreviewReturnedQtyByVariantId(
  variants: Array<{ id: string; name: string }>
): Map<string, number> {
  const qtyMap = new Map<string, number>();
  for (const [id, stock] of buildPreviewReturnedStockByVariantId(variants)) {
    qtyMap.set(id, stock.qty);
  }
  return qtyMap;
}

export function getPreviewReturnsForVariant(variantName: string): PreviewClientReturn[] {
  const needle = variantName.trim().toLowerCase();
  return PREVIEW_CLIENT_RETURNS.filter(
    (cr) =>
      isPostedClientReturn(cr) && cr.lines.some((line) => line.variantName.trim().toLowerCase() === needle)
  );
}

export function getPreviewReturnLineQty(row: PreviewClientReturn): number {
  return row.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function getPreviewReturnsForOrder(orderNumber: string): PreviewClientReturn[] {
  const needle = orderNumber.trim().toLowerCase();
  return PREVIEW_CLIENT_RETURNS.filter((cr) => cr.orderNumber.trim().toLowerCase() === needle);
}

export function getPreviewAlreadyReturnedQty(orderNumber: string, variantName: string): number {
  const orderNeedle = orderNumber.trim().toLowerCase();
  const variantNeedle = variantName.trim().toLowerCase();
  return PREVIEW_CLIENT_RETURNS.filter(
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

export type PreviewChangeItemSku = {
  id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  sellableQty: number;
  brandId?: string;
  variantTypeId?: string;
};

/** Dummy sellable SKUs for the change-item step, scoped to brands on the order. */
export function buildPreviewChangeItemCatalog(
  orderItems: Array<{ brandName: string; variantName: string; variantType?: string }>
): PreviewChangeItemSku[] {
  const byBrand = new Map<string, PreviewChangeItemSku[]>();

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
