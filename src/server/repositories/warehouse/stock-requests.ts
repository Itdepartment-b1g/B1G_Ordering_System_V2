import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type WarehouseStockRequestStatus =
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

export type WarehouseStockRequestRow = {
  id: string;
  request_number: string;
  status: WarehouseStockRequestStatus;
  expected_delivery_date: string | null;
  notes: string | null;
  created_at: string;
  brand: { id: string; name: string } | null;
  created_by_user: { full_name: string } | null;
  items: Array<{
    id: string;
    variant_id: string;
    ordered_quantity: number;
    received_quantity: number;
    variant: {
      id: string;
      name: string;
      variant_type: string;
      brand: { id: string; name: string } | null;
    } | null;
  }>;
  receives: Array<{
    id: string;
    received_at: string;
    notes: string | null;
    batch: { batch_number: string; total_amount?: number | null } | null;
    received_by_user: { full_name: string } | null;
    lines: Array<{
      id: string;
      variant_id: string;
      quantity: number;
      box_count: number | null;
      units_per_box: number | null;
      loose_box_count: number | null;
      loose_qty: number | null;
      extra_qty: number;
      manufactured_date: string | null;
      expiration_date: string | null;
      unit_cost: number | null;
      variant: {
        id: string;
        name: string;
        brand: { id: string; name: string } | null;
      } | null;
    }>;
  }>;
};

export type BrandOption = { id: string; name: string };

export type CatalogVariant = {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
  brand: { id: string; name: string } | { id: string; name: string }[] | null;
};

export type StockRequestItemInput = {
  variant_id: string;
  quantity: number;
};

export type CreateStockRequestPayload = {
  brand_id?: string | null;
  items: StockRequestItemInput[];
  notes?: string | null;
  expected_delivery_date?: string | null;
};

export type UpdateStockRequestPayload = {
  request_id: string;
  items: StockRequestItemInput[];
  notes?: string | null;
  expected_delivery_date?: string | null;
};

export type ReceiveStockRequestPayload = {
  request_id: string;
  items: unknown[];
  notes?: string | null;
};

export type CancelStockRequestPayload = {
  request_id: string;
  reason?: string | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_number?: string;
  batch_number?: string;
  fully_received?: boolean;
  total_received?: number;
  total_amount?: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapRequestRow(raw: Record<string, unknown>): WarehouseStockRequestRow {
  const brand = firstRelation(
    raw.brand as WarehouseStockRequestRow['brand'] | WarehouseStockRequestRow['brand'][]
  );
  const createdBy = firstRelation(
    raw.created_by_user as
      | WarehouseStockRequestRow['created_by_user']
      | WarehouseStockRequestRow['created_by_user'][]
  );

  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: row.id as string,
      variant_id: row.variant_id as string,
      ordered_quantity: row.ordered_quantity as number,
      received_quantity: row.received_quantity as number,
      variant: (() => {
        const v = firstRelation(
          row.variant as
            | WarehouseStockRequestRow['items'][0]['variant']
            | WarehouseStockRequestRow['items'][0]['variant'][]
        );
        if (!v) return null;
        const itemBrand = firstRelation(
          v.brand as { id: string; name: string } | { id: string; name: string }[]
        );
        return { ...v, brand: itemBrand };
      })(),
    };
  });

  const receives = ((raw.receives as unknown[]) ?? []).map((recv) => {
    const row = recv as Record<string, unknown>;
    const lines = ((row.lines as unknown[]) ?? []).map((lineRaw) => {
      const line = lineRaw as Record<string, unknown>;
      const variant = firstRelation(
        line.variant as
          | WarehouseStockRequestRow['receives'][0]['lines'][0]['variant']
          | WarehouseStockRequestRow['receives'][0]['lines'][0]['variant'][]
      );
      return {
        id: line.id as string,
        variant_id: line.variant_id as string,
        quantity: line.quantity as number,
        box_count: (line.box_count as number | null) ?? null,
        units_per_box: (line.units_per_box as number | null) ?? null,
        loose_box_count: (line.loose_box_count as number | null) ?? null,
        loose_qty: (line.loose_qty as number | null) ?? null,
        extra_qty: (line.extra_qty as number | null) ?? 0,
        manufactured_date: (line.manufactured_date as string | null) ?? null,
        expiration_date: (line.expiration_date as string | null) ?? null,
        unit_cost: (line.unit_cost as number | null) ?? null,
        variant: variant
          ? {
              ...variant,
              brand: firstRelation(
                variant.brand as { id: string; name: string } | { id: string; name: string }[]
              ),
            }
          : null,
      };
    });

    return {
      id: row.id as string,
      received_at: row.received_at as string,
      notes: row.notes as string | null,
      batch: firstRelation(row.batch as WarehouseStockRequestRow['receives'][0]['batch']),
      received_by_user: firstRelation(
        row.received_by_user as WarehouseStockRequestRow['receives'][0]['received_by_user']
      ),
      lines: Array.isArray(lines) ? lines : [],
    };
  });

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as WarehouseStockRequestStatus,
    expected_delivery_date: raw.expected_delivery_date as string | null,
    notes: raw.notes as string | null,
    created_at: raw.created_at as string,
    brand,
    created_by_user: createdBy,
    items,
    receives,
  };
}

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (!result.success) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
}

