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
  Check,
  ChevronsUpDown,
  Eye,
  FileDown,
  Filter,
  Loader2,
  MapPin,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  getDatePresetLabel,
  getDateRangeFromPreset,
  isDateInRange,
} from '@/lib/dateRangePresets';
import {
  getCappedConsignmentPaymentChunks,
  splitKeyAccountPoPaymentRevenue,
  type KeyAccountDashboardPaymentRow,
} from '../dashboard/keyAccountDashboardRevenue';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';
import {
  exportKeyAccountCityAnalyticsExcel,
  type KeyAccountCityAnalyticsExportRow,
} from './exportKeyAccountCityAnalyticsExcel';
import {
  firstRelation,
  getKeyAccountOrderNetRevenueFromAttribution,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountConsignmentOrder,
  type KeyAccountOrderRevenueAttribution,
} from './keyAccountAnalyticsShared';

interface ClientOption {
  id: string;
  client_name: string;
  client_code: string | null;
}

interface ShopRelation {
  id: string;
  shop_name: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
}

interface AddressRelation {
  city: string | null;
  province: string | null;
  region: string | null;
}

interface CityAnalyticsOrder {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  key_account_client_id: string | null;
  key_account_shop_id?: string | null;
  analytics_only?: boolean;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  shop?: ShopRelation | ShopRelation[] | null;
  address?: AddressRelation | AddressRelation[] | null;
}

interface KeyAccountCityAnalyticsTabProps {
  orders: CityAnalyticsOrder[];
  clients: ClientOption[];
  formatCurrency: (value: number) => string;
  dateRangeFilter: DateRangeFilterValue;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  orderRevenueById?: Map<string, KeyAccountOrderRevenueAttribution>;
  paymentRows?: KeyAccountDashboardPaymentRow[];
}

type GroupByType = 'city' | 'region' | 'province';
type MetricType = 'revenue' | 'orders' | 'shops';

interface ResolvedLocation {
  city: string;
  cityKey: string;
  region: string;
  regionKey: string;
  province: string;
  provinceKey: string;
  shopId: string | null;
  shopName: string;
}

interface LocationPerformanceRow {
  key: string;
  label: string;
  region: string;
  province: string;
  orders: number;
  shops: number;
  clients: number;
  grossRevenue: number;
  rebatedRevenue: number;
  netRevenue: number;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalPaymentRevenue: number;
}

interface LocationDetailShopRow {
  shopId: string;
  shopName: string;
  clientName: string;
  orders: number;
  netRevenue: number;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
}

interface PaymentSummary {
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
  paidOrders: number;
  partialOrders: number;
  unpaidOrders: number;
  consignmentOrders: number;
}

interface CityPaymentPeriodRow extends PaymentSummary {
  month: string;
  periodStart: string;
}

interface PeriodLocationRow extends PaymentSummary {
  key: string;
  label: string;
}

const EMPTY_ORDER_REVENUE_MAP = new Map<string, KeyAccountOrderRevenueAttribution>();
const EMPTY_PAYMENT_ROWS: KeyAccountDashboardPaymentRow[] = [];
const UNKNOWN = 'Unknown';

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
}

function subMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() - amount, date.getDate());
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function emptyPaymentSummary(): PaymentSummary {
  return {
    paidRevenue: 0,
    partialRevenue: 0,
    unpaidRevenue: 0,
    consignmentRevenue: 0,
    settlementDiscountRevenue: 0,
    totalRevenue: 0,
    paidOrders: 0,
    partialOrders: 0,
    unpaidOrders: 0,
    consignmentOrders: 0,
  };
}

function isCancelledOrRejectedOrder(order: CityAnalyticsOrder) {
  const status = String(order.status || '').toLowerCase();
  const workflow = String(order.workflow_status || '').toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'rejected' ||
    workflow === 'cancelled' ||
    workflow === 'rejected'
  );
}

