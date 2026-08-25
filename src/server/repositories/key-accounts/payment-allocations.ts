import { HttpError } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import type { UserContext } from './purchase-order';

export type KAPoPaymentAllocationInput = {
  purchaseOrderItemId?: string;
  brandId?: string;
  amount?: number;
  discount?: number;
};

export type KAPoResolvedLineAllocation = {
  purchaseOrderItemId: string;
  amount: number;
  discount: number;
};

export type KAPoBrandBalance = {
  brandId: string;
  brandName: string;
  billed: number;
  paid: number;
  discount: number;
  pendingDiscount: number;
  remaining: number;
  quantity: number;
  remainingQty: number;
  status: 'unpaid' | 'partial' | 'paid';
  itemIds: string[];
};

export type KAPoBrandBalancesResult = {
  brands: KAPoBrandBalance[];
  unallocatedPaid: number;
  unallocatedDiscount: number;
};

type LineRow = {
  itemId: string;
  brandId: string;
  brandName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  billed: number;
  paid: number;
  discount: number;
  pendingDiscount: number;
  remaining: number;
  remainingQty: number;
};

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

function isMissingAllocationsTable(error: unknown) {
  const message = String((error as { message?: string })?.message || error || '');
  return (
    /purchase_order_key_account_payment_allocations/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

function missingAllocationsTableError() {
  return new HttpError(
    500,
    'Brand payment allocation table is missing. Apply supabase/model/key-accounts/purchase_order_key_account_payment_allocations.sql in the SQL editor.'
  );
}

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function paymentStatus(paid: number, discount: number, pending: number, remaining: number) {
  if (remaining <= 0.001) return 'paid' as const;
  if (paid + discount + pending > 0.001) return 'partial' as const;
  return 'unpaid' as const;
}

async function loadLineRows(sb: AdminClient, poId: string): Promise<LineRow[]> {
  const { data: items, error: itemsError } = await sb
    .from('purchase_order_items')
    .select(
      `
      id,
      quantity,
      unit_price,
      total_price,
      created_at,
      variants:variant_id (
        name,
        brand_id,
        brands:brand_id ( id, name )
      )
    `
    )
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });
  if (itemsError) throw itemsError;

  const itemIds = (items || []).map((row) => row.id as string);
  const allocatedByItem = new Map<string, { paid: number; discount: number }>();
  if (itemIds.length > 0) {
    const { data: allocs, error: allocError } = await sb
      .from('purchase_order_key_account_payment_allocations')
      .select('purchase_order_item_id, allocated_amount, allocated_discount')
      .in('purchase_order_item_id', itemIds);
    if (allocError) {
      if (isMissingAllocationsTable(allocError)) throw missingAllocationsTableError();
      throw allocError;
    }
    for (const row of allocs || []) {
      const id = String(row.purchase_order_item_id);
      const current = allocatedByItem.get(id) || { paid: 0, discount: 0 };
      current.paid = money(current.paid + Number(row.allocated_amount || 0));
      current.discount = money(current.discount + Number(row.allocated_discount || 0));
      allocatedByItem.set(id, current);
    }
  }

  const pendingByItem = new Map<string, number>();
  const { data: pendingReqs, error: pendingError } = await sb
    .from('key_account_settlement_discount_requests')
    .select('line_allocations')
    .eq('purchase_order_id', poId)
    .eq('status', 'pending');
  if (pendingError) throw pendingError;
  for (const req of pendingReqs || []) {
    const lines = Array.isArray(req.line_allocations) ? req.line_allocations : [];
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue;
      const id = String((line as { purchase_order_item_id?: string }).purchase_order_item_id || '');
      const discount = money(Number((line as { discount?: number }).discount || 0));
      if (!id || discount <= 0) continue;
      pendingByItem.set(id, money((pendingByItem.get(id) || 0) + discount));
    }
  }

  return (items || []).map((row) => {
    const variant = firstRelation(row.variants as { name?: string; brand_id?: string; brands?: unknown } | null);
    const brand = firstRelation(variant?.brands as { id?: string; name?: string } | null);
    const billed = money(Number(row.total_price ?? Number(row.quantity || 0) * Number(row.unit_price || 0)));
    const applied = allocatedByItem.get(row.id) || { paid: 0, discount: 0 };
    const pendingDiscount = pendingByItem.get(row.id) || 0;
    const remaining = money(Math.max(0, billed - applied.paid - applied.discount - pendingDiscount));
    const unitPrice = Number(row.unit_price || 0);
    const quantity = Number(row.quantity || 0);
    return {
      itemId: row.id as string,
      brandId: String(brand?.id || variant?.brand_id || 'unknown'),
      brandName: String(brand?.name || 'Unknown'),
      variantName: String(variant?.name || ''),
      quantity,
      unitPrice,
      billed,
      paid: applied.paid,
      discount: applied.discount,
      pendingDiscount,
      remaining,
      // Whole unpaid pieces for per-piece discount helper (floor; leftover pesos use lump discount).
      remainingQty:
        unitPrice > 0 ? Math.max(0, Math.floor(remaining / unitPrice + 1e-9)) : 0,
    };
  });
}