function requireUserClient(ctx: WarehouseContext) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  return getSupabaseUser(ctx.accessToken);
}

export async function listWarehouseStockRequests(
  ctx: WarehouseContext
): Promise<{ requests: WarehouseStockRequestRow[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_stock_requests')
    .select(
      `
      id,
      request_number,
      status,
      expected_delivery_date,
      notes,
      created_at,
      brand:brands ( id, name ),
      created_by_user:profiles!warehouse_stock_requests_created_by_fkey ( full_name ),
      items:warehouse_stock_request_items (
        id,
        variant_id,
        ordered_quantity,
        received_quantity,
        variant:variants ( id, name, variant_type, brand:brands ( id, name ) )
      ),
      receives:warehouse_stock_request_receives (
        id,
        received_at,
        notes,
        batch:inventory_batches ( batch_number, total_amount ),
        received_by_user:profiles!warehouse_stock_request_receives_received_by_fkey ( full_name ),
        lines:warehouse_stock_request_receive_lines (
          id,
          variant_id,
          quantity,
          box_count,
          units_per_box,
          loose_box_count,
          loose_qty,
          extra_qty,
          manufactured_date,
          expiration_date,
          unit_cost,
          variant:variants ( id, name, brand:brands ( id, name ) )
        )
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return {
    requests: (data ?? []).map((row) => mapRequestRow(row as Record<string, unknown>)),
  };
}

export async function listWarehouseStockRequestBrands(
  ctx: WarehouseContext
): Promise<{ brands: BrandOption[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('brands')
    .select('id, name')
    .eq('company_id', ctx.companyId)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return { brands: (data ?? []) as BrandOption[] };
}

export async function listWarehouseStockRequestCatalog(
  ctx: WarehouseContext
): Promise<{ variants: CatalogVariant[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('variants')
    .select('id, name, variant_type, brand_id, brand:brands ( id, name )')
    .eq('company_id', ctx.companyId)
    .eq('is_active', true)
    .order('variant_type')
    .order('name');
  if (error) throw error;
  return { variants: (data ?? []) as CatalogVariant[] };
}

export async function createWarehouseStockRequest(
  ctx: WarehouseContext,
  payload: CreateStockRequestPayload
) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('create_warehouse_stock_request', {
    p_brand_id: payload.brand_id ?? null,
    p_items: payload.items,
    p_notes: payload.notes ?? null,
    p_expected_delivery_date: payload.expected_delivery_date || null,
    p_created_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to create stock request');
}

export async function updateWarehouseStockRequest(
  ctx: WarehouseContext,
  payload: UpdateStockRequestPayload
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('update_warehouse_stock_request', {
    p_request_id: payload.request_id,
    p_items: payload.items,
    p_notes: payload.notes ?? null,
    p_expected_delivery_date: payload.expected_delivery_date || null,
    p_updated_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to update stock request');
}

export async function receiveWarehouseStockRequest(
  ctx: WarehouseContext,
  payload: ReceiveStockRequestPayload
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one receive item is required');
  }
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('receive_warehouse_stock_request', {
    p_request_id: payload.request_id,
    p_items: payload.items,
    p_notes: payload.notes ?? null,
    p_received_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to receive stock');
}

export async function cancelWarehouseStockRequest(
  ctx: WarehouseContext,
  payload: CancelStockRequestPayload
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('cancel_warehouse_stock_request', {
    p_request_id: payload.request_id,
    p_reason: payload.reason || 'Cancelled by user',
    p_cancelled_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to cancel request');
}
