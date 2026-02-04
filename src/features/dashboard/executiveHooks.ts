// ============================================================================
// EXECUTIVE DASHBOARD DATA HOOKS
// ============================================================================
// Custom React Query hooks for fetching and aggregating data across multiple
// companies assigned to an executive user
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExecutiveCompanyAssignment } from '@/types/database.types';

// ============================================================================
// EXECUTIVE COMPANY ASSIGNMENTS
// ============================================================================

/**
 * Fetch companies assigned to the current executive user
 */
export function useExecutiveCompanies() {
    return useQuery({
        queryKey: ['executive', 'companies'],
        queryFn: async () => {
            const { data: assignments, error } = await supabase
                .from('executive_company_assignments')
                .select(`
                    *,
                    company:companies(*)
                `)
                .eq('executive_id', (await supabase.auth.getUser()).data.user?.id || '');

            if (error) throw error;

            return {
                assignments: assignments as ExecutiveCompanyAssignment[],
                companies: assignments?.map(a => a.company).filter(Boolean) || [],
                companyIds: assignments?.map(a => a.company_id) || []
            };
        },
        staleTime: 30 * 1000, // 30 seconds - refetch more frequently
        refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
        refetchOnWindowFocus: true, // Refetch when user returns to tab
        retry: 2
    });
}

// ============================================================================
// AGGREGATED STATS
// ============================================================================

/**
 * Fetch and aggregate high-level metrics across all assigned companies
 */
export function useExecutiveStats(startDate?: Date, endDate?: Date, filterCompanyIds?: string[]) {
    const { data: companiesData } = useExecutiveCompanies();
    const allCompanyIds = companiesData?.companyIds || [];
    const companyIds = filterCompanyIds || allCompanyIds;

    return useQuery({
        queryKey: ['executive', 'stats', companyIds, startDate?.toISOString(), endDate?.toISOString()],
        queryFn: async () => {
            if (!companyIds || companyIds.length === 0) {
                return {
                    totalRevenue: 0,
                    totalOrders: 0,
                    totalAgents: 0,
                    totalClients: 0,
                    pendingOrders: 0,
                    approvedOrders: 0,
                };
            }

            // Build query with date filtering
            let ordersQuery = supabase
                .from('client_orders')
                .select('id, total_amount, status, company_id')
                .in('company_id', companyIds);

            // Apply date filters if provided
            if (startDate) {
                ordersQuery = ordersQuery.gte('created_at', startDate.toISOString());
            }
            if (endDate) {
                ordersQuery = ordersQuery.lte('created_at', endDate.toISOString());
            }

            // Fetch orders for all companies
            const { data: orders, error: ordersError } = await ordersQuery;

            if (ordersError) throw ordersError;

            // Fetch agents count
            const { count: agentsCount, error: agentsError } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .in('company_id', companyIds)
                .in('role', ['mobile_sales', 'team_leader', 'manager']);

            if (agentsError) throw agentsError;

            // Fetch clients count
            const { count: clientsCount, error: clientsError } = await supabase
                .from('clients')
                .select('id', { count: 'exact', head: true })
                .in('company_id', companyIds)
                .eq('status', 'active');

            if (clientsError) throw clientsError;

            // Calculate aggregated stats
            const totalRevenue = orders?.reduce((sum, order) => {
                if (order.status === 'approved') {
                    return sum + (parseFloat(order.total_amount as any) || 0);
                }
                return sum;
            }, 0) || 0;

            const pendingRevenue = orders?.reduce((sum, order) => {
                if (order.status === 'pending') {
                    return sum + (parseFloat(order.total_amount as any) || 0);
                }
                return sum;
            }, 0) || 0;

            const projectedRevenue = totalRevenue + pendingRevenue;

            const totalOrders = orders?.length || 0;
            const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;
            const approvedOrders = orders?.filter(o => o.status === 'approved').length || 0;

            return {
                totalRevenue,
                pendingRevenue,
                projectedRevenue,
                totalOrders,
                totalAgents: agentsCount || 0,
                totalClients: clientsCount || 0,
                pendingOrders,
                approvedOrders,
            };
        },
        enabled: companyIds.length > 0,
        staleTime: 15 * 1000, // 15 seconds - show new data quickly!
        refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
        refetchOnWindowFocus: true, // Refetch when user returns to tab
        retry: 2
    });
}

// ============================================================================
// PER-COMPANY BREAKDOWN
// ============================================================================

/**
 * Fetch detailed metrics for each assigned company
 */
