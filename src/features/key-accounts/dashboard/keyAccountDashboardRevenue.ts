import { SupabaseClient } from '@supabase/supabase-js';
import { isDateInRange } from '@/lib/dateRangePresets';
import { isRebateDerivedPurchaseOrder } from '../rebates/keyAccountRebateShared';
import {
  buildKeyAccountProductAnalyticsRows,
  buildRebateDeductionByPoItemId,
  buildRebateSwapByPoItemId,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountCommercialProductAnalyticsOrder,
  isKeyAccountPartialDeliveredOrder,
  isKeyAccountPendingWorkflowOrder,
  KEY_ACCOUNT_DASHBOARD_MONTH_NAMES,
  rebateResolutionHasReplacement,
  sumKeyAccountProductRevenueSummary,
  type KeyAccountMonthlyRevenueRow,
  type KeyAccountProductAnalyticsItemRef,
  type KeyAccountProductAnalyticsOrderRef,
  type KeyAccountProductRevenueSummary,
  type KeyAccountRebateAnalyticsRecord,
  warehouseTransferLocationStatusKey,
  warehouseTransferReservationKey,
} from '../key-accounts-analytics/keyAccountAnalyticsShared';

export interface KeyAccountDashboardOrder extends KeyAccountProductAnalyticsOrderRef {
  order_date: string;
  status?: string | null;
  key_account_client_id?: string | null;
}

interface WarehouseTransferReservationRow {
  purchase_order_id: string;
  warehouse_location_id: string;
  variant_id: string;
  quantity_reserved: number;
  quantity_fulfilled: number;
}

interface WarehouseTransferLocationStatusRow {
  purchase_order_id: string;
  warehouse_location_id: string;
  status: string;
}

export interface KeyAccountDashboardRevenueContext {
  items: KeyAccountProductAnalyticsItemRef[];
  rebates: KeyAccountRebateAnalyticsRecord[];
  transferReservations: WarehouseTransferReservationRow[];
  transferLocationStatuses: WarehouseTransferLocationStatusRow[];
}

export interface KeyAccountDashboardRevenueResult {
  summary: KeyAccountProductRevenueSummary;
  monthlyData: KeyAccountMonthlyRevenueRow[];
  pendingOrderCount: number;
}

