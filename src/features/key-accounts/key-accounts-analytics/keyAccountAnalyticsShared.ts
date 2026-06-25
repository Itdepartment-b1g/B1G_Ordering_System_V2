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
  // `fulfilled` = warehouse dispatched; count as delivered revenue (matches PO Done tab).
  if (ws === 'delivered' || ws === 'fulfilled') return 'delivered';
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

/** Commercial (non–rebate-derived) POs for product analytics line items. */
export function isKeyAccountCommercialProductAnalyticsOrder(
  order: Parameters<typeof isKeyAccountProductAnalyticsOrder>[0]
): boolean {
  return isKeyAccountProductAnalyticsOrder(order) && !isRebateDerivedPurchaseOrder(order);
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
  disputed_quantity?: number | null;
}

export interface KeyAccountRebateReplacementAnalytics {
  variant_id: string;
  warehouse_location_id: string;
  quantity: number;
  total_price: number | null;
  variants?: {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  } | {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  }[] | null;
}

export interface KeyAccountRebateAnalyticsRecord {
  id: string;
  purchase_order_id: string;
  resolution_type: string;
  status: string;
  credit_amount: number | null;
  disputed_total: number | null;
  fulfillment_purchase_order_id?: string | null;
  lines?: KeyAccountRebateAnalyticsLine[] | KeyAccountRebateAnalyticsLine[][] | null;
  replacements?:
    | KeyAccountRebateReplacementAnalytics[]
    | KeyAccountRebateReplacementAnalytics[][]
    | null;
}

export interface KeyAccountRebateSwapOnPoItem {
  disputedQuantity: number;
  disputedRevenue: number;
}

export interface KeyAccountProductAnalyticsOrderRef {
  id: string;
  workflow_status?: string | null;
  warehouse_location_id?: string | null;
  key_account_client_id?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  total_amount?: number | null;
  subtotal?: number | null;
}

export interface KeyAccountProductAnalyticsItemRef {
  id: string;
  purchase_order_id: string;
  variant_id: string;
  warehouse_location_id?: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  variants?: KeyAccountRebateReplacementAnalytics['variants'];
}

