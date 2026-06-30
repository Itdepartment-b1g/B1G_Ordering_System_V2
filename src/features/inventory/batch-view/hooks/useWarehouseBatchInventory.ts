import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import { mapBatchInventoryGroups } from '../utils/batchInventoryMappers';
import type { BatchInventoryGroup } from '../types';

export function useWarehouseBatchInventory({
  companyId,
  locationId,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  enabled: boolean;
}) {
  const scopeAll = locationId === 'all';

  return useQuery({
    queryKey: ['warehouse-batch-inventory', companyId, locationId],
    enabled: enabled && !!companyId && !!locationId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BatchInventoryGroup[]> => {
      let query = supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          quantity_remaining,
          batch:inventory_batches (
            id,
            batch_number,
            source_type,
            received_at,
            total_amount
          ),
          variant:variants (
            id,
            name,
            variant_type,
            brand:brands ( id, name )
          ),
          warehouse_location:warehouse_locations ( id, name )
        `
        )
        .eq('company_id', companyId!)
        .gt('quantity_remaining', 0);

      if (!scopeAll) {
        query = query.eq('warehouse_location_id', locationId!);
      }

      const { data, error } = await query;
      if (error) throw error;
      return mapBatchInventoryGroups(data ?? []);
    },
  });
}
