import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useEffect } from 'react';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export function useAdminStats() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['admin_stats'],
        queryFn: async () => {
            // Get total revenue from admin-approved client orders
            const { data: approvedOrdersForRevenue } = await supabase
                .from('client_orders')
                .select('total_amount')
                .eq('stage', 'admin_approved');

            const revenue = (approvedOrdersForRevenue || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            // Get orders stats
            const { data: orders } = await supabase
                .from('client_orders')
                .select('id, status');

            const totalOrders = orders?.length || 0;
            const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;

            // Get agents stats
            const { data: agents } = await supabase
                .from('profiles')
                .select('id, status')
                .eq('role', 'sales_agent');

            const totalAgents = agents?.length || 0;
            const activeAgents = agents?.filter(a => a.status === 'active').length || 0;

            // Get products stats
            const { data: variants } = await supabase
                .from('variants')
                .select(`
          id,
          main_inventory (
            stock,
            reorder_level
          )
        `);

            const totalProducts = variants?.length || 0;
            const lowStockProducts = variants?.filter(v => {
                const stock = v.main_inventory?.[0]?.stock || 0;
                const reorderLevel = v.main_inventory?.[0]?.reorder_level || 50;
                return stock < reorderLevel;
            }).length || 0;

            // Get monthly revenue for chart
            const sixMonthsAgoIso = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString();
            const { data: monthlyApproved } = await supabase
                .from('client_orders')
                .select('total_amount, order_date')
                .eq('stage', 'admin_approved')
                .gte('order_date', sixMonthsAgoIso);

            const revenueByMonth = (monthlyApproved || []).reduce((acc: any, o: any) => {
                const month = new Date(o.order_date).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + (o.total_amount || 0);
                return acc;
            }, {} as Record<string, number>);

            const revenueData = Object.entries(revenueByMonth).map(([month, revenue]) => ({ month, revenue }));

            return {
                totalRevenue: revenue,
                totalOrders,
                pendingOrders,
                totalAgents,
                activeAgents,
                totalProducts,
                lowStockProducts,
                revenueData
            };
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    useEffect(() => {
        const channel1 = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['admin_stats'] }));
        const channel2 = subscribeToTable('profiles', () => queryClient.invalidateQueries({ queryKey: ['admin_stats'] }));
        const channel3 = subscribeToTable('main_inventory', () => queryClient.invalidateQueries({ queryKey: ['admin_stats'] }));

        return () => {
            unsubscribe(channel1);
            unsubscribe(channel2);
            unsubscribe(channel3);
        };
    }, [queryClient]);

    return query;
}

export function useLeaderStats() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['leader_stats', user?.id],
        enabled: !!user?.id && user?.role === 'team_leader',
        queryFn: async () => {
            if (!user?.id) return null;

            // Get team member IDs
            const { data: teamData, error: teamError } = await supabase
                .from('leader_teams')
                .select('agent_id')
                .eq('leader_id', user.id);

            if (teamError) throw teamError;

            const teamMemberIds = (teamData || []).map(t => t.agent_id);

            if (teamMemberIds.length === 0) {
                return {
                    teamMembers: 0,
                    teamOrders: 0,
                    teamClients: 0,
                    pendingRequests: 0,
                    teamRevenue: 0,
                    todayOrders: 0,
                    todayRevenue: 0,
                    weekOrders: 0,
                    weekRevenue: 0,
                    pendingLeaderOrders: 0,
                    approvedOrdersCount: 0,
                    pendingStockRequests: [],
                    pendingOrderApprovals: []
                };
            }

            // Get team orders
            const { data: orders } = await supabase
                .from('client_orders')
                .select('id, total_amount, status, created_at, stage, order_number, agent_id, profiles!client_orders_agent_id_fkey(full_name)')
                .in('agent_id', teamMemberIds);

            const teamRevenue = (orders || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayOrdersData = (orders || []).filter((o: any) => new Date(o.created_at) >= today);
            const todayOrders = todayOrdersData.length;
            const todayRevenue = todayOrdersData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);
            const weekOrdersData = (orders || []).filter((o: any) => new Date(o.created_at) >= weekAgo);
            const weekOrders = weekOrdersData.length;
            const weekRevenue = weekOrdersData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const pendingLeaderOrders = (orders || []).filter((o: any) =>
                o.status === 'pending' && o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
            ).length;

            const approvedOrdersCount = (orders || []).filter((o: any) =>
                o.status === 'approved' || o.stage === 'leader_approved' || o.stage === 'admin_approved'
            ).length;

            // Get team clients
            const { data: clients } = await supabase
                .from('clients')
                .select('id')
                .in('agent_id', teamMemberIds);

            const teamClientsCount = clients?.length || 0;

            // Get pending stock requests
            const { data: requests } = await supabase
                .from('stock_requests')
                .select(`
          id,
          request_number,
          requested_quantity,
          requested_at,
          agent_id,
          variant_id,
          profiles!stock_requests_agent_id_fkey(full_name),
          variants(name, variant_type, brands(name))
        `)
                .in('agent_id', teamMemberIds)
                .eq('status', 'pending')
                .order('requested_at', { ascending: false });

            const pendingStockRequests = requests || [];

            // Get pending order approvals
            const pendingOrderApprovals = (orders || []).filter((o: any) =>
                o.status === 'pending' && o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
            ).slice(0, 5);

            return {
                teamMembers: teamMemberIds.length,
                teamOrders: orders?.length || 0,
                teamClients: teamClientsCount,
                pendingRequests: pendingStockRequests.length,
                teamRevenue,
                todayOrders,
                todayRevenue,
                weekOrders,
                weekRevenue,
                pendingLeaderOrders,
                approvedOrdersCount,
                pendingStockRequests,
                pendingOrderApprovals
            };
        },
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (!user?.id || user.role !== 'team_leader') return;

        const channel1 = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));
        const channel2 = subscribeToTable('stock_requests', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));
        const channel3 = subscribeToTable('leader_teams', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));

        return () => {
            unsubscribe(channel1);
            unsubscribe(channel2);
            unsubscribe(channel3);
        };
    }, [user?.id, user?.role, queryClient]);

    return query;
}

