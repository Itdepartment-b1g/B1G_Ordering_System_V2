import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Building2,
  Loader2,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import KeyAccountKamAnalyticsTab from './KeyAccountKamAnalyticsTab';
import KeyAccountClientAnalyticsTab from './KeyAccountClientAnalyticsTab';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';

type MonthValue = 'all' | `${number}`;

interface KeyAccountOrder {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  kam_id: string | null;
  key_account_client_id: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
  analytics_only?: boolean;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  kam?: { full_name: string | null; email: string | null; role: string | null } | { full_name: string | null; email: string | null; role: string | null }[] | null;
}

interface KeyAccountPerson {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

interface KeyAccountClient {
  id: string;
  client_name: string;
  client_code: string | null;
}

interface PurchaseOrderItemRow {
  id: string;
  purchase_order_id: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  variants?: {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  } | {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  }[] | null;
}

interface ProductAnalyticsRow {
  key: string;
  brand: string;
  variant: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  clientCount: number;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isDeliveredRevenue(order: { status?: string | null; workflow_status?: string | null }) {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}

function formatCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

function formatDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(year: number, month: MonthValue) {
  const monthIndex = month === 'all' ? 0 : Number(month);
  const endMonthIndex = month === 'all' ? 11 : Number(month);
  return {
    start: formatDate(new Date(year, monthIndex, 1)),
    end: formatDate(new Date(year, endMonthIndex + 1, 0)),
  };
}

export default function KeyAccountAnalyticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<KeyAccountOrder[]>([]);
  const [items, setItems] = useState<PurchaseOrderItemRow[]>([]);
  const [people, setPeople] = useState<KeyAccountPerson[]>([]);
  const [clients, setClients] = useState<KeyAccountClient[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<MonthValue>('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [productTablePage, setProductTablePage] = useState(1);

  useEffect(() => {
    void fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.company_id]);

  const fetchAnalytics = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const [ordersResult, peopleResult, clientsResult] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select(`
            id,
            po_number,
            order_date,
            total_amount,
            status,
            workflow_status,
            kam_id,
            key_account_client_id,
            key_account_payment_status,
            key_account_payment_mode,
            client:key_account_clients(client_name),
            kam:profiles!purchase_orders_kam_id_fkey(full_name,email,role)
          `)
          .eq('company_id', user.company_id)
          .eq('company_account_type', 'Key Accounts')
          .order('order_date', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('company_id', user.company_id)
          .in('role', ['key_account_manager', 'sales_director'])
          .order('full_name', { ascending: true }),
        supabase
          .from('key_account_clients')
          .select('id, client_name, client_code')
          .eq('company_id', user.company_id)
          .order('client_name', { ascending: true }),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      if (peopleResult.error) throw peopleResult.error;
      if (clientsResult.error) throw clientsResult.error;

      const nextOrders = (ordersResult.data || []) as KeyAccountOrder[];
      const deliveredIds = nextOrders.filter(isDeliveredRevenue).map((order) => order.id);
      let nextItems: PurchaseOrderItemRow[] = [];

      if (deliveredIds.length > 0) {
        const { data: itemData, error: itemError } = await supabase
          .from('purchase_order_items')
          .select(`
            id,
            purchase_order_id,
            quantity,
            unit_price,
            total_price,
            variants (
              name,
              variant_type,
              brands (name)
            )
          `)
          .in('purchase_order_id', deliveredIds);

        if (itemError) throw itemError;
        nextItems = (itemData || []) as PurchaseOrderItemRow[];
      }

      setOrders(nextOrders);
      setItems(nextItems);
      setPeople((peopleResult.data || []) as KeyAccountPerson[]);
      setClients((clientsResult.data || []) as KeyAccountClient[]);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading Key Account analytics',
        description: error?.message || 'Failed to load analytics data',
      });
    } finally {
      setLoading(false);
    }
  };

  const productOrders = useMemo(() => {
    const range = getDateRange(selectedYear, selectedMonth);
    return orders.filter((order) => order.order_date >= range.start && order.order_date <= range.end);
  }, [orders, selectedMonth, selectedYear]);

  const deliveredOrders = useMemo(() => productOrders.filter(isDeliveredRevenue), [productOrders]);
  const deliveredOrderById = useMemo(
    () => new Map(deliveredOrders.map((order) => [order.id, order])),
    [deliveredOrders]
  );

