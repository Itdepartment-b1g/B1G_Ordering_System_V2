import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export const PHYSICAL_COUNT_ROLES = ['warehouse', 'executive', 'finance', 'accounting'] as const;

export type WarehouseHubCompany = {
  id: string;
  company_name: string;
};

export type PhysicalCountTenantContext = {
  inventoryCompanyId: string | null;
  hasWarehouseLink: boolean;
  isHubLinked: boolean;
};

export type LocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

export type PhysicalCountBatchOption = {
  batchId: string;
  batchNumber: string;
  receivedAt: string;
  sourceType: string;
  skuCount: number;
  lotCount: number;
  totalUnits: number;
};

export type PhysicalCountLineDto = {
  lotId: string | null;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  expirationDate: string | null;
  systemQty: number;
};

export type PhysicalCountBrandOption = { id: string; name: string };

export type PhysicalCountVariantOption = {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
};

export type PhysicalCountBatchCatalog = {
  brands: PhysicalCountBrandOption[];
  variantsByBrand: Record<string, PhysicalCountVariantOption[]>;
};

export type PhysicalCountLotOption = {
  lotId: string;
  expirationDate: string | null;
  quantityRemaining: number;
};

export type PhysicalCountHistoryRow = {
  id: string;
  counted_at: string;
  created_at: string;
  signature_url: string;
  signature_path: string;
  notes: string | null;
  batch: { id: string; batch_number: string } | null;
  warehouse_location: { id: string; name: string; is_main: boolean } | null;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_by_user: { id: string; full_name: string } | null;
  line_count: number;
  total_variance: number;
};

export type PhysicalCountHistoryDetail = PhysicalCountHistoryRow & {
  lines: Array<{
    id: string;
    brand_name: string;
    variant_name: string;
    expiration_date: string | null;
    system_qty_snapshot: number;
    physical_qty: number;
    box_count: number | null;
    units_per_box: number | null;
    loose_box_count: number | null;
    loose_qty: number | null;
    variance: number;
  }>;
};

export type HistoryFilterOption = { id: string; name: string };

export type SubmitPhysicalCountPayload = {
  warehouse_location_id: string;
  batch_id: string;
  lines: Array<{
    variant_id: string;
    lot_id: string | null;
    physical_qty: number;
    box_count: number;
    units_per_box: number;
    loose_box_count: number;
    loose_qty: number;
    system_qty_snapshot: number;
    brand_name: string;
    variant_name: string;
    expiration_date?: string | null;
  }>;
  signature_url: string;
  signature_path: string;
  notes?: string | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  session_id?: string;
  inventory_company_id?: string | null;
  has_warehouse_link?: boolean;
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
  if (result.success === false || !result.success) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
}

function canPickWarehouseHub(role: string) {
  return role === 'executive' || role === 'finance' || role === 'accounting';
}

/**
 * Resolve which warehouse company inventory the caller may query.
 * Warehouse roles use tenant RPC; executive/finance pick an active Warehouse hub.
 */
export async function resolvePhysicalCountCompanyId(
  ctx: WarehouseContext,
  requestedCompanyId?: string | null
): Promise<string> {
  const sb = getSupabaseAdmin();

  if (canPickWarehouseHub(ctx.role)) {
    if (!requestedCompanyId) throw new HttpError(400, 'companyId is required');
    const { data, error } = await sb
      .from('companies')
      .select('id, role, status')
      .eq('id', requestedCompanyId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'active' || data.role !== 'Warehouse') {
      throw new HttpError(403, 'Invalid warehouse company');
    }
    return requestedCompanyId;
  }

  // Warehouse (and any other allowed role): resolve inventory company via RPC.
  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('get_physical_count_tenant_context', {
    p_tenant_company_id: ctx.companyId,
  });
  if (error) throw error;
  const result = data as RpcResult | null;
  if (!result?.success) {
    throw new HttpError(400, result?.error || 'Failed to resolve inventory company');
  }
  const inventoryCompanyId = result.inventory_company_id ?? ctx.companyId;
  if (!inventoryCompanyId) throw new HttpError(400, 'No inventory company linked');

  if (requestedCompanyId && requestedCompanyId !== inventoryCompanyId) {
    throw new HttpError(403, 'You can only access your linked warehouse inventory');
  }
  return inventoryCompanyId;
}

