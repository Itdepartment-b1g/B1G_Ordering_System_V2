import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type { PhysicalCountHistoryFilterOption } from '../utils/physicalCountHistoryFilters';
import { getPhysicalCountPerformerId, getPhysicalCountPerformerName } from '../utils/physicalCountPerformer';

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
      const [batchesResult, locationsResult, sessionsResult] = await Promise.all([
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
          .from('physical_count_sessions')
          .select('performed_by, performed_by_name')
          .eq('company_id', companyId!)
          .not('performed_by', 'is', null),
      ]);

      if (batchesResult.error) throw batchesResult.error;
      if (locationsResult.error) throw locationsResult.error;
      if (sessionsResult.error) throw sessionsResult.error;

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

      const performerMap = new Map<string, string>();
      for (const session of sessionsResult.data ?? []) {
        const row = session as {
          performed_by: string | null;
          performed_by_name: string | null;
        };
        const performerId = getPhysicalCountPerformerId({
          performed_by: row.performed_by,
          performed_by_user: row.performed_by ? { id: row.performed_by, full_name: '' } : null,
        });
        if (!performerId) continue;
        const label = getPhysicalCountPerformerName({
          performed_by_name: row.performed_by_name,
          performed_by_user: null,
        });
        performerMap.set(performerId, label === '—' ? 'Unknown' : label);
      }

      const performedByOptions: PhysicalCountHistoryFilterOption[] = [...performerMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { batchOptions, locationOptions, performedByOptions };
    },
  });

  return {
    ...(query.data ?? EMPTY_OPTIONS),
    isLoading: query.isLoading,
  };
}