export function useExecutiveCompanyBreakdown(startDate?: Date, endDate?: Date, filterCompanyIds?: string[]) {
    const { data: companiesData } = useExecutiveCompanies();
    const allCompanies = companiesData?.companies || [];
    const companies = filterCompanyIds
        ? allCompanies.filter(c => filterCompanyIds.includes(c.id))
        : allCompanies;

    return useQuery({
        queryKey: ['executive', 'company-breakdown', companies.map(c => c.id), startDate?.toISOString(), endDate?.toISOString()],
        queryFn: async () => {
            if (!companies || companies.length === 0) {
                return [];
            }

            const companyIds = companies.map(c => c.id);

            // Build query with date filtering
            let ordersQuery = supabase
                .from('client_orders')
                .select('id, total_amount, status, company_id, created_at')
                .in('company_id', companyIds);

            if (startDate) {
                ordersQuery = ordersQuery.gte('created_at', startDate.toISOString());
            }
            if (endDate) {
                ordersQuery = ordersQuery.lte('created_at', endDate.toISOString());
            }

            // Fetch orders for all companies
            const { data: orders } = await ordersQuery;

            // Fetch agents per company
            const { data: agents } = await supabase
                .from('profiles')
                .select('id, company_id, role')
                .in('company_id', companyIds)
                .in('role', ['mobile_sales', 'team_leader', 'manager'])
                .eq('status', 'active');

            // Fetch clients per company
            const { data: clients } = await supabase
                .from('clients')
                .select('id, company_id')
                .in('company_id', companyIds)
                .eq('status', 'active');

            // Build breakdown for each company
            const breakdown = companies.map(company => {
                const companyOrders = orders?.filter(o => o.company_id === company.id) || [];
                const companyAgents = agents?.filter(a => a.company_id === company.id) || [];
                const companyClients = clients?.filter(c => c.company_id === company.id) || [];

                const revenue = companyOrders.reduce((sum, order) => {
                    if (order.status === 'approved') {
                        return sum + (parseFloat(order.total_amount as any) || 0);
                    }
                    return sum;
                }, 0);

                return {
                    company,
                    revenue,
                    ordersCount: companyOrders.length,
                    agentsCount: companyAgents.length,
                    clientsCount: companyClients.length,
                    pendingOrders: companyOrders.filter(o => o.status === 'pending').length,
                    approvedOrders: companyOrders.filter(o => o.status === 'approved').length,
                };
            });

            // Sort by revenue descending
            return breakdown.sort((a, b) => b.revenue - a.revenue);
        },
        enabled: companies.length > 0,
        staleTime: 15 * 1000, // 15 seconds
        refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
        refetchOnWindowFocus: true,
        retry: 2
    });
}

// ============================================================================
// REVENUE TRENDS
// ============================================================================

/**
 * Fetch revenue trends over time for all assigned companies
 */
export function useExecutiveRevenueTrends(startDate?: Date, endDate?: Date, filterCompanyIds?: string[], days: number = 30) {
    const { data: companiesData } = useExecutiveCompanies();
    const allCompanyIds = companiesData?.companyIds || [];
    const companyIds = filterCompanyIds || allCompanyIds;

    return useQuery({
        queryKey: ['executive', 'revenue-trends', companyIds, startDate?.toISOString(), endDate?.toISOString(), days],
        queryFn: async () => {
            if (!companyIds || companyIds.length === 0) {
                return [];
            }

            let ordersQuery = supabase
                .from('client_orders')
                .select('id, total_amount, status, created_at, company_id')
                .in('company_id', companyIds)
                .eq('status', 'approved');

            // Only apply start date filter if provided (otherwise All Time)
            if (startDate) {
                ordersQuery = ordersQuery.gte('created_at', startDate.toISOString());
            }

            if (endDate) {
                ordersQuery = ordersQuery.lte('created_at', endDate.toISOString());
            }

            const { data: orders } = await ordersQuery;

            // Group by date
            const revenueByDate: Record<string, number> = {};

            orders?.forEach(order => {
                const date = new Date(order.created_at).toLocaleDateString();
                const amount = parseFloat(order.total_amount as any) || 0;
                revenueByDate[date] = (revenueByDate[date] || 0) + amount;
            });

            // Convert to array and sort by date
            const trends = Object.entries(revenueByDate)
                .map(([date, revenue]) => ({
                    date,
                    revenue
                }))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            return trends;
        },
        enabled: companyIds.length > 0,
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
        refetchOnWindowFocus: true,
        retry: 2
    });
}

// ============================================================================
// TOP PERFORMERS
// ============================================================================

/**
 * Fetch top performing agents across all assigned companies
 */
