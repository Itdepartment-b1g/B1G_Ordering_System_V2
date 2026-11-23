import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';

export const VARIANT_STOCK_HOLDERS_QUERY_KEY = 'variant-stock-holders';

const FIELD_ROLES = ['team_leader', 'mobile_sales'] as const;

export interface VariantStockHolder {
  holderId: string;
  holderName: string;
  role: string;
  status: 'active' | 'inactive';
  leaderName?: string;
  qty: number;
}

export interface VariantStockHoldersResult {
  holders: VariantStockHolder[];
  totalHeld: number;
}

export async function fetchVariantStockHolders(
  companyId: string,
  variantId: string
): Promise<VariantStockHoldersResult> {
  const [inventoryRes, teamsRes] = await Promise.all([
    fetchAllPaginated(async (from, to) =>
      supabase
        .from('agent_inventory')
        .select('id, stock, agent_id')
        .eq('company_id', companyId)
        .eq('variant_id', variantId)
        .gt('stock', 0)
        .order('id')
        .range(from, to)
    ),
    fetchAllPaginated(async (from, to) =>
      supabase
        .from('leader_teams')
        .select('agent_id, leader_id')
        .eq('company_id', companyId)
        .order('agent_id')
        .order('leader_id')
        .range(from, to)
    ),
  ]);

  if (inventoryRes.length === 0) {
    return { holders: [], totalHeld: 0 };
  }

  const agentIds = [...new Set(inventoryRes.map((row) => row.agent_id))];
  const leaderIdsFromTeams = teamsRes
    .filter((row) => agentIds.includes(row.agent_id))
    .map((row) => row.leader_id);
  const profileIds = [...new Set([...agentIds, ...leaderIdsFromTeams])];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('company_id', companyId)
    .in('id', profileIds)
    .in('role', [...FIELD_ROLES]);

  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const agentLeaderMap = new Map<string, string>();
  for (const row of teamsRes) {
    if (!agentLeaderMap.has(row.agent_id)) {
      agentLeaderMap.set(row.agent_id, row.leader_id);
    }
  }

  const holders: VariantStockHolder[] = [];

  for (const row of inventoryRes) {
    const profile = profileMap.get(row.agent_id);
    if (!profile) continue;

    const leaderId = agentLeaderMap.get(row.agent_id);
    const leaderProfile = leaderId ? profileMap.get(leaderId) : undefined;

    holders.push({
      holderId: profile.id,
      holderName: profile.full_name || 'Unknown',
      role: profile.role,
      status: profile.status === 'inactive' ? 'inactive' : 'active',
      leaderName: leaderProfile?.full_name,
      qty: row.stock || 0,
    });
  }

  holders.sort((a, b) => {
    if (b.qty !== a.qty) return b.qty - a.qty;
    return a.holderName.localeCompare(b.holderName);
  });

  return {
    holders,
    totalHeld: holders.reduce((sum, h) => sum + h.qty, 0),
  };
}

export function useVariantStockHolders(
  companyId: string | undefined,
  variantId: string | null | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: [VARIANT_STOCK_HOLDERS_QUERY_KEY, companyId, variantId],
    queryFn: () => fetchVariantStockHolders(companyId!, variantId!),
    enabled: enabled && !!companyId && !!variantId,
    staleTime: 1000 * 60,
  });
}
