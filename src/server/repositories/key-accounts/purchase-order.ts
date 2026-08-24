import { fetchAllPaginated } from '../../../lib/supabasePaginate';
import { HttpError } from '../../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type KAPoPaymentBulkRow = {
  purchase_order_id: string;
  amount: number | null;
  settlement_discount?: number | null;
  created_at: string;
};

export type UserContext = {
  userId: string;
  companyId: string;
  role: string;
  accessToken?: string;
};

export type KAPoOwnerDto = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

export type KAPoWarehouseDto = {
  id: string;
  company_id: string;
  company_name?: string;
  location_id: string;
  location_name: string;
  is_main: boolean;
};

export type KAPoBrandDto = { id: string; name: string };
export type KAPoVariantDto = {
  id: string;
  name: string;
  variant_type: string | null;
  brand_id: string | null;
};

export type KAPoItemInput = {
  variant_id: string;
  warehouse_location_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type KAPoHeaderInput = {
  warehouse_company_id: string | null;
  warehouse_location_id: string | null;
  key_account_client_id: string;
  key_account_shop_id: string;
  key_account_address_id: string;
  kam_id: string | null;
  order_date: string;
  expected_delivery_date: string;
  notes?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  po_order_kind: 'consignment' | 'standard';
  key_account_payment_terms?: string | null;
  key_account_payment_terms_source?: string | null;
  key_account_payment_terms_created_by?: string | null;
  key_account_payment_mode?: string | null;
  // Internal KAM pay-reminder scheduling (optional)
  key_account_notification_option?: string | null;
  /**
   * UI "Custom date" value (YYYY-MM-DD). For non-custom presets, server ignores this and recomputes.
   * This is the client-input date, not necessarily the persisted send date.
   */
  key_account_notification_date?: string | null;
};

export type KAPoPaymentInput = {
  amount: number;
  payment_method: string;
  bank_type?: string | null;
  proof_storage_path: string;
};

const CLIENT_PAGE_SIZE = 10;
const ON_BEHALF_OWNER_ROLES = ['sales_head', 'sales_director', 'key_account_manager'];
const LOCKED_WORKFLOWS = new Set(['warehouse_reserved', 'partial_delivered', 'delivered', 'rejected']);

function stockKey(variantId: string, locationId: string) {
  return `${variantId}::${locationId}`;
}

function getTodayISODateManila(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  // en-CA ensures YYYY-MM-DD ordering, but we build explicitly for safety.
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysToISODate(isoDate: string, days: number): string {
  // Interpret the date as "UTC midnight" to avoid local timezone shifting the day.
  const [y, m, d] = isoDate.split('-').map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new HttpError(400, `Invalid ISO date: ${isoDate}`);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function parseNetDaysFromPaymentTerms(paymentTerms?: string | null): number | null {
  const match = String(paymentTerms || '').match(/net\s*(\d+)/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

type KAPoNotificationOption =
  | 'none'
  | 'net_15'
  | 'net_30'
  | 'net_60'
  | 'days_before_3'
  | 'days_before_1'
  | 'custom'
  | string
  | null
  | undefined;

function resolveKAPoNotificationDate(params: {
  orderDate: string; // YYYY-MM-DD
  notificationOption?: KAPoNotificationOption;
  customNotificationDate?: string | null; // YYYY-MM-DD
  paymentTerms?: string | null;
}): { optionToStore: string | null; dateToStore: string | null } {
  const todayManila = getTodayISODateManila();
  const orderDate = params.orderDate;

  const option = String(params.notificationOption || '').trim();
  const customDate = String(params.customNotificationDate || '').trim();
  const paymentTerms = params.paymentTerms;

  if (!option || option === 'none') {
    return { optionToStore: 'none', dateToStore: null };
  }

  if (option === 'custom') {
    if (!customDate) throw new HttpError(400, 'Notification custom date is required.');
    // Block past custom dates (Manila calendar).
    if (customDate < todayManila) {
      throw new HttpError(400, 'Notification custom date cannot be in the past.');
    }
    // Keep it as YYYY-MM-DD.
    return { optionToStore: 'custom', dateToStore: customDate };
  }

  const notificationOption = option;

  // Presets: compute from PO order date (not delivery date).
  // - net_X: notification on order_date + X
  // - days_before_X: due date derived from payment term "Net N" when possible, else fallback Net 30
  let notificationDate: string | null = null;

  if (notificationOption === 'net_15') {
    notificationDate = addDaysToISODate(orderDate, 15);
  } else if (notificationOption === 'net_30') {
    notificationDate = addDaysToISODate(orderDate, 30);
  } else if (notificationOption === 'net_60') {
    notificationDate = addDaysToISODate(orderDate, 60);
  } else if (notificationOption === 'days_before_3' || notificationOption === 'days_before_1') {
    const daysBefore = notificationOption === 'days_before_3' ? 3 : 1;
    const dueDays = parseNetDaysFromPaymentTerms(paymentTerms) ?? 30;
    const dueDate = addDaysToISODate(orderDate, dueDays);
    notificationDate = addDaysToISODate(dueDate, -daysBefore);
  } else {
    throw new HttpError(400, `Unknown notification option: ${notificationOption}`);
  }

  return { optionToStore: notificationOption, dateToStore: notificationDate };
}

async function insertKAPoPayment(
  ctx: UserContext,
  poId: string,
  payment: KAPoPaymentInput
) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  const userSb = getSupabaseUser(ctx.accessToken);
  const { error } = await userSb.from('purchase_order_key_account_payments').insert({
    purchase_order_id: poId,
    company_id: ctx.companyId,
    amount: payment.amount,
    payment_method: payment.payment_method,
    bank_type: payment.bank_type || null,
    proof_storage_path: payment.proof_storage_path,
  });
  if (error) throw error;
}

function canEditPo(
  po: {
    status?: string | null;
    workflow_status?: string | null;
    kam_id?: string | null;
    created_by?: string | null;
    po_order_kind?: string | null;
  },
  user: UserContext
) {
  if (user.role === 'key_account_accounting') return false;
  const status = String(po.status || '').toLowerCase();
  const workflow = String(po.workflow_status || '').toLowerCase();
  if (status !== 'pending') return false;
  if (workflow === 'rejected') return false;
  if (LOCKED_WORKFLOWS.has(workflow)) return false;
  const kind = String(po.po_order_kind || '');
  if (kind === 'rebate_fulfillment' || kind === 'rebate_topup') return false;
  const onBehalf = !!po.created_by && !!po.kam_id && po.created_by !== po.kam_id;
  if (onBehalf && workflow !== 'owner_pending') return false;
  const privileged = ['sales_admin', 'sales_head', 'sales_director'].includes(user.role);
  const isOwner = !!po.kam_id && po.kam_id === user.userId;
  return privileged || isOwner;
}

async function resolveLinkedHubCompanyId(companyId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_company_assignments')
    .select('warehouse_user_id')
    .eq('client_company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.warehouse_user_id) return null;

  const { data: warehouseProfile, error: profileErr } = await sb
    .from('profiles')
    .select('company_id')
    .eq('id', data.warehouse_user_id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  return warehouseProfile?.company_id ?? null;
}

export async function listKAPoOwners(ctx: UserContext): Promise<{ owners: KAPoOwnerDto[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('company_id', ctx.companyId)
    .in('role', ON_BEHALF_OWNER_ROLES)
    .eq('status', 'active')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return { owners: (data || []) as KAPoOwnerDto[] };
}

export async function listKAPoClients(
  ctx: UserContext,
  opts: { search?: string; offset?: number; kamId?: string }
): Promise<{ clients: unknown[]; hasMore: boolean }> {
  const sb = getSupabaseAdmin();
  const offset = Math.max(0, opts.offset || 0);

  const kamIdForScope =
    ctx.role === 'key_account_manager'
      ? ctx.userId
      : ctx.role === 'sales_admin' && opts.kamId
        ? opts.kamId
        : null;

  let assignedIds: string[] | null = null;
  if (kamIdForScope) {
    const { data: assignments, error: assignErr } = await sb
      .from('kam_client_assignments')
      .select('client_id')
      .eq('kam_id', kamIdForScope);
    if (assignErr) throw assignErr;
    assignedIds = (assignments || []).map((a) => a.client_id).filter(Boolean);
    if (assignedIds.length === 0) return { clients: [], hasMore: false };
  }

  let query = sb
    .from('key_account_clients')
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('status', 'active')
    .order('client_name')
    .range(offset, offset + CLIENT_PAGE_SIZE - 1);

  if (assignedIds) query = query.in('id', assignedIds);

  const search = (opts.search || '').trim();
  if (search) {
    const safe = search.replace(/[,.()]/g, ' ').replace(/%/g, '').trim();
    if (safe) query = query.or(`client_name.ilike.%${safe}%,client_code.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  return { clients: rows, hasMore: rows.length === CLIENT_PAGE_SIZE };
}

export async function listKAPoShops(ctx: UserContext, clientId: string) {
  const sb = getSupabaseAdmin();
  const { data: client, error: clientErr } = await sb
    .from('key_account_clients')
    .select('id, company_id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client || client.company_id !== ctx.companyId) throw new HttpError(404, 'Client not found');

  const { data, error } = await sb
    .from('key_account_shops')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('shop_name');
  if (error) throw error;
  return { shops: data || [] };
}

export async function listKAPoAddresses(ctx: UserContext, shopId: string) {
  const sb = getSupabaseAdmin();
  const { data: shop, error: shopErr } = await sb
    .from('key_account_shops')
    .select('id, client_id')
    .eq('id', shopId)
    .maybeSingle();
  if (shopErr) throw shopErr;
  if (!shop) throw new HttpError(404, 'Shop not found');

  const { data: client, error: clientErr } = await sb
    .from('key_account_clients')
    .select('id, company_id')
    .eq('id', shop.client_id)
    .maybeSingle();
  if (clientErr) throw clientErr;
  if (!client || client.company_id !== ctx.companyId) throw new HttpError(404, 'Shop not found');

  const { data, error } = await sb
    .from('key_account_delivery_addresses')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('address_label');
  if (error) throw error;
  return { addresses: data || [] };
}

export async function listKAPoWarehouses(ctx: UserContext) {
  const hubId = await resolveLinkedHubCompanyId(ctx.companyId);
  if (!hubId) {
    return {
      linkedWarehouseCompanyId: null,
      warehouses: [] as KAPoWarehouseDto[],
      brands: [] as KAPoBrandDto[],
      variants: [] as KAPoVariantDto[],
    };
  }

  const sb = getSupabaseAdmin();
  const [{ data: whCompany }, { data: locations, error: locErr }, { data: brands, error: brandsErr }, { data: variants, error: variantsErr }] =
    await Promise.all([
      sb.from('companies').select('id, company_name').eq('id', hubId).maybeSingle(),
      sb.from('warehouse_locations').select('id, name, is_main').eq('company_id', hubId).order('is_main', { ascending: false }).order('name'),
      sb.from('brands').select('id, name').eq('company_id', hubId).eq('is_active', true).order('name'),
      sb.from('variants').select('id, name, variant_type, brand_id').eq('company_id', hubId).eq('is_active', true).order('name'),
    ]);

  if (locErr) throw locErr;
  if (brandsErr) throw brandsErr;
  if (variantsErr) throw variantsErr;

  const warehouses: KAPoWarehouseDto[] = (locations || []).map((loc) => ({
    id: `${hubId}:${loc.id}`,
    company_id: hubId,
    company_name: whCompany?.company_name || 'Warehouse',
    location_id: loc.id,
    location_name: loc.name,
    is_main: !!loc.is_main,
  }));

  return {
    linkedWarehouseCompanyId: hubId,
    warehouses,
    brands: (brands || []) as KAPoBrandDto[],
    variants: (variants || []) as KAPoVariantDto[],
  };
}

export async function getKAPoStock(ctx: UserContext, variantIds: string[]) {
  const hubId = await resolveLinkedHubCompanyId(ctx.companyId);
  if (!hubId || variantIds.length === 0) {
    return { stockMap: {}, onHandMap: {}, reservedMap: {} };
  }

  const sb = getSupabaseAdmin();
  const { data: locations, error: locErr } = await sb
    .from('warehouse_locations')
    .select('id, is_main')
    .eq('company_id', hubId);
  if (locErr) throw locErr;
  const mainWarehouseLocationId = (locations || []).find((l) => l.is_main)?.id || '';

  const [
    { data: mainInvData, error: mainInvErr },
    { data: locInvData, error: locInvErr },
    { data: reservedData },
    { data: softReservedData },
  ] = await Promise.all([
    sb.from('main_inventory').select('variant_id, stock, allocated_stock').eq('company_id', hubId).in('variant_id', variantIds),
    sb.from('warehouse_location_inventory').select('variant_id, location_id, stock').eq('company_id', hubId).in('variant_id', variantIds),
    sb
      .from('warehouse_transfer_reservations')
      .select('variant_id, warehouse_location_id, quantity_reserved, quantity_fulfilled, status')
      .eq('warehouse_company_id', hubId)
      .in('variant_id', variantIds)
      .in('status', ['reserved', 'partial']),
    sb
      .from('warehouse_transfer_soft_reservations')
      .select('variant_id, warehouse_location_id, quantity_committed, status')
      .eq('warehouse_company_id', hubId)
      .in('variant_id', variantIds)
      .eq('status', 'active'),
  ]);

  if (mainInvErr) throw mainInvErr;
  if (locInvErr) throw locInvErr;

  const reservedByLocVar: Record<string, number> = {};
  for (const row of reservedData || []) {
    const remaining = Math.max(0, Number(row.quantity_reserved || 0) - Number(row.quantity_fulfilled || 0));
    if (remaining <= 0) continue;
    const key = stockKey(String(row.variant_id), String(row.warehouse_location_id));
    reservedByLocVar[key] = (reservedByLocVar[key] || 0) + remaining;
  }
  for (const row of softReservedData || []) {
    const committed = Math.max(0, Number(row.quantity_committed || 0));
    if (committed <= 0) continue;
    const key = stockKey(String(row.variant_id), String(row.warehouse_location_id));
    reservedByLocVar[key] = (reservedByLocVar[key] || 0) + committed;
  }

  const stockMap: Record<string, number> = {};
  const onHandMap: Record<string, number> = {};
  const reservedMap: Record<string, number> = {};

  if (mainWarehouseLocationId && mainInvData) {
    for (const row of mainInvData) {
      const key = stockKey(String(row.variant_id), mainWarehouseLocationId);
      const stock = Number(row.stock || 0);
      const allocated = Number(row.allocated_stock || 0);
      const reserved = reservedByLocVar[key] || 0;
      onHandMap[key] = Math.max(0, stock);
      reservedMap[key] = reserved;
      stockMap[key] = Math.max(0, stock - allocated - reserved);
    }
  }

  if (locInvData) {
    for (const row of locInvData) {
      const locId = String(row.location_id);
      if (mainWarehouseLocationId && locId === mainWarehouseLocationId) continue;
      const key = stockKey(String(row.variant_id), locId);
      const stock = Number(row.stock || 0);
      const reserved = reservedByLocVar[key] || 0;
      onHandMap[key] = Math.max(0, stock);
      reservedMap[key] = reserved;
      stockMap[key] = Math.max(0, stock - reserved);
    }
  }

  return { stockMap, onHandMap, reservedMap };
}

export async function getKAExistingPo(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  const { data: po, error: poErr } = await sb
    .from('purchase_orders')
    .select(
      `
      id,
      po_number,
      status,
      workflow_status,
      kam_id,
      created_by,
      po_order_kind,
      key_account_client_id,
      key_account_shop_id,
      key_account_address_id,
      warehouse_location_id,
      warehouse_company_id,
      order_date,
      expected_delivery_date,
      notes,
      tax_rate,
      discount,
      key_account_payment_terms,
      key_account_payment_terms_source,
      key_account_payment_mode,
      key_account_payment_status,
      key_account_notification_option,
      key_account_notification_date,
      company_account_type,
      company_id,
      client:key_account_clients(*)
    `
    )
    .eq('id', poId)
    .maybeSingle();
  if (poErr) throw poErr;
  if (!po || po.company_id !== ctx.companyId) throw new HttpError(404, 'Purchase order not found');
  if (!canEditPo(po, ctx)) throw new HttpError(403, 'This PO can no longer be edited');

  const { data: itemRows, error: itemsErr } = await sb
    .from('purchase_order_items')
    .select(
      `
      id,
      variant_id,
      quantity,
      unit_price,
      total_price,
      warehouse_location_id,
      variant:variants(
        id,
        name,
        variant_type,
        brand_id,
        brand:brands(id, name)
      )
    `
    )
    .eq('purchase_order_id', poId);
  if (itemsErr) throw itemsErr;

  const { data: paymentRows } = await sb
    .from('purchase_order_key_account_payments')
    .select('id, proof_storage_path, amount, payment_method')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });

  return { po, items: itemRows || [], payments: paymentRows || [] };
}

async function generatePoNumber(companyId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('generate_key_account_po_number', {
    p_company_id: companyId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'string') throw new HttpError(500, 'Failed to generate PO number');
  return data;
}

export async function createKAPurchaseOrder(
  ctx: UserContext,
  body: {
    header: KAPoHeaderInput;
    items: KAPoItemInput[];
    payment?: KAPoPaymentInput | null;
  }
) {
  const { header, items, payment } = body;
  if (!header?.key_account_client_id) throw new HttpError(400, 'Client is required');
  if (!items?.length) throw new HttpError(400, 'At least one item is required');

  const isConsignment = header.po_order_kind === 'consignment';
  if (!isConsignment && !payment?.proof_storage_path) {
    throw new HttpError(400, 'Payment proof is required');
  }

  const workflowStatus =
    ctx.role === 'sales_admin'
      ? 'owner_pending'
      : ctx.role === 'sales_director' || ctx.role === 'sales_head'
        ? 'admin_pending'
        : 'kam_pending';

  const { optionToStore: resolvedNotificationOption, dateToStore: resolvedNotificationDate } =
    resolveKAPoNotificationDate({
      orderDate: header.order_date,
      notificationOption: header.key_account_notification_option,
      customNotificationDate: header.key_account_notification_date,
      paymentTerms: header.key_account_payment_terms,
    });

  const poNumber = await generatePoNumber(ctx.companyId);
  const sb = getSupabaseAdmin();

  const { data: poData, error: poError } = await sb
    .from('purchase_orders')
    .insert({
      company_id: ctx.companyId,
      po_number: poNumber,
      supplier_id: null,
      fulfillment_type: 'warehouse_transfer',
      warehouse_company_id: header.warehouse_company_id,
      warehouse_location_id: header.warehouse_location_id,
      key_account_client_id: header.key_account_client_id,
      key_account_shop_id: header.key_account_shop_id,
      key_account_address_id: header.key_account_address_id,
      kam_id: header.kam_id,
      order_date: header.order_date,
      expected_delivery_date: header.expected_delivery_date,
      notes: header.notes || null,
      subtotal: header.subtotal,
      tax_rate: header.tax_rate,
      tax_amount: header.tax_amount,
      discount: header.discount,
      total_amount: header.total_amount,
      po_order_kind: header.po_order_kind,
      key_account_payment_terms: header.key_account_payment_terms || null,
      key_account_payment_terms_source: header.key_account_payment_terms_source || null,
      key_account_payment_terms_created_by: header.key_account_payment_terms_created_by || null,
      key_account_payment_mode: isConsignment ? 'full' : header.key_account_payment_mode,
      key_account_notification_option: resolvedNotificationOption,
      key_account_notification_date: resolvedNotificationDate,
      key_account_notification_sent_at: null,
      company_account_type: 'Key Accounts',
      workflow_status: workflowStatus,
      status: 'pending',
      created_by: ctx.userId,
      key_account_payment_status: 'unpaid',
    })
    .select('id, po_number')
    .single();

  if (poError) throw poError;
  const poId = poData.id;

  try {
    const { error: itemsError } = await sb.from('purchase_order_items').insert(
      items.map((item) => ({
        company_id: ctx.companyId,
        purchase_order_id: poId,
        variant_id: item.variant_id,
        warehouse_location_id: item.warehouse_location_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }))
    );
    if (itemsError) throw itemsError;

    if (!isConsignment && payment) {
      await insertKAPoPayment(ctx, poId, payment);
    }
  } catch (error) {
    await sb.from('purchase_orders').delete().eq('id', poId);
    throw error;
  }

  return { po: { id: poId, po_number: poNumber, workflow_status: workflowStatus } };
}

export async function updateKAPurchaseOrder(
  ctx: UserContext,
  poId: string,
  body: {
    header: KAPoHeaderInput;
    items: KAPoItemInput[];
    payment?: KAPoPaymentInput | null;
  }
) {
  const sb = getSupabaseAdmin();
  const { data: currentPo, error: currentErr } = await sb
    .from('purchase_orders')
    .select(
      'id, status, workflow_status, kam_id, created_by, po_order_kind, key_account_payment_status, company_id, ' +
        'key_account_notification_option, key_account_notification_date, key_account_notification_sent_at'
    )
    .eq('id', poId)
    .maybeSingle();
  if (currentErr) throw currentErr;
  if (!currentPo || currentPo.company_id !== ctx.companyId) throw new HttpError(404, 'Purchase order not found');
  if (!canEditPo(currentPo, ctx)) {
    throw new HttpError(403, 'This PO can no longer be edited (owner approved, or it was already submitted to warehouse).');
  }

  const header = body.header;
  const isConsignment = header.po_order_kind === 'consignment';
  const canChangeOwner = ctx.role === 'sales_admin' && currentPo.workflow_status === 'owner_pending';

  const todayManila = getTodayISODateManila();
  const { optionToStore: resolvedNotificationOption, dateToStore: resolvedNotificationDate } =
    resolveKAPoNotificationDate({
      orderDate: header.order_date,
      notificationOption: header.key_account_notification_option,
      customNotificationDate: header.key_account_notification_date,
      paymentTerms: header.key_account_payment_terms,
    });

  const existingSentAt = currentPo.key_account_notification_sent_at
    ? String(currentPo.key_account_notification_sent_at)
    : null;

  const existingNotificationDate = currentPo.key_account_notification_date
    ? String(currentPo.key_account_notification_date)
    : null;

  // Re-arm only when the new computed date is in the future.
  const shouldClearSentAt =
    !!existingSentAt &&
    !!resolvedNotificationDate &&
    resolvedNotificationDate > todayManila &&
    resolvedNotificationDate !== existingNotificationDate;

  const { error: poError } = await sb
    .from('purchase_orders')
    .update({
      warehouse_company_id: header.warehouse_company_id,
      warehouse_location_id: header.warehouse_location_id,
      key_account_client_id: header.key_account_client_id,
      key_account_shop_id: header.key_account_shop_id,
      key_account_address_id: header.key_account_address_id,
      kam_id: canChangeOwner ? header.kam_id : currentPo.kam_id,
      order_date: header.order_date,
      expected_delivery_date: header.expected_delivery_date,
      notes: header.notes || null,
      subtotal: header.subtotal,
      tax_rate: header.tax_rate,
      tax_amount: header.tax_amount,
      discount: header.discount,
      total_amount: header.total_amount,
      po_order_kind: header.po_order_kind,
      key_account_payment_terms: header.key_account_payment_terms || null,
      key_account_payment_terms_source: header.key_account_payment_terms_source || null,
      key_account_payment_terms_created_by: header.key_account_payment_terms_created_by || null,
      key_account_payment_mode: isConsignment ? 'full' : header.key_account_payment_mode,
      key_account_notification_option: resolvedNotificationOption,
      key_account_notification_date: resolvedNotificationDate,
      key_account_notification_sent_at: resolvedNotificationDate
        ? shouldClearSentAt
          ? null
          : currentPo.key_account_notification_sent_at
        : null,
    })
    .eq('id', poId);
  if (poError) throw poError;

  const { error: deleteItemsErr } = await sb.from('purchase_order_items').delete().eq('purchase_order_id', poId);
  if (deleteItemsErr) throw deleteItemsErr;

  const { error: itemsError } = await sb.from('purchase_order_items').insert(
    body.items.map((item) => ({
      company_id: ctx.companyId,
      purchase_order_id: poId,
      variant_id: item.variant_id,
      warehouse_location_id: item.warehouse_location_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    }))
  );
  if (itemsError) throw itemsError;

  const { data: existingPayments } = await sb
    .from('purchase_order_key_account_payments')
    .select('id')
    .eq('purchase_order_id', poId)
    .limit(1);

  const needsPaymentInsert =
    !isConsignment &&
    !(existingPayments && existingPayments.length > 0) &&
    String(currentPo.key_account_payment_status || 'unpaid') === 'unpaid';

  if (needsPaymentInsert) {
    if (!body.payment?.proof_storage_path) throw new HttpError(400, 'Payment proof is required');
    await insertKAPoPayment(ctx, poId, body.payment);
  }

  return { po: { id: poId } };
}

function requireUserClient(ctx: UserContext) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  return getSupabaseUser(ctx.accessToken);
}

const KA_PO_LIST_SELECT = `
  id,
  po_number,
  company_id,
  company_account_type,
  po_order_kind,
  source_rebate_id,
  workflow_status,
  status,
  order_date,
  expected_delivery_date,
  created_at,
  total_amount,
  subtotal,
  tax_rate,
  tax_amount,
  discount,
  kam_id,
  rfpf_number,
  dr_number,
  key_account_payment_terms,
  key_account_payment_mode,
  key_account_payment_status,
  key_account_payment_terms_source,
  key_account_payment_terms_created_by,
  key_account_notification_option,
  key_account_notification_date,
  key_account_notification_sent_at,
  director_approved_at,
  director_approved_by,
  admin_approved_at,
  admin_approved_by,
  created_by,
  warehouse_location_id,
  warehouse_location:warehouse_locations(name),
  key_account_client_id,
  key_account_shop_id,
  key_account_address_id,
  client:key_account_clients(client_name, client_code, contact_phone),
  shop:key_account_shops(shop_name, cor_pdf_path, city, province, region),
  address:key_account_delivery_addresses(address_label,full_address,city,province,zip_code,contact_name,contact_phone,is_default),
  kam:profiles!purchase_orders_kam_id_fkey(full_name,email),
  created_by_user:profiles!purchase_orders_created_by_fkey(full_name,email)
`;

export async function listKAPurchaseOrders(ctx: UserContext) {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('purchase_orders')
    .select(KA_PO_LIST_SELECT)
    .eq('company_account_type', 'Key Accounts')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });

  if (ctx.role === 'key_account_manager') {
    query = query.or(`created_by.eq.${ctx.userId},kam_id.eq.${ctx.userId}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rawRows = (data || []) as Array<Record<string, unknown>>;
  const creatorIds = [
    ...new Set(
      rawRows
        .map((r) => r.key_account_payment_terms_created_by)
        .filter((id): id is string => typeof id === 'string' && Boolean(id))
    ),
  ];

  const creatorById = new Map<string, { full_name: string | null; email: string | null }>();
  if (creatorIds.length > 0) {
    const { data: creators, error: creatorsErr } = await sb
      .from('profiles')
      .select('id, full_name, email')
      .in('id', creatorIds);
    if (creatorsErr) throw creatorsErr;
    for (const profile of creators || []) {
      creatorById.set(profile.id, {
        full_name: profile.full_name ?? null,
        email: profile.email ?? null,
      });
    }
  }

  const rows = rawRows.map((row) => ({
    ...row,
    payment_terms_creator:
      typeof row.key_account_payment_terms_created_by === 'string'
        ? creatorById.get(row.key_account_payment_terms_created_by) ?? null
        : null,
  }));

  return { rows };
}

export type KAPoPaymentReminderItem = {
  brandName?: string | null;
  variantName?: string | null;
  variantType?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type KAPoPaymentReminderDueRow = {
  id: string;
  po_number: string;
  kam_id: string | null;
  kam?: { full_name?: string | null; email?: string | null } | null;
  client?: { client_name?: string | null } | null;
  total_amount?: number | null;
  key_account_payment_terms?: string | null;
  key_account_notification_option?: string | null;
  key_account_notification_date?: string | null;
  key_account_notification_sent_at?: string | null;
  items?: KAPoPaymentReminderItem[];
};

const KA_PO_REMINDER_SELECT = `
  id,
  po_number,
  kam_id,
  total_amount,
  key_account_payment_terms,
  key_account_notification_option,
  key_account_notification_date,
  key_account_notification_sent_at,
  kam:profiles!purchase_orders_kam_id_fkey(full_name,email),
  client:key_account_clients(client_name),
  items:purchase_order_items(
    quantity,
    unit_price,
    total_price,
    variants:variant_id (
      name,
      variant_type,
      brands:brand_id ( name )
    )
  )
`;

function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapKAPoPaymentReminderRow(row: Record<string, unknown> | null): KAPoPaymentReminderDueRow | null {
  if (!row) return null;

  const kam = firstRel(row.kam as KAPoPaymentReminderDueRow['kam']);
  const client = firstRel(row.client as KAPoPaymentReminderDueRow['client']);
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: KAPoPaymentReminderItem[] = itemsRaw.map((raw) => {
    const it = raw as {
      quantity?: number | null;
      unit_price?: number | null;
      total_price?: number | null;
      variants?: unknown;
    };
    const variant = firstRel(it.variants as { name?: string | null; variant_type?: string | null; brands?: unknown } | null);
    const brand = firstRel(variant?.brands as { name?: string | null } | null);
    const quantity = Number(it.quantity) || 0;
    const unitPrice = Number(it.unit_price) || 0;
    const lineTotal = Number(it.total_price) || quantity * unitPrice;
    return {
      brandName: brand?.name ?? null,
      variantName: variant?.name ?? null,
      variantType: variant?.variant_type ?? null,
      quantity,
      unitPrice,
      lineTotal,
    };
  });

  return {
    id: String(row.id),
    po_number: String(row.po_number || ''),
    kam_id: (row.kam_id as string | null) ?? null,
    kam,
    client,
    total_amount: row.total_amount == null ? null : Number(row.total_amount),
    key_account_payment_terms: (row.key_account_payment_terms as string | null) ?? null,
    key_account_notification_option: (row.key_account_notification_option as string | null) ?? null,
    key_account_notification_date: (row.key_account_notification_date as string | null) ?? null,
    key_account_notification_sent_at: (row.key_account_notification_sent_at as string | null) ?? null,
    items,
  };
}

/**
 * Internal reminders: send an email to the assigned KAM once when `notification_date <= asOfDate`
 * and `notification_sent_at` is still null.
 */
export async function listDueKAPoPaymentReminders(asOfDate: string): Promise<KAPoPaymentReminderDueRow[]> {
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from('purchase_orders')
    .select(KA_PO_REMINDER_SELECT)
    .eq('company_account_type', 'Key Accounts')
    .lte('key_account_notification_date', asOfDate)
    .is('key_account_notification_sent_at', null);

  if (error) throw error;
  return (data || [])
    .map((row) => mapKAPoPaymentReminderRow(row as Record<string, unknown>))
    .filter((row): row is KAPoPaymentReminderDueRow => Boolean(row));
}

export async function getKAPoPaymentReminderById(poId: string): Promise<KAPoPaymentReminderDueRow | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('purchase_orders')
    .select(KA_PO_REMINDER_SELECT)
    .eq('id', poId)
    .eq('company_account_type', 'Key Accounts')
    .maybeSingle();
  if (error) throw error;
  return mapKAPoPaymentReminderRow((data as Record<string, unknown> | null) ?? null);
}

export async function markKAPoPaymentReminderSent(poId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('purchase_orders')
    .update({ key_account_notification_sent_at: new Date().toISOString() })
    .eq('id', poId)
    .is('key_account_notification_sent_at', null);
  if (error) throw error;
}

export async function listKADirectorKamIds(ctx: UserContext) {
  if (ctx.role !== 'sales_director') return { kamIds: [] as string[] };
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('kam_director_assignments')
    .select('kam_id')
    .eq('director_id', ctx.userId);
  if (error) throw error;
  return { kamIds: (data || []).map((r: { kam_id: string }) => r.kam_id) };
}

export async function getKAWarehouseLocationNames(ctx: UserContext) {
  const hubId = await resolveLinkedHubCompanyId(ctx.companyId);
  if (!hubId) return { namesById: {} as Record<string, string> };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('warehouse_locations').select('id, name').eq('company_id', hubId);
  if (error) throw error;

  const namesById: Record<string, string> = {};
  for (const row of data || []) {
    if (row?.id && row?.name) namesById[row.id] = row.name;
  }
  return { namesById };
}

export async function getKAPoItems(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_order_items')
    .select(
      `
      id,
      variant_id,
      warehouse_location_id,
      quantity,
      unit_price,
      total_price,
      warehouse_locations:warehouse_location_id ( name ),
      variants:variant_id (
        name,
        variant_type,
        brands:brand_id ( name )
      )
    `
    )
    .eq('purchase_order_id', poId);
  if (error) throw error;
  return { items: data || [] };
}

export async function getKAPoPayments(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_order_key_account_payments')
    .select(
      `
      *,
      recorder:profiles!purchase_order_key_account_payments_recorded_by_fkey(full_name,email)
    `
    )
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return { payments: data || [] };
}

async function resolveAccessiblePoIds(
  sb: ReturnType<typeof getSupabaseAdmin>,
  ctx: UserContext,
  poIds: string[]
): Promise<string[]> {
  const uniqueIds = [...new Set(poIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  let query = sb
    .from('purchase_orders')
    .select('id')
    .in('id', uniqueIds)
    .eq('company_id', ctx.companyId)
    .eq('company_account_type', 'Key Accounts');

  if (ctx.role === 'key_account_manager') {
    query = query.or(`created_by.eq.${ctx.userId},kam_id.eq.${ctx.userId}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => row.id as string);
}

export async function getKAPoPaymentsBulk(ctx: UserContext, poIds: string[]) {
  if (poIds.length === 0) return { payments: [] as KAPoPaymentBulkRow[] };

  const sb = getSupabaseAdmin();
  const accessibleIds = await resolveAccessiblePoIds(sb, ctx, poIds);
  if (accessibleIds.length === 0) return { payments: [] as KAPoPaymentBulkRow[] };

  const chunkSize = 100;
  const all: KAPoPaymentBulkRow[] = [];

  for (let i = 0; i < accessibleIds.length; i += chunkSize) {
    const chunk = accessibleIds.slice(i, i + chunkSize);
    const rows = await fetchAllPaginated<KAPoPaymentBulkRow>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_key_account_payments')
        .select('purchase_order_id, amount, settlement_discount, created_at')
        .in('purchase_order_id', chunk)
        .order('created_at', { ascending: true })
        .order('purchase_order_id', { ascending: true })
        .range(from, to);
      return { data: (data as KAPoPaymentBulkRow[] | null) ?? null, error };
    });
    all.push(...rows);
  }

  return { payments: all };
}

export async function getKAPoPaymentSummary(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_order_key_account_payments')
    .select('amount, settlement_discount')
    .eq('purchase_order_id', poId);
  if (error) throw error;

  const rows = data || [];
  const paid = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const discount = rows.reduce((s, r) => s + Number(r.settlement_discount || 0), 0);
  return { paid, discount, entryCount: rows.length };
}

export async function getKAPoDiscountRequests(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('key_account_settlement_discount_requests')
    .select(
      `
      *,
      requester:profiles!key_account_settlement_discount_requests_requested_by_fkey(full_name,email)
    `
    )
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { requests: data || [] };
}

export async function getKACompanyPendingDiscounts(ctx: UserContext) {
  if (ctx.role !== 'sales_head') return { requests: [] };
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_settlement_discount_requests')
    .select(
      `
      *,
      requester:profiles!key_account_settlement_discount_requests_requested_by_fkey(full_name,email),
      purchase_order:purchase_orders!key_account_settlement_discount_requests_purchase_order_id_fkey(po_number)
    `
    )
    .eq('company_id', ctx.companyId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return { requests: data || [] };
}

export async function getKAPoRfpfRevisions(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_order_rfpf_revisions')
    .select(
      `
      id,
      previous_rfpf_number,
      new_rfpf_number,
      reason,
      created_at,
      changer:profiles!purchase_order_rfpf_revisions_changed_by_fkey(full_name)
    `
    )
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const revisions = (data || []).map((row: Record<string, unknown>) => {
    const changer = row.changer as { full_name?: string | null } | null;
    return {
      id: row.id,
      previousRfpfNumber: row.previous_rfpf_number,
      newRfpfNumber: row.new_rfpf_number,
      reason: row.reason,
      changedByName: changer?.full_name || 'Unknown',
      createdAt: row.created_at,
    };
  });
  return { revisions };
}

export async function getKAPoRebateSource(ctx: UserContext, rebateId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_po_rebates')
    .select(
      'rebate_number, disputed_total, replacement_total, source_po:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number, company_id)'
    )
    .eq('id', rebateId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { source: null };

  const src = (data as { source_po?: unknown }).source_po;
  const poRow = Array.isArray(src) ? src[0] : src;
  if (!poRow || (poRow as { company_id?: string }).company_id !== ctx.companyId) {
    return { source: null };
  }

  const poNum = (poRow as { po_number?: string }).po_number;
  if (!poNum) return { source: null };

  return {
    source: {
      rebate_number: (data as { rebate_number?: string }).rebate_number,
      source_po_number: poNum,
      disputed_total: Number((data as { disputed_total?: number }).disputed_total) || 0,
      replacement_total: Number((data as { replacement_total?: number }).replacement_total) || 0,
    },
  };
}

export async function getKAPoRebateReturnLines(ctx: UserContext, rebateId: string) {
  const sb = getSupabaseAdmin();
  const { data: rebateRow, error: rebateErr } = await sb
    .from('key_account_po_rebates')
    .select('company_id')
    .eq('id', rebateId)
    .maybeSingle();
  if (rebateErr) throw rebateErr;
  if (!rebateRow || rebateRow.company_id !== ctx.companyId) return { lines: [] };

  const { data, error } = await sb
    .from('key_account_po_rebate_lines')
    .select(
      `
      disputed_quantity,
      purchase_order_item:purchase_order_items (
        warehouse_location_id
      ),
      variant:variants (
        name,
        variant_type,
        brand:brands ( name )
      )
    `
    )
    .eq('rebate_id', rebateId);
  if (error) throw error;

  const lines = (data || []).map((r: Record<string, unknown>) => {
    const variant = r.variant as Record<string, unknown> | null;
    const brand = variant?.brand as { name?: string } | null;
    const poi = r.purchase_order_item as { warehouse_location_id?: string | null } | null;
    return {
      brand_name: brand?.name ?? '—',
      variant_name: (variant?.name as string) ?? '—',
      variant_type: (variant?.variant_type as string) ?? '—',
      disputed_quantity: Number(r.disputed_quantity) || 0,
      warehouse_location_id: poi?.warehouse_location_id ?? null,
    };
  });
  return { lines };
}

export async function listKAPoRebatesForPo(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('key_account_po_rebates')
    .select('id, rebate_number, status, disputed_total, resolution_type')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { rebates: data || [] };
}

export async function getKAPoPaymentStatus(ctx: UserContext, poId: string) {
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_orders')
    .select('key_account_payment_status')
    .eq('id', poId)
    .maybeSingle();
  if (error) throw error;
  return { key_account_payment_status: data?.key_account_payment_status ?? null };
}

async function assertPoInCompany(
  sb: ReturnType<typeof getSupabaseAdmin>,
  poId: string,
  companyId: string
) {
  const { data, error } = await sb.from('purchase_orders').select('id').eq('id', poId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Purchase order not found');
}

export async function updateKAPoWorkflow(
  ctx: UserContext,
  poId: string,
  patch: Record<string, unknown>
) {
  if (ctx.role === 'key_account_accounting') {
    throw new HttpError(403, 'Accounting users cannot update purchase orders');
  }
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, poId, ctx.companyId);

  const { data, error } = await sb
    .from('purchase_orders')
    .update(patch)
    .eq('id', poId)
    .select()
    .single();
  if (error) throw error;
  return {
    ok: true,
    poId,
    patched: patch,
    po: data,
  };
}

export async function setKAPoRfpf(
  ctx: UserContext,
  poId: string,
  rfpfNumber: string,
  reason?: string | null
) {
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('set_key_account_rfpf', {
    p_po_id: poId,
    p_rfpf_number: rfpfNumber,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  const result = data as { success?: boolean; message?: string } | null;
  if (!result?.success) throw new HttpError(400, result?.message || 'Failed to set RFPF');
  return result;
}

export type KAPoListPaymentInput = {
  poId: string;
  amount: number;
  settlementDiscount?: number;
  settlementDiscountReason?: string | null;
  paymentMethod: string;
  bankType?: string | null;
  proofStoragePath?: string | null;
};

export async function recordKAPoListPayment(ctx: UserContext, input: KAPoListPaymentInput) {
  if (ctx.role === 'key_account_accounting') {
    throw new HttpError(403, 'Accounting users cannot record payments');
  }
  const sb = getSupabaseAdmin();
  await assertPoInCompany(sb, input.poId, ctx.companyId);

  const userSb = requireUserClient(ctx);
  const amt = Number(input.amount) || 0;
  const discount = Number(input.settlementDiscount) || 0;
  const reason = input.settlementDiscountReason?.trim() || null;
  const isSalesHead = ctx.role === 'sales_head';
  const needsDiscountApproval = discount > 0 && !isSalesHead;
  let sourcePaymentId: string | null = null;

  if (amt > 0 || (discount > 0 && isSalesHead)) {
    const method = amt > 0 ? input.paymentMethod : 'CASH';
    const { data: insertedPay, error } = await userSb
      .from('purchase_order_key_account_payments')
      .insert({
        purchase_order_id: input.poId,
        company_id: ctx.companyId,
        amount: amt,
        settlement_discount: needsDiscountApproval ? 0 : discount,
        settlement_discount_reason: !needsDiscountApproval && discount > 0 ? reason : null,
        payment_method: method,
        bank_type: method === 'BANK_TRANSFER' ? input.bankType || null : null,
        proof_storage_path: input.proofStoragePath || null,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (needsDiscountApproval && amt > 0 && insertedPay?.id) {
      sourcePaymentId = insertedPay.id;
    }
  }

  if (needsDiscountApproval) {
    const { data, error } = await userSb.rpc('request_key_account_settlement_discount', {
      p_purchase_order_id: input.poId,
      p_settlement_discount: discount,
      p_settlement_discount_reason: reason,
      p_source_payment_id: sourcePaymentId,
    });
    if (error) throw error;
    const result = data as { success?: boolean; error?: string } | null;
    if (!result?.success) {
      throw new HttpError(400, result?.error || 'Could not submit settlement discount for approval');
    }
  }

  return getKAPoPaymentStatus(ctx, input.poId);
}

export async function approveKASettlementDiscount(ctx: UserContext, requestId: string) {
  if (ctx.role !== 'sales_head') {
    throw new HttpError(403, 'Only sales heads can approve settlement discounts');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('approve_key_account_settlement_discount', {
    p_request_id: requestId,
  });
  if (error) throw error;
  const result = data as { success?: boolean; error?: string; purchase_order_id?: string } | null;
  if (!result?.success) {
    throw new HttpError(400, result?.error || 'Could not approve settlement discount');
  }
  return result;
}

export async function rejectKASettlementDiscount(
  ctx: UserContext,
  requestId: string,
  reason?: string | null
) {
  if (ctx.role !== 'sales_head') {
    throw new HttpError(403, 'Only sales heads can reject settlement discounts');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('reject_key_account_settlement_discount', {
    p_request_id: requestId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
  const result = data as { success?: boolean; error?: string; purchase_order_id?: string } | null;
  if (!result?.success) {
    throw new HttpError(400, result?.error || 'Could not reject settlement discount');
  }
  return result;
}
