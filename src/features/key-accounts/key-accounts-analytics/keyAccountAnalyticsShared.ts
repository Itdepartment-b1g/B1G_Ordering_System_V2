import { isRebateDerivedPurchaseOrder } from '../rebates/keyAccountRebateShared';

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Key Account PO workflow statuses counted as pending in product analytics. */
export const KEY_ACCOUNT_PENDING_WORKFLOW_STATUSES = [
  'kam_pending',
  'admin_pending',
  'director_pending',
  'warehouse_reserved',
] as const;

export type KeyAccountProductWorkflowBucket = 'delivered' | 'pending';

/** Product analytics: delivered workflow vs in-flight approval/reservation stages. */
export function getKeyAccountProductWorkflowBucket(
  workflowStatus?: string | null
): KeyAccountProductWorkflowBucket | null {
  const ws = workflowStatus || '';
  if (ws === 'delivered') return 'delivered';
  if ((KEY_ACCOUNT_PENDING_WORKFLOW_STATUSES as readonly string[]).includes(ws)) {
    return 'pending';
  }
  return null;
}

export function isKeyAccountPartialDeliveredOrder(order: {
  workflow_status?: string | null;
}): boolean {
  return order.workflow_status === 'partial_delivered';
}

/**
 * Commercial POs for analytics. Rebate settlement POs with zero amount due are excluded
 * (disputed credit covers the replacement). Rebate POs with additional client payment are included.
 */
export function isKeyAccountAnalyticsEligibleOrder(
  order: Parameters<typeof isRebateDerivedPurchaseOrder>[0] & {
    total_amount?: number | null;
  }
): boolean {
  if (!isRebateDerivedPurchaseOrder(order)) return true;
  return (Number(order.total_amount) || 0) > 0;
}

/** Rebate replacement POs store full line prices but only the amount due is new revenue. */
export function isRebateFulfillmentReplacementOrder(order: {
  po_order_kind?: string | null;
}): boolean {
  return String(order.po_order_kind || '') === 'rebate_fulfillment';
}

/** Map a line's catalog revenue to analytics revenue (handles rebate replacement pro-rating). */
export function getKeyAccountProductLineAnalyticsRevenue(
  order: Parameters<typeof isRebateDerivedPurchaseOrder>[0] & {
    total_amount?: number | null;
    subtotal?: number | null;
  },
  lineRevenue: number,
  poLinesSubtotal: number
): number {
  if (!isRebateDerivedPurchaseOrder(order)) return lineRevenue;

  const additionalPayment = Number(order.total_amount) || 0;
  if (additionalPayment <= 0) return 0;

  // Top-up POs bill only the difference — line totals are already the payable amount.
  if (!isRebateFulfillmentReplacementOrder(order)) return lineRevenue;

  const replacementSubtotal =
    poLinesSubtotal > 0 ? poLinesSubtotal : Number(order.subtotal) || lineRevenue;
  if (replacementSubtotal <= 0) return 0;

  return (lineRevenue / replacementSubtotal) * additionalPayment;
}

export function isKeyAccountProductAnalyticsOrder(order: {
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  total_amount?: number | null;
}): boolean {
  if (!isKeyAccountAnalyticsEligibleOrder(order)) return false;
  return (
    getKeyAccountProductWorkflowBucket(order.workflow_status) !== null ||
    isKeyAccountPartialDeliveredOrder(order)
  );
}

/** Rebates that reduce source PO analytics revenue (pending approval through executed). */
export const KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES = [
  'submitted',
  'approved',
  'executed',
] as const;

export interface KeyAccountRebateAnalyticsLine {
  purchase_order_item_id: string;
  line_total: number | null;
}

export interface KeyAccountRebateAnalyticsRecord {
  id: string;
  purchase_order_id: string;
  resolution_type: string;
  status: string;
  credit_amount: number | null;
  disputed_total: number | null;
  lines?: KeyAccountRebateAnalyticsLine[] | KeyAccountRebateAnalyticsLine[][] | null;
}

function normalizeRebateAnalyticsLines(
  lines: KeyAccountRebateAnalyticsRecord['lines']
): KeyAccountRebateAnalyticsLine[] {
  if (!lines) return [];
  if (Array.isArray(lines) && lines.length > 0 && Array.isArray(lines[0])) {
    return (lines as KeyAccountRebateAnalyticsLine[][]).flat();
  }
  return lines as KeyAccountRebateAnalyticsLine[];
}

/**
 * Credit to subtract from a source PO line in product analytics.
 * Replacement-only rebates return 0 — same-value item swaps do not reduce revenue.
 */