function spreadAcrossLines(
  lines: LineRow[],
  cash: number,
  discount: number
): KAPoResolvedLineAllocation[] {
  let cashLeft = money(cash);
  let discountLeft = money(discount);
  const out: KAPoResolvedLineAllocation[] = [];

  for (const line of lines) {
    if (cashLeft <= 0 && discountLeft <= 0) break;
    let room = line.remaining;
    if (room <= 0) continue;

    const takeCash = money(Math.min(cashLeft, room));
    room = money(room - takeCash);
    cashLeft = money(cashLeft - takeCash);

    const takeDiscount = money(Math.min(discountLeft, room));
    discountLeft = money(discountLeft - takeDiscount);

    if (takeCash > 0 || takeDiscount > 0) {
      out.push({
        purchaseOrderItemId: line.itemId,
        amount: takeCash,
        discount: takeDiscount,
      });
    }
  }

  if (cashLeft > 0.001 || discountLeft > 0.001) {
    const available = money(lines.reduce((sum, line) => sum + line.remaining, 0));
    throw new HttpError(
      400,
      `Allocation exceeds remaining on the selected brand (available ₱${available.toFixed(2)})`
    );
  }

  return out;
}

export async function resolvePaymentAllocations(
  poId: string,
  cash: number,
  discount: number,
  allocations?: KAPoPaymentAllocationInput[] | null
): Promise<KAPoResolvedLineAllocation[]> {
  const sb = getSupabaseAdmin();
  const lines = await loadLineRows(sb, poId);
  const cashAmt = money(cash);
  const discountAmt = money(discount);
  if (cashAmt <= 0 && discountAmt <= 0) return [];

  const brandsWithRemaining = [
    ...new Set(lines.filter((line) => line.remaining > 0.001).map((line) => line.brandId)),
  ];
  const input = (allocations || []).filter(
    (row) =>
      (row.purchaseOrderItemId || row.brandId) &&
      (money(row.amount || 0) > 0 || money(row.discount || 0) > 0)
  );

  if (input.length === 0) {
    const totalRemaining = money(lines.reduce((sum, line) => sum + line.remaining, 0));
    // Full settle (create "full" mode or pay remaining): cover every open brand/line.
    // Cash may exceed line billed when PO has header tax — allocate only what lines can take.
    if (totalRemaining > 0 && cashAmt + discountAmt + 0.011 >= totalRemaining) {
      const cashForLines = money(Math.min(cashAmt, totalRemaining));
      const discountForLines = money(
        Math.min(discountAmt, Math.max(0, totalRemaining - cashForLines))
      );
      return spreadAcrossLines(lines, cashForLines, discountForLines);
    }
    if (brandsWithRemaining.length > 1) {
      throw new HttpError(400, 'Select a brand (or PO lines) for this payment');
    }
    if (brandsWithRemaining.length === 1) {
      const brandLines = lines.filter((line) => line.brandId === brandsWithRemaining[0]);
      return spreadAcrossLines(brandLines, cashAmt, discountAmt);
    }
    return [];
  }

  const resolved: KAPoResolvedLineAllocation[] = [];
  const byItem = new Map<string, KAPoResolvedLineAllocation>();

  const addResolved = (row: KAPoResolvedLineAllocation) => {
    const existing = byItem.get(row.purchaseOrderItemId);
    if (existing) {
      existing.amount = money(existing.amount + row.amount);
      existing.discount = money(existing.discount + row.discount);
      return;
    }
    const next = { ...row };
    byItem.set(row.purchaseOrderItemId, next);
    resolved.push(next);
  };

  for (const row of input) {
    const rowCash = money(row.amount || 0);
    const rowDiscount = money(row.discount || 0);
    if (row.purchaseOrderItemId) {
      const line = lines.find((item) => item.itemId === row.purchaseOrderItemId);
      if (!line) throw new HttpError(400, 'Allocation line does not belong to this purchase order');
      addResolved({
        purchaseOrderItemId: line.itemId,
        amount: rowCash,
        discount: rowDiscount,
      });
      continue;
    }
    if (row.brandId) {
      const brandLines = lines.filter((item) => item.brandId === row.brandId);
      if (brandLines.length === 0) throw new HttpError(400, 'Unknown brand for this purchase order');
      for (const spread of spreadAcrossLines(brandLines, rowCash, rowDiscount)) {
        addResolved(spread);
      }
    }
  }

  const totalCash = money(resolved.reduce((sum, row) => sum + row.amount, 0));
  const totalDiscount = money(resolved.reduce((sum, row) => sum + row.discount, 0));
  if (Math.abs(totalCash - cashAmt) > 0.011) {
    throw new HttpError(
      400,
      `Allocated cash ₱${totalCash.toFixed(2)} must match payment amount ₱${cashAmt.toFixed(2)}`
    );
  }
  if (Math.abs(totalDiscount - discountAmt) > 0.011) {
    throw new HttpError(
      400,
      `Allocated discount ₱${totalDiscount.toFixed(2)} must match settlement discount ₱${discountAmt.toFixed(2)}`
    );
  }

  for (const row of resolved) {
    const line = lines.find((item) => item.itemId === row.purchaseOrderItemId);
    if (!line) continue;
    if (money(row.amount + row.discount) - line.remaining > 0.011) {
      throw new HttpError(
        400,
        `Allocation exceeds remaining on ${line.brandName} ${line.variantName}`.trim()
      );
    }
  }

  return resolved.filter((row) => row.amount > 0 || row.discount > 0);
}

