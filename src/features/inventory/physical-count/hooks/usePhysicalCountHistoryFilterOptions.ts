import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type { PhysicalCountHistoryFilterOption } from '../utils/physicalCountHistoryFilters';

type FilterOptionsResult = {
  batchOptions: PhysicalCountHistoryFilterOption[];
  locationOptions: PhysicalCountHistoryFilterOption[];
  performedByOptions: PhysicalCountHistoryFilterOption[];
};

const EMPTY_OPTIONS: FilterOptionsResult = {
  batchOptions: [],
  locationOptions: [],
  performedByOptions: [],
};

export function usePhysicalCountHistoryFilterOptions({
  companyId,
  enabled,
}: {
  companyId?: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['physical-count-history-filter-options', companyId],
    enabled: enabled && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<FilterOptionsResult> => {
      const [batchesResult, locationsResult, performersResult] = await Promise.all([
        supabase
          .from('inventory_batches')
          .select('id, batch_number')
          .eq('company_id', companyId!)
          .order('batch_number'),
        supabase
          .from('warehouse_locations')
          .select('id, name, is_main')
          .eq('company_id', companyId!)
          .order('is_main', { ascending: false })
          .order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('company_id', companyId!)
          .eq('role', 'warehouse')
          .order('full_name'),
      ]);

      if (batchesResult.error) throw batchesResult.error;
      if (locationsResult.error) throw locationsResult.error;
      if (performersResult.error) throw performersResult.error;

      const batchOptions: PhysicalCountHistoryFilterOption[] = (batchesResult.data ?? []).map(
        (row) => ({
          id: row.id as string,
          name: row.batch_number as string,
        })
      );

      const locationOptions: PhysicalCountHistoryFilterOption[] = (locationsResult.data ?? []).map(
        (row) => ({
          id: row.id as string,
          name: row.is_main ? `${row.name} (main)` : (row.name as string),
        })
      );

      const performedByOptions: PhysicalCountHistoryFilterOption[] = (
        performersResult.data ?? []
      ).map((row) => ({
        id: row.id as string,
        name: (row.full_name as string) || 'Unknown',
      }));

      return { batchOptions, locationOptions, performedByOptions };
    },
  });

  return {
    ...(query.data ?? EMPTY_OPTIONS),
    isLoading: query.isLoading,
  };
}