export function getRebateLineCreditDeduction(
  rebate: Pick<KeyAccountRebateAnalyticsRecord, 'resolution_type' | 'credit_amount' | 'disputed_total'>,
  lineTotal: number
): number {
  const resolution = String(rebate.resolution_type || '');
  if (resolution === 'replacement') return 0;

  const line = Math.max(0, Number(lineTotal) || 0);
  if (line <= 0) return 0;

  if (resolution === 'credit') return line;

  if (resolution === 'mixed') {
    const disputed = Math.max(0, Number(rebate.disputed_total) || 0);
    const credit = Math.max(0, Number(rebate.credit_amount) || 0);
    if (disputed <= 0 || credit <= 0) return 0;
    return line * (credit / disputed);
  }

  return 0;
}

/** PO-level credit rebates (sum of line deductions) — for agent/client revenue. */
export function buildRebateCreditDeductionByPurchaseOrderId(
  rebates: KeyAccountRebateAnalyticsRecord[]
): Map<string, number> {
  const map = new Map<string, number>();
  const activeStatuses = new Set<string>(KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES);

  rebates.forEach((rebate) => {
    if (!activeStatuses.has(String(rebate.status || ''))) return;
    const poId = rebate.purchase_order_id;
    if (!poId) return;

    normalizeRebateAnalyticsLines(rebate.lines).forEach((line) => {
      const deduction = getRebateLineCreditDeduction(rebate, Number(line.line_total) || 0);
      if (deduction <= 0) return;
      map.set(poId, (map.get(poId) || 0) + deduction);
    });
  });

  return map;
}

export function getKeyAccountOrderRevenueBreakdown(
  purchaseOrderId: string,
  totalAmount: number | null | undefined,
  rebateCreditByPurchaseOrderId: Map<string, number>
): { gross: number; rebated: number; net: number } {
  const gross = Math.max(0, Number(totalAmount) || 0);
  const rebated = Math.min(rebateCreditByPurchaseOrderId.get(purchaseOrderId) || 0, gross);
  return { gross, rebated, net: gross - rebated };
}

export function buildRebateDeductionByPoItemId(
  rebates: KeyAccountRebateAnalyticsRecord[]
): Map<string, number> {
  const map = new Map<string, number>();
  const activeStatuses = new Set<string>(KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES);

  rebates.forEach((rebate) => {
    if (!activeStatuses.has(String(rebate.status || ''))) return;

    normalizeRebateAnalyticsLines(rebate.lines).forEach((line) => {
      const itemId = line.purchase_order_item_id;
      if (!itemId) return;
      const deduction = getRebateLineCreditDeduction(rebate, Number(line.line_total) || 0);
      if (deduction <= 0) return;
      map.set(itemId, (map.get(itemId) || 0) + deduction);
    });
  });

  return map;
}

/** Split a line-level rebate deduction across delivered vs pending revenue buckets. */
export function allocateRebateDeductionAcrossSplit(
  split: KeyAccountLineItemSplit,
  deduction: number
): { delivered: number; pending: number } {
  const gross = split.deliveredRevenue + split.pendingRevenue;
  const clamped = Math.min(Math.max(0, deduction), gross);
  if (clamped <= 0) return { delivered: 0, pending: 0 };
  if (gross <= 0) return { delivered: clamped, pending: 0 };

  const delivered = clamped * (split.deliveredRevenue / gross);
  return { delivered, pending: clamped - delivered };
}

export interface KeyAccountLineItemSplit {
  deliveredQuantity: number;
  pendingQuantity: number;
  deliveredRevenue: number;
  pendingRevenue: number;
  deliveredLineItems: number;
  pendingLineItems: number;
}

export function warehouseTransferReservationKey(
  purchaseOrderId: string,
  warehouseLocationId: string | null | undefined,
  variantId: string
): string {
  return `${purchaseOrderId}|${warehouseLocationId || ''}|${variantId}`;
}

export function warehouseTransferLocationStatusKey(
  purchaseOrderId: string,
  warehouseLocationId: string | null | undefined
): string {
  return `${purchaseOrderId}|${warehouseLocationId || ''}`;
}