export async function insertPaymentAllocations(
  companyId: string,
  paymentId: string,
  rows: KAPoResolvedLineAllocation[],
  options?: { includeDiscount?: boolean }
) {
  const includeDiscount = options?.includeDiscount !== false;
  const payload = rows
    .map((row) => ({
      company_id: companyId,
      payment_id: paymentId,
      purchase_order_item_id: row.purchaseOrderItemId,
      allocated_amount: money(row.amount),
      allocated_discount: includeDiscount ? money(row.discount) : 0,
    }))
    .filter((row) => row.allocated_amount > 0 || row.allocated_discount > 0);
  if (payload.length === 0) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('purchase_order_key_account_payment_allocations').insert(payload);
  if (error) {
    if (isMissingAllocationsTable(error)) throw missingAllocationsTableError();
    throw error;
  }
}

export async function savePendingDiscountAllocations(
  requestId: string,
  rows: KAPoResolvedLineAllocation[]
) {
  const lineAllocations = rows
    .filter((row) => money(row.discount) > 0)
    .map((row) => ({
      purchase_order_item_id: row.purchaseOrderItemId,
      discount: money(row.discount),
    }));
  if (lineAllocations.length === 0) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('key_account_settlement_discount_requests')
    .update({ line_allocations: lineAllocations })
    .eq('id', requestId);
  if (error) throw error;
}