export async function listWarehouseHubCompanies(
  ctx: WarehouseContext
): Promise<{ companies: WarehouseHubCompany[] }> {
  if (!canPickWarehouseHub(ctx.role)) {
    throw new HttpError(403, 'Only executive/finance can list warehouse hubs');
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('companies')
    .select('id, company_name')
    .eq('status', 'active')
    .eq('role', 'Warehouse')
    .order('company_name');
  if (error) throw error;
  return { companies: (data ?? []) as WarehouseHubCompany[] };
}

export async function getPhysicalCountTenantContext(
  ctx: WarehouseContext
): Promise<{ tenant: PhysicalCountTenantContext }> {
  if (canPickWarehouseHub(ctx.role)) {
    return {
      tenant: {
        inventoryCompanyId: null,
        hasWarehouseLink: false,
        isHubLinked: false,
      },
    };
  }

  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('get_physical_count_tenant_context', {
    p_tenant_company_id: ctx.companyId,
  });
  if (error) throw error;
  const result = data as RpcResult | null;
  if (!result?.success) {
    throw new HttpError(400, result?.error || 'Failed to resolve inventory company');
  }

  const inventoryCompanyId = result.inventory_company_id ?? null;
  const hasWarehouseLink = result.has_warehouse_link === true;

  return {
    tenant: {
      inventoryCompanyId,
      hasWarehouseLink,
      isHubLinked:
        hasWarehouseLink && !!inventoryCompanyId && inventoryCompanyId !== ctx.companyId,
    },
  };
}

export async function listPhysicalCountLocations(
  ctx: WarehouseContext,
  companyId: string
): Promise<{ locations: LocationOption[] }> {
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', resolved)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;
  return { locations: (data ?? []) as LocationOption[] };
}

export async function listPhysicalCountBatches(
  ctx: WarehouseContext,
  companyId: string,
  locationId: string
): Promise<{ batches: PhysicalCountBatchOption[] }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);

  if (!ctx.isMain && ctx.locationId && locationId !== ctx.locationId && ctx.role === 'warehouse') {
    throw new HttpError(403, 'You can only count your sub-warehouse');
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select(
      `
      id,
      quantity_remaining,
      variant_id,
      batch:inventory_batches (
        id,
        batch_number,
        source_type,
        received_at
      )
    `
    )
    .eq('company_id', resolved)
    .eq('warehouse_location_id', locationId);
  if (error) throw error;

  const batchMap = new Map<
    string,
    {
      batchId: string;
      batchNumber: string;
      receivedAt: string;
      sourceType: string;
      variantIds: Set<string>;
      lotCount: number;
      totalUnits: number;
    }
  >();

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const batch = firstRelation(
      row.batch as {
        id: string;
        batch_number: string;
        source_type: string;
        received_at: string;
      } | null
    );
    if (!batch) continue;

    const qty = Number(row.quantity_remaining) || 0;
    const variantId = row.variant_id as string;
    let acc = batchMap.get(batch.id);
    if (!acc) {
      acc = {
        batchId: batch.id,
        batchNumber: batch.batch_number,
        receivedAt: batch.received_at,
        sourceType: batch.source_type,
        variantIds: new Set(),
        lotCount: 0,
        totalUnits: 0,
      };
      batchMap.set(batch.id, acc);
    }
    acc.variantIds.add(variantId);
    acc.lotCount += 1;
    acc.totalUnits += qty;
  }

  return {
    batches: [...batchMap.values()]
      .map(
        (b) =>
          ({
            batchId: b.batchId,
            batchNumber: b.batchNumber,
            receivedAt: b.receivedAt,
            sourceType: b.sourceType,
            skuCount: b.variantIds.size,
            lotCount: b.lotCount,
            totalUnits: b.totalUnits,
          }) satisfies PhysicalCountBatchOption
      )
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
  };
}

