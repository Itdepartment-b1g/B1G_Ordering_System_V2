import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Building2,
  FileDown,
  Layers,
  Loader2,
  MapPin,
  Package,
  TrendingDown,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import { useToast } from '@/hooks/use-toast';
import KeyAccountKamAnalyticsTab from './KeyAccountKamAnalyticsTab';
import KeyAccountClientAnalyticsTab from './KeyAccountClientAnalyticsTab';
import KeyAccountCityAnalyticsTab from './KeyAccountCityAnalyticsTab';
import KeyAccountComboAnalyticsTab from './KeyAccountComboAnalyticsTab';
import KeyAccountFsnAnalyticsTab from './KeyAccountFsnAnalyticsTab';
import { exportKeyAccountProductAnalyticsExcel } from './exportKeyAccountProductAnalyticsExcel';
import {
  buildKeyAccountProductPoBreakdownRows,
  KeyAccountProductPoBreakdownDialog,
} from './KeyAccountProductPoBreakdownDialog';
import { KeyAccountBrandVariantsDialog } from './KeyAccountBrandVariantsDialog';
import {
  fetchKeyAccountDashboardPaidByOrderId,
  fetchKeyAccountDashboardPayments,
  type KeyAccountDashboardPaymentRow,
} from '../dashboard/keyAccountDashboardRevenue';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
  isDateInRange,
} from '@/lib/dateRangePresets';
import { isRebateDerivedPurchaseOrder } from '../rebates/keyAccountRebateShared';
import {
  buildKeyAccountBrandAnalyticsRows,
  buildKeyAccountProductAnalyticsRows,
  buildRebateCreditDeductionByPurchaseOrderId,
  buildRebateDeductionByPoItemId,
  buildRebateSwapByPoItemId,
  firstRelation,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountCommercialProductAnalyticsOrder,
  isKeyAccountPartialDeliveredOrder,
  normalizeRebateReplacements,
  rebateResolutionHasReplacement,
  type KeyAccountBrandAnalyticsRow,
  type KeyAccountProductAnalyticsRow,
  type KeyAccountRebateAnalyticsRecord,
  warehouseTransferLocationStatusKey,
  warehouseTransferReservationKey,
} from './keyAccountAnalyticsShared';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';

interface KeyAccountShopRelation {
  id: string;
  shop_name: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
}

interface KeyAccountAddressRelation {
  city: string | null;
  province: string | null;
  region: string | null;
}

