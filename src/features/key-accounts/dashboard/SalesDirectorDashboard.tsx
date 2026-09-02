import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  KeyAccountWorkflowStatusBadge,
} from '@/features/key-accounts/keyAccountWorkflowStatus';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
} from '@/lib/dateRangePresets';
import { KeyAccountDashboardRevenueCard } from './KeyAccountDashboardRevenueCard';
import { KeyAccountDashboardRevenueOverview } from './KeyAccountDashboardRevenueOverview';
import {
  EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE,
  formatKeyAccountDashboardCurrency,
} from './keyAccountDashboardRevenue';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchKADashboardOverview,
  fetchKADashboardTabs,
} from '@/store/slices/key-accounts/dashboard';

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
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'this_year',
  });
  const [alertPage, setAlertPage] = useState(1);
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [kamPage, setKamPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);

  const overview = useAppSelector((state) => state.kaDashboard.overview);
  const overviewStatus = useAppSelector((state) => state.kaDashboard.overviewStatus);
  const overviewError = useAppSelector((state) => state.kaDashboard.overviewError);
  const tabs = useAppSelector((state) => state.kaDashboard.tabs);
  const tabsStatus = useAppSelector((state) => state.kaDashboard.tabsStatus);
  const tabsError = useAppSelector((state) => state.kaDashboard.tabsError);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const dateRangeLabel = useMemo(
    () =>
      getDatePresetLabel(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const revenueMetrics = overview?.revenue || EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE;
  const kamStats = tabs?.team || [];
  const clients = tabs?.clients || [];
  const orders = tabs?.orders || [];
  const stats = {
    totalKAMs: overview?.stats.totalKAMs || 0,
    totalClients: overview?.stats.totalClients || 0,
    totalOrders: overview?.stats.totalOrders || 0,
    pendingOrders: overview?.stats.pendingOrders || 0,
    inactiveClients: tabs?.inactiveClients ?? overview?.stats.inactiveClients ?? 0,
  };
  const initialLoading = overviewStatus === 'idle' || (overviewStatus === 'loading' && !overview);
  const revenueLoading = overviewStatus === 'loading';
  const tabsLoading = tabsStatus === 'loading';

  useEffect(() => {
    void dispatch(fetchKADashboardOverview(selectedYear));
  }, [dispatch, selectedYear]);

  useEffect(() => {
    void dispatch(
      fetchKADashboardTabs({
        dateStart: dateRange.start ? formatDateForInput(dateRange.start) : undefined,
        dateEnd: dateRange.end ? formatDateForInput(dateRange.end) : undefined,
      })
    );
  }, [dispatch, dateRange.start, dateRange.end]);

  useEffect(() => {
    if (overviewStatus !== 'failed' || !overviewError) return;
    toast({ variant: 'destructive', title: 'Error', description: overviewError });
  }, [overviewStatus, overviewError, toast]);

  useEffect(() => {
    if (tabsStatus !== 'failed' || !tabsError) return;
    toast({ variant: 'destructive', title: 'Error', description: tabsError });
  }, [tabsStatus, tabsError, toast]);

  useEffect(() => {
    setAlertPage(1);
    setRecentOrdersPage(1);
    setClientPage(1);
    setKamPage(1);
    setOrdersPage(1);
  }, [tabs]);

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

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
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

      {/* Stats Cards */}
      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 ${revenueLoading ? 'opacity-60' : ''}`}>
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
              Outstanding payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.pendingOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Unpaid + partial + consignment ·{' '}
              {formatKeyAccountDashboardCurrency(
                revenueMetrics.summary.unpaidRevenue +
                  revenueMetrics.summary.partialRevenue +
                  revenueMetrics.summary.consignmentRevenue
              )}
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

      <div className={revenueLoading ? 'opacity-60 pointer-events-none' : ''}>
        <KeyAccountDashboardRevenueOverview
          monthlyData={revenueMetrics.monthlyData}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          orders={revenueMetrics.orders}
          payments={revenueMetrics.payments}
        />
      </div>

      {/* Main Tabs — date filter applies to tab content only (not revenue chart year). */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Tab data · PO order date: {dateRangeLabel}
          </p>
          <DateRangeFilterPopover
            value={dateRangeFilter}
            onChange={setDateRangeFilter}
            triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
            align="end"
          />
        </div>

        <div className="relative">
          {tabsLoading ? (
            <div className="absolute inset-0 z-10 flex items-start justify-center rounded-md bg-background/60 pt-16">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Updating tab data…
              </div>
            </div>
          ) : null}
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
                  (Assigned KAM clients + clients from your POs)
                </span>
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Paid and remaining use the same payment rules as Revenue Overview / Client Analytics
                for {dateRangeLabel}. Consignment float is shown separately.
              </p>
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
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Consignment</TableHead>
                    <TableHead className="text-right">Settlement disc.</TableHead>
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
                        <TableCell className="text-right text-emerald-600 tabular-nums">
                          {formatKeyAccountDashboardCurrency(client.paidRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 tabular-nums">
                          {formatKeyAccountDashboardCurrency(client.remainingBalance)}
                        </TableCell>
                        <TableCell className="text-right text-sky-600 tabular-nums">
                          {formatKeyAccountDashboardCurrency(client.consignmentRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600 tabular-nums">
                          {formatKeyAccountDashboardCurrency(client.settlementDiscountRevenue)}
                        </TableCell>
                        <TableCell className="text-right">{getDaysBadge(client.daysSinceLastOrder)}</TableCell>
                      </TableRow>
                    ))}
                  {clients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="py-6 text-center text-muted-foreground">
                        No clients in your scope yet.
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
              <p className="text-sm text-muted-foreground font-normal">
                Order counts and delivered revenue for {dateRangeLabel}.
              </p>
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
                All Orders in My Scope
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                POs from your assigned KAMs and POs you created as Sales Director · {dateRangeLabel}.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Owner</TableHead>
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
                        No orders found in your scope.
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
      </div>
    </div>
  );
}
