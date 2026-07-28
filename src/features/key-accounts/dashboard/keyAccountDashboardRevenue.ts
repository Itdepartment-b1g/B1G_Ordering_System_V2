import { SupabaseClient } from '@supabase/supabase-js';
import { isDateInRange } from '@/lib/dateRangePresets';
import {
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountProductAnalyticsOrder,
  KEY_ACCOUNT_DASHBOARD_MONTH_NAMES,
  type KeyAccountProductAnalyticsOrderRef,
} from '../key-accounts-analytics/keyAccountAnalyticsShared';

export interface KeyAccountDashboardOrder extends KeyAccountProductAnalyticsOrderRef {
  order_date: string;
  status?: string | null;
  key_account_client_id?: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
}

export interface KeyAccountDashboardPaymentSummary {
  /** Amount collected (from payment rows, capped at PO total). */
  paidRevenue: number;
  /** Remaining balance on partially paid POs. */
  partialRevenue: number;
  /** Full amount on unpaid POs (no payments yet). */
  unpaidRevenue: number;
  /** paid + partial + unpaid — sales booked by order date. */
  totalRevenue: number;
}

export interface KeyAccountDashboardMonthlyPaymentRow {
  month: string;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  totalRevenue: number;
  unpaidOrders: number;
  partialOrders: number;
}

export interface KeyAccountDashboardRevenueResult {
  summary: KeyAccountDashboardPaymentSummary;
  monthlyData: KeyAccountDashboardMonthlyPaymentRow[];
  /** POs with unpaid or partial payment status (sales collection outstanding). */
  outstandingPaymentOrderCount: number;
  /** @deprecated Prefer outstandingPaymentOrderCount — kept for call-site compatibility. */
  pendingOrderCount: number;
}

interface PaymentAmountRow {
  purchase_order_id: string;
  amount: number | null;
}

function isCancelledOrRejectedOrder(order: {
  status?: string | null;
  workflow_status?: string | null;
}): boolean {
  const status = String(order.status || '').toLowerCase();
  const workflow = String(order.workflow_status || '').toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'rejected' ||
    workflow === 'cancelled' ||
    workflow === 'rejected'
  );
}

/** Commercial KA POs that count as booked sales for the dashboard payment chart. */
export function isKeyAccountDashboardSalesOrder(
  order: KeyAccountDashboardOrder
): boolean {
  if (isCancelledOrRejectedOrder(order)) return false;
  if (!isKeyAccountAnalyticsEligibleOrder(order)) return false;
  return isKeyAccountProductAnalyticsOrder(order);
}

function getMonthDateRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Split one PO's billed total into paid / partial-outstanding / unpaid buckets. */
export function splitKeyAccountPoPaymentRevenue(
  totalAmount: number,
  paidSum: number
): Omit<KeyAccountDashboardPaymentSummary, 'totalRevenue'> {
  const total = Math.max(0, Number(totalAmount) || 0);
  const paidRaw = Math.max(0, Number(paidSum) || 0);
  const paid = Math.min(total, paidRaw);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

  if (paid <= 0) {
    return { paidRevenue: 0, partialRevenue: 0, unpaidRevenue: total };
  }
  if (remaining <= 0) {
    return { paidRevenue: total, partialRevenue: 0, unpaidRevenue: 0 };
  }
  return { paidRevenue: paid, partialRevenue: remaining, unpaidRevenue: 0 };
}

function emptyPaymentSummary(): KeyAccountDashboardPaymentSummary {
  return { paidRevenue: 0, partialRevenue: 0, unpaidRevenue: 0, totalRevenue: 0 };
}

function addPaymentSummaries(
  a: KeyAccountDashboardPaymentSummary,
  b: Omit<KeyAccountDashboardPaymentSummary, 'totalRevenue'>
): KeyAccountDashboardPaymentSummary {
  const paidRevenue = a.paidRevenue + b.paidRevenue;
  const partialRevenue = a.partialRevenue + b.partialRevenue;
  const unpaidRevenue = a.unpaidRevenue + b.unpaidRevenue;
  return {
    paidRevenue,
    partialRevenue,
    unpaidRevenue,
    totalRevenue: paidRevenue + partialRevenue + unpaidRevenue,
  };
}

