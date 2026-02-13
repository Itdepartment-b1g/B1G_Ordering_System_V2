import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useEffect } from 'react';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export function useAdminStats() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['admin_stats', user?.company_id],
        enabled: !!user?.company_id,
        queryFn: async () => {
            if (!user?.company_id) return null;

            // Run all queries in parallel for performance
            const sixMonthsAgoIso = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString();

            const [
                approvedOrdersResult,
                ordersResult,
                agentsResult,
                variantsResult,
                monthlyResult
            ] = await Promise.all([
                // Get total revenue from admin-approved client orders
                supabase
                    .from('client_orders')
                    .select('total_amount')
                    .eq('company_id', user.company_id)
                    .eq('stage', 'admin_approved'),
                // Get orders stats
                supabase
                    .from('client_orders')
                    .select('id, status')
                    .eq('company_id', user.company_id),
                // Get agents stats
                supabase
                    .from('profiles')
                    .select('id, status')
                    .eq('company_id', user.company_id)
                    .eq('role', 'sales_agent'),
                // Get products stats
                supabase
                    .from('variants')
                    .select(`
                      id,
                      main_inventory (
                        stock,
                        reorder_level
                      )
                    `)
                    .eq('company_id', user.company_id),
                // Get monthly revenue for chart
                supabase
                    .from('client_orders')
                    .select('total_amount, order_date')
                    .eq('company_id', user.company_id)
                    .eq('stage', 'admin_approved')
                    .gte('order_date', sixMonthsAgoIso)
            ]);

            const approvedOrdersForRevenue = approvedOrdersResult.data;
            const orders = ordersResult.data;
            const agents = agentsResult.data;
            const variants = variantsResult.data;
            const monthlyApproved = monthlyResult.data;

            const revenue = (approvedOrdersForRevenue || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
            const totalOrders = orders?.length || 0;
            const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;
            const totalAgents = agents?.length || 0;
            const activeAgents = agents?.filter(a => a.status === 'active').length || 0;
            const totalProducts = variants?.length || 0;
            const lowStockProducts = variants?.filter(v => {
                const stock = v.main_inventory?.[0]?.stock || 0;
                const reorderLevel = v.main_inventory?.[0]?.reorder_level || 50;
                return stock < reorderLevel;
            }).length || 0;

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
                    recentRemittances: []
                };
            }

            // Run all queries in parallel for performance
            const [ordersResult, clientsResult, requestsResult, remittancesResult] = await Promise.all([
                // Get team orders
                supabase
                    .from('client_orders')
                    .select('id, total_amount, status, created_at, stage, order_number, agent_id, profiles!client_orders_agent_id_fkey(full_name)')
                    .in('agent_id', teamMemberIds),
                // Get team clients
                supabase
                    .from('clients')
                    .select('id')
                    .in('agent_id', teamMemberIds),
                // Get pending stock requests
                supabase
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
                    .order('requested_at', { ascending: false }),
                // Get recent remittances from sub-team (mobile sales)
                supabase
                    .from('remittances_log')
                    .select(`
                        id,
                        remittance_id,
                        agent_id,
                        leader_id,
                        total_revenue,
                        total_orders,
                        remittance_date,
                        status,
                        profiles!remittances_log_agent_id_fkey(full_name)
                    `)
                    .eq('leader_id', user.id)
                    .in('agent_id', teamMemberIds)
                    .order('remittance_date', { ascending: false })
                    .limit(10)
            ]);

            const orders = ordersResult.data || [];
            const clients = clientsResult.data || [];
            const pendingStockRequests = requestsResult.data || [];
            const recentRemittances = remittancesResult.data || [];

            // Process orders data
            const teamRevenue = orders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayOrdersData = orders.filter((o: any) => new Date(o.created_at) >= today);
            const todayOrders = todayOrdersData.length;
            const todayRevenue = todayOrdersData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);
            const weekOrdersData = orders.filter((o: any) => new Date(o.created_at) >= weekAgo);
            const weekOrders = weekOrdersData.length;
            const weekRevenue = weekOrdersData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

            const pendingLeaderOrders = orders.filter((o: any) =>
                o.status === 'pending' && o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
            ).length;

            const approvedOrdersCount = orders.filter((o: any) =>
                o.status === 'approved' || o.stage === 'leader_approved' || o.stage === 'admin_approved'
            ).length;

            return {
                teamMembers: teamMemberIds.length,
                teamOrders: orders.length,
                teamClients: clients.length,
                pendingRequests: pendingStockRequests.length,
                teamRevenue,
                todayOrders,
                todayRevenue,
                weekOrders,
                weekRevenue,
                pendingLeaderOrders,
                approvedOrdersCount,
                pendingStockRequests,
                recentRemittances
            };
        },
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (!user?.id || user.role !== 'team_leader') return;

        const channel1 = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));
        const channel2 = subscribeToTable('stock_requests', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));
        const channel3 = subscribeToTable('leader_teams', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));
        const channel4 = subscribeToTable('remittances_log', () => queryClient.invalidateQueries({ queryKey: ['leader_stats', user.id] }));

        return () => {
            unsubscribe(channel1);
            unsubscribe(channel2);
            unsubscribe(channel3);
            unsubscribe(channel4);
        };
    }, [user?.id, user?.role, queryClient]);

    return query;
}

