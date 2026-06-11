import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  groupBrands,
  LOW_STOCK_THRESHOLD,
  type Brand,
  type Variant,
} from '@/features/inventory/InventoryContext';

export type ExecutiveStockLayer = 'main' | 'team_leader';
export type ExecutiveMainStockMode = 'available' | 'overall';

export interface ExecutiveTeamLeader {
  id: string;
  full_name: string;
  hub_names: string[];
}

function calculateStatus(
  stock: number,
  reorderLevel: number = LOW_STOCK_THRESHOLD
): Variant['status'] {
  if (stock === 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

function groupBrandsFromAgentInventory(rows: any[]): Brand[] {
  const byBrand = new Map<
    string,
    {
      id: string;
      name: string;
      variants: Array<{
        id: string;
        name: string;
        variant_type: string;
        created_at: string;
        is_active: boolean;
        main_inventory: {
          stock: number;
          allocated_stock: number;
          reorder_level: number;
        };
      }>;
    }
  >();

  for (const row of rows ?? []) {
    const v = row.variants;
    if (!v || v.is_active === false) continue;
    const b = v.brands;
    if (!b || b.is_active === false) continue;

    const brandId = b.id as string;
    const existing = byBrand.get(brandId) ?? {
      id: brandId,
      name: b.name as string,
      variants: [],
    };

    existing.variants.push({
      id: v.id,
      name: v.name,
      variant_type: v.variant_type,
      created_at: v.created_at ?? new Date(0).toISOString(),
      is_active: v.is_active,
      main_inventory: {
        stock: row.stock ?? 0,
        allocated_stock: 0,
        reorder_level: LOW_STOCK_THRESHOLD,
      },
    });

    byBrand.set(brandId, existing);
  }

  const brandsData = Array.from(byBrand.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const brand of brandsData) {
    brand.variants.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  return groupBrands(brandsData);
}

async function fetchMainInventoryBrands(companyId: string): Promise<Brand[]> {
  const { data: brandsData, error } = await supabase
    .from('brands')
    .select(`
      id,
      name,
      is_active,
      variants (
        id,
        name,
        variant_type,
        created_at,
        is_active,
        main_inventory (
          id,
          stock,
          allocated_stock,
          unit_price,
          selling_price,
          dsp_price,
          rsp_price,
          reorder_level
        )
      )
    `)
    .eq('company_id', companyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');

  if (error) throw error;
  return groupBrands(brandsData || []);
}

async function fetchLeaderInventoryBrands(
  companyId: string,
  leaderId: string
): Promise<Brand[]> {
  const { data, error } = await supabase
    .from('agent_inventory')
    .select(`
      stock,
      variants!inner (
        id,
        name,
        variant_type,
        created_at,
        is_active,
        brands!inner (
          id,
          name,
          is_active
        )
      )
    `)
    .eq('company_id', companyId)
    .eq('agent_id', leaderId);

  if (error) throw error;
  return groupBrandsFromAgentInventory(data || []);
}

export function useExecutiveMainInventory(companyId: string | null) {
  return useQuery({
    queryKey: ['executive', 'main-inventory', companyId],
    enabled: !!companyId,
    queryFn: () => fetchMainInventoryBrands(companyId!),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useExecutiveLeaderInventory(
  companyId: string | null,
  leaderId: string | null
) {
  return useQuery({
    queryKey: ['executive', 'leader-inventory', companyId, leaderId],
    enabled: !!companyId && !!leaderId,
    queryFn: () => fetchLeaderInventoryBrands(companyId!, leaderId!),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useExecutiveTeamLeaders(companyId: string | null) {
  return useQuery({
    queryKey: ['executive', 'team-leaders', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ExecutiveTeamLeader[]> => {
      const { data: leaders, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('company_id', companyId!)
        .eq('role', 'team_leader')
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;

      const leaderIds = (leaders ?? []).map((l) => l.id);
      const hubNamesByLeader = new Map<string, string[]>();

      if (leaderIds.length > 0) {
        const { data: hubs } = await supabase
          .from('hubs')
          .select('hub_name, assigned_team_leader_id')
          .in('assigned_team_leader_id', leaderIds);

        for (const hub of hubs ?? []) {
          if (!hub.assigned_team_leader_id) continue;
          const list = hubNamesByLeader.get(hub.assigned_team_leader_id) ?? [];
          list.push(hub.hub_name);
          hubNamesByLeader.set(hub.assigned_team_leader_id, list);
        }
      }

      return (leaders ?? []).map((leader) => ({
        id: leader.id,
        full_name: leader.full_name,
        hub_names: hubNamesByLeader.get(leader.id) ?? [],
      }));
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function getExecutiveDisplayedStock(
  variant: Variant,
  layer: ExecutiveStockLayer,
  mainMode: ExecutiveMainStockMode
): number {
  if (layer === 'team_leader') return variant.stock;
  if (mainMode === 'overall') return variant.stock;
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
}

export function getExecutiveStockStatus(
  variant: Variant,
  layer: ExecutiveStockLayer,
  mainMode: ExecutiveMainStockMode
): Variant['status'] {
  const displayed = getExecutiveDisplayedStock(variant, layer, mainMode);
  return calculateStatus(displayed);
}
