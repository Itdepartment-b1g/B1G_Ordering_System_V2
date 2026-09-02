import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

export const ACCOUNTING_AGENT_INVENTORY_QUERY_KEY = 'accounting-agent-inventory';

const SALES_ROLES = ['team_leader', 'mobile_sales'] as const;

export interface AccountingInventoryItem {
  id: string;
  variantName: string;
  variantType: string;
  brandId: string;
  brandName: string;
  qty: number;
  allocatedPrice: number;
  value: number;
}

export type AccountingAgentStatus = 'active' | 'inactive';

export interface AccountingAgentSummary {
  agentId: string;
  agentName: string;
  agentRole: string;
  status: AccountingAgentStatus;
  leaderId?: string;
  leaderName?: string;
  leaderRole?: string;
  totalStock: number;
  totalValue: number;
  variantCount: number;
  inventory: AccountingInventoryItem[];
}

interface NestedBrand {
  id: string;
  name: string;
}

interface NestedVariant {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
  brands: NestedBrand | NestedBrand[] | null;
}

interface AgentInventoryRow {
  id: string;
  stock: number;
  agent_id: string;
  allocated_price: number | null;
  variants: NestedVariant | NestedVariant[] | null;
}

function unwrapOne<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export interface AccountingBrandOption {
  id: string;
  name: string;
}

export async function fetchAccountingAgentInventory(
  companyId: string
): Promise<{ people: AccountingAgentSummary[]; brands: AccountingBrandOption[] }> {
  const [teamsRes, profilesRes, inventoryRes, brandsRes] = await Promise.all([
    supabase
      .from('leader_teams')
      .select('agent_id, leader_id')
      .eq('company_id', companyId),
    supabase
      .from('profiles')
      .select('id, full_name, role, status')
      .eq('company_id', companyId)
      .in('role', [...SALES_ROLES]),
    supabase
      .from('agent_inventory')
      .select(`
        id,
        stock,
        agent_id,
        allocated_price,
        variants!inner (
          id,
          name,
          variant_type,
          brand_id,
          brands!inner (
            id,
            name
          )
        )
      `)
      .eq('company_id', companyId)
      .gt('stock', 0),
    supabase
      .from('brands')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name'),
  ]);

  if (teamsRes.error) throw teamsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (inventoryRes.error) throw inventoryRes.error;
  if (brandsRes.error) throw brandsRes.error;

  const profileMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  const agentLeaderMap = new Map<string, string>();
  for (const row of teamsRes.data || []) {
    agentLeaderMap.set(row.agent_id, row.leader_id);
  }

  const inventoryByAgent = new Map<string, AccountingInventoryItem[]>();

  for (const raw of (inventoryRes.data || []) as AgentInventoryRow[]) {
    const profile = profileMap.get(raw.agent_id);
    if (!profile) continue;

    const variant = unwrapOne(raw.variants);
    const brand = unwrapOne(variant?.brands);
    if (!variant || !brand) continue;

    const qty = raw.stock || 0;
    const allocatedPrice = raw.allocated_price || 0;

    const items = inventoryByAgent.get(raw.agent_id) ?? [];
    items.push({
      id: raw.id,
      variantName: variant.name,
      variantType: variant.variant_type,
      brandId: brand.id,
      brandName: brand.name,
      qty,
      allocatedPrice,
      value: qty * allocatedPrice,
    });
    inventoryByAgent.set(raw.agent_id, items);
  }

  const summaries: AccountingAgentSummary[] = [];

  for (const profile of profileMap.values()) {
    const inventory = (inventoryByAgent.get(profile.id) ?? []).sort((a, b) => b.qty - a.qty);
    const leaderId = agentLeaderMap.get(profile.id);
    const leaderProfile = leaderId ? profileMap.get(leaderId) : undefined;

    summaries.push({
      agentId: profile.id,
      agentName: profile.full_name,
      agentRole: profile.role,
      status: profile.status === 'inactive' ? 'inactive' : 'active',
      leaderId,
      leaderName: leaderProfile?.full_name,
      leaderRole: leaderProfile?.role,
      totalStock: inventory.reduce((sum, item) => sum + item.qty, 0),
      totalValue: inventory.reduce((sum, item) => sum + item.value, 0),
      variantCount: inventory.length,
      inventory,
    });
  }

  return {
    people: summaries.sort((a, b) => {
      if (b.totalStock !== a.totalStock) return b.totalStock - a.totalStock;
      return a.agentName.localeCompare(b.agentName);
    }),
    brands: (brandsRes.data || []).map((brand) => ({ id: brand.id, name: brand.name })),
  };
}

export const UNASSIGNED_TEAM_ID = '__unassigned__';

export function getPersonTeamId(person: AccountingAgentSummary): string {
  if (person.agentRole === 'team_leader') return person.agentId;
  if (person.leaderRole === 'team_leader' && person.leaderId) return person.leaderId;
  return UNASSIGNED_TEAM_ID;
}

export function useAccountingAgentInventory() {
  const { user } = useAuth();
  const companyId = user?.company_id;

  return useQuery({
    queryKey: [ACCOUNTING_AGENT_INVENTORY_QUERY_KEY, companyId, 'all-profiles-brands'],
    queryFn: () => fetchAccountingAgentInventory(companyId!),
    enabled: !!companyId && user?.role === 'accounting',
    staleTime: 1000 * 60 * 2,
  });
}
