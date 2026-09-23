import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

export type InventoryBatchSourceType =
  | 'opening_balance'
  | 'stock_request_receive'
  | 'adjustment_in';

export type LotReceivePacking = {
  box_count: number | null;
  units_per_box: number | null;
  loose_box_count?: number | null;
  loose_qty?: number | null;
  extra_qty?: number | null;
  quantity?: number | null;
  label: string | null;
};

export type BatchInventoryLotLine = {
  lotId: string;
  batchId: string;
  variantId: string;
  variantName: string;
  variantType: string | null;
  expirationDate: string | null;
  quantity: number;
  packing?: LotReceivePacking | null;
};

export type BatchInventoryBrandGroup = {
  brandId: string;
  brandName: string;
  lots: BatchInventoryLotLine[];
};

export type BatchInventoryGroup = {
  batchId: string;
  batchNumber: string;
  receivedAt: string;
  sourceType: InventoryBatchSourceType;
  totalAmount: number;
  locationId: string;
  locationName: string;
  skuCount: number;
  totalUnits: number;
  brands: BatchInventoryBrandGroup[];
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function fmtQty(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatReceivePacking(line: {
  box_count: number | null;
  units_per_box: number | null;
  loose_box_count?: number | null;
  loose_qty?: number | null;
  extra_qty?: number | null;
}): string {
  const boxes = line.box_count;
  const perBox = line.units_per_box;
  const looseBoxes = line.loose_box_count ?? 0;
  const looseQty = line.loose_qty ?? 0;
  const legacyExtra = line.extra_qty ?? 0;

  if (boxes != null && perBox != null) {
    const boxed = `Boxes ${fmtQty(boxes)} × ${fmtQty(perBox)}`;
    if (looseBoxes > 0 || looseQty > 0) {
      return `${boxed} + Loose ${fmtQty(looseBoxes)} × ${fmtQty(looseQty)}`;
    }
    if (legacyExtra > 0 && looseBoxes === 0 && looseQty === 0) {
      return `${boxed} + Loose ${fmtQty(legacyExtra)}`;
    }
    return boxed;
  }
  if (looseBoxes > 0 || looseQty > 0) {
    return `Loose ${fmtQty(looseBoxes)} × ${fmtQty(looseQty)}`;
  }
  if (legacyExtra > 0) return `Loose ${fmtQty(legacyExtra)}`;
  return '—';
}

async function fetchReceivePackingByLotIds(
  lotIds: string[]
): Promise<Record<string, LotReceivePacking>> {
  const uniqueIds = [...new Set(lotIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const sb = getSupabaseAdmin();
  const packingByLotId: Record<string, LotReceivePacking> = {};
  const chunkSize = 200;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await sb
      .from('warehouse_stock_request_receive_lines')
      .select('lot_id, quantity, box_count, units_per_box, loose_box_count, loose_qty, extra_qty')
      .in('lot_id', chunk);
    if (error) throw error;

    for (const row of data ?? []) {
      const lotId = String((row as { lot_id?: string | null }).lot_id || '');
      if (!lotId || packingByLotId[lotId]) continue;
      const fields = row as {
        box_count: number | null;
        units_per_box: number | null;
        loose_box_count?: number | null;
        loose_qty?: number | null;
        extra_qty?: number | null;
        quantity?: number | null;
      };
      const label = formatReceivePacking(fields);
      if (label === '—') continue;
      packingByLotId[lotId] = {
        box_count: fields.box_count ?? null,
        units_per_box: fields.units_per_box ?? null,
        loose_box_count: fields.loose_box_count ?? null,
        loose_qty: fields.loose_qty ?? null,
        extra_qty: fields.extra_qty ?? null,
        quantity: fields.quantity ?? null,
        label,
      };
    }
  }

  return packingByLotId;
}

function compareLots(a: BatchInventoryLotLine, b: BatchInventoryLotLine): number {
  const nameCompare = a.variantName.localeCompare(b.variantName);
  if (nameCompare !== 0) return nameCompare;
  if (!a.expirationDate && !b.expirationDate) return 0;
  if (!a.expirationDate) return 1;
  if (!b.expirationDate) return -1;
  return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
}

function mapBatchInventoryGroups(
  data: unknown[],
  packingByLotId: Record<string, LotReceivePacking>
): BatchInventoryGroup[] {
  type Acc = {
    batchId: string;
    batchNumber: string;
    receivedAt: string;
    sourceType: InventoryBatchSourceType;
    totalAmount: number;
    locationId: string;
    locationName: string;
    brandMap: Map<string, { brandId: string; brandName: string; lots: BatchInventoryLotLine[] }>;
    totalUnits: number;
    variantIds: Set<string>;
  };

  const batchMap = new Map<string, Acc>();

  for (const raw of data) {
    const row = raw as Record<string, unknown>;
    const batch = firstRelation(
      row.batch as
        | {
            id: string;
            batch_number: string;
            source_type: InventoryBatchSourceType;
            received_at: string;
            total_amount?: number | null;
          }
        | null
    );
    const variant = firstRelation(
      row.variant as
        | {
            id: string;
            name: string;
            variant_type: string | null;
            brand: { id: string; name: string } | { id: string; name: string }[] | null;
          }
        | null
    );
    const brand = variant
      ? firstRelation(variant.brand as { id: string; name: string } | { id: string; name: string }[] | null)
      : null;
    const location = firstRelation(row.warehouse_location as { id: string; name: string } | null);
    if (!batch || !variant || !brand || !location) continue;

    const qty = Number(row.quantity_remaining);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const key = `${batch.id}:${location.id}`;
    let acc = batchMap.get(key);
    if (!acc) {
      acc = {
        batchId: batch.id,
        batchNumber: batch.batch_number,
        receivedAt: batch.received_at,
        sourceType: batch.source_type,
        totalAmount: Number(batch.total_amount) || 0,
        locationId: location.id,
        locationName: location.name,
        brandMap: new Map(),
        totalUnits: 0,
        variantIds: new Set(),
      };
      batchMap.set(key, acc);
    }

    acc.totalUnits += qty;
    acc.variantIds.add(variant.id);

    let brandAcc = acc.brandMap.get(brand.id);
    if (!brandAcc) {
      brandAcc = { brandId: brand.id, brandName: brand.name, lots: [] };
      acc.brandMap.set(brand.id, brandAcc);
    }

    brandAcc.lots.push({
      lotId: row.id as string,
      batchId: batch.id,
      variantId: variant.id,
      variantName: variant.name,
      variantType: variant.variant_type,
      expirationDate: (row.expiration_date as string | null) ?? null,
      quantity: qty,
      packing: packingByLotId[row.id as string] ?? null,
    });
  }

  const groups: BatchInventoryGroup[] = [];
  for (const acc of batchMap.values()) {
    const brands: BatchInventoryBrandGroup[] = [...acc.brandMap.values()]
      .map((b) => ({
        brandId: b.brandId,
        brandName: b.brandName,
        lots: [...b.lots].sort(compareLots),
      }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName));

    groups.push({
      batchId: `${acc.batchId}:${acc.locationId}`,
      batchNumber: acc.batchNumber,
      receivedAt: acc.receivedAt,
      sourceType: acc.sourceType,
      totalAmount: acc.totalAmount,
      locationId: acc.locationId,
      locationName: acc.locationName,
      skuCount: acc.variantIds.size,
      totalUnits: acc.totalUnits,
      brands,
    });
  }

  return groups.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
}

/**
 * @param locationId - concrete location uuid, or `"all"` for main-warehouse company-wide view
 */
export async function listWarehouseBatchInventory(
  ctx: WarehouseContext,
  locationId: string
): Promise<{ groups: BatchInventoryGroup[] }> {
  if (!locationId) throw new HttpError(400, 'locationId is required');

  const scopeAll = locationId === 'all';
  if (scopeAll && !ctx.isMain) {
    throw new HttpError(403, 'Only main warehouse can view all locations');
  }
  if (!scopeAll && !ctx.isMain && ctx.locationId && locationId !== ctx.locationId) {
    throw new HttpError(403, 'You can only view batch inventory for your sub-warehouse');
  }

  const sb = getSupabaseAdmin();
  let query = sb
    .from('inventory_batch_lots')
    .select(
      `
      id,
      quantity_remaining,
      expiration_date,
      batch:inventory_batches (
        id,
        batch_number,
        source_type,
        received_at,
        total_amount
      ),
      variant:variants (
        id,
        name,
        variant_type,
        brand:brands ( id, name )
      ),
      warehouse_location:warehouse_locations ( id, name )
    `
    )
    .eq('company_id', ctx.companyId)
    .gt('quantity_remaining', 0);

  if (!scopeAll) {
    query = query.eq('warehouse_location_id', locationId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const lotIds = rows.map((row) => String((row as { id: string }).id));
  const packingByLotId = await fetchReceivePackingByLotIds(lotIds);
  return { groups: mapBatchInventoryGroups(rows, packingByLotId) };
}
