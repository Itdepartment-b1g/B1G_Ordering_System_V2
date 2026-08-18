import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { hasDatabaseUrl } from '../../db/pool';
import { andAll, dateRange, toIso, toNumber } from '../../db/helpers';
import * as supabaseRepo from './executiveRepository.supabase';
import {
  brands,
  clientOrderItems,
  clientOrders,
  clients,
  companies,
  executiveCompanyAssignments,
  profiles,
  variants,
} from '../../db/schema/executive';
import { resolveExecutiveCompanyIds } from './executiveScope';

export { assertCompanyAssigned, getAssignedCompanyIds, scopeCompanyIds } from './executiveScope';

const AGENT_ROLES = ['mobile_sales', 'team_leader', 'manager'];

export type ExecutiveCompanyDto = {
  id: string;
  company_name: string;
  company_email: string;
  super_admin_name: string;
  super_admin_email: string;
  role: string;
  status: string;
  company_account_type: string;
  created_at: string;
  updated_at: string;
};

export type ExecutiveAssignmentDto = {
  id: string;
  executive_id: string;
  company_id: string;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  company: ExecutiveCompanyDto | null;
};

export type ExecutiveCompaniesResult = {
  assignments: ExecutiveAssignmentDto[];
  companies: ExecutiveCompanyDto[];
  companyIds: string[];
};

export type ExecutiveStatsResult = {
  totalRevenue: number;
  pendingRevenue: number;
  projectedRevenue: number;
  totalOrders: number;
  totalAgents: number;
  totalClients: number;
  pendingOrders: number;
  approvedOrders: number;
};

export type ExecutiveDateFilter = {
  from?: string;
  to?: string;
  requestedCompanyIds?: string[];
};

export type ExecutiveCompanyBreakdownRow = {
  company: ExecutiveCompanyDto;
  revenue: number;
  ordersCount: number;
  agentsCount: number;
  clientsCount: number;
  pendingOrders: number;
  approvedOrders: number;
};

export type ExecutiveRevenueTrendRow = {
  date: string;
  revenue: number;
};

export type ExecutiveTopPerformerRow = {
  agentId: string;
  agentName: string;
  companyName: string;
  totalRevenue: number;
  ordersCount: number;
};

export type ExecutiveActivityRow = {
  id: string;
  type: 'order';
  title: string;
  description: string;
  companyName: string;
  status: string;
  amount: number;
  timestamp: string;
};

