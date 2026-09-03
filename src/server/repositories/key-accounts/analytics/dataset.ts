import { fetchAllPaginated } from '../../../../lib/supabasePaginate';
import { HttpError } from '../../../http/errors';
import { getSupabaseAdmin } from '../../../db/supabaseAdmin';
import type { UserContext } from '../purchase-order';
import {
  chunkIds,
  isKaCommercialProductOrder,
  isPartialDeliveredPo,
  isRebateDerivedPo,
} from './shared';

export type KAAnalyticsDataset = {
  orders: Record<string, unknown>[];
  items: Record<string, unknown>[];
  people: Record<string, unknown>[];
  clients: Record<string, unknown>[];
  payments: Array<{
    purchase_order_id: string;
    amount: number | null;
    settlement_discount: number | null;
    created_at: string;
  }>;
  paidByOrderId: Record<string, number>;
  rebates: Record<string, unknown>[];
  transferReservations: Array<{
    purchase_order_id: string;
    warehouse_location_id: string;
    variant_id: string;
    quantity_reserved: number;
    quantity_fulfilled: number;
  }>;
  transferLocationStatuses: Array<{
    purchase_order_id: string;
    warehouse_location_id: string;
    status: string;
  }>;
};

function applyKamScope<T extends { or: (filter: string) => T }>(query: T, ctx: UserContext) {
  if (ctx.role !== 'key_account_manager') return query;
  return query.or(`created_by.eq.${ctx.userId},kam_id.eq.${ctx.userId}`);
}

async function fetchInChunks<T>(
  ids: string[],
  fetchChunk: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const all: T[] = [];
  for (const chunk of chunkIds(ids)) {
    all.push(...(await fetchChunk(chunk)));
  }
  return all;
}

export async function getKAAnalyticsDataset(ctx: UserContext): Promise<KAAnalyticsDataset> {
  const sb = getSupabaseAdmin();

  const [orders, people, clients] = await Promise.all([
    fetchAllPaginated<Record<string, unknown>>(async (from, to) => {
      let query = sb
        .from('purchase_orders')
        .select(
          `
          id,
          po_number,
          order_date,
          total_amount,
          subtotal,
          status,
          workflow_status,
          po_order_kind,
          source_rebate_id,
          fulfillment_type,
          warehouse_location_id,
          kam_id,
          created_by,
          key_account_client_id,
          key_account_shop_id,
          key_account_payment_status,
          key_account_payment_mode,
          client:key_account_clients(client_name),
          shop:key_account_shops(id, shop_name, city, province, region),
          address:key_account_delivery_addresses(city, province, region),
          kam:profiles!purchase_orders_kam_id_fkey(full_name,email,role)
        `
        )
        .eq('company_id', ctx.companyId)
        .eq('company_account_type', 'Key Accounts')
        .order('order_date', { ascending: false })
        .order('id', { ascending: false });
      query = applyKamScope(query, ctx);
      const { data, error } = await query.range(from, to);
      return { data: (data as Record<string, unknown>[] | null) ?? null, error };
    }),
    sb
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('company_id', ctx.companyId)
      .in('role', ['key_account_manager', 'sales_director'])
      .order('full_name', { ascending: true }),
    sb
      .from('key_account_clients')
      .select('id, client_name, client_code')
      .eq('company_id', ctx.companyId)
      .order('client_name', { ascending: true }),
  ]);

  if (people.error) throw people.error;
  if (clients.error) throw clients.error;

  const productAnalyticsOrderIds = orders
    .filter((row) => isKaCommercialProductOrder(row as Parameters<typeof isKaCommercialProductOrder>[0]))
    .map((row) => String(row.id));

  const items = await fetchInChunks(productAnalyticsOrderIds, async (chunk) =>
    fetchAllPaginated<Record<string, unknown>>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_items')
        .select(
          `
          id,
          purchase_order_id,
          variant_id,
          warehouse_location_id,
          quantity,
          unit_price,
          total_price,
          variants:variant_id (
            name,
            variant_type,
            brands:brand_id (name)
          )
        `
        )
        .in('purchase_order_id', chunk)
        .range(from, to);
      return { data: (data as Record<string, unknown>[] | null) ?? null, error };
    })
  );

  const salesOrderIds = orders.map((row) => String(row.id));
  const payments = await fetchInChunks(salesOrderIds, async (chunk) =>
    fetchAllPaginated<{
      purchase_order_id: string;
      amount: number | null;
      settlement_discount: number | null;
      created_at: string;
    }>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_key_account_payments')
        .select('purchase_order_id, amount, settlement_discount, created_at')
        .in('purchase_order_id', chunk)
        .range(from, to);
      return { data, error };
    })
  );

  const paidByOrderId: Record<string, number> = {};
  for (const row of payments) {
    const id = row.purchase_order_id;
    paidByOrderId[id] = (paidByOrderId[id] || 0) + (Number(row.amount) || 0);
  }

  const sourcePoIdsForRebates = orders
    .filter((row) => !isRebateDerivedPo(row as Parameters<typeof isRebateDerivedPo>[0]))
    .map((row) => String(row.id));

  const rebates = await fetchInChunks(sourcePoIdsForRebates, async (chunk) =>
    fetchAllPaginated<Record<string, unknown>>(async (from, to) => {
      const { data, error } = await sb
        .from('key_account_po_rebates')
        .select(
          `
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
        `
        )
        .in('purchase_order_id', chunk)
        .in('status', ['submitted', 'approved', 'executed'])
        .range(from, to);
      return { data: (data as Record<string, unknown>[] | null) ?? null, error };
    })
  );

  const reservationPoIds = new Set<string>(
    orders
      .filter((row) => isPartialDeliveredPo(row as { workflow_status?: string | null }))
      .map((row) => String(row.id))
  );
  for (const rebate of rebates) {
    const resolution = String(rebate.resolution_type || '');
    if (resolution !== 'replacement' && resolution !== 'mixed') continue;
    const fulfillmentId = rebate.fulfillment_purchase_order_id;
    if (typeof fulfillmentId === 'string' && fulfillmentId) reservationPoIds.add(fulfillmentId);
  }

  let transferReservations: KAAnalyticsDataset['transferReservations'] = [];
  let transferLocationStatuses: KAAnalyticsDataset['transferLocationStatuses'] = [];
  if (reservationPoIds.size > 0) {
    const poIds = [...reservationPoIds];
    transferReservations = await fetchInChunks(poIds, async (chunk) =>
      fetchAllPaginated<KAAnalyticsDataset['transferReservations'][number]>(async (from, to) => {
        const { data, error } = await sb
          .from('warehouse_transfer_reservations')
          .select(
            'purchase_order_id, warehouse_location_id, variant_id, quantity_reserved, quantity_fulfilled'
          )
          .in('purchase_order_id', chunk)
          .range(from, to);
        return { data, error };
      })
    );
    transferLocationStatuses = await fetchInChunks(poIds, async (chunk) =>
      fetchAllPaginated<KAAnalyticsDataset['transferLocationStatuses'][number]>(async (from, to) => {
        const { data, error } = await sb
          .from('warehouse_transfer_location_status')
          .select('purchase_order_id, warehouse_location_id, status')
          .in('purchase_order_id', chunk)
          .range(from, to);
        return { data, error };
      })
    );
  }

  return {
    orders,
    items,
    people: (people.data || []) as Record<string, unknown>[],
    clients: (clients.data || []) as Record<string, unknown>[],
    payments,
    paidByOrderId,
    rebates,
    transferReservations,
    transferLocationStatuses,
  };
}

