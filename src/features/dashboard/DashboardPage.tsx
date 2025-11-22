import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Package, DollarSign, CheckCircle, XCircle, Bell, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Admin stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState(0);

  // Agent stats
  const [myOrders, setMyOrders] = useState(0);
  const [myCommission, setMyCommission] = useState(0);
  const [myClients, setMyClients] = useState(0);

  // Charts
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topAgents, setTopAgents] = useState<any[]>([]);
  
  // Top Performers
  const [topPerformingAgents, setTopPerformingAgents] = useState<any[]>([]);
  const [topFlavors, setTopFlavors] = useState<any[]>([]);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [flavorsExpanded, setFlavorsExpanded] = useState(false);

  // Agent notifications
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 5;

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminStats();
      fetchTopPerformers();
    } else {
      fetchAgentStats();
      fetchRecentActivity();
      
      // Real-time subscription for notifications
      const channel = subscribeToTable('notifications', () => {
        fetchRecentActivity();
      });
      
      return () => unsubscribe(channel);
    }
  }, [user?.id, isAdmin]);

  const fetchAdminStats = async () => {
    try {
      setLoading(true);

      // Get total revenue from admin-approved client orders (aligns with Top Performing Agents)
      const { data: approvedOrdersForRevenue } = await supabase
        .from('client_orders')
        .select('total_amount')
        .eq('stage', 'admin_approved');

      const revenue = (approvedOrdersForRevenue || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      setTotalRevenue(revenue);

      // Get orders stats
      const { data: orders } = await supabase
        .from('client_orders')
        .select('id, status');
      
      setTotalOrders(orders?.length || 0);
      setPendingOrders(orders?.filter(o => o.status === 'pending').length || 0);

      // Get agents stats
      const { data: agents } = await supabase
        .from('profiles')
        .select('id, status')
        .eq('role', 'sales_agent');
      
      setTotalAgents(agents?.length || 0);
      setActiveAgents(agents?.filter(a => a.status === 'active').length || 0);

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
      
      setTotalProducts(variants?.length || 0);
      const lowStock = variants?.filter(v => {
        const stock = v.main_inventory?.[0]?.stock || 0;
        const reorderLevel = v.main_inventory?.[0]?.reorder_level || 50;
        return stock < reorderLevel;
      }).length || 0;
      setLowStockProducts(lowStock);

      // Get monthly revenue for chart from admin-approved client orders over last 6 months
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

      setRevenueData(Object.entries(revenueByMonth).map(([month, revenue]) => ({ month, revenue })));

      // Keep top agents card calculation aligned with admin-approved orders
      const { data: agentOrders } = await supabase
        .from('client_orders')
        .select(`agent_id, total_amount, profiles ( full_name )`)
        .eq('stage', 'admin_approved');

      const agentStats = (agentOrders || []).reduce((acc: any, order: any) => {
        const agentId = order.agent_id;
        if (!acc[agentId]) {
          acc[agentId] = { name: order.profiles?.full_name || 'Unknown', orders: 0, revenue: 0 };
        }
        acc[agentId].orders += 1;
        acc[agentId].revenue += order.total_amount || 0;
        return acc;
      }, {} as Record<string, { name: string; orders: number; revenue: number }>);

      setTopAgents(Object.values(agentStats).sort((a: any, b: any) => b.revenue - a.revenue).slice(0, 3));

    } catch (error) {
      console.error('Error fetching admin stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentStats = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Get agent's orders
      const { data: orders } = await supabase
        .from('client_orders')
        .select('id, total_amount, status')
        .eq('agent_id', user.id);
      
      setMyOrders(orders?.length || 0);

      // Hide agent commission on dashboard (no calculation)
      setMyCommission(0);

      // Get agent's clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('agent_id', user.id);
      
      setMyClients(clients?.length || 0);

    } catch (error) {
      console.error('Error fetching agent stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopPerformers = async () => {
    try {
      // Get all approved orders
      // For admin dashboard, approved orders are those with stage = 'admin_approved'
      const { data: approvedOrders, error: ordersError } = await supabase
        .from('client_orders')
        .select('id, agent_id, total_amount')
        .eq('stage', 'admin_approved');

      console.log('🔍 Fetching top performers...');
      console.log('📋 Approved orders query result:', { approvedOrders, ordersError });

      if (ordersError) {
        console.error('❌ Error fetching approved orders:', ordersError);
        setTopPerformingAgents([]);
        setTopFlavors([]);
        return;
      }

      if (!approvedOrders || approvedOrders.length === 0) {
        console.log('⚠️ No approved orders found');
        setTopPerformingAgents([]);
        setTopFlavors([]);
        return;
      }

      console.log(`✅ Found ${approvedOrders.length} approved orders`);

      // Get approved order IDs for fetching order items
      const approvedOrderIds = approvedOrders.map(order => order.id);

      // ===== TOP PERFORMING AGENTS =====
      // Get unique agent IDs from approved orders
      const agentIds = [...new Set(approvedOrders.map(order => order.agent_id).filter(Boolean))];

      if (agentIds.length > 0) {
        // Fetch agent profiles
        const { data: agentProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', agentIds);

        if (!profilesError && agentProfiles) {
          // Create a map of agent ID to name
          const agentNameMap = agentProfiles.reduce((acc: any, profile: any) => {
            acc[profile.id] = profile.full_name || 'Unknown';
            return acc;
          }, {});

          // Calculate stats for each agent (total sales from approved orders)
          const agentStats = approvedOrders.reduce((acc: any, order: any) => {
            const agentId = order.agent_id;
            if (!agentId) return acc;
            
            if (!acc[agentId]) {
              acc[agentId] = {
                name: agentNameMap[agentId] || 'Unknown',
                orders: 0,
                revenue: 0
              };
            }
            acc[agentId].orders += 1;
            acc[agentId].revenue += order.total_amount || 0;
            return acc;
          }, {});

          console.log('📈 Agent stats calculated:', agentStats);

          // Sort by revenue (total sales) and get top 10
          const topAgentsData = Object.values(agentStats)
            .sort((a: any, b: any) => b.revenue - a.revenue)
            .slice(0, 10);

          console.log('🏆 Top agents data:', topAgentsData);
          setTopPerformingAgents(topAgentsData);
        }
      } else {
        setTopPerformingAgents([]);
      }

      // ===== TOP FLAVORS =====
      // Get order items from approved orders only
      console.log('📦 Fetching order items for approved orders:', approvedOrderIds);
      const { data: orderItems, error: itemsError } = await supabase
        .from('client_order_items')
        .select('quantity, variant_id')
        .in('client_order_id', approvedOrderIds);

      console.log('📦 Order items query result:', { orderItems, itemsError });

      if (itemsError) {
        console.error('❌ Error fetching order items:', itemsError);
        setTopFlavors([]);
        return;
      }

      if (!orderItems || orderItems.length === 0) {
        console.log('⚠️ No order items found for approved orders');
        setTopFlavors([]);
        return;
      }

      console.log(`✅ Found ${orderItems.length} order items`);

      // Get unique variant IDs
      const variantIds = [...new Set(orderItems.map(item => item.variant_id).filter(Boolean))];

      if (variantIds.length > 0) {
        // Fetch variant details with brand names
        const { data: variants, error: variantsError } = await supabase
          .from('variants')
          .select(`
            id,
            name,
            brand_id,
            brands (
              name
            )
          `)
          .in('id', variantIds);

        console.log('🍦 Variants fetched:', variants);

        if (!variantsError && variants) {
          // Create a map of variant ID to name
          // Handle brands as array (PostgreSQL returns arrays for relationships)
          const variantNameMap = variants.reduce((acc: any, variant: any) => {
            // brands can be an array or object depending on Supabase query
            const brand = Array.isArray(variant.brands) ? variant.brands[0] : variant.brands;
            const brandName = brand?.name || '';
            acc[variant.id] = `${brandName} ${variant.name}`.trim();
            return acc;
          }, {});

          console.log('🗺️ Variant name map:', variantNameMap);

          // Calculate flavor stats (total quantity ordered from approved orders)
          const flavorStats = orderItems.reduce((acc: any, item: any) => {
            const variantId = item.variant_id;
            if (!variantId) return acc;
            
            const flavorName = variantNameMap[variantId] || 'Unknown';
            if (!acc[flavorName]) {
              acc[flavorName] = {
                name: flavorName,
                quantity: 0,
                orders: 0
              };
            }
            acc[flavorName].quantity += item.quantity || 0;
            acc[flavorName].orders += 1;
            return acc;
          }, {});

          console.log('📊 Flavor stats calculated:', flavorStats);

          // Sort by quantity (most ordered) and get top 10
          const topFlavorsData = Object.values(flavorStats)
            .sort((a: any, b: any) => b.quantity - a.quantity)
            .slice(0, 10);

          console.log('🏆 Top flavors data:', topFlavorsData);
          setTopFlavors(topFlavorsData);
        }
      } else {
        setTopFlavors([]);
      }

    } catch (error) {
      console.error('Error fetching top performers:', error);
      setTopPerformingAgents([]);
      setTopFlavors([]);
    }
  };

  const fetchRecentActivity = async (page = 1) => {
    if (!user?.id) return;

    try {
      // Calculate offset for pagination
      const offset = (page - 1) * itemsPerPage;

      // Fetch recent notifications for the agent with pagination
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + itemsPerPage - 1);

      if (error) throw error;

      // Get total count for pagination
      const { count, error: countError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) throw countError;

      console.log('📬 Recent activity for agent:', notifications);
      setRecentActivity(notifications || []);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
      setCurrentPage(page);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_approved':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'order_rejected':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'inventory_allocated':
        return <Package className="h-5 w-5 text-blue-600" />;
      case 'system_message':
        return <Bell className="h-5 w-5 text-gray-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getNotificationBadge = (type: string) => {
    switch (type) {
      case 'order_approved':
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>;
      case 'order_rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'inventory_allocated':
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Stock Allocated</Badge>;
      case 'system_message':
        return <Badge variant="secondary">System</Badge>;
      default:
        return <Badge variant="outline">{type.replace('_', ' ')}</Badge>;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const intervals: { [key: string]: number } = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
      }
    }
    return 'Just now';
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchRecentActivity(newPage);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Welcome back, {user?.name}!</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          {isAdmin ? 'Overview of your sales operations' : 'Your sales performance overview'}
        </p>
      </div>

      {isAdmin ? (
        <>
          {/* Admin Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">₱{totalRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{totalOrders} total orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{totalOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">{pendingOrders} pending approval</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sales Agents</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{totalAgents}</div>
                <p className="text-xs text-muted-foreground mt-1">{activeAgents} active</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Products</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{totalProducts}</div>
                <p className="text-xs text-muted-foreground mt-1">{lowStockProducts} low stock</p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Chart */}
          {revenueData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Revenue Overview</CardTitle>
              </CardHeader>
              <CardContent className="px-2 md:px-6">
                <div className="w-full h-[250px] md:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (₱)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Performers */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Performing Agents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Top Performing Agents
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  console.log('🎯 Rendering agents:', topPerformingAgents);
                  return null;
                })()}
                {topPerformingAgents.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No approved orders found</p>
                    <p className="text-xs">Agents will appear here once they have approved orders</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(agentsExpanded ? topPerformingAgents : topPerformingAgents.slice(0, 5)).map((agent: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 md:p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs md:text-sm font-semibold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs md:text-sm truncate">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.orders} approved orders</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-bold text-xs md:text-sm">₱{agent.revenue.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                      </div>
                    </div>
                    ))}
                  
                  {topPerformingAgents.length > 5 && (
                    <Button 
                      variant="ghost" 
                      className="w-full mt-2"
                      onClick={() => setAgentsExpanded(!agentsExpanded)}
                    >
                      {agentsExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-2" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-2" />
                          Show All {topPerformingAgents.length} Agents
                        </>
                      )}
                    </Button>
                  )}
                </div>
                )}
              </CardContent>
            </Card>

            {/* Top Flavors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Top Flavors
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  console.log('🍦 Rendering flavors:', topFlavors);
                  return null;
                })()}
                {topFlavors.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No approved orders found</p>
                    <p className="text-xs">Flavors will appear here once orders are approved</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(flavorsExpanded ? topFlavors : topFlavors.slice(0, 5)).map((flavor: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-2 md:p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600 text-xs md:text-sm font-semibold flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs md:text-sm truncate">{flavor.name}</p>
                          <p className="text-xs text-muted-foreground">{flavor.orders} orders</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-bold text-xs md:text-sm">{flavor.quantity}</p>
                        <p className="text-xs text-muted-foreground">Units sold</p>
                      </div>
                    </div>
                    ))}
                  
                  {topFlavors.length > 5 && (
                    <Button 
                      variant="ghost" 
                      className="w-full mt-2"
                      onClick={() => setFlavorsExpanded(!flavorsExpanded)}
                    >
                      {flavorsExpanded ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-2" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-2" />
                          Show All {topFlavors.length} Flavors
                        </>
                      )}
                    </Button>
                  )}
                </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Agent Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 md:gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{myOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">Total orders placed</p>
              </CardContent>
            </Card>
            {/* Commission card hidden for agents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">My Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{myClients}</div>
                <p className="text-xs text-muted-foreground mt-1">Total clients</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <>
                  {/* Mobile: Card Layout, Desktop: Table Layout */}
                  <div className="block md:hidden space-y-3">
                    {recentActivity.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 rounded-lg border transition-all duration-300 ${
                          notification.is_read ? 'opacity-60 bg-gray-50' : 'bg-blue-50/30 border-blue-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.notification_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{notification.title}</p>
                              {getNotificationBadge(notification.notification_type)}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatTimeAgo(notification.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentActivity.map((notification) => (
                          <TableRow 
                            key={notification.id}
                            className={`transition-all duration-300 ${notification.is_read ? 'opacity-60' : 'bg-blue-50/30'}`}
                          >
                            <TableCell>
                              {getNotificationIcon(notification.notification_type)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {notification.title}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {notification.message}
                            </TableCell>
                            <TableCell>
                              {getNotificationBadge(notification.notification_type)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatTimeAgo(notification.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="flex-1 sm:flex-initial"
                        >
                          <ChevronLeft className="h-4 w-4 sm:mr-1" />
                          <span className="hidden sm:inline">Previous</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage === totalPages}
                          className="flex-1 sm:flex-initial"
                        >
                          <span className="hidden sm:inline">Next</span>
                          <ChevronRight className="h-4 w-4 sm:ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No recent activity</p>
                  <p className="text-sm">Your notifications will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