export function useExecutiveTopPerformers(startDate?: Date, endDate?: Date, filterCompanyIds?: string[], limit: number = 10) {
    const { data: companiesData } = useExecutiveCompanies();
    const allCompanyIds = companiesData?.companyIds || [];
    const companyIds = filterCompanyIds || allCompanyIds;

    return useQuery({
        queryKey: ['executive', 'top-performers', companyIds, startDate?.toISOString(), endDate?.toISOString(), limit],
        queryFn: async () => {
            if (!companyIds || companyIds.length === 0) {
                return [];
            }

            // Build query with date filtering
            let ordersQuery = supabase
                .from('client_orders')
                .select(`
                    id,
                    total_amount,
                    status,
                    agent_id,
                    company_id,
                    created_at,
                    agent:profiles!client_orders_agent_id_fkey(id, full_name, company_id),
                    company:companies(company_name)
                `)
                .in('company_id', companyIds)
                .eq('status', 'approved');

            if (startDate) {
                ordersQuery = ordersQuery.gte('created_at', startDate.toISOString());
            }
            if (endDate) {
                ordersQuery = ordersQuery.lte('created_at', endDate.toISOString());
            }

            // Fetch all approved orders with agent info
            const { data: orders } = await ordersQuery;

            // Group by agent
            const agentPerformance: Record<string, {
                agentId: string;
                agentName: string;
                companyName: string;
                totalRevenue: number;
                ordersCount: number;
            }> = {};

            orders?.forEach(order => {
                const agent = order.agent as any;
                const company = order.company as any;

                if (agent && agent.id) {
                    if (!agentPerformance[agent.id]) {
                        agentPerformance[agent.id] = {
                            agentId: agent.id,
                            agentName: agent.full_name || 'Unknown',
                            companyName: company?.company_name || 'Unknown',
                            totalRevenue: 0,
                            ordersCount: 0
                        };
                    }

                    agentPerformance[agent.id].totalRevenue += parseFloat(order.total_amount as any) || 0;
                    agentPerformance[agent.id].ordersCount += 1;
                }
            });

            // Convert to array and sort by revenue
            const performers = Object.values(agentPerformance)
                .sort((a, b) => b.totalRevenue - a.totalRevenue)
                .slice(0, limit);

            return performers;
        },
        enabled: companyIds.length > 0,
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 60 * 1000, // Auto-refetch every 60 seconds
        refetchOnWindowFocus: true,
        retry: 2
    });
}

// ============================================================================
// RECENT ACTIVITY
// ============================================================================

/**
 * Fetch recent activity across all assigned companies
 */
export function useExecutiveRecentActivity(startDate?: Date, endDate?: Date, filterCompanyIds?: string[], limit: number = 20) {
    const { data: companiesData } = useExecutiveCompanies();
    const allCompanyIds = companiesData?.companyIds || [];
    const companyIds = filterCompanyIds || allCompanyIds;

    return useQuery({
        queryKey: ['executive', 'recent-activity', companyIds, startDate?.toISOString(), endDate?.toISOString(), limit],
        queryFn: async () => {
            if (!companyIds || companyIds.length === 0) {
                return [];
            }

            // Build query with date filtering
            let ordersQuery = supabase
                .from('client_orders')
                .select(`
                    id,
                    order_number,
                    status,
                    total_amount,
                    created_at,
                    company_id,
                    agent:profiles!client_orders_agent_id_fkey(full_name),
                    client:clients(name),
                    company:companies(company_name)
                `)
                .in('company_id', companyIds);

            if (startDate) {
                ordersQuery = ordersQuery.gte('created_at', startDate.toISOString());
            }
            if (endDate) {
                ordersQuery = ordersQuery.lte('created_at', endDate.toISOString());
            }

            // Fetch recent orders
            const { data: orders } = await ordersQuery
                .order('created_at', { ascending: false })
                .limit(limit);

            // Format activity items
            const activity = orders?.map(order => {
                const agent = order.agent as any;
                const client = order.client as any;
                const company = order.company as any;

                return {
                    id: order.id,
                    type: 'order' as const,
                    title: `Order #${order.order_number}`,
                    description: `${agent?.full_name || 'Agent'} created order for ${client?.name || 'client'}`,
                    companyName: company?.company_name || 'Unknown',
                    status: order.status,
                    amount: parseFloat(order.total_amount as any) || 0,
                    timestamp: order.created_at
                };
            }) || [];

            return activity;
        },
        enabled: companyIds.length > 0,
        staleTime: 10 * 1000, // 10 seconds - activity needs to be fresh!
        refetchInterval: 20 * 1000, // Auto-refetch every 20 seconds
        refetchOnWindowFocus: true,
        retry: 2
    });
}
