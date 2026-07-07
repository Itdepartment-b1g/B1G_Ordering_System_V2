import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type WarehouseLocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

export function useWarehouseLocations(companyId?: string, enabled = true) {
  const query = useQuery({
    queryKey: ['warehouse-locations', companyId],
    enabled: enabled && !!companyId,
    queryFn: async (): Promise<WarehouseLocationOption[]> => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, name, is_main')
        .eq('company_id', companyId!)
        .order('is_main', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data ?? []) as WarehouseLocationOption[];
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
  };
}