export async function applyApprovedDiscountAllocations(requestId: string, paymentId: string) {
  const sb = getSupabaseAdmin();
  const { data: request, error: reqError } = await sb
    .from('key_account_settlement_discount_requests')
    .select('company_id, line_allocations')
    .eq('id', requestId)
    .maybeSingle();
  if (reqError) throw reqError;
  const lines = Array.isArray(request?.line_allocations) ? request.line_allocations : [];
  if (lines.length === 0 || !request?.company_id) return;

  for (const line of lines) {
    if (!line || typeof line !== 'object') continue;
    const itemId = String((line as { purchase_order_item_id?: string }).purchase_order_item_id || '');
    const discount = money(Number((line as { discount?: number }).discount || 0));
    if (!itemId || discount <= 0) continue;

    const { data: existing, error: existingError } = await sb
      .from('purchase_order_key_account_payment_allocations')
      .select('id, allocated_discount')
      .eq('payment_id', paymentId)
      .eq('purchase_order_item_id', itemId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing?.id) {
      const { error } = await sb
        .from('purchase_order_key_account_payment_allocations')
        .update({ allocated_discount: money(Number(existing.allocated_discount || 0) + discount) })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('purchase_order_key_account_payment_allocations').insert({
        company_id: request.company_id,
        payment_id: paymentId,
        purchase_order_item_id: itemId,
        allocated_amount: 0,
        allocated_discount: discount,
      });
      if (error) throw error;
    }
  }
}

export async function getKAPoBrandBalances(
  ctx: UserContext,
  poId: string
): Promise<KAPoBrandBalancesResult> {
  const sb = getSupabaseAdmin();
  const { data: po, error: poError } = await sb
    .from('purchase_orders')
    .select('id')
    .eq('id', poId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (poError) throw poError;
  if (!po) throw new HttpError(404, 'Purchase order not found');

  const lines = await loadLineRows(sb, poId);
  const brandMap = new Map<string, KAPoBrandBalance>();
  for (const line of lines) {
    const existing = brandMap.get(line.brandId);
    if (!existing) {
      brandMap.set(line.brandId, {
        brandId: line.brandId,
        brandName: line.brandName,
        billed: line.billed,
        paid: line.paid,
        discount: line.discount,
        pendingDiscount: line.pendingDiscount,
        remaining: line.remaining,
        quantity: line.quantity,
        remainingQty: line.remainingQty,
        status: 'unpaid',
        itemIds: [line.itemId],
      });
      continue;
    }
    existing.billed = money(existing.billed + line.billed);
    existing.paid = money(existing.paid + line.paid);
    existing.discount = money(existing.discount + line.discount);
    existing.pendingDiscount = money(existing.pendingDiscount + line.pendingDiscount);
    existing.remaining = money(existing.remaining + line.remaining);
    existing.quantity += line.quantity;
    existing.remainingQty = money(existing.remainingQty + line.remainingQty);
    existing.itemIds.push(line.itemId);
  }

  const brands = [...brandMap.values()]
    .map((brand) => ({
      ...brand,
      status: paymentStatus(brand.paid, brand.discount, brand.pendingDiscount, brand.remaining),
    }))
    .sort((a, b) => a.brandName.localeCompare(b.brandName));

  const { data: payments, error: payError } = await sb
    .from('purchase_order_key_account_payments')
    .select('id, amount, settlement_discount')
    .eq('purchase_order_id', poId);
  if (payError) throw payError;

  const paymentIds = (payments || []).map((row) => row.id as string);
  let allocatedPaid = 0;
  let allocatedDiscount = 0;
  if (paymentIds.length > 0) {
    const { data: allocs, error: allocError } = await sb
      .from('purchase_order_key_account_payment_allocations')
      .select('allocated_amount, allocated_discount')
      .in('payment_id', paymentIds);
    if (allocError) throw allocError;
    for (const row of allocs || []) {
      allocatedPaid = money(allocatedPaid + Number(row.allocated_amount || 0));
      allocatedDiscount = money(allocatedDiscount + Number(row.allocated_discount || 0));
    }
  }

  const paid = money((payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const discount = money(
    (payments || []).reduce((sum, row) => sum + Number(row.settlement_discount || 0), 0)
  );

  return {
    brands,
    unallocatedPaid: money(Math.max(0, paid - allocatedPaid)),
    unallocatedDiscount: money(Math.max(0, discount - allocatedDiscount)),
  };
}
