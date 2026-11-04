import { HttpError } from '../../http/errors';
import type { MotoSalesContext } from '../../auth/requireMotoSalesContext';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

/** Orders with order_date before this are v1 imports; exclude from remittance history amounts. */
const V1_IMPORT_ORDER_DATE_CUTOFF = '2026-02-16';

/** Match MyInventory Sold/remit tab: only orders on or after this date. */
const SOLD_TAB_ORDER_DATE_THRESHOLD = '2026-02-17';

export type AgentPendingRemittanceSummary = {
  cashChequeOrdersCount: number;
  cashChequeAmount: number;
  bankOrdersCount: number;
  bankAmount: number;
  totalOrdersCount: number;
};

export type AgentRemittanceSummary = {
  id: string;
  remittanceDate: string;
  remittedAt: string;
  itemsRemitted: number;
  totalUnits: number;
  ordersCount: number;
  /** Cash + cheque portions only (recalculated from linked orders). */
  remittedAmount: number;
  hasSignature: boolean;
  orderIds: string[];
};

export type AgentRemittanceOrderLine = {
  orderId: string;
  orderNumber: string;
  clientName: string;
  orderDate: string | null;
  paymentMethod: string | null;
  paymentMode: string | null;
  cashPortion: number;
  chequePortion: number;
  remittedAmount: number;
  fullOrderTotal: number;
  nonCashPortion?: number;
  nonCashLabel?: string;
  items: Array<{
    brandName: string;
    variantName: string;
    quantity: number;
  }>;
};

export type AgentRemittanceDetail = {
  id: string;
  remittanceDate: string;
  remittedAt: string;
  itemsRemitted: number;
  totalUnits: number;
  ordersCount: number;
  remittedAmount: number;
  signatureUrl: string | null;
  orders: AgentRemittanceOrderLine[];
};

type PaymentSplit = {
  method?: string;
  amount?: number;
  bank?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nestedRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function nestedRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === 'object') return [asRecord(value)];
  return [];
}

function computePaymentPortions(order: {
  total_amount?: number | null;
  payment_method?: string | null;
  payment_mode?: string | null;
  payment_splits?: unknown;
}): {
  cashPortion: number;
  chequePortion: number;
  nonCashPortion: number;
  nonCashLabels: string[];
  remittedAmount: number;
} {
  const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
  const paymentMethod = order.payment_method as
    | 'GCASH'
    | 'BANK_TRANSFER'
    | 'CASH'
    | 'CHEQUE'
    | null;
  const splits = Array.isArray(order.payment_splits)
    ? (order.payment_splits as PaymentSplit[])
    : [];

  let cashPortion = 0;
  let chequePortion = 0;
  let nonCashPortion = 0;
  const nonCashLabels: string[] = [];

  if (paymentMode === 'SPLIT') {
    splits.forEach((s) => {
      const amount = Number(s.amount) || 0;
      if (s.method === 'CASH') {
        cashPortion += amount;
      } else if (s.method === 'CHEQUE') {
        chequePortion += amount;
      } else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
        nonCashPortion += amount;
        if (s.method === 'BANK_TRANSFER') {
          if (s.bank && !nonCashLabels.includes(s.bank)) nonCashLabels.push(s.bank);
          else if (!s.bank && !nonCashLabels.includes('Bank Transfer')) {
            nonCashLabels.push('Bank Transfer');
          }
        } else if (s.method === 'GCASH' && !nonCashLabels.includes('GCash')) {
          nonCashLabels.push('GCash');
        }
      }
    });
  } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
    const amt = Number(order.total_amount) || 0;
    if (paymentMethod === 'CASH') cashPortion = amt;
    else chequePortion = amt;
  } else if (paymentMethod === 'BANK_TRANSFER' || paymentMethod === 'GCASH') {
    nonCashPortion = Number(order.total_amount) || 0;
    nonCashLabels.push(paymentMethod === 'GCASH' ? 'GCash' : 'Bank Transfer');
  }

  return {
    cashPortion,
    chequePortion,
    nonCashPortion,
    nonCashLabels,
    remittedAmount: cashPortion + chequePortion,
  };
}

function isV1ImportOrder(orderDate: string | null | undefined): boolean {
  return !!orderDate && orderDate < V1_IMPORT_ORDER_DATE_CUTOFF;
}