export async function listPhysicalCountBatchLots(
  ctx: WarehouseContext,
  companyId: string,
  locationId: string,
  batchId: string
): Promise<{ lots: PhysicalCountLineDto[] }> {
  if (!locationId || !batchId) throw new HttpError(400, 'locationId and batchId are required');
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);

  if (!ctx.isMain && ctx.locationId && locationId !== ctx.locationId && ctx.role === 'warehouse') {
    throw new HttpError(403, 'You can only count your sub-warehouse');
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select(
      `
      id,
      quantity_remaining,
      expiration_date,
      received_at,
      variant:variants (
        id,
        name,
        brand:brands ( id, name )
      )
    `
    )
    .eq('company_id', resolved)
    .eq('warehouse_location_id', locationId)
    .eq('batch_id', batchId)
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true });
  if (error) throw error;

  const lots = (data ?? [])
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      const variant = firstRelation(
        row.variant as {
          id: string;
          name: string;
          brand: { id: string; name: string } | { id: string; name: string }[] | null;
        } | null
      );
      const brand = variant ? firstRelation(variant.brand) : null;
      if (!variant || !brand) return null;
      return {
        lotId: row.id as string,
        brandId: brand.id,
        brandName: brand.name,
        variantId: variant.id,
        variantName: variant.name,
        expirationDate: (row.expiration_date as string | null) ?? null,
        systemQty: Number(row.quantity_remaining) || 0,
      } satisfies PhysicalCountLineDto;
    })
    .filter(Boolean) as PhysicalCountLineDto[];

  return { lots };
}

export async function getPhysicalCountBatchCatalog(
  ctx: WarehouseContext,
  companyId: string,
  locationId: string,
  batchId: string
): Promise<{ catalog: PhysicalCountBatchCatalog }> {
  if (!locationId || !batchId) throw new HttpError(400, 'locationId and batchId are required');
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select(
      `
      variant:variants (
        id,
        name,
        variant_type,
        brand:brands ( id, name )
      )
    `
    )
    .eq('company_id', resolved)
    .eq('warehouse_location_id', locationId)
    .eq('batch_id', batchId);
  if (error) throw error;

  const brandMap = new Map<string, PhysicalCountBrandOption>();
  const variantsByBrand = new Map<string, Map<string, PhysicalCountVariantOption>>();

  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const variant = firstRelation(
      row.variant as {
        id: string;
        name: string;
        variant_type: string;
        brand: { id: string; name: string } | { id: string; name: string }[] | null;
      } | null
    );
    const brand = variant ? firstRelation(variant.brand) : null;
    if (!variant || !brand) continue;

    brandMap.set(brand.id, { id: brand.id, name: brand.name });
    let brandVariants = variantsByBrand.get(brand.id);
    if (!brandVariants) {
      brandVariants = new Map();
      variantsByBrand.set(brand.id, brandVariants);
    }
    if (!brandVariants.has(variant.id)) {
      brandVariants.set(variant.id, {
        id: variant.id,
        name: variant.name,
        variant_type: variant.variant_type,
        brand_id: brand.id,
      });
    }
  }

  const brands = [...brandMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  const variantsByBrandRecord: Record<string, PhysicalCountVariantOption[]> = {};
  for (const [brandIdKey, variantMap] of variantsByBrand) {
    variantsByBrandRecord[brandIdKey] = [...variantMap.values()].sort((a, b) => {
      const typeCompare = a.variant_type.localeCompare(b.variant_type);
      return typeCompare !== 0 ? typeCompare : a.name.localeCompare(b.name);
    });
  }

  return { catalog: { brands, variantsByBrand: variantsByBrandRecord } };
}

