import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isSameMonth } from 'date-fns';
import { formatDateForInput } from '@/lib/dateRangePresets';
import { getOrderListStatusBucket } from '@/features/analytics/orderListAnalyticsHelpers';

export const KPI_SALES_ROLES = ['mobile_sales', 'team_leader'] as const;

export interface AgentKPI {
  id: string;
  name: string;
  role: string;
  orders: number;
  revenue: number;
  approvedRevenue: number;
  pendingRevenue: number;
  clients: number;
  avgOrderValue: number;
  conversionRate: number;
  performance: 'excellent' | 'good' | 'average' | 'needs_improvement';
  targetClients?: number | null;
  targetRevenue?: number | null;
  targetQty?: number | null;
  actualClients?: number;
  actualRevenue?: number;
  actualQty?: number;
  achievementClients?: number;
  achievementRevenue?: number;
  achievementQty?: number;
  targetOrders?: number | null;
  targetAchievement?: number;
}

export type AgentKpiFetchOptions = {
  dateFrom?: Date;
  dateTo?: Date;
  allTime?: boolean;
  defaultToCurrentMonth?: boolean;
};

export interface LoadAgentKPIsParams {
  teamAgentIds: string[];
  isLeader: boolean;
  isManager: boolean;
  options: AgentKpiFetchOptions;
}

const bucketKpiOrdersByStatus = (
  orders: { status?: string; stage?: string | null; total_amount?: number }[] | null
) => {
  let approvedRevenue = 0;
  let pendingRevenue = 0;
  let approvedOrders = 0;
  let pendingOrders = 0;
  (orders || []).forEach((order) => {
    const bucket = getOrderListStatusBucket(order.status, order.stage);
    if (!bucket) return;

    const amount = Number(order.total_amount) || 0;
    if (bucket === 'approved') {
      approvedRevenue += amount;
      approvedOrders += 1;
    } else {
      pendingRevenue += amount;
      pendingOrders += 1;
    }
  });
  return {
    approvedRevenue,
    pendingRevenue,
    approvedOrders,
    pendingOrders,
    totalRevenue: approvedRevenue + pendingRevenue,
    totalOrders: approvedOrders + pendingOrders,
  };
};

const isCurrentMonth = (dateFrom?: Date, dateTo?: Date): boolean => {
  if (!dateFrom || !dateTo) return false;
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  return (
    isSameMonth(dateFrom, now) &&
    isSameMonth(dateTo, now) &&
    dateFrom.getTime() === currentMonthStart.getTime() &&
    dateTo.getTime() === currentMonthEnd.getTime()
  );
};

