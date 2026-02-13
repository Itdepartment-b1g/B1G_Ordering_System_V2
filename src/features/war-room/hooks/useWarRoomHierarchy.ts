import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export interface ManagerNode {
  id: string;
  name: string;
  subTeams: SubTeamNode[];
}

export interface SubTeamNode {
  id: string; // sub_team id or leader_id
  name: string;
  leaderId: string;
  memberIds: string[]; // Agents reporting to this leader
}

export function useWarRoomHierarchy(companyIds?: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Determine which company IDs to use
  const effectiveCompanyIds = companyIds && companyIds.length > 0 
    ? companyIds 
    : (user?.company_id ? [user.company_id] : []);

  const query = useQuery({
    queryKey: ['war-room-hierarchy', effectiveCompanyIds.join(',')],
    enabled: effectiveCompanyIds.length > 0,
    queryFn: async () => {
      // 1. Fetch ALL managers (profiles with role=manager) so dropdown matches Team Management
      const { data: managersData, error: managersError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('company_id', effectiveCompanyIds)
        .eq('role', 'manager');

      if (managersError) throw managersError;

      // 2. Fetch Sub Teams (Manager -> Leader)
      const { data: subTeamsData, error: subTeamsError } = await supabase
        .from('sub_teams')
        .select(`
          id,
          name,
          manager_id,
          leader_id,
          manager:profiles!sub_teams_manager_id_fkey(full_name),
          leader:profiles!sub_teams_leader_id_fkey(full_name)
        `)
        .in('company_id', effectiveCompanyIds);
        
      if (subTeamsError) throw subTeamsError;

      // 3. Fetch Leader Teams (Leader -> Member)
      const { data: leaderTeamsData, error: leaderTeamsError } = await supabase
        .from('leader_teams')
        .select('agent_id, leader_id')
        .in('company_id', effectiveCompanyIds);

      if (leaderTeamsError) throw leaderTeamsError;

      // 4. Build hierarchy: one entry per manager (from profiles), then attach sub_teams
      const managerMap = new Map<string, ManagerNode>();

      // Seed map with ALL managers so every manager appears in the dropdown
      (managersData || []).forEach((m: any) => {
        managerMap.set(m.id, {
          id: m.id,
          name: m.full_name || 'Unknown Manager',
          subTeams: []
        });
      });

      // Attach sub_teams to their managers (and use manager name from sub_team if not already set)
      subTeamsData?.forEach((st: any) => {
        const managerId = st.manager_id;
        if (!managerMap.has(managerId)) {
          managerMap.set(managerId, {
            id: managerId,
            name: st.manager?.full_name || 'Unknown Manager',
            subTeams: []
          });
        }
        
        const members = leaderTeamsData
          ?.filter((lt: any) => lt.leader_id === st.leader_id)
          .map((lt: any) => lt.agent_id) || [];
        const teamIds = [st.leader_id, ...members];

        managerMap.get(managerId)!.subTeams.push({
          id: st.id,
          name: st.name,
          leaderId: st.leader_id,
          memberIds: teamIds
        });
      });

      return Array.from(managerMap.values());
    },
    staleTime: 0, // Always fetch fresh data on mount to ensure synchronization with Team Management changes
    refetchOnWindowFocus: true
  });

  // Real-time: refetch when leader_teams, sub_teams, or profiles (managers) change
  useEffect(() => {
    if (effectiveCompanyIds.length === 0) return;

    const refetch = () => {
      queryClient.invalidateQueries({ queryKey: ['war-room-hierarchy', effectiveCompanyIds.join(',')] });
    };

    // Subscribe to changes for all companies
    const channels: ReturnType<typeof subscribeToTable>[] = [];
    
    effectiveCompanyIds.forEach(companyId => {
      channels.push(
        subscribeToTable('leader_teams', refetch, '*', { column: 'company_id', value: companyId })
      );
      channels.push(
        subscribeToTable('sub_teams', refetch, '*', { column: 'company_id', value: companyId })
      );
      channels.push(
        subscribeToTable('profiles', refetch, '*', { column: 'company_id', value: companyId })
      );
    });

    return () => {
      channels.forEach(channel => unsubscribe(channel));
    };
  }, [effectiveCompanyIds.join(','), queryClient]);

  return query;
}
