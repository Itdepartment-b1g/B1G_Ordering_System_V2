import { supabase } from '@/lib/supabase';

export const MOBILE_SALES_RETURN_HISTORY_QUERY_KEY = 'mobile-sales-return-history';

export type ReturnStatus = 'pending' | 'approved' | 'rejected';

export type ReturnLine = {
  variantId: string;
  quantity: number;
  variantName: string;
  variantType: string | null;
  brandName: string;
};

export type MyReturn = {
  id: string;
  returnedTo: string;
  returnedAt: string;
  status: ReturnStatus;
  reason: string;
  rejectionReason: string | null;
  variantCount: number;
  totalQuantity: number;
  lines: ReturnLine[];
};

export function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

export function variantTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return '';
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  if (key === 'posm') return 'border-blue-300 bg-blue-100 text-blue-800';
  if (key === 'ncv') return 'border-slate-300 bg-slate-100 text-slate-800';
  return '';
}

export function compareLines(a: ReturnLine, b: ReturnLine): number {
  const brandCmp = a.brandName.localeCompare(b.brandName, undefined, { sensitivity: 'base' });
  if (brandCmp !== 0) return brandCmp;
  const variantCmp = a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' });
  if (variantCmp !== 0) return variantCmp;
  return (a.variantType || '').localeCompare(b.variantType || '', undefined, { sensitivity: 'base' });
}

export function groupReturnLinesByBrand(lines: ReturnLine[]) {
  const byBrand = new Map<string, ReturnLine[]>();
  for (const line of lines) {
    const brand = line.brandName.trim() || 'Unbranded';
    const list = byBrand.get(brand) ?? [];
    list.push(line);
    byBrand.set(brand, list);
  }
  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([brand, items]) => {
      const byType = new Map<string, ReturnLine[]>();
      for (const line of items) {
        const type = variantTypeLabel(line.variantType) || 'Other';
        const list = byType.get(type) ?? [];
        list.push(line);
        byType.set(type, list);
      }
      return {
        brand,
        types: [...byType.entries()]
          .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map(([type, typeItems]) => ({
            type,
            variantType: typeItems[0]?.variantType ?? null,
            items: [...typeItems].sort((a, b) =>
              a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' })
            ),
          })),
      };
    });
}

export async function fetchMyReturns(userId: string): Promise<MyReturn[]> {
  const { data, error } = await supabase
    .from('inventory_returns')
    .select(`
      id,
      return_reason,
      reason_notes,
      rejection_reason,
      created_at,
      status,
      receiver:profiles!inventory_returns_receiver_id_fkey(full_name)
    `)
    .eq('agent_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data?.length) return [];

  const { data: itemsData, error: itemsError } = await supabase
    .from('inventory_return_items')
    .select(`
      return_id,
      variant_id,
      quantity,
      variant:variants(name, variant_type, brand:brands(name))
    `)
    .in(
      'return_id',
      data.map((row) => row.id)
    );

  if (itemsError) throw itemsError;

  const linesByReturn = new Map<string, ReturnLine[]>();
  (itemsData || []).forEach((row) => {
    const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
    const brand = variant?.brand
      ? Array.isArray(variant.brand)
        ? variant.brand[0]
        : variant.brand
      : null;
    const list = linesByReturn.get(row.return_id) ?? [];
    list.push({
      variantId: row.variant_id,
      quantity: Number(row.quantity) || 0,
      variantName: variant?.name || 'Unknown',
      variantType: variant?.variant_type || null,
      brandName: brand?.name || 'Unknown',
    });
    linesByReturn.set(row.return_id, list);
  });

  return data.map((row) => {
    const receiver = Array.isArray(row.receiver) ? row.receiver[0] : row.receiver;
    const lines = (linesByReturn.get(row.id) ?? []).sort(compareLines);
    const reason = [row.return_reason, row.reason_notes]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' — ');
    const status: ReturnStatus =
      row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
    return {
      id: row.id,
      returnedTo: receiver?.full_name || 'Team Leader',
      returnedAt: row.created_at,
      status,
      reason,
      rejectionReason: row.rejection_reason,
      variantCount: lines.length,
      totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      lines,
    } satisfies MyReturn;
  });
}
