import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import {
  mapAllocationHistoryRows,
  type AllocationHistoryGroup,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryMappers';

export const MOBILE_SALES_ALLOCATION_HISTORY_QUERY_KEY = 'mobile-sales-allocation-history';

export async function fetchMyLeaderAllocations(
  userId: string,
  companyId?: string | null
): Promise<AllocationHistoryGroup[]> {
  const sessions = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('allocation_history')
      .select('id, created_at, allocated_to, allocated_by, brand_id, allocation_type')
      .eq('allocated_to', userId)
      .eq('allocation_type', 'leader_to_agent')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    return { data, error };
  });

  if (!sessions.length) return [];

  const brandIds = [...new Set(sessions.map((row) => row.brand_id).filter((id): id is string => Boolean(id)))];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands, error } = await supabase.from('brands').select('id, name').in('id', brandIds);
    if (error) throw error;
    brands?.forEach((brand) => brandNameById.set(brand.id, brand.name));
  }

  const profileIds = [...new Set(sessions.flatMap((row) => [row.allocated_to, row.allocated_by].filter(Boolean)))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds);
  if (profilesError) throw profilesError;

  const profileNameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || 'Unknown'])
  );
  const sessionsWithNames = sessions.map((row) => ({
    ...row,
    brand: row.brand_id ? { name: brandNameById.get(row.brand_id) ?? null } : null,
    allocated_to_profile: { full_name: profileNameById.get(row.allocated_to) ?? 'Unknown' },
    allocated_by_profile: { full_name: profileNameById.get(row.allocated_by) ?? 'Unknown' },
  }));

  const sessionIds = sessions.map((row) => row.id);
  const transactions = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('inventory_transactions')
      .select(`
        id,
        quantity,
        reference_id,
        variant:variants!inventory_transactions_variant_id_fkey (
          id,
          name,
          variant_type,
          brand:brands!variants_brand_id_fkey ( name )
        )
      `)
      .eq('reference_type', 'allocation_history')
      .eq('transaction_type', 'allocated_to_agent')
      .in('reference_id', sessionIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    return { data, error };
  });

  return mapAllocationHistoryRows(sessionsWithNames, transactions);
}
