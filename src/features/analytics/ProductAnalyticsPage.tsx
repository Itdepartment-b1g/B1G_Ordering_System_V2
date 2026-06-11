import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Package,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  FileDown,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
} from '@/lib/dateRangePresets';
import { exportProductAnalyticsExcel } from '@/features/analytics/exportProductAnalyticsExcel';
import { useToast } from '@/hooks/use-toast';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface ProductPerformance {
  brand: string;
  variant: string;
  orders: number;
  quantity: number;
  revenue: number;
  approvedOrders: number;
  approvedQuantity: number;
  approvedRevenue: number;
  pendingOrders: number;
  pendingQuantity: number;
  pendingRevenue: number;
  trend: 'up' | 'down' | 'stable';
}

const PRODUCTS_PER_PAGE = 10;

/** Match Order List: approved via status or final admin stage */
const getProductOrderStatusBucket = (
  status?: string,
  stage?: string
): 'approved' | 'pending' | null => {
  if (status === 'approved' || stage === 'admin_approved') return 'approved';
  if (status === 'pending') return 'pending';
  return null;
};

export default function ProductAnalyticsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [selectedProductRevenue, setSelectedProductRevenue] = useState<ProductPerformance | null>(
    null
  );

  const orderDateRange = useMemo(
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

  const fetchProductPerformance = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = orderDateRange;

      let orderItemsQuery = supabase
        .from('client_order_items')
        .select(`
          quantity,
          unit_price,
          client_orders!inner(status, stage, created_at, agent_id, company_id),
          variants!inner(
            name,
            variant_type,
            brands!inner(name)
          )
        `);

      if (start) {
        orderItemsQuery = orderItemsQuery.gte(
          'client_orders.created_at',
          startOfDay(start).toISOString()
        );
      }
      if (end) {
        orderItemsQuery = orderItemsQuery.lte(
          'client_orders.created_at',
          endOfDay(end).toISOString()
        );
      }

      const { data: orderItems, error } = await orderItemsQuery;
      if (error) throw error;

      let filteredOrderItems = (orderItems || []).filter((item: any) => {
        const bucket = getProductOrderStatusBucket(
          item.client_orders?.status,
          item.client_orders?.stage
        );
        return bucket !== null;
      });

      if (user?.company_id) {
        filteredOrderItems = filteredOrderItems.filter(
          (item: any) => item.client_orders?.company_id === user.company_id
        );
      }

      const currentMonthStart = startOfMonth(new Date());
      const prevMonthStart = startOfMonth(subMonths(new Date(), 1));
      const prevMonthEnd = endOfMonth(subMonths(new Date(), 1));

      const productMap = new Map<
        string,
        {
          brand: string;
          variant: string;
          approvedOrders: number;
          approvedQuantity: number;
          approvedRevenue: number;
          pendingOrders: number;
          pendingQuantity: number;
          pendingRevenue: number;
          currentMonthOrders: number;
          prevMonthOrders: number;
        }
      >();

      filteredOrderItems.forEach((item: any) => {
        const brand = item.variants?.brands?.name || 'Unknown';
        const variant = item.variants?.name || 'Unknown';
        const key = `${brand}|${variant}`;
        const qty = item.quantity || 0;
        const lineRevenue = qty * (item.unit_price || 0);
        const status = item.client_orders?.status as string | undefined;
        const stage = item.client_orders?.stage as string | undefined;
        const createdAt = item.client_orders?.created_at as string | undefined;
        const bucket = getProductOrderStatusBucket(status, stage);

        if (!productMap.has(key)) {
          productMap.set(key, {
            brand,
            variant,
            approvedOrders: 0,
            approvedQuantity: 0,
            approvedRevenue: 0,
            pendingOrders: 0,
            pendingQuantity: 0,
            pendingRevenue: 0,
            currentMonthOrders: 0,
            prevMonthOrders: 0,
          });
        }

        const productData = productMap.get(key)!;

        if (bucket === 'approved') {
          productData.approvedOrders += 1;
          productData.approvedQuantity += qty;
          productData.approvedRevenue += lineRevenue;
        } else if (bucket === 'pending') {
          productData.pendingOrders += 1;
          productData.pendingQuantity += qty;
          productData.pendingRevenue += lineRevenue;
        }

        if (createdAt) {
          const orderDate = new Date(createdAt);
          if (orderDate >= currentMonthStart) {
            productData.currentMonthOrders += 1;
          } else if (orderDate >= prevMonthStart && orderDate <= prevMonthEnd) {
            productData.prevMonthOrders += 1;
          }
        }
      });

      const productPerformanceData: ProductPerformance[] = Array.from(productMap.values()).map(
        (data) => {
          const orders = data.approvedOrders + data.pendingOrders;
          const quantity = data.approvedQuantity + data.pendingQuantity;
          const revenue = data.approvedRevenue + data.pendingRevenue;

          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (data.currentMonthOrders > data.prevMonthOrders) trend = 'up';
          else if (data.currentMonthOrders < data.prevMonthOrders) trend = 'down';

          return {
            brand: data.brand,
            variant: data.variant,
            orders,
            quantity,
            revenue,
            approvedOrders: data.approvedOrders,
            approvedQuantity: data.approvedQuantity,
            approvedRevenue: data.approvedRevenue,
            pendingOrders: data.pendingOrders,
            pendingQuantity: data.pendingQuantity,
            pendingRevenue: data.pendingRevenue,
            trend,
          };
        }
      );

      productPerformanceData.sort((a, b) => b.revenue - a.revenue);
      setProductPerformance(productPerformanceData);
    } catch (error) {
      console.error('Error fetching product performance:', error);
      toast({
        title: 'Error',
        description: 'Failed to load product analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [orderDateRange, user?.company_id, toast]);

  useEffect(() => {
    if (user?.role === 'accounting') {
      fetchProductPerformance();
    }
  }, [user?.role, fetchProductPerformance]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return productPerformance;
    const q = searchQuery.toLowerCase().trim();
    return productPerformance.filter(
      (p) =>
        p.brand.toLowerCase().includes(q) ||
        p.variant.toLowerCase().includes(q)
    );
  }, [productPerformance, searchQuery]);

  const handleExportExcel = useCallback(async () => {
    if (!filteredProducts.length) {
      toast({
        title: 'No data to export',
        description: 'No product data for the selected date range.',
        variant: 'destructive',
      });
      return;
    }

    const { start, end } = orderDateRange;
    const periodStart = start ? formatDateForInput(start) : 'all';
    const periodEnd = end ? formatDateForInput(end) : 'all';

    setExporting(true);
    try {
      await exportProductAnalyticsExcel(filteredProducts, {
        dateRangeLabel,
        periodStart,
        periodEnd,
      });
      toast({
        title: 'Export successful',
        description: `Exported ${filteredProducts.length} product row(s) for ${dateRangeLabel}.`,
      });
    } catch (error) {
      console.error('Product analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate the Excel file.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [filteredProducts, dateRangeLabel, orderDateRange, toast]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const endIndex = startIndex + PRODUCTS_PER_PAGE;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateRangeFilter, productPerformance.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (user?.role !== 'accounting') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p className="text-muted-foreground">This page is for Accounting users only.</p>
      </div>
    );
  }

  if (loading && productPerformance.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalUnits = productPerformance.reduce((sum, p) => sum + p.quantity, 0);
  const totalRevenue = productPerformance.reduce((sum, p) => sum + p.revenue, 0);
  const totalApprovedRevenue = productPerformance.reduce((sum, p) => sum + p.approvedRevenue, 0);
  const totalPendingRevenue = productPerformance.reduce((sum, p) => sum + p.pendingRevenue, 0);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Product Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Approved and pending client orders by line item — {dateRangeLabel}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
          <DateRangeFilterPopover
            value={dateRangeFilter}
            onChange={setDateRangeFilter}
            triggerClassName="w-full sm:w-[220px] justify-between h-10"
            align="end"
          />
          <Button
            variant="outline"
            className="h-10 gap-2"
            onClick={handleExportExcel}
            disabled={exporting || loading || filteredProducts.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Export Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{productPerformance.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Units Sold</CardTitle>
            <CardDescription className="text-xs">Approved + pending line items</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <CardDescription className="text-xs">
              Approved ₱{totalApprovedRevenue.toLocaleString()} · Pending ₱
              {totalPendingRevenue.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₱{totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Top Products by Revenue</CardTitle>
            <CardDescription>
              Approved vs pending revenue (order status) — top 10 products
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : productPerformance.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">
                No product data for the selected period
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={productPerformance.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="variant"
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const approved =
                        (payload.find((p) => p.dataKey === 'approvedRevenue')?.value as number) ||
                        0;
                      const pending =
                        (payload.find((p) => p.dataKey === 'pendingRevenue')?.value as number) ||
                        0;
                      const total = approved + pending;
                      return (
                        <div className="bg-background border rounded-lg p-3 shadow-lg">
                          <p className="font-semibold text-sm mb-2">{label}</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-blue-500" />
                              <span className="text-muted-foreground">Approved:</span>
                              <span className="font-medium">₱{approved.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-orange-500" />
                              <span className="text-muted-foreground">Pending:</span>
                              <span className="font-medium">₱{pending.toLocaleString()}</span>
                            </div>
                            <div className="border-t pt-1 mt-2 flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-green-500" />
                              <span className="font-semibold">Total:</span>
                              <span className="font-bold text-green-600 dark:text-green-400">
                                ₱{total.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value: string) =>
                      value === 'approvedRevenue' ? 'Approved' : 'Pending'
                    }
                  />
                  <Bar dataKey="approvedRevenue" fill="#3b82f6" name="approvedRevenue" />
                  <Bar dataKey="pendingRevenue" fill="#f97316" name="pendingRevenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Product Performance Details</CardTitle>
              <CardDescription>
                Line-item counts; click total revenue for approved / pending breakdown
              </CardDescription>
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search brand or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No products match your search.' : 'No product data available'}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Units Sold</TableHead>
                        <TableHead className="text-right">Pending Orders</TableHead>
                        <TableHead className="text-right">Pending Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-center">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedProducts.map((product, index) => (
                        <TableRow key={`${product.brand}-${product.variant}-${index}`}>
                          <TableCell className="font-medium">{product.brand}</TableCell>
                          <TableCell>{product.variant}</TableCell>
                          <TableCell className="text-right">{product.orders}</TableCell>
                          <TableCell className="text-right">
                            {product.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-orange-600 dark:text-orange-400">
                            {product.pendingOrders}
                          </TableCell>
                          <TableCell className="text-right text-orange-600 dark:text-orange-400">
                            {product.pendingQuantity}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <button
                              type="button"
                              className="text-primary hover:underline underline-offset-2"
                              onClick={() => {
                                setSelectedProductRevenue(product);
                                setRevenueDialogOpen(true);
                              }}
                            >
                              ₱{product.revenue.toLocaleString()}
                            </button>
                          </TableCell>
                          <TableCell className="text-center">
                            {product.trend === 'up' && (
                              <Badge className="bg-green-100 text-green-800">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Rising
                              </Badge>
                            )}
                            {product.trend === 'down' && (
                              <Badge className="bg-red-100 text-red-800">
                                <TrendingDown className="h-3 w-3 mr-1" />
                                Falling
                              </Badge>
                            )}
                            {product.trend === 'stable' && (
                              <Badge variant="outline">Stable</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {startIndex + 1}–{Math.min(endIndex, filteredProducts.length)} of{' '}
                      {filteredProducts.length}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revenue breakdown</DialogTitle>
            <DialogDescription>
              {selectedProductRevenue
                ? `${selectedProductRevenue.brand} — ${selectedProductRevenue.variant} (${dateRangeLabel})`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {selectedProductRevenue && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  Approved revenue
                </span>
                <span className="font-semibold">
                  ₱{selectedProductRevenue.approvedRevenue.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  Pending revenue
                </span>
                <span className="font-semibold">
                  ₱{selectedProductRevenue.pendingRevenue.toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  Total revenue
                </span>
                <span className="text-lg font-bold text-green-600 dark:text-green-400">
                  ₱{selectedProductRevenue.revenue.toLocaleString()}
                </span>
              </div>
              <div className="border-t pt-3 space-y-1.5 text-muted-foreground text-xs">
                <div className="flex justify-between">
                  <span>Approved line items / units</span>
                  <span>
                    {selectedProductRevenue.approvedOrders} /{' '}
                    {selectedProductRevenue.approvedQuantity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pending line items / units</span>
                  <span>
                    {selectedProductRevenue.pendingOrders} /{' '}
                    {selectedProductRevenue.pendingQuantity}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