  const productRows = useMemo(() => {
    const productMap = new Map<string, {
      brand: string;
      variant: string;
      quantity: number;
      revenue: number;
      orderIds: Set<string>;
      clientIds: Set<string>;
    }>();

    items.forEach((item) => {
      const order = deliveredOrderById.get(item.purchase_order_id);
      if (!order) return;

      const variant = firstRelation(item.variants);
      const brand = firstRelation(variant?.brands)?.name || 'Unknown Brand';
      const variantName = variant?.name || 'Unknown Variant';
      const quantity = Number(item.quantity || 0);
      const revenue = Number(item.total_price ?? quantity * Number(item.unit_price || 0));
      const key = `${brand}::${variantName}`;
      const existing = productMap.get(key) || {
        brand,
        variant: variantName,
        quantity: 0,
        revenue: 0,
        orderIds: new Set<string>(),
        clientIds: new Set<string>(),
      };

      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.orderIds.add(item.purchase_order_id);
      if (order.key_account_client_id) existing.clientIds.add(order.key_account_client_id);
      productMap.set(key, existing);
    });

    return Array.from(productMap.entries())
      .map(([key, value]) => ({
        key,
        brand: value.brand,
        variant: value.variant,
        quantity: value.quantity,
        revenue: value.revenue,
        orderCount: value.orderIds.size,
        clientCount: value.clientIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [deliveredOrderById, items]);

  const brands = useMemo(
    () => Array.from(new Set(productRows.map((row) => row.brand))).sort(),
    [productRows]
  );

  const allBrands = useMemo(() => {
    const brandSet = new Set<string>();
    items.forEach((item) => {
      const variant = firstRelation(item.variants);
      const brand = firstRelation(variant?.brands)?.name;
      if (brand) brandSet.add(brand);
    });
    return Array.from(brandSet).sort();
  }, [items]);

  const visibleProductRows = useMemo(
    () => productRows.filter((row) => selectedBrand === 'all' || row.brand === selectedBrand),
    [productRows, selectedBrand]
  );

  const paginatedProductRows = useMemo(
    () => paginateAnalyticsRows(visibleProductRows, productTablePage),
    [visibleProductRows, productTablePage]
  );

  useEffect(() => {
    setProductTablePage(1);
  }, [visibleProductRows.length, selectedBrand, selectedYear, selectedMonth]);

  const summary = useMemo(() => {
    const deliveredRevenue = deliveredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const deliveredClients = new Set(deliveredOrders.map((order) => order.key_account_client_id).filter(Boolean));
    return {
      deliveredRevenue,
      totalOrders: productOrders.length,
      deliveredOrders: deliveredOrders.length,
      clients: deliveredClients.size,
      avgOrderValue: deliveredOrders.length > 0 ? deliveredRevenue / deliveredOrders.length : 0,
    };
  }, [deliveredOrders, productOrders.length]);

  const analyticsOrders = useMemo<KeyAccountOrder[]>(() => {
    const orderPersonIds = new Set(orders.map((order) => order.kam_id).filter(Boolean));
    const placeholderOrders = people
      .filter((person) => !orderPersonIds.has(person.id))
      .map((person) => ({
        id: `profile-${person.id}`,
        po_number: '',
        order_date: '',
        total_amount: 0,
        status: null,
        workflow_status: null,
        kam_id: person.id,
        key_account_client_id: null,
        analytics_only: true,
        kam: {
          full_name: person.full_name,
          email: person.email,
          role: person.role,
        },
      }));

    return [...orders, ...placeholderOrders];
  }, [orders, people]);

  const productChartData = visibleProductRows.slice(0, 10).map((row) => ({
    name: row.variant,
    brand: row.brand,
    revenue: Math.round(row.revenue),
    quantity: row.quantity,
  }));

  const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Key Account Analytics</h1>
          <p className="text-muted-foreground">
            Product, agent, and client analytics from Key Account purchase orders.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={(value) => setSelectedMonth(value as MonthValue)}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All months</SelectItem>
              {monthNames.map((month, index) => (
                <SelectItem key={month} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading Key Account analytics...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Delivered revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.deliveredRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Fulfilled and delivered POs only</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Purchase orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">{summary.deliveredOrders} delivered</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Buying clients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.clients}</div>
                <p className="text-xs text-muted-foreground mt-1">Clients with delivered POs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Avg delivered PO
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.avgOrderValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Revenue divided by delivered POs</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="products" className="space-y-4">
            <TabsList>
              <TabsTrigger value="products" className="gap-2">
                <Package className="h-4 w-4" />
                Product Analytics
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-2">
                <Users className="h-4 w-4" />
                Agent Analytics
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2">
                <Building2 className="h-4 w-4" />
                Client Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Product Analytics</CardTitle>
                    <CardDescription>
                      Based on Purchase Order Items for delivered Key Account POs.
                    </CardDescription>
                  </div>
                  <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                    <SelectTrigger className="w-full md:w-[220px]">
                      <SelectValue placeholder="Filter brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-3">Best selling items</p>
                  </div>
                  <div className="h-[360px]">
                    {productChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={productChartData}
                          layout="vertical"
                          margin={{ top: 4, right: 24, left: 24, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tick={{ fontSize: 12 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={140}
                            tick={{ fontSize: 11 }}
                            interval={0}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as { brand: string; quantity: number; revenue: number };
                              return (
                                <div className="bg-white border rounded-md p-3 shadow-lg text-sm">
                                  <p className="font-semibold mb-1">{label}</p>
                                  <p className="text-emerald-600">Revenue (₱): {formatCurrency(row.revenue)}</p>
                                  <p className="text-muted-foreground">Qty: {row.quantity.toLocaleString()}</p>
                                  <p className="text-muted-foreground">Brand: {row.brand}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        No delivered product data for the selected period.
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Brand</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">POs</TableHead>
                          <TableHead className="text-right">Clients</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleProductRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              No products found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedProductRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell><Badge variant="outline">{row.brand}</Badge></TableCell>
                              <TableCell className="font-medium">{row.variant}</TableCell>
                              <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                              <TableCell className="text-right">{row.orderCount}</TableCell>
                              <TableCell className="text-right">{row.clientCount}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <AnalyticsTablePagination
                      page={productTablePage}
                      onPageChange={setProductTablePage}
                      totalRows={visibleProductRows.length}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agents">
              <KeyAccountKamAnalyticsTab orders={analyticsOrders} items={items} people={people} formatCurrency={formatCurrency} />
            </TabsContent>

            <TabsContent value="clients">
              <KeyAccountClientAnalyticsTab
                orders={orders}
                items={items}
                clients={clients}
                brands={allBrands}
                formatCurrency={formatCurrency}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