export async function listPhysicalCountVariantLots(
  ctx: WarehouseContext,
  companyId: string,
  locationId: string,
  batchId: string,
  variantId: string
): Promise<{ lots: PhysicalCountLotOption[] }> {
  if (!locationId || !batchId || !variantId) {
    throw new HttpError(400, 'locationId, batchId, and variantId are required');
  }
  await resolvePhysicalCountCompanyId(ctx, companyId);

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('inventory_batch_lots')
    .select('id, quantity_remaining, expiration_date')
    .eq('batch_id', batchId)
    .eq('variant_id', variantId)
    .eq('warehouse_location_id', locationId)
    .order('expiration_date', { ascending: true, nullsFirst: false });
  if (error) throw error;

  return {
    lots: (data ?? []).map((row) => ({
      lotId: row.id as string,
      quantityRemaining: Number(row.quantity_remaining) || 0,
      expirationDate: (row.expiration_date as string | null) ?? null,
    })),
  };
}

export async function listPhysicalCountHistory(
  ctx: WarehouseContext,
  companyId: string,
  options: { locationId?: string | null; isMainScope: boolean }
): Promise<{ history: PhysicalCountHistoryRow[] }> {
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);
  const sb = getSupabaseAdmin();

  let query = sb
    .from('physical_count_sessions')
    .select(
      `
      id,
      counted_at,
      created_at,
      signature_url,
      signature_path,
      notes,
      performed_by,
      performed_by_name,
      batch:inventory_batches ( id, batch_number ),
      warehouse_location:warehouse_locations ( id, name, is_main ),
      performed_by_user:profiles!physical_count_sessions_performed_by_fkey ( id, full_name ),
      physical_count_lines ( variance )
    `
    )
    .eq('company_id', resolved)
    .order('created_at', { ascending: false });

  if (!options.isMainScope && options.locationId) {
    query = query.eq('warehouse_location_id', options.locationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return {
    history: (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const lines = (row.physical_count_lines as Array<{ variance: number }>) ?? [];
      return {
        id: row.id as string,
        counted_at: row.counted_at as string,
        created_at: row.created_at as string,
        signature_url: row.signature_url as string,
        signature_path: row.signature_path as string,
        notes: row.notes as string | null,
        batch: firstRelation(row.batch as PhysicalCountHistoryRow['batch']),
        warehouse_location: firstRelation(
          row.warehouse_location as PhysicalCountHistoryRow['warehouse_location']
        ),
        performed_by: (row.performed_by as string | null) ?? null,
        performed_by_name: (row.performed_by_name as string | null) ?? null,
        performed_by_user: firstRelation(
          row.performed_by_user as PhysicalCountHistoryRow['performed_by_user']
        ),
        line_count: lines.length,
        total_variance: lines.reduce((sum, l) => sum + (l.variance ?? 0), 0),
      } satisfies PhysicalCountHistoryRow;
    }),
  };
}