export function useAgentStats() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['agent_stats', user?.id],
        enabled: !!user?.id && user?.role === 'sales_agent',
        queryFn: async () => {
            if (!user?.id) return null;

            const [{ data: orders }, { data: clients }] = await Promise.all([
                supabase.from('client_orders').select('id').eq('agent_id', user.id),
                supabase.from('clients').select('id').eq('agent_id', user.id)
            ]);

            return {
                myOrders: orders?.length || 0,
                myClients: clients?.length || 0,
                myCommission: 0 // Logic not implemented yet as per current code
            };
        },
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (!user?.id || user.role !== 'sales_agent') return;

        const channel1 = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['agent_stats', user.id] }));
        const channel2 = subscribeToTable('clients', () => queryClient.invalidateQueries({ queryKey: ['agent_stats', user.id] }));

        return () => {
            unsubscribe(channel1);
            unsubscribe(channel2);
        };
    }, [user?.id, user?.role, queryClient]);

    return query;
}

export function useTopPerformers() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['top_performers'],
        queryFn: async () => {
            const { data: approvedOrders, error: ordersError } = await supabase
                .from('client_orders')
                .select('id, agent_id, total_amount')
                .eq('stage', 'admin_approved');

            if (ordersError) throw ordersError;
            if (!approvedOrders || approvedOrders.length === 0) return { topAgents: [], topFlavors: [] };

            const approvedOrderIds = approvedOrders.map(order => order.id);
            const agentIds = [...new Set(approvedOrders.map(order => order.agent_id).filter(Boolean))];

            let topAgents: any[] = [];
            if (agentIds.length > 0) {
                const { data: agentProfiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', agentIds);

                const agentNameMap = (agentProfiles || []).reduce((acc: any, profile: any) => {
                    acc[profile.id] = profile.full_name || 'Unknown';
                    return acc;
                }, {});

                const agentStats = approvedOrders.reduce((acc: any, order: any) => {
                    const agentId = order.agent_id;
                    if (!agentId) return acc;
                    if (!acc[agentId]) acc[agentId] = { name: agentNameMap[agentId] || 'Unknown', orders: 0, revenue: 0 };
                    acc[agentId].orders += 1;
                    acc[agentId].revenue += order.total_amount || 0;
                    return acc;
                }, {});

                topAgents = Object.values(agentStats).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 10);
            }

            let topFlavors: any[] = [];
            const { data: orderItems } = await supabase
                .from('client_order_items')
                .select('quantity, variant_id')
                .in('client_order_id', approvedOrderIds);

            if (orderItems && orderItems.length > 0) {
                const variantIds = [...new Set(orderItems.map(item => item.variant_id).filter(Boolean))];
                const { data: variants } = await supabase
                    .from('variants')
                    .select('id, name, brands(name)')
                    .in('id', variantIds);

                const variantNameMap = (variants || []).reduce((acc: any, variant: any) => {
                    const brand = Array.isArray(variant.brands) ? variant.brands[0] : variant.brands;
                    acc[variant.id] = `${brand?.name || ''} ${variant.name}`.trim();
                    return acc;
                }, {});

                const flavorStats = orderItems.reduce((acc: any, item: any) => {
                    const variantId = item.variant_id;
                    if (!variantId) return acc;
                    const flavorName = variantNameMap[variantId] || 'Unknown';
                    if (!acc[flavorName]) acc[flavorName] = { name: flavorName, quantity: 0, orders: 0 };
                    acc[flavorName].quantity += item.quantity || 0;
                    acc[flavorName].orders += 1;
                    return acc;
                }, {});

                topFlavors = Object.values(flavorStats).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 10);
            }

            return { topAgents, topFlavors };
        },
        staleTime: 1000 * 60 * 15, // 15 minutes, top performers don't need to be instant
    });

    useEffect(() => {
        const channel = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['top_performers'] }));
        return () => unsubscribe(channel);
    }, [queryClient]);

    return query;
}

export function useRecentActivity(page: number, itemsPerPage: number) {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['recent_activity', user?.id, page],
        enabled: !!user?.id,
        queryFn: async () => {
            if (!user?.id) return null;
            const offset = (page - 1) * itemsPerPage;

            const [{ data: notifications, error }, { count }] = await Promise.all([
                supabase
                    .from('notifications')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .range(offset, offset + itemsPerPage - 1),
                supabase
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
            ]);

            if (error) throw error;

            return {
                notifications: notifications || [],
                totalPages: Math.ceil((count || 0) / itemsPerPage),
                totalCount: count || 0
            };
        },
        staleTime: 1000 * 60 * 1, // 1 minute
    });

    useEffect(() => {
        if (!user?.id) return;
        const channel = subscribeToTable('notifications', () => queryClient.invalidateQueries({ queryKey: ['recent_activity', user.id] }));
        return () => unsubscribe(channel);
    }, [user?.id, queryClient]);

    return query;
}
