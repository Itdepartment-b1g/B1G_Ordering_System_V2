import { fetchAllPaginated } from '../../../../lib/supabasePaginate';
import { HttpError } from '../../../http/errors';
import { getSupabaseAdmin } from '../../../db/supabaseAdmin';
import type { UserContext } from '../purchase-order';
import {
  chunkIds,
  inDateRange,
  isConsignmentPo,
  isKaAnalyticsSalesOrder,
  money,
  parseRangeBound,
  paymentStatus,
  firstRelation,
} from './shared';

export type KAAnalyticsPaidBrandRow = {
  brandId: string;
  brandName: string;
  billed: number;
  paid: number;
  discount: number;
  remaining: number;
  quantity: number;
  orderCount: number;
  status: 'unpaid' | 'partial' | 'paid';
};

export type KAAnalyticsPaidVariantRow = {
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  billed: number;
  paid: number;
  discount: number;
  remaining: number;
  quantity: number;
  orderCount: number;
};

export type KAProductPaidByBrandResult = {
  brands: KAAnalyticsPaidBrandRow[];
  variants: KAAnalyticsPaidVariantRow[];
  unallocatedPaid: number;
  unallocatedDiscount: number;
  poCount: number;
};

type PoRow = {
  id: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind: string | null;
  source_rebate_id: string | null;
  kam_id: string | null;
  created_by: string | null;
  key_account_client_id: string | null;
};

type ItemRow = {
  id: string;
  purchase_order_id: string;
  variant_id: string | null;
  total_price: number | null;
  quantity: number | null;
  unit_price: number | null;
  variants?:
    | {
        id?: string;
        name?: string | null;
        brand_id?: string | null;
        brands?: { id?: string; name?: string | null } | { id?: string; name?: string | null }[] | null;
      }
    | {
        id?: string;
        name?: string | null;
        brand_id?: string | null;
        brands?: { id?: string; name?: string | null } | { id?: string; name?: string | null }[] | null;
      }[]
    | null;
};

type PaymentRow = {
  id: string;
  purchase_order_id: string;
  amount: number | null;
  settlement_discount: number | null;
  created_at: string;
};

type AllocRow = {
  payment_id: string;
  purchase_order_item_id: string;
  allocated_amount: number | null;
  allocated_discount: number | null;
};

