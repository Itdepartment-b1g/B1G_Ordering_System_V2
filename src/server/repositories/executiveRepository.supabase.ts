import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { resolveExecutiveCompanyIds } from './executiveScope';
import type {
  ExecutiveActivityRow,
  ExecutiveAssignmentDto,
  ExecutiveBrandMetric,
  ExecutiveBrandPerformanceResult,
  ExecutiveCompaniesResult,
  ExecutiveCompanyBreakdownRow,
  ExecutiveCompanyDto,
  ExecutiveDateFilter,
  ExecutiveRevenueTrendRow,
  ExecutiveStatsResult,
  ExecutiveTopPerformerRow,
  ExecutiveVariantMetric,
} from './executiveRepository';

const AGENT_ROLES = ['mobile_sales', 'team_leader', 'manager'];

function toCompanyDto(row: any): ExecutiveCompanyDto | null {
  if (!row?.id) return null;
  return {
    id: row.id,
    company_name: row.company_name ?? '',
    company_email: row.company_email ?? '',
    super_admin_name: row.super_admin_name ?? '',
    super_admin_email: row.super_admin_email ?? '',
    role: row.role ?? '',
    status: row.status ?? '',
    company_account_type: row.company_account_type ?? '',
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

function applyDateFilter<T extends { gte: Function; lte: Function }>(query: T, from?: string, to?: string): T {
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  return query;
}

async function resolveCompanyIds(executiveId: string, requestedIds?: string[]) {
  return resolveExecutiveCompanyIds(executiveId, requestedIds);
}

export async function listAssignedCompanies(executiveId: string): Promise<ExecutiveCompaniesResult> {
  const { data, error } = await getSupabaseAdmin()
    .from('executive_company_assignments')
    .select('*, company:companies(*)')
    .eq('executive_id', executiveId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const assignments: ExecutiveAssignmentDto[] = (data ?? []).map((row: any) => ({
    id: row.id,
    executive_id: row.executive_id,
    company_id: row.company_id,
    assigned_by: row.assigned_by,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    company: toCompanyDto(row.company),
  }));

  return {
    assignments,
    companies: assignments.map((row) => row.company).filter(Boolean) as ExecutiveCompanyDto[],
    companyIds: assignments.map((row) => row.company_id),
  };
}

export async function getStats(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveStatsResult> {
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
  const companyIds = await resolveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return empty;

  const db = getSupabaseAdmin();
  let ordersQuery = db.from('client_orders').select('id, total_amount, status').in('company_id', companyIds);
  ordersQuery = applyDateFilter(ordersQuery, filter.from, filter.to);

  const [{ data: orders, error: ordersError }, { count: agentsCount, error: agentsError }, { count: clientsCount, error: clientsError }] =
    await Promise.all([
      ordersQuery,
      db
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('company_id', companyIds)
        .in('role', AGENT_ROLES),
      db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .in('company_id', companyIds)
        .eq('status', 'active'),
    ]);

  if (ordersError) throw ordersError;
  if (agentsError) throw agentsError;
  if (clientsError) throw clientsError;

  const totalRevenue =
    orders?.reduce((sum, order) => (order.status === 'approved' ? sum + (Number(order.total_amount) || 0) : sum), 0) || 0;
  const pendingRevenue =
    orders?.reduce((sum, order) => (order.status === 'pending' ? sum + (Number(order.total_amount) || 0) : sum), 0) || 0;

  return {
    totalRevenue,
    pendingRevenue,
    projectedRevenue: totalRevenue + pendingRevenue,
    totalOrders: orders?.length || 0,
    totalAgents: agentsCount || 0,
    totalClients: clientsCount || 0,
    pendingOrders: orders?.filter((order) => order.status === 'pending').length || 0,
    approvedOrders: orders?.filter((order) => order.status === 'approved').length || 0,
  };
}

export async function getCompanyBreakdown(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveCompanyBreakdownRow[]> {
  const { companies } = await listAssignedCompanies(executiveId);
  const scoped = filter.requestedCompanyIds?.length
    ? companies.filter((company) => filter.requestedCompanyIds!.includes(company.id))
    : companies;
  if (scoped.length === 0) return [];

  const companyIds = scoped.map((company) => company.id);
  const db = getSupabaseAdmin();
  let ordersQuery = db
    .from('client_orders')
    .select('id, total_amount, status, company_id')
    .in('company_id', companyIds);
  ordersQuery = applyDateFilter(ordersQuery, filter.from, filter.to);

  const [{ data: orders, error: ordersError }, { data: agents, error: agentsError }, { data: clients, error: clientsError }] =
    await Promise.all([
      ordersQuery,
      db.from('profiles').select('id, company_id').in('company_id', companyIds).in('role', AGENT_ROLES).eq('status', 'active'),
      db.from('clients').select('id, company_id').in('company_id', companyIds).eq('status', 'active'),
    ]);
  if (ordersError) throw ordersError;
  if (agentsError) throw agentsError;
  if (clientsError) throw clientsError;

  return scoped
    .map((company) => {
      const companyOrders = orders?.filter((order) => order.company_id === company.id) || [];
      return {
        company,
        revenue: companyOrders.reduce(
          (sum, order) => (order.status === 'approved' ? sum + (Number(order.total_amount) || 0) : sum),
          0
        ),
        ordersCount: companyOrders.length,
        agentsCount: agents?.filter((agent) => agent.company_id === company.id).length || 0,
        clientsCount: clients?.filter((client) => client.company_id === company.id).length || 0,
        pendingOrders: companyOrders.filter((order) => order.status === 'pending').length,
        approvedOrders: companyOrders.filter((order) => order.status === 'approved').length,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getRevenueTrends(
  executiveId: string,
  filter: ExecutiveDateFilter = {}
): Promise<ExecutiveRevenueTrendRow[]> {
  const companyIds = await resolveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  let query = getSupabaseAdmin()
    .from('client_orders')
    .select('total_amount, created_at')
    .in('company_id', companyIds)
    .eq('status', 'approved');
  query = applyDateFilter(query, filter.from, filter.to);
  const { data, error } = await query;
  if (error) throw error;

  const revenueByDate: Record<string, number> = {};
  for (const order of data ?? []) {
    const date = new Date(order.created_at).toLocaleDateString();
    revenueByDate[date] = (revenueByDate[date] || 0) + (Number(order.total_amount) || 0);
  }

  return Object.entries(revenueByDate)
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export async function getTopPerformers(
  executiveId: string,
  filter: ExecutiveDateFilter & { limit?: number } = {}
): Promise<ExecutiveTopPerformerRow[]> {
  const companyIds = await resolveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  let query = getSupabaseAdmin()
    .from('client_orders')
    .select('total_amount, agent_id, agent:profiles!client_orders_agent_id_fkey(id, full_name), company:companies(company_name)')
    .in('company_id', companyIds)
    .eq('status', 'approved');
  query = applyDateFilter(query, filter.from, filter.to);
  const { data, error } = await query;
  if (error) throw error;

  const byAgent: Record<string, ExecutiveTopPerformerRow> = {};
  for (const order of data ?? []) {
    const agent = order.agent as any;
    const company = order.company as any;
    if (!agent?.id) continue;
    if (!byAgent[agent.id]) {
      byAgent[agent.id] = {
        agentId: agent.id,
        agentName: agent.full_name || 'Unknown',
        companyName: company?.company_name || 'Unknown',
        totalRevenue: 0,
        ordersCount: 0,
      };
    }
    byAgent[agent.id].totalRevenue += Number(order.total_amount) || 0;
    byAgent[agent.id].ordersCount += 1;
  }

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 10;
  return Object.values(byAgent)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit);
}

export async function getRecentActivity(
  executiveId: string,
  filter: ExecutiveDateFilter & { limit?: number } = {}
): Promise<ExecutiveActivityRow[]> {
  const companyIds = await resolveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return [];

  const limit = filter.limit && filter.limit > 0 ? filter.limit : 20;
  let query = getSupabaseAdmin()
    .from('client_orders')
    .select(
      'id, order_number, status, total_amount, created_at, agent:profiles!client_orders_agent_id_fkey(full_name), client:clients(name), company:companies(company_name)'
    )
    .in('company_id', companyIds);
  query = applyDateFilter(query, filter.from, filter.to);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;

  return (data ?? []).map((order: any) => ({
    id: order.id,
    type: 'order' as const,
    title: `Order #${order.order_number}`,
    description: `${order.agent?.full_name || 'Agent'} created order for ${order.client?.name || 'client'}`,
    companyName: order.company?.company_name || 'Unknown',
    status: order.status ?? '',
    amount: Number(order.total_amount) || 0,
    timestamp: order.created_at,
  }));
}

export async function getBrandPerformance(
  executiveId: string,
  filter: ExecutiveDateFilter & { selectedBrandId?: string } = {}
): Promise<ExecutiveBrandPerformanceResult> {
  const companyIds = await resolveCompanyIds(executiveId, filter.requestedCompanyIds);
  if (companyIds.length === 0) return { brands: [], flavors: [], batteries: [] };

  let query = getSupabaseAdmin()
    .from('client_order_items')
    .select(
      `
      quantity,
      total_price,
      variant:variants!client_order_items_variant_id_fkey(
        id, name, variant_type, brand_id,
        brand:brands(id, name)
      ),
      order:client_orders!client_order_items_client_order_id_fkey(status, created_at)
    `
    )
    .in('company_id', companyIds);
  const { data, error } = await query;
  if (error) throw error;

  const brands: Record<string, ExecutiveBrandMetric> = {};
  const flavors: Record<string, ExecutiveVariantMetric> = {};
  const batteries: Record<string, ExecutiveVariantMetric> = {};

  for (const item of data ?? []) {
    const order = item.order as any;
    if (!order || order.status !== 'approved') continue;
    const orderDate = new Date(order.created_at);
    if (filter.from && orderDate < new Date(filter.from)) continue;
    if (filter.to && orderDate > new Date(filter.to)) continue;

    const variant = item.variant as any;
    const brand = variant?.brand as any;
    if (!variant || !brand) continue;

    const revenue = Number(item.total_price) || 0;
    const quantity = item.quantity || 0;

    if (!brands[brand.id]) {
      brands[brand.id] = { brandId: brand.id, brandName: brand.name, totalRevenue: 0, totalQuantity: 0 };
    }
    brands[brand.id].totalRevenue += revenue;
    brands[brand.id].totalQuantity += quantity;

    if (filter.selectedBrandId && brand.id !== filter.selectedBrandId) continue;

    const bucket = variant.variant_type === 'flavor' ? flavors : variant.variant_type === 'battery' ? batteries : null;
    if (!bucket) continue;
    if (!bucket[variant.id]) {
      bucket[variant.id] = {
        variantId: variant.id,
        variantName: variant.name,
        brandId: brand.id,
        brandName: brand.name,
        totalRevenue: 0,
        totalQuantity: 0,
      };
    }
    bucket[variant.id].totalRevenue += revenue;
    bucket[variant.id].totalQuantity += quantity;
  }

  const sortByQty = <T extends { totalQuantity: number }>(items: T[]) =>
    items.sort((a, b) => b.totalQuantity - a.totalQuantity);

  return {
    brands: sortByQty(Object.values(brands)),
    flavors: sortByQty(Object.values(flavors)),
    batteries: sortByQty(Object.values(batteries)),
  };
}
