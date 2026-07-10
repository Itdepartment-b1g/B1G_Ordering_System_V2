import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from '@/features/inventory/useWarehouseLocationMembership';

import type { WarehouseAllocationGroup } from '../types';
import { mapWarehouseAllocationHistoryRows } from '../utils/warehouseAllocationMappers';

export const WAREHOUSE_ALLOCATION_HISTORY_QUERY_KEY = 'warehouse-allocation-history';

export type WarehouseAllocationHistoryFetchUser = {
  id: string;
  company_id?: string | null;
  role?: string;
};

type FetchParams = {
  user: WarehouseAllocationHistoryFetchUser;
  locationScope: string | null;
  isMain: boolean;
};

async function fetchWarehouseAllocationHistory({
  user,
  locationScope,
  isMain,
}: FetchParams): Promise<WarehouseAllocationGroup[]> {
  if (!user.company_id) return [];

  let sessionsQuery = supabase
    .from('warehouse_allocation_history')
    .select(
      `
      id,
      created_at,
      location_id,
      performed_by,
      brand_id,
      location:warehouse_locations!warehouse_allocation_history_location_id_fkey ( name ),
      performed_by_profile:profiles!warehouse_allocation_history_performed_by_fkey ( full_name )
    `
    )
    .eq('company_id', user.company_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!isMain && locationScope) {
    sessionsQuery = sessionsQuery.eq('location_id', locationScope);
  }

  const { data: sessions, error: sessionsError } = await sessionsQuery;

  if (sessionsError) {
    console.error('[warehouse_allocation_history] sessions query failed:', sessionsError);
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
      console.error('[warehouse_allocation_history] brands query failed:', brandsError);
      throw brandsError;
    }
    for (const b of brands ?? []) {
      brandNameById.set(b.id, b.name);
    }
  }

  const sessionsWithBrands = sessions.map((row) => ({
    ...row,
    brand: row.brand_id ? { name: brandNameById.get(row.brand_id) ?? null } : null,
  }));

  const sessionIds = sessions.map((s) => s.id);

  const { data: transactions, error: txError } = await supabase
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
        brand:brands!variants_brand_id_fkey ( id, name )
      )
    `
    )
    .eq('company_id', user.company_id)
    .eq('reference_type', 'warehouse_allocation_history')
    .eq('transaction_type', 'warehouse_allocate_to_sub')
    .in('reference_id', sessionIds)
    .order('created_at', { ascending: true });

  if (txError) {
    console.error('[warehouse_allocation_history] transactions query failed:', txError);
    throw txError;
  }

  const { data: batchMovements, error: batchError } = await supabase
    .from('inventory_batch_movements')
    .select(
      `
      id,
      quantity,
      reference_id,
      variant_id,
      batch_id,
      batch:inventory_batches!inventory_batch_movements_batch_id_fkey ( batch_number ),
      lot:inventory_batch_lots!inventory_batch_movements_lot_id_fkey ( expiration_date )
    `
    )
    .eq('company_id', user.company_id)
    .eq('reference_type', 'warehouse_allocation_history')
    .eq('movement_type', 'allocate_in')
    .in('reference_id', sessionIds)
    .order('created_at', { ascending: true });

  if (batchError) {
    console.error('[warehouse_allocation_history] batch movements query failed:', batchError);
    throw batchError;
  }

  return mapWarehouseAllocationHistoryRows(
    sessionsWithBrands,
    transactions ?? [],
    batchMovements ?? []
  );
}

export function useWarehouseAllocationHistory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });

  const locationScope = membership.isMain ? null : membership.locationId;
  const queryKey = [
    WAREHOUSE_ALLOCATION_HISTORY_QUERY_KEY,
    user?.id,
    user?.company_id,
    locationScope,
  ];

  useEffect(() => {
    if (!user?.id) return;
    const cached = queryClient.getQueryCache().find({ queryKey });
    if (cached && typeof cached.options.queryFn !== 'function') {
      queryClient.removeQueries({ queryKey });
    }
  }, [user?.id, user?.company_id, locationScope, queryClient, queryKey]);

  return useQuery({
    queryKey,
    queryFn: () => {
      if (!user?.id) throw new Error('Not signed in');
      return fetchWarehouseAllocationHistory({
        user,
        locationScope,
        isMain: membership.isMain,
      });
    },
    enabled: Boolean(user?.id && user?.company_id && isWarehouse),
    staleTime: 0,
    refetchOnMount: true,
  });
}

export function refetchWarehouseAllocationHistory(
  queryClient: ReturnType<typeof useQueryClient>,
  user: WarehouseAllocationHistoryFetchUser | null | undefined,
  locationScope: string | null = null,
  isMain = true
) {
  if (!user?.id) return Promise.resolve();

  for (const query of queryClient.getQueryCache().findAll({
    queryKey: [WAREHOUSE_ALLOCATION_HISTORY_QUERY_KEY],
  })) {
    if (typeof query.options.queryFn !== 'function') {
      queryClient.removeQueries({ queryKey: query.queryKey });
    }
  }

  return queryClient.fetchQuery({
    queryKey: [WAREHOUSE_ALLOCATION_HISTORY_QUERY_KEY, user.id, user.company_id, locationScope],
    queryFn: () =>
      fetchWarehouseAllocationHistory({
        user,
        locationScope,
        isMain,
      }),
  });
}
