import type { InventoryBatchSourceType } from '@/types/database.types';

import type {
  BatchInventoryBrandGroup,
  BatchInventoryGroup,
  BatchInventoryLotLine,
} from '../types';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type RawBatchLotRow = {
  id: string;
  quantity_remaining: number;
  expiration_date: string | null;
  batch:
    | {
        id: string;
        batch_number: string;
        source_type: InventoryBatchSourceType;
        received_at: string;
        total_amount?: number | null;
      }
    | {
        id: string;
        batch_number: string;
        source_type: InventoryBatchSourceType;
        received_at: string;
        total_amount?: number | null;
      }[]
    | null;
  variant:
    | {
        id: string;
        name: string;
        variant_type: string | null;
        brand: { id: string; name: string } | { id: string; name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        variant_type: string | null;
        brand: { id: string; name: string } | { id: string; name: string }[] | null;
      }[]
    | null;
  warehouse_location:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

type BatchAccumulator = {
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

function compareLots(a: BatchInventoryLotLine, b: BatchInventoryLotLine): number {
  const nameCompare = a.variantName.localeCompare(b.variantName);
  if (nameCompare !== 0) return nameCompare;

  if (!a.expirationDate && !b.expirationDate) return 0;
  if (!a.expirationDate) return 1;
  if (!b.expirationDate) return -1;
  return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
}

export function mapBatchInventoryGroups(data: unknown[]): BatchInventoryGroup[] {
  const batchMap = new Map<string, BatchAccumulator>();

  for (const raw of data) {
    const row = raw as RawBatchLotRow;
    const batch = firstRelation(row.batch);
    const variant = firstRelation(row.variant);
    const brand = variant ? firstRelation(variant.brand) : null;
    const location = firstRelation(row.warehouse_location);
    if (!batch || !variant || !brand || !location) continue;

    const qty = Number(row.quantity_remaining);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    let acc = batchMap.get(`${batch.id}:${location.id}`);
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
      batchMap.set(`${batch.id}:${location.id}`, acc);
    }

    acc.totalUnits += qty;
    acc.variantIds.add(variant.id);

    let brandAcc = acc.brandMap.get(brand.id);
    if (!brandAcc) {
      brandAcc = {
        brandId: brand.id,
        brandName: brand.name,
        lots: [],
      };
      acc.brandMap.set(brand.id, brandAcc);
    }

    brandAcc.lots.push({
      variantId: variant.id,
      variantName: variant.name,
      variantType: variant.variant_type,
      expirationDate: row.expiration_date ?? null,
      quantity: qty,
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
