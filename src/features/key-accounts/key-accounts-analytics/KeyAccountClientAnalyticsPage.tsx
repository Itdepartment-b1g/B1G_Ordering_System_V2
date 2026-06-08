import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, Loader2, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { isKeyAccountAnalyticsEligibleOrder } from './keyAccountAnalyticsShared';

type MonthValue = 'all' | `${number}`;

interface KeyAccountClient {
  id: string;
  client_name: string;
  client_code: string | null;
}

interface ClientOrderRow {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
}

interface ItemRow {
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

interface ProductRow {
  key: string;
  brand: string;
  variant: string;
  quantity: number;
  revenue: number;
  orderCount: number;
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

export default function KeyAccountClientAnalyticsPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<KeyAccountClient | null>(null);
  const [orders, setOrders] = useState<ClientOrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<MonthValue>('all');

  useEffect(() => {
    void fetchClientAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, user?.company_id, selectedYear, selectedMonth]);

  const fetchClientAnalytics = async () => {
    if (!clientId || !user?.company_id) return;
    setLoading(true);
    try {
      const [{ data: clientData, error: clientError }, ordersResult] = await Promise.all([
        supabase
          .from('key_account_clients')
          .select('id, client_name, client_code')
          .eq('id', clientId)
          .eq('company_id', user.company_id)
          .single(),
        supabase
          .from('purchase_orders')
          .select('id, po_number, order_date, total_amount, status, workflow_status, po_order_kind, source_rebate_id')
          .eq('company_id', user.company_id)
          .eq('company_account_type', 'Key Accounts')
          .eq('key_account_client_id', clientId)
          .gte('order_date', getDateRange(selectedYear, selectedMonth).start)
          .lte('order_date', getDateRange(selectedYear, selectedMonth).end)
          .order('order_date', { ascending: false }),
      ]);

      if (clientError) throw clientError;
      if (ordersResult.error) throw ordersResult.error;

      const nextOrders = ((ordersResult.data || []) as ClientOrderRow[]).filter(
        isKeyAccountAnalyticsEligibleOrder
      );
      const deliveredIds = nextOrders.filter(isDeliveredRevenue).map((order) => order.id);
      let nextItems: ItemRow[] = [];

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
              brands (name)
            )
          `)
          .in('purchase_order_id', deliveredIds);

        if (itemError) throw itemError;
        nextItems = (itemData || []) as ItemRow[];
      }

      setClient(clientData as KeyAccountClient);
      setOrders(nextOrders);
      setItems(nextItems);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading client analytics',
        description: error?.message || 'Failed to load Key Account client analytics',
      });
      navigate('/key-accounts/analytics');
    } finally {
      setLoading(false);
    }
  };

  const deliveredOrders = useMemo(() => orders.filter(isDeliveredRevenue), [orders]);

  const productRows = useMemo(() => {
    const productMap = new Map<string, {
      brand: string;
      variant: string;
      quantity: number;
      revenue: number;
      orderIds: Set<string>;
    }>();

    items.forEach((item) => {
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
      };

      existing.quantity += quantity;
      existing.revenue += revenue;
      existing.orderIds.add(item.purchase_order_id);
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
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [items]);

  const summary = useMemo(() => {
    const deliveredRevenue = deliveredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const quantity = productRows.reduce((sum, row) => sum + row.quantity, 0);
    return {
      deliveredRevenue,
      totalOrders: orders.length,
      deliveredOrders: deliveredOrders.length,
      quantity,
    };
  }, [deliveredOrders, orders.length, productRows]);

  const chartData = productRows.slice(0, 10).map((row) => ({
    name: row.variant.length > 18 ? `${row.variant.slice(0, 18)}...` : row.variant,
    revenue: Math.round(row.revenue),
    quantity: row.quantity,
  }));

  const yearOptions = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/key-accounts/analytics')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to analytics
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{client?.client_name || 'Client Analytics'}</h1>
            <p className="text-muted-foreground">
              {client?.client_code ? `${client.client_code} • ` : ''}Key Account delivered product performance.
            </p>
          </div>
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
            Loading client analytics...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Delivered revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.deliveredRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Delivered POs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.deliveredOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">{summary.totalOrders} total POs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Quantity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.quantity.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{productRows.length}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Product Analytics</CardTitle>
              <CardDescription>
                Products bought by this Key Account client from fulfilled and delivered POs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-[300px]">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => (
                        name === 'revenue' ? formatCurrency(Number(value)) : Number(value).toLocaleString()
                      )} />
                      <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No delivered product data for this client in the selected period.
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      productRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell><Badge variant="outline">{row.brand}</Badge></TableCell>
                          <TableCell className="font-medium">{row.variant}</TableCell>
                          <TableCell className="text-right">{row.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                          <TableCell className="text-right">{row.orderCount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
