import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  KeyAccountWorkflowStatusBadge,
} from '@/features/key-accounts/keyAccountWorkflowStatus';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Users,
  Building2,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Eye
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { KeyAccountDashboardRevenueCard } from './KeyAccountDashboardRevenueCard';
import { KeyAccountDashboardRevenueOverview } from './KeyAccountDashboardRevenueOverview';
import {
  EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE,
  formatKeyAccountDashboardCurrency,
  loadKeyAccountDashboardRevenue,
  type KeyAccountDashboardOrder,
  type KeyAccountDashboardRevenueResult,
} from './keyAccountDashboardRevenue';

interface KAMWithStats {
  id: string;
  full_name: string;
  email: string;
  clientCount: number;
  orderCount: number;
  deliveredOrderCount: number;
  totalRevenue: number;
}

interface ClientWithLastOrder {
  id: string;
  client_name: string;
  client_code: string;
  kam_name: string;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  totalOrders: number;
  totalRevenue: number;
}

interface DirectorOrder {
  id: string;
  client_name: string;
  shop_name: string;
  kam_name: string;
  total_amount: number;
  status: string;
  workflow_status?: string | null;
  order_date: string;
  dr_number?: string;
}

function isDeliveredRevenue(o: { status?: string | null; workflow_status?: string | null }) {
  return o.status === 'fulfilled' && o.workflow_status === 'delivered';
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatOrderDate(value: string | null) {
  if (!value) return 'No orders yet';
  return new Date(value).toLocaleDateString();
}

const PAGE_SIZE = 10;

function getPageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function paginateRows<T>(rows: T[], page: number) {
  const start = (page - 1) * PAGE_SIZE;
  return rows.slice(start, start + PAGE_SIZE);
}

export function SalesDirectorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [kamStats, setKamStats] = useState<KAMWithStats[]>([]);
  const [clients, setClients] = useState<ClientWithLastOrder[]>([]);
  const [orders, setOrders] = useState<DirectorOrder[]>([]);
  const [revenueMetrics, setRevenueMetrics] = useState<KeyAccountDashboardRevenueResult>(
    EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE
  );
  const [alertPage, setAlertPage] = useState(1);
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [kamPage, setKamPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [stats, setStats] = useState({
    totalKAMs: 0,
    totalClients: 0,
    totalOrders: 0,
    pendingOrders: 0,
    inactiveClients: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDirectorData();
  }, [selectedYear]);

  const fetchDirectorData = async () => {
    setLoading(true);
    try {
      // Get my assigned KAMs
      const { data: kamAssignments, error: kamError } = await supabase
        .from('kam_director_assignments')
        .select('kam_id, kam:profiles!kam_director_assignments_kam_id_fkey(id, full_name, email)')
        .eq('director_id', user?.id);

      if (kamError) throw kamError;

      const kamIds = kamAssignments?.map((a: any) => a.kam_id) || [];

      if (kamIds.length === 0) {
        setKamStats([]);
        setClients([]);
        setOrders([]);
        setRevenueMetrics(EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE);
        setStats({
          totalKAMs: 0,
          totalClients: 0,
          totalOrders: 0,
          pendingOrders: 0,
          inactiveClients: 0,
        });
        return;
      }

      // Get stats for each KAM
      const kamsWithStats: KAMWithStats[] = [];
      for (const assignment of kamAssignments || []) {
        const kamData = assignment.kam as any;
        
        // Count clients
        const { count: clientCount } = await supabase
          .from('kam_client_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('kam_id', kamData.id);

        // Count orders and revenue
        const { data: kamOrders } = await supabase
          .from('purchase_orders')
          .select('total_amount, status, workflow_status')
          .eq('kam_id', kamData.id)
          .gte('order_date', `${selectedYear}-01-01`)
          .lte('order_date', `${selectedYear}-12-31`);

        const deliveredOrders =
          kamOrders?.filter((o: any) => isDeliveredRevenue(o)) || [];
        const revenue = deliveredOrders.reduce(
          (sum: number, o: any) => sum + (o.total_amount || 0),
          0
        );

        kamsWithStats.push({
          id: kamData.id,
          full_name: kamData.full_name,
          email: kamData.email,
          clientCount: clientCount || 0,
          orderCount: kamOrders?.length || 0,
          deliveredOrderCount: deliveredOrders.length,
          totalRevenue: revenue
        });
      }

      setKamStats(kamsWithStats);

      // Get all clients under my KAMs with last order info
      const { data: clientAssignments, error: clientError } = await supabase
        .from('kam_client_assignments')
        .select('client_id, kam_id, kam:profiles!kam_client_assignments_kam_id_fkey(full_name), client:key_account_clients(*)')
        .in('kam_id', kamIds);

      if (clientError) throw clientError;

      const clientsWithOrders: ClientWithLastOrder[] = [];
      for (const assignment of clientAssignments || []) {
        const clientData = firstRelation(assignment.client as any);
        if (!clientData) continue;

        const kam = firstRelation(assignment.kam as any);
        const kamName = kam?.full_name || 'Unknown';

        // Get last order for this client
        const { data: lastOrder, error: lastOrderError } = await supabase
          .from('purchase_orders')
          .select('order_date, total_amount')
          .eq('key_account_client_id', clientData.id)
          .order('order_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastOrderError) throw lastOrderError;

        // Get total orders and revenue for the year
        const { data: clientOrders, error: clientOrdersError } = await supabase
          .from('purchase_orders')
          .select('total_amount, status, workflow_status')
          .eq('key_account_client_id', clientData.id)
          .gte('order_date', `${selectedYear}-01-01`)
          .lte('order_date', `${selectedYear}-12-31`);

        if (clientOrdersError) throw clientOrdersError;

        const totalOrders = clientOrders?.length || 0;
        const totalRevenue =
          clientOrders
            ?.filter((o: any) => isDeliveredRevenue(o))
            .reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0) || 0;

        const lastOrderDate = lastOrder?.order_date;
        const daysSinceLastOrder = lastOrderDate 
          ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        clientsWithOrders.push({
          id: clientData.id,
          client_name: clientData.client_name,
          client_code: clientData.client_code,
          kam_name: kamName,
          lastOrderDate,
          daysSinceLastOrder,
          totalOrders,
          totalRevenue
        });
      }

      setClients(clientsWithOrders);

      // Get all orders from my KAMs
      const { data: ordersData, error: ordersError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          total_amount,
          subtotal,
          status,
          workflow_status,
          po_order_kind,
          source_rebate_id,
          warehouse_location_id,
          order_date,
          dr_number,
          key_account_client_id,
          client:key_account_clients(client_name),
          shop:key_account_shops(shop_name),
          kam:profiles!purchase_orders_kam_id_fkey(full_name)
        `)
        .eq('company_id', user?.company_id)
        .in('kam_id', kamIds)
        .eq('company_account_type', 'Key Accounts')
        .gte('order_date', `${selectedYear}-01-01`)
        .lte('order_date', `${selectedYear}-12-31`)
        .order('order_date', { ascending: false });

      if (ordersError) throw ordersError;

      const analyticsOrders = (ordersData || []) as KeyAccountDashboardOrder[];
      const revenueResult = await loadKeyAccountDashboardRevenue(
        supabase,
        analyticsOrders,
        selectedYear
      );
      setRevenueMetrics(revenueResult);

      const formattedOrders: DirectorOrder[] = ordersData?.map((o: any) => ({
        id: o.id,
        client_name: o.client?.client_name || 'Unknown',
        shop_name: o.shop?.shop_name || 'Unknown',
        kam_name: o.kam?.full_name || 'Unknown',
        total_amount: o.total_amount,
        status: o.status,
        workflow_status: o.workflow_status,
        order_date: o.order_date,
        dr_number: o.dr_number
      })) || [];

      setOrders(formattedOrders);

      const inactiveThreshold = 30;
      const inactiveClients = clientsWithOrders.filter(
        c => c.daysSinceLastOrder === null || c.daysSinceLastOrder > inactiveThreshold
      ).length;

      setStats({
        totalKAMs: kamsWithStats.length,
        totalClients: clientsWithOrders.length,
        totalOrders: formattedOrders.length,
        pendingOrders: revenueResult.pendingOrderCount,
        inactiveClients
      });
      setAlertPage(1);
      setRecentOrdersPage(1);
      setClientPage(1);
      setKamPage(1);
      setOrdersPage(1);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getDaysBadge = (days: number | null) => {
    if (days === null) return <Badge variant="outline">Never ordered</Badge>;
    if (days <= 7) return <Badge className="bg-green-100 text-green-800">{days} days ago</Badge>;
    if (days <= 30) return <Badge variant="outline" className="text-amber-600">{days} days ago</Badge>;
    return <Badge variant="destructive">{days} days ago</Badge>;
  };

  const renderPagination = (
    page: number,
    setPage: (page: number) => void,
    totalRows: number
  ) => {
    if (totalRows <= PAGE_SIZE) return null;

    const totalPages = getPageCount(totalRows);
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalRows);

    return (
      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Showing {start}-{end} of {totalRows}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  const alertClients = clients.filter(c => c.daysSinceLastOrder === null || c.daysSinceLastOrder > 30);
  const sortedClients = [...clients].sort((a, b) => (b.daysSinceLastOrder ?? 999) - (a.daysSinceLastOrder ?? 999));
  const paginatedAlertClients = paginateRows(alertClients, alertPage);
  const paginatedRecentOrders = paginateRows(orders, recentOrdersPage);
  const paginatedClients = paginateRows(sortedClients, clientPage);
  const paginatedKamStats = paginateRows(kamStats, kamPage);
  const paginatedOrders = paginateRows(orders, ordersPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sales Director Dashboard</h1>
          <div className="text-muted-foreground flex items-center flex-wrap gap-2">
            <span>Welcome, {user?.full_name}</span>
            <Badge variant="secondary">
              <UserCheck className="h-3 w-3 mr-1" />
              Sales Director
            </Badge>
          </div>
        </div>
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026].map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">My KAMs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalKAMs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <KeyAccountDashboardRevenueCard summary={revenueMetrics.summary} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pending POs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.pendingOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              In workflow · Pending revenue{' '}
              {formatKeyAccountDashboardCurrency(revenueMetrics.summary.pendingRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.inactiveClients}</div>
          </CardContent>
        </Card>
      </div>

      <KeyAccountDashboardRevenueOverview
        monthlyData={revenueMetrics.monthlyData}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
      />

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Client Monitoring
          </TabsTrigger>
          <TabsTrigger value="kams" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            My KAMs
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Orders
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                  Client Activity Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>KAM</TableHead>
                      <TableHead>Last Order</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAlertClients
                      .map((client) => (
                        <TableRow key={client.id} className="bg-amber-50/60">
                          <TableCell className="font-medium">{client.client_name}</TableCell>
                          <TableCell>{client.kam_name}</TableCell>
                          <TableCell>{formatOrderDate(client.lastOrderDate)}</TableCell>
                          <TableCell className="text-right">{getDaysBadge(client.daysSinceLastOrder)}</TableCell>
                        </TableRow>
                      ))}
                    {alertClients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="flex items-center gap-2 text-green-600 py-2">
                            <CheckCircle className="h-5 w-5" />
                            <p>All clients are active!</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {renderPagination(alertPage, setAlertPage, alertClients.length)}
              </CardContent>
            </Card>

            {/* Recent Orders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>KAM</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.client_name}</TableCell>
                        <TableCell>{order.kam_name}</TableCell>
                        <TableCell>{formatOrderDate(order.order_date)}</TableCell>
                        <TableCell className="text-right">₱{order.total_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <KeyAccountWorkflowStatusBadge workflowStatus={order.workflow_status} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          No recent orders found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {renderPagination(recentOrdersPage, setRecentOrdersPage, orders.length)}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Client Monitoring Tab */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Client Order Monitoring
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (Shows when each client last placed an order)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>KAM</TableHead>
                    <TableHead>Last Order</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Delivered Revenue</TableHead>
                    <TableHead className="text-right">Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClients
                    .map((client) => (
                      <TableRow
                        key={client.id}
                        className={client.daysSinceLastOrder === null || client.daysSinceLastOrder > 30 ? 'bg-red-50/60' : undefined}
                      >
                        <TableCell>
                          <div className={`inline-flex p-2 rounded-full ${
                            client.daysSinceLastOrder === null || client.daysSinceLastOrder > 30
                              ? 'bg-red-100'
                              : client.daysSinceLastOrder > 7
                                ? 'bg-amber-100'
                                : 'bg-green-100'
                          }`}>
                            {client.daysSinceLastOrder === null || client.daysSinceLastOrder > 30 ? (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            ) : client.daysSinceLastOrder > 7 ? (
                              <Clock className="h-4 w-4 text-amber-600" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{client.client_name}</TableCell>
                        <TableCell>{client.client_code}</TableCell>
                        <TableCell>{client.kam_name}</TableCell>
                        <TableCell>{formatOrderDate(client.lastOrderDate)}</TableCell>
                        <TableCell className="text-right">{client.totalOrders}</TableCell>
                        <TableCell className="text-right">₱{client.totalRevenue.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{getDaysBadge(client.daysSinceLastOrder)}</TableCell>
                      </TableRow>
                    ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                        No clients assigned yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {renderPagination(clientPage, setClientPage, sortedClients.length)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* KAMs Tab */}
        <TabsContent value="kams">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                My Key Account Managers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KAM</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Delivered POs</TableHead>
                    <TableHead className="text-right">Delivered Revenue</TableHead>
                    <TableHead className="text-right">Avg Delivered Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedKamStats.map((kam) => (
                    <TableRow key={kam.id}>
                      <TableCell className="font-medium">{kam.full_name}</TableCell>
                      <TableCell>{kam.email}</TableCell>
                      <TableCell className="text-right">{kam.clientCount}</TableCell>
                      <TableCell className="text-right">{kam.orderCount}</TableCell>
                      <TableCell className="text-right">{kam.deliveredOrderCount}</TableCell>
                      <TableCell className="text-right">₱{kam.totalRevenue.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        ₱{kam.deliveredOrderCount > 0
                          ? Math.round(kam.totalRevenue / kam.deliveredOrderCount).toLocaleString()
                          : 0}
                      </TableCell>
                    </TableRow>
                  ))}
                  {kamStats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        No KAMs assigned yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {renderPagination(kamPage, setKamPage, kamStats.length)}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                All Orders from My KAMs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>KAM</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>DR Number</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.client_name}</TableCell>
                      <TableCell>{order.shop_name}</TableCell>
                      <TableCell>{order.kam_name}</TableCell>
                      <TableCell>{formatOrderDate(order.order_date)}</TableCell>
                      <TableCell>{order.dr_number || '—'}</TableCell>
                      <TableCell className="text-right">₱{order.total_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <KeyAccountWorkflowStatusBadge workflowStatus={order.workflow_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        No orders found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {renderPagination(ordersPage, setOrdersPage, orders.length)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
