import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type SubWarehouseLocationRow = {
  id: string;
  name: string;
  is_main: boolean;
  created_at: string | null;
};

export type SubWarehouseLocationUserRow = {
  location_id: string;
  user_id: string;
  profile: { full_name: string | null; email: string | null } | null;
};

export type MyWarehouseLocationDto = {
  location_id: string;
  warehouse_locations: { id: string; name: string; is_main: boolean };
} | null;

export type CreateSubWarehousePayload = {
  location_name: string;
  full_name: string;
  email: string;
  password: string;
  phone?: string | null;
};

export type AllocateSubWarehousePayload = {
  location_id: string;
  items: Array<{ variant_id: string; quantity: number }>;
  notes?: string | null;
};

export type ReturnLotRow = {
  lot_id: string;
  variant_id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  batch_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
  received_at: string;
};

export type CreateStockReturnPayload = {
  from_location_id: string;
  items: Array<{ lot_id: string; quantity: number }>;
  notes?: string | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_number?: string;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function requireUserClient(ctx: WarehouseContext) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  return getSupabaseUser(ctx.accessToken);
}

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
}

function getSupabasePublicConfig() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) {
    throw new HttpError(500, 'Supabase is not configured on the server');
  }
  return { url, anonKey };
}

export async function listSubWarehouseLocations(
  ctx: WarehouseContext
): Promise<{ locations: SubWarehouseLocationRow[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main, created_at')
    .eq('company_id', ctx.companyId)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;
  return { locations: (data || []) as SubWarehouseLocationRow[] };
}

export async function listSubWarehouseLocationUsers(
  ctx: WarehouseContext
): Promise<{ locationUsers: SubWarehouseLocationUserRow[] }> {
  const sb = getSupabaseAdmin();

  const { data: locationIds, error: locError } = await sb
    .from('warehouse_locations')
    .select('id')
    .eq('company_id', ctx.companyId);
  if (locError) throw locError;

  const ids = (locationIds || []).map((r) => r.id as string);
  if (ids.length === 0) return { locationUsers: [] };

  const { data: wlu, error: wluErr } = await sb
    .from('warehouse_location_users')
    .select('location_id, user_id, created_at')
    .in('location_id', ids)
    .order('created_at', { ascending: true });
  if (wluErr) throw wluErr;

  const userIds = Array.from(
    new Set((wlu || []).map((r) => r.user_id as string).filter(Boolean))
  );
  if (userIds.length === 0) return { locationUsers: [] };

  const { data: profs, error: pErr } = await sb
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  if (pErr) throw pErr;

  const map = new Map<string, { full_name: string | null; email: string | null }>();
  for (const p of profs || []) {
    map.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null });
  }

  return {
    locationUsers: (wlu || []).map((r) => ({
      location_id: r.location_id as string,
      user_id: r.user_id as string,
      profile: map.get(r.user_id as string) ?? null,
    })),
  };
}

export async function getMyWarehouseLocation(
  ctx: WarehouseContext
): Promise<{ myLocation: MyWarehouseLocationDto }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_location_users')
    .select('location_id, warehouse_locations!inner ( id, name, is_main, company_id )')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { myLocation: null };

  const loc = firstRelation(
    data.warehouse_locations as
      | { id: string; name: string; is_main: boolean; company_id: string }
      | { id: string; name: string; is_main: boolean; company_id: string }[]
  );
  if (!loc || loc.company_id !== ctx.companyId) return { myLocation: null };

  return {
    myLocation: {
      location_id: data.location_id as string,
      warehouse_locations: { id: loc.id, name: loc.name, is_main: loc.is_main },
    },
  };
}

export async function getSubWarehousePoReserved(
  ctx: WarehouseContext,
  locationId: string
): Promise<{ reservedByVariantId: Record<string, number> }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');

  const sb = getSupabaseAdmin();
  const { data: loc, error: locError } = await sb
    .from('warehouse_locations')
    .select('id')
    .eq('id', locationId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (locError) throw locError;
  if (!loc) throw new HttpError(404, 'Warehouse location not found');

  const { data: hardData, error: hardError } = await sb
    .from('warehouse_transfer_reservations')
    .select('variant_id, quantity_reserved, quantity_fulfilled, status')
    .eq('warehouse_company_id', ctx.companyId)
    .eq('warehouse_location_id', locationId)
    .in('status', ['reserved', 'partial']);
  if (hardError) throw hardError;

  let softData: Array<{ variant_id?: string; quantity_committed?: number }> = [];
  try {
    const { data, error } = await sb
      .from('warehouse_transfer_soft_reservations')
      .select('variant_id, quantity_committed, status')
      .eq('warehouse_company_id', ctx.companyId)
      .eq('warehouse_location_id', locationId)
      .eq('status', 'active');
    if (error) throw error;
    softData = data || [];
  } catch (softErr: unknown) {
    const err = softErr as { code?: string; message?: string };
    const msg = String(err?.message || softErr || '');
    const code = err?.code;
    if (
      code !== '42P01' &&
      code !== 'PGRST205' &&
      !msg.includes('warehouse_transfer_soft_reservations')
    ) {
      throw softErr;
    }
  }

  const map: Record<string, number> = {};
  for (const row of hardData || []) {
    const remaining = Math.max(
      0,
      Number(row.quantity_reserved || 0) - Number(row.quantity_fulfilled || 0)
    );
    if (remaining <= 0) continue;
    const vid = String(row.variant_id);
    map[vid] = (map[vid] || 0) + remaining;
  }
  for (const row of softData) {
    const remaining = Math.max(0, Number(row.quantity_committed || 0));
    if (remaining <= 0) continue;
    const vid = String(row.variant_id);
    map[vid] = (map[vid] || 0) + remaining;
  }
  return { reservedByVariantId: map };
}

