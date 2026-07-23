import { startOfDay } from 'date-fns';

import { formatDateForInput, isDateInRange, parseDateFromInput } from '@/lib/dateRangePresets';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrderListStatusBucket = 'approved' | 'pending';
export type OrderListAmountBucket = 'approved' | 'pending' | 'rejected';

export type ClientOrderAnalyticsRow = {
  total_amount: number | string | null;
  status?: string;
  stage?: string | null;
  agent_id: string;
  order_date: string;
};

/** Field-sales roles shown in role-specific filters (sales_agent = legacy mobile_sales). */
export const SALES_ANALYTICS_ROLES = ['mobile_sales', 'team_leader', 'sales_agent'] as const;

const MOBILE_SALES_ROLES = new Set(['mobile_sales', 'sales_agent']);

export interface SalesPersonProfile {
  id: string;
  full_name: string | null;
  status: string | null;
  role?: string | null;
}

export function matchesSalesRoleFilter(
  role: string | null | undefined,
  selectedRole: 'all' | 'mobile_sales' | 'team_leader'
): boolean {
  if (selectedRole === 'all') return true;
  if (selectedRole === 'mobile_sales') {
    return MOBILE_SALES_ROLES.has(role ?? '');
  }
  return role === selectedRole;
}

export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, SalesPersonProfile>> {
  const map = new Map<string, SalesPersonProfile>();
  if (!ids.length) return map;

  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, status, role')
      .in('id', chunk);
    if (error) throw error;
    (data || []).forEach((row) => map.set(row.id, row as SalesPersonProfile));
  }
  return map;
}

/** Resolve chart/export agents from orders in range (matches Order List attribution). */
export function resolvePeopleFromOrderAgents(
  agentIds: string[],
  profilesById: Map<string, SalesPersonProfile>
): SalesPersonProfile[] {
  return agentIds.map(
    (id) =>
      profilesById.get(id) ?? {
        id,
        full_name: 'Unknown Agent',
        status: null,
        role: null,
      }
  );
}

/** Paginated client_orders fetch aligned with loadAgentKPIs + Order List date filtering. */
export async function fetchClientOrdersForDateRange(
  supabase: SupabaseClient,
  start: Date,
  end: Date,
  agentIds?: string[]
): Promise<ClientOrderAnalyticsRow[]> {
  const startStr = formatDateForInput(startOfDay(start));
  const endStr = formatDateForInput(startOfDay(end));
  const agentIdSet = agentIds?.length ? new Set(agentIds) : null;

  const all = await fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from('client_orders')
      .select('total_amount, status, stage, agent_id, order_date')
      .gte('order_date', startStr)
      .lte('order_date', endStr)
      .order('order_date', { ascending: true })
      .range(from, to);

    return { data: data as ClientOrderAnalyticsRow[] | null, error };
  });

  return all.filter((order) => {
    if (agentIdSet && (!order.agent_id || !agentIdSet.has(order.agent_id))) return false;
    return isDateInRange(order.order_date, start, end);
  });
}

/** Match Order List export / filterOrders: approved via status or final admin stage. */
export function getOrderListStatusBucket(
  status?: string,
  stage?: string | null
): OrderListStatusBucket | null {
  if (status === 'approved' || stage === 'admin_approved') return 'approved';
  if (stage === 'finance_pending' || status === 'pending') return 'pending';
  return null;
}

/** Match Order List amount summary: approved, pending, or rejected. */
export function getOrderListAmountBucket(
  status?: string,
  stage?: string | null
): OrderListAmountBucket | null {
  const statusBucket = getOrderListStatusBucket(status, stage);
  if (statusBucket) return statusBucket;
  if (status === 'rejected' || stage === 'admin_rejected') return 'rejected';
  return null;
}

/** Parse client_orders.order_date the same way Order List date filters do. */
export function parseOrderDate(orderDate: string | null | undefined): Date | null {
  if (!orderDate) return null;
  const d = orderDate.includes('T')
    ? new Date(orderDate)
    : (parseDateFromInput(orderDate) ?? new Date(orderDate));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(12, 0, 0, 0);
  return d;
}

export type ProductOrderItemRow = {
  quantity: number | null;
  unit_price: number | null;
  client_orders: {
    status?: string;
    stage?: string | null;
    order_date: string;
    agent_id: string;
    company_id?: string;
  };
  variants: {
    name?: string | null;
    brands?: { name?: string | null } | null;
  };
};

/** Paginated line items for product analytics — filters by client_orders.order_date (Order List). */
export async function fetchProductOrderItemsForDateRange(
  supabase: SupabaseClient,
  start?: Date,
  end?: Date
): Promise<ProductOrderItemRow[]> {
  const startStr = start ? formatDateForInput(startOfDay(start)) : null;
  const endStr = end ? formatDateForInput(startOfDay(end)) : null;

  const all = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('client_order_items')
      .select(`
        quantity,
        unit_price,
        client_orders!inner(status, stage, order_date, agent_id, company_id),
        variants!inner(name, variant_type, brands!inner(name))
      `)
      .order('id', { ascending: true })
      .range(from, to);

    if (startStr) {
      query = query.gte('client_orders.order_date', startStr);
    }
    if (endStr) {
      query = query.lte('client_orders.order_date', endStr);
    }

    const { data, error } = await query;
    return { data: (data ?? []) as unknown as ProductOrderItemRow[], error };
  });

  if (!start && !end) return all;

  return all.filter((item) => {
    const orderDate = item.client_orders?.order_date;
    if (!orderDate) return false;
    return isDateInRange(orderDate, start, end);
  });
}

export type CityOrderItemRow = {
  quantity: number | null;
  unit_price: number | null;
  client_orders: {
    id?: string;
    status?: string;
    stage?: string | null;
    order_date: string;
    agent_id: string;
    clients?: {
      city?: string | null;
      name?: string | null;
    } | null;
  };
  variants: {
    name?: string | null;
    variant_type?: string | null;
    brands?: { name?: string | null } | null;
  };
};

/** Paginated line items for city brand qty — filters by client_orders.order_date. */
export async function fetchCityOrderItemsForDateRange(
  supabase: SupabaseClient,
  start?: Date,
  end?: Date
): Promise<CityOrderItemRow[]> {
  const startStr = start ? formatDateForInput(startOfDay(start)) : null;
  const endStr = end ? formatDateForInput(startOfDay(end)) : null;

  const all = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('client_order_items')
      .select(`
        quantity,
        unit_price,
        client_orders!inner(
          id,
          status,
          stage,
          order_date,
          agent_id,
          clients!inner(city, name)
        ),
        variants!inner(name, variant_type, brands!inner(name))
      `)
      .order('id', { ascending: true })
      .range(from, to);

    if (startStr) {
      query = query.gte('client_orders.order_date', startStr);
    }
    if (endStr) {
      query = query.lte('client_orders.order_date', endStr);
    }

    const { data, error } = await query;
    return { data: (data ?? []) as unknown as CityOrderItemRow[], error };
  });

  if (!start && !end) return all;

  return all.filter((item) => {
    const orderDate = item.client_orders?.order_date;
    if (!orderDate) return false;
    return isDateInRange(orderDate, start, end);
  });
}