/** Split a PO line into delivered vs pending for product analytics. */
export function splitKeyAccountProductLineItem(input: {
  workflowStatus?: string | null;
  itemQuantity: number;
  lineRevenue: number;
  variantId: string;
  warehouseLocationId?: string | null;
  orderWarehouseLocationId?: string | null;
  purchaseOrderId: string;
  reservationByKey: Map<string, { quantity_fulfilled: number; quantity_reserved: number }>;
  locationStatusByKey: Map<string, string>;
}): KeyAccountLineItemSplit | null {
  const workflowStatus = input.workflowStatus || '';
  const quantity = Math.max(0, input.itemQuantity);
  const lineRevenue = Math.max(0, input.lineRevenue);

  if (quantity === 0 && lineRevenue === 0) {
    return {
      deliveredQuantity: 0,
      pendingQuantity: 0,
      deliveredRevenue: 0,
      pendingRevenue: 0,
      deliveredLineItems: 0,
      pendingLineItems: 0,
    };
  }

  const bucket = getKeyAccountProductWorkflowBucket(workflowStatus);
  if (bucket === 'delivered') {
    return {
      deliveredQuantity: quantity,
      pendingQuantity: 0,
      deliveredRevenue: lineRevenue,
      pendingRevenue: 0,
      deliveredLineItems: 1,
      pendingLineItems: 0,
    };
  }
  if (bucket === 'pending') {
    return {
      deliveredQuantity: 0,
      pendingQuantity: quantity,
      deliveredRevenue: 0,
      pendingRevenue: lineRevenue,
      deliveredLineItems: 0,
      pendingLineItems: 1,
    };
  }

  if (!isKeyAccountPartialDeliveredOrder({ workflow_status: workflowStatus })) {
    return null;
  }

  const locationId = input.warehouseLocationId || input.orderWarehouseLocationId || '';
  const reservationKey = warehouseTransferReservationKey(
    input.purchaseOrderId,
    locationId,
    input.variantId
  );
  const reservation = input.reservationByKey.get(reservationKey);
  const unitRevenue = quantity > 0 ? lineRevenue / quantity : 0;

  if (reservation) {
    const fulfilledQuantity = Math.min(
      quantity,
      Math.max(0, Number(reservation.quantity_fulfilled) || 0)
    );
    const pendingQuantity = Math.max(0, quantity - fulfilledQuantity);
    return {
      deliveredQuantity: fulfilledQuantity,
      pendingQuantity,
      deliveredRevenue: unitRevenue * fulfilledQuantity,
      pendingRevenue: unitRevenue * pendingQuantity,
      deliveredLineItems: fulfilledQuantity > 0 ? 1 : 0,
      pendingLineItems: pendingQuantity > 0 ? 1 : 0,
    };
  }

  const locationKey = warehouseTransferLocationStatusKey(input.purchaseOrderId, locationId);
  const locationStatus = String(input.locationStatusByKey.get(locationKey) || '').toLowerCase();
  const isLocationFulfilled = locationStatus === 'fulfilled';

  if (isLocationFulfilled) {
    return {
      deliveredQuantity: quantity,
      pendingQuantity: 0,
      deliveredRevenue: lineRevenue,
      pendingRevenue: 0,
      deliveredLineItems: 1,
      pendingLineItems: 0,
    };
  }

  return {
    deliveredQuantity: 0,
    pendingQuantity: quantity,
    deliveredRevenue: 0,
    pendingRevenue: lineRevenue,
    deliveredLineItems: 0,
    pendingLineItems: 1,
  };
}

/** Same definition as legacy delivered revenue on other Key Account analytics tabs. */
export function isDeliveredKeyAccountOrder(order: {
  status?: string | null;
  workflow_status?: string | null;
}): boolean {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}

/** POs in kam/admin/director pending or warehouse_reserved — matches product analytics. */
export function isKeyAccountPendingWorkflowOrder(order: {
  workflow_status?: string | null;
}): boolean {
  return getKeyAccountProductWorkflowBucket(order.workflow_status) === 'pending';
}

export interface KeyAccountProductLineItemInput {
  id: string;
  purchase_order_id: string;
  variant_id: string;
  warehouse_location_id?: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
}

export interface KeyAccountOrderRevenueSplitContext {
  poLineSubtotalByOrderId: Map<string, number>;
  rebateDeductionByPoItemId: Map<string, number>;
  reservationByKey: Map<string, { quantity_fulfilled: number; quantity_reserved: number }>;
  locationStatusByKey: Map<string, string>;
}

export interface KeyAccountOrderRevenueSplitTotals {
  grossDelivered: number;
  grossPending: number;
  rebatedDelivered: number;
  rebatedPending: number;
}

const EMPTY_REVENUE_SPLIT: KeyAccountOrderRevenueSplitTotals = {
  grossDelivered: 0,
  grossPending: 0,
  rebatedDelivered: 0,
  rebatedPending: 0,
};

