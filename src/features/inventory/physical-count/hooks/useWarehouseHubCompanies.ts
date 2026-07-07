import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type WarehouseHubCompany = {
  id: string;
  company_name: string;
};

/** Active warehouse hub companies (companies.role = 'Warehouse') for executive physical count picker. */
export function useWarehouseHubCompanies(enabled: boolean) {
  return useQuery({
    queryKey: ['physical-count-warehouse-hub-companies'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<WarehouseHubCompany[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('status', 'active')
        .eq('role', 'Warehouse')
        .order('company_name');

      if (error) throw error;
      return data ?? [];
    },
  });
}