export async function loadAgentKPIs({
  teamAgentIds,
  isLeader,
  isManager,
  options,
}: LoadAgentKPIsParams): Promise<AgentKPI[]> {
  let agentsQuery = supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', [...KPI_SALES_ROLES]);

  if (isLeader || isManager) {
    if (teamAgentIds.length === 0) {
      return [];
    }
    agentsQuery = agentsQuery.in('id', teamAgentIds);
  }

  const { data: agents, error: agentsError } = await agentsQuery;

  if (agentsError) {
    console.error('Error fetching agents:', agentsError);
    throw agentsError;
  }

  if (!agents || agents.length === 0) {
    return [];
  }

  const agentIds = agents.map((a) => a.id);
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());
  const currentMonthFirstDay = formatDateForInput(startOfMonth(new Date()));
  const allTime = options.allTime === true;

  let filterStart: Date | null = null;
  let filterEnd: Date | null = null;
  let isFilterCurrentMonth = false;

  if (allTime) {
    // No created_at bounds
  } else if (options.dateFrom) {
    filterStart = startOfDay(options.dateFrom);
    filterEnd = endOfDay(options.dateTo ?? options.dateFrom);
    isFilterCurrentMonth = isCurrentMonth(options.dateFrom, options.dateTo ?? options.dateFrom);
  } else if (options.defaultToCurrentMonth !== false) {
    filterStart = currentMonthStart;
    filterEnd = currentMonthEnd;
    isFilterCurrentMonth = true;
  }

  const targetsMap = new Map<
    string,
    {
      targetClients?: number | null;
      targetRevenue?: number | null;
      targetQty?: number | null;
      targetOrders?: number | null;
    }
  >();

  const orders =
    agentIds.length === 0
      ? []
      : await fetchAllPaginated(async (from, to) => {
          let ordersQuery = supabase
            .from('client_orders')
            .select('id, total_amount, client_id, order_date, status, stage, agent_id')
            .in('agent_id', agentIds)
            .order('order_date', { ascending: true })
            .range(from, to);

          if (!allTime && filterStart && filterEnd) {
            ordersQuery = ordersQuery
              .gte('order_date', formatDateForInput(filterStart))
              .lte('order_date', formatDateForInput(filterEnd));
          }

          const { data, error } = await ordersQuery;
          return { data, error };
        });

  let clientsQuery = supabase
    .from('clients')
    .select('id, agent_id, created_at')
    .in('agent_id', agentIds);

  let orderItemsQuery = supabase
    .from('client_order_items')
    .select('quantity, client_orders!inner(agent_id, status, created_at)')
    .in('client_orders.agent_id', agentIds)
    .eq('client_orders.status', 'approved');

  if (!allTime && filterStart && filterEnd) {
    orderItemsQuery = orderItemsQuery
      .gte('client_orders.created_at', filterStart.toISOString())
      .lte('client_orders.created_at', filterEnd.toISOString());
  }

  const targetsQuery = isFilterCurrentMonth
    ? supabase
        .from('agent_monthly_targets')
        .select('agent_id, target_clients, target_revenue, target_qty, target_orders')
        .eq('target_month', currentMonthFirstDay)
        .in('agent_id', agentIds)
    : null;

  const [clientsResult, orderItemsResult, targetsResult] = await Promise.all([
    clientsQuery,
    orderItemsQuery,
    targetsQuery ?? Promise.resolve({ data: null, error: null }),
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (orderItemsResult.error) throw orderItemsResult.error;

  if (isFilterCurrentMonth && targetsResult.error) {
    console.error('Error fetching targets (continuing without targets):', targetsResult.error);
  } else if (isFilterCurrentMonth) {
    (targetsResult.data || []).forEach((t: any) => {
      targetsMap.set(t.agent_id, {
        targetClients: t.target_clients ?? null,
        targetRevenue: t.target_revenue ? parseFloat(t.target_revenue) : null,
        targetQty: t.target_qty ?? null,
        targetOrders: t.target_orders ?? null,
      });
    });
  }

  const ordersByAgent = new Map<string, typeof orders>();
  orders.forEach((order) => {
    if (!getOrderListStatusBucket(order.status, order.stage)) return;
    const list = ordersByAgent.get(order.agent_id) || [];
    list.push(order);
    ordersByAgent.set(order.agent_id, list);
  });

  const allClientsByAgent = new Map<string, any[]>();
  const filteredClientsByAgent = new Map<string, number>();
  (clientsResult.data || []).forEach((client: any) => {
    const list = allClientsByAgent.get(client.agent_id) || [];
    list.push(client);
    allClientsByAgent.set(client.agent_id, list);

    if (!allTime && filterStart && filterEnd) {
      const createdAt = new Date(client.created_at);
      if (createdAt >= filterStart && createdAt <= filterEnd) {
        filteredClientsByAgent.set(
          client.agent_id,
          (filteredClientsByAgent.get(client.agent_id) || 0) + 1
        );
      }
    } else if (allTime || !filterStart) {
      filteredClientsByAgent.set(
        client.agent_id,
        (filteredClientsByAgent.get(client.agent_id) || 0) + 1
      );
    }
  });

  const qtyByAgent = new Map<string, number>();
  (orderItemsResult.data || []).forEach((item: any) => {
    const agentId = item.client_orders?.agent_id;
    if (!agentId) return;
    qtyByAgent.set(agentId, (qtyByAgent.get(agentId) || 0) + (item.quantity || 0));
  });

  const agentKPIsData: AgentKPI[] = agents.map((agent) => {
    const statusOrders = ordersByAgent.get(agent.id) || [];
    const { approvedRevenue, pendingRevenue, totalRevenue, totalOrders } =
      bucketKpiOrdersByStatus(statusOrders);

    const actualClients = filteredClientsByAgent.get(agent.id) || 0;
    const actualRevenue = approvedRevenue;
    const actualQty = qtyByAgent.get(agent.id) || 0;
    const uniqueClients = new Set(statusOrders.map((o: any) => o.client_id));
    const totalClients = allClientsByAgent.get(agent.id) || [];

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const conversionRate =
      totalClients.length > 0 ? (uniqueClients.size / totalClients.length) * 100 : 0;

    const agentTargets = isFilterCurrentMonth
      ? targetsMap.get(agent.id) || {
          targetClients: null,
          targetRevenue: null,
          targetQty: null,
          targetOrders: null,
        }
      : {
          targetClients: null,
          targetRevenue: null,
          targetQty: null,
          targetOrders: null,
        };

    const achievementClients =
      isFilterCurrentMonth && agentTargets.targetClients && agentTargets.targetClients > 0
        ? (actualClients / agentTargets.targetClients) * 100
        : undefined;

    const achievementRevenue =
      isFilterCurrentMonth && agentTargets.targetRevenue && agentTargets.targetRevenue > 0
        ? (actualRevenue / agentTargets.targetRevenue) * 100
        : undefined;

    const achievementQty =
      isFilterCurrentMonth && agentTargets.targetQty && agentTargets.targetQty > 0
        ? (actualQty / agentTargets.targetQty) * 100
        : undefined;

    const targetOrders = agentTargets.targetOrders;
    const targetAchievement =
      isFilterCurrentMonth && targetOrders && targetOrders > 0
        ? (totalOrders / targetOrders) * 100
        : undefined;

    let performance: 'excellent' | 'good' | 'average' | 'needs_improvement' = 'average';
    if (totalRevenue > 100000 && conversionRate > 50) performance = 'excellent';
    else if (totalRevenue > 50000 && conversionRate > 30) performance = 'good';
    else if (totalRevenue < 20000 || conversionRate < 15) performance = 'needs_improvement';

    return {
      id: agent.id,
      name: agent.full_name || 'Unknown',
      role: agent.role || 'mobile_sales',
      orders: totalOrders,
      revenue: totalRevenue,
      approvedRevenue,
      pendingRevenue,
      clients: uniqueClients.size,
      avgOrderValue,
      conversionRate,
      performance,
      targetClients: isFilterCurrentMonth ? agentTargets.targetClients : null,
      targetRevenue: isFilterCurrentMonth ? agentTargets.targetRevenue : null,
      targetQty: isFilterCurrentMonth ? agentTargets.targetQty : null,
      actualClients,
      actualRevenue,
      actualQty,
      achievementClients:
        achievementClients !== undefined ? Math.round(achievementClients) : undefined,
      achievementRevenue:
        achievementRevenue !== undefined ? Math.round(achievementRevenue) : undefined,
      achievementQty: achievementQty !== undefined ? Math.round(achievementQty) : undefined,
      targetOrders,
      targetAchievement:
        targetAchievement !== undefined ? Math.round(targetAchievement) : undefined,
    };
  });

  agentKPIsData.sort((a, b) => b.revenue - a.revenue);
  return agentKPIsData;
}
