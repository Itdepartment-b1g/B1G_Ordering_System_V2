import { fetchAllPaginated } from '../../../lib/supabasePaginate';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import {
  chunkIds,
  firstRelation,
  inDateRange,
  isCancelledOrRejected,
  isConsignmentPo,
  isKaAnalyticsSalesOrder,
} from './analytics/shared';
import { listKADirectorKamIds, type UserContext } from './purchase-order';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const INACTIVE_DAYS = 30;

export type KADashboardPaymentSummary = {
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
};

export type KADashboardMonthlyPaymentRow = {
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
};

export type KADashboardOrderRef = {
  id: string;
  po_number?: string | null;
  order_date: string;
  total_amount: number | null;
  subtotal?: number | null;
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  warehouse_location_id?: string | null;
  kam_id?: string | null;
  key_account_client_id?: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
  dr_number?: string | null;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  shop?: { shop_name: string | null } | { shop_name: string | null }[] | null;
  kam?: { id?: string; full_name: string | null } | { id?: string; full_name: string | null }[] | null;
};

export type KADashboardPaymentRow = {
  purchase_order_id: string;
  amount: number | null;
  settlement_discount: number | null;
  created_at: string;
};

export type KADashboardRevenueResult = {
  summary: KADashboardPaymentSummary;
  monthlyData: KADashboardMonthlyPaymentRow[];
  orders: KADashboardOrderRef[];
  payments: KADashboardPaymentRow[];
  outstandingPaymentOrderCount: number;
  consignmentOrderCount: number;
  pendingOrderCount: number;
};

export type KADashboardStats = {
  totalClients: number;
  totalOrders: number;
  totalKAMs: number;
  pendingOrders: number;
  consignmentOrders: number;
  inactiveClients: number;
  totalRevenue: number;
};

export type KADashboardClientRow = {
  id: string;
  client_name: string;
  client_code: string;
  kam_name: string;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  totalOrders: number;
  totalRevenue: number;
  paidRevenue: number;
  remainingBalance: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
};

export type KADashboardOrderRow = {
  id: string;
  client_name: string;
  shop_name: string;
  kam_name: string;
  total_amount: number;
  status: string;
  workflow_status: string | null;
  order_date: string;
  dr_number?: string | null;
};

export type KADashboardKamRow = {
  id: string;
  full_name: string;
  email: string;
  clientCount: number;
  orderCount: number;
  deliveredOrderCount: number;
  totalRevenue: number;
};

export type KADashboardBreakdownRow = {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
};

export type KADashboardBrandBreakdown = KADashboardBreakdownRow & {
  clientCount: number;
  variants: KADashboardBreakdownRow[];
  clients: KADashboardBreakdownRow[];
};

export type KADashboardOverviewResult = {
  stats: KADashboardStats;
  revenue: KADashboardRevenueResult;
  kamMonthly: Array<{ month: string; revenue: number }>;
  clients: KADashboardClientRow[];
  orders: KADashboardOrderRow[];
};

export type KADashboardTabsResult = {
  team: KADashboardKamRow[];
  clients: KADashboardClientRow[];
  orders: KADashboardOrderRow[];
  inactiveClients: number;
};

type PaymentBucketSplit = Omit<KADashboardPaymentSummary, 'totalRevenue'>;
type ScopeKamIds = string[] | null;

const ORDER_SELECT = `
  id,
  po_number,
  order_date,
  total_amount,
  subtotal,
  status,
  workflow_status,
  po_order_kind,
  source_rebate_id,
  warehouse_location_id,
  kam_id,
  key_account_client_id,
  key_account_payment_status,
  key_account_payment_mode,
  dr_number,
  client:key_account_clients(client_name, client_code),
  shop:key_account_shops(shop_name),
  kam:profiles!purchase_orders_kam_id_fkey(id, full_name, email)
`;

function emptyPaymentSummary(): KADashboardPaymentSummary {
  return {
    paidRevenue: 0,
    partialRevenue: 0,
    unpaidRevenue: 0,
    consignmentRevenue: 0,
    settlementDiscountRevenue: 0,
    totalRevenue: 0,
  };
}

