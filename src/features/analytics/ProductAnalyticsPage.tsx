import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, Loader2, Search, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '@/features/auth';
import { useOrders, type Order } from '@/features/orders/OrderContext';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
  isDateInRange,
} from '@/lib/dateRangePresets';
import { exportClientsToExcel } from '@/lib/excel.helpers';
import { useToast } from '@/hooks/use-toast';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';

interface ProductPerformance {
  brand: string;
  variant: string;
  orders: number;
  quantity: number;
  revenue: number;
}

interface RawOrderItemRow {
  brand: string;
  variant: string;
  quantity: number;
  unitPrice: number;
  orderDate: string;
}

const PRODUCTS_PER_PAGE = 10;

/** Same approved definition as Order List → Approved tab */
function isApprovedOrder(order: Order): boolean {
  return order.status === 'approved' || order.stage === 'admin_approved';
}

function aggregateProducts(items: RawOrderItemRow[]): ProductPerformance[] {
  const productMap = new Map<
    string,
    { brand: string; variant: string; orders: number; quantity: number; revenue: number }
  >();

  items.forEach((item) => {
    const key = `${item.brand}|${item.variant}`;
    if (!productMap.has(key)) {
      productMap.set(key, {
        brand: item.brand,
        variant: item.variant,
        orders: 0,
        quantity: 0,
        revenue: 0,
      });
    }
    const productData = productMap.get(key)!;
    productData.orders += 1;
    productData.quantity += item.quantity;
    productData.revenue += item.quantity * item.unitPrice;
  });

  const result = Array.from(productMap.values());
  result.sort((a, b) => b.revenue - a.revenue);
  return result;
}

export default function ProductAnalyticsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { orders, loading } = useOrders();
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });

  const orderDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  /** Approved orders in the selected period — same filters as Order List */
  const approvedInRange = useMemo(() => {
    return orders.filter(
      (o) =>
        isApprovedOrder(o) &&
        isDateInRange(o.date, orderDateRange.start, orderDateRange.end)
    );
  }, [orders, orderDateRange.start, orderDateRange.end]);

  const productPerformance = useMemo(() => {
    const rows: RawOrderItemRow[] = [];
    for (const order of approvedInRange) {
      for (const item of order.items) {
        rows.push({
          brand: item.brandName,
          variant: item.variantName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          orderDate: order.date,
        });
      }
    }
    return aggregateProducts(rows);
  }, [approvedInRange]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return productPerformance;
    const q = searchQuery.toLowerCase().trim();
    return productPerformance.filter(
      (p) =>
        p.brand.toLowerCase().includes(q) ||
        p.variant.toLowerCase().includes(q)
    );
  }, [productPerformance, searchQuery]);

  const dateRangeLabel = useMemo(
    () =>
      getDatePresetLabel(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const handleExportCsv = useCallback(async () => {
    if (!filteredProducts.length) {
      toast({
        title: 'No data to export',
        description: 'No approved product data for the selected date range.',
        variant: 'destructive',
      });
      return;
    }

    const periodStart = orderDateRange.start
      ? formatDateForInput(orderDateRange.start)
      : 'all';
    const periodEnd = orderDateRange.end ? formatDateForInput(orderDateRange.end) : 'all';

    const exportData = filteredProducts.map((p) => ({
      date_range: dateRangeLabel,
      period_start: periodStart,
      period_end: periodEnd,
      brand: p.brand,
      product: p.variant,
      orders: p.orders,
      quantity: p.quantity,
      revenue: p.revenue,
    }));

    const exportUnits = filteredProducts.reduce((sum, p) => sum + p.quantity, 0);
    const exportLineRevenue = filteredProducts.reduce((sum, p) => sum + p.revenue, 0);
    exportData.push({
      date_range: dateRangeLabel,
      period_start: periodStart,
      period_end: periodEnd,
      brand: '',
      product: 'TOTAL',
      orders: filteredProducts.reduce((sum, p) => sum + p.orders, 0),
      quantity: exportUnits,
      revenue: exportLineRevenue,
    });

    const slug =
      dateRangeFilter.preset === 'custom'
        ? `${periodStart}_to_${periodEnd}`
        : dateRangeFilter.preset;

    setExporting(true);
    try {
      await exportClientsToExcel(
        exportData,
        undefined,
        `product_analytics_${slug}_${new Date().toISOString().split('T')[0]}.csv`
      );
      toast({
        title: 'Export successful',
        description: `Exported ${filteredProducts.length} product row(s) for ${dateRangeLabel}.`,
      });
    } catch (error) {
      console.error('Product analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate the CSV file.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [
    filteredProducts,
    dateRangeLabel,
    orderDateRange.start,
    orderDateRange.end,
    dateRangeFilter.preset,
    toast,
  ]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalUnits = productPerformance.reduce((sum, p) => sum + p.quantity, 0);
  /** Sum of order totals (tax/discount included) — matches Order List approved rows */
  const totalRevenue = approvedInRange.reduce((sum, o) => sum + o.total, 0);

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
              Approved orders by brand and variant. Revenue matches Order List totals for the same
              date range.
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
            onClick={handleExportCsv}
            disabled={exporting || loading || filteredProducts.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Export CSV
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
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalUnits.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <CardDescription className="text-xs">
              Sum of approved order totals ({approvedInRange.length} order
              {approvedInRange.length === 1 ? '' : 's'})
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
            <CardDescription>Line-item revenue from approved orders in selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {productPerformance.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">
                No approved orders with line items in this period.
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
                  <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue (₱)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-4">
            <div>
              <CardTitle>Product Performance Details</CardTitle>
              <CardDescription>Breakdown by brand and variant</CardDescription>
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
            {filteredProducts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No products match your search.' : 'No product data available.'}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
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
                          <TableCell className="text-right">
                            ₱{product.revenue.toLocaleString()}
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
    </div>
  );
}