async function loadOrdersByIds(orderIds: string[]) {
  if (orderIds.length === 0) return [];

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('client_orders')
    .select(
      `
      id,
      order_number,
      order_date,
      total_amount,
      payment_method,
      payment_mode,
      payment_splits,
      clients(name),
      items:client_order_items(
        quantity,
        variant:variants(name, brand:brands(name))
      )
    `
    )
    .in('id', orderIds);

  if (error) throw new HttpError(500, error.message || 'Failed to load remittance orders');
  return data || [];
}

function mapOrderLine(order: Record<string, unknown>): AgentRemittanceOrderLine | null {
  const orderDate = order.order_date == null ? null : String(order.order_date);
  if (isV1ImportOrder(orderDate)) return null;

  const portions = computePaymentPortions({
    total_amount: order.total_amount as number | null,
    payment_method: order.payment_method as string | null,
    payment_mode: order.payment_mode as string | null,
    payment_splits: order.payment_splits,
  });

  const client = nestedRecord(order.clients);
  const items = nestedRows(order.items).map((item) => {
    const variant = nestedRecord(item.variant ?? item.variants);
    const brand = nestedRecord(variant.brand ?? variant.brands);
    return {
      brandName: String(brand.name || 'Unknown'),
      variantName: String(variant.name || 'Unknown'),
      quantity: Number(item.quantity) || 0,
    };
  });

  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number || ''),
    clientName: String(client.name || 'Unknown'),
    orderDate,
    paymentMethod: order.payment_method == null ? null : String(order.payment_method),
    paymentMode: order.payment_mode == null ? null : String(order.payment_mode),
    cashPortion: portions.cashPortion,
    chequePortion: portions.chequePortion,
    remittedAmount: portions.remittedAmount,
    fullOrderTotal: Number(order.total_amount) || 0,
    nonCashPortion: portions.nonCashPortion > 0 ? portions.nonCashPortion : undefined,
    nonCashLabel:
      portions.nonCashLabels.length > 0 ? portions.nonCashLabels.join(' + ') : undefined,
    items,
  };
}

/**
 * Unremitted orders awaiting agent remittance — same rules as MyInventoryPage.fetchUnremittedOrders.
 * Dashboard "To Remit" uses cash/cheque counts; bank-only orders are included for completeness.
 */