export type ExecutiveBrandMetric = {
  brandId: string;
  brandName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type ExecutiveVariantMetric = {
  variantId: string;
  variantName: string;
  brandId: string;
  brandName: string;
  totalRevenue: number;
  totalQuantity: number;
};

export type ExecutiveBrandPerformanceResult = {
  brands: ExecutiveBrandMetric[];
  flavors: ExecutiveVariantMetric[];
  batteries: ExecutiveVariantMetric[];
};

function toCompanyDto(row: {
  id: string;
  companyName: string | null;
  companyEmail: string | null;
  superAdminName: string | null;
  superAdminEmail: string | null;
  role: string | null;
  status: string | null;
  companyAccountType: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): ExecutiveCompanyDto {
  return {
    id: row.id,
    company_name: row.companyName ?? '',
    company_email: row.companyEmail ?? '',
    super_admin_name: row.superAdminName ?? '',
    super_admin_email: row.superAdminEmail ?? '',
    role: row.role ?? '',
    status: row.status ?? '',
    company_account_type: row.companyAccountType ?? '',
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
  };
}

function orderDateFilter(from?: string, to?: string) {
  return andAll(...dateRange(clientOrders.createdAt, from, to));
}

export async function listAssignedCompanies(executiveId: string): Promise<ExecutiveCompaniesResult> {
  if (!hasDatabaseUrl()) return supabaseRepo.listAssignedCompanies(executiveId);

  const rows = await getDb()
    .select({
      id: executiveCompanyAssignments.id,
      executiveId: executiveCompanyAssignments.executiveId,
      companyId: executiveCompanyAssignments.companyId,
      assignedBy: executiveCompanyAssignments.assignedBy,
      createdAt: executiveCompanyAssignments.createdAt,
      updatedAt: executiveCompanyAssignments.updatedAt,
      joinedCompanyId: companies.id,
      companyName: companies.companyName,
      companyEmail: companies.companyEmail,
      superAdminName: companies.superAdminName,
      superAdminEmail: companies.superAdminEmail,
      role: companies.role,
      status: companies.status,
      companyAccountType: companies.companyAccountType,
      companyCreatedAt: companies.createdAt,
      companyUpdatedAt: companies.updatedAt,
    })
    .from(executiveCompanyAssignments)
    .leftJoin(companies, eq(executiveCompanyAssignments.companyId, companies.id))
    .where(eq(executiveCompanyAssignments.executiveId, executiveId))
    .orderBy(asc(executiveCompanyAssignments.createdAt));

  const assignments: ExecutiveAssignmentDto[] = rows.map((row) => ({
    id: row.id,
    executive_id: row.executiveId,
    company_id: row.companyId,
    assigned_by: row.assignedBy,
    created_at: toIso(row.createdAt),
    updated_at: toIso(row.updatedAt),
    company: row.joinedCompanyId
      ? toCompanyDto({
          id: row.joinedCompanyId,
          companyName: row.companyName,
          companyEmail: row.companyEmail,
          superAdminName: row.superAdminName,
          superAdminEmail: row.superAdminEmail,
          role: row.role,
          status: row.status,
          companyAccountType: row.companyAccountType,
          createdAt: row.companyCreatedAt,
          updatedAt: row.companyUpdatedAt,
        })
      : null,
  }));

  const companyList = assignments.map((row) => row.company).filter(Boolean) as ExecutiveCompanyDto[];

  return {
    assignments,
    companies: companyList,
    companyIds: assignments.map((row) => row.company_id),
  };
}

export async function getStats(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveStatsResult> {
  if (!hasDatabaseUrl()) return supabaseRepo.getStats(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  const empty: ExecutiveStatsResult = {
    totalRevenue: 0,
    pendingRevenue: 0,
    projectedRevenue: 0,
    totalOrders: 0,
    totalAgents: 0,
    totalClients: 0,
    pendingOrders: 0,
    approvedOrders: 0,
  };
  if (companyIds.length === 0) return empty;

  const db = getDb();
  const [orderGroups, agentRows, clientRows] = await Promise.all([
    db
      .select({
        status: clientOrders.status,
        count: count(),
        revenue: sql<string>`coalesce(sum(${clientOrders.totalAmount}), 0)`,
      })
      .from(clientOrders)
      .where(and(inArray(clientOrders.companyId, companyIds), orderDateFilter(filter.from, filter.to)))
      .groupBy(clientOrders.status),
    db
      .select({ count: count() })
      .from(profiles)
      .where(and(inArray(profiles.companyId, companyIds), inArray(profiles.role, AGENT_ROLES))),
    db
      .select({ count: count() })
      .from(clients)
      .where(and(inArray(clients.companyId, companyIds), eq(clients.status, 'active'))),
  ]);

  let totalRevenue = 0;
  let pendingRevenue = 0;
  let pendingOrders = 0;
  let approvedOrders = 0;
  let totalOrders = 0;

  for (const row of orderGroups) {
    const rowCount = toNumber(row.count);
    totalOrders += rowCount;
    if (row.status === 'approved') {
      totalRevenue = toNumber(row.revenue);
      approvedOrders = rowCount;
    }
    if (row.status === 'pending') {
      pendingRevenue = toNumber(row.revenue);
      pendingOrders = rowCount;
    }
  }

  return {
    totalRevenue,
    pendingRevenue,
    projectedRevenue: totalRevenue + pendingRevenue,
    totalOrders,
    totalAgents: toNumber(agentRows[0]?.count),
    totalClients: toNumber(clientRows[0]?.count),
    pendingOrders,
    approvedOrders,
  };
}

export async function getCompanyBreakdown(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveCompanyBreakdownRow[]> {
  if (!hasDatabaseUrl()) return supabaseRepo.getCompanyBreakdown(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  const db = getDb();
  const [companyRows, orderRows, agentRows, clientRows] = await Promise.all([
    db.select().from(companies).where(inArray(companies.id, companyIds)),
    db
      .select({
        companyId: clientOrders.companyId,
        revenue: sql<string>`coalesce(sum(${clientOrders.totalAmount}) filter (where ${clientOrders.status} = 'approved'), 0)`,
        ordersCount: count(),
        pendingOrders: sql<number>`count(*) filter (where ${clientOrders.status} = 'pending')`,
        approvedOrders: sql<number>`count(*) filter (where ${clientOrders.status} = 'approved')`,
      })
      .from(clientOrders)
      .where(and(inArray(clientOrders.companyId, companyIds), orderDateFilter(filter.from, filter.to)))
      .groupBy(clientOrders.companyId),
    db
      .select({
        companyId: profiles.companyId,
        agentsCount: count(),
      })
      .from(profiles)
      .where(
        and(
          inArray(profiles.companyId, companyIds),
          inArray(profiles.role, AGENT_ROLES),
          eq(profiles.status, 'active')
        )
      )
      .groupBy(profiles.companyId),
    db
      .select({
        companyId: clients.companyId,
        clientsCount: count(),
      })
      .from(clients)
      .where(and(inArray(clients.companyId, companyIds), eq(clients.status, 'active')))
      .groupBy(clients.companyId),
  ]);

  const ordersByCompany = new Map(orderRows.map((row) => [row.companyId, row]));
  const agentsByCompany = new Map(agentRows.map((row) => [row.companyId, toNumber(row.agentsCount)]));
  const clientsByCompany = new Map(clientRows.map((row) => [row.companyId, toNumber(row.clientsCount)]));

  return companyRows
    .map((company) => {
      const orders = ordersByCompany.get(company.id);
      return {
        company: toCompanyDto(company),
        revenue: toNumber(orders?.revenue),
        ordersCount: toNumber(orders?.ordersCount),
        agentsCount: agentsByCompany.get(company.id) ?? 0,
        clientsCount: clientsByCompany.get(company.id) ?? 0,
        pendingOrders: toNumber(orders?.pendingOrders),
        approvedOrders: toNumber(orders?.approvedOrders),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getRevenueTrends(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveRevenueTrendRow[]> {
  if (!hasDatabaseUrl()) return supabaseRepo.getRevenueTrends(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  const dateExpr = sql<string>`(${clientOrders.createdAt} at time zone 'Asia/Manila')::date::text`;
  const rows = await getDb()
    .select({
      date: dateExpr,
      revenue: sql<string>`coalesce(sum(${clientOrders.totalAmount}), 0)`,
    })
    .from(clientOrders)
    .where(
      and(
        inArray(clientOrders.companyId, companyIds),
        eq(clientOrders.status, 'approved'),
        orderDateFilter(filter.from, filter.to)
      )
    )
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows.map((row) => ({
    date: row.date,
    revenue: toNumber(row.revenue),
  }));
}

export async function getTopPerformers(
  executiveId: string,
  filter: ExecutiveDateFilter & { limit?: number } = {}
): Promise<ExecutiveTopPerformerRow[]> {
  if (!hasDatabaseUrl()) return supabaseRepo.getTopPerformers(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 10;
  const rows = await getDb()
    .select({
      agentId: profiles.id,
      agentName: sql<string>`coalesce(${profiles.fullName}, 'Unknown')`,
      companyName: sql<string>`coalesce(${companies.companyName}, 'Unknown')`,
      totalRevenue: sql<string>`coalesce(sum(${clientOrders.totalAmount}), 0)`,
      ordersCount: count(),
    })
    .from(clientOrders)
    .innerJoin(profiles, eq(profiles.id, clientOrders.agentId))
    .innerJoin(companies, eq(companies.id, clientOrders.companyId))
    .where(
      and(
        inArray(clientOrders.companyId, companyIds),
        eq(clientOrders.status, 'approved'),
        orderDateFilter(filter.from, filter.to)
      )
    )
    .groupBy(profiles.id, profiles.fullName, companies.companyName)
    .orderBy(desc(sql`sum(${clientOrders.totalAmount})`))
    .limit(limit);

  return rows.map((row) => ({
    agentId: row.agentId,
    agentName: row.agentName,
    companyName: row.companyName,
    totalRevenue: toNumber(row.totalRevenue),
    ordersCount: toNumber(row.ordersCount),
  }));
}

export async function getRecentActivity(
  executiveId: string,
  filter: ExecutiveDateFilter & { limit?: number } = {}
): Promise<ExecutiveActivityRow[]> {
  if (!hasDatabaseUrl()) return supabaseRepo.getRecentActivity(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 20;
  const rows = await getDb()
    .select({
      id: clientOrders.id,
      orderNumber: clientOrders.orderNumber,
      status: clientOrders.status,
      totalAmount: clientOrders.totalAmount,
      createdAt: clientOrders.createdAt,
      agentName: profiles.fullName,
      clientName: clients.name,
      companyName: companies.companyName,
    })
    .from(clientOrders)
    .leftJoin(profiles, eq(profiles.id, clientOrders.agentId))
    .leftJoin(clients, eq(clients.id, clientOrders.clientId))
    .leftJoin(companies, eq(companies.id, clientOrders.companyId))
    .where(and(inArray(clientOrders.companyId, companyIds), orderDateFilter(filter.from, filter.to)))
    .orderBy(desc(clientOrders.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    type: 'order',
    title: `Order #${row.orderNumber}`,
    description: `${row.agentName || 'Agent'} created order for ${row.clientName || 'client'}`,
    companyName: row.companyName || 'Unknown',
    status: row.status ?? '',
    amount: toNumber(row.totalAmount),
    timestamp: toIso(row.createdAt),
  }));
}

export async function getBrandPerformance(
  executiveId: string,
  filter: ExecutiveDateFilter & { selectedBrandId?: string } = {}
): Promise<ExecutiveBrandPerformanceResult> {
  if (!hasDatabaseUrl()) return supabaseRepo.getBrandPerformance(executiveId, filter);

  const companyIds = await resolveExecutiveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) {
    return { brands: [], flavors: [], batteries: [] };
  }

  const rows = await getDb()
    .select({
      brandId: brands.id,
      brandName: brands.name,
      variantId: variants.id,
      variantName: variants.name,
      variantType: variants.variantType,
      totalQuantity: sql<number>`coalesce(sum(${clientOrderItems.quantity}), 0)`,
      totalRevenue: sql<string>`coalesce(sum(${clientOrderItems.totalPrice}), 0)`,
    })
    .from(clientOrderItems)
    .innerJoin(clientOrders, eq(clientOrders.id, clientOrderItems.clientOrderId))
    .innerJoin(variants, eq(variants.id, clientOrderItems.variantId))
    .innerJoin(brands, eq(brands.id, variants.brandId))
    .where(
      and(
        inArray(clientOrderItems.companyId, companyIds),
        eq(clientOrders.status, 'approved'),
        orderDateFilter(filter.from, filter.to)
      )
    )
    .groupBy(brands.id, brands.name, variants.id, variants.name, variants.variantType);

  const brandMap = new Map<string, ExecutiveBrandMetric>();
  const flavors: ExecutiveVariantMetric[] = [];
  const batteries: ExecutiveVariantMetric[] = [];

  for (const row of rows) {
    const revenue = toNumber(row.totalRevenue);
    const quantity = toNumber(row.totalQuantity);
    const existing = brandMap.get(row.brandId) ?? {
      brandId: row.brandId,
      brandName: row.brandName,
      totalRevenue: 0,
      totalQuantity: 0,
    };
    existing.totalRevenue += revenue;
    existing.totalQuantity += quantity;
    brandMap.set(row.brandId, existing);

    if (filter.selectedBrandId && row.brandId !== filter.selectedBrandId) continue;

    const variantMetric: ExecutiveVariantMetric = {
      variantId: row.variantId,
      variantName: row.variantName,
      brandId: row.brandId,
      brandName: row.brandName,
      totalRevenue: revenue,
      totalQuantity: quantity,
    };

    const type = (row.variantType || '').toLowerCase();
    if (type === 'flavor') flavors.push(variantMetric);
    if (type === 'battery') batteries.push(variantMetric);
  }

  const sortByQty = <T extends { totalQuantity: number }>(items: T[]) =>
    items.sort((a, b) => b.totalQuantity - a.totalQuantity);

  return {
    brands: sortByQty(Array.from(brandMap.values())),
    flavors: sortByQty(flavors),
    batteries: sortByQty(batteries),
  };
}