export function useAgentStats() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['agent_stats', user?.id],
        enabled: !!user?.id && (user?.role === 'sales_agent' || user?.role === 'mobile_sales'),
        queryFn: async () => {
            if (!user?.id) {
                console.log('❌ No user ID available');
                return null;
            }

            console.log('📊 Fetching agent stats for user:', user.id);

            const [ordersResult, clientsResult] = await Promise.all([
                supabase.from('client_orders').select('id, total_amount, status, stage').eq('agent_id', user.id),
                supabase.from('clients').select('id').eq('agent_id', user.id)
            ]);

            // Check for errors
            if (ordersResult.error) {
                console.error('❌ Error fetching orders:', ordersResult.error);
            }
            if (clientsResult.error) {
                console.error('❌ Error fetching clients:', clientsResult.error);
            }

            const orders = ordersResult.data;
            const clients = clientsResult.data;

            console.log('📦 Orders fetched:', orders?.length || 0, orders);
            console.log('👥 Clients fetched:', clients?.length || 0);

            // Calculate overall sales (all orders regardless of status/stage)
            const overallSales = (orders || []).reduce((sum, order) => {
                const amount = Number(order.total_amount) || 0;
                return sum + amount;
            }, 0);

            // Calculate approved sales only (stage = admin_approved is the final approval)
            const approvedOrders = (orders || []).filter(order => order.stage === 'admin_approved');
            const approvedSales = approvedOrders.reduce((sum, order) => {
                const amount = Number(order.total_amount) || 0;
                return sum + amount;
            }, 0);

            // Calculate pending sales (orders awaiting approval - not rejected or fully approved)
            const pendingOrders = (orders || []).filter(order => {
                const stage = order.stage;
                // Include agent_pending, finance_pending, leader_approved (waiting for admin)
                // Exclude admin_approved, leader_rejected, admin_rejected
                return stage === 'agent_pending' ||
                    stage === 'finance_pending' ||
                    stage === 'leader_approved' ||
                    (!stage && order.status === 'pending'); // Fallback for orders without stage
            });
            const pendingSales = pendingOrders.reduce((sum, order) => {
                const amount = Number(order.total_amount) || 0;
                return sum + amount;
            }, 0);

            console.log('💰 Sales calculated:', {
                overallSales,
                approvedSales: approvedSales + ' (from ' + approvedOrders.length + ' orders)',
                pendingSales: pendingSales + ' (from ' + pendingOrders.length + ' orders)'
            });

            return {
                myOrders: orders?.length || 0,
                myClients: clients?.length || 0,
                overallSales,
                approvedSales,
                pendingSales,
                myCommission: 0 // Logic not implemented yet as per current code
            };
        },
        staleTime: 1000 * 60 * 5,
    });

    useEffect(() => {
        if (!user?.id || (user.role !== 'sales_agent' && user.role !== 'mobile_sales')) return;

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
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['top_performers', user?.company_id],
        enabled: !!user?.company_id,
        queryFn: async () => {
            if (!user?.company_id) return { topAgents: [], topFlavors: [] };

            // First query - get approved orders
            const { data: approvedOrders, error: ordersError } = await supabase
                .from('client_orders')
                .select('id, agent_id, total_amount')
                .eq('company_id', user.company_id)
                .eq('stage', 'admin_approved');

            if (ordersError) throw ordersError;
            if (!approvedOrders || approvedOrders.length === 0) return { topAgents: [], topFlavors: [] };

            const approvedOrderIds = approvedOrders.map(order => order.id);
            const agentIds = [...new Set(approvedOrders.map(order => order.agent_id).filter(Boolean))];

            // Run agent profiles and order items queries in parallel (they don't depend on each other)
            const [agentProfilesResult, orderItemsResult] = await Promise.all([
                agentIds.length > 0
                    ? supabase
                        .from('profiles')
                        .select('id, full_name')
                        .eq('company_id', user.company_id)
                        .in('id', agentIds)
                    : Promise.resolve({ data: [] }),
                supabase
                    .from('client_order_items')
                    .select('quantity, variant_id')
                    .in('client_order_id', approvedOrderIds)
            ]);

            // Process top agents
            let topAgents: any[] = [];
            const agentProfiles = agentProfilesResult.data || [];
            if (agentIds.length > 0) {
                const agentNameMap = agentProfiles.reduce((acc: any, profile: any) => {
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

            // Process top flavors
            let topFlavors: any[] = [];
            const orderItems = orderItemsResult.data || [];
            if (orderItems.length > 0) {
                const variantIds = [...new Set(orderItems.map(item => item.variant_id).filter(Boolean))];
                const { data: variants } = await supabase
                    .from('variants')
                    .select('id, name, brands(name)')
                    .eq('company_id', user.company_id)
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
                    .select('id, notification_type, title, message, is_read, created_at')
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

export function useFinanceStats() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['finance_stats', user?.company_id],
        enabled: !!user?.company_id && user?.role === 'finance',
        queryFn: async () => {
            if (!user?.company_id) return null;

            // Get pending orders (Incoming Orders)
            const { data: pendingOrdersData } = await supabase
                .from('client_orders')
                .select('id, order_number, total_amount, created_at, profiles!client_orders_agent_id_fkey(full_name)')
                .eq('company_id', user.company_id)
                .or('status.eq.pending,stage.eq.leader_approved') // Finance likely sees leader approved or pending
                .order('created_at', { ascending: false })
                .limit(10);

            const pendingOrders = pendingOrdersData || [];

            // Get recent cash deposits
            const { data: depositsData } = await supabase
                .from('cash_deposits')
                .select('id, amount, deposit_date, status, deposit_slip_url, profiles!cash_deposits_agent_id_fkey(full_name)')
                .eq('company_id', user.company_id)
                .order('deposit_date', { ascending: false })
                .limit(10);

            const recentDepositsRaw = depositsData || [];

            // Apply split-payment logic: compute cash + cheque portions from client_orders.payment_splits
            let recentDeposits = recentDepositsRaw;
            if (recentDepositsRaw.length > 0) {
                const depositIds = recentDepositsRaw.map(d => d.id);

                const { data: orderData, error: orderError } = await supabase
                    .from('client_orders')
                    .select('id, deposit_id, total_amount, payment_method, payment_mode, payment_splits')
                    .in('deposit_id', depositIds);

                if (!orderError && orderData) {
                    const summaries: Record<string, { cashPortion: number; chequePortion: number; nonCashPortion: number }> = {};

                    orderData.forEach((order: any) => {
                        const depositId = order.deposit_id as string | null;
                        if (!depositId) return;

                        const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
                        const paymentMethod = order.payment_method as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | null;
                        const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

                        let cashPortion = 0;
                        let chequePortion = 0;
                        let nonCashPortion = 0;

                        if (paymentMode === 'SPLIT') {
                            splits.forEach((s: any) => {
                                const amount = s.amount || 0;
                                if (s.method === 'CASH') {
                                    cashPortion += amount;
                                } else if (s.method === 'CHEQUE') {
                                    chequePortion += amount;
                                } else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
                                    nonCashPortion += amount;
                                }
                            });
                        } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
                            const amt = order.total_amount || 0;
                            if (paymentMethod === 'CASH') {
                                cashPortion = amt;
                            } else {
                                chequePortion = amt;
                            }
                        }

                        if (!summaries[depositId]) {
                            summaries[depositId] = { cashPortion: 0, chequePortion: 0, nonCashPortion: 0 };
                        }

                        summaries[depositId].cashPortion += cashPortion;
                        summaries[depositId].chequePortion += chequePortion;
                        summaries[depositId].nonCashPortion += nonCashPortion;
                    });

                    recentDeposits = recentDepositsRaw.map(deposit => {
                        const summary = summaries[deposit.id];
                        const effectiveAmount =
                            summary && (summary.cashPortion > 0 || summary.chequePortion > 0)
                                ? summary.cashPortion + summary.chequePortion
                                : deposit.amount || 0;

                        return {
                            ...deposit,
                            amount: effectiveAmount,
                            _rawAmount: deposit.amount || 0,
                            _cashPortion: summary?.cashPortion ?? null,
                            _chequePortion: summary?.chequePortion ?? null,
                            _nonCashPortion: summary?.nonCashPortion ?? null,
                        };
                    });
                }
            }

            // Simple stats
            const totalPendingRevenue = pendingOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
            const todayStr = new Date().toDateString();
            const totalDepositsToday = (recentDeposits || [])
                .filter((d: any) => new Date(d.deposit_date).toDateString() === todayStr)
                .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

            return {
                pendingOrders,
                recentDeposits,
                totalPendingRevenue,
                totalDepositsToday,
                pendingOrdersCount: pendingOrders.length
            };
        },
        staleTime: 1000 * 60 * 2, // 2 minutes
    });

    useEffect(() => {
        if (!user?.company_id || user.role !== 'finance') return;

        const channel1 = subscribeToTable('client_orders', () => queryClient.invalidateQueries({ queryKey: ['finance_stats'] }));
        const channel2 = subscribeToTable('cash_deposits', () => queryClient.invalidateQueries({ queryKey: ['finance_stats'] }));

        return () => {
            unsubscribe(channel1);
            unsubscribe(channel2);
        };
    }, [user?.company_id, user?.role, queryClient]);

    return query;
}