export async function createSubWarehouse(
  ctx: WarehouseContext,
  payload: CreateSubWarehousePayload
) {
  if (!payload.location_name?.trim()) throw new HttpError(400, 'location_name is required');
  if (!payload.full_name?.trim()) throw new HttpError(400, 'full_name is required');
  if (!payload.email?.trim()) throw new HttpError(400, 'email is required');
  if (!payload.password) throw new HttpError(400, 'password is required');

  const { url, anonKey } = getSupabasePublicConfig();
  const res = await fetch(`${url}/functions/v1/create-sub-warehouse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      company_id: ctx.companyId,
      location_name: payload.location_name.trim(),
      full_name: payload.full_name.trim(),
      email: payload.email.trim(),
      password: payload.password,
      phone: payload.phone?.trim() || null,
    }),
  });

  const result = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };
  if (!res.ok || !result.success) {
    throw new HttpError(res.status >= 400 ? res.status : 400, result.error || 'Failed to create sub-warehouse');
  }
  return result;
}

export async function allocateToSubWarehouse(
  ctx: WarehouseContext,
  payload: AllocateSubWarehousePayload
) {
  if (!payload.location_id) throw new HttpError(400, 'location_id is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }

  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('allocate_stock_to_sub_warehouse', {
    p_location_id: payload.location_id,
    p_items: payload.items,
    p_notes: payload.notes || 'Allocated to sub-warehouse',
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Allocation failed');
}

export async function listSubWarehouseReturnLots(
  ctx: WarehouseContext,
  locationId: string
): Promise<{ lots: ReturnLotRow[] }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');

  const sb = getSupabaseAdmin();
  const { data: loc, error: locError } = await sb
    .from('warehouse_locations')
    .select('id')
    .eq('id', locationId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (locError) throw locError;
  if (!loc) throw new HttpError(404, 'Warehouse location not found');

  // Sub users may only see lots for their own location.
  if (!ctx.isMain && ctx.locationId && locationId !== ctx.locationId) {
    throw new HttpError(403, 'You can only return stock from your sub-warehouse');
  }

  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select(
      `
      id,
      variant_id,
      quantity_remaining,
      received_at,
      expiration_date,
      batch:inventory_batches ( batch_number ),
      variant:variants!inventory_batch_lots_variant_id_fkey (
        name,
        variant_type,
        brand:brands!variants_brand_id_fkey ( name )
      )
    `
    )
    .eq('warehouse_location_id', locationId)
    .gt('quantity_remaining', 0)
    .order('received_at', { ascending: true });
  if (error) throw error;

  const lots = (data ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const batch = firstRelation(r.batch as { batch_number?: string } | null);
      const variant = firstRelation(
        r.variant as
          | { name?: string; variant_type?: string; brand?: { name?: string } | { name?: string }[] }
          | null
      );
      const brand = variant
        ? firstRelation(variant.brand as { name?: string } | { name?: string }[] | null)
        : null;
      const remaining = Number(r.quantity_remaining);
      if (!Number.isFinite(remaining) || remaining <= 0) return null;
      return {
        lot_id: r.id as string,
        variant_id: r.variant_id as string,
        brandName: brand?.name ?? 'Unknown Brand',
        variantName: variant?.name ?? String(r.variant_id),
        variantType: variant?.variant_type ?? 'unknown',
        batch_number: batch?.batch_number ?? '—',
        expiration_date: (r.expiration_date as string | null) ?? null,
        quantity_remaining: remaining,
        received_at: r.received_at as string,
      } satisfies ReturnLotRow;
    })
    .filter(Boolean) as ReturnLotRow[];

  return { lots };
}

export async function createSubWarehouseStockReturn(
  ctx: WarehouseContext,
  payload: CreateStockReturnPayload
) {
  if (!payload.from_location_id) throw new HttpError(400, 'from_location_id is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }

  if (!ctx.isMain && ctx.locationId && payload.from_location_id !== ctx.locationId) {
    throw new HttpError(403, 'You can only return stock from your sub-warehouse');
  }

  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('create_warehouse_stock_return_request', {
    p_from_location_id: payload.from_location_id,
    p_items: payload.items,
    p_notes: payload.notes || 'Returned from sub-warehouse',
    p_created_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Return request failed');
}
