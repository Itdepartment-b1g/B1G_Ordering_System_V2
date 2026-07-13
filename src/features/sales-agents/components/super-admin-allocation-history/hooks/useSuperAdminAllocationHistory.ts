import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';

import {
  mapAllocationHistoryRows,
  type AllocationHistoryGroup,
} from '../utils/allocationHistoryMappers';

export const SUPER_ADMIN_ALLOCATION_HISTORY_QUERY_KEY = 'super-admin-allocation-history';

export type AllocationHistoryFetchUser = {
  id: string;
  company_id?: string | null;
  role?: string;
};

type FetchUser = AllocationHistoryFetchUser;

async function fetchAllocationHistory(user: FetchUser): Promise<AllocationHistoryGroup[]> {
  let sessionsQuery = supabase
    .from('allocation_history')
    .select(
      `
      id,
      created_at,
      allocated_to,
      allocated_by,
      brand_id,
      allocation_type
    `
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (user.company_id) {
    sessionsQuery = sessionsQuery.eq('company_id', user.company_id);
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery;

  if (sessionsError) {
    console.error('[allocation_history] sessions query failed:', sessionsError);
    throw sessionsError;
  }
  if (!sessions?.length) return [];

  const brandIds = [
    ...new Set(sessions.map((s) => s.brand_id).filter((id): id is string => Boolean(id))),
  ];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands, error: brandsError } = await supabase
      .from('brands')
      .select('id, name')
      .in('id', brandIds);
    if (brandsError) {
      console.error('[allocation_history] brands query failed:', brandsError);
      throw brandsError;
    }
    for (const b of brands ?? []) {
      brandNameById.set(b.id, b.name);
    }
  }

  const profileIds = [
    ...new Set(
      sessions.flatMap((s) => [s.allocated_to, s.allocated_by].filter(Boolean))
    ),
  ];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds);

  if (profilesError) {
    console.error('[allocation_history] profiles query failed:', profilesError);
    throw profilesError;
  }

  const profileNameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name?.trim() || 'Unknown'])
  );

  const sessionsWithNames = sessions.map((row) => ({
    ...row,
    brand: row.brand_id ? { name: brandNameById.get(row.brand_id) ?? null } : null,
    allocated_to_profile: { full_name: profileNameById.get(row.allocated_to) ?? 'Unknown' },
    allocated_by_profile: { full_name: profileNameById.get(row.allocated_by) ?? 'Unknown' },
  }));

  const sessionIds = sessions.map((s) => s.id);

  // PostgREST caps at 1000 rows; page so newest sessions are not truncated.
  let transactions;
  try {
    transactions = await fetchAllPaginated(async (from, to) => {
      let transactionsQuery = supabase
        .from('inventory_transactions')
        .select(
          `
          id,
          quantity,
          reference_id,
          variant:variants!inventory_transactions_variant_id_fkey (
            id,
            name,
            variant_type,
            brand:brands!variants_brand_id_fkey ( name )
          )
        `
        )
        .eq('reference_type', 'allocation_history')
        .eq('transaction_type', 'allocated_to_agent')
        .in('reference_id', sessionIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      if (user.company_id) {
        transactionsQuery = transactionsQuery.eq('company_id', user.company_id);
      }

      const { data, error } = await transactionsQuery;
      return { data, error };
    });
  } catch (txError) {
    console.error('[allocation_history] transactions query failed:', txError);
    throw txError;
  }

  return mapAllocationHistoryRows(sessionsWithNames, transactions);
}

export function useSuperAdminAllocationHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const queryKey = [SUPER_ADMIN_ALLOCATION_HISTORY_QUERY_KEY, user.id, user.company_id];
    const cached = queryClient.getQueryCache().find({ queryKey });
    if (cached && typeof cached.options.queryFn !== 'function') {
      queryClient.removeQueries({ queryKey });
    }
  }, [user?.id, user?.company_id, queryClient]);

  return useQuery({
    queryKey: [SUPER_ADMIN_ALLOCATION_HISTORY_QUERY_KEY, user?.id, user?.company_id],
    queryFn: () => {
      if (!user?.id) throw new Error('Not signed in');
      return fetchAllocationHistory(user);
    },
    enabled: Boolean(user?.id),
    staleTime: 0,
    refetchOnMount: true,
  });
}

/**
 * Refresh allocation history after allocate/approve.
 * Uses fetchQuery (not refetchQueries) so a persisted cache entry without queryFn cannot throw.
 */
export function refetchSuperAdminAllocationHistory(
  queryClient: ReturnType<typeof useQueryClient>,
  user: AllocationHistoryFetchUser | null | undefined
) {
  if (!user?.id) return Promise.resolve();

  // Drop entries restored from localStorage (they have data but no queryFn).
  for (const query of queryClient.getQueryCache().findAll({
    queryKey: [SUPER_ADMIN_ALLOCATION_HISTORY_QUERY_KEY],
  })) {
    if (typeof query.options.queryFn !== 'function') {
      queryClient.removeQueries({ queryKey: query.queryKey });
    }
  }

  return queryClient.fetchQuery({
    queryKey: [SUPER_ADMIN_ALLOCATION_HISTORY_QUERY_KEY, user.id, user.company_id],
    queryFn: () => fetchAllocationHistory(user),
  });
}