export interface KeyAccountProductAnalyticsRow {
  key: string;
  brand: string;
  variant: string;
  quantity: number;
  grossRevenue: number;
  rebatedRevenue: number;
  revenue: number;
  deliveredOrders: number;
  deliveredQuantity: number;
  grossDeliveredRevenue: number;
  grossPendingRevenue: number;
  rebatedDeliveredRevenue: number;
  rebatedPendingRevenue: number;
  deliveredRevenue: number;
  pendingOrders: number;
  pendingQuantity: number;
  pendingRevenue: number;
  orderCount: number;
  clientCount: number;
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

export function normalizeRebateReplacements(
  replacements: KeyAccountRebateAnalyticsRecord['replacements']
): KeyAccountRebateReplacementAnalytics[] {
  if (!replacements) return [];
  if (Array.isArray(replacements) && replacements.length > 0 && Array.isArray(replacements[0])) {
    return (replacements as KeyAccountRebateReplacementAnalytics[][]).flat();
  }
  return replacements as KeyAccountRebateReplacementAnalytics[];
}

/** Rebate resolutions that swap disputed source lines for replacement SKUs in product analytics. */
export function rebateResolutionHasReplacement(resolutionType?: string | null): boolean {
  const resolution = String(resolutionType || '');
  return resolution === 'replacement' || resolution === 'mixed';
}

/** Disputed qty/revenue to remove from source PO lines when a change-item rebate is active. */
export function buildRebateSwapByPoItemId(
  rebates: KeyAccountRebateAnalyticsRecord[]
): Map<string, KeyAccountRebateSwapOnPoItem> {
  const map = new Map<string, KeyAccountRebateSwapOnPoItem>();
  const activeStatuses = new Set<string>(KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES);

  rebates.forEach((rebate) => {
    if (!activeStatuses.has(String(rebate.status || ''))) return;
    if (!rebateResolutionHasReplacement(rebate.resolution_type)) return;

    normalizeRebateAnalyticsLines(rebate.lines).forEach((line) => {
      const itemId = line.purchase_order_item_id;
      if (!itemId) return;

      const disputedQuantity = Math.max(0, Number(line.disputed_quantity) || 0);
      const disputedRevenue = Math.max(0, Number(line.line_total) || 0);
      if (disputedQuantity <= 0 && disputedRevenue <= 0) return;

      const existing = map.get(itemId) || { disputedQuantity: 0, disputedRevenue: 0 };
      existing.disputedQuantity += disputedQuantity;
      existing.disputedRevenue += disputedRevenue;
      map.set(itemId, existing);
    });
  });

  return map;
}

/** Reduce a line split after disputed qty/revenue moves to a replacement SKU. */
export function reduceSplitByRebateSwap(
  split: KeyAccountLineItemSplit,
  swapQuantity: number,
  swapRevenue: number
): KeyAccountLineItemSplit {
  const totalQty = split.deliveredQuantity + split.pendingQuantity;
  const totalRev = split.deliveredRevenue + split.pendingRevenue;
  const qtyToRemove = Math.min(Math.max(0, swapQuantity), totalQty);
  const revToRemove = Math.min(Math.max(0, swapRevenue), totalRev);

  if (qtyToRemove <= 0 && revToRemove <= 0) return split;

  let deliveredQtyRemove = 0;
  let pendingQtyRemove = 0;
  let deliveredRevRemove = 0;
  let pendingRevRemove = 0;

  if (totalQty > 0 && qtyToRemove > 0) {
    deliveredQtyRemove = qtyToRemove * (split.deliveredQuantity / totalQty);
    pendingQtyRemove = qtyToRemove - deliveredQtyRemove;
  }

  if (totalRev > 0 && revToRemove > 0) {
    deliveredRevRemove = revToRemove * (split.deliveredRevenue / totalRev);
    pendingRevRemove = revToRemove - deliveredRevRemove;
  }

  const deliveredQuantity = Math.max(0, split.deliveredQuantity - deliveredQtyRemove);
  const pendingQuantity = Math.max(0, split.pendingQuantity - pendingQtyRemove);
  const deliveredRevenue = Math.max(0, split.deliveredRevenue - deliveredRevRemove);
  const pendingRevenue = Math.max(0, split.pendingRevenue - pendingRevRemove);

  return {
    deliveredQuantity,
    pendingQuantity,
    deliveredRevenue,
    pendingRevenue,
    deliveredLineItems: deliveredQuantity > 0 ? 1 : 0,
    pendingLineItems: pendingQuantity > 0 ? 1 : 0,
  };
}

const REPLACEMENT_POST_RESERVE_WORKFLOW_STATUSES = new Set([
  'fulfilled',
  'partial_delivered',
  'delivered',
]);

/** Delivered vs pending for replacement SKUs (fulfillment PO or pending until released). */
export function splitReplacementProductLineItem(input: {
  rebateStatus: string;
  itemQuantity: number;
  lineRevenue: number;
  variantId: string;
  warehouseLocationId?: string | null;
  fulfillmentOrder?: KeyAccountProductAnalyticsOrderRef | null;
  purchaseOrderId?: string | null;
  reservationByKey: Map<string, { quantity_fulfilled: number; quantity_reserved: number }>;
  locationStatusByKey: Map<string, string>;
}): KeyAccountLineItemSplit | null {
  const quantity = Math.max(0, input.itemQuantity);
  const lineRevenue = Math.max(0, input.lineRevenue);
  if (quantity <= 0 && lineRevenue <= 0) return null;

  const fulfillmentOrder = input.fulfillmentOrder;
  if (fulfillmentOrder) {
    const split = splitKeyAccountProductLineItem({
      workflowStatus: fulfillmentOrder.workflow_status,
      itemQuantity: quantity,
      lineRevenue,
      variantId: input.variantId,
      warehouseLocationId: input.warehouseLocationId,
      orderWarehouseLocationId: fulfillmentOrder.warehouse_location_id,
      purchaseOrderId: fulfillmentOrder.id,
      reservationByKey: input.reservationByKey,
      locationStatusByKey: input.locationStatusByKey,
    });
    if (split) return split;

    const ws = String(fulfillmentOrder.workflow_status || '');
    if (REPLACEMENT_POST_RESERVE_WORKFLOW_STATUSES.has(ws)) {
      return {
        deliveredQuantity: quantity,
        pendingQuantity: 0,
        deliveredRevenue: lineRevenue,
        pendingRevenue: 0,
        deliveredLineItems: 1,
        pendingLineItems: 0,
      };
    }
  }

  if (new Set<string>(KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES).has(String(input.rebateStatus || ''))) {
    return {
      deliveredQuantity: 0,
      pendingQuantity: quantity,
      deliveredRevenue: 0,
      pendingRevenue: lineRevenue,
      deliveredLineItems: 0,
      pendingLineItems: 1,
    };
  }

  return null;
}

type ProductAnalyticsAccumulator = {
  brand: string;
  variant: string;
  deliveredOrders: number;
  deliveredQuantity: number;
  grossDeliveredRevenue: number;
  grossPendingRevenue: number;
  rebatedDeliveredRevenue: number;
  rebatedPendingRevenue: number;
  pendingOrders: number;
  pendingQuantity: number;
  orderIds: Set<string>;
  clientIds: Set<string>;
};

function accumulateProductAnalyticsContribution(
  productMap: Map<string, ProductAnalyticsAccumulator>,
  brand: string,
  variantName: string,
  split: KeyAccountLineItemSplit,
  rebateAllocation: { delivered: number; pending: number },
  purchaseOrderId: string,
  clientId: string | null | undefined
) {
  const key = `${brand}::${variantName}`;
  const existing = productMap.get(key) || {
    brand,
    variant: variantName,
    deliveredOrders: 0,
    deliveredQuantity: 0,
    grossDeliveredRevenue: 0,
    grossPendingRevenue: 0,
    rebatedDeliveredRevenue: 0,
    rebatedPendingRevenue: 0,
    pendingOrders: 0,
    pendingQuantity: 0,
    orderIds: new Set<string>(),
    clientIds: new Set<string>(),
  };

  existing.deliveredOrders += split.deliveredLineItems;
  existing.deliveredQuantity += split.deliveredQuantity;
  existing.grossDeliveredRevenue += split.deliveredRevenue;
  existing.grossPendingRevenue += split.pendingRevenue;
  existing.rebatedDeliveredRevenue += rebateAllocation.delivered;
  existing.rebatedPendingRevenue += rebateAllocation.pending;
  existing.pendingOrders += split.pendingLineItems;
  existing.pendingQuantity += split.pendingQuantity;
  existing.orderIds.add(purchaseOrderId);
  if (clientId) existing.clientIds.add(clientId);
  productMap.set(key, existing);
}

function finalizeProductAnalyticsRows(
  productMap: Map<string, ProductAnalyticsAccumulator>
): KeyAccountProductAnalyticsRow[] {
  return Array.from(productMap.entries())
    .map(([key, value]) => {
      const quantity = value.deliveredQuantity + value.pendingQuantity;
      const grossDeliveredRevenue = value.grossDeliveredRevenue;
      const grossPendingRevenue = value.grossPendingRevenue;
      const rebatedDeliveredRevenue = value.rebatedDeliveredRevenue;
      const rebatedPendingRevenue = value.rebatedPendingRevenue;
      const grossRevenue = grossDeliveredRevenue + grossPendingRevenue;
      const rebatedRevenue = rebatedDeliveredRevenue + rebatedPendingRevenue;
      const deliveredRevenue = grossDeliveredRevenue - rebatedDeliveredRevenue;
      const pendingRevenue = grossPendingRevenue - rebatedPendingRevenue;
      const revenue = deliveredRevenue + pendingRevenue;
      return {
        key,
        brand: value.brand,
        variant: value.variant,
        quantity,
        grossRevenue,
        rebatedRevenue,
        revenue,
        deliveredOrders: value.deliveredOrders,
        deliveredQuantity: value.deliveredQuantity,
        grossDeliveredRevenue,
        grossPendingRevenue,
        rebatedDeliveredRevenue,
        rebatedPendingRevenue,
        deliveredRevenue,
        pendingOrders: value.pendingOrders,
        pendingQuantity: value.pendingQuantity,
        pendingRevenue,
        orderCount: value.orderIds.size,
        clientCount: value.clientIds.size,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** Build product analytics rows with change-item swaps (source line → replacement SKU). */
export function buildKeyAccountProductAnalyticsRows(input: {
  items: KeyAccountProductAnalyticsItemRef[];
  productAnalyticsOrderById: Map<string, KeyAccountProductAnalyticsOrderRef>;
  orderById: Map<string, KeyAccountProductAnalyticsOrderRef>;
  dateFilteredOrderIds: Set<string>;
  poLineSubtotalByOrderId: Map<string, number>;
  rebateDeductionByPoItemId: Map<string, number>;
  rebateSwapByPoItemId: Map<string, KeyAccountRebateSwapOnPoItem>;
  rebates: KeyAccountRebateAnalyticsRecord[];
  reservationByKey: Map<string, { quantity_fulfilled: number; quantity_reserved: number }>;
  locationStatusByKey: Map<string, string>;
}): KeyAccountProductAnalyticsRow[] {
  const productMap = new Map<string, ProductAnalyticsAccumulator>();
  const activeStatuses = new Set<string>(KEY_ACCOUNT_REBATE_ANALYTICS_STATUSES);

  input.items.forEach((item) => {
    const order = input.productAnalyticsOrderById.get(item.purchase_order_id);
    if (!order) return;
    // Rebate fulfillment PO lines are represented via change-item swap + replacement rows only.
    if (isRebateDerivedPurchaseOrder(order)) return;

    const rawLineRevenue = Number(
      item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0)
    );
    const lineRevenue = getKeyAccountProductLineAnalyticsRevenue(
      order,
      rawLineRevenue,
      input.poLineSubtotalByOrderId.get(item.purchase_order_id) || rawLineRevenue
    );

    const split = splitKeyAccountProductLineItem({
      workflowStatus: order.workflow_status,
      itemQuantity: Number(item.quantity || 0),
      lineRevenue,
      variantId: item.variant_id,
      warehouseLocationId: item.warehouse_location_id,
      orderWarehouseLocationId: order.warehouse_location_id,
      purchaseOrderId: item.purchase_order_id,
      reservationByKey: input.reservationByKey,
      locationStatusByKey: input.locationStatusByKey,
    });
    if (!split) return;

    const swap = input.rebateSwapByPoItemId.get(item.id);
    const adjustedSplit = swap
      ? reduceSplitByRebateSwap(split, swap.disputedQuantity, swap.disputedRevenue)
      : split;

    if (
      adjustedSplit.deliveredQuantity <= 0 &&
      adjustedSplit.pendingQuantity <= 0 &&
      adjustedSplit.deliveredRevenue <= 0 &&
      adjustedSplit.pendingRevenue <= 0
    ) {
      return;
    }

    const lineRebateDeduction = Math.min(
      input.rebateDeductionByPoItemId.get(item.id) || 0,
      split.deliveredRevenue + split.pendingRevenue
    );
    const rebateAllocation = allocateRebateDeductionAcrossSplit(split, lineRebateDeduction);

    const variant = firstRelation(item.variants);
    const brand = firstRelation(variant?.brands)?.name || 'Unknown Brand';
    const variantName = variant?.name || 'Unknown Variant';

    accumulateProductAnalyticsContribution(
      productMap,
      brand,
      variantName,
      adjustedSplit,
      rebateAllocation,
      item.purchase_order_id,
      order.key_account_client_id
    );
  });

  input.rebates.forEach((rebate) => {
    if (!activeStatuses.has(String(rebate.status || ''))) return;
    if (!rebateResolutionHasReplacement(rebate.resolution_type)) return;

    const sourceInScope = input.productAnalyticsOrderById.has(rebate.purchase_order_id);
    const fulfillmentOrder = rebate.fulfillment_purchase_order_id
      ? input.orderById.get(rebate.fulfillment_purchase_order_id) ?? null
      : null;
    const fulfillmentInScope =
      fulfillmentOrder != null &&
      input.dateFilteredOrderIds.has(fulfillmentOrder.id) &&
      isKeyAccountAnalyticsEligibleOrder(fulfillmentOrder);

    if (!sourceInScope && !fulfillmentInScope) return;

    const sourceOrder =
      input.productAnalyticsOrderById.get(rebate.purchase_order_id) ||
      input.orderById.get(rebate.purchase_order_id);
    if (!sourceOrder) return;

    const replacements = normalizeRebateReplacements(rebate.replacements);
    const replacementCatalogTotal = replacements.reduce(
      (sum, replacement) => sum + Math.max(0, Number(replacement.total_price) || 0),
      0
    );
    const fulfillmentOverage = Math.max(0, Number(fulfillmentOrder?.total_amount) || 0);

    replacements.forEach((replacement) => {
      const quantity = Math.max(0, Number(replacement.quantity) || 0);
      const catalogLineRevenue = Math.max(0, Number(replacement.total_price) || 0);
      if (quantity <= 0 && catalogLineRevenue <= 0) return;

      let lineRevenue = catalogLineRevenue;
      if (sourceInScope) {
        // Source PO in range: full replacement value (swap already removed disputed lines).
        lineRevenue = catalogLineRevenue;
      } else if (fulfillmentInScope) {
        // Source PO outside range: only the payable overage in this period (matches PO table row).
        if (fulfillmentOverage <= 0) return;
        lineRevenue =
          replacementCatalogTotal > 0
            ? (catalogLineRevenue / replacementCatalogTotal) * fulfillmentOverage
            : fulfillmentOverage;
      }

      const split = splitReplacementProductLineItem({
        rebateStatus: rebate.status,
        itemQuantity: quantity,
        lineRevenue,
        variantId: replacement.variant_id,
        warehouseLocationId: replacement.warehouse_location_id,
        fulfillmentOrder,
        purchaseOrderId: fulfillmentOrder?.id ?? null,
        reservationByKey: input.reservationByKey,
        locationStatusByKey: input.locationStatusByKey,
      });
      if (!split) return;

      const variant = firstRelation(replacement.variants);
      const brand = firstRelation(variant?.brands)?.name || 'Unknown Brand';
      const variantName = variant?.name || 'Unknown Variant';

      accumulateProductAnalyticsContribution(
        productMap,
        brand,
        variantName,
        split,
        { delivered: 0, pending: 0 },
        sourceInScope ? rebate.purchase_order_id : fulfillmentOrder!.id,
        sourceOrder.key_account_client_id
      );
    });
  });

  return finalizeProductAnalyticsRows(productMap);
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
