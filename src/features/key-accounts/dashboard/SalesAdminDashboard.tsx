import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Users,
  Building2,
  Link2,
  Settings,
  BarChart3,
  Shield,
  DollarSign,
  TrendingUp,
  UserCheck,
  ShoppingCart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getKeyAccountRoleLabel } from '@/features/key-accounts/keyAccountRoles';
import { KeyAccountTeamManagement } from '../components/KeyAccountTeamManagement';
import { ClientHierarchyManager } from '../components/ClientHierarchyManager';
import { ClientAssignmentManager } from '../components/ClientAssignmentManager';

interface AdminOrderRow {
  id: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  order_date: string;
  key_account_client_id?: string | null;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
}

interface AdminItemRow {
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

interface PurchaseBreakdownRow {
  name: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

interface PurchaseBreakdownAccumulator extends PurchaseBreakdownRow {
  orderIds: Set<string>;
}

interface BrandPurchaseBreakdown extends PurchaseBreakdownRow {
  clientCount: number;
  variants: PurchaseBreakdownRow[];
  clients: PurchaseBreakdownRow[];
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isDeliveredRevenue(o: { status?: string | null; workflow_status?: string | null }) {
  return o.status === 'fulfilled' && o.workflow_status === 'delivered';
}

function formatCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

function addBreakdownValue(map: Map<string, PurchaseBreakdownAccumulator>, name: string, quantity: number, revenue: number, orderId: string) {
  const existing = map.get(name) || {
    name,
    quantity: 0,
    revenue: 0,
    orderCount: 0,
    orderIds: new Set<string>(),
  };

  existing.quantity += quantity;
  existing.revenue += revenue;
  existing.orderIds.add(orderId);
  existing.orderCount = existing.orderIds.size;
  map.set(name, existing);
}

function toSortedBreakdownRows(map: Map<string, PurchaseBreakdownAccumulator>) {
  return Array.from(map.values())
    .map((row) => ({
      name: row.name,
      quantity: row.quantity,
      revenue: row.revenue,
      orderCount: row.orderIds.size,
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function buildBrandBreakdown(orders: AdminOrderRow[], items: AdminItemRow[]): BrandPurchaseBreakdown[] {
  const deliveredOrderById = new Map(orders.filter(isDeliveredRevenue).map((order) => [order.id, order]));
  const brandMap = new Map<string, {
    name: string;
    quantity: number;
    revenue: number;
    orderIds: Set<string>;
    clientIds: Set<string>;
    variants: Map<string, PurchaseBreakdownAccumulator>;
    clients: Map<string, PurchaseBreakdownAccumulator>;
  }>();

  items.forEach((item) => {
    const order = deliveredOrderById.get(item.purchase_order_id);
    if (!order) return;

    const variant = firstRelation(item.variants);
    const brandName = firstRelation(variant?.brands)?.name || 'Unknown Brand';
    const variantName = variant?.name || 'Unknown Variant';
    const client = firstRelation(order.client);
    const clientName = client?.client_name || 'Unassigned Client';
    const clientKey = order.key_account_client_id || clientName;
    const quantity = Number(item.quantity || 0);
    const revenue = Number(item.total_price ?? quantity * Number(item.unit_price || 0));

    const brand = brandMap.get(brandName) || {
      name: brandName,
      quantity: 0,
      revenue: 0,
      orderIds: new Set<string>(),
      clientIds: new Set<string>(),
      variants: new Map<string, PurchaseBreakdownAccumulator>(),
      clients: new Map<string, PurchaseBreakdownAccumulator>(),
    };

    brand.quantity += quantity;
    brand.revenue += revenue;
    brand.orderIds.add(item.purchase_order_id);
    brand.clientIds.add(clientKey);
    addBreakdownValue(brand.variants, variantName, quantity, revenue, item.purchase_order_id);
    addBreakdownValue(brand.clients, clientName, quantity, revenue, item.purchase_order_id);
    brandMap.set(brandName, brand);
  });

  return Array.from(brandMap.values())
    .map((brand) => ({
      name: brand.name,
      quantity: brand.quantity,
      revenue: brand.revenue,
      orderCount: brand.orderIds.size,
      clientCount: brand.clientIds.size,
      variants: toSortedBreakdownRows(brand.variants),
      clients: toSortedBreakdownRows(brand.clients),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10);
}

export function SalesAdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [stats, setStats] = useState({
    totalDirectors: 0,
    totalKAMs: 0,
    totalClients: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0
  });
  const [revenueData, setRevenueData] = useState<{ month: string; revenue: number }[]>([]);
  const [brandBreakdown, setBrandBreakdown] = useState<BrandPurchaseBreakdown[]>([]);
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedBrand = useMemo(
    () => brandBreakdown.find((brand) => brand.name === selectedBrandName) || brandBreakdown[0] || null,
    [brandBreakdown, selectedBrandName]
  );

  const maxBrandQuantity = brandBreakdown[0]?.quantity || 1;
  const maxVariantQuantity = selectedBrand?.variants[0]?.quantity || 1;
  const maxClientQuantity = selectedBrand?.clients[0]?.quantity || 1;

  useEffect(() => {
    fetchAdminData();
  }, [selectedYear]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // Get company users by role
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('role')
        .eq('company_id', user?.company_id)
        .in('role', ['sales_director', 'key_account_manager']);

      if (usersError) throw usersError;

      const directors = users?.filter(u => u.role === 'sales_director').length || 0;
      const kams = users?.filter(u => u.role === 'key_account_manager').length || 0;

      // Get clients count
      const { count: clientCount } = await supabase
        .from('key_account_clients')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', user?.company_id)
        .eq('status', 'active');

      // Get orders and revenue
      const { data: orders, error: ordersError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          total_amount,
          status,
          workflow_status,
          order_date,
          key_account_client_id,
          client:key_account_clients(client_name)
        `)
        .eq('company_id', user?.company_id)
        .gte('order_date', `${selectedYear}-01-01`)
        .lte('order_date', `${selectedYear}-12-31`);

      if (ordersError) throw ordersError;

      const orderRows = (orders || []) as AdminOrderRow[];
      const deliveredOrderIds = orderRows.filter(isDeliveredRevenue).map((order) => order.id);
      let deliveredItems: AdminItemRow[] = [];

      if (deliveredOrderIds.length > 0) {
        const { data: itemData, error: itemError } = await supabase
          .from('purchase_order_items')
          .select(`
            purchase_order_id,
            quantity,
            unit_price,
            total_price,
            variants (
              name,
              brands (name)
            )
          `)
          .in('purchase_order_id', deliveredOrderIds);

        if (itemError) throw itemError;
        deliveredItems = (itemData || []) as AdminItemRow[];
      }

      const nextBrandBreakdown = buildBrandBreakdown(orderRows, deliveredItems);
      setBrandBreakdown(nextBrandBreakdown);
      setSelectedBrandName((current) => (
        current && nextBrandBreakdown.some((brand) => brand.name === current)
          ? current
          : nextBrandBreakdown[0]?.name ?? null
      ));

      const deliveredRevenue =
        orderRows
          .filter(isDeliveredRevenue)
          .reduce((sum: number, o: AdminOrderRow) => sum + (o.total_amount || 0), 0) || 0;

      const pendingCount = orderRows.filter((o: AdminOrderRow) => o.workflow_status === 'kam_pending' ||
      o.workflow_status === 'director_pending' ||
      o.workflow_status === 'admin_pending').length || 0;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const revenueByMonth: Record<string, number> = {};
      monthNames.forEach(m => {
        revenueByMonth[m] = 0;
      });

      orderRows.forEach((o: AdminOrderRow) => {
        if (!isDeliveredRevenue(o)) return;
        const month = monthNames[new Date(o.order_date).getMonth()];
        revenueByMonth[month] += o.total_amount || 0;
      });

      setRevenueData(
        monthNames.map(month => ({
          month,
          revenue: revenueByMonth[month]
        }))
      );

      setStats({
        totalDirectors: directors,
        totalKAMs: kams,
        totalClients: clientCount || 0,
        totalOrders: orderRows.length,
        totalRevenue: deliveredRevenue,
        pendingOrders: pendingCount
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-3xl font-bold">Key Account Management</h1>
          <div className="text-muted-foreground flex items-center flex-wrap gap-2">
            <span>Welcome, {user?.full_name}</span>
            <Badge variant="secondary">
              <Shield className="h-3 w-3 mr-1" />
              {getKeyAccountRoleLabel(user?.role)}
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
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Directors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDirectors}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              KAMs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalKAMs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Delivered revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Fulfilled or delivered POs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.pendingOrders}</div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Revenue Overview
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-normal text-muted-foreground text-right sm:block">
              Fulfilled POs, delivered workflow
            </span>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-9 w-[120px]">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const revenue = payload.find(p => p.dataKey === 'revenue')?.value as number || 0;
                    return (
                      <div className="bg-white border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold mb-2">{label}</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                            <span>Delivered revenue: ₱{revenue.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="revenue" fill="#3b82f6" name="Delivered revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Product Purchase Breakdown */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top 10 Buying Brands
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Based on delivered PO item quantity for {selectedYear}.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {brandBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No delivered brand purchases yet.</p>
            ) : (
              brandBreakdown.map((brand, index) => {
                const isSelected = selectedBrand?.name === brand.name;
                const width = `${Math.max(4, (brand.quantity / maxBrandQuantity) * 100)}%`;

                return (
                  <button
                    key={brand.name}
                    type="button"
                    onClick={() => setSelectedBrandName(brand.name)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:border-primary/60 hover:bg-muted/50 ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {index + 1}. {brand.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {brand.orderCount} delivered POs • {brand.clientCount} clients
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{brand.quantity.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(brand.revenue)}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary" style={{ width }} />
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Top Variants
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {selectedBrand ? `Most bought variants for ${selectedBrand.name}.` : 'Select a brand to view variants.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedBrand || selectedBrand.variants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No variants to show.</p>
            ) : (
              selectedBrand.variants.slice(0, 10).map((variant, index) => {
                const width = `${Math.max(4, (variant.quantity / maxVariantQuantity) * 100)}%`;

                return (
                  <div key={variant.name} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {index + 1}. {variant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{variant.orderCount} delivered POs</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{variant.quantity.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(variant.revenue)}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-blue-500" style={{ width }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top Buying Clients
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {selectedBrand ? `Clients buying ${selectedBrand.name} the most.` : 'Select a brand to view clients.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedBrand || selectedBrand.clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients to show.</p>
            ) : (
              selectedBrand.clients.slice(0, 10).map((client, index) => {
                const width = `${Math.max(4, (client.quantity / maxClientQuantity) * 100)}%`;

                return (
                  <div key={client.name} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {index + 1}. {client.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{client.orderCount} delivered POs</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{client.quantity.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(client.revenue)}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
    </div>
  );
}
