import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Package, DollarSign, CheckCircle, XCircle, Bell, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, Calendar, ArrowRight, ShoppingCart, Loader2 } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import {
  useAdminStats,
  useLeaderStats,
  useAgentStats,
  useTopPerformers,
  useRecentActivity
} from './dashboardHooks';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isLeader = user?.role === 'team_leader';
  const isAgent = user?.role === 'sales_agent';

  // Redirect logic
  useEffect(() => {
    if (user?.role === 'system_administrator') {
      navigate('/sys-admin-dashboard', { replace: true });
    } else if (user?.role === 'super_admin') {
      navigate('/super-admin-dashboard', { replace: true });
    }
  }, [user?.role, navigate]);

  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [flavorsExpanded, setFlavorsExpanded] = useState(false);

  // Use Hooks
  const { data: adminStats, isLoading: adminLoading } = useAdminStats();
  const { data: leaderStats, isLoading: leaderLoading } = useLeaderStats();
  const { data: agentStats, isLoading: agentLoading } = useAgentStats();
  const { data: performersData, isLoading: performersLoading } = useTopPerformers();
  const { data: activityData, isLoading: activityLoading } = useRecentActivity(currentPage, itemsPerPage);

  const loading = (isAdmin && (adminLoading || performersLoading)) ||
    (isLeader && (leaderLoading || activityLoading)) ||
    (isAgent && (agentLoading || activityLoading));

  // Destructure with defaults
  const {
    totalRevenue = 0,
    totalOrders = 0,
    pendingOrders = 0,
    totalAgents = 0,
    activeAgents = 0,
    totalProducts = 0,
    lowStockProducts = 0,
    revenueData = []
  } = adminStats || {};

  const {
    teamOrders = 0,
    teamClients = 0,
    teamMembers = 0,
    pendingRequests = 0,
    teamRevenue = 0,
    pendingStockRequests = [],
    pendingOrderApprovals = []
  } = leaderStats || {};

  const {
    myOrders = 0,
    myClients = 0,
    myCommission = 0
  } = agentStats || {};

  const {
    topPerformingAgents = [],
    topFlavors = []
  } = performersData || {};

  const {
    notifications: recentActivity = [],
    totalPages = 1
  } = activityData || {};


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
      setCurrentPage(newPage);
    }
  };

  if (loading && totalOrders === 0 && teamOrders === 0 && myOrders === 0) {
    return (
      <div className="p-4 md:p-8 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Welcome back, {user?.full_name || user?.email || 'User'}!</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          {isAdmin ? 'Overview of your sales operations' : isLeader ? 'Your team performance overview' : 'Your sales performance overview'}
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
      ) : isLeader ? (
        <>
          {/* Leader Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Orders</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{teamOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">Total team orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{teamClients}</div>
                <p className="text-xs text-muted-foreground mt-1">Total team clients</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{teamMembers}</div>
                <p className="text-xs text-muted-foreground mt-1">Active team members</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">{pendingRequests}</div>
                <p className="text-xs text-muted-foreground mt-1">Stock requests to review</p>
              </CardContent>
            </Card>
          </div>

          {/* Team Revenue Card */}
          {teamRevenue > 0 && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl md:text-2xl font-bold">₱{teamRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Total revenue from team orders</p>
              </CardContent>
            </Card>
          )}

          {/* Pending Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Pending Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Pending Stock Requests */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Stock Requests ({pendingStockRequests.length})
                    </h3>
                    {pendingStockRequests.length > 0 && (
                      <Link to="/inventory/pending-requests">
                        <Button variant="ghost" size="sm" className="text-xs">
                          View All <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                  {pendingStockRequests.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p>No pending stock requests</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingStockRequests.slice(0, 3).map((request: any) => {
                        const agentName = request.profiles?.full_name || 'Unknown Agent';
                        const variant = request.variants;
                        const brandName = variant?.brands?.name || variant?.brands?.[0]?.name || 'Unknown';
                        const variantName = variant?.name || 'Unknown';
                        return (
                          <div key={request.id} className="flex items-center justify-between p-3 rounded-lg border bg-yellow-50/30 border-yellow-200">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{agentName}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {brandName} {variantName} • Qty: {request.requested_quantity}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatTimeAgo(request.requested_at)}
                              </p>
                            </div>
                            <Link to="/inventory/pending-requests">
                              <Button variant="outline" size="sm" className="ml-2">
                                Review
                              </Button>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pending Order Approvals */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Order Approvals ({pendingOrderApprovals.length})
                    </h3>
                    {pendingOrderApprovals.length > 0 && (
                      <Link to="/orders">
                        <Button variant="ghost" size="sm" className="text-xs">
                          View All <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                  {pendingOrderApprovals.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p>No pending order approvals</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {pendingOrderApprovals.slice(0, 3).map((order: any) => {
                        const agentName = order.profiles?.full_name || 'Unknown Agent';
                        return (
                          <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border bg-blue-50/30 border-blue-200">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{agentName}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                Order #{order.order_number} • ₱{order.total_amount?.toLocaleString() || '0'}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatTimeAgo(order.created_at)}
                              </p>
                            </div>
                            <Link to="/orders">
                              <Button variant="outline" size="sm" className="ml-2">
                                Review
                              </Button>
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
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
                        className={`p-3 rounded-lg border transition-all duration-300 ${notification.is_read ? 'opacity-60 bg-gray-50' : 'bg-blue-50/30 border-blue-200'
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