export async function getPhysicalCountSessionDetail(
  ctx: WarehouseContext,
  sessionId: string
): Promise<{ session: PhysicalCountHistoryDetail | null }> {
  if (!sessionId) throw new HttpError(400, 'sessionId is required');
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from('physical_count_sessions')
    .select(
      `
      id,
      company_id,
      counted_at,
      created_at,
      signature_url,
      signature_path,
      notes,
      performed_by,
      performed_by_name,
      batch:inventory_batches ( id, batch_number ),
      warehouse_location:warehouse_locations ( id, name, is_main ),
      performed_by_user:profiles!physical_count_sessions_performed_by_fkey ( id, full_name ),
      physical_count_lines (
        id,
        brand_name,
        variant_name,
        expiration_date,
        system_qty_snapshot,
        physical_qty,
        box_count,
        units_per_box,
        loose_box_count,
        loose_qty,
        variance
      )
    `
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { session: null };

  const companyId = (data as { company_id?: string }).company_id;
  if (companyId) await resolvePhysicalCountCompanyId(ctx, companyId);

  const row = data as Record<string, unknown>;
  const lines = (row.physical_count_lines as PhysicalCountHistoryDetail['lines']) ?? [];

  return {
    session: {
      id: row.id as string,
      counted_at: row.counted_at as string,
      created_at: row.created_at as string,
      signature_url: row.signature_url as string,
      signature_path: row.signature_path as string,
      notes: row.notes as string | null,
      batch: firstRelation(row.batch as PhysicalCountHistoryRow['batch']),
      warehouse_location: firstRelation(
        row.warehouse_location as PhysicalCountHistoryRow['warehouse_location']
      ),
      performed_by: (row.performed_by as string | null) ?? null,
      performed_by_name: (row.performed_by_name as string | null) ?? null,
      performed_by_user: firstRelation(
        row.performed_by_user as PhysicalCountHistoryRow['performed_by_user']
      ),
      line_count: lines.length,
      total_variance: lines.reduce((sum, l) => sum + (l.variance ?? 0), 0),
      lines: [...lines].sort((a, b) => a.brand_name.localeCompare(b.brand_name)),
    },
  };
}

export async function listPhysicalCountHistoryFilters(
  ctx: WarehouseContext,
  companyId: string
): Promise<{
  batchOptions: HistoryFilterOption[];
  locationOptions: HistoryFilterOption[];
  performedByOptions: HistoryFilterOption[];
}> {
  const resolved = await resolvePhysicalCountCompanyId(ctx, companyId);
  const sb = getSupabaseAdmin();

  const [batchesResult, locationsResult, sessionsResult] = await Promise.all([
    sb
      .from('inventory_batches')
      .select('id, batch_number')
      .eq('company_id', resolved)
      .order('batch_number'),
    sb
      .from('warehouse_locations')
      .select('id, name, is_main')
      .eq('company_id', resolved)
      .order('is_main', { ascending: false })
      .order('name'),
    sb
      .from('physical_count_sessions')
      .select('performed_by, performed_by_name')
      .eq('company_id', resolved)
      .not('performed_by', 'is', null),
  ]);

  if (batchesResult.error) throw batchesResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (sessionsResult.error) throw sessionsResult.error;

  const batchOptions: HistoryFilterOption[] = (batchesResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.batch_number as string,
  }));

  const locationOptions: HistoryFilterOption[] = (locationsResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.is_main ? `${row.name} (main)` : (row.name as string),
  }));

  const performerMap = new Map<string, string>();
  for (const session of sessionsResult.data ?? []) {
    const row = session as { performed_by: string | null; performed_by_name: string | null };
    if (!row.performed_by) continue;
    const label = row.performed_by_name?.trim() || 'Unknown';
    performerMap.set(row.performed_by, label);
  }

  const performedByOptions: HistoryFilterOption[] = [...performerMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { batchOptions, locationOptions, performedByOptions };
}

export async function submitPhysicalCount(
  ctx: WarehouseContext,
  payload: SubmitPhysicalCountPayload
) {
  if (ctx.role === 'finance' || ctx.role === 'accounting') {
    throw new HttpError(403, 'View-only roles cannot submit physical counts');
  }
  if (!payload.warehouse_location_id) throw new HttpError(400, 'warehouse_location_id is required');
  if (!payload.batch_id) throw new HttpError(400, 'batch_id is required');
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new HttpError(400, 'At least one line is required');
  }
  if (!payload.signature_url || !payload.signature_path) {
    throw new HttpError(400, 'Signature is required');
  }

  if (
    !ctx.isMain &&
    ctx.locationId &&
    payload.warehouse_location_id !== ctx.locationId &&
    ctx.role === 'warehouse'
  ) {
    throw new HttpError(403, 'You can only count your sub-warehouse');
  }

  const userSb = requireUserClient(ctx);
  const { data, error } = await userSb.rpc('submit_physical_count', {
    p_warehouse_location_id: payload.warehouse_location_id,
    p_batch_id: payload.batch_id,
    p_lines: payload.lines,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path,
    p_notes: payload.notes || null,
    p_performed_by: ctx.userId,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Physical count submission failed');
}