export async function getAgentPendingRemittance(
  ctx: MotoSalesContext
): Promise<{ pending: AgentPendingRemittanceSummary }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('client_orders')
    .select(
      `
      id,
      order_date,
      total_amount,
      payment_method,
      payment_mode,
      payment_splits,
      deposit_id,
      cash_deposit:cash_deposits!client_orders_deposit_id_fkey(
        id,
        status
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .eq('agent_id', ctx.userId)
    .eq('remitted', false)
    .order('created_at', { ascending: false });

  if (error) throw new HttpError(500, error.message || 'Failed to load pending remittances');

  let cashChequeOrdersCount = 0;
  let cashChequeAmount = 0;
  let bankOrdersCount = 0;
  let bankAmount = 0;

  for (const raw of data || []) {
    const order = asRecord(raw);
    const totalAmount = Number(order.total_amount) || 0;
    if (totalAmount === 0) continue;

    const deposit = nestedRecord(order.cash_deposit);
    if (order.deposit_id && deposit.status === 'verified') continue;

    const orderDate = order.order_date == null ? null : String(order.order_date);
    if (!orderDate || orderDate < SOLD_TAB_ORDER_DATE_THRESHOLD) continue;

    const portions = computePaymentPortions({
      total_amount: totalAmount,
      payment_method: order.payment_method as string | null,
      payment_mode: order.payment_mode as string | null,
      payment_splits: order.payment_splits,
    });

    if (portions.cashPortion > 0 || portions.chequePortion > 0) {
      cashChequeOrdersCount += 1;
      cashChequeAmount += portions.remittedAmount;
    } else if (
      order.payment_method === 'BANK_TRANSFER' ||
      order.payment_method === 'GCASH'
    ) {
      bankOrdersCount += 1;
      bankAmount += portions.nonCashPortion || totalAmount;
    }
  }

  return {
    pending: {
      cashChequeOrdersCount,
      cashChequeAmount,
      bankOrdersCount,
      bankAmount,
      totalOrdersCount: cashChequeOrdersCount + bankOrdersCount,
    },
  };
}

export async function listAgentRemittances(
  ctx: MotoSalesContext,
  options?: { date?: string }
): Promise<{ remittances: AgentRemittanceSummary[] }> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('remittances_log')
    .select(
      `
      id,
      remittance_date,
      remitted_at,
      items_remitted,
      total_units,
      orders_count,
      total_revenue,
      order_ids,
      signature_url
    `
    )
    .eq('company_id', ctx.companyId)
    .eq('agent_id', ctx.userId)
    .order('remitted_at', { ascending: false });

  if (options?.date) {
    query = query.eq('remittance_date', options.date);
  }

  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message || 'Failed to load remittances');

  const rows = data || [];
  const allOrderIds = Array.from(
    new Set(rows.flatMap((row: { order_ids?: string[] }) => row.order_ids || []))
  );

  const orders = await loadOrdersByIds(allOrderIds);
  const remittedByOrderId: Record<string, number> = {};
  const importedOrderIds = new Set<string>();

  for (const order of orders) {
    const orderDate = (order as { order_date?: string | null }).order_date ?? null;
    if (isV1ImportOrder(orderDate)) {
      importedOrderIds.add(String((order as { id: string }).id));
      continue;
    }
    const portions = computePaymentPortions(order as {
      total_amount?: number | null;
      payment_method?: string | null;
      payment_mode?: string | null;
      payment_splits?: unknown;
    });
    remittedByOrderId[String((order as { id: string }).id)] = portions.remittedAmount;
  }

  const remittances: AgentRemittanceSummary[] = rows.map(
    (row: {
      id: string;
      remittance_date: string;
      remitted_at: string;
      items_remitted: number;
      total_units: number;
      order_ids?: string[];
      signature_url?: string | null;
    }) => {
      const orderIds = row.order_ids || [];
      const nonImportedIds = orderIds.filter((id) => !importedOrderIds.has(id));
      const remittedAmount = nonImportedIds.reduce(
        (sum, id) => sum + (remittedByOrderId[id] || 0),
        0
      );

      return {
        id: String(row.id),
        remittanceDate: String(row.remittance_date),
        remittedAt: String(row.remitted_at),
        itemsRemitted: Number(row.items_remitted) || 0,
        totalUnits: Number(row.total_units) || 0,
        ordersCount: nonImportedIds.length,
        remittedAmount: nonImportedIds.length === 0 ? 0 : remittedAmount,
        hasSignature: !!row.signature_url,
        orderIds,
      };
    }
  );

  return { remittances };
}

export async function getAgentRemittanceDetail(
  ctx: MotoSalesContext,
  remittanceId: string
): Promise<{ remittance: AgentRemittanceDetail }> {
  if (!remittanceId) throw new HttpError(400, 'Remittance id is required');

  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from('remittances_log')
    .select(
      `
      id,
      agent_id,
      company_id,
      remittance_date,
      remitted_at,
      items_remitted,
      total_units,
      orders_count,
      order_ids,
      signature_url
    `
    )
    .eq('id', remittanceId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message || 'Failed to load remittance');
  if (!row) throw new HttpError(404, 'Remittance not found');
  if (String(row.agent_id) !== ctx.userId) {
    throw new HttpError(403, 'You can only view your own remittances');
  }

  const orderIds: string[] = Array.isArray(row.order_ids) ? row.order_ids : [];
  const ordersRaw = await loadOrdersByIds(orderIds);
  const orders = ordersRaw
    .map((order) => mapOrderLine(asRecord(order)))
    .filter((line): line is AgentRemittanceOrderLine => !!line);

  const remittedAmount = orders.reduce((sum, o) => sum + o.remittedAmount, 0);

  return {
    remittance: {
      id: String(row.id),
      remittanceDate: String(row.remittance_date),
      remittedAt: String(row.remitted_at),
      itemsRemitted: Number(row.items_remitted) || 0,
      totalUnits: Number(row.total_units) || 0,
      ordersCount: orders.length,
      remittedAmount,
      signatureUrl: row.signature_url == null ? null : String(row.signature_url),
      orders,
    },
  };
}