export function emptyKADashboardRevenue(): KADashboardRevenueResult {
  return {
    summary: emptyPaymentSummary(),
    monthlyData: MONTH_NAMES.map((month) => ({
      month,
      paidRevenue: 0,
      partialRevenue: 0,
      unpaidRevenue: 0,
      consignmentRevenue: 0,
      settlementDiscountRevenue: 0,
      totalRevenue: 0,
      unpaidOrders: 0,
      partialOrders: 0,
      consignmentOrders: 0,
    })),
    orders: [],
    payments: [],
    outstandingPaymentOrderCount: 0,
    consignmentOrderCount: 0,
    pendingOrderCount: 0,
  };
}

function emptyStats(): KADashboardStats {
  return {
    totalClients: 0,
    totalOrders: 0,
    totalKAMs: 0,
    pendingOrders: 0,
    consignmentOrders: 0,
    inactiveClients: 0,
    totalRevenue: 0,
  };
}

function isDeliveredRevenue(order: {
  status?: string | null;
  workflow_status?: string | null;
}) {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}

function isPendingWorkflow(workflowStatus?: string | null) {
  return (
    workflowStatus === 'owner_pending' ||
    workflowStatus === 'kam_pending' ||
    workflowStatus === 'director_pending' ||
    workflowStatus === 'admin_pending'
  );
}

function relationName(
  value:
    | { client_name?: string | null; shop_name?: string | null; full_name?: string | null }
    | { client_name?: string | null; shop_name?: string | null; full_name?: string | null }[]
    | null
    | undefined,
  key: 'client_name' | 'shop_name' | 'full_name',
  fallback = 'Unknown'
) {
  const row = firstRelation(value);
  const name = row?.[key];
  return typeof name === 'string' && name.trim() ? name : fallback;
}

function daysSince(value: string | null) {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24));
}

