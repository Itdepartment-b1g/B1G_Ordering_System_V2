import { differenceInDays } from 'date-fns';
import type { InventoryBatchSourceType } from '@/types/database.types';

export type AgeBucket = 'all' | '0-30' | '31-60' | '61+';

export type BatchAgingRow = {
  lotId: string;
  batchNumber: string;
  sourceType: InventoryBatchSourceType;
  quantityRemaining: number;
  quantityReceived: number;
  receivedAt: string;
  daysInWarehouse: number;
  variantId: string;
  variantName: string;
  variantType: string;
  brandId: string;
  brandName: string;
  locationId: string;
  locationName: string;
  locationIsMain: boolean;
};

export const BATCH_SOURCE_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  stock_request_receive: 'Stock request',
  adjustment_in: 'Adjustment',
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type RawBatchLotRow = {
  id: string;
  quantity_remaining: number;
  quantity_received: number;
  received_at: string;
  batch:
    | { batch_number: string; source_type: InventoryBatchSourceType }
    | { batch_number: string; source_type: InventoryBatchSourceType }[]
    | null;
  variant:
    | {
        id: string;
        name: string;
        variant_type: string;
        brand: { id: string; name: string } | { id: string; name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        variant_type: string;
        brand: { id: string; name: string } | { id: string; name: string }[] | null;
      }[]
    | null;
  warehouse_location:
    | { id: string; name: string; is_main: boolean }
    | { id: string; name: string; is_main: boolean }[]
    | null;
};

export function mapBatchAgingRows(data: unknown[]): BatchAgingRow[] {
  const now = new Date();
  const rows: BatchAgingRow[] = [];

  for (const raw of data) {
    const row = raw as RawBatchLotRow;
    const batch = firstRelation(row.batch);
    const variant = firstRelation(row.variant);
    const brand = variant ? firstRelation(variant.brand) : null;
    const location = firstRelation(row.warehouse_location);
    if (!batch || !variant || !brand || !location) continue;

    rows.push({
      lotId: row.id,
      batchNumber: batch.batch_number,
      sourceType: batch.source_type,
      quantityRemaining: row.quantity_remaining,
      quantityReceived: row.quantity_received,
      receivedAt: row.received_at,
      daysInWarehouse: differenceInDays(now, new Date(row.received_at)),
      variantId: variant.id,
      variantName: variant.name,
      variantType: variant.variant_type,
      brandId: brand.id,
      brandName: brand.name,
      locationId: location.id,
      locationName: location.name,
      locationIsMain: location.is_main,
    });
  }

  return rows;
}

export function matchesAgeBucket(days: number, bucket: AgeBucket): boolean {
  if (bucket === 'all') return true;
  if (bucket === '0-30') return days <= 30;
  if (bucket === '31-60') return days >= 31 && days <= 60;
  if (bucket === '61+') return days >= 61;
  return true;
}

export function summarizeBatchAging(rows: BatchAgingRow[]) {
  const totalLots = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.quantityRemaining, 0);
  const oldUnits = rows
    .filter((r) => r.daysInWarehouse >= 61)
    .reduce((sum, r) => sum + r.quantityRemaining, 0);
  const bucket0to30 = rows.filter((r) => r.daysInWarehouse <= 30).length;
  const bucket31to60 = rows.filter((r) => r.daysInWarehouse >= 31 && r.daysInWarehouse <= 60).length;
  const bucket61plus = rows.filter((r) => r.daysInWarehouse >= 61).length;

  return { totalLots, totalUnits, oldUnits, bucket0to30, bucket31to60, bucket61plus };
}

export function daysBadgeClass(days: number): string {
  if (days <= 30) return 'bg-emerald-600 text-white';
  if (days <= 60) return 'bg-amber-500 text-amber-950';
  return 'bg-red-600 text-white';
}