function isMissingAllocationsTable(error: unknown) {
  const message = String((error as { message?: string })?.message || error || '');
  return (
    /purchase_order_key_account_payment_allocations/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

function applyKamScope<T extends { or: (filter: string) => T }>(query: T, ctx: UserContext) {
  if (ctx.role !== 'key_account_manager') return query;
  return query.or(`created_by.eq.${ctx.userId},kam_id.eq.${ctx.userId}`);
}

export async function getKAProductPaidByBrand(
  ctx: UserContext,
  dateStart?: string | null,
  dateEnd?: string | null,
  clientId?: string | null
): Promise<KAProductPaidByBrandResult> {
  const start = parseRangeBound(dateStart);
  const end = parseRangeBound(dateEnd);
  const clientFilter = String(clientId || '').trim();
  const sb = getSupabaseAdmin();

  const poRows = await fetchAllPaginated<PoRow>(async (from, to) => {
    let query = sb
      .from('purchase_orders')
      .select(
        'id, order_date, total_amount, status, workflow_status, po_order_kind, source_rebate_id, kam_id, created_by, key_account_client_id'
      )
      .eq('company_id', ctx.companyId)
      .eq('company_account_type', 'Key Accounts')
      .order('order_date', { ascending: false })
      .order('id', { ascending: false });
    query = applyKamScope(query, ctx);
    if (clientFilter) query = query.eq('key_account_client_id', clientFilter);
    const { data, error } = await query.range(from, to);
    return { data: (data as PoRow[] | null) ?? null, error };
  });

  const salesPos = poRows.filter(isKaAnalyticsSalesOrder);
  const poById = new Map(salesPos.map((po) => [po.id, po]));

  const orderDateInRangeIds = salesPos
    .filter((po) => inDateRange(po.order_date, start, end))
    .map((po) => po.id);

  const consignmentIds = salesPos.filter(isConsignmentPo).map((po) => po.id);
  const consignmentOutsideRange = consignmentIds.filter((id) => !orderDateInRangeIds.includes(id));

  const lifetimePayments = await loadPayments(sb, orderDateInRangeIds);
  const consignmentPeriodPayments = await loadPayments(
    sb,
    consignmentOutsideRange,
    start,
    end
  );

  const extraConsignmentIds = new Set<string>();
  for (const pay of consignmentPeriodPayments) {
    const po = poById.get(pay.purchase_order_id);
    if (!po || !isConsignmentPo(po)) continue;
    extraConsignmentIds.add(po.id);
  }

  const relevantPoIds = [...new Set([...orderDateInRangeIds, ...extraConsignmentIds])];
  if (relevantPoIds.length === 0) {
    return { brands: [], variants: [], unallocatedPaid: 0, unallocatedDiscount: 0, poCount: 0 };
  }

  const relevantPayments = [...lifetimePayments, ...consignmentPeriodPayments];
  const items = await loadItems(sb, relevantPoIds);
  const allocations = await loadAllocations(
    sb,
    relevantPayments.map((row) => row.id)
  );
  const pendingByItem = await loadPendingDiscountByItem(sb, relevantPoIds);

  const itemById = new Map(items.map((row) => [row.id, row]));
  const allocsByPayment = new Map<string, AllocRow[]>();
  const lifetimeByItem = new Map<string, { paid: number; discount: number }>();
  for (const alloc of allocations) {
    const list = allocsByPayment.get(alloc.payment_id) || [];
    list.push(alloc);
    allocsByPayment.set(alloc.payment_id, list);
    const current = lifetimeByItem.get(alloc.purchase_order_item_id) || { paid: 0, discount: 0 };
    current.paid = money(current.paid + Number(alloc.allocated_amount || 0));
    current.discount = money(current.discount + Number(alloc.allocated_discount || 0));
    lifetimeByItem.set(alloc.purchase_order_item_id, current);
  }

  type Acc = {
    brandId: string;
    brandName: string;
    variantId: string;
    variantName: string;
    billed: number;
    paid: number;
    discount: number;
    remaining: number;
    quantity: number;
    orderIds: Set<string>;
  };
  const variantMap = new Map<string, Acc>();

  const touchVariant = (item: ItemRow) => {
    const variant = firstRelation(item.variants);
    const brand = firstRelation(variant?.brands as { id?: string; name?: string | null } | null);
    const brandId = String(brand?.id || variant?.brand_id || 'unknown');
    const brandName = String(brand?.name || 'Unknown');
    const variantId = String(variant?.id || item.variant_id || item.id);
    const variantName = String(variant?.name || 'Unknown');
    const key = `${brandId}::${variantId}`;
    const existing = variantMap.get(key);
    if (existing) return existing;
    const created: Acc = {
      brandId,
      brandName,
      variantId,
      variantName,
      billed: 0,
      paid: 0,
      discount: 0,
      remaining: 0,
      quantity: 0,
      orderIds: new Set<string>(),
    };
    variantMap.set(key, created);
    return created;
  };

  for (const item of items) {
    const po = poById.get(item.purchase_order_id);
    if (!po) continue;
    if (!inDateRange(po.order_date, start, end)) continue;
    const billed = money(
      Number(item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0))
    );
    const applied = lifetimeByItem.get(item.id) || { paid: 0, discount: 0 };
    const pending = pendingByItem.get(item.id) || 0;
    const remaining = money(Math.max(0, billed - applied.paid - applied.discount - pending));
    const acc = touchVariant(item);
    acc.billed = money(acc.billed + billed);
    acc.remaining = money(acc.remaining + remaining);
    acc.quantity += Number(item.quantity || 0);
    acc.orderIds.add(item.purchase_order_id);
  }

  for (const pay of relevantPayments) {
    const po = poById.get(pay.purchase_order_id);
    if (!po) continue;
    const consignment = isConsignmentPo(po);
    const countPaid =
      consignment
        ? inDateRange(pay.created_at, start, end)
        : inDateRange(po.order_date, start, end);
    if (!countPaid) continue;

    const payAllocs = allocsByPayment.get(pay.id) || [];
    for (const alloc of payAllocs) {
      const item = itemById.get(alloc.purchase_order_item_id);
      if (!item) continue;
      const acc = touchVariant(item);
      acc.paid = money(acc.paid + Number(alloc.allocated_amount || 0));
      acc.discount = money(acc.discount + Number(alloc.allocated_discount || 0));
      acc.orderIds.add(item.purchase_order_id);
    }
  }

  let unallocatedPaid = 0;
  let unallocatedDiscount = 0;
  for (const pay of relevantPayments) {
    const po = poById.get(pay.purchase_order_id);
    if (!po) continue;
    const consignment = isConsignmentPo(po);
    const count =
      consignment
        ? inDateRange(pay.created_at, start, end)
        : inDateRange(po.order_date, start, end);
    if (!count) continue;
    const payAllocs = allocsByPayment.get(pay.id) || [];
    const allocatedPaid = money(
      payAllocs.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0)
    );
    const allocatedDiscount = money(
      payAllocs.reduce((sum, row) => sum + Number(row.allocated_discount || 0), 0)
    );
    unallocatedPaid = money(
      unallocatedPaid + Math.max(0, Number(pay.amount || 0) - allocatedPaid)
    );
    unallocatedDiscount = money(
      unallocatedDiscount + Math.max(0, Number(pay.settlement_discount || 0) - allocatedDiscount)
    );
  }

  const variants: KAAnalyticsPaidVariantRow[] = [...variantMap.values()]
    .filter((row) => row.billed > 0.001 || row.paid > 0.001 || row.discount > 0.001)
    .sort(
      (a, b) =>
        a.brandName.localeCompare(b.brandName) || a.variantName.localeCompare(b.variantName)
    )
    .map((row) => ({
      brandId: row.brandId,
      brandName: row.brandName,
      variantId: row.variantId,
      variantName: row.variantName,
      billed: row.billed,
      paid: row.paid,
      discount: row.discount,
      remaining: row.remaining,
      quantity: row.quantity,
      orderCount: row.orderIds.size,
    }));

  const brandMap = new Map<
    string,
    KAAnalyticsPaidBrandRow & { orderIds: Set<string> }
  >();
  for (const row of variants) {
    const source = variantMap.get(`${row.brandId}::${row.variantId}`);
    const existing = brandMap.get(row.brandId);
    if (!existing) {
      brandMap.set(row.brandId, {
        brandId: row.brandId,
        brandName: row.brandName,
        billed: row.billed,
        paid: row.paid,
        discount: row.discount,
        remaining: row.remaining,
        quantity: row.quantity,
        orderCount: 0,
        status: 'unpaid',
        orderIds: new Set(source?.orderIds || []),
      });
      continue;
    }
    existing.billed = money(existing.billed + row.billed);
    existing.paid = money(existing.paid + row.paid);
    existing.discount = money(existing.discount + row.discount);
    existing.remaining = money(existing.remaining + row.remaining);
    existing.quantity += row.quantity;
    source?.orderIds.forEach((id) => existing.orderIds.add(id));
  }

  const allOrderIds = new Set<string>();
  const brands = [...brandMap.values()]
    .map((brand) => {
      brand.orderIds.forEach((id) => allOrderIds.add(id));
      return {
        brandId: brand.brandId,
        brandName: brand.brandName,
        billed: brand.billed,
        paid: brand.paid,
        discount: brand.discount,
        remaining: brand.remaining,
        quantity: brand.quantity,
        orderCount: brand.orderIds.size,
        status: paymentStatus(brand.paid, brand.discount, brand.remaining),
      };
    })
    .sort((a, b) => a.brandName.localeCompare(b.brandName));

  return {
    brands,
    variants,
    unallocatedPaid,
    unallocatedDiscount,
    poCount: allOrderIds.size,
  };
}

