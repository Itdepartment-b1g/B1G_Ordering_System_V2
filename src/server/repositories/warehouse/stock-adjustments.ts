import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type WarehouseStockAdjustmentRow = {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  notes: string | null;
  created_at: string;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { id: string; name: string } | null;
  } | null;
  batch: { batch_number: string } | null;
  performed_by_user: { full_name: string } | null;
};

export type BrandOption = { id: string; name: string };
export type VariantOption = { id: string; name: string; variant_type: string; brand_id: string };

export type BatchLotOption = {
  lot_id: string;
  batch_id: string;
  batch_number: string;
  source_type: string;
  quantity_remaining: number;
  quantity_received: number;
  received_at: string;
  expiration_date: string | null;
};

export type ApplyStockAdjustmentPayload = {
  warehouse_location_id: string;
  variant_id: string;
  quantity_delta: number;
  reason: string;
  notes?: string | null;
  lot_id?: string | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  batch_number?: string;
  direction?: string;
  quantity?: number;
  remaining_after?: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapAdjustmentRow(raw: Record<string, unknown>): WarehouseStockAdjustmentRow {
  const variant = firstRelation(
    raw.variant as WarehouseStockAdjustmentRow['variant'] | WarehouseStockAdjustmentRow['variant'][]
  );
  const brand = variant?.brand
    ? firstRelation(variant.brand as { id: string; name: string } | { id: string; name: string }[])
    : null;

  return {
    id: raw.id as string,
    direction: raw.direction as 'in' | 'out',
    quantity: raw.quantity as number,
    reason: raw.reason as string,
    notes: raw.notes as string | null,
    created_at: raw.created_at as string,
    warehouse_location: firstRelation(
      raw.warehouse_location as WarehouseStockAdjustmentRow['warehouse_location']
    ),
    variant: variant ? { ...variant, brand } : null,
    batch: firstRelation(raw.batch as WarehouseStockAdjustmentRow['batch']),
    performed_by_user: firstRelation(
      raw.performed_by_user as WarehouseStockAdjustmentRow['performed_by_user']
    ),
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

export async function listWarehouseStockAdjustments(
  ctx: WarehouseContext
): Promise<{ adjustments: WarehouseStockAdjustmentRow[] }> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_stock_adjustments')
    .select(
      `
      id,
      direction,
      quantity,
      reason,
      notes,
      created_at,
      warehouse_location:warehouse_locations ( name, is_main ),
      variant:variants (
        name,
        variant_type,
        brand:brands ( id, name )
      ),
      batch:inventory_batches ( batch_number ),
      performed_by_user:profiles!warehouse_stock_adjustments_performed_by_fkey ( full_name )
    `
    )
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return {
    adjustments: (data ?? []).map((row) => mapAdjustmentRow(row as Record<string, unknown>)),
  };
}

export async function listWarehouseStockAdjustmentBrands(
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

export async function listWarehouseStockAdjustmentVariants(
  ctx: WarehouseContext,
  brandId: string
): Promise<{ variants: VariantOption[] }> {
  if (!brandId) throw new HttpError(400, 'brandId is required');
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('variants')
    .select('id, name, variant_type, brand_id')
    .eq('company_id', ctx.companyId)
    .eq('brand_id', brandId)
    .eq('is_active', true)
    .order('variant_type')
    .order('name');
  if (error) throw error;
  return { variants: (data ?? []) as VariantOption[] };
}

export async function listWarehouseStockAdjustmentBatchLots(
  ctx: WarehouseContext,
  locationId: string,
  variantId: string
): Promise<{ lots: BatchLotOption[] }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');
  if (!variantId) throw new HttpError(400, 'variantId is required');

  const sb = getSupabaseAdmin();
  const { data: loc, error: locError } = await sb
    .from('warehouse_locations')
    .select('id')
    .eq('id', locationId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (locError) throw locError;
  if (!loc) throw new HttpError(404, 'Warehouse location not found');

  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select(
      `
      id,
      batch_id,
      quantity_remaining,
      quantity_received,
      received_at,
      expiration_date,
      batch:inventory_batches (
        batch_number,
        source_type
      )
    `
    )
    .eq('warehouse_location_id', locationId)
    .eq('variant_id', variantId)
    .order('received_at', { ascending: true });
  if (error) throw error;

  const lots = (data ?? [])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const batch = firstRelation(
        r.batch as { batch_number: string; source_type: string } | null
      );
      if (!batch) return null;
      return {
        lot_id: r.id as string,
        batch_id: r.batch_id as string,
        batch_number: batch.batch_number,
        source_type: batch.source_type,
        quantity_remaining: r.quantity_remaining as number,
        quantity_received: r.quantity_received as number,
        received_at: r.received_at as string,
        expiration_date: (r.expiration_date as string | null) ?? null,
      } satisfies BatchLotOption;
    })
    .filter(Boolean) as BatchLotOption[];

  return { lots };
}

export async function applyWarehouseStockAdjustment(
  ctx: WarehouseContext,
  payload: ApplyStockAdjustmentPayload
) {
  if (!payload.warehouse_location_id) {
    throw new HttpError(400, 'warehouse_location_id is required');
  }
  if (!payload.variant_id) throw new HttpError(400, 'variant_id is required');
  if (!Number.isFinite(payload.quantity_delta) || payload.quantity_delta === 0) {
    throw new HttpError(400, 'quantity_delta must be a non-zero number');
  }
  if (!payload.reason || payload.reason.trim().length < 3) {
    throw new HttpError(400, 'reason is required (at least 3 characters)');
  }

  const userSb = requireUserClient(ctx);
  const rpcParams: Record<string, unknown> = {
    p_warehouse_location_id: payload.warehouse_location_id,
    p_variant_id: payload.variant_id,
    p_quantity_delta: payload.quantity_delta,
    p_reason: payload.reason.trim(),
    p_notes: payload.notes ?? null,
    p_performed_by: ctx.userId,
  };
  // Only send p_lot_id when set — PostgREST 404s if DB only has the 6-arg RPC.
  if (payload.lot_id) {
    rpcParams.p_lot_id = payload.lot_id;
  }

  const { data, error } = await userSb.rpc('apply_warehouse_stock_adjustment', rpcParams);
  if (error) {
    const pgCode = (error as { code?: string }).code;
    const message = error.message || '';
    if (
      pgCode === 'PGRST202' ||
      pgCode === '42883' ||
      message.includes('404') ||
      message.toLowerCase().includes('not found')
    ) {
      throw new HttpError(
        400,
        'Batch adjustment is not enabled on this database yet. Run supabase/migrations/20260609160000_warehouse_stock_adjustments_by_batch.sql in the Supabase SQL Editor, then reload the API schema.'
      );
    }
    throw error;
  }
  return assertRpcSuccess(data, 'Adjustment failed');
}
