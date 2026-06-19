import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { mapBatchAgingRows, type BatchAgingRow } from './warehouseBatchAging';

export function useWarehouseBatchAging({
  companyId,
  locationId,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['warehouse-batch-aging', companyId, locationId],
    enabled: enabled && !!companyId && !!locationId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BatchAgingRow[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          quantity_remaining,
          quantity_received,
          received_at,
          batch:inventory_batches ( batch_number, source_type ),
          variant:variants (
            id,
            name,
            variant_type,
            brand:brands ( id, name )
          ),
          warehouse_location:warehouse_locations ( id, name, is_main )
        `
        )
        .eq('company_id', companyId!)
        .eq('warehouse_location_id', locationId!)
        .gt('quantity_remaining', 0)
        .order('received_at', { ascending: true });

      if (error) throw error;
      return mapBatchAgingRows(data ?? []);
    },
  });
}
