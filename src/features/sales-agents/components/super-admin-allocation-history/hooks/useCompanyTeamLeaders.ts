import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';

export type RecipientRole = 'team_leader' | 'mobile_sales';

export type CompanyRecipientOption = {
  id: string;
  name: string;
  role: RecipientRole;
  status: 'active' | 'inactive';
  /** Present for mobile_sales assigned via leader_teams. */
  teamLeaderId: string | null;
  teamLeaderName: string | null;
};

async function fetchCompanyRecipients(companyId: string): Promise<CompanyRecipientOption[]> {
  const [profilesRes, teamsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, role, status')
      .eq('company_id', companyId)
      .in('role', ['team_leader', 'mobile_sales'])
      .order('full_name'),
    supabase
      .from('leader_teams')
      .select('agent_id, leader_id')
      .eq('company_id', companyId),
  ]);

  if (profilesRes.error) throw profilesRes.error;
  if (teamsRes.error) throw teamsRes.error;

  const profiles = (profilesRes.data ?? []).filter(
    (row): row is typeof row & { role: RecipientRole } =>
      row.role === 'team_leader' || row.role === 'mobile_sales'
  );

  const nameById = new Map(
    profiles.map((p) => [p.id, p.full_name?.trim() || 'Unknown'] as const)
  );
  const leaderIdByAgent = new Map<string, string>();
  for (const row of teamsRes.data ?? []) {
    if (row.agent_id && row.leader_id) {
      leaderIdByAgent.set(row.agent_id, row.leader_id);
    }
  }

  return profiles.map((row) => {
    const teamLeaderId =
      row.role === 'mobile_sales' ? leaderIdByAgent.get(row.id) ?? null : null;
    return {
      id: row.id,
      name: row.full_name?.trim() || 'Unknown',
      role: row.role,
      status: row.status === 'inactive' ? 'inactive' : 'active',
      teamLeaderId,
      teamLeaderName: teamLeaderId ? nameById.get(teamLeaderId) ?? 'Unknown' : null,
    };
  });
}

export function useCompanyTeamLeaders() {
  const { user } = useAuth();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: ['company-allocation-recipients', companyId, 'with-status-v2'],
    queryFn: () => {
      if (!companyId) throw new Error('Company not found');
      return fetchCompanyRecipients(companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 1000 * 60 * 5,
  });
}