export async function fetchKeyAccountDashboardRevenueContext(
  supabase: SupabaseClient,
  orders: KeyAccountDashboardOrder[]
): Promise<KeyAccountDashboardRevenueContext> {
  const productAnalyticsOrderIds = orders
    .filter(isKeyAccountCommercialProductAnalyticsOrder)
    .map((order) => order.id);

  let items: KeyAccountProductAnalyticsItemRef[] = [];
  if (productAnalyticsOrderIds.length > 0) {
    const { data: itemData, error: itemError } = await supabase
      .from('purchase_order_items')
      .select(`
        id,
        purchase_order_id,
        variant_id,
        warehouse_location_id,
        quantity,
        unit_price,
        total_price,
        variants:variant_id (
          name,
          brands:brand_id (name)
        )
      `)
      .in('purchase_order_id', productAnalyticsOrderIds);

    if (itemError) throw itemError;
    items = (itemData || []) as KeyAccountProductAnalyticsItemRef[];
  }

  const sourcePoIdsForRebates = orders
    .filter((order) => !isRebateDerivedPurchaseOrder(order))
    .map((order) => order.id);

  let rebates: KeyAccountRebateAnalyticsRecord[] = [];
  if (sourcePoIdsForRebates.length > 0) {
    const { data: rebateData, error: rebateError } = await supabase
      .from('key_account_po_rebates')
      .select(`
        id,
        purchase_order_id,
        resolution_type,
        status,
        credit_amount,
        disputed_total,
        fulfillment_purchase_order_id,
        lines:key_account_po_rebate_lines(
          purchase_order_item_id,
          line_total,
          disputed_quantity
        ),
        replacements:key_account_po_rebate_replacements(
          variant_id,
          warehouse_location_id,
          quantity,
          total_price,
          variants:variant_id (
            name,
            brands:brand_id (name)
          )
        )
      `)
      .in('purchase_order_id', sourcePoIdsForRebates)
      .in('status', ['submitted', 'approved', 'executed']);

    if (rebateError) throw rebateError;
    rebates = (rebateData || []) as KeyAccountRebateAnalyticsRecord[];
  }

  const reservationPoIds = new Set(
    orders.filter(isKeyAccountPartialDeliveredOrder).map((order) => order.id)
  );
  rebates.forEach((rebate) => {
    if (!rebateResolutionHasReplacement(rebate.resolution_type)) return;
    if (rebate.fulfillment_purchase_order_id) {
      reservationPoIds.add(rebate.fulfillment_purchase_order_id);
    }
  });

  let transferReservations: WarehouseTransferReservationRow[] = [];
  let transferLocationStatuses: WarehouseTransferLocationStatusRow[] = [];

  if (reservationPoIds.size > 0) {
    const poIds = Array.from(reservationPoIds);
    const [reservationsResult, locationStatusResult] = await Promise.all([
      supabase
        .from('warehouse_transfer_reservations')
        .select(
          'purchase_order_id, warehouse_location_id, variant_id, quantity_reserved, quantity_fulfilled'
        )
        .in('purchase_order_id', poIds),
      supabase
        .from('warehouse_transfer_location_status')
        .select('purchase_order_id, warehouse_location_id, status')
        .in('purchase_order_id', poIds),
    ]);

    if (reservationsResult.error) throw reservationsResult.error;
    if (locationStatusResult.error) throw locationStatusResult.error;

    transferReservations = (reservationsResult.data || []) as WarehouseTransferReservationRow[];
    transferLocationStatuses = (locationStatusResult.data ||
      []) as WarehouseTransferLocationStatusRow[];
  }

  return { items, rebates, transferReservations, transferLocationStatuses };
}

function getMonthDateRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function buildReservationMaps(context: KeyAccountDashboardRevenueContext) {
  const reservationByKey = new Map<string, { quantity_fulfilled: number; quantity_reserved: number }>();
  context.transferReservations.forEach((row) => {
    reservationByKey.set(
      warehouseTransferReservationKey(
        row.purchase_order_id,
        row.warehouse_location_id,
        row.variant_id
      ),
      {
        quantity_fulfilled: Number(row.quantity_fulfilled) || 0,
        quantity_reserved: Number(row.quantity_reserved) || 0,
      }
    );
  });

  const locationStatusByKey = new Map<string, string>();
  context.transferLocationStatuses.forEach((row) => {
    locationStatusByKey.set(
      warehouseTransferLocationStatusKey(row.purchase_order_id, row.warehouse_location_id),
      row.status
    );
  });

  return { reservationByKey, locationStatusByKey };
}

const EMPTY_REVENUE_SUMMARY: KeyAccountProductRevenueSummary = {
  grossRevenue: 0,
  rebatedRevenue: 0,
  deliveredRevenue: 0,
  pendingRevenue: 0,
  totalRevenue: 0,
};

/**
 * Compute revenue for a PO date scope — same rules as Key Account Analytics product tab.
 * `lookupOrders` stays at full-year scope so rebate fulfillment POs resolve workflow splits.
 * Replacement rebate revenue is attributed to the source PO month only (monthly bars sum to yearly).
 */
