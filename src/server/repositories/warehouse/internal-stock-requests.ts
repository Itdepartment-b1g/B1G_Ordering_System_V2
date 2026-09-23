import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type InternalStockRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'ready_to_deliver'
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'rejected';

export type InternalStockRequestRow = Record<string, unknown> & {
  id: string;
  company_id: string;
  request_number: string;
  from_location_id: string;
  status: InternalStockRequestStatus;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

const REQUEST_SELECT = `
  *,
  from_location:warehouse_locations!internal_stock_requests_from_location_id_fkey (
    id, name, code
  ),
  requested_by_user:profiles!internal_stock_requests_requested_by_fkey (
    id, full_name
  ),
  items:internal_stock_request_items (
    id,
    request_id,
    variant_id,
    requested_quantity,
    delivered_quantity,
    received_quantity,
    open_receive_quantity,
    variant:variants (
      id,
      name,
      brand:brands ( id, name )
    )
  ),
  events:internal_stock_request_events (
    id,
    request_id,
    event_type,
    note,
    lines,
    short_quantity,
    proof_image_url,
    proof_image_urls,
    signature_url,
    rider_name,
    rider_plate_number,
    rider_photo_url,
    dr_number,
    created_by,
    created_at,
    created_by_user:profiles!internal_stock_request_events_created_by_fkey (
      full_name
    )
  )
`;

function requireUserClient(ctx: WarehouseContext) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  return getSupabaseUser(ctx.accessToken);
}

function assertRpcOk(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (!result.success) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
}

async function attachOpenDiscrepancyCounts(
  rows: InternalStockRequestRow[]
): Promise<Array<InternalStockRequestRow & { open_discrepancy_count: number }>> {
  if (rows.length === 0) return [];
  const sb = getSupabaseAdmin();
  const ids = rows.map((r) => r.id);
  const { data, error } = await sb
    .from('internal_stock_request_discrepancies')
    .select('request_id')
    .eq('status', 'open')
    .in('request_id', ids);

  if (error) {
    return rows.map((r) => ({ ...r, open_discrepancy_count: 0 }));
  }

  const countById = new Map<string, number>();
  for (const row of data || []) {
    const id = row.request_id as string;
    countById.set(id, (countById.get(id) ?? 0) + 1);
  }
  return rows.map((r) => ({
    ...r,
    open_discrepancy_count: countById.get(r.id) ?? 0,
  }));
}

export async function listInternalStockRequests(
  ctx: WarehouseContext,
  options?: {
    status?: string | null;
    fromLocationId?: string | null;
    includeEvents?: boolean;
  }
): Promise<{ requests: Array<InternalStockRequestRow & { open_discrepancy_count: number }> }> {
  const userSb = requireUserClient(ctx);
  const includeEvents = options?.includeEvents === true;

  const { data, error } = await userSb.rpc('list_internal_stock_requests_for_caller', {
    p_from_location_id: options?.fromLocationId || null,
    p_status: options?.status || null,
    p_include_events: includeEvents,
  });

  if (error) {
    // Older DBs without p_include_events
    const retry = await userSb.rpc('list_internal_stock_requests_for_caller', {
      p_from_location_id: options?.fromLocationId || null,
      p_status: options?.status || null,
    });
    if (!retry.error) {
      const rows = (Array.isArray(retry.data) ? retry.data : []) as InternalStockRequestRow[];
      return { requests: await attachOpenDiscrepancyCounts(rows) };
    }

    // Direct select fallback
    const sb = getSupabaseAdmin();
    let query = sb
      .from('internal_stock_requests')
      .select(REQUEST_SELECT)
      .eq('company_id', ctx.companyId)
      .order('created_at', { ascending: false });

    if (options?.status) query = query.eq('status', options.status);
    if (options?.fromLocationId) query = query.eq('from_location_id', options.fromLocationId);
    if (!ctx.isMain && ctx.locationId) {
      query = query.eq('from_location_id', ctx.locationId);
    }

    const fallback = await query;
    if (fallback.error) throw fallback.error;
    const rows = (fallback.data ?? []) as InternalStockRequestRow[];
    return { requests: await attachOpenDiscrepancyCounts(rows) };
  }

  const rows = (Array.isArray(data) ? data : []) as InternalStockRequestRow[];
  return { requests: await attachOpenDiscrepancyCounts(rows) };
}

