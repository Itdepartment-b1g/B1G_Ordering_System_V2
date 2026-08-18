import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { assertCompanyAssigned } from './executiveScope';
import type { ExecutiveTeamLeaderDto, ExecutiveTeamLeaderMode, InventoryBrandDto, InventoryVariantDto } from './executiveInventoryRepository';

const LOW_STOCK_THRESHOLD = 10;

function stockStatus(stock: number, reorderLevel = LOW_STOCK_THRESHOLD): InventoryVariantDto['status'] {
  if (stock === 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

function groupVariants(
  brandMap: Map<string, { id: string; name: string; variants: InventoryVariantDto[] }>
): InventoryBrandDto[] {
  return Array.from(brandMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((brand) => {
      const variantsByType: Record<string, InventoryVariantDto[]> = {};
      for (const variant of brand.variants) {
        const type = variant.variantType || 'other';
        if (!variantsByType[type]) variantsByType[type] = [];
        variantsByType[type].push(variant);
      }
      return {
        id: brand.id,
        name: brand.name,
        flavors: brand.variants.filter((v) => v.variantType.toLowerCase() === 'flavor'),
        batteries: brand.variants.filter((v) => v.variantType.toLowerCase() === 'battery'),
        posms: brand.variants.filter((v) => v.variantType.toLowerCase() === 'posm'),
        variantsByType,
        allVariants: brand.variants,
      };
    })
    .filter((brand) => brand.allVariants.length > 0);
}

export async function getMainInventory(executiveId: string, companyId: string): Promise<InventoryBrandDto[]> {
  await assertCompanyAssigned(executiveId, companyId);

  const { data, error } = await getSupabaseAdmin()
    .from('brands')
    .select(
      `
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
    `
    )
    .eq('company_id', companyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');
  if (error) throw error;

  const brandMap = new Map<string, { id: string; name: string; variants: InventoryVariantDto[] }>();
  for (const brand of data ?? []) {
    if (brand.is_active === false) continue;
    const variants = ((brand.variants as any[]) || [])
      .filter((variant) => variant.is_active !== false)
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

    for (const variant of variants) {
      const inventory = Array.isArray(variant.main_inventory) ? variant.main_inventory[0] : variant.main_inventory;
      if (!inventory) continue;
      const stock = inventory.stock ?? 0;
      const reorderLevel = inventory.reorder_level ?? LOW_STOCK_THRESHOLD;
      const entry = brandMap.get(brand.id) ?? { id: brand.id, name: brand.name, variants: [] };
      entry.variants.push({
        id: variant.id,
        name: variant.name,
        variantType: variant.variant_type,
        stock,
        allocatedStock: inventory.allocated_stock || 0,
        price: Number(inventory.unit_price) || 0,
        sellingPrice: Number(inventory.selling_price) || 0,
        dspPrice: Number(inventory.dsp_price) || 0,
        rspPrice: Number(inventory.rsp_price) || 0,
        status: stockStatus(stock, reorderLevel),
        reorderLevel,
        mainInventoryId: inventory.id,
      });
      brandMap.set(brand.id, entry);
    }
  }

  return groupVariants(brandMap);
}

async function getTeamAgentIds(companyId: string, leaderId: string): Promise<string[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('leader_teams')
    .select('agent_id')
    .eq('company_id', companyId)
    .eq('leader_id', leaderId);
  if (error) throw error;
  return (data ?? []).map((row) => row.agent_id);
}

export async function getLeaderInventory(
  executiveId: string,
  companyId: string,
  leaderId: string,
  mode: ExecutiveTeamLeaderMode = 'leader_only'
): Promise<InventoryBrandDto[]> {
  await assertCompanyAssigned(executiveId, companyId);

  const agentIds =
    mode === 'team_total'
      ? Array.from(new Set([leaderId, ...(await getTeamAgentIds(companyId, leaderId))]))
      : [leaderId];

  const { data, error } = await getSupabaseAdmin()
    .from('agent_inventory')
    .select(
      `
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
    `
    )
    .eq('company_id', companyId)
    .in('agent_id', agentIds);
  if (error) throw error;

  const byVariant = new Map<string, { row: any; stock: number }>();
  for (const row of data ?? []) {
    const variantId = row.variants?.id as string | undefined;
    if (!variantId) continue;
    const existing = byVariant.get(variantId);
    if (existing) existing.stock += row.stock ?? 0;
    else byVariant.set(variantId, { row, stock: row.stock ?? 0 });
  }

  const brandMap = new Map<string, { id: string; name: string; variants: InventoryVariantDto[] }>();
  for (const { row, stock } of byVariant.values()) {
    const variant = row.variants;
    const brand = variant?.brands;
    if (!variant || variant.is_active === false || !brand || brand.is_active === false) continue;
    const entry = brandMap.get(brand.id) ?? { id: brand.id, name: brand.name, variants: [] };
    entry.variants.push({
      id: variant.id,
      name: variant.name,
      variantType: variant.variant_type,
      stock,
      allocatedStock: 0,
      price: 0,
      sellingPrice: 0,
      dspPrice: 0,
      rspPrice: 0,
      status: stockStatus(stock),
      reorderLevel: LOW_STOCK_THRESHOLD,
    });
    brandMap.set(brand.id, entry);
  }

  return groupVariants(brandMap);
}

export async function getTeamLeaders(executiveId: string, companyId: string): Promise<ExecutiveTeamLeaderDto[]> {
  await assertCompanyAssigned(executiveId, companyId);

  const { data: leaders, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('role', 'team_leader')
    .eq('status', 'active')
    .order('full_name');
  if (error) throw error;
  if (!leaders?.length) return [];

  const leaderIds = leaders.map((leader) => leader.id);
  const { data: hubs } = await getSupabaseAdmin()
    .from('hubs')
    .select('hub_name, assigned_team_leader_id')
    .in('assigned_team_leader_id', leaderIds);

  const hubNamesByLeader = new Map<string, string[]>();
  for (const hub of hubs ?? []) {
    if (!hub.assigned_team_leader_id) continue;
    const list = hubNamesByLeader.get(hub.assigned_team_leader_id) ?? [];
    list.push(hub.hub_name);
    hubNamesByLeader.set(hub.assigned_team_leader_id, list);
  }

  return leaders.map((leader) => ({
    id: leader.id,
    full_name: leader.full_name,
    hub_names: hubNamesByLeader.get(leader.id) ?? [],
  }));
}