interface KeyAccountOrder {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  fulfillment_type?: string | null;
  warehouse_location_id?: string | null;
  kam_id: string | null;
  key_account_client_id: string | null;
  key_account_shop_id?: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
  analytics_only?: boolean;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  shop?: KeyAccountShopRelation | KeyAccountShopRelation[] | null;
  address?: KeyAccountAddressRelation | KeyAccountAddressRelation[] | null;
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
  variant_id: string;
  warehouse_location_id?: string | null;
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

interface WarehouseTransferReservationRow {
  purchase_order_id: string;
  warehouse_location_id: string;
  variant_id: string;
  quantity_reserved: number;
  quantity_fulfilled: number;
}

interface WarehouseTransferLocationStatusRow {
  purchase_order_id: string;
  warehouse_location_id: string;
  status: string;
}

function formatCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

export default function KeyAccountAnalyticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<KeyAccountOrder[]>([]);
  const [items, setItems] = useState<PurchaseOrderItemRow[]>([]);
  const [transferReservations, setTransferReservations] = useState<WarehouseTransferReservationRow[]>([]);
  const [transferLocationStatuses, setTransferLocationStatuses] = useState<
    WarehouseTransferLocationStatusRow[]
  >([]);
  const [people, setPeople] = useState<KeyAccountPerson[]>([]);
  const [clients, setClients] = useState<KeyAccountClient[]>([]);
  const [rebates, setRebates] = useState<KeyAccountRebateAnalyticsRecord[]>([]);
  const [paidByOrderId, setPaidByOrderId] = useState<Map<string, number>>(new Map());
  const [paymentRows, setPaymentRows] = useState<KeyAccountDashboardPaymentRow[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'this_year',
  });
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [productTablePage, setProductTablePage] = useState(1);
  const [productExporting, setProductExporting] = useState(false);
  const [selectedProductRevenue, setSelectedProductRevenue] = useState<KeyAccountProductAnalyticsRow | null>(null);
  const [productRevenueDialogOpen, setProductRevenueDialogOpen] = useState(false);
  const [selectedBrandRow, setSelectedBrandRow] = useState<KeyAccountBrandAnalyticsRow | null>(null);
  const [brandVariantsDialogOpen, setBrandVariantsDialogOpen] = useState(false);

  useEffect(() => {
    void fetchAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.company_id]);

  const fetchAnalytics = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const [nextOrders, peopleResult, clientsResult] = await Promise.all([
        fetchAllPaginated<KeyAccountOrder>(async (from, to) => {
          const { data, error } = await supabase
            .from('purchase_orders')
            .select(`
              id,
              po_number,
              order_date,
              total_amount,
              status,
              workflow_status,
              po_order_kind,
              source_rebate_id,
              fulfillment_type,
              warehouse_location_id,
              kam_id,
              key_account_client_id,
              key_account_shop_id,
              key_account_payment_status,
              key_account_payment_mode,
              client:key_account_clients(client_name),
              shop:key_account_shops(id, shop_name, city, province, region),
              address:key_account_delivery_addresses(city, province, region),
              kam:profiles!purchase_orders_kam_id_fkey(full_name,email,role)
            `)
            .eq('company_id', user.company_id)
            .eq('company_account_type', 'Key Accounts')
            .order('order_date', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to);
          return { data: (data as KeyAccountOrder[] | null) ?? null, error };
        }),
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

      if (peopleResult.error) throw peopleResult.error;
      if (clientsResult.error) throw clientsResult.error;
      const productAnalyticsOrderIds = nextOrders
        .filter(isKeyAccountCommercialProductAnalyticsOrder)
        .map((order) => order.id);
      let nextItems: PurchaseOrderItemRow[] = [];

      if (productAnalyticsOrderIds.length > 0) {
        const { data: itemData, error: itemError } = await supabase
          .from('purchase_order_items')
          .select(`
            id,
            purchase_order_id,
            variant_id,
            warehouse_location_id,
            quantity,
            unit_price,
            total_price,
            variants:variant_id (
              name,
              variant_type,
              brands:brand_id (name)
            )
          `)
          .in('purchase_order_id', productAnalyticsOrderIds);

        if (itemError) throw itemError;
        nextItems = (itemData || []) as PurchaseOrderItemRow[];
      }

      const salesOrderIds = nextOrders.map((order) => order.id);
      const nextPaymentRows = await fetchKeyAccountDashboardPayments(supabase, salesOrderIds);
      const nextPaidByOrderId = await fetchKeyAccountDashboardPaidByOrderId(supabase, salesOrderIds);

      const sourcePoIdsForRebates = nextOrders
        .filter((order) => !isRebateDerivedPurchaseOrder(order))
        .map((order) => order.id);
      let nextRebates: KeyAccountRebateAnalyticsRecord[] = [];

      if (sourcePoIdsForRebates.length > 0) {
        const { data: rebateData, error: rebateError } = await supabase
          .from('key_account_po_rebates')
          .select(`
            id,
            purchase_order_id,
            resolution_type,
            status,
            credit_amount,
            disputed_total,
            fulfillment_purchase_order_id,
            lines:key_account_po_rebate_lines(
              purchase_order_item_id,
              line_total,
              disputed_quantity
            ),
            replacements:key_account_po_rebate_replacements(
              variant_id,
              warehouse_location_id,
              quantity,
              total_price,
              variants:variant_id (
                name,
                brands:brand_id (name)
              )
            )
          `)
          .in('purchase_order_id', sourcePoIdsForRebates)
          .in('status', ['submitted', 'approved', 'executed']);

        if (rebateError) throw rebateError;
        nextRebates = (rebateData || []) as KeyAccountRebateAnalyticsRecord[];
      }

      const reservationPoIds = new Set(
        nextOrders.filter(isKeyAccountPartialDeliveredOrder).map((order) => order.id)
      );
      nextRebates.forEach((rebate) => {
        if (!rebateResolutionHasReplacement(rebate.resolution_type)) return;
        if (rebate.fulfillment_purchase_order_id) {
          reservationPoIds.add(rebate.fulfillment_purchase_order_id);
        }
      });

      let nextReservations: WarehouseTransferReservationRow[] = [];
      let nextLocationStatuses: WarehouseTransferLocationStatusRow[] = [];

      if (reservationPoIds.size > 0) {
        const poIds = Array.from(reservationPoIds);
        const [reservationsResult, locationStatusResult] = await Promise.all([
          supabase
            .from('warehouse_transfer_reservations')
            .select(
              'purchase_order_id, warehouse_location_id, variant_id, quantity_reserved, quantity_fulfilled'
            )
            .in('purchase_order_id', poIds),
          supabase
            .from('warehouse_transfer_location_status')
            .select('purchase_order_id, warehouse_location_id, status')
            .in('purchase_order_id', poIds),
        ]);

        if (reservationsResult.error) throw reservationsResult.error;
        if (locationStatusResult.error) throw locationStatusResult.error;

        nextReservations = (reservationsResult.data || []) as WarehouseTransferReservationRow[];
        nextLocationStatuses = (locationStatusResult.data ||
          []) as WarehouseTransferLocationStatusRow[];
      }

      setOrders(nextOrders);
      setItems(nextItems);
      setTransferReservations(nextReservations);
      setTransferLocationStatuses(nextLocationStatuses);
      setRebates(nextRebates);
      setPaidByOrderId(nextPaidByOrderId);
      setPaymentRows(nextPaymentRows);
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

  const chartDateRange = useMemo(
    () => ({
      from: orderDateRange.start,
      to: orderDateRange.end,
    }),
    [orderDateRange]
  );

  const dateFilteredOrders = useMemo(
    () =>
      orders.filter((order) =>
        isDateInRange(new Date(order.order_date), orderDateRange.start, orderDateRange.end)
      ),
    [orders, orderDateRange]
  );

  /** Revenue/product analytics — excludes free rebate replacements (₱0 amount due). */
  const filteredOrders = useMemo(
    () => dateFilteredOrders.filter(isKeyAccountAnalyticsEligibleOrder),
    [dateFilteredOrders]
  );

  const filteredOrderIds = useMemo(
    () => new Set(filteredOrders.map((order) => order.id)),
    [filteredOrders]
  );

  const dateFilteredOrderIds = filteredOrderIds;

  const filteredItems = useMemo(
    () => items.filter((item) => filteredOrderIds.has(item.purchase_order_id)),
    [items, filteredOrderIds]
  );

  const productOrders = filteredOrders;

  const productAnalyticsOrders = useMemo(
    () => productOrders.filter(isKeyAccountCommercialProductAnalyticsOrder),
    [productOrders]
  );

  const productAnalyticsOrderById = useMemo(
    () => new Map(productAnalyticsOrders.map((order) => [order.id, order])),
    [productAnalyticsOrders]
  );

  const rebateDeductionByPoItemId = useMemo(
    () => buildRebateDeductionByPoItemId(rebates),
    [rebates]
  );

  const rebateSwapByPoItemId = useMemo(
    () => buildRebateSwapByPoItemId(rebates),
    [rebates]
  );

  const allOrdersById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  );

  const rebateCreditByPurchaseOrderId = useMemo(
    () => buildRebateCreditDeductionByPurchaseOrderId(rebates),
    [rebates]
  );

  const poLineSubtotalByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item) => {
      const lineRevenue = Number(
        item.total_price ?? Number(item.quantity || 0) * Number(item.unit_price || 0)
      );
      map.set(item.purchase_order_id, (map.get(item.purchase_order_id) || 0) + lineRevenue);
    });
    return map;
  }, [filteredItems]);

  const reservationByKey = useMemo(() => {
    const map = new Map<string, { quantity_fulfilled: number; quantity_reserved: number }>();
    transferReservations.forEach((row) => {
      map.set(
        warehouseTransferReservationKey(
          row.purchase_order_id,
          row.warehouse_location_id,
          row.variant_id
        ),
        {
          quantity_fulfilled: Number(row.quantity_fulfilled) || 0,
          quantity_reserved: Number(row.quantity_reserved) || 0,
        }
      );
    });
    return map;
  }, [transferReservations]);

  const locationStatusByKey = useMemo(() => {
    const map = new Map<string, string>();
    transferLocationStatuses.forEach((row) => {
      map.set(
        warehouseTransferLocationStatusKey(row.purchase_order_id, row.warehouse_location_id),
        row.status
      );
    });
    return map;
  }, [transferLocationStatuses]);

  const { productRows, productOrderRevenueById } = useMemo(() => {
    const result = buildKeyAccountProductAnalyticsRows({
      items: filteredItems,
      productAnalyticsOrderById,
      orderById: allOrdersById,
      dateFilteredOrderIds,
      poLineSubtotalByOrderId,
      rebateDeductionByPoItemId,
      rebateSwapByPoItemId,
      rebates,
      reservationByKey,
      locationStatusByKey,
    });
    return {
      productRows: result.rows,
      productOrderRevenueById: result.orderRevenueById,
    };
  }, [
    productAnalyticsOrderById,
    filteredItems,
    allOrdersById,
    dateFilteredOrderIds,
    poLineSubtotalByOrderId,
    rebateDeductionByPoItemId,
    rebateSwapByPoItemId,
    rebates,
    reservationByKey,
    locationStatusByKey,
  ]);

  const brands = useMemo(
    () => Array.from(new Set(productRows.map((row) => row.brand))).sort(),
    [productRows]
  );

  const allBrands = useMemo(() => {
    const brandSet = new Set<string>();
    filteredItems.forEach((item) => {
      const variant = firstRelation(item.variants);
      const brand = firstRelation(variant?.brands)?.name;
      if (brand) brandSet.add(brand);
    });
    const productAnalyticsPoIds = new Set(productAnalyticsOrders.map((order) => order.id));
    rebates.forEach((rebate) => {
      if (!productAnalyticsPoIds.has(rebate.purchase_order_id)) return;
      if (!rebateResolutionHasReplacement(rebate.resolution_type)) return;
      normalizeRebateReplacements(rebate.replacements).forEach((replacement) => {
        const variant = firstRelation(replacement.variants);
        const brand = firstRelation(variant?.brands)?.name;
        if (brand) brandSet.add(brand);
      });
    });
    return Array.from(brandSet).sort();
  }, [filteredItems, rebates, productAnalyticsOrders]);

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
  }, [visibleProductRows.length, selectedBrand, dateRangeFilter]);

  const productDateRangeLabel = dateRangeLabel;

  const handleExportProductAnalytics = async () => {
    if (!visibleProductRows.length) {
      toast({
        title: 'No data to export',
        description: 'No product data for the selected period.',
        variant: 'destructive',
      });
      return;
    }

    const periodStart = orderDateRange.start ? formatDateForInput(orderDateRange.start) : 'all';
    const periodEnd = orderDateRange.end ? formatDateForInput(orderDateRange.end) : 'all';
    setProductExporting(true);
    try {
      await exportKeyAccountProductAnalyticsExcel(
        visibleProductRows.map((row) => ({
          brand: row.brand,
          variant: row.variant,
          totalUnits: row.quantity,
          consignmentUnits: row.consignmentQuantity,
          consignmentPoCount: row.consignmentOrders,
          poCount: row.orderCount,
          clientCount: row.clientCount,
          grossRevenue: row.grossRevenue,
          rebatedRevenue: row.rebatedRevenue,
          revenue: row.revenue,
        })),
        {
          dateRangeLabel: productDateRangeLabel,
          periodStart,
          periodEnd,
        }
      );
      toast({
        title: 'Export successful',
        description: `Exported ${visibleProductRows.length} product row(s) for ${productDateRangeLabel}.`,
      });
    } catch (error) {
      console.error('Key Account product analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate the Excel file.',
        variant: 'destructive',
      });
    } finally {
      setProductExporting(false);
    }
  };

  /** All POs plus placeholders — agent tab applies its own date/payment-period rules. */
  const agentAnalyticsOrders = useMemo<KeyAccountOrder[]>(() => {
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

  const brandRows = useMemo(
    () =>
      buildKeyAccountBrandAnalyticsRows(
        visibleProductRows,
        (orderId) => allOrdersById.get(orderId)?.key_account_client_id
      ),
    [visibleProductRows, allOrdersById]
  );

  const brandChartData = brandRows.slice(0, 10).map((row) => ({
    key: row.brand,
    name: row.brand,
    brand: row.brand,
    revenue: Math.round(row.revenue),
    grossRevenue: Math.round(row.grossRevenue),
    rebatedRevenue: Math.round(row.rebatedRevenue),
    quantity: row.quantity,
    orderCount: row.orderCount,
    clientCount: row.clientCount,
    variantCount: row.variantCount,
    consignmentOrders: row.consignmentOrders,
    consignmentQuantity: row.consignmentQuantity,
  }));

  const openBrandVariants = (row: KeyAccountBrandAnalyticsRow) => {
    setSelectedBrandRow(row);
    setBrandVariantsDialogOpen(true);
  };

  const openProductPoBreakdown = (row: KeyAccountProductAnalyticsRow) => {
    setSelectedProductRevenue(row);
    setProductRevenueDialogOpen(true);
  };

  const selectedProductPoRows = useMemo(() => {
    if (!selectedProductRevenue) return [];
    return buildKeyAccountProductPoBreakdownRows(selectedProductRevenue, allOrdersById);
  }, [selectedProductRevenue, allOrdersById]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Key Account Analytics</h1>
        <p className="text-muted-foreground">
          Overview, product, agent, client, and city analytics from Key Account purchase orders.
        </p>
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
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger
                value="overview"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="products"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Package className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Product Analytics
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Users className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Agent Analytics
              </TabsTrigger>
              <TabsTrigger
                value="clients"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Client Analytics
              </TabsTrigger>
              <TabsTrigger
                value="cities"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                City Analytics
              </TabsTrigger>
              <TabsTrigger
                value="fsn"
                className="h-auto gap-1.5 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
              >
                <TrendingDown className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                FSN Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <KeyAccountComboAnalyticsTab
                orders={orders}
                items={items}
                clients={clients}
                people={people}
                formatCurrency={formatCurrency}
                dateRangeFilter={dateRangeFilter}
                onDateRangeFilterChange={setDateRangeFilter}
                paymentRows={paymentRows}
              />
            </TabsContent>

            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Top Brands by PO Value</CardTitle>
                    <CardDescription>
                      Brand rollup of units ordered and net PO value after rebates —{' '}
                      {productDateRangeLabel}. Click a brand to see variants, then a variant for PO
                      breakdown.
                    </CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <DateRangeFilterPopover
                      value={dateRangeFilter}
                      onChange={setDateRangeFilter}
                      triggerClassName="w-full md:w-[220px] justify-between h-10"
                      align="end"
                    />
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
                    <Button
                      variant="outline"
                      className="h-10 gap-2"
                      onClick={handleExportProductAnalytics}
                      disabled={productExporting || loading || visibleProductRows.length === 0}
                    >
                      {productExporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4" />
                      )}
                      Export Excel
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-[360px]">
                    {brandChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={brandChartData}
                          layout="vertical"
                          margin={{ top: 4, right: 24, left: 24, bottom: 8 }}
                          style={{ cursor: 'pointer' }}
                          onClick={(state) => {
                            const payload = state?.activePayload?.[0]?.payload as
                              | { key?: string }
                              | undefined;
                            const key = payload?.key;
                            if (!key) return;
                            const row = brandRows.find((item) => item.brand === key);
                            if (row) openBrandVariants(row);
                          }}
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
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as {
                                brand: string;
                                quantity: number;
                                revenue: number;
                                orderCount: number;
                                clientCount: number;
                                variantCount?: number;
                                consignmentOrders?: number;
                                consignmentQuantity?: number;
                                rebatedRevenue?: number;
                                grossRevenue?: number;
                              };
                              const net = row.revenue || 0;
                              const rebated = row.rebatedRevenue || 0;
                              return (
                                <div className="bg-background border rounded-lg p-3 shadow-lg text-sm">
                                  <p className="font-semibold mb-2">{label}</p>
                                  <div className="space-y-1">
                                    {rebated > 0 && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">Gross:</span>
                                        <span>{formatCurrency(row.grossRevenue || net + rebated)}</span>
                                        <span className="text-amber-700 dark:text-amber-400">
                                          −{formatCurrency(rebated)} rebated
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <span className="w-3 h-3 rounded-full bg-emerald-500" />
                                      <span className="font-semibold">Net PO Value:</span>
                                      <span className="font-bold text-green-600 dark:text-green-400">
                                        {formatCurrency(net)}
                                      </span>
                                    </div>
                                    <p className="text-muted-foreground text-xs pt-1">
                                      Units Ordered: {row.quantity.toLocaleString()} ·{' '}
                                      {row.variantCount || 0} variants
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {row.orderCount} POs · {row.clientCount} clients
                                      {(row.consignmentOrders || 0) > 0
                                        ? ` · ${row.consignmentOrders} consignment (${(
                                            row.consignmentQuantity || 0
                                          ).toLocaleString()} units)`
                                        : ''}
                                    </p>
                                    <p className="text-muted-foreground text-[11px] pt-1">
                                      Click bar to view variants
                                    </p>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '12px' }}
                            formatter={() => 'Net PO Value'}
                          />
                          <Bar
                            dataKey="revenue"
                            fill="#10b981"
                            name="revenue"
                            barSize={20}
                            cursor="pointer"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        No brand data for the selected period.
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-medium mb-2">Product Performance Details</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Chart shows brands. Click a brand for variants, or click net PO value in the
                      table for that variant&apos;s PO breakdown.
                    </p>
                    <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground mb-3 space-y-1">
                      <p>
                        <span className="font-medium text-foreground">Units</span> — total quantity
                        ordered on product POs in range (includes consignment).
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Consignment POs</span> — distinct
                        consignment purchase orders that include this product (float stock; pay later).
                      </p>
                      <p>
                        <span className="font-medium text-foreground">POs / Clients</span> — how often
                        and how widely this product is ordered.
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Net PO value</span> — gross line
                        value minus rebated credits (product demand value, not collection status).
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Brand</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Total Units</TableHead>
                          <TableHead
                            className="text-right"
                            title="Units from consignment POs"
                          >
                            Consignment Units
                          </TableHead>
                          <TableHead
                            className="text-right"
                            title="Distinct consignment purchase orders"
                          >
                            Consignment POs
                          </TableHead>
                          <TableHead className="text-right" title="Line PO value before rebate credits">
                            Gross
                          </TableHead>
                          <TableHead
                            className="text-right"
                            title="Money/credit rebates on source PO lines"
                          >
                            Rebated
                          </TableHead>
                          <TableHead className="text-right" title="Gross minus rebated (net PO value)">
                            Net PO Value
                          </TableHead>
                          <TableHead className="text-right" title="Distinct purchase orders">
                            POs
                          </TableHead>
                          <TableHead className="text-right">Clients</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleProductRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                              No products found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedProductRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell><Badge variant="outline">{row.brand}</Badge></TableCell>
                              <TableCell className="font-medium">{row.variant}</TableCell>
                              <TableCell className="text-right font-medium">
                                {row.quantity.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-sky-700 dark:text-sky-400">
                                {row.consignmentQuantity > 0
                                  ? row.consignmentQuantity.toLocaleString()
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right text-sky-700 dark:text-sky-400">
                                {row.consignmentOrders > 0 ? row.consignmentOrders : '—'}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {formatCurrency(row.grossRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-amber-700 dark:text-amber-400">
                                {row.rebatedRevenue > 0 ? `−${formatCurrency(row.rebatedRevenue)}` : '—'}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                <button
                                  type="button"
                                  className="text-primary hover:underline underline-offset-2"
                                  onClick={() => openProductPoBreakdown(row)}
                                >
                                  {formatCurrency(row.revenue)}
                                </button>
                              </TableCell>
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

              <KeyAccountBrandVariantsDialog
                open={brandVariantsDialogOpen}
                onOpenChange={setBrandVariantsDialogOpen}
                brandRow={selectedBrandRow}
                dateRangeLabel={productDateRangeLabel}
                onSelectVariant={openProductPoBreakdown}
              />
              <KeyAccountProductPoBreakdownDialog
                open={productRevenueDialogOpen}
                onOpenChange={setProductRevenueDialogOpen}
                product={selectedProductRevenue}
                dateRangeLabel={productDateRangeLabel}
                poRows={selectedProductPoRows}
                formatCurrencyFn={formatCurrency}
              />
            </TabsContent>

            <TabsContent value="agents">
              <KeyAccountKamAnalyticsTab
                orders={agentAnalyticsOrders}
                items={filteredItems}
                people={people}
                formatCurrency={formatCurrency}
                dateRangeFilter={dateRangeFilter}
                onDateRangeFilterChange={setDateRangeFilter}
                paidByOrderId={paidByOrderId}
                paymentRows={paymentRows}
                orderRevenueById={productOrderRevenueById}
                rebateDeductionByPoItemId={rebateDeductionByPoItemId}
                poLineSubtotalByOrderId={poLineSubtotalByOrderId}
                reservationByKey={reservationByKey}
                locationStatusByKey={locationStatusByKey}
              />
            </TabsContent>

            <TabsContent value="clients">
              <KeyAccountClientAnalyticsTab
                orders={orders}
                items={items}
                clients={clients}
                formatCurrency={formatCurrency}
                chartDateRange={chartDateRange}
                usePageDateFilter
                dateRangeFilter={dateRangeFilter}
                onDateRangeFilterChange={setDateRangeFilter}
                orderRevenueById={productOrderRevenueById}
                paymentRows={paymentRows}
              />
            </TabsContent>

            <TabsContent value="cities">
              <KeyAccountCityAnalyticsTab
                orders={orders}
                clients={clients}
                formatCurrency={formatCurrency}
                dateRangeFilter={dateRangeFilter}
                onDateRangeFilterChange={setDateRangeFilter}
                orderRevenueById={productOrderRevenueById}
                paymentRows={paymentRows}
              />
            </TabsContent>

            <TabsContent value="fsn">
              <KeyAccountFsnAnalyticsTab orders={filteredOrders} items={filteredItems} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