async function loadPayments(
  sb: ReturnType<typeof getSupabaseAdmin>,
  poIds: string[],
  start?: Date | null,
  end?: Date | null
): Promise<PaymentRow[]> {
  if (poIds.length === 0) return [];
  const all: PaymentRow[] = [];
  for (const chunk of chunkIds(poIds)) {
    const rows = await fetchAllPaginated<PaymentRow>(async (from, to) => {
      let query = sb
        .from('purchase_order_key_account_payments')
        .select('id, purchase_order_id, amount, settlement_discount, created_at')
        .in('purchase_order_id', chunk)
        .range(from, to);
      if (start) query = query.gte('created_at', start.toISOString());
      if (end) query = query.lte('created_at', end.toISOString());
      const { data, error } = await query;
      return { data: (data as PaymentRow[] | null) ?? null, error };
    });
    all.push(...rows);
  }
  return all;
}

async function loadItems(
  sb: ReturnType<typeof getSupabaseAdmin>,
  poIds: string[]
): Promise<ItemRow[]> {
  if (poIds.length === 0) return [];
  const all: ItemRow[] = [];
  for (const chunk of chunkIds(poIds)) {
    const rows = await fetchAllPaginated<ItemRow>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_items')
        .select(
          `
          id,
          purchase_order_id,
          variant_id,
          total_price,
          quantity,
          unit_price,
          variants:variant_id (
            id,
            name,
            brand_id,
            brands:brand_id ( id, name )
          )
        `
        )
        .in('purchase_order_id', chunk)
        .range(from, to);
      return { data: (data as ItemRow[] | null) ?? null, error };
    });
    all.push(...rows);
  }
  return all;
}