export async function getInternalStockRequestById(
  ctx: WarehouseContext,
  requestId: string
): Promise<{
  request: (InternalStockRequestRow & { open_discrepancy_count: number }) | null;
}> {
  if (!requestId) throw new HttpError(400, 'requestId is required');
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('internal_stock_requests')
    .select(REQUEST_SELECT)
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { request: null };

  const row = data as InternalStockRequestRow;
  if (row.company_id !== ctx.companyId) {
    throw new HttpError(403, 'Request not in your company');
  }
  if (!ctx.isMain && ctx.locationId && row.from_location_id !== ctx.locationId) {
    throw new HttpError(403, 'You can only view requests for your sub-warehouse');
  }

  const [withCount] = await attachOpenDiscrepancyCounts([row]);
  return { request: withCount };
}

export async function listSubWarehouseLocationsForAllocate(ctx: WarehouseContext) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can list sub-warehouses');
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', ctx.companyId)
    .eq('is_main', false)
    .order('name');
  if (error) throw error;
  return { locations: data ?? [] };
}

export async function createInternalStockRequest(
  ctx: WarehouseContext,
  payload: {
    items: Array<{ variant_id: string; quantity: number }>;
    notes?: string | null;
    from_location_id?: string | null;
  }
) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('create_internal_stock_request', {
    p_items: payload.items,
    p_notes: payload.notes ?? null,
    p_from_location_id: payload.from_location_id ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to create stock request');
}

export async function approveInternalStockRequest(ctx: WarehouseContext, requestId: string) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can approve');
  if (!requestId) throw new HttpError(400, 'request_id is required');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('approve_internal_stock_request', {
    p_request_id: requestId,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to approve request');
}

export async function rejectInternalStockRequest(
  ctx: WarehouseContext,
  payload: {
    request_id: string;
    reason: string;
    signature_url: string;
    signature_path?: string | null;
  }
) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can reject');
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  if (!payload.reason?.trim()) throw new HttpError(400, 'reason is required');
  if (!payload.signature_url) throw new HttpError(400, 'signature_url is required');

  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('reject_internal_stock_request', {
    p_request_id: payload.request_id,
    p_reason: payload.reason,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to reject request');
}

export async function deliverInternalStockRequest(
  ctx: WarehouseContext,
  payload: {
    request_id: string;
    signature_url: string;
    proof_image_url: string;
    rider_name: string;
    rider_plate_number: string;
    rider_photo_url: string;
    signature_path?: string | null;
    proof_image_path?: string | null;
    rider_photo_path?: string | null;
  }
) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can deliver');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('deliver_internal_stock_request', {
    p_request_id: payload.request_id,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path ?? null,
    p_proof_image_url: payload.proof_image_url,
    p_proof_image_path: payload.proof_image_path ?? null,
    p_rider_name: payload.rider_name,
    p_rider_plate_number: payload.rider_plate_number,
    p_rider_photo_url: payload.rider_photo_url,
    p_rider_photo_path: payload.rider_photo_path ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to deliver request');
}

export async function createMainStockAllocation(
  ctx: WarehouseContext,
  payload: {
    from_location_id: string;
    items: Array<{ variant_id: string; quantity: number }>;
    proof_image_url: string;
    proof_image_path?: string | null;
    proof_image_urls?: string[] | null;
    proof_image_paths?: string[] | null;
    notes?: string | null;
  }
) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can allocate');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('create_main_stock_allocation', {
    p_from_location_id: payload.from_location_id,
    p_items: payload.items,
    p_proof_image_url: payload.proof_image_url,
    p_proof_image_path: payload.proof_image_path ?? null,
    p_proof_image_urls: payload.proof_image_urls ?? null,
    p_proof_image_paths: payload.proof_image_paths ?? null,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to create stock allocation');
}

export async function deliverMainStockAllocation(
  ctx: WarehouseContext,
  payload: {
    request_id: string;
    signature_url: string;
    rider_name: string;
    rider_plate_number: string;
    rider_photo_url: string;
    signature_path?: string | null;
    rider_photo_path?: string | null;
  }
) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can deliver');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('deliver_main_stock_allocation', {
    p_request_id: payload.request_id,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path ?? null,
    p_rider_name: payload.rider_name,
    p_rider_plate_number: payload.rider_plate_number,
    p_rider_photo_url: payload.rider_photo_url,
    p_rider_photo_path: payload.rider_photo_path ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to deliver allocation');
}

