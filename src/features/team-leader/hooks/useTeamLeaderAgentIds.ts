import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';

/** Agents assigned to the authenticated team leader via `leader_teams`. */
export function useTeamLeaderAgentIds() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team_leader_agent_ids', user?.id, user?.company_id],
    enabled: !!user?.id && user.role === 'team_leader',
    queryFn: async (): Promise<string[]> => {
      let query = supabase.from('leader_teams').select('agent_id').eq('leader_id', user!.id);
      if (user?.company_id) {
        query = query.eq('company_id', user.company_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(row => row.agent_id).filter((id): id is string => !!id);
    },
    staleTime: 60_000,
  });
}
