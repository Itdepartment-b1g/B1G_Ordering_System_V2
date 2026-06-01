import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';

export type CompanyBrandOption = {
  id: string;
  name: string;
};

async function fetchCompanyBrands(companyId: string): Promise<CompanyBrandOption[]> {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name')
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

export function useCompanyBrands() {
  const { user } = useAuth();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['company-brands', companyId],
    queryFn: () => {
      if (!companyId) throw new Error('Company not found');
      return fetchCompanyBrands(companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 5,
  });
}
