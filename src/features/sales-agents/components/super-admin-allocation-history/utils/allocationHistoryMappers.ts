export const MULTIPLE_BRANDS_LABEL = 'Multiple brands';

export type AllocationHistoryLine = {
  id: string;
  variantId: string;
  variantName: string;
  brandName: string;
  variantType: string | null;
  quantity: number;
};

export type AllocationHistoryGroup = {
  groupId: string;
  createdAt: string;
  allocatedToId: string;
  allocatedToName: string;
  allocatedById: string;
  allocatedByName: string;
  brandId: string | null;
  brandName: string | null;
  allocationType: 'main_to_leader' | 'leader_to_agent';
  totalQuantity: number;
  lineCount: number;
  lines: AllocationHistoryLine[];
};

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
        brand?: { name: string } | { name: string }[] | null;
      }
    | {
        id: string;
        name: string;
        variant_type?: string | null;
        brand?: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

type SupabaseHistoryRow = {
  id: string;
  created_at: string;
  allocated_to: string;
  allocated_by: string;
  brand_id: string | null;
  allocation_type: 'main_to_leader' | 'leader_to_agent';
  allocated_to_profile?: { full_name: string } | { full_name: string }[] | null;
  allocated_by_profile?: { full_name: string } | { full_name: string }[] | null;
  brand?: { name: string } | { name: string }[] | null;
};

/** Header brand_id is null for multi-brand batches; derive a row label from line brands. */
function deriveGroupBrandDisplay(
  brandId: string | null,
  brandName: string | null,
  lines: AllocationHistoryLine[]
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
    return { brandId, brandName: uniqueBrandNames[0] };
  }
  return { brandId: null, brandName: MULTIPLE_BRANDS_LABEL };
}

function mapTransaction(row: SupabaseTransactionRow): AllocationHistoryLine {
  const variant = unwrapRelation(row.variant);
  const brand = unwrapRelation(variant?.brand ?? null);

  return {
    id: row.id,
    variantId: variant?.id ?? '',
    variantName: variant?.name ?? 'Unknown variant',
    brandName: brand?.name ?? 'Unknown brand',
    variantType: variant?.variant_type ?? null,
    quantity: row.quantity,
  };
}

export function mapAllocationHistoryRows(
  sessions: SupabaseHistoryRow[],
  transactions: SupabaseTransactionRow[]
): AllocationHistoryGroup[] {
  const txsBySession = new Map<string, SupabaseTransactionRow[]>();
  for (const tx of transactions) {
    if (!tx.reference_id) continue;
    const list = txsBySession.get(tx.reference_id) ?? [];
    list.push(tx);
    txsBySession.set(tx.reference_id, list);
  }

  return sessions.map((row) => {
    const allocatedTo = unwrapRelation(row.allocated_to_profile);
    const allocatedBy = unwrapRelation(row.allocated_by_profile);
    const brand = unwrapRelation(row.brand);
    const sessionTxs = txsBySession.get(row.id) ?? [];
    const lines = sessionTxs.map(mapTransaction);
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const derivedBrand = deriveGroupBrandDisplay(
      row.brand_id,
      brand?.name ?? null,
      lines
    );

    return {
      groupId: row.id,
      createdAt: row.created_at,
      allocatedToId: row.allocated_to,
      allocatedToName: allocatedTo?.full_name ?? 'Unknown',
      allocatedById: row.allocated_by,
      allocatedByName: allocatedBy?.full_name ?? 'Unknown',
      brandId: derivedBrand.brandId,
      brandName: derivedBrand.brandName,
      allocationType: row.allocation_type,
      totalQuantity,
      lineCount: lines.length,
      lines,
    };
  });
}
