export type PurchaseOrderHistoryLine = {
  variantId: string;
  variantName: string;
  brandName?: string;
  quantity: number;
  reason?: string;
};

export type PurchaseOrderHistoryEventType =
  | 'created'
  | 'approved'
  | 'rejected'
  | 'dispatched'
  | 'receive_confirmed'
  | 'cancelled'
  | 'shortage_opened'
  | 'shortage_resolved_redeliver'
  | 'shortage_resolved_write_off_replace'
  | 'shortage_resolved_write_off';

export type PurchaseOrderHistoryEvent = {
  id: string;
  type: PurchaseOrderHistoryEventType;
  at: string;
  note?: string;
  byName?: string;
  lines?: PurchaseOrderHistoryLine[];
  shortQuantity?: number;
  proofImageDataUrl?: string;
  signatureDataUrl?: string;
  deliveryId?: string;
  discrepancyId?: string;
  /** Dispatched DR still awaiting buyer receive. */
  awaitingReceive?: boolean;
  /** Source warehouse location for this delivery (dispatch / receive / cancel). */
  warehouseLocationName?: string;
};

export type PurchaseOrderHistoryItem = {
  variantId: string;
  variantName: string;
  brandName?: string;
  orderedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
};

export type PurchaseOrderHistoryPayload = {
  purchaseOrderId: string;
  poNumber: string;
  status: string;
  workflowStatus?: string | null;
  notes?: string | null;
  createdAt: string;
  items: PurchaseOrderHistoryItem[];
  history: PurchaseOrderHistoryEvent[];
};

export const PURCHASE_ORDER_HISTORY_EVENT_TYPES: PurchaseOrderHistoryEventType[] = [
  'created',
  'approved',
  'rejected',
  'dispatched',
  'receive_confirmed',
  'cancelled',
  'shortage_opened',
  'shortage_resolved_redeliver',
  'shortage_resolved_write_off_replace',
  'shortage_resolved_write_off',
];

export function isPurchaseOrderHistoryEventType(
  value: string
): value is PurchaseOrderHistoryEventType {
  return (PURCHASE_ORDER_HISTORY_EVENT_TYPES as string[]).includes(value);
}

/** Causal order for same-delivery / same-second events (receive before shortage). */
const PURCHASE_ORDER_HISTORY_EVENT_SEQUENCE: Record<PurchaseOrderHistoryEventType, number> = {
  created: 10,
  approved: 20,
  rejected: 20,
  dispatched: 30,
  cancelled: 35,
  receive_confirmed: 40,
  shortage_opened: 50,
  shortage_resolved_redeliver: 60,
  shortage_resolved_write_off_replace: 60,
  shortage_resolved_write_off: 60,
};

const SAME_DELIVERY_SEQUENCE_WINDOW_MS = 60_000;

/**
 * Sort PO history. Use `desc` for newest-first timelines.
 * When times match (or are close on the same DR), receive is always before under-investigation.
 */
export function comparePurchaseOrderHistoryEvents(
  a: PurchaseOrderHistoryEvent,
  b: PurchaseOrderHistoryEvent,
  direction: 'asc' | 'desc' = 'asc'
): number {
  const aTime = new Date(a.at).getTime();
  const bTime = new Date(b.at).getTime();
  const dir = direction === 'asc' ? 1 : -1;

  const sameDelivery = Boolean(a.deliveryId && b.deliveryId && a.deliveryId === b.deliveryId);
  const closeInTime =
    Number.isFinite(aTime) &&
    Number.isFinite(bTime) &&
    Math.abs(aTime - bTime) < SAME_DELIVERY_SEQUENCE_WINDOW_MS;

  if (sameDelivery && closeInTime) {
    const seqDiff =
      (PURCHASE_ORDER_HISTORY_EVENT_SEQUENCE[a.type] ?? 0) -
      (PURCHASE_ORDER_HISTORY_EVENT_SEQUENCE[b.type] ?? 0);
    if (seqDiff !== 0) return seqDiff * dir;
  }

  if (aTime !== bTime && Number.isFinite(aTime) && Number.isFinite(bTime)) {
    return (aTime - bTime) * dir;
  }

  const seqDiff =
    (PURCHASE_ORDER_HISTORY_EVENT_SEQUENCE[a.type] ?? 0) -
    (PURCHASE_ORDER_HISTORY_EVENT_SEQUENCE[b.type] ?? 0);
  if (seqDiff !== 0) return seqDiff * dir;

  return String(a.id).localeCompare(String(b.id)) * dir;
}

export function sortPurchaseOrderHistoryEvents(
  history: PurchaseOrderHistoryEvent[],
  direction: 'asc' | 'desc' = 'asc'
): PurchaseOrderHistoryEvent[] {
  return [...history].sort((a, b) => comparePurchaseOrderHistoryEvents(a, b, direction));
}

/**
 * Outstanding units still owed to the buyer vs ordered qty.
 * Ignores write-off & replace trip inflation (dispatched can exceed ordered).
 * Subtracts pure write-offs (no redispatch) so closed losses do not stay as Short.
 */
export function computePurchaseOrderShortQuantity(
  items: PurchaseOrderHistoryItem[],
  history: PurchaseOrderHistoryEvent[] = []
): number {
  const ordered = items.reduce((sum, item) => sum + Math.max(0, item.orderedQuantity), 0);
  const received = items.reduce((sum, item) => sum + Math.max(0, item.receivedQuantity), 0);
  if (received <= 0) return 0;

  const writeOffOnly = history.reduce((sum, event) => {
    if (event.type !== 'shortage_resolved_write_off') return sum;
    const fromLines = (event.lines ?? []).reduce((s, line) => s + Math.max(0, line.quantity), 0);
    const qty = Math.max(0, event.shortQuantity ?? fromLines);
    return sum + qty;
  }, 0);

  return Math.max(0, ordered - received - writeOffOnly);
}