function getMonthDateRange(year: number, monthIndex: number) {
  const start = new Date(year, monthIndex, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function splitPoPaymentRevenue(
  totalAmount: number,
  paidSum: number,
  isConsignment = false,
  settlementDiscountSum = 0
): PaymentBucketSplit {
  const total = Math.max(0, Number(totalAmount) || 0);
  const cashRaw = Math.max(0, Number(paidSum) || 0);
  const discountRaw = Math.max(0, Number(settlementDiscountSum) || 0);
  const paid = Math.min(total, cashRaw);
  const settlementDiscountRevenue = Math.min(Math.max(0, total - paid), discountRaw);
  const remaining = Math.max(0, Math.round((total - paid - settlementDiscountRevenue) * 100) / 100);

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

function addPaymentSummaries(
  a: KADashboardPaymentSummary,
  b: PaymentBucketSplit
): KADashboardPaymentSummary {
  const paidRevenue = a.paidRevenue + b.paidRevenue;
  const partialRevenue = a.partialRevenue + b.partialRevenue;
  const unpaidRevenue = a.unpaidRevenue + b.unpaidRevenue;
  const consignmentRevenue = a.consignmentRevenue + b.consignmentRevenue;
  const settlementDiscountRevenue = a.settlementDiscountRevenue + b.settlementDiscountRevenue;
  return {
    paidRevenue,
    partialRevenue,
    unpaidRevenue,
    consignmentRevenue,
    settlementDiscountRevenue,
    totalRevenue:
      paidRevenue + partialRevenue + unpaidRevenue + consignmentRevenue + settlementDiscountRevenue,
  };
}

function getCappedPaymentChunks(totalAmount: number, payments: KADashboardPaymentRow[]) {
  const total = Math.max(0, Number(totalAmount) || 0);
  const sorted = [...payments].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let remainingCap = total;
  const chunks: Array<{ amount: number; settlement_discount: number; created_at: string }> = [];

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

function sumByOrderId(payments: KADashboardPaymentRow[], field: 'amount' | 'settlement_discount') {
  const map = new Map<string, number>();
  payments.forEach((row) => {
    const id = row.purchase_order_id;
    map.set(id, (map.get(id) || 0) + (Number(row[field]) || 0));
  });
  return map;
}

function groupPaymentsByOrderId(payments: KADashboardPaymentRow[]) {
  const map = new Map<string, KADashboardPaymentRow[]>();
  payments.forEach((row) => {
    const list = map.get(row.purchase_order_id) || [];
    list.push(row);
    map.set(row.purchase_order_id, list);
  });
  return map;
}

function computeStandardScopedPaymentRevenue(
  scopeOrders: KADashboardOrderRef[],
  paidByOrderId: Map<string, number>,
  discountByOrderId: Map<string, number>
) {
  let summary = emptyPaymentSummary();
  let unpaidOrders = 0;
  let partialOrders = 0;

  scopeOrders
    .filter((order) => isKaAnalyticsSalesOrder(order) && !isConsignmentPo(order))
    .forEach((order) => {
      const split = splitPoPaymentRevenue(
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

function computeDashboardRevenue(
  orders: KADashboardOrderRef[],
  payments: KADashboardPaymentRow[],
  selectedYear: number
): KADashboardRevenueResult {
  const paidByOrderId = sumByOrderId(payments, 'amount');
  const discountByOrderId = sumByOrderId(payments, 'settlement_discount');
  const paymentsByOrderId = groupPaymentsByOrderId(payments);
  const eligible = orders.filter(isKaAnalyticsSalesOrder);
  const standardOrders = eligible.filter((order) => !isConsignmentPo(order));
  const consignmentOrders = eligible.filter((order) => isConsignmentPo(order));

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
    const chunks = getCappedPaymentChunks(total, paymentsByOrderId.get(order.id) || []);
    const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
    const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
    const remaining = Math.max(0, Math.round((total - paidAll - discountAll) * 100) / 100);
    const paidInYear = chunks
      .filter((chunk) => inDateRange(chunk.created_at, yearStart, yearEnd))
      .reduce((sum, chunk) => sum + chunk.amount, 0);
    const discountInYear = chunks
      .filter((chunk) => inDateRange(chunk.created_at, yearStart, yearEnd))
      .reduce((sum, chunk) => sum + chunk.settlement_discount, 0);

    summary = addPaymentSummaries(summary, {
      paidRevenue: paidInYear,
      partialRevenue: 0,
      unpaidRevenue: 0,
      consignmentRevenue: remaining,
      settlementDiscountRevenue: discountInYear,
    });
  });

  const monthlyData: KADashboardMonthlyPaymentRow[] = MONTH_NAMES.map((month, monthIndex) => {
    const { start, end } = getMonthDateRange(selectedYear, monthIndex);
    const monthStandardOrders = standardOrders.filter((order) =>
      inDateRange(order.order_date, start, end)
    );
    const monthStandard = computeStandardScopedPaymentRevenue(
      monthStandardOrders,
      paidByOrderId,
      discountByOrderId
    );

    let consignmentRevenue = 0;
    let consignmentOrderCountForMonth = 0;
    consignmentOrders.forEach((order) => {
      if (!inDateRange(order.order_date, start, end)) return;
      const total = Number(order.total_amount) || 0;
      const chunks = getCappedPaymentChunks(total, paymentsByOrderId.get(order.id) || []);
      const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
      const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
      const remaining = Math.max(0, Math.round((total - paidAll - discountAll) * 100) / 100);
      if (remaining > 0) {
        consignmentRevenue += remaining;
        consignmentOrderCountForMonth += 1;
      }
    });

    let consignmentPaidInMonth = 0;
    let consignmentDiscountInMonth = 0;
    consignmentOrders.forEach((order) => {
      const chunks = getCappedPaymentChunks(
        Number(order.total_amount) || 0,
        paymentsByOrderId.get(order.id) || []
      );
      chunks.forEach((chunk) => {
        if (inDateRange(chunk.created_at, start, end)) {
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
      paidRevenue + partialRevenue + unpaidRevenue + consignmentRevenue + settlementDiscountRevenue;

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
  });

  const outstandingPaymentOrderCount = eligible.filter((order) => {
    const split = splitPoPaymentRevenue(
      Number(order.total_amount) || 0,
      paidByOrderId.get(order.id) || 0,
      isConsignmentPo(order),
      discountByOrderId.get(order.id) || 0
    );
    return split.unpaidRevenue > 0 || split.partialRevenue > 0 || split.consignmentRevenue > 0;
  }).length;

  const consignmentOrderCount = orders.filter(
    (order) => !isCancelledOrRejected(order) && isConsignmentPo(order)
  ).length;

  return {
    summary,
    monthlyData,
    orders: eligible,
    payments,
    outstandingPaymentOrderCount,
    consignmentOrderCount,
    pendingOrderCount: outstandingPaymentOrderCount,
  };
}

function computeClientPaymentTotals(
  orders: KADashboardOrderRef[],
  paidByOrderId: Map<string, number>,
  discountByOrderId: Map<string, number>
) {
  let paidRevenue = 0;
  let remainingBalance = 0;
  let consignmentRevenue = 0;
  let settlementDiscountRevenue = 0;

  for (const order of orders) {
    if (!isKaAnalyticsSalesOrder(order)) continue;
    const split = splitPoPaymentRevenue(
      Number(order.total_amount) || 0,
      paidByOrderId.get(order.id) || 0,
      isConsignmentPo(order),
      discountByOrderId.get(order.id) || 0
    );
    paidRevenue += split.paidRevenue;
    remainingBalance += split.partialRevenue + split.unpaidRevenue;
    consignmentRevenue += split.consignmentRevenue;
    settlementDiscountRevenue += split.settlementDiscountRevenue;
  }

  return { paidRevenue, remainingBalance, consignmentRevenue, settlementDiscountRevenue };
}

async function resolveOrderKamIds(ctx: UserContext): Promise<ScopeKamIds> {
  if (ctx.role === 'sales_head' || ctx.role === 'sales_admin') return null;
  if (ctx.role === 'key_account_manager') return [ctx.userId];
  if (ctx.role === 'sales_director') {
    const { kamIds } = await listKADirectorKamIds(ctx);
    return Array.from(new Set([...kamIds, ctx.userId]));
  }
  return [ctx.userId];
}

async function fetchDashboardOrders(
  ctx: UserContext,
  kamIds: ScopeKamIds,
  dateStart?: string | null,
  dateEnd?: string | null
): Promise<KADashboardOrderRef[]> {
  if (kamIds && kamIds.length === 0) return [];
  const sb = getSupabaseAdmin();

  return fetchAllPaginated<KADashboardOrderRef>(async (from, to) => {
    let query = sb
      .from('purchase_orders')
      .select(ORDER_SELECT)
      .eq('company_id', ctx.companyId)
      .eq('company_account_type', 'Key Accounts');
    if (kamIds) query = query.in('kam_id', kamIds);
    if (dateStart) query = query.gte('order_date', dateStart);
    if (dateEnd) query = query.lte('order_date', dateEnd);
    const { data, error } = await query
      .order('order_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
    return { data: (data as KADashboardOrderRef[] | null) ?? null, error };
  });
}

async function fetchDashboardPayments(orderIds: string[]): Promise<KADashboardPaymentRow[]> {
  if (orderIds.length === 0) return [];
  const sb = getSupabaseAdmin();
  const all: KADashboardPaymentRow[] = [];

  for (const chunk of chunkIds(orderIds)) {
    const rows = await fetchAllPaginated<KADashboardPaymentRow>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_key_account_payments')
        .select('purchase_order_id, amount, settlement_discount, created_at')
        .in('purchase_order_id', chunk)
        .order('created_at', { ascending: true })
        .order('purchase_order_id', { ascending: true })
        .range(from, to);
      return { data: (data as KADashboardPaymentRow[] | null) ?? null, error };
    });
    all.push(...rows);
  }

  return all;
}

async function fetchLastOrderDates(
  ctx: UserContext,
  clientIds: string[],
  kamId?: string | null
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (clientIds.length === 0) return map;
  const sb = getSupabaseAdmin();

  for (const chunk of chunkIds(clientIds)) {
    const rows = await fetchAllPaginated<{
      key_account_client_id: string | null;
      order_date: string;
    }>(async (from, to) => {
      let query = sb
        .from('purchase_orders')
        .select('key_account_client_id, order_date')
        .eq('company_id', ctx.companyId)
        .eq('company_account_type', 'Key Accounts')
        .in('key_account_client_id', chunk)
        .order('order_date', { ascending: false })
        .order('id', { ascending: false });
      if (kamId) query = query.eq('kam_id', kamId);
      const { data, error } = await query.range(from, to);
      return { data, error };
    });

    for (const row of rows) {
      const id = row.key_account_client_id;
      if (!id || map.has(id)) continue;
      map.set(id, row.order_date);
    }
  }

  return map;
}

function toOrderRows(orders: KADashboardOrderRef[]): KADashboardOrderRow[] {
  return orders.map((order) => ({
    id: order.id,
    client_name: relationName(order.client, 'client_name'),
    shop_name: relationName(order.shop, 'shop_name', '—'),
    kam_name: relationName(order.kam, 'full_name'),
    total_amount: Number(order.total_amount) || 0,
    status: String(order.status || ''),
    workflow_status: order.workflow_status ?? null,
    order_date: order.order_date,
    dr_number: order.dr_number ?? null,
  }));
}

async function countActiveClients(companyId: string) {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from('key_account_clients')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'active');
  if (error) throw error;
  return count || 0;
}

async function loadDirectorAssignments(ctx: UserContext) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('kam_director_assignments')
    .select('kam_id, kam:profiles!kam_director_assignments_kam_id_fkey(id, full_name, email)')
    .eq('director_id', ctx.userId);
  if (error) throw error;
  return (data || []) as Array<{
    kam_id: string;
    kam: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null;
  }>;
}

async function loadKamAssignments(
  kamIds: string[]
): Promise<
  Array<{
    client_id: string;
    kam_id: string;
    kam: { full_name: string | null } | { full_name: string | null }[] | null;
    client:
      | { id: string; client_name: string; client_code: string; status?: string | null }
      | { id: string; client_name: string; client_code: string; status?: string | null }[]
      | null;
  }>
> {
  if (kamIds.length === 0) return [];
  const sb = getSupabaseAdmin();
  const all: Array<{
    client_id: string;
    kam_id: string;
    kam: { full_name: string | null } | { full_name: string | null }[] | null;
    client:
      | { id: string; client_name: string; client_code: string; status?: string | null }
      | { id: string; client_name: string; client_code: string; status?: string | null }[]
      | null;
  }> = [];

  for (const chunk of chunkIds(kamIds)) {
    const { data, error } = await sb
      .from('kam_client_assignments')
      .select(
        'client_id, kam_id, kam:profiles!kam_client_assignments_kam_id_fkey(full_name), client:key_account_clients(id, client_name, client_code, status)'
      )
      .in('kam_id', chunk);
    if (error) throw error;
    all.push(...((data || []) as typeof all));
  }

  return all;
}

function countInactive(clients: KADashboardClientRow[]) {
  return clients.filter(
    (client) => client.daysSinceLastOrder === null || client.daysSinceLastOrder > INACTIVE_DAYS
  ).length;
}

async function buildDirectorClients(
  ctx: UserContext,
  kamIds: string[],
  scopedOrders: KADashboardOrderRef[],
  payments: KADashboardPaymentRow[]
): Promise<KADashboardClientRow[]> {
  const paidByOrderId = sumByOrderId(payments, 'amount');
  const discountByOrderId = sumByOrderId(payments, 'settlement_discount');
  const assignments = await loadKamAssignments(kamIds);
  const clientById = new Map<string, KADashboardClientRow>();

  for (const assignment of assignments) {
    const clientData = firstRelation(assignment.client);
    if (!clientData || clientById.has(clientData.id)) continue;
    const kam = firstRelation(assignment.kam);
    const scoped = scopedOrders.filter((order) => order.key_account_client_id === clientData.id);
    clientById.set(clientData.id, {
      id: clientData.id,
      client_name: clientData.client_name,
      client_code: clientData.client_code,
      kam_name: kam?.full_name || 'Unknown',
      lastOrderDate: null,
      daysSinceLastOrder: null,
      totalOrders: scoped.length,
      totalRevenue: 0,
      ...computeClientPaymentTotals(scoped, paidByOrderId, discountByOrderId),
    });
  }

  const missingClientIds = Array.from(
    new Set(
      scopedOrders
        .map((order) => order.key_account_client_id)
        .filter((id): id is string => !!id && !clientById.has(id))
    )
  );

  if (missingClientIds.length > 0) {
    const sb = getSupabaseAdmin();
    for (const chunk of chunkIds(missingClientIds)) {
      const { data, error } = await sb
        .from('key_account_clients')
        .select('id, client_name, client_code')
        .in('id', chunk);
      if (error) throw error;
      for (const client of data || []) {
        const scoped = scopedOrders
          .filter((order) => order.key_account_client_id === client.id)
          .sort(
            (a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
          );
        const latest = scoped[0];
        clientById.set(client.id, {
          id: client.id,
          client_name: client.client_name,
          client_code: client.client_code,
          kam_name: latest ? relationName(latest.kam, 'full_name', 'You') : 'You',
          lastOrderDate: null,
          daysSinceLastOrder: null,
          totalOrders: scoped.length,
          totalRevenue: 0,
          ...computeClientPaymentTotals(scoped, paidByOrderId, discountByOrderId),
        });
      }
    }
  }

  const lastOrders = await fetchLastOrderDates(ctx, Array.from(clientById.keys()));
  for (const client of clientById.values()) {
    const lastOrderDate = lastOrders.get(client.id) ?? null;
    client.lastOrderDate = lastOrderDate;
    client.daysSinceLastOrder = daysSince(lastOrderDate);
  }

  return Array.from(clientById.values());
}

export async function getKADashboardOverview(
  ctx: UserContext,
  year: number
): Promise<KADashboardOverviewResult> {
  const dateStart = `${year}-01-01`;
  const dateEnd = `${year}-12-31`;
  const kamIds = await resolveOrderKamIds(ctx);
  const orders = await fetchDashboardOrders(ctx, kamIds, dateStart, dateEnd);
  const emptyMonthly = MONTH_NAMES.map((month) => ({ month, revenue: 0 }));

  if (ctx.role === 'key_account_manager') {
    const assignments = await loadKamAssignments([ctx.userId]);
    const lastOrders = await fetchLastOrderDates(
      ctx,
      assignments.map((row) => row.client_id),
      ctx.userId
    );
    const clients: KADashboardClientRow[] = [];

    for (const assignment of assignments) {
      const clientData = firstRelation(assignment.client);
      if (!clientData) continue;
      const yearOrders = orders.filter((order) => order.key_account_client_id === clientData.id);
      const deliveredRevenue = yearOrders
        .filter(isDeliveredRevenue)
        .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
      const lastOrderDate = lastOrders.get(clientData.id) ?? null;
      clients.push({
        id: clientData.id,
        client_name: clientData.client_name,
        client_code: clientData.client_code,
        kam_name: 'You',
        lastOrderDate,
        daysSinceLastOrder: daysSince(lastOrderDate),
        totalOrders: yearOrders.length,
        totalRevenue: deliveredRevenue,
        paidRevenue: 0,
        remainingBalance: 0,
        consignmentRevenue: 0,
        settlementDiscountRevenue: 0,
      });
    }

    const kamMonthly = emptyMonthly.map((row, index) => {
      const revenue = orders
        .filter((order) => isDeliveredRevenue(order) && new Date(order.order_date).getMonth() === index)
        .reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
      return { month: row.month, revenue };
    });

    return {
      stats: {
        totalClients: clients.length,
        totalOrders: orders.length,
        totalKAMs: 0,
        pendingOrders: orders.filter((order) => isPendingWorkflow(order.workflow_status)).length,
        consignmentOrders: 0,
        inactiveClients: countInactive(clients),
        totalRevenue: clients.reduce((sum, client) => sum + client.totalRevenue, 0),
      },
      revenue: emptyKADashboardRevenue(),
      kamMonthly,
      clients,
      orders: toOrderRows(orders),
    };
  }

  const payments = await fetchDashboardPayments(
    orders.filter(isKaAnalyticsSalesOrder).map((order) => order.id)
  );
  const revenue = computeDashboardRevenue(orders, payments, year);
  const yearClientIds = new Set(
    orders.map((order) => order.key_account_client_id).filter((id): id is string => Boolean(id))
  );

  if (ctx.role === 'sales_director') {
    const assignments = await loadDirectorAssignments(ctx);
    return {
      stats: {
        totalClients: yearClientIds.size,
        totalOrders: orders.length,
        totalKAMs: assignments.length,
        pendingOrders: revenue.pendingOrderCount,
        consignmentOrders: revenue.consignmentOrderCount,
        inactiveClients: 0,
        totalRevenue: revenue.summary.totalRevenue,
      },
      revenue,
      kamMonthly: emptyMonthly,
      clients: [],
      orders: [],
    };
  }

  const totalClients = await countActiveClients(ctx.companyId);
  return {
    stats: {
      totalClients,
      totalOrders: orders.length,
      totalKAMs: 0,
      pendingOrders: revenue.pendingOrderCount,
      consignmentOrders: revenue.consignmentOrderCount,
      inactiveClients: 0,
      totalRevenue: revenue.summary.totalRevenue,
    },
    revenue,
    kamMonthly: emptyMonthly,
    clients: [],
    orders: [],
  };
}

export async function getKADashboardTabs(
  ctx: UserContext,
  dateStart: string | null,
  dateEnd: string | null
): Promise<KADashboardTabsResult> {
  if (ctx.role !== 'sales_director') {
    return { team: [], clients: [], orders: [], inactiveClients: 0 };
  }

  const assignments = await loadDirectorAssignments(ctx);
  const kamIds = assignments.map((row) => row.kam_id);
  const orderScopeKamIds = Array.from(new Set([...kamIds, ctx.userId]));
  const orders = await fetchDashboardOrders(ctx, orderScopeKamIds, dateStart, dateEnd);
  const payments = await fetchDashboardPayments(
    orders.filter(isKaAnalyticsSalesOrder).map((order) => order.id)
  );
  const assignmentCounts = new Map<string, number>();
  const clientAssignments = await loadKamAssignments(kamIds);
  for (const row of clientAssignments) {
    assignmentCounts.set(row.kam_id, (assignmentCounts.get(row.kam_id) || 0) + 1);
  }

  const team: KADashboardKamRow[] = [];
  for (const assignment of assignments) {
    const kam = firstRelation(assignment.kam);
    if (!kam?.id) continue;
    const kamOrders = orders.filter((order) => order.kam_id === kam.id);
    const delivered = kamOrders.filter(isDeliveredRevenue);
    team.push({
      id: kam.id,
      full_name: kam.full_name || 'Unknown',
      email: kam.email || '',
      clientCount: assignmentCounts.get(kam.id) || 0,
      orderCount: kamOrders.length,
      deliveredOrderCount: delivered.length,
      totalRevenue: delivered.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0),
    });
  }

  const clients = await buildDirectorClients(ctx, kamIds, orders, payments);
  return {
    team,
    clients,
    orders: toOrderRows(orders),
    inactiveClients: countInactive(clients),
  };
}

export async function getKADashboardPurchaseBreakdown(
  ctx: UserContext,
  dateStart: string | null,
  dateEnd: string | null
): Promise<{ brands: KADashboardBrandBreakdown[] }> {
  if (ctx.role !== 'sales_head' && ctx.role !== 'sales_admin') {
    return { brands: [] };
  }

  const orders = await fetchDashboardOrders(ctx, null, dateStart, dateEnd);
  const salesOrderById = new Map(
    orders.filter(isKaAnalyticsSalesOrder).map((order) => [order.id, order])
  );
  const salesOrderIds = Array.from(salesOrderById.keys());
  if (salesOrderIds.length === 0) return { brands: [] };

  const sb = getSupabaseAdmin();
  type ItemRow = {
    purchase_order_id: string;
    quantity: number | null;
    unit_price: number | null;
    total_price: number | null;
    variants?:
      | {
          name: string | null;
          brands?: { name: string | null } | { name: string | null }[] | null;
        }
      | {
          name: string | null;
          brands?: { name: string | null } | { name: string | null }[] | null;
        }[]
      | null;
  };

  const items: ItemRow[] = [];
  for (const chunk of chunkIds(salesOrderIds)) {
    const rows = await fetchAllPaginated<ItemRow>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_items')
        .select(
          `
          purchase_order_id,
          quantity,
          unit_price,
          total_price,
          variants:variant_id (
            name,
            brands:brand_id (name)
          )
        `
        )
        .in('purchase_order_id', chunk)
        .range(from, to);
      return { data: (data as ItemRow[] | null) ?? null, error };
    });
    items.push(...rows);
  }

  type Acc = {
    name: string;
    quantity: number;
    revenue: number;
    orderIds: Set<string>;
  };
  const addValue = (map: Map<string, Acc>, name: string, quantity: number, revenue: number, orderId: string) => {
    const existing = map.get(name) || {
      name,
      quantity: 0,
      revenue: 0,
      orderIds: new Set<string>(),
    };
    existing.quantity += quantity;
    existing.revenue += revenue;
    existing.orderIds.add(orderId);
    map.set(name, existing);
  };
  const toRows = (map: Map<string, Acc>): KADashboardBreakdownRow[] =>
    Array.from(map.values())
      .map((row) => ({
        name: row.name,
        quantity: row.quantity,
        revenue: row.revenue,
        orderCount: row.orderIds.size,
      }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);

  const brandMap = new Map<
    string,
    {
      name: string;
      quantity: number;
      revenue: number;
      orderIds: Set<string>;
      clientIds: Set<string>;
      variants: Map<string, Acc>;
      clients: Map<string, Acc>;
    }
  >();

  items.forEach((item) => {
    const order = salesOrderById.get(item.purchase_order_id);
    if (!order) return;
    const variant = firstRelation(item.variants);
    const brandName = firstRelation(variant?.brands)?.name || 'Unknown Brand';
    const variantName = variant?.name || 'Unknown Variant';
    const clientName = relationName(order.client, 'client_name', 'Unassigned Client');
    const clientKey = order.key_account_client_id || clientName;
    const quantity = Number(item.quantity || 0);
    const revenue = Number(item.total_price ?? quantity * Number(item.unit_price || 0));
    const brand = brandMap.get(brandName) || {
      name: brandName,
      quantity: 0,
      revenue: 0,
      orderIds: new Set<string>(),
      clientIds: new Set<string>(),
      variants: new Map<string, Acc>(),
      clients: new Map<string, Acc>(),
    };
    brand.quantity += quantity;
    brand.revenue += revenue;
    brand.orderIds.add(item.purchase_order_id);
    brand.clientIds.add(clientKey);
    addValue(brand.variants, variantName, quantity, revenue, item.purchase_order_id);
    addValue(brand.clients, clientName, quantity, revenue, item.purchase_order_id);
    brandMap.set(brandName, brand);
  });

  const brands = Array.from(brandMap.values())
    .map((brand) => ({
      name: brand.name,
      quantity: brand.quantity,
      revenue: brand.revenue,
      orderCount: brand.orderIds.size,
      clientCount: brand.clientIds.size,
      variants: toRows(brand.variants),
      clients: toRows(brand.clients),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10);

  return { brands };
}
