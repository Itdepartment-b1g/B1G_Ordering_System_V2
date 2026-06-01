import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';

export type RecipientRole = 'team_leader' | 'mobile_sales';

export type CompanyRecipientOption = {
  id: string;
  name: string;
  role: RecipientRole;
};

async function fetchCompanyRecipients(companyId: string): Promise<CompanyRecipientOption[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .in('role', ['team_leader', 'mobile_sales'])
    .order('full_name');

  if (error) throw error;

  return (data ?? [])
    .filter((row): row is typeof row & { role: RecipientRole } =>
      row.role === 'team_leader' || row.role === 'mobile_sales'
    )
    .map((row) => ({
      id: row.id,
      name: row.full_name?.trim() || 'Unknown',
      role: row.role,
    }));
}

export function useCompanyTeamLeaders() {
  const { user } = useAuth();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['company-allocation-recipients', companyId],
    queryFn: () => {
      if (!companyId) throw new Error('Company not found');
      return fetchCompanyRecipients(companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 5,
  });
}
