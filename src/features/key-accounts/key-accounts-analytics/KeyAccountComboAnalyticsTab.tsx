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
  Check,
  ChevronsUpDown,
  Eye,
  FileDown,
  Filter,
  Layers,
  Loader2,
  ShoppingCart,
  TrendingUp,
  Users,
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
  isKeyAccountDashboardSalesOrder,
  splitKeyAccountPoPaymentRevenue,
  type KeyAccountDashboardPaymentRow,
} from '../dashboard/keyAccountDashboardRevenue';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';
import {
  exportKeyAccountComboAnalyticsExcel,
  type KeyAccountComboAnalyticsExportRow,
} from './exportKeyAccountComboAnalyticsExcel';
import {
  firstRelation,
  isKeyAccountConsignmentOrder,
} from './keyAccountAnalyticsShared';

interface ClientOption {
  id: string;
  client_name: string;
  client_code: string | null;
}

interface PersonOption {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
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

interface ComboOrder {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  kam_id: string | null;
  key_account_client_id: string | null;
  key_account_shop_id?: string | null;
  key_account_payment_status?: string | null;
  analytics_only?: boolean;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  shop?: ShopRelation | ShopRelation[] | null;
  address?: AddressRelation | AddressRelation[] | null;
  kam?:
    | { full_name: string | null; email: string | null; role: string | null }
    | { full_name: string | null; email: string | null; role: string | null }[]
    | null;
}

interface ComboItem {
  purchase_order_id: string;
  total_price: number | null;
  variants?: {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  } | {
    name: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  }[] | null;
}

interface KeyAccountComboAnalyticsTabProps {
  orders: ComboOrder[];
  items: ComboItem[];
  clients: ClientOption[];
  people: PersonOption[];
  formatCurrency: (value: number) => string;
  dateRangeFilter: DateRangeFilterValue;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  paymentRows?: KeyAccountDashboardPaymentRow[];
}

type GroupByType = 'client' | 'city' | 'shop' | 'brand' | 'agent';

interface PaymentBuckets {
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
}

interface ComboRow extends PaymentBuckets {
  key: string;
  label: string;
  orders: number;
  clients: number;
  shops: number;
  totalRevenue: number;
}

interface DetailBrandRow {
  brand: string;
  lineRevenue: number;
  share: number;
}

interface DetailPoRow {
  id: string;
  poNumber: string;
  orderDate: string;
  clientName: string;
  shopName: string;
  isConsignment: boolean;
  totalAmount: number;
  paidRevenue: number;
  settlementDiscountRevenue: number;
  remainingBalance: number;
  consignmentRevenue: number;
  paymentStatus: string;
}

const EMPTY_PAYMENT_ROWS: KeyAccountDashboardPaymentRow[] = [];
const UNKNOWN = 'Unknown';
const CHART_TOP_N = 12;

const PAYMENT_COLORS = {
  paidRevenue: '#22c55e',
  remainingRevenue: '#f97316',
  consignmentRevenue: '#0ea5e9',
  settlementDiscountRevenue: '#64748b',
} as const;

function emptyBuckets(): PaymentBuckets {
  return {
    paidRevenue: 0,
    partialRevenue: 0,
    unpaidRevenue: 0,
    consignmentRevenue: 0,
    settlementDiscountRevenue: 0,
  };
}

function scaleBuckets(buckets: PaymentBuckets, factor: number): PaymentBuckets {
  if (factor === 1) return { ...buckets };
  if (factor <= 0) return emptyBuckets();
  return {
    paidRevenue: buckets.paidRevenue * factor,
    partialRevenue: buckets.partialRevenue * factor,
    unpaidRevenue: buckets.unpaidRevenue * factor,
    consignmentRevenue: buckets.consignmentRevenue * factor,
    settlementDiscountRevenue: buckets.settlementDiscountRevenue * factor,
  };
}

function addBuckets(target: PaymentBuckets, source: PaymentBuckets) {
  target.paidRevenue += source.paidRevenue;
  target.partialRevenue += source.partialRevenue;
  target.unpaidRevenue += source.unpaidRevenue;
  target.consignmentRevenue += source.consignmentRevenue;
  target.settlementDiscountRevenue += source.settlementDiscountRevenue;
}

function totalBuckets(buckets: PaymentBuckets) {
  return (
    buckets.paidRevenue +
    buckets.partialRevenue +
    buckets.unpaidRevenue +
    buckets.consignmentRevenue +
    buckets.settlementDiscountRevenue
  );
}

function normalizeToken(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return UNKNOWN;
  return trimmed
    .toLowerCase()
    .replace(/^city of\s+/i, '')
    .replace(/\s+city$/i, '')
    .replace(/\s+/g, ' ');
}

function displayToken(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  return trimmed || UNKNOWN;
}

function resolveLocation(order: ComboOrder) {
  const shop = firstRelation(order.shop);
  const address = firstRelation(order.address);
  const cityRaw = shop?.city || address?.city;
  const regionRaw = shop?.region || address?.region;
  return {
    city: displayToken(cityRaw),
    cityKey: normalizeToken(cityRaw),
    region: displayToken(regionRaw),
    regionKey: normalizeToken(regionRaw),
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
  switch (groupBy) {
    case 'city':
      return 'City';
    case 'shop':
      return 'Shop';
    case 'brand':
      return 'Brand';
    case 'agent':
      return 'Agent';
    default:
      return 'Client';
  }
}

function paymentStatusBadgeClass(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-600 text-white';
    case 'partial':
      return 'bg-amber-500 text-white';
    case 'consignment':
      return 'border-amber-300 text-amber-800 bg-amber-50';
    default:
      return 'bg-slate-500 text-white';
  }
}

function paymentLegendLabel(value: string) {
  switch (value) {
    case 'paidRevenue':
      return 'Paid';
    case 'remainingRevenue':
      return 'Remaining balance';
    case 'consignmentRevenue':
      return 'Consignment';
    default:
      return 'Settlement disc.';
  }
}

function itemBrand(item: ComboItem): string {
  const variant = firstRelation(item.variants);
  return displayToken(firstRelation(variant?.brands)?.name);
}

export default function KeyAccountComboAnalyticsTab({
  orders,
  items,
  clients,
  people,
  formatCurrency,
  dateRangeFilter,
  onDateRangeFilterChange,
  paymentRows = EMPTY_PAYMENT_ROWS,
}: KeyAccountComboAnalyticsTabProps) {
  const { toast } = useToast();
  const [groupBy, setGroupBy] = useState<GroupByType>('client');
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const [periodPoPage, setPeriodPoPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ComboRow | null>(null);

  const paymentsByOrderId = useMemo(() => {
    const map = new Map<string, KeyAccountDashboardPaymentRow[]>();
    paymentRows.forEach((row) => {
      const list = map.get(row.purchase_order_id) || [];
      list.push(row);
      map.set(row.purchase_order_id, list);
    });
    return map;
  }, [paymentRows]);

  const brandsByOrderId = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    items.forEach((item) => {
      const brand = itemBrand(item);
      const brandKey = normalizeToken(brand);
      const lineTotal = Number(item.total_price) || 0;
      if (!map.has(item.purchase_order_id)) {
        map.set(item.purchase_order_id, new Map());
      }
      const brandMap = map.get(item.purchase_order_id)!;
      brandMap.set(brandKey, (brandMap.get(brandKey) || 0) + lineTotal);
    });
    return map;
  }, [items]);