/** Split one PO into delivered vs pending revenue buckets (same rules as product analytics). */
export function sumKeyAccountOrderRevenueSplit(
  order: Parameters<typeof isKeyAccountProductAnalyticsOrder>[0] & {
    id: string;
    warehouse_location_id?: string | null;
    subtotal?: number | null;
    total_amount?: number | null;
  },
  orderItems: KeyAccountProductLineItemInput[],
  context: KeyAccountOrderRevenueSplitContext,
  rebateCreditByPurchaseOrderId: Map<string, number> = new Map()
): KeyAccountOrderRevenueSplitTotals | null {
  if (!isKeyAccountProductAnalyticsOrder(order)) return null;

  const relevantItems = orderItems.filter((item) => item.purchase_order_id === order.id);
  if (relevantItems.length === 0) {
    const breakdown = getKeyAccountOrderRevenueBreakdown(
      order.id,
      order.total_amount,
      rebateCreditByPurchaseOrderId
    );
    const bucket = getKeyAccountProductWorkflowBucket(order.workflow_status);
    if (bucket === 'delivered') {
      return {
        grossDelivered: breakdown.gross,
        grossPending: 0,
        rebatedDelivered: breakdown.rebated,
        rebatedPending: 0,
      };
    }
    if (bucket === 'pending') {
      return {
        grossDelivered: 0,
        grossPending: breakdown.gross,
        rebatedDelivered: 0,
        rebatedPending: breakdown.rebated,
      };
    }
    if (isKeyAccountPartialDeliveredOrder(order)) {
      return {
        grossDelivered: 0,
        grossPending: breakdown.gross,
        rebatedDelivered: 0,
        rebatedPending: breakdown.rebated,
      };
    }
    return EMPTY_REVENUE_SPLIT;
  }

  const totals: KeyAccountOrderRevenueSplitTotals = { ...EMPTY_REVENUE_SPLIT };
  const poSubtotal = context.poLineSubtotalByOrderId.get(order.id) || 0;

  relevantItems.forEach((item) => {
    const rawLineRevenue = Number(
      item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0)
    );
    const lineRevenue = getKeyAccountProductLineAnalyticsRevenue(order, rawLineRevenue, poSubtotal);
    const split = splitKeyAccountProductLineItem({
      workflowStatus: order.workflow_status,
      itemQuantity: Number(item.quantity || 0),
      lineRevenue,
      variantId: item.variant_id,
      warehouseLocationId: item.warehouse_location_id,
      orderWarehouseLocationId: order.warehouse_location_id,
      purchaseOrderId: order.id,
      reservationByKey: context.reservationByKey,
      locationStatusByKey: context.locationStatusByKey,
    });
    if (!split) return;

    const lineRebateDeduction = Math.min(
      context.rebateDeductionByPoItemId.get(item.id) || 0,
      split.deliveredRevenue + split.pendingRevenue
    );
    const rebateAllocation = allocateRebateDeductionAcrossSplit(split, lineRebateDeduction);

    totals.grossDelivered += split.deliveredRevenue;
    totals.grossPending += split.pendingRevenue;
    totals.rebatedDelivered += rebateAllocation.delivered;
    totals.rebatedPending += rebateAllocation.pending;
  });

  return totals;
}

export interface KeyAccountOrderPoLineCounts {
  deliveredPoLines: number;
  pendingPoLines: number;
}

/** Delivered vs pending PO line counts (product analytics Pending PO column rules). */
export function sumKeyAccountOrderPoLineCounts(
  order: Parameters<typeof isKeyAccountProductAnalyticsOrder>[0] & {
    id: string;
    warehouse_location_id?: string | null;
    subtotal?: number | null;
    total_amount?: number | null;
  },
  orderItems: KeyAccountProductLineItemInput[],
  context: KeyAccountOrderRevenueSplitContext
): KeyAccountOrderPoLineCounts | null {
  if (!isKeyAccountProductAnalyticsOrder(order)) return null;

  const relevantItems = orderItems.filter((item) => item.purchase_order_id === order.id);
  if (relevantItems.length === 0) {
    const bucket = getKeyAccountProductWorkflowBucket(order.workflow_status);
    if (bucket === 'delivered') return { deliveredPoLines: 1, pendingPoLines: 0 };
    if (bucket === 'pending' || isKeyAccountPartialDeliveredOrder(order)) {
      return { deliveredPoLines: 0, pendingPoLines: 1 };
    }
    return { deliveredPoLines: 0, pendingPoLines: 0 };
  }

  const totals: KeyAccountOrderPoLineCounts = { deliveredPoLines: 0, pendingPoLines: 0 };
  const poSubtotal = context.poLineSubtotalByOrderId.get(order.id) || 0;

  relevantItems.forEach((item) => {
    const rawLineRevenue = Number(
      item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0)
    );
    const lineRevenue = getKeyAccountProductLineAnalyticsRevenue(order, rawLineRevenue, poSubtotal);
    const split = splitKeyAccountProductLineItem({
      workflowStatus: order.workflow_status,
      itemQuantity: Number(item.quantity || 0),
      lineRevenue,
      variantId: item.variant_id,
      warehouseLocationId: item.warehouse_location_id,
      orderWarehouseLocationId: order.warehouse_location_id,
      purchaseOrderId: order.id,
      reservationByKey: context.reservationByKey,
      locationStatusByKey: context.locationStatusByKey,
    });
    if (!split) return;
    totals.deliveredPoLines += split.deliveredLineItems;
    totals.pendingPoLines += split.pendingLineItems;
  });

  return totals;
}
