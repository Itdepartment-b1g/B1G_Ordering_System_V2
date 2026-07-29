import { SupabaseClient } from '@supabase/supabase-js';
import { isDateInRange } from '@/lib/dateRangePresets';
import {
  getKeyAccountProductWorkflowBucket,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountConsignmentOrder,
  isKeyAccountPartialDeliveredOrder,
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
  /** Cash collected (from payment amount rows, capped at PO total). */
  paidRevenue: number;
  /** Remaining balance on partially paid standard POs. */
  partialRevenue: number;
  /** Full amount on unpaid standard POs (no payments yet). */
  unpaidRevenue: number;
  /** Outstanding float on consignment POs (deducts into paid/discount when settled). */
  consignmentRevenue: number;
  /** Commercial settlement discounts / write-offs (not cash). */
  settlementDiscountRevenue: number;
  /** paid + partial + unpaid + consignment + settlementDiscount */
  totalRevenue: number;
}

export interface KeyAccountDashboardMonthlyPaymentRow {
  month: string;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
  unpaidOrders: number;
  partialOrders: number;
  consignmentOrders: number;
}

export interface KeyAccountDashboardRevenueResult {
  summary: KeyAccountDashboardPaymentSummary;
  monthlyData: KeyAccountDashboardMonthlyPaymentRow[];
  /** POs with unpaid / partial / consignment float outstanding. */
  outstandingPaymentOrderCount: number;
  /** Non-cancelled consignment POs in the loaded scope. */
  consignmentOrderCount: number;
  /** @deprecated Prefer outstandingPaymentOrderCount — kept for call-site compatibility. */
  pendingOrderCount: number;
}

export interface KeyAccountDashboardPaymentRow {
  purchase_order_id: string;
  amount: number | null;
  settlement_discount?: number | null;
  created_at: string;
}

type PaymentBucketSplit = Omit<KeyAccountDashboardPaymentSummary, 'totalRevenue'>;

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

function hasDashboardWorkflow(order: KeyAccountDashboardOrder): boolean {
  return (
    getKeyAccountProductWorkflowBucket(order.workflow_status) !== null ||
    isKeyAccountPartialDeliveredOrder(order)
  );
}

