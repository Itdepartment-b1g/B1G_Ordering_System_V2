import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2,
  Shield,
  TrendingUp,
  ShoppingCart,
  BarChart3,
  Package,
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
import { getKeyAccountRoleLabel } from '@/features/key-accounts/keyAccountRoles';
import { KeyAccountDashboardRevenueCard } from './KeyAccountDashboardRevenueCard';
import { KeyAccountDashboardRevenueOverview } from './KeyAccountDashboardRevenueOverview';
import {
  EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE,
  formatKeyAccountDashboardCurrency,
} from './keyAccountDashboardRevenue';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchKADashboardOverview,
  fetchKADashboardPurchaseBreakdown,
} from '@/store/slices/key-accounts/dashboard';

export function SalesAdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(null);
  const [breakdownDateRangeFilter, setBreakdownDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'this_year',
  });

  const overview = useAppSelector((state) => state.kaDashboard.overview);
  const overviewStatus = useAppSelector((state) => state.kaDashboard.overviewStatus);
  const overviewError = useAppSelector((state) => state.kaDashboard.overviewError);
  const brandBreakdown = useAppSelector((state) => state.kaDashboard.brands);
  const breakdownStatus = useAppSelector((state) => state.kaDashboard.breakdownStatus);
  const breakdownError = useAppSelector((state) => state.kaDashboard.breakdownError);

  const breakdownDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        breakdownDateRangeFilter.preset,
        breakdownDateRangeFilter.customStart,
        breakdownDateRangeFilter.customEnd
      ),
    [breakdownDateRangeFilter]
  );

  const breakdownDateRangeLabel = useMemo(
    () =>
      getDatePresetLabel(
        breakdownDateRangeFilter.preset,
        breakdownDateRangeFilter.customStart,
        breakdownDateRangeFilter.customEnd
      ),
    [breakdownDateRangeFilter]
  );

  const selectedBrand = useMemo(
    () => brandBreakdown.find((brand) => brand.name === selectedBrandName) || brandBreakdown[0] || null,
    [brandBreakdown, selectedBrandName]
  );

  const maxBrandQuantity = brandBreakdown[0]?.quantity || 1;
  const maxVariantQuantity = selectedBrand?.variants[0]?.quantity || 1;
  const maxClientQuantity = selectedBrand?.clients[0]?.quantity || 1;
  const stats = overview?.stats;
  const revenueMetrics = overview?.revenue || EMPTY_KEY_ACCOUNT_DASHBOARD_REVENUE;
  const loading = overviewStatus === 'loading' || overviewStatus === 'idle';
  const breakdownLoading = breakdownStatus === 'loading' || breakdownStatus === 'idle';

  useEffect(() => {
    void dispatch(fetchKADashboardOverview(selectedYear));
  }, [dispatch, selectedYear]);

  useEffect(() => {
    void dispatch(
      fetchKADashboardPurchaseBreakdown({
        dateStart: breakdownDateRange.start ? formatDateForInput(breakdownDateRange.start) : undefined,
        dateEnd: breakdownDateRange.end ? formatDateForInput(breakdownDateRange.end) : undefined,
      })
    );
  }, [dispatch, breakdownDateRange.start, breakdownDateRange.end]);

  useEffect(() => {
    if (overviewStatus !== 'failed' || !overviewError) return;
    toast({ variant: 'destructive', title: 'Error', description: overviewError });
  }, [overviewStatus, overviewError, toast]);

  useEffect(() => {
    if (breakdownStatus !== 'failed' || !breakdownError) return;
    toast({ variant: 'destructive', title: 'Error', description: breakdownError });
  }, [breakdownStatus, breakdownError, toast]);

  useEffect(() => {
    setSelectedBrandName((current) =>
      current && brandBreakdown.some((brand) => brand.name === current)
        ? current
        : brandBreakdown[0]?.name ?? null
    );
  }, [brandBreakdown]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
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
            {[2024, 2025, 2026].map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
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
            <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Consignment POs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-sky-600">{stats?.consignmentOrders || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Float value {formatKeyAccountDashboardCurrency(revenueMetrics.summary.consignmentRevenue)}
            </p>
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
            <div className="text-2xl font-bold text-amber-600">{stats?.pendingOrders || 0}</div>
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
      </div>

      <KeyAccountDashboardRevenueOverview
        monthlyData={revenueMetrics.monthlyData}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        orders={revenueMetrics.orders}
        payments={revenueMetrics.payments}
      />

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product Purchase Breakdown</h2>
            <p className="text-sm text-muted-foreground">
              Same POs as Revenue Overview (pending through delivered; excludes cancelled/rejected).
              Ranked by total item quantity, then PO count. PO order date: {breakdownDateRangeLabel}.
            </p>
          </div>
          <DateRangeFilterPopover
            value={breakdownDateRangeFilter}
            onChange={setBreakdownDateRangeFilter}
            triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
            align="end"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top 10 Buying Brands
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Top 10 brands by units ordered on sales POs ({breakdownDateRangeLabel}).
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {breakdownLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : brandBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No brand purchases in this range yet.</p>
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
                            {brand.clientCount} client{brand.clientCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{brand.quantity.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {brand.orderCount} PO{brand.orderCount === 1 ? '' : 's'}
                          </p>
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
                {selectedBrand
                  ? `Top 10 variants for ${selectedBrand.name} by units sold (${breakdownDateRangeLabel}).`
                  : 'Select a brand to view variants.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {breakdownLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : !selectedBrand || selectedBrand.variants.length === 0 ? (
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
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{variant.quantity.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {variant.orderCount} PO{variant.orderCount === 1 ? '' : 's'}
                          </p>
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
                {selectedBrand
                  ? `Top 10 clients for ${selectedBrand.name} by units bought (${breakdownDateRangeLabel}).`
                  : 'Select a brand to view clients.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {breakdownLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : !selectedBrand || selectedBrand.clients.length === 0 ? (
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
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">{client.quantity.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.orderCount} PO{client.orderCount === 1 ? '' : 's'}
                          </p>
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
      </div>
    </div>
  );
}