export async function allocateInternalStockRequestRemaining(
  ctx: WarehouseContext,
  payload: {
    request_id: string;
    lines: Array<{ variant_id: string; quantity: number }>;
    proof_image_url: string;
    signature_url: string;
    rider_name: string;
    rider_plate_number: string;
    rider_photo_url: string;
    note?: string | null;
    proof_image_path?: string | null;
    signature_path?: string | null;
    rider_photo_path?: string | null;
  }
) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can allocate remaining');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('allocate_internal_stock_request_remaining', {
    p_request_id: payload.request_id,
    p_lines: payload.lines,
    p_proof_image_url: payload.proof_image_url,
    p_signature_url: payload.signature_url,
    p_note: payload.note ?? null,
    p_proof_image_path: payload.proof_image_path ?? null,
    p_signature_path: payload.signature_path ?? null,
    p_rider_name: payload.rider_name,
    p_rider_plate_number: payload.rider_plate_number,
    p_rider_photo_url: payload.rider_photo_url,
    p_rider_photo_path: payload.rider_photo_path ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to allocate remaining');
}

export async function confirmInternalStockRequestReceive(
  ctx: WarehouseContext,
  payload: {
    request_id: string;
    lines: Array<{
      variant_id: string;
      quantity: number;
      shortfall_reason?: string;
      shortfall_notes?: string;
    }>;
    proof_image_url: string;
    signature_url: string;
    notes?: string | null;
    proof_image_path?: string | null;
    proof_image_name?: string | null;
    signature_path?: string | null;
  }
) {
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('confirm_internal_stock_request_receive', {
    p_request_id: payload.request_id,
    p_lines: payload.lines,
    p_proof_image_url: payload.proof_image_url,
    p_signature_url: payload.signature_url,
    p_notes: payload.notes ?? null,
    p_proof_image_path: payload.proof_image_path ?? null,
    p_proof_image_name: payload.proof_image_name ?? null,
    p_signature_path: payload.signature_path ?? null,
  });
  if (error) throw error;
  return assertRpcOk(data, 'Failed to confirm receive');
}

const MAIN_STOCK_BOARD_SELECT = `
  id,
  stock,
  allocated_stock,
  reorder_level,
  variants:variant_id (
    id,
    name,
    variant_type,
    created_at,
    is_active,
    brands:brand_id (
      id,
      name,
      is_active
    )
  )
`;

export async function getMainWarehouseLocationName(
  ctx: WarehouseContext
): Promise<{ name: string }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('name')
    .eq('company_id', ctx.companyId)
    .eq('is_main', true)
    .maybeSingle();
  if (error) throw error;
  return { name: data?.name || 'Main warehouse' };
}

export async function listMainWarehouseStockBoardRows(
  ctx: WarehouseContext
): Promise<{ rows: unknown[] }> {
  const sb = getSupabaseAdmin();
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await sb
      .from('main_inventory')
      .select(MAIN_STOCK_BOARD_SELECT)
      .eq('company_id', ctx.companyId)
      .order('variant_id')
      .range(from, to);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { rows };
}

export async function getMainWarehouseAllocatableByVariant(
  ctx: WarehouseContext,
  variantIds?: string[] | null
): Promise<{ allocatableByVariantId: Record<string, number> }> {
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('get_main_warehouse_allocatable_by_variant', {
    p_variant_ids: variantIds?.length ? variantIds : null,
  });
  if (error) throw error;

  const map: Record<string, number> = {};
  for (const row of (data as { variant_id: string; allocatable: number }[]) || []) {
    const vid = String(row.variant_id);
    map[vid] = Math.max(0, Number(row.allocatable || 0));
  }
  return { allocatableByVariantId: map };
}
