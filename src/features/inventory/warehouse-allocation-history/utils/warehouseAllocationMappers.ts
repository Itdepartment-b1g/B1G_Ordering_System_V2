import type {
  WarehouseAllocationBatchLine,
  WarehouseAllocationGroup,
  WarehouseAllocationLine,
} from '../types';

export const MULTIPLE_BRANDS_LABEL = 'Multiple brands';

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type SupabaseTransactionRow = {
  id: string;
  quantity: number;
  reference_id: string | null;
  variant?:
    | {
        id: string;
        name: string;
        variant_type?: string | null;
        brand?: { id: string; name: string } | { id: string; name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        variant_type?: string | null;
        brand?: { id: string; name: string } | { id: string; name: string }[] | null;
      }[]
    | null;
};

type SupabaseBatchMovementRow = {
  id: string;
  quantity: number;
  reference_id: string | null;
  variant_id: string;
  batch_id: string;
  batch?: { batch_number: string } | { batch_number: string }[] | null;
  lot?: { expiration_date: string | null } | { expiration_date: string | null }[] | null;
};

type SupabaseHistoryRow = {
  id: string;
  created_at: string;
  location_id: string;
  performed_by: string;
  brand_id: string | null;
  location?: { name: string } | { name: string }[] | null;
  performed_by_profile?: { full_name: string } | { full_name: string }[] | null;
  brand?: { name: string } | { name: string }[] | null;
};

function deriveGroupBrandDisplay(
  brandId: string | null,
  brandName: string | null,
  lines: WarehouseAllocationLine[]
): { brandId: string | null; brandName: string | null } {
  if (brandName?.trim()) {
    return { brandId, brandName: brandName.trim() };
  }

  const uniqueBrandNames = [
    ...new Set(
      lines
        .map((line) => line.brandName.trim())
        .filter((name) => name.length > 0 && name !== 'Unknown brand')
    ),
  ];

  if (uniqueBrandNames.length === 0) {
    return { brandId, brandName: null };
  }
  if (uniqueBrandNames.length === 1) {
    const brandIdFromLine =
      lines.find((line) => line.brandId)?.brandId ?? brandId;
    return { brandId: brandIdFromLine, brandName: uniqueBrandNames[0] };
  }
  return { brandId: null, brandName: MULTIPLE_BRANDS_LABEL };
}

function mapTransaction(row: SupabaseTransactionRow): WarehouseAllocationLine {
  const variant = unwrapRelation(row.variant);
  const brand = unwrapRelation(variant?.brand ?? null);

  return {
    id: row.id,
    variantId: variant?.id ?? '',
    variantName: variant?.name ?? 'Unknown variant',
    brandId: brand?.id ?? null,
    brandName: brand?.name ?? 'Unknown brand',
    variantType: variant?.variant_type ?? null,
    quantity: row.quantity,
    batches: [],
  };
}

function mapBatchMovement(row: SupabaseBatchMovementRow): WarehouseAllocationBatchLine {
  const batch = unwrapRelation(row.batch);
  const lot = unwrapRelation(row.lot);
  return {
    id: row.id,
    batchId: row.batch_id,
    batchNumber: batch?.batch_number ?? 'Unknown batch',
    quantity: row.quantity,
    expirationDate: lot?.expiration_date ?? null,
  };
}

export function mapWarehouseAllocationHistoryRows(
  sessions: SupabaseHistoryRow[],
  transactions: SupabaseTransactionRow[],
  batchMovements: SupabaseBatchMovementRow[]
): WarehouseAllocationGroup[] {
  const txsBySession = new Map<string, SupabaseTransactionRow[]>();
  for (const tx of transactions) {
    if (!tx.reference_id) continue;
    const list = txsBySession.get(tx.reference_id) ?? [];
    list.push(tx);
    txsBySession.set(tx.reference_id, list);
  }

  const batchesBySessionVariant = new Map<string, SupabaseBatchMovementRow[]>();
  for (const movement of batchMovements) {
    if (!movement.reference_id) continue;
    const key = `${movement.reference_id}:${movement.variant_id}`;
    const list = batchesBySessionVariant.get(key) ?? [];
    list.push(movement);
    batchesBySessionVariant.set(key, list);
  }

  return sessions.map((row) => {
    const location = unwrapRelation(row.location);
    const performer = unwrapRelation(row.performed_by_profile);
    const brand = unwrapRelation(row.brand);
    const sessionTxs = txsBySession.get(row.id) ?? [];
    const lines = sessionTxs.map((tx) => {
      const line = mapTransaction(tx);
      const variant = unwrapRelation(tx.variant);
      const variantId = variant?.id ?? '';
      const batchKey = `${row.id}:${variantId}`;
      const batchRows = batchesBySessionVariant.get(batchKey) ?? [];
      return {
        ...line,
        batches: batchRows.map(mapBatchMovement),
      };
    });
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const derivedBrand = deriveGroupBrandDisplay(row.brand_id, brand?.name ?? null, lines);

    return {
      groupId: row.id,
      createdAt: row.created_at,
      locationId: row.location_id,
      locationName: location?.name ?? 'Unknown location',
      performedById: row.performed_by,
      performedByName: performer?.full_name ?? 'Unknown',
      brandId: derivedBrand.brandId,
      brandName: derivedBrand.brandName,
      totalQuantity,
      lineCount: lines.length,
      lines,
    };
  });
}
