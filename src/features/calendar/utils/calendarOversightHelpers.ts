import { supabase } from '@/lib/supabase';

export type OversightAgent = {
  id: string;
  full_name: string;
  role: string;
};

export async function getOversightAgents(companyId: string): Promise<OversightAgent[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('company_id', companyId)
    .in('role', ['mobile_sales', 'team_leader'])
    .order('full_name');

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name || 'Unknown',
    role: row.role,
  }));
}

export function getOversightAgentIds(agents: OversightAgent[]): string[] {
  return agents.map((agent) => agent.id);
}