  const brandDisplayByKey = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => {
      const brand = itemBrand(item);
      const key = normalizeToken(brand);
      if (!map.has(key)) map.set(key, brand);
    });
    return map;
  }, [items]);

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

  const agentOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    people.forEach((person) => {
      map.set(person.id, {
        id: person.id,
        name: person.full_name || person.email || 'Unknown agent',
      });
    });
    orders.forEach((order) => {
      if (!order.kam_id || map.has(order.kam_id)) return;
      const kam = firstRelation(order.kam);
      map.set(order.kam_id, {
        id: order.kam_id,
        name: kam?.full_name || kam?.email || 'Unknown agent',
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, people]);

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => {
      if (order.analytics_only) return;
      if (!isKeyAccountDashboardSalesOrder(order)) return;
      const location = resolveLocation(order);
      if (!map.has(location.regionKey)) map.set(location.regionKey, location.region);
    });
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [orders]);

  const brandOptions = useMemo(() => {
    return Array.from(brandDisplayByKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [brandDisplayByKey]);

  const selectedClientLabel = useMemo(() => {
    if (selectedClient === 'all') return 'All clients';
    const match = clientOptions.find((c) => c.id === selectedClient);
    return match ? formatClientLabel(match) : 'Select client';
  }, [clientOptions, selectedClient]);

  const selectedRegionLabel =
    selectedRegion === 'all'
      ? 'All regions'
      : regionOptions.find((r) => r.key === selectedRegion)?.label || 'Select region';

  const selectedAgentLabel =
    selectedAgent === 'all'
      ? 'All agents'
      : agentOptions.find((a) => a.id === selectedAgent)?.name || 'Select agent';

  const selectedBrandLabel =
    selectedBrand === 'all'
      ? 'All brands'
      : brandOptions.find((b) => b.key === selectedBrand)?.label || 'Select brand';

  const computePeriodPaymentBuckets = (order: ComboOrder): PaymentBuckets => {
    const total = Number(order.total_amount) || 0;
    const rows = paymentsByOrderId.get(order.id) || [];
    const orderInRange = isDateInRange(order.order_date, dateRange.start, dateRange.end);
    const isConsignment = isKeyAccountConsignmentOrder(order);

    // Match dashboard Revenue Overview exactly:
    // - consignment float by order_date
    // - consignment cash + settlement discount by payment created_at
    if (isConsignment) {
      const chunks = getCappedConsignmentPaymentChunks(total, rows);
      let paidRevenue = 0;
      let settlementDiscountRevenue = 0;
      chunks.forEach((chunk) => {
        if (!isDateInRange(chunk.created_at, dateRange.start, dateRange.end)) return;
        paidRevenue += chunk.amount;
        settlementDiscountRevenue += chunk.settlement_discount;
      });

      let consignmentRevenue = 0;
      if (orderInRange) {
        const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
        const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
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

    if (!orderInRange) return emptyBuckets();

    const cash = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const discount = rows.reduce((sum, row) => sum + Number(row.settlement_discount || 0), 0);
    const split = splitKeyAccountPoPaymentRevenue(total, cash, false, discount);
    return {
      paidRevenue: split.paidRevenue,
      partialRevenue: split.partialRevenue,
      unpaidRevenue: split.unpaidRevenue,
      consignmentRevenue: 0,
      settlementDiscountRevenue: split.settlementDiscountRevenue,
    };
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (order.analytics_only) return false;

      const status = String(order.status || '').toLowerCase();
      const workflow = String(order.workflow_status || '').toLowerCase();
      const cancelled =
        status === 'cancelled' ||
        status === 'rejected' ||
        workflow === 'cancelled' ||
        workflow === 'rejected';
      if (cancelled) return false;

      const isConsignment = isKeyAccountConsignmentOrder(order);
      // Keep all active consignments (payment-date cash can fall in this period even when
      // order_date is earlier). Standard POs use the dashboard sales gate.
      if (!isConsignment && !isKeyAccountDashboardSalesOrder(order)) return false;

      if (selectedClient !== 'all' && order.key_account_client_id !== selectedClient) return false;
      if (selectedAgent !== 'all' && order.kam_id !== selectedAgent) return false;

      const location = resolveLocation(order);
      if (selectedRegion !== 'all' && location.regionKey !== selectedRegion) return false;

      if (selectedBrand !== 'all') {
        const brandMap = brandsByOrderId.get(order.id);
        if (!brandMap || !brandMap.has(selectedBrand)) return false;
      }

      return true;
    });
  }, [brandsByOrderId, orders, selectedAgent, selectedBrand, selectedClient, selectedRegion]);

  const contributingOrders = useMemo(() => {
    return filteredOrders.filter(
      (order) => totalBuckets(computePeriodPaymentBuckets(order)) > 0
    );
  }, [dateRange.end, dateRange.start, filteredOrders, paymentsByOrderId]);

  const resolveEntity = (order: ComboOrder, brandKey?: string) => {
    const location = resolveLocation(order);
    const client = firstRelation(order.client);
    const kam = firstRelation(order.kam);

    switch (groupBy) {
      case 'city':
        return { key: location.cityKey, label: location.city };
      case 'shop':
        return {
          key: location.shopId || `unknown-shop-${order.id}`,
          label: location.shopName,
        };
      case 'brand':
        return {
          key: brandKey || UNKNOWN,
          label: brandDisplayByKey.get(brandKey || UNKNOWN) || UNKNOWN,
        };
      case 'agent':
        return {
          key: order.kam_id || 'unassigned',
          label: kam?.full_name || kam?.email || 'Unassigned',
        };
      default: {
        const clientId = order.key_account_client_id || 'unknown-client';
        const option = clientOptions.find((c) => c.id === clientId);
        return {
          key: clientId,
          label: option
            ? formatClientLabel(option)
            : client?.client_name || 'Unknown client',
        };
      }
    }
  };

  const comboRows = useMemo(() => {
    type Acc = PaymentBuckets & {
      label: string;
      orderIds: Set<string>;
      clientIds: Set<string>;
      shopIds: Set<string>;
    };
    const map = new Map<string, Acc>();

    const touch = (key: string, label: string, order: ComboOrder, buckets: PaymentBuckets) => {
      if (!map.has(key)) {
        map.set(key, {
          label,
          orderIds: new Set(),
          clientIds: new Set(),
          shopIds: new Set(),
          ...emptyBuckets(),
        });
      }
      const bucket = map.get(key)!;
      bucket.orderIds.add(order.id);
      if (order.key_account_client_id) bucket.clientIds.add(order.key_account_client_id);
      const location = resolveLocation(order);
      if (location.shopId) bucket.shopIds.add(location.shopId);
      addBuckets(bucket, buckets);
    };

    contributingOrders.forEach((order) => {
      const payment = computePeriodPaymentBuckets(order);
      if (totalBuckets(payment) <= 0) return;

      if (groupBy === 'brand') {
        const brandMap = brandsByOrderId.get(order.id);
        if (!brandMap || brandMap.size === 0) {
          if (selectedBrand !== 'all') return;
          const entity = resolveEntity(order, UNKNOWN);
          touch(entity.key, entity.label, order, payment);
          return;
        }

        const lineTotal = Array.from(brandMap.values()).reduce((sum, value) => sum + value, 0);

        if (selectedBrand !== 'all') {
          const selectedLine = brandMap.get(selectedBrand) || 0;
          if (selectedLine <= 0) return;
          const factor = lineTotal > 0 ? selectedLine / lineTotal : 1;
          const entity = resolveEntity(order, selectedBrand);
          touch(entity.key, entity.label, order, scaleBuckets(payment, factor));
          return;
        }

        if (lineTotal <= 0) {
          const equalShare = 1 / brandMap.size;
          brandMap.forEach((_value, brandKey) => {
            const entity = resolveEntity(order, brandKey);
            touch(entity.key, entity.label, order, scaleBuckets(payment, equalShare));
          });
          return;
        }

        brandMap.forEach((value, brandKey) => {
          const entity = resolveEntity(order, brandKey);
          touch(entity.key, entity.label, order, scaleBuckets(payment, value / lineTotal));
        });
        return;
      }

      const entity = resolveEntity(order);
      touch(entity.key, entity.label, order, payment);
    });

    const rows: ComboRow[] = Array.from(map.entries()).map(([key, data]) => ({
      key,
      label: data.label,
      orders: data.orderIds.size,
      clients: data.clientIds.size,
      shops: data.shopIds.size,
      paidRevenue: data.paidRevenue,
      partialRevenue: data.partialRevenue,
      unpaidRevenue: data.unpaidRevenue,
      consignmentRevenue: data.consignmentRevenue,
      settlementDiscountRevenue: data.settlementDiscountRevenue,
      totalRevenue: totalBuckets(data),
    }));

    rows.sort((a, b) => b.totalRevenue - a.totalRevenue);
    return rows;
  }, [
    brandDisplayByKey,
    brandsByOrderId,
    clientOptions,
    contributingOrders,
    dateRange.end,
    dateRange.start,
    groupBy,
    paymentsByOrderId,
    selectedBrand,
  ]);

  const summary = useMemo(() => {
    const totals = comboRows.reduce(
      (acc, row) => {
        acc.paidRevenue += row.paidRevenue;
        acc.partialRevenue += row.partialRevenue;
        acc.unpaidRevenue += row.unpaidRevenue;
        acc.consignmentRevenue += row.consignmentRevenue;
        acc.settlementDiscountRevenue += row.settlementDiscountRevenue;
        acc.totalRevenue += row.totalRevenue;
        return acc;
      },
      { ...emptyBuckets(), totalRevenue: 0 }
    );

    const uniqueOrders = contributingOrders.length;
    const top = comboRows[0] || null;
    const paidPct =
      totals.totalRevenue > 0 ? (totals.paidRevenue / totals.totalRevenue) * 100 : 0;

    return {
      entities: comboRows.length,
      uniqueOrders,
      totalRevenue: totals.totalRevenue,
      paidRevenue: totals.paidRevenue,
      paidPct,
      top,
    };
  }, [comboRows, contributingOrders.length]);

  const chartData = useMemo(
    () =>
      comboRows.slice(0, CHART_TOP_N).map((row) => ({
        key: row.key,
        label: row.label,
        paidRevenue: Math.round(row.paidRevenue),
        remainingRevenue: Math.round(row.partialRevenue + row.unpaidRevenue),
        consignmentRevenue: Math.round(row.consignmentRevenue),
        settlementDiscountRevenue: Math.round(row.settlementDiscountRevenue),
        totalRevenue: Math.round(row.totalRevenue),
        orders: row.orders,
      })),
    [comboRows]
  );

  const paginatedRows = useMemo(
    () => paginateAnalyticsRows(comboRows, tablePage),
    [comboRows, tablePage]
  );

  useEffect(() => {
    setTablePage(1);
  }, [
    groupBy,
    selectedClient,
    selectedRegion,
    selectedAgent,
    selectedBrand,
    dateRangeFilter.preset,
    dateRangeFilter.customStart,
    dateRangeFilter.customEnd,
  ]);

  const detailBrandRows = useMemo((): DetailBrandRow[] => {
    if (!selectedRow || groupBy === 'brand') return [];

    const brandTotals = new Map<string, number>();
    let grand = 0;

    contributingOrders.forEach((order) => {
      const entity = resolveEntity(order);
      if (entity.key !== selectedRow.key) return;
      const brandMap = brandsByOrderId.get(order.id);
      if (!brandMap) return;
      brandMap.forEach((value, brandKey) => {
        brandTotals.set(brandKey, (brandTotals.get(brandKey) || 0) + value);
        grand += value;
      });
    });

    return Array.from(brandTotals.entries())
      .map(([key, lineRevenue]) => ({
        brand: brandDisplayByKey.get(key) || UNKNOWN,
        lineRevenue,
        share: grand > 0 ? lineRevenue / grand : 0,
      }))
      .sort((a, b) => b.lineRevenue - a.lineRevenue)
      .slice(0, 15);
  }, [brandDisplayByKey, brandsByOrderId, contributingOrders, groupBy, selectedRow]);

  const buildPeriodPoRow = (order: ComboOrder): DetailPoRow | null => {
    const payment = computePeriodPaymentBuckets(order);
    if (totalBuckets(payment) <= 0) return null;

    const location = resolveLocation(order);
    const client = firstRelation(order.client);
    const isConsignment = isKeyAccountConsignmentOrder(order);
    const rows = paymentsByOrderId.get(order.id) || [];
    const total = Number(order.total_amount) || 0;

    let remainingBalance = 0;
    let paymentStatus = 'unpaid';

    if (isConsignment) {
      const chunks = getCappedConsignmentPaymentChunks(total, rows);
      const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
      const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
      remainingBalance = Math.max(
        0,
        Math.round((total - paidAll - discountAll) * 100) / 100
      );
      paymentStatus =
        remainingBalance <= 0
          ? 'paid'
          : paidAll > 0 || discountAll > 0
            ? 'partial'
            : 'consignment';
    } else {
      remainingBalance = payment.partialRevenue + payment.unpaidRevenue;
      paymentStatus =
        payment.unpaidRevenue > 0
          ? 'unpaid'
          : remainingBalance > 0
            ? 'partial'
            : 'paid';
    }

    return {
      id: order.id,
      poNumber: order.po_number,
      orderDate: order.order_date,
      clientName: client?.client_name || 'Unknown client',
      shopName: location.shopName,
      isConsignment,
      totalAmount: total,
      paidRevenue: payment.paidRevenue,
      settlementDiscountRevenue: payment.settlementDiscountRevenue,
      // Rem. column matches dashboard: dash for consignment rows.
      remainingBalance: isConsignment ? 0 : remainingBalance,
      consignmentRevenue: payment.consignmentRevenue,
      paymentStatus,
    };
  };

  const detailPoRows = useMemo((): DetailPoRow[] => {
    if (!selectedRow) return [];

    const rows: DetailPoRow[] = [];
    contributingOrders.forEach((order) => {
      if (groupBy === 'brand') {
        const brandMap = brandsByOrderId.get(order.id);
        if (!brandMap?.has(selectedRow.key)) return;
      } else {
        const entity = resolveEntity(order);
        if (entity.key !== selectedRow.key) return;
      }

      const row = buildPeriodPoRow(order);
      if (row) rows.push(row);
    });

    return rows
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
      .slice(0, 50);
  }, [
    brandsByOrderId,
    contributingOrders,
    dateRange.end,
    dateRange.start,
    groupBy,
    paymentsByOrderId,
    selectedRow,
  ]);

  const periodPoRows = useMemo((): DetailPoRow[] => {
    return contributingOrders
      .map((order) => buildPeriodPoRow(order))
      .filter((row): row is DetailPoRow => row != null)
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }, [contributingOrders, dateRange.end, dateRange.start, paymentsByOrderId]);

  const paginatedPeriodPoRows = useMemo(
    () => paginateAnalyticsRows(periodPoRows, periodPoPage),
    [periodPoPage, periodPoRows]
  );

  useEffect(() => {
    setPeriodPoPage(1);
  }, [
    groupBy,
    selectedClient,
    selectedRegion,
    selectedAgent,
    selectedBrand,
    dateRangeFilter.preset,
    dateRangeFilter.customStart,
    dateRangeFilter.customEnd,
  ]);

  const openDetail = (row: ComboRow) => {
    setSelectedRow(row);
    setDetailOpen(true);
  };

  const handleExportExcel = async () => {
    if (comboRows.length === 0) return;
    setExporting(true);
    try {
      const rows: KeyAccountComboAnalyticsExportRow[] = comboRows.map((row) => ({
        entity: row.label,
        orders: row.orders,
        clients: row.clients,
        shops: row.shops,
        paidRevenue: row.paidRevenue,
        remainingRevenue: row.partialRevenue + row.unpaidRevenue,
        consignmentRevenue: row.consignmentRevenue,
        settlementDiscountRevenue: row.settlementDiscountRevenue,
        totalRevenue: row.totalRevenue,
      }));

      await exportKeyAccountComboAnalyticsExcel(rows, {
        dateRangeLabel,
        groupByLabel: groupByLabel(groupBy),
        clientLabel: selectedClientLabel,
        regionLabel: selectedRegionLabel,
        agentLabel: selectedAgentLabel,
        brandLabel: selectedBrandLabel,
        entityCount: comboRows.length,
        totalOrders: summary.uniqueOrders,
        totalRevenue: summary.totalRevenue,
      });

      toast({
        title: 'Export ready',
        description: `Exported ${rows.length} ${groupByLabel(groupBy).toLowerCase()} rows.`,
      });
    } catch (error) {
      console.error('Overview analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not export overview analytics.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {groupByLabel(groupBy)}s
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.entities}</div>
            <p className="text-xs text-muted-foreground mt-1">{dateRangeLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Payment revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Paid {formatCurrency(summary.paidRevenue)} ({summary.paidPct.toFixed(0)}%)
            </p>
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
            <div className="text-2xl font-bold">{summary.uniqueOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">In selected filters</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Top {groupByLabel(groupBy).toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{summary.top?.label || '—'}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.top ? formatCurrency(summary.top.totalRevenue) : 'No data'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview — payment mix</CardTitle>
          <CardDescription>
            Stacked payment mix by {groupByLabel(groupBy).toLowerCase()}. Consignment float uses PO
            order date; consignment cash/discount uses payment date (same as Client Analytics) —{' '}
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
                  <Label>Group by (base)</Label>
                  <Select
                    value={groupBy}
                    onValueChange={(value) => setGroupBy(value as GroupByType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="city">City</SelectItem>
                      <SelectItem value="shop">Shop</SelectItem>
                      <SelectItem value="brand">Brand</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
                  <Label>Agent</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All agents</SelectItem>
                      {agentOptions.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Brand</Label>
                  <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brandOptions.map((brand) => (
                        <SelectItem key={brand.key} value={brand.key}>
                          {brand.label}
                        </SelectItem>
                      ))}
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
                  disabled={exporting || comboRows.length === 0}
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
                  <CardTitle className="text-base">
                    Top {groupByLabel(groupBy).toLowerCase()}s — payment status
                  </CardTitle>
                  <CardDescription>
                    {selectedClientLabel} · {selectedRegionLabel} · {selectedAgentLabel} ·{' '}
                    {selectedBrandLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
                      No data for the selected filters
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={360}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 8, right: 8, left: 8, bottom: 56 }}
                        onClick={(state) => {
                          const label = String(state?.activeLabel || '');
                          const row = comboRows.find((entry) => entry.label === label);
                          if (row) openDetail(row);
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-28}
                          textAnchor="end"
                          height={70}
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
                                  {formatCurrency(row.totalRevenue)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Paid {formatCurrency(row.paidRevenue)} · Remaining{' '}
                                  {formatCurrency(row.remainingRevenue)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Consignment {formatCurrency(row.consignmentRevenue)} · Settlement
                                  disc. {formatCurrency(row.settlementDiscountRevenue)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {row.orders} POs · click for detail
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Legend formatter={paymentLegendLabel} />
                        <Bar
                          dataKey="paidRevenue"
                          stackId="revenue"
                          fill={PAYMENT_COLORS.paidRevenue}
                          name="paidRevenue"
                        />
                        <Bar
                          dataKey="remainingRevenue"
                          stackId="revenue"
                          fill={PAYMENT_COLORS.remainingRevenue}
                          name="remainingRevenue"
                        />
                        <Bar
                          dataKey="consignmentRevenue"
                          stackId="revenue"
                          fill={PAYMENT_COLORS.consignmentRevenue}
                          name="consignmentRevenue"
                        />
                        <Bar
                          dataKey="settlementDiscountRevenue"
                          stackId="revenue"
                          fill={PAYMENT_COLORS.settlementDiscountRevenue}
                          name="settlementDiscountRevenue"
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
                    Payment mix by {groupByLabel(groupBy).toLowerCase()} · click View for detail
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{groupByLabel(groupBy)}</TableHead>
                          <TableHead className="text-right">POs</TableHead>
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
                              colSpan={7}
                              className="text-center text-muted-foreground py-8"
                            >
                              No overview data found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedRows.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Badge variant="outline" className="shrink-0">
                                    {groupByLabel(groupBy)}
                                  </Badge>
                                  <span className="truncate">{row.label}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{row.orders}</TableCell>
                              <TableCell className="text-right text-emerald-700 dark:text-emerald-400">
                                {formatCurrency(row.paidRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-orange-700 dark:text-orange-400">
                                {formatCurrency(row.partialRevenue + row.unpaidRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-sky-700 dark:text-sky-400">
                                {formatCurrency(row.consignmentRevenue)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrency(row.totalRevenue)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title={`View detail for ${row.label}`}
                                  onClick={() => openDetail(row)}
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
                      totalRows={comboRows.length}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">POs in period</CardTitle>
          <CardDescription>
            Same rules as dashboard Revenue Overview: standard POs by order date; consignment float by
            order date; consignment cash by payment date — {dateRangeLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Settlement disc.</TableHead>
                  <TableHead className="text-right">Cons.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Rem.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPeriodPoRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No purchase orders contribute to this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPeriodPoRows.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <p className="font-medium text-sm">{po.poNumber}</p>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">{po.orderDate}</span>
                            {po.isConsignment ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50 px-1.5 py-0"
                              >
                                Consignment
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">{po.clientName}</TableCell>
                      <TableCell className="text-right align-top text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {po.paidRevenue > 0 ? formatCurrency(po.paidRevenue) : '—'}
                      </TableCell>
                      <TableCell className="text-right align-top text-slate-600 dark:text-slate-300 tabular-nums">
                        {po.settlementDiscountRevenue > 0
                          ? formatCurrency(po.settlementDiscountRevenue)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right align-top text-sky-700 dark:text-sky-400 tabular-nums">
                        {po.consignmentRevenue > 0 ? formatCurrency(po.consignmentRevenue) : '—'}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {formatCurrency(po.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right align-top font-medium tabular-nums">
                        {po.isConsignment
                          ? '—'
                          : formatCurrency(po.remainingBalance)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={po.paymentStatus === 'consignment' ? 'outline' : 'default'}
                          className={`text-[10px] px-1.5 ${paymentStatusBadgeClass(po.paymentStatus)}`}
                        >
                          {po.paymentStatus.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <AnalyticsTablePagination
              page={periodPoPage}
              onPageChange={setPeriodPoPage}
              totalRows={periodPoRows.length}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {periodPoRows.length} PO{periodPoRows.length === 1 ? '' : 's'} in period
            {selectedClient !== 'all' ? ` · ${selectedClientLabel}` : ''}
          </p>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRow?.label || 'Entity'} — overview detail
            </DialogTitle>
            <DialogDescription>
              {groupByLabel(groupBy)} detail for {dateRangeLabel}
              {selectedRow
                ? ` · ${selectedRow.orders} POs · ${formatCurrency(selectedRow.totalRevenue)} total`
                : ''}
              .
            </DialogDescription>
          </DialogHeader>

          {selectedRow && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(selectedRow.paidRevenue)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Remaining balance</p>
                  <p className="font-semibold text-orange-700 dark:text-orange-400">
                    {formatCurrency(selectedRow.partialRevenue + selectedRow.unpaidRevenue)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Consignment</p>
                  <p className="font-semibold text-sky-700 dark:text-sky-400">
                    {formatCurrency(selectedRow.consignmentRevenue)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Settlement disc.</p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    {formatCurrency(selectedRow.settlementDiscountRevenue)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {groupBy !== 'brand' && detailBrandRows.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-1">Brand mix on these POs</h4>
              <p className="text-xs text-muted-foreground mb-2">
                Based on PO item line values for the selected purchase orders. This shows product
                mix, not cash paid, remaining balance, or settlement discount share.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead
                        className="text-right"
                        title="Sum of PO item total_price for this brand across the selected purchase orders"
                      >
                        PO line value
                      </TableHead>
                      <TableHead
                        className="text-right"
                        title="This brand's PO line value divided by total PO line value of all brands in the selected purchase orders"
                      >
                        Share of PO mix
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailBrandRows.map((row) => (
                      <TableRow key={row.brand}>
                        <TableCell className="font-medium">{row.brand}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.lineRevenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(row.share * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium mb-2">Purchase orders</h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Settlement disc.</TableHead>
                    <TableHead className="text-right">Cons.</TableHead>
                    <TableHead className="text-right">Rem.</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailPoRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-muted-foreground py-6"
                      >
                        No purchase orders found for this {groupByLabel(groupBy).toLowerCase()}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailPoRows.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="font-medium">{po.poNumber}</p>
                            {po.isConsignment ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50 px-1.5 py-0"
                              >
                                Consignment
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">{po.orderDate}</TableCell>
                        <TableCell className="align-top">{po.clientName}</TableCell>
                        <TableCell className="text-right align-top text-emerald-700 dark:text-emerald-400">
                          {po.paidRevenue > 0 ? formatCurrency(po.paidRevenue) : '—'}
                        </TableCell>
                        <TableCell className="text-right align-top text-slate-600 dark:text-slate-300">
                          {po.settlementDiscountRevenue > 0
                            ? formatCurrency(po.settlementDiscountRevenue)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right align-top text-sky-700 dark:text-sky-400">
                          {po.consignmentRevenue > 0 ? formatCurrency(po.consignmentRevenue) : '—'}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          {po.isConsignment ? '—' : formatCurrency(po.remainingBalance)}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={po.paymentStatus === 'consignment' ? 'outline' : 'default'}
                            className={`text-[10px] px-1.5 ${paymentStatusBadgeClass(po.paymentStatus)}`}
                          >
                            {po.paymentStatus.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