async function loadAllocations(
  sb: ReturnType<typeof getSupabaseAdmin>,
  paymentIds: string[]
): Promise<AllocRow[]> {
  if (paymentIds.length === 0) return [];
  const all: AllocRow[] = [];
  try {
    for (const chunk of chunkIds(paymentIds)) {
      const rows = await fetchAllPaginated<AllocRow>(async (from, to) => {
        const { data, error } = await sb
          .from('purchase_order_key_account_payment_allocations')
          .select('payment_id, purchase_order_item_id, allocated_amount, allocated_discount')
          .in('payment_id', chunk)
          .range(from, to);
        if (error) throw error;
        return { data: (data as AllocRow[] | null) ?? null, error: null };
      });
      all.push(...rows);
    }
  } catch (error) {
    if (isMissingAllocationsTable(error)) {
      throw new HttpError(
        500,
        'Brand payment allocation table is missing. Apply supabase/model/key-accounts/purchase_order_key_account_payment_allocations.sql in the SQL editor.'
      );
    }
    throw error;
  }
  return all;
}

async function loadPendingDiscountByItem(
  sb: ReturnType<typeof getSupabaseAdmin>,
  poIds: string[]
): Promise<Map<string, number>> {
  const pendingByItem = new Map<string, number>();
  if (poIds.length === 0) return pendingByItem;
  for (const chunk of chunkIds(poIds)) {
    const rows = await fetchAllPaginated<{ line_allocations: unknown }>(async (from, to) => {
      const { data, error } = await sb
        .from('key_account_settlement_discount_requests')
        .select('line_allocations')
        .in('purchase_order_id', chunk)
        .eq('status', 'pending')
        .range(from, to);
      return { data, error };
    });
    for (const req of rows) {
      const lines = Array.isArray(req.line_allocations) ? req.line_allocations : [];
      for (const line of lines) {
        if (!line || typeof line !== 'object') continue;
        const id = String((line as { purchase_order_item_id?: string }).purchase_order_item_id || '');
        const discount = money(Number((line as { discount?: number }).discount || 0));
        if (!id || discount <= 0) continue;
        pendingByItem.set(id, money((pendingByItem.get(id) || 0) + discount));
      }
    }
  }
  return pendingByItem;
}