export async function getKAAnalyticsPoPaymentHistory(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  const { data: po, error: poError } = await sb
    .from('purchase_orders')
    .select('id, company_id, kam_id, created_by')
    .eq('id', poId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (poError) throw poError;
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (
    ctx.role === 'key_account_manager' &&
    po.kam_id !== ctx.userId &&
    po.created_by !== ctx.userId
  ) {
    throw new HttpError(404, 'Purchase order not found');
  }

  const rows = await fetchAllPaginated<{
    id: string;
    amount: number | null;
    settlement_discount: number | null;
    created_at: string;
    payment_method: string | null;
    bank_type: string | null;
    recorder: unknown;
  }>(async (from, to) => {
    const { data, error } = await sb
      .from('purchase_order_key_account_payments')
      .select(
        `
        id,
        amount,
        settlement_discount,
        created_at,
        payment_method,
        bank_type,
        recorder:profiles!purchase_order_key_account_payments_recorded_by_fkey(full_name,email)
      `
      )
      .eq('purchase_order_id', poId)
      .order('created_at', { ascending: true })
      .range(from, to);
    return { data, error };
  });

  const paid = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const discount = rows.reduce((sum, row) => sum + Number(row.settlement_discount || 0), 0);
  const cashEntries = rows.filter((row) => (Number(row.amount) || 0) > 0).length;
  return { payments: rows, paid, discount, cashEntries };
}

export async function getKAAnalyticsRebateSource(ctx: UserContext, rebateId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_po_rebates')
    .select(
      'rebate_number, source_po:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number, company_id)'
    )
    .eq('id', rebateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { rebateNumber: null as string | null, sourcePoNumber: null as string | null };
  const src = data.source_po as
    | { po_number?: string; company_id?: string }
    | { po_number?: string; company_id?: string }[]
    | null;
  const poRow = Array.isArray(src) ? src[0] : src;
  if (!poRow || poRow.company_id !== ctx.companyId) {
    return { rebateNumber: null, sourcePoNumber: null };
  }
  return {
    rebateNumber: (data.rebate_number as string | null) ?? null,
    sourcePoNumber: poRow.po_number ?? null,
  };
}
