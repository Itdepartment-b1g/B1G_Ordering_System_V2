import { and, asc, eq, inArray, sql, type Column } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { hasDatabaseUrl } from '../../db/pool';
import { toNumber } from '../../db/helpers';
import * as supabaseInventory from './executiveInventoryRepository.supabase';
import { agentInventory, brands, hubs, leaderTeams, mainInventory, profiles, variants } from '../../db/schema/executive';
import { assertCompanyAssigned } from './executiveScope';
import type {
  ExecutiveTeamLeaderDto,
  ExecutiveTeamLeaderMode,
  InventoryBrandDto,
  InventoryVariantDto,
} from './executiveInventoryTypes';

export type {
  ExecutiveTeamLeaderDto,
  ExecutiveTeamLeaderMode,
  InventoryBrandDto,
  InventoryVariantDto,
} from './executiveInventoryTypes';

const LOW_STOCK_THRESHOLD = 10;

function stockStatus(stock: number, reorderLevel = LOW_STOCK_THRESHOLD): InventoryVariantDto['status'] {
  if (stock === 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

function isActive(column: Column) {
  return sql`(${column} is null or ${column} = true)`;
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
  if (!hasDatabaseUrl()) return supabaseInventory.getMainInventory(executiveId, companyId);

  await assertCompanyAssigned(executiveId, companyId);

  const rows = await getDb()
    .select({
      brandId: brands.id,
      brandName: brands.name,
      variantId: variants.id,
      variantName: variants.name,
      variantType: variants.variantType,
      mainInventoryId: mainInventory.id,
      stock: mainInventory.stock,
      allocatedStock: mainInventory.allocatedStock,
      unitPrice: mainInventory.unitPrice,
      sellingPrice: mainInventory.sellingPrice,
      dspPrice: mainInventory.dspPrice,
      rspPrice: mainInventory.rspPrice,
      reorderLevel: mainInventory.reorderLevel,
    })
    .from(brands)
    .innerJoin(variants, and(eq(variants.brandId, brands.id), eq(variants.companyId, brands.companyId)))
    .innerJoin(mainInventory, and(eq(mainInventory.variantId, variants.id), eq(mainInventory.companyId, brands.companyId)))
    .where(and(eq(brands.companyId, companyId), isActive(brands.isActive), isActive(variants.isActive)))
    .orderBy(asc(brands.name), asc(variants.createdAt));

  const brandMap = new Map<string, { id: string; name: string; variants: InventoryVariantDto[] }>();
  for (const row of rows) {
    const reorderLevel = row.reorderLevel ?? LOW_STOCK_THRESHOLD;
    const stock = row.stock ?? 0;
    const brand = brandMap.get(row.brandId) ?? { id: row.brandId, name: row.brandName, variants: [] };
    brand.variants.push({
      id: row.variantId,
      name: row.variantName,
      variantType: row.variantType,
      stock,
      allocatedStock: row.allocatedStock ?? 0,
      price: toNumber(row.unitPrice),
      sellingPrice: toNumber(row.sellingPrice),
      dspPrice: toNumber(row.dspPrice),
      rspPrice: toNumber(row.rspPrice),
      status: stockStatus(stock, reorderLevel),
      reorderLevel,
      mainInventoryId: row.mainInventoryId,
    });
    brandMap.set(row.brandId, brand);
  }

  return groupVariants(brandMap);
}

async function getTeamAgentIds(companyId: string, leaderId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ agentId: leaderTeams.agentId })
    .from(leaderTeams)
    .where(and(eq(leaderTeams.companyId, companyId), eq(leaderTeams.leaderId, leaderId)));

  return rows.map((row) => row.agentId);
}

export async function getLeaderInventory(
  executiveId: string,
  companyId: string,
  leaderId: string,
  mode: ExecutiveTeamLeaderMode = 'leader_only'
): Promise<InventoryBrandDto[]> {
  if (!hasDatabaseUrl()) return supabaseInventory.getLeaderInventory(executiveId, companyId, leaderId, mode);

  await assertCompanyAssigned(executiveId, companyId);

  const agentIds =
    mode === 'team_total'
      ? Array.from(new Set([leaderId, ...(await getTeamAgentIds(companyId, leaderId))]))
      : [leaderId];

  const rows = await getDb()
    .select({
      brandId: brands.id,
      brandName: brands.name,
      variantId: variants.id,
      variantName: variants.name,
      variantType: variants.variantType,
      stock: sql<number>`coalesce(sum(${agentInventory.stock}), 0)`,
    })
    .from(agentInventory)
    .innerJoin(variants, eq(variants.id, agentInventory.variantId))
    .innerJoin(brands, eq(brands.id, variants.brandId))
    .where(
      and(
        eq(agentInventory.companyId, companyId),
        inArray(agentInventory.agentId, agentIds),
        isActive(brands.isActive),
        isActive(variants.isActive)
      )
    )
    .groupBy(brands.id, brands.name, variants.id, variants.name, variants.variantType, variants.createdAt)
    .orderBy(asc(brands.name), asc(variants.createdAt));

  const brandMap = new Map<string, { id: string; name: string; variants: InventoryVariantDto[] }>();
  for (const row of rows) {
    const stock = toNumber(row.stock);
    const brand = brandMap.get(row.brandId) ?? { id: row.brandId, name: row.brandName, variants: [] };
    brand.variants.push({
      id: row.variantId,
      name: row.variantName,
      variantType: row.variantType,
      stock,
      allocatedStock: 0,
      price: 0,
      sellingPrice: 0,
      dspPrice: 0,
      rspPrice: 0,
      status: stockStatus(stock),
      reorderLevel: LOW_STOCK_THRESHOLD,
    });
    brandMap.set(row.brandId, brand);
  }

  return groupVariants(brandMap);
}

export async function getTeamLeaders(executiveId: string, companyId: string): Promise<ExecutiveTeamLeaderDto[]> {
  if (!hasDatabaseUrl()) return supabaseInventory.getTeamLeaders(executiveId, companyId);

  await assertCompanyAssigned(executiveId, companyId);

  const leaders = await getDb()
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
    })
    .from(profiles)
    .where(and(eq(profiles.companyId, companyId), eq(profiles.role, 'team_leader'), eq(profiles.status, 'active')))
    .orderBy(asc(profiles.fullName));

  if (leaders.length === 0) return [];

  const leaderIds = leaders.map((leader) => leader.id);
  const hubRows = await getDb()
    .select({
      hubName: hubs.hubName,
      assignedTeamLeaderId: hubs.assignedTeamLeaderId,
    })
    .from(hubs)
    .where(inArray(hubs.assignedTeamLeaderId, leaderIds));

  const hubNamesByLeader = new Map<string, string[]>();
  for (const hub of hubRows) {
    if (!hub.assignedTeamLeaderId) continue;
    const list = hubNamesByLeader.get(hub.assignedTeamLeaderId) ?? [];
    list.push(hub.hubName);
    hubNamesByLeader.set(hub.assignedTeamLeaderId, list);
  }

  return leaders.map((leader) => ({
    id: leader.id,
    full_name: leader.fullName,
    hub_names: hubNamesByLeader.get(leader.id) ?? [],
  }));
}