/** Commercial KA POs that count as booked sales for the dashboard payment chart. */
export function isKeyAccountDashboardSalesOrder(
  order: KeyAccountDashboardOrder
): boolean {
  if (isCancelledOrRejectedOrder(order)) return false;
  // Consignment uses the same workflow gate; payment split keeps remaining as float.
  if (isKeyAccountConsignmentOrder(order)) return hasDashboardWorkflow(order);
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

/**
 * Split one PO's billed total into paid / discount / partial / unpaid / consignment buckets.
 * Cash and settlement discount are tracked separately; remaining uses cash + discount.
 */
export function splitKeyAccountPoPaymentRevenue(
  totalAmount: number,
  paidSum: number,
  isConsignment = false,
  settlementDiscountSum = 0
): PaymentBucketSplit {
  const total = Math.max(0, Number(totalAmount) || 0);
  const cashRaw = Math.max(0, Number(paidSum) || 0);
  const discountRaw = Math.max(0, Number(settlementDiscountSum) || 0);

  // Prefer allocating cash first, then discount, both capped at PO total.
  const paid = Math.min(total, cashRaw);
  const settlementDiscountRevenue = Math.min(Math.max(0, total - paid), discountRaw);
  const remaining = Math.max(
    0,
    Math.round((total - paid - settlementDiscountRevenue) * 100) / 100
  );

  if (isConsignment) {
    if (paid <= 0 && settlementDiscountRevenue <= 0) {
      return {
        paidRevenue: 0,
        partialRevenue: 0,
        unpaidRevenue: 0,
        consignmentRevenue: total,
        settlementDiscountRevenue: 0,
      };
    }
    if (remaining <= 0) {
      return {
        paidRevenue: paid,
        partialRevenue: 0,
        unpaidRevenue: 0,
        consignmentRevenue: 0,
        settlementDiscountRevenue,
      };
    }
    return {
      paidRevenue: paid,
      partialRevenue: 0,
      unpaidRevenue: 0,
      consignmentRevenue: remaining,
      settlementDiscountRevenue,
    };
  }

  if (paid <= 0 && settlementDiscountRevenue <= 0) {
    return {
      paidRevenue: 0,
      partialRevenue: 0,
      unpaidRevenue: total,
      consignmentRevenue: 0,
      settlementDiscountRevenue: 0,
    };
  }
  if (remaining <= 0) {
    return {
      paidRevenue: paid,
      partialRevenue: 0,
      unpaidRevenue: 0,
      consignmentRevenue: 0,
      settlementDiscountRevenue,
    };
  }
  return {
    paidRevenue: paid,
    partialRevenue: remaining,
    unpaidRevenue: 0,
    consignmentRevenue: 0,
    settlementDiscountRevenue,
  };
}

function emptyPaymentSummary(): KeyAccountDashboardPaymentSummary {
  return {
    paidRevenue: 0,
    partialRevenue: 0,
    unpaidRevenue: 0,
    consignmentRevenue: 0,
    settlementDiscountRevenue: 0,
    totalRevenue: 0,
  };
}

function addPaymentSummaries(
  a: KeyAccountDashboardPaymentSummary,
  b: PaymentBucketSplit
): KeyAccountDashboardPaymentSummary {
  const paidRevenue = a.paidRevenue + b.paidRevenue;
  const partialRevenue = a.partialRevenue + b.partialRevenue;
  const unpaidRevenue = a.unpaidRevenue + b.unpaidRevenue;
  const consignmentRevenue = a.consignmentRevenue + b.consignmentRevenue;
  const settlementDiscountRevenue =
    a.settlementDiscountRevenue + b.settlementDiscountRevenue;
  return {
    paidRevenue,
    partialRevenue,
    unpaidRevenue,
    consignmentRevenue,
    settlementDiscountRevenue,
    totalRevenue:
      paidRevenue +
      partialRevenue +
      unpaidRevenue +
      consignmentRevenue +
      settlementDiscountRevenue,
  };
}

export type KeyAccountDashboardPaymentChunk = {
  amount: number;
  settlement_discount: number;
  created_at: string;
};

/** Apply PO total cap in payment chronological order (cash + discount). */
export function getCappedConsignmentPaymentChunks(
  totalAmount: number,
  payments: KeyAccountDashboardPaymentRow[]
): KeyAccountDashboardPaymentChunk[] {
  const total = Math.max(0, Number(totalAmount) || 0);
  const sorted = [...payments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let remainingCap = total;
  const chunks: KeyAccountDashboardPaymentChunk[] = [];

  sorted.forEach((row) => {
    if (remainingCap <= 0) return;
    const rawCash = Math.max(0, Number(row.amount) || 0);
    const rawDiscount = Math.max(0, Number(row.settlement_discount) || 0);
    const takeCash = Math.min(rawCash, remainingCap);
    remainingCap = Math.round((remainingCap - takeCash) * 100) / 100;
    const takeDiscount = Math.min(rawDiscount, remainingCap);
    remainingCap = Math.round((remainingCap - takeDiscount) * 100) / 100;
    if (takeCash <= 0 && takeDiscount <= 0) return;
    chunks.push({
      amount: takeCash,
      settlement_discount: takeDiscount,
      created_at: row.created_at,
    });
  });

  return chunks;
}

function sumPaidByOrderId(
  payments: KeyAccountDashboardPaymentRow[]
): Map<string, number> {
  const paidByOrderId = new Map<string, number>();
  payments.forEach((row) => {
    const id = row.purchase_order_id;
    paidByOrderId.set(id, (paidByOrderId.get(id) || 0) + (Number(row.amount) || 0));
  });
  return paidByOrderId;
}

function sumSettlementDiscountByOrderId(
  payments: KeyAccountDashboardPaymentRow[]
): Map<string, number> {
  const map = new Map<string, number>();
  payments.forEach((row) => {
    const id = row.purchase_order_id;
    map.set(id, (map.get(id) || 0) + (Number(row.settlement_discount) || 0));
  });
  return map;
}

function groupPaymentsByOrderId(
  payments: KeyAccountDashboardPaymentRow[]
): Map<string, KeyAccountDashboardPaymentRow[]> {
  const map = new Map<string, KeyAccountDashboardPaymentRow[]>();
  payments.forEach((row) => {
    const list = map.get(row.purchase_order_id) || [];
    list.push(row);
    map.set(row.purchase_order_id, list);
  });
  return map;
}

export async function fetchKeyAccountDashboardPayments(
  supabase: SupabaseClient,
  orderIds: string[]
): Promise<KeyAccountDashboardPaymentRow[]> {
  if (orderIds.length === 0) return [];

  const { data, error } = await supabase
    .from('purchase_order_key_account_payments')
    .select('purchase_order_id, amount, settlement_discount, created_at')
    .in('purchase_order_id', orderIds);

  if (error) throw error;
  return (data || []) as KeyAccountDashboardPaymentRow[];
}

/** @deprecated Prefer fetchKeyAccountDashboardPayments — kept for compatibility. */
export async function fetchKeyAccountDashboardPaidByOrderId(
  supabase: SupabaseClient,
  orderIds: string[]
): Promise<Map<string, number>> {
  const payments = await fetchKeyAccountDashboardPayments(supabase, orderIds);
  return sumPaidByOrderId(payments);
}

function computeStandardScopedPaymentRevenue(
  scopeOrders: KeyAccountDashboardOrder[],
  paidByOrderId: Map<string, number>,
  discountByOrderId: Map<string, number>
): {
  summary: KeyAccountDashboardPaymentSummary;
  unpaidOrders: number;
  partialOrders: number;
} {
  let summary = emptyPaymentSummary();
  let unpaidOrders = 0;
  let partialOrders = 0;

  scopeOrders
    .filter((order) => isKeyAccountDashboardSalesOrder(order) && !isKeyAccountConsignmentOrder(order))
    .forEach((order) => {
      const split = splitKeyAccountPoPaymentRevenue(
        Number(order.total_amount) || 0,
        paidByOrderId.get(order.id) || 0,
        false,
        discountByOrderId.get(order.id) || 0
      );
      summary = addPaymentSummaries(summary, split);
      if (split.unpaidRevenue > 0) unpaidOrders += 1;
      if (split.partialRevenue > 0) partialOrders += 1;
    });

  return { summary, unpaidOrders, partialOrders };
}

export function computeKeyAccountDashboardRevenue(
  orders: KeyAccountDashboardOrder[],
  payments: KeyAccountDashboardPaymentRow[],
  selectedYear: number
): KeyAccountDashboardRevenueResult {
  const paidByOrderId = sumPaidByOrderId(payments);
  const discountByOrderId = sumSettlementDiscountByOrderId(payments);
  const paymentsByOrderId = groupPaymentsByOrderId(payments);
  const eligible = orders.filter(isKeyAccountDashboardSalesOrder);
  const standardOrders = eligible.filter((order) => !isKeyAccountConsignmentOrder(order));
  const consignmentOrders = eligible.filter((order) => isKeyAccountConsignmentOrder(order));

  // Year summary — standard by order totals; consignment paid/discount from payments in selected year.
  let summary = emptyPaymentSummary();
  const standardYear = computeStandardScopedPaymentRevenue(
    standardOrders,
    paidByOrderId,
    discountByOrderId
  );
  summary = addPaymentSummaries(summary, standardYear.summary);

  const yearStart = getMonthDateRange(selectedYear, 0).start;
  const yearEnd = getMonthDateRange(selectedYear, 11).end;

  consignmentOrders.forEach((order) => {
    const total = Number(order.total_amount) || 0;
    const chunks = getCappedConsignmentPaymentChunks(
      total,
      paymentsByOrderId.get(order.id) || []
    );
    const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
    const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
    const remaining = Math.max(0, Math.round((total - paidAll - discountAll) * 100) / 100);
    const paidInYear = chunks
      .filter((chunk) => isDateInRange(chunk.created_at, yearStart, yearEnd))
      .reduce((sum, chunk) => sum + chunk.amount, 0);
    const discountInYear = chunks
      .filter((chunk) => isDateInRange(chunk.created_at, yearStart, yearEnd))
      .reduce((sum, chunk) => sum + chunk.settlement_discount, 0);

    summary = addPaymentSummaries(summary, {
      paidRevenue: paidInYear,
      partialRevenue: 0,
      unpaidRevenue: 0,
      consignmentRevenue: remaining,
      settlementDiscountRevenue: discountInYear,
    });
  });

  const monthlyData: KeyAccountDashboardMonthlyPaymentRow[] = KEY_ACCOUNT_DASHBOARD_MONTH_NAMES.map(
    (month, monthIndex) => {
      const { start, end } = getMonthDateRange(selectedYear, monthIndex);
      const monthStandardOrders = standardOrders.filter((order) =>
        isDateInRange(order.order_date, start, end)
      );
      const monthStandard = computeStandardScopedPaymentRevenue(
        monthStandardOrders,
        paidByOrderId,
        discountByOrderId
      );

      // Consignment float stays on order_date month (remaining after all payments).
      let consignmentRevenue = 0;
      let consignmentOrderCountForMonth = 0;
      consignmentOrders.forEach((order) => {
        if (!isDateInRange(order.order_date, start, end)) return;
        const total = Number(order.total_amount) || 0;
        const chunks = getCappedConsignmentPaymentChunks(
          total,
          paymentsByOrderId.get(order.id) || []
        );
        const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
        const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
        const remaining = Math.max(0, Math.round((total - paidAll - discountAll) * 100) / 100);
        if (remaining > 0) {
          consignmentRevenue += remaining;
          consignmentOrderCountForMonth += 1;
        }
      });

      // Consignment cash + discount count in the payment's month only.
      let consignmentPaidInMonth = 0;
      let consignmentDiscountInMonth = 0;
      consignmentOrders.forEach((order) => {
        const chunks = getCappedConsignmentPaymentChunks(
          Number(order.total_amount) || 0,
          paymentsByOrderId.get(order.id) || []
        );
        chunks.forEach((chunk) => {
          if (isDateInRange(chunk.created_at, start, end)) {
            consignmentPaidInMonth += chunk.amount;
            consignmentDiscountInMonth += chunk.settlement_discount;
          }
        });
      });

      const paidRevenue = monthStandard.summary.paidRevenue + consignmentPaidInMonth;
      const partialRevenue = monthStandard.summary.partialRevenue;
      const unpaidRevenue = monthStandard.summary.unpaidRevenue;
      const settlementDiscountRevenue =
        monthStandard.summary.settlementDiscountRevenue + consignmentDiscountInMonth;
      const totalRevenue =
        paidRevenue +
        partialRevenue +
        unpaidRevenue +
        consignmentRevenue +
        settlementDiscountRevenue;

      return {
        month,
        paidRevenue,
        partialRevenue,
        unpaidRevenue,
        consignmentRevenue,
        settlementDiscountRevenue,
        totalRevenue,
        unpaidOrders: monthStandard.unpaidOrders,
        partialOrders: monthStandard.partialOrders,
        consignmentOrders: consignmentOrderCountForMonth,
      };
    }
  );

  const outstandingPaymentOrderCount = eligible.filter((order) => {
    const split = splitKeyAccountPoPaymentRevenue(
      Number(order.total_amount) || 0,
      paidByOrderId.get(order.id) || 0,
      isKeyAccountConsignmentOrder(order),
      discountByOrderId.get(order.id) || 0
    );
    return (
      split.unpaidRevenue > 0 || split.partialRevenue > 0 || split.consignmentRevenue > 0
    );
  }).length;

  const consignmentOrderCount = orders.filter(
    (order) =>
      !isCancelledOrRejectedOrder(order) && isKeyAccountConsignmentOrder(order)
  ).length;

  return {
    summary,
    monthlyData,
    outstandingPaymentOrderCount,
    consignmentOrderCount,
    pendingOrderCount: outstandingPaymentOrderCount,
  };
}

export function formatKeyAccountDashboardCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

/**
 * Fetch payment amounts and compute dashboard revenue.
 * Standard POs: month = order_date. Consignment paid/discount: month = payment created_at.
 */
export async function loadKeyAccountDashboardRevenue(
  supabase: SupabaseClient,
  orders: KeyAccountDashboardOrder[],
  selectedYear: number
): Promise<KeyAccountDashboardRevenueResult> {
  const salesOrderIds = orders.filter(isKeyAccountDashboardSalesOrder).map((order) => order.id);
  const payments = await fetchKeyAccountDashboardPayments(supabase, salesOrderIds);
  return computeKeyAccountDashboardRevenue(orders, payments, selectedYear);
}

export const EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE: KeyAccountDashboardRevenueResult = {
  summary: emptyPaymentSummary(),
  monthlyData: [],
  outstandingPaymentOrderCount: 0,
  consignmentOrderCount: 0,
  pendingOrderCount: 0,
};

export { KEY_ACCOUNT_DASHBOARD_MONTH_NAMES };
export type KeyAccountMonthlyRevenueRow = KeyAccountDashboardMonthlyPaymentRow;