function buildMonthlyPeriods(
  orders: CityAnalyticsOrder[],
  rangeStart?: Date,
  rangeEnd?: Date
) {
  const realOrders = orders.filter((o) => !o.analytics_only && o.order_date);
  const orderedDates = realOrders
    .map((o) => new Date(o.order_date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  let start: Date;
  let end: Date;

  if (rangeStart) {
    start = startOfMonth(rangeStart);
    end = rangeEnd ? endOfMonth(rangeEnd) : endOfMonth(rangeStart);
  } else {
    const latest = orderedDates[orderedDates.length - 1] || new Date();
    let earliest = orderedDates[0] || subMonths(latest, 5);
    const sixMonthsAgo = startOfMonth(subMonths(latest, 5));
    if (earliest > sixMonthsAgo) earliest = sixMonthsAgo;
    start = startOfMonth(earliest);
    end = endOfMonth(latest);
  }

  const periods: { label: string; start: Date; end: Date }[] = [];
  const current = new Date(start);
  while (current <= end) {
    periods.push({
      label: formatMonthYear(current),
      start: startOfMonth(current),
      end: endOfMonth(current),
    });
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

function normalizeLocationToken(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return UNKNOWN;
  return trimmed
    .toLowerCase()
    .replace(/^city of\s+/i, '')
    .replace(/\s+city$/i, '')
    .replace(/\s+/g, ' ');
}

function displayLocationToken(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  return trimmed || UNKNOWN;
}

function resolveOrderLocation(order: CityAnalyticsOrder): ResolvedLocation {
  const shop = firstRelation(order.shop);
  const address = firstRelation(order.address);
  const cityRaw = shop?.city || address?.city;
  const regionRaw = shop?.region || address?.region;
  const provinceRaw = shop?.province || address?.province;

  return {
    city: displayLocationToken(cityRaw),
    cityKey: normalizeLocationToken(cityRaw),
    region: displayLocationToken(regionRaw),
    regionKey: normalizeLocationToken(regionRaw),
    province: displayLocationToken(provinceRaw),
    provinceKey: normalizeLocationToken(provinceRaw),
    shopId: shop?.id || order.key_account_shop_id || null,
    shopName: (shop?.shop_name || '').trim() || 'Unnamed shop',
  };
}

function formatClientLabel(client: ClientOption) {
  return client.client_code ? `${client.client_name} (${client.client_code})` : client.client_name;
}

function clientInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function groupByLabel(groupBy: GroupByType) {
  if (groupBy === 'region') return 'Region';
  if (groupBy === 'province') return 'Province';
  return 'City';
}

function metricLabel(metric: MetricType) {
  if (metric === 'orders') return 'POs ordered';
  if (metric === 'shops') return 'Buying shops';
  // Payment mix (paid + remaining + consignment + settlement) — same period rules as monthly chart.
  return 'Payment mix';
}

function metricValue(row: LocationPerformanceRow, metric: MetricType) {
  if (metric === 'orders') return row.orders;
  if (metric === 'shops') return row.shops;
  // Rank/chart by period payment contribution, not order-date net revenue.
  // Otherwise July consignments paid in August show bar ₱0 while tooltip Paid ₱1,000.
  return row.totalPaymentRevenue;
}

export default function KeyAccountCityAnalyticsTab({
  orders,
  clients,
  formatCurrency,
  dateRangeFilter,
  onDateRangeFilterChange,
  orderRevenueById = EMPTY_ORDER_REVENUE_MAP,
  paymentRows = EMPTY_PAYMENT_ROWS,
}: KeyAccountCityAnalyticsTabProps) {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupByType>('city');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationPerformanceRow | null>(null);
  const [periodDetailOpen, setPeriodDetailOpen] = useState(false);
  const [selectedPeriodRow, setSelectedPeriodRow] = useState<CityPaymentPeriodRow | null>(null);

  const paymentsByOrderId = useMemo(() => {
    const map = new Map<string, KeyAccountDashboardPaymentRow[]>();
    paymentRows.forEach((row) => {
      const list = map.get(row.purchase_order_id) || [];
      list.push(row);
      map.set(row.purchase_order_id, list);
    });
    return map;
  }, [paymentRows]);

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

  const clientOptions = useMemo(() => {
    const map = new Map<string, ClientOption>();
    clients.forEach((c) => map.set(c.id, c));
    orders.forEach((order) => {
      if (!order.key_account_client_id || map.has(order.key_account_client_id)) return;
      const client = firstRelation(order.client);
      map.set(order.key_account_client_id, {
        id: order.key_account_client_id,
        client_name: client?.client_name || 'Unknown client',
        client_code: null,
      });
    });
    return Array.from(map.values()).sort((a, b) => a.client_name.localeCompare(b.client_name));
  }, [clients, orders]);

  const selectedClientLabel = useMemo(() => {
    if (selectedClient === 'all') return 'All clients';
    const match = clientOptions.find((c) => c.id === selectedClient);
    return match ? formatClientLabel(match) : 'Select client';
  }, [clientOptions, selectedClient]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (order.analytics_only) return false;
      if (isCancelledOrRejectedOrder(order)) return false;
      if (!isKeyAccountAnalyticsEligibleOrder(order)) return false;
      if (selectedClient !== 'all' && order.key_account_client_id !== selectedClient) return false;

      const location = resolveOrderLocation(order);
      if (selectedRegion !== 'all' && location.regionKey !== selectedRegion) return false;
      return true;
    });
  }, [orders, selectedClient, selectedRegion]);

  /** Orders with order_date in the selected range — used for net/rebate location ranking. */
  const orderDateScopedOrders = useMemo(
    () =>
      filteredOrders.filter((order) =>
        isDateInRange(order.order_date, dateRange.start, dateRange.end)
      ),
    [dateRange.end, dateRange.start, filteredOrders]
  );

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => {
      if (order.analytics_only) return;
      if (isCancelledOrRejectedOrder(order)) return;
      if (!isKeyAccountAnalyticsEligibleOrder(order)) return;
      const location = resolveOrderLocation(order);
      if (!map.has(location.regionKey)) {
        map.set(location.regionKey, location.region);
      }
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  const selectedRegionLabel = useMemo(() => {
    if (selectedRegion === 'all') return 'All regions';
    return regionOptions.find((r) => r.key === selectedRegion)?.label || 'Select region';
  }, [regionOptions, selectedRegion]);

  /**
   * Same rules as Client Analytics / dashboard Revenue Overview:
   * - standard POs by order_date
   * - consignment float by order_date
   * - consignment cash + settlement discount by payment created_at
   */
  const computePaymentSummary = (
    scopeOrders: CityAnalyticsOrder[],
    periodStart?: Date,
    periodEnd?: Date
  ): PaymentSummary => {
    const summary = emptyPaymentSummary();
    const inPeriod = (value: string) => isDateInRange(value, periodStart, periodEnd);

    scopeOrders.forEach((order) => {
      const total = Number(order.total_amount) || 0;
      if (isKeyAccountConsignmentOrder(order)) {
        if (inPeriod(order.order_date)) {
          const chunks = getCappedConsignmentPaymentChunks(
            total,
            paymentsByOrderId.get(order.id) || []
          );
          const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
          const discountAll = chunks.reduce(
            (sum, chunk) => sum + chunk.settlement_discount,
            0
          );
          const remaining = Math.max(
            0,
            Math.round((total - paidAll - discountAll) * 100) / 100
          );
          if (remaining > 0) {
            summary.consignmentRevenue += remaining;
            summary.consignmentOrders += 1;
          }
        }
        const chunks = getCappedConsignmentPaymentChunks(
          total,
          paymentsByOrderId.get(order.id) || []
        );
        chunks.forEach((chunk) => {
          if (!inPeriod(chunk.created_at)) return;
          summary.paidRevenue += chunk.amount;
          summary.settlementDiscountRevenue += chunk.settlement_discount;
          if (chunk.amount > 0 || chunk.settlement_discount > 0) summary.paidOrders += 1;
        });
        return;
      }

      if (!inPeriod(order.order_date)) return;
      const rows = paymentsByOrderId.get(order.id) || [];
      const cash = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const discount = rows.reduce(
        (sum, row) => sum + Number(row.settlement_discount || 0),
        0
      );
      const split = splitKeyAccountPoPaymentRevenue(total, cash, false, discount);
      summary.paidRevenue += split.paidRevenue;
      summary.partialRevenue += split.partialRevenue;
      summary.unpaidRevenue += split.unpaidRevenue;
      summary.settlementDiscountRevenue += split.settlementDiscountRevenue;
      if (
        (split.paidRevenue > 0 || split.settlementDiscountRevenue > 0) &&
        split.partialRevenue <= 0 &&
        split.unpaidRevenue <= 0
      ) {
        summary.paidOrders += 1;
      }
      if (split.partialRevenue > 0) summary.partialOrders += 1;
      if (split.unpaidRevenue > 0) summary.unpaidOrders += 1;
    });

    summary.totalRevenue =
      summary.paidRevenue +
      summary.partialRevenue +
      summary.unpaidRevenue +
      summary.consignmentRevenue +
      summary.settlementDiscountRevenue;
    return summary;
  };

  const computePaymentForOrderInPeriod = (
    order: CityAnalyticsOrder,
    periodStart?: Date,
    periodEnd?: Date
  ) => {
    const total = Number(order.total_amount) || 0;
    const rows = paymentsByOrderId.get(order.id) || [];
    const inPeriod = (value: string) => isDateInRange(value, periodStart, periodEnd);

    if (isKeyAccountConsignmentOrder(order)) {
      const chunks = getCappedConsignmentPaymentChunks(total, rows);
      let paidRevenue = 0;
      let settlementDiscountRevenue = 0;
      chunks.forEach((chunk) => {
        if (!inPeriod(chunk.created_at)) return;
        paidRevenue += chunk.amount;
        settlementDiscountRevenue += chunk.settlement_discount;
      });

      let consignmentRevenue = 0;
      if (inPeriod(order.order_date)) {
        const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
        const discountAll = chunks.reduce(
          (sum, chunk) => sum + chunk.settlement_discount,
          0
        );
        consignmentRevenue = Math.max(
          0,
          Math.round((total - paidAll - discountAll) * 100) / 100
        );
      }

      return {
        paidRevenue,
        partialRevenue: 0,
        unpaidRevenue: 0,
        consignmentRevenue,
        settlementDiscountRevenue,
      };
    }

    if (!inPeriod(order.order_date)) {
      return {
        paidRevenue: 0,
        partialRevenue: 0,
        unpaidRevenue: 0,
        consignmentRevenue: 0,
        settlementDiscountRevenue: 0,
      };
    }

    const cash = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const discount = rows.reduce(
      (sum, row) => sum + Number(row.settlement_discount || 0),
      0
    );
    const split = splitKeyAccountPoPaymentRevenue(total, cash, false, discount);
    return {
      paidRevenue: split.paidRevenue,
      partialRevenue: split.partialRevenue,
      unpaidRevenue: split.unpaidRevenue,
      consignmentRevenue: 0,
      settlementDiscountRevenue: split.settlementDiscountRevenue,
    };
  };

  const monthlySalesData = useMemo(() => {
    const periods = buildMonthlyPeriods(orders, dateRange.start, dateRange.end);
    return periods.map((period) => ({
      month: period.label,
      periodStart: period.start.toISOString(),
      ...computePaymentSummary(filteredOrders, period.start, period.end),
    }));
  }, [dateRange.end, dateRange.start, filteredOrders, orders, paymentsByOrderId]);

  const locationRows = useMemo(() => {
    type Acc = {
      label: string;
      region: string;
      province: string;
      /** POs with order_date in the selected range (for frequent-buyer / shop counts). */
      createdOrderIds: Set<string>;
      createdShopIds: Set<string>;
      createdClientIds: Set<string>;
      grossRevenue: number;
      rebatedRevenue: number;
      netRevenue: number;
      paidRevenue: number;
      partialRevenue: number;
      unpaidRevenue: number;
      consignmentRevenue: number;
      settlementDiscountRevenue: number;
    };

    const map = new Map<string, Acc>();

    const touch = (order: CityAnalyticsOrder) => {
      const location = resolveOrderLocation(order);
      const key =
        groupBy === 'region'
          ? location.regionKey
          : groupBy === 'province'
            ? location.provinceKey
            : location.cityKey;
      const label =
        groupBy === 'region'
          ? location.region
          : groupBy === 'province'
            ? location.province
            : location.city;

      if (!map.has(key)) {
        map.set(key, {
          label,
          region: location.region,
          province: location.province,
          createdOrderIds: new Set(),
          createdShopIds: new Set(),
          createdClientIds: new Set(),
          grossRevenue: 0,
          rebatedRevenue: 0,
          netRevenue: 0,
          paidRevenue: 0,
          partialRevenue: 0,
          unpaidRevenue: 0,
          consignmentRevenue: 0,
          settlementDiscountRevenue: 0,
        });
      }
      return map.get(key)!;
    };

    orderDateScopedOrders.forEach((order) => {
      const bucket = touch(order);
      bucket.createdOrderIds.add(order.id);
      const location = resolveOrderLocation(order);
      if (location.shopId) bucket.createdShopIds.add(location.shopId);
      if (order.key_account_client_id) bucket.createdClientIds.add(order.key_account_client_id);

      const attribution = getKeyAccountOrderNetRevenueFromAttribution(
        orderRevenueById.get(order.id)
      );
      bucket.grossRevenue += attribution.grossRevenue;
      bucket.rebatedRevenue += attribution.rebatedRevenue;
      bucket.netRevenue += attribution.totalRevenue;
    });

    // Payment mix can include older consignments paid in this period — do NOT inflate PO/shop counts.
    filteredOrders.forEach((order) => {
      const payment = computePaymentForOrderInPeriod(
        order,
        dateRange.start,
        dateRange.end
      );
      const paymentTotal =
        payment.paidRevenue +
        payment.partialRevenue +
        payment.unpaidRevenue +
        payment.consignmentRevenue +
        payment.settlementDiscountRevenue;
      if (paymentTotal <= 0) return;

      const bucket = touch(order);
      bucket.paidRevenue += payment.paidRevenue;
      bucket.partialRevenue += payment.partialRevenue;
      bucket.unpaidRevenue += payment.unpaidRevenue;
      bucket.consignmentRevenue += payment.consignmentRevenue;
      bucket.settlementDiscountRevenue += payment.settlementDiscountRevenue;
    });

    const rows: LocationPerformanceRow[] = Array.from(map.entries()).map(([key, data]) => ({
      key,
      label: data.label,
      region: data.region,
      province: data.province,
      orders: data.createdOrderIds.size,
      shops: data.createdShopIds.size,
      clients: data.createdClientIds.size,
      grossRevenue: data.grossRevenue,
      rebatedRevenue: data.rebatedRevenue,
      netRevenue: data.netRevenue,
      paidRevenue: data.paidRevenue,
      partialRevenue: data.partialRevenue,
      unpaidRevenue: data.unpaidRevenue,
      consignmentRevenue: data.consignmentRevenue,
      settlementDiscountRevenue: data.settlementDiscountRevenue,
      totalPaymentRevenue:
        data.paidRevenue +
        data.partialRevenue +
        data.unpaidRevenue +
        data.consignmentRevenue +
        data.settlementDiscountRevenue,
    }));

    rows.sort((a, b) => metricValue(b, selectedMetric) - metricValue(a, selectedMetric));
    return rows;
  }, [
    dateRange.end,
    dateRange.start,
    filteredOrders,
    groupBy,
    orderDateScopedOrders,
    orderRevenueById,
    paymentsByOrderId,
    selectedMetric,
  ]);

  const selectedPeriodLocationRows = useMemo((): PeriodLocationRow[] => {
    if (!selectedPeriodRow) return [];
    const monthStart = startOfMonth(new Date(selectedPeriodRow.periodStart));
    const monthEnd = endOfMonth(monthStart);

    type Acc = PaymentSummary & { label: string };
    const map = new Map<string, Acc>();

    filteredOrders.forEach((order) => {
      const payment = computePaymentForOrderInPeriod(order, monthStart, monthEnd);
      const total =
        payment.paidRevenue +
        payment.partialRevenue +
        payment.unpaidRevenue +
        payment.consignmentRevenue +
        payment.settlementDiscountRevenue;
      if (total <= 0) return;

      const location = resolveOrderLocation(order);
      const key =
        groupBy === 'region'
          ? location.regionKey
          : groupBy === 'province'
            ? location.provinceKey
            : location.cityKey;
      const label =
        groupBy === 'region'
          ? location.region
          : groupBy === 'province'
            ? location.province
            : location.city;

      if (!map.has(key)) {
        map.set(key, { label, ...emptyPaymentSummary() });
      }
      const bucket = map.get(key)!;
      bucket.paidRevenue += payment.paidRevenue;
      bucket.partialRevenue += payment.partialRevenue;
      bucket.unpaidRevenue += payment.unpaidRevenue;
      bucket.consignmentRevenue += payment.consignmentRevenue;
      bucket.settlementDiscountRevenue += payment.settlementDiscountRevenue;
      bucket.totalRevenue += total;
    });

    // Recount PO buckets per location for the month summary table (payment amounts only above).
    return Array.from(map.entries())
      .map(([key, data]) => ({
        key,
        label: data.label,
        paidRevenue: data.paidRevenue,
        partialRevenue: data.partialRevenue,
        unpaidRevenue: data.unpaidRevenue,
        consignmentRevenue: data.consignmentRevenue,
        settlementDiscountRevenue: data.settlementDiscountRevenue,
        totalRevenue: data.totalRevenue,
        paidOrders: 0,
        partialOrders: 0,
        unpaidOrders: 0,
        consignmentOrders: 0,
      }))
      .filter((row) => row.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredOrders, groupBy, paymentsByOrderId, selectedPeriodRow]);

  const summary = useMemo(() => {
    const payment = computePaymentSummary(
      filteredOrders,
      dateRange.start,
      dateRange.end
    );
    const shopIds = new Set<string>();
    orderDateScopedOrders.forEach((order) => {
      const shopId = resolveOrderLocation(order).shopId;
      if (shopId) shopIds.add(shopId);
    });
    const top = locationRows[0] || null;
    return {
      locations: locationRows.length,
      totalOrders: orderDateScopedOrders.length,
      totalNetRevenue: locationRows.reduce((sum, row) => sum + row.netRevenue, 0),
      totalShops: shopIds.size,
      totalPaymentRevenue: payment.totalRevenue,
      paidRevenue: payment.paidRevenue,
      remainingRevenue: payment.partialRevenue + payment.unpaidRevenue,
      consignmentRevenue: payment.consignmentRevenue,
      top,
    };
  }, [
    dateRange.end,
    dateRange.start,
    filteredOrders,
    locationRows,
    orderDateScopedOrders,
    paymentsByOrderId,
  ]);

  const chartData = useMemo(
    () =>
      locationRows
        .filter((row) => metricValue(row, selectedMetric) > 0)
        .slice(0, 10)
        .map((row) => ({
          location: row.label,
          value: metricValue(row, selectedMetric),
          paidRevenue: row.paidRevenue,
          remainingRevenue: row.partialRevenue + row.unpaidRevenue,
          consignmentRevenue: row.consignmentRevenue,
          settlementDiscountRevenue: row.settlementDiscountRevenue,
          totalPaymentRevenue: row.totalPaymentRevenue,
          orders: row.orders,
          shops: row.shops,
        })),
    [locationRows, selectedMetric]
  );

  const paginatedRows = useMemo(
    () => paginateAnalyticsRows(locationRows, tablePage),
    [locationRows, tablePage]
  );

  useEffect(() => {
    setTablePage(1);
  }, [
    selectedClient,
    selectedRegion,
    groupBy,
    selectedMetric,
    dateRangeFilter.preset,
    dateRangeFilter.customStart,
    dateRangeFilter.customEnd,
  ]);

  const detailShopRows = useMemo((): LocationDetailShopRow[] => {
    if (!selectedLocation) return [];

    type Acc = {
      shopName: string;
      clientName: string;
      orderIds: Set<string>;
      netRevenue: number;
      paidRevenue: number;
      partialRevenue: number;
      unpaidRevenue: number;
      consignmentRevenue: number;
    };
    const map = new Map<string, Acc>();

    filteredOrders.forEach((order) => {
      const location = resolveOrderLocation(order);
      const orderKey =
        groupBy === 'region'
          ? location.regionKey
          : groupBy === 'province'
            ? location.provinceKey
            : location.cityKey;
      if (orderKey !== selectedLocation.key) return;

      const payment = computePaymentForOrderInPeriod(
        order,
        dateRange.start,
        dateRange.end
      );
      const inOrderDateRange = isDateInRange(
        order.order_date,
        dateRange.start,
        dateRange.end
      );
      const paymentTotal =
        payment.paidRevenue +
        payment.partialRevenue +
        payment.unpaidRevenue +
        payment.consignmentRevenue +
        payment.settlementDiscountRevenue;
      if (!inOrderDateRange && paymentTotal <= 0) return;

      const shopKey = location.shopId || `unknown-${order.id}`;
      if (!map.has(shopKey)) {
        const client = firstRelation(order.client);
        map.set(shopKey, {
          shopName: location.shopName,
          clientName: client?.client_name || 'Unknown client',
          orderIds: new Set(),
          netRevenue: 0,
          paidRevenue: 0,
          partialRevenue: 0,
          unpaidRevenue: 0,
          consignmentRevenue: 0,
        });
      }
      const bucket = map.get(shopKey)!;
      bucket.orderIds.add(order.id);
      if (inOrderDateRange) {
        bucket.netRevenue += getKeyAccountOrderNetRevenueFromAttribution(
          orderRevenueById.get(order.id)
        ).totalRevenue;
      }
      bucket.paidRevenue += payment.paidRevenue;
      bucket.partialRevenue += payment.partialRevenue;
      bucket.unpaidRevenue += payment.unpaidRevenue;
      bucket.consignmentRevenue += payment.consignmentRevenue;
    });

    return Array.from(map.entries())
      .map(([shopId, data]) => ({
        shopId,
        shopName: data.shopName,
        clientName: data.clientName,
        orders: data.orderIds.size,
        netRevenue: data.netRevenue,
        paidRevenue: data.paidRevenue,
        partialRevenue: data.partialRevenue,
        unpaidRevenue: data.unpaidRevenue,
        consignmentRevenue: data.consignmentRevenue,
      }))
      .sort(
        (a, b) =>
          b.paidRevenue +
          b.partialRevenue +
          b.unpaidRevenue +
          b.consignmentRevenue -
          (a.paidRevenue + a.partialRevenue + a.unpaidRevenue + a.consignmentRevenue)
      );
  }, [
    dateRange.end,
    dateRange.start,
    filteredOrders,
    groupBy,
    orderRevenueById,
    paymentsByOrderId,
    selectedLocation,
  ]);

  const openLocationDetail = (row: LocationPerformanceRow) => {
    setSelectedLocation(row);
    setDetailOpen(true);
  };

  const openPeriodDetail = (row: CityPaymentPeriodRow) => {
    setSelectedPeriodRow(row);
    setPeriodDetailOpen(true);
  };

  const handleExportExcel = async () => {
    if (locationRows.length === 0) return;
    setExporting(true);
    try {
      const rows: KeyAccountCityAnalyticsExportRow[] = locationRows.map((row) => ({
        location: row.label,
        region: row.region,
        province: row.province,
        orders: row.orders,
        shops: row.shops,
        clients: row.clients,
        grossRevenue: row.grossRevenue,
        rebatedRevenue: row.rebatedRevenue,
        netRevenue: row.netRevenue,
        paidRevenue: row.paidRevenue,
        partialRevenue: row.partialRevenue,
        unpaidRevenue: row.unpaidRevenue,
        consignmentRevenue: row.consignmentRevenue,
      }));

      await exportKeyAccountCityAnalyticsExcel(rows, {
        dateRangeLabel,
        groupByLabel: groupByLabel(groupBy),
        metricLabel: metricLabel(selectedMetric),
        clientLabel: selectedClientLabel,
        regionLabel: selectedRegionLabel,
        locationCount: locationRows.length,
        totalOrders: summary.totalOrders,
        totalNetRevenue: summary.totalNetRevenue,
      });

      toast({
        title: 'Export ready',
        description: `Exported ${rows.length} ${groupByLabel(groupBy).toLowerCase()} rows.`,
      });
    } catch (error) {
      console.error('City analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not export city analytics.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const chartValueFormatter = (value: number) =>
    selectedMetric === 'revenue' ? formatCurrency(value) : value.toLocaleString();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {groupByLabel(groupBy)} locations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.locations}</div>
            <p className="text-xs text-muted-foreground mt-1">{dateRangeLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Payment mix revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalPaymentRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Paid {formatCurrency(summary.paidRevenue)} · Remaining{' '}
              {formatCurrency(summary.remainingRevenue)} · Consignment{' '}
              {formatCurrency(summary.consignmentRevenue)}
            </p>
            {summary.totalNetRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Net after rebates {formatCurrency(summary.totalNetRevenue)}
              </p>
            )}
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
            <p className="text-xs text-muted-foreground mt-1">
              {summary.totalShops} buying shops
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Store className="h-4 w-4" />
              Top {groupByLabel(groupBy).toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {summary.top?.label || '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.top
                ? `${chartValueFormatter(metricValue(summary.top, selectedMetric))} · ${metricLabel(selectedMetric).toLowerCase()}`
                : 'No location data'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>City / Shop Location Performance</CardTitle>
          <CardDescription>
            Rank locations by shop city (fallback: delivery address). Monthly chart uses the same
            payment rules as Client Analytics — standard by order date; consignment float by order
            date; consignment cash by payment date. Click a month for location breakdown —{' '}
            {dateRangeLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={clientPickerOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate text-left">{selectedClientLabel}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search client..." />
                        <CommandList>
                          <CommandEmpty>No client found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="all clients"
                              onSelect={() => {
                                setSelectedClient('all');
                                setClientPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedClient === 'all' ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              <Avatar className="mr-2 h-7 w-7">
                                <AvatarFallback className="text-xs bg-muted">ALL</AvatarFallback>
                              </Avatar>
                              <span>All clients</span>
                            </CommandItem>
                            {clientOptions.map((client) => (
                              <CommandItem
                                key={client.id}
                                value={`${client.client_name} ${client.client_code || ''}`}
                                onSelect={() => {
                                  setSelectedClient(client.id);
                                  setClientPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    selectedClient === client.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                <Avatar className="mr-2 h-7 w-7">
                                  <AvatarFallback className="text-xs bg-muted">
                                    {clientInitials(client.client_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate">{formatClientLabel(client)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Region</Label>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All regions</SelectItem>
                      {regionOptions.map((region) => (
                        <SelectItem key={region.key} value={region.key}>
                          {region.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Group by</Label>
                  <Select
                    value={groupBy}
                    onValueChange={(value) => setGroupBy(value as GroupByType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="city">City</SelectItem>
                      <SelectItem value="province">Province</SelectItem>
                      <SelectItem value="region">Region</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Sort / display metric</Label>
                  <Select
                    value={selectedMetric}
                    onValueChange={(value) => setSelectedMetric(value as MetricType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Most paying (payment mix)</SelectItem>
                      <SelectItem value="orders">Frequent buyers (POs ordered)</SelectItem>
                      <SelectItem value="shops">Buying shops (ordered in range)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Label>Date range</Label>
                  <DateRangeFilterPopover
                    value={dateRangeFilter}
                    onChange={onDateRangeFilterChange}
                    triggerClassName="w-full justify-between h-10"
                    align="start"
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full h-10 gap-2"
                  onClick={() => void handleExportExcel()}
                  disabled={exporting || locationRows.length === 0}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Export Excel
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4 min-w-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue by month</CardTitle>
                  <CardDescription>
                    Paid, remaining balance (partial + unpaid), consignment, and settlement discount
                    · click a month for {groupByLabel(groupBy).toLowerCase()} breakdown ·{' '}
                    {selectedClientLabel} · {selectedRegionLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]">
                    {monthlySalesData.some((row) => row.totalRevenue > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlySalesData}
                          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                          onClick={(state) => {
                            const label = String(state?.activeLabel || '');
                            const row = monthlySalesData.find((entry) => entry.month === label);
                            if (row) openPeriodDetail(row);
                          }}
                          className="cursor-pointer"
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 11 }}
                            angle={-35}
                            textAnchor="end"
                            height={70}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0].payload as CityPaymentPeriodRow;
                              const remaining = row.partialRevenue + row.unpaidRevenue;
                              return (
                                <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                                  <p className="font-semibold mb-2">{label}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {selectedClientLabel} · {selectedRegionLabel}
                                  </p>
                                  <p className="text-lg font-bold">
                                    {formatCurrency(row.totalRevenue || 0)}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Paid {formatCurrency(row.paidRevenue)} · Remaining{' '}
                                    {formatCurrency(remaining)} · Consignment{' '}
                                    {formatCurrency(row.consignmentRevenue)} · Settlement disc.{' '}
                                    {formatCurrency(row.settlementDiscountRevenue)}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {row.paidOrders} paid · {row.partialOrders} partial ·{' '}
                                    {row.unpaidOrders} unpaid
                                    {row.consignmentOrders > 0
                                      ? ` · ${row.consignmentOrders} consignment`
                                      : ''}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-2">
                                    Click for {groupByLabel(groupBy).toLowerCase()} breakdown
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Legend
                            formatter={(value: string) =>
                              value === 'paidRevenue'
                                ? 'Paid'
                                : value === 'partialRevenue'
                                  ? 'Partial'
                                  : value === 'unpaidRevenue'
                                    ? 'Unpaid'
                                    : value === 'consignmentRevenue'
                                      ? 'Consignment'
                                      : 'Settlement disc.'
                            }
                          />
                          <Bar
                            dataKey="paidRevenue"
                            stackId="revenue"
                            fill="#22c55e"
                            name="paidRevenue"
                          />
                          <Bar
                            dataKey="partialRevenue"
                            stackId="revenue"
                            fill="#f59e0b"
                            name="partialRevenue"
                          />
                          <Bar
                            dataKey="unpaidRevenue"
                            stackId="revenue"
                            fill="#f97316"
                            name="unpaidRevenue"
                          />
                          <Bar
                            dataKey="consignmentRevenue"
                            stackId="revenue"
                            fill="#0ea5e9"
                            name="consignmentRevenue"
                          />
                          <Bar
                            dataKey="settlementDiscountRevenue"
                            stackId="revenue"
                            fill="#64748b"
                            name="settlementDiscountRevenue"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        No revenue for the selected filters.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Top {groupByLabel(groupBy).toLowerCase()}s by{' '}
                    {metricLabel(selectedMetric).toLowerCase()}
                  </CardTitle>
                  <CardDescription>
                    {selectedClientLabel} · {selectedRegionLabel}
                    {selectedMetric === 'revenue'
                      ? ' · Bar = paid + remaining + consignment this period (consignment cash by payment date)'
                      : selectedMetric === 'orders'
                        ? ' · Bar = POs with order date in this range (payments on older POs do not count)'
                        : selectedMetric === 'shops'
                          ? ' · Bar = distinct shops that ordered in this range'
                          : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                      No location data for the selected filters
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 48 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="location"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-25}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0].payload as (typeof chartData)[number];
                            return (
                              <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                                <p className="font-semibold mb-1">{label}</p>
                                <p className="text-lg font-bold">
                                  {chartValueFormatter(row.value)}
                                </p>
                                {selectedMetric === 'revenue' ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Paid {formatCurrency(row.paidRevenue)} · Remaining{' '}
                                    {formatCurrency(row.remainingRevenue)} · Consignment{' '}
                                    {formatCurrency(row.consignmentRevenue)}
                                  </p>
                                ) : (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Payment mix {formatCurrency(row.totalPaymentRevenue)} · Paid{' '}
                                    {formatCurrency(row.paidRevenue)} · Remaining{' '}
                                    {formatCurrency(row.remainingRevenue)}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {row.orders} PO{row.orders === 1 ? '' : 's'} ordered · {row.shops}{' '}
                                  shop{row.shops === 1 ? '' : 's'}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#3b82f6"
                          name={metricLabel(selectedMetric)}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {groupByLabel(groupBy)} breakdown
                  </CardTitle>
                  <CardDescription>
                    Paid, remaining, and consignment by location · click View for shops
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{groupByLabel(groupBy)}</TableHead>
                          {groupBy === 'city' && <TableHead>Region</TableHead>}
                          <TableHead className="text-right" title="POs with order date in range">
                            POs ordered
                          </TableHead>
                          <TableHead className="text-right">Shops</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-right">Consignment</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-center w-[72px]">View</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedRows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={groupBy === 'city' ? 9 : 8}
                              className="text-center text-muted-foreground py-8"
                            >
                              No city / shop location data found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                                  <span>{row.label}</span>
                                </div>
                              </TableCell>
                              {groupBy === 'city' && (
                                <TableCell>
                                  <Badge variant="outline">{row.region}</Badge>
                                </TableCell>
                              )}
                              <TableCell className="text-right">{row.orders}</TableCell>
                              <TableCell className="text-right">{row.shops}</TableCell>
                              <TableCell className="text-right text-green-600 dark:text-green-400">
                                {formatCurrency(row.paidRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600 dark:text-orange-400">
                                {formatCurrency(row.partialRevenue + row.unpaidRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-sky-600 dark:text-sky-400">
                                {formatCurrency(row.consignmentRevenue)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(row.totalPaymentRevenue)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title={`View shops in ${row.label}`}
                                  onClick={() => openLocationDetail(row)}
                                >
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">View</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                    <AnalyticsTablePagination
                      page={tablePage}
                      onPageChange={setTablePage}
                      totalRows={locationRows.length}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={periodDetailOpen} onOpenChange={setPeriodDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPeriodRow?.month} — {groupByLabel(groupBy)} revenue breakdown
            </DialogTitle>
            <DialogDescription>
              {selectedClientLabel} · {selectedRegionLabel}
              {' · '}Paid, remaining balance (partial + unpaid), consignment, and settlement discount
              for this month.
            </DialogDescription>
          </DialogHeader>
          {selectedPeriodRow && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs">Paid</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(selectedPeriodRow.paidRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Remaining balance</p>
                  <p className="font-semibold text-orange-600 dark:text-orange-400">
                    {formatCurrency(
                      selectedPeriodRow.partialRevenue + selectedPeriodRow.unpaidRevenue
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Consignment</p>
                  <p className="font-semibold text-sky-600 dark:text-sky-400">
                    {formatCurrency(selectedPeriodRow.consignmentRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Settlement disc.</p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {formatCurrency(selectedPeriodRow.settlementDiscountRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-semibold">
                    {formatCurrency(selectedPeriodRow.totalRevenue)}
                  </p>
                </div>
              </div>
              <div className="border-t pt-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Paid POs</span>
                  <span>{selectedPeriodRow.paidOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Open POs (partial + unpaid)</span>
                  <span>
                    {selectedPeriodRow.partialOrders + selectedPeriodRow.unpaidOrders}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Consignment POs</span>
                  <span>{selectedPeriodRow.consignmentOrders}</span>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  By {groupByLabel(groupBy).toLowerCase()}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{groupByLabel(groupBy)}</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right">Consignment</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPeriodLocationRows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-muted-foreground py-6"
                          >
                            No {groupByLabel(groupBy).toLowerCase()} revenue for this month.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedPeriodLocationRows.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.label}</TableCell>
                            <TableCell className="text-right text-green-600 dark:text-green-400">
                              {formatCurrency(row.paidRevenue)}
                            </TableCell>
                            <TableCell className="text-right text-orange-600 dark:text-orange-400">
                              {formatCurrency(row.partialRevenue + row.unpaidRevenue)}
                            </TableCell>
                            <TableCell className="text-right text-sky-600 dark:text-sky-400">
                              {formatCurrency(row.consignmentRevenue)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(row.totalRevenue)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedLocation?.label || 'Location'} — shops
            </DialogTitle>
            <DialogDescription>
              Shops in this {groupByLabel(groupBy).toLowerCase()} for {dateRangeLabel}
              {selectedLocation
                ? ` · ${selectedLocation.orders} POs · Paid ${formatCurrency(selectedLocation.paidRevenue)} · Remaining ${formatCurrency(selectedLocation.partialRevenue + selectedLocation.unpaidRevenue)} · Consignment ${formatCurrency(selectedLocation.consignmentRevenue)}`
                : ''}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">POs</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Consignment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailShopRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No shops found for this location.
                    </TableCell>
                  </TableRow>
                ) : (
                  detailShopRows.map((shop) => {
                    const remaining = shop.partialRevenue + shop.unpaidRevenue;
                    const total =
                      shop.paidRevenue + remaining + shop.consignmentRevenue;
                    return (
                      <TableRow key={shop.shopId}>
                        <TableCell className="font-medium">{shop.shopName}</TableCell>
                        <TableCell>{shop.clientName}</TableCell>
                        <TableCell className="text-right">{shop.orders}</TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          {formatCurrency(shop.paidRevenue)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 dark:text-orange-400">
                          {formatCurrency(remaining)}
                        </TableCell>
                        <TableCell className="text-right text-sky-600 dark:text-sky-400">
                          {formatCurrency(shop.consignmentRevenue)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(total)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
