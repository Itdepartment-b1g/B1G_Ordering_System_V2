import { HttpError } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

export type KAClientDto = {
  id: string;
  company_id: string;
  client_code: string;
  client_name: string;
  client_category?: string;
  industry?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  payment_terms?: string;
  credit_limit: number;
  status: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type KAShopDto = {
  id: string;
  client_id: string;
  shop_code: string;
  shop_name: string;
  cor_pdf_path?: string;
  city?: string;
  region?: string;
  province?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  operating_hours?: string;
  is_active: boolean;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type KADeliveryAddressDto = {
  id: string;
  shop_id: string;
  address_label: string;
  full_address: string;
  city?: string;
  region?: string;
  province?: string;
  zip_code?: string;
  contact_name?: string;
  contact_phone?: string;
  delivery_instructions?: string;
  receiving_hours?: string;
  is_default: boolean;
  is_active: boolean;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
};

export type UserContext = {
  userId: string;
  companyId: string;
  role: string;
};

export type KAClientWritePayload = {
  client_name: string;
  client_category: string;
  contact_person?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
};

export type KAShopWritePayload = {
  shop_name: string;
  city?: string | null;
  region?: string | null;
  province?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  operating_hours?: string | null;
  notes?: string | null;
  cor_pdf_path?: string | null;
};

export type KAAddressWritePayload = {
  address_label: string;
  full_address: string;
  city?: string | null;
  region?: string | null;
  province?: string | null;
  zip_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  delivery_instructions?: string | null;
  is_default?: boolean;
};

async function getAssignedClientIds(companyId: string, kamId: string): Promise<string[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('kam_client_assignments')
    .select('client_id')
    .eq('company_id', companyId)
    .eq('kam_id', kamId);

  if (error) throw error;
  return (data || []).map((row) => row.client_id);
}

async function assertClientAccess(ctx: UserContext, clientId: string) {
  const sb = getSupabaseAdmin();
  const { data: client, error } = await sb
    .from('key_account_clients')
    .select('id, company_id, status')
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw error;
  if (!client || client.company_id !== ctx.companyId) {
    throw new HttpError(404, 'Client not found');
  }

  if (ctx.role === 'key_account_manager') {
    const assignedIds = await getAssignedClientIds(ctx.companyId, ctx.userId);
    if (!assignedIds.includes(clientId)) {
      throw new HttpError(403, 'You do not have access to this client');
    }
  }

  return client;
}

async function assertShopAccess(ctx: UserContext, shopId: string) {
  const sb = getSupabaseAdmin();
  const { data: shop, error } = await sb
    .from('key_account_shops')
    .select('id, client_id, is_active')
    .eq('id', shopId)
    .maybeSingle();

  if (error) throw error;
  if (!shop) throw new HttpError(404, 'Shop not found');

  await assertClientAccess(ctx, shop.client_id);
  return shop;
}

async function assertAddressAccess(ctx: UserContext, addressId: string) {
  const sb = getSupabaseAdmin();
  const { data: address, error } = await sb
    .from('key_account_delivery_addresses')
    .select('id, shop_id')
    .eq('id', addressId)
    .maybeSingle();

  if (error) throw error;
  if (!address) throw new HttpError(404, 'Delivery address not found');

  await assertShopAccess(ctx, address.shop_id);
  return address;
}

async function nextKeyAccountCode(
  scopeType: 'client' | 'shop',
  scopeId: string,
  prefix: 'CL' | 'SH'
): Promise<string> {
  const year = new Date().toISOString().slice(0, 4);
  const sb = getSupabaseAdmin();

  const { data: existing, error: selectError } = await sb
    .from('key_account_code_counters')
    .select('last_value')
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId)
    .eq('year', year)
    .maybeSingle();

  if (selectError) throw selectError;

  let next = 1;
  if (!existing) {
    const { error: insertError } = await sb.from('key_account_code_counters').insert({
      scope_type: scopeType,
      scope_id: scopeId,
      year,
      last_value: 1,
    });

    if (insertError) {
      const { data: raced, error: racedError } = await sb
        .from('key_account_code_counters')
        .select('last_value')
        .eq('scope_type', scopeType)
        .eq('scope_id', scopeId)
        .eq('year', year)
        .single();
      if (racedError) throw insertError;
      next = (raced.last_value || 0) + 1;
      const { error: updateError } = await sb
        .from('key_account_code_counters')
        .update({ last_value: next })
        .eq('scope_type', scopeType)
        .eq('scope_id', scopeId)
        .eq('year', year);
      if (updateError) throw updateError;
    }
  } else {
    next = (existing.last_value || 0) + 1;
    const { error: updateError } = await sb
      .from('key_account_code_counters')
      .update({ last_value: next })
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .eq('year', year);
    if (updateError) throw updateError;
  }

  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

async function generateClientCode(companyId: string): Promise<string> {
  if (!companyId) throw new HttpError(400, 'Company id is required');
  return nextKeyAccountCode('client', companyId, 'CL');
}

async function generateShopCode(clientId: string): Promise<string> {
  if (!clientId) throw new HttpError(400, 'Client id is required');
  return nextKeyAccountCode('shop', clientId, 'SH');
}

export async function listKAClients(ctx: UserContext): Promise<{ clients: KAClientDto[] }> {
  const sb = getSupabaseAdmin();

  let query = sb
    .from('key_account_clients')
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('status', 'active')
    .order('client_name');

  if (ctx.role === 'key_account_manager') {
    const assignedClientIds = await getAssignedClientIds(ctx.companyId, ctx.userId);
    if (assignedClientIds.length === 0) return { clients: [] };
    query = query.in('id', assignedClientIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return { clients: (data || []) as KAClientDto[] };
}

export async function listKAShops(
  ctx: UserContext,
  clientId: string
): Promise<{ shops: KAShopDto[] }> {
  await assertClientAccess(ctx, clientId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_shops')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('shop_name');

  if (error) throw error;
  return { shops: (data || []) as KAShopDto[] };
}

export async function listKAAddresses(
  ctx: UserContext,
  shopId: string
): Promise<{ addresses: KADeliveryAddressDto[] }> {
  await assertShopAccess(ctx, shopId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_delivery_addresses')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('is_default', { ascending: false });

  if (error) throw error;
  return { addresses: (data || []) as KADeliveryAddressDto[] };
}

export async function createKAClient(
  ctx: UserContext,
  payload: KAClientWritePayload
): Promise<{ client: KAClientDto }> {
  if (!payload.client_name?.trim()) throw new HttpError(400, 'Client name is required');
  if (!payload.client_category?.trim()) throw new HttpError(400, 'Client category is required');

  const clientCode = await generateClientCode(ctx.companyId);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_clients')
    .insert({
      client_name: payload.client_name.trim(),
      client_category: payload.client_category,
      contact_person: payload.contact_person || null,
      contact_email: payload.contact_email || null,
      contact_phone: payload.contact_phone || null,
      payment_terms: payload.payment_terms || null,
      notes: payload.notes || null,
      client_code: clientCode,
      company_id: ctx.companyId,
      created_by: ctx.userId,
      industry: null,
      credit_limit: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return { client: data as KAClientDto };
}

export async function updateKAClient(
  ctx: UserContext,
  clientId: string,
  payload: KAClientWritePayload
): Promise<{ client: KAClientDto }> {
  if (!payload.client_name?.trim()) throw new HttpError(400, 'Client name is required');
  if (!payload.client_category?.trim()) throw new HttpError(400, 'Client category is required');

  await assertClientAccess(ctx, clientId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_clients')
    .update({
      client_name: payload.client_name.trim(),
      client_category: payload.client_category,
      contact_person: payload.contact_person || null,
      contact_email: payload.contact_email || null,
      contact_phone: payload.contact_phone || null,
      payment_terms: payload.payment_terms || null,
      notes: payload.notes || null,
    })
    .eq('id', clientId)
    .select()
    .single();

  if (error) throw error;
  return { client: data as KAClientDto };
}

export async function createKAShop(
  ctx: UserContext,
  clientId: string,
  payload: KAShopWritePayload
): Promise<{ shop: KAShopDto }> {
  if (!payload.shop_name?.trim()) throw new HttpError(400, 'Shop name is required');

  await assertClientAccess(ctx, clientId);
  const shopCode = await generateShopCode(clientId);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_shops')
    .insert({
      shop_name: payload.shop_name.trim(),
      city: payload.city || null,
      region: payload.region || null,
      province: payload.province || null,
      contact_person: payload.contact_person || null,
      contact_phone: payload.contact_phone || null,
      contact_email: payload.contact_email || null,
      operating_hours: payload.operating_hours || null,
      notes: payload.notes || null,
      cor_pdf_path: payload.cor_pdf_path || null,
      shop_code: shopCode,
      client_id: clientId,
      created_by: ctx.userId,
    })
    .select()
    .single();

  if (error) throw error;
  return { shop: data as KAShopDto };
}

export async function updateKAShop(
  ctx: UserContext,
  shopId: string,
  payload: KAShopWritePayload
): Promise<{ shop: KAShopDto }> {
  if (!payload.shop_name?.trim()) throw new HttpError(400, 'Shop name is required');

  await assertShopAccess(ctx, shopId);

  const update: Record<string, unknown> = {
    shop_name: payload.shop_name.trim(),
    city: payload.city || null,
    region: payload.region || null,
    province: payload.province || null,
    contact_person: payload.contact_person || null,
    contact_phone: payload.contact_phone || null,
    contact_email: payload.contact_email || null,
    operating_hours: payload.operating_hours || null,
    notes: payload.notes || null,
  };
  if (payload.cor_pdf_path !== undefined) {
    update.cor_pdf_path = payload.cor_pdf_path;
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_shops')
    .update(update)
    .eq('id', shopId)
    .select()
    .single();

  if (error) throw error;
  return { shop: data as KAShopDto };
}

export async function createKAAddress(
  ctx: UserContext,
  shopId: string,
  payload: KAAddressWritePayload
): Promise<{ address: KADeliveryAddressDto }> {
  if (!payload.address_label?.trim()) throw new HttpError(400, 'Address label is required');
  if (!payload.full_address?.trim()) throw new HttpError(400, 'Full address is required');

  await assertShopAccess(ctx, shopId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_delivery_addresses')
    .insert({
      address_label: payload.address_label.trim(),
      full_address: payload.full_address.trim(),
      city: payload.city || null,
      region: payload.region || null,
      province: payload.province || null,
      zip_code: payload.zip_code || null,
      contact_name: payload.contact_name || null,
      contact_phone: payload.contact_phone || null,
      delivery_instructions: payload.delivery_instructions || null,
      is_default: Boolean(payload.is_default),
      receiving_hours: null,
      shop_id: shopId,
    })
    .select()
    .single();

  if (error) throw error;
  return { address: data as KADeliveryAddressDto };
}

export async function updateKAAddress(
  ctx: UserContext,
  addressId: string,
  payload: KAAddressWritePayload
): Promise<{ address: KADeliveryAddressDto }> {
  if (!payload.address_label?.trim()) throw new HttpError(400, 'Address label is required');
  if (!payload.full_address?.trim()) throw new HttpError(400, 'Full address is required');

  await assertAddressAccess(ctx, addressId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('key_account_delivery_addresses')
    .update({
      address_label: payload.address_label.trim(),
      full_address: payload.full_address.trim(),
      city: payload.city || null,
      region: payload.region || null,
      province: payload.province || null,
      zip_code: payload.zip_code || null,
      contact_name: payload.contact_name || null,
      contact_phone: payload.contact_phone || null,
      delivery_instructions: payload.delivery_instructions || null,
      is_default: Boolean(payload.is_default),
    })
    .eq('id', addressId)
    .select()
    .single();

  if (error) throw error;
  return { address: data as KADeliveryAddressDto };
}
