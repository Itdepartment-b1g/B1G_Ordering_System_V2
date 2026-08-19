import { HttpError } from '../../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

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
    .select('id, status, workflow_status, kam_id, created_by, po_order_kind, key_account_payment_status, company_id')
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