export async function fetchKeyAccountDashboardPaidByOrderId(
  supabase: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, number>> {
  const paidByOrderId = new Map<string, number>();
  if (orderIds.length === 0) return paidByOrderId;

  const { data, error } = await supabase
    .from('purchase_order_key_account_payments')
    .select('purchase_order_id, amount')
    .in('purchase_order_id', orderIds);

  if (error) throw error;

  ((data || []) as PaymentAmountRow[]).forEach((row) => {
    const id = row.purchase_order_id;
    paidByOrderId.set(id, (paidByOrderId.get(id) || 0) + (Number(row.amount) || 0));
  });

  return paidByOrderId;
}

function computeScopedPaymentRevenue(
  scopeOrders: KeyAccountDashboardOrder[],
  paidByOrderId: Map<string, number>
): {
  summary: KeyAccountDashboardPaymentSummary;
  unpaidOrders: number;
  partialOrders: number;
} {
  const eligible = scopeOrders.filter(isKeyAccountDashboardSalesOrder);
  let summary = emptyPaymentSummary();
  let unpaidOrders = 0;
  let partialOrders = 0;

  eligible.forEach((order) => {
    const split = splitKeyAccountPoPaymentRevenue(
      Number(order.total_amount) || 0,
      paidByOrderId.get(order.id) || 0
    );
    summary = addPaymentSummaries(summary, split);
    if (split.unpaidRevenue > 0) unpaidOrders += 1;
    if (split.partialRevenue > 0) partialOrders += 1;
  });

  return { summary, unpaidOrders, partialOrders };
}

export function computeKeyAccountDashboardRevenue(
  orders: KeyAccountDashboardOrder[],
  paidByOrderId: Map<string, number>,
  selectedYear: number
): KeyAccountDashboardRevenueResult {
  const { summary } = computeScopedPaymentRevenue(orders, paidByOrderId);

  const monthlyData: KeyAccountDashboardMonthlyPaymentRow[] = KEY_ACCOUNT_DASHBOARD_MONTH_NAMES.map(
    (month, monthIndex) => {
      const { start, end } = getMonthDateRange(selectedYear, monthIndex);
      const monthOrders = orders.filter((order) => isDateInRange(order.order_date, start, end));
      const monthResult = computeScopedPaymentRevenue(monthOrders, paidByOrderId);

      return {
        month,
        paidRevenue: monthResult.summary.paidRevenue,
        partialRevenue: monthResult.summary.partialRevenue,
        unpaidRevenue: monthResult.summary.unpaidRevenue,
        totalRevenue: monthResult.summary.totalRevenue,
        unpaidOrders: monthResult.unpaidOrders,
        partialOrders: monthResult.partialOrders,
      };
    }
  );

  const outstandingPaymentOrderCount = orders.filter((order) => {
    if (!isKeyAccountDashboardSalesOrder(order)) return false;
    const split = splitKeyAccountPoPaymentRevenue(
      Number(order.total_amount) || 0,
      paidByOrderId.get(order.id) || 0
    );
    return split.unpaidRevenue > 0 || split.partialRevenue > 0;
  }).length;

  return {
    summary,
    monthlyData,
    outstandingPaymentOrderCount,
    pendingOrderCount: outstandingPaymentOrderCount,
  };
}

export function formatKeyAccountDashboardCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

/** Fetch payment amounts and compute dashboard revenue by collection status (order_date months). */
export async function loadKeyAccountDashboardRevenue(
  supabase: SupabaseClient,
  orders: KeyAccountDashboardOrder[],
  selectedYear: number
): Promise<KeyAccountDashboardRevenueResult> {
  const salesOrderIds = orders.filter(isKeyAccountDashboardSalesOrder).map((order) => order.id);
  const paidByOrderId = await fetchKeyAccountDashboardPaidByOrderId(supabase, salesOrderIds);
  return computeKeyAccountDashboardRevenue(orders, paidByOrderId, selectedYear);
}

export const EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE: KeyAccountDashboardRevenueResult = {
  summary: emptyPaymentSummary(),
  monthlyData: [],
  outstandingPaymentOrderCount: 0,
  pendingOrderCount: 0,
};

export { KEY_ACCOUNT_DASHBOARD_MONTH_NAMES };
export type KeyAccountMonthlyRevenueRow = KeyAccountDashboardMonthlyPaymentRow;