function computeScopedKeyAccountRevenue(
  scopeOrders: KeyAccountDashboardOrder[],
  lookupOrders: KeyAccountDashboardOrder[],
  context: KeyAccountDashboardRevenueContext
): KeyAccountProductRevenueSummary {
  const eligibleScopeOrders = scopeOrders.filter(isKeyAccountAnalyticsEligibleOrder);
  const scopeOrderIds = new Set(eligibleScopeOrders.map((order) => order.id));

  if (scopeOrderIds.size === 0) {
    return EMPTY_REVENUE_SUMMARY;
  }

  const scopeItems = context.items.filter((item) => scopeOrderIds.has(item.purchase_order_id));
  const { reservationByKey, locationStatusByKey } = buildReservationMaps(context);

  const productAnalyticsOrders = eligibleScopeOrders.filter(
    isKeyAccountCommercialProductAnalyticsOrder
  );
  const productAnalyticsOrderById = new Map(
    productAnalyticsOrders.map((order) => [order.id, order])
  );
  const orderById = new Map(
    lookupOrders
      .filter(isKeyAccountAnalyticsEligibleOrder)
      .map((order) => [order.id, order as KeyAccountProductAnalyticsOrderRef])
  );

  const poLineSubtotalByOrderId = new Map<string, number>();
  scopeItems.forEach((item) => {
    const lineRevenue = Number(
      item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0)
    );
    poLineSubtotalByOrderId.set(
      item.purchase_order_id,
      (poLineSubtotalByOrderId.get(item.purchase_order_id) || 0) + lineRevenue
    );
  });

  const { rows } = buildKeyAccountProductAnalyticsRows({
    items: scopeItems,
    productAnalyticsOrderById,
    orderById,
    dateFilteredOrderIds: scopeOrderIds,
    poLineSubtotalByOrderId,
    rebateDeductionByPoItemId: buildRebateDeductionByPoItemId(context.rebates),
    rebateSwapByPoItemId: buildRebateSwapByPoItemId(context.rebates),
    rebates: context.rebates,
    reservationByKey,
    locationStatusByKey,
  });

  return sumKeyAccountProductRevenueSummary(rows);
}

export function computeKeyAccountDashboardRevenue(
  orders: KeyAccountDashboardOrder[],
  context: KeyAccountDashboardRevenueContext,
  selectedYear: number
): KeyAccountDashboardRevenueResult {
  const summary = computeScopedKeyAccountRevenue(orders, orders, context);

  const monthlyData: KeyAccountMonthlyRevenueRow[] = KEY_ACCOUNT_DASHBOARD_MONTH_NAMES.map(
    (month, monthIndex) => {
      const { start, end } = getMonthDateRange(selectedYear, monthIndex);
      const monthOrders = orders.filter((order) => isDateInRange(order.order_date, start, end));
      const monthSummary = computeScopedKeyAccountRevenue(monthOrders, orders, context);
      const pendingWorkflowOrders = monthOrders.filter(isKeyAccountPendingWorkflowOrder).length;

      return {
        month,
        deliveredRevenue: monthSummary.deliveredRevenue,
        pendingRevenue: monthSummary.pendingRevenue,
        grossRevenue: monthSummary.grossRevenue,
        rebatedRevenue: monthSummary.rebatedRevenue,
        totalRevenue: monthSummary.totalRevenue,
        pendingWorkflowOrders,
      };
    }
  );

  const pendingOrderCount = orders.filter(isKeyAccountPendingWorkflowOrder).length;

  return { summary, monthlyData, pendingOrderCount };
}

export function formatKeyAccountDashboardCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

/** Fetch analytics context and compute dashboard revenue (shared across role dashboards). */
export async function loadKeyAccountDashboardRevenue(
  supabase: SupabaseClient,
  orders: KeyAccountDashboardOrder[],
  selectedYear: number
): Promise<KeyAccountDashboardRevenueResult> {
  const context = await fetchKeyAccountDashboardRevenueContext(supabase, orders);
  return computeKeyAccountDashboardRevenue(orders, context, selectedYear);
}

export const EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE: KeyAccountDashboardRevenueResult = {
  summary: EMPTY_REVENUE_SUMMARY,
  monthlyData: [],
  pendingOrderCount: 0,
};

export { KEY_ACCOUNT_DASHBOARD_MONTH_NAMES };
export type { KeyAccountMonthlyRevenueRow };
