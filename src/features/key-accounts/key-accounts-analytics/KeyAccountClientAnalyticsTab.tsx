import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
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
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Eye,
  FileDown,
  Filter,
  Loader2,
  ShoppingCart,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
} from '@/lib/dateRangePresets';
import { exportKeyAccountClientAnalyticsExcel } from './exportKeyAccountClientAnalyticsExcel';
import {
  getCappedConsignmentPaymentChunks,
  splitKeyAccountPoPaymentRevenue,
  type KeyAccountDashboardPaymentRow,
} from '../dashboard/keyAccountDashboardRevenue';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';
import {
  getKeyAccountOrderNetRevenueFromAttribution,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountConsignmentOrder,
  isKeyAccountProductAnalyticsOrder,
  type KeyAccountOrderRevenueAttribution,
} from './keyAccountAnalyticsShared';

interface ClientOption {
  id: string;
  client_name: string;
  client_code: string | null;
}

interface ClientAnalyticsOrder {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  key_account_client_id: string | null;
  key_account_payment_status?: string | null;
  key_account_payment_mode?: string | null;
  analytics_only?: boolean;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
}

interface ClientAnalyticsItem {
  id: string;
  purchase_order_id: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  variants?: {
    name: string | null;
    variant_type?: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  } | {
    name: string | null;
    variant_type?: string | null;
    brands?: { name: string | null } | { name: string | null }[] | null;
  }[] | null;
}

interface PoLineItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  brand: string;
  variant: string;
  variantType: string;
}

interface PaymentHistoryRow {
  id: string;
  amount: number | null;
  created_at: string;
  payment_method?: string | null;
  bank_type?: string | null;
  recorder?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
}

interface ChartDateRange {
  from?: Date;
  to?: Date;
}

interface KeyAccountClientAnalyticsTabProps {
  orders: ClientAnalyticsOrder[];
  items: ClientAnalyticsItem[];
  clients: ClientOption[];
  formatCurrency: (value: number) => string;
  chartDateRange?: ChartDateRange;
  usePageDateFilter?: boolean;
  dateRangeFilter?: DateRangeFilterValue;
  onDateRangeFilterChange?: (value: DateRangeFilterValue) => void;
  orderRevenueById?: Map<string, KeyAccountOrderRevenueAttribution>;
  paymentRows?: KeyAccountDashboardPaymentRow[];
}

const EMPTY_ORDER_REVENUE_MAP = new Map<string, KeyAccountOrderRevenueAttribution>();
const EMPTY_PAYMENT_ROWS: KeyAccountDashboardPaymentRow[] = [];

interface ClientPaymentPeriodRow {
  month: string;
  periodStart: string;
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

type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_year' | 'custom';

interface DateRange {
  from?: Date;
  to?: Date;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isDeliveredRevenue(order: { status?: string | null; workflow_status?: string | null }) {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfYear(date: Date) {
  return endOfDay(new Date(date.getFullYear(), 11, 31));
}

function subMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() - amount, date.getDate());
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatDateInput(date?: Date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function presetRange(preset: DatePreset): DateRange | undefined {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'last_month': {
      const lastMonth = subMonths(now, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case 'last_3_months':
      return { from: startOfDay(subMonths(now, 3)), to: endOfDay(now) };
    case 'last_6_months':
      return { from: startOfDay(subMonths(now, 6)), to: endOfDay(now) };
    case 'this_year':
      return { from: startOfYear(now), to: endOfDay(now) };
    case 'last_year': {
      const lastYear = new Date(now.getFullYear() - 1, 0, 1);
      return { from: startOfYear(lastYear), to: endOfYear(lastYear) };
    }
    case 'all':
    default:
      return undefined;
  }
}

function inRange(dateValue: string, range?: DateRange) {
  if (!range?.from) return true;
  const date = new Date(dateValue);
  const from = startOfDay(range.from);
  const to = range.to ? endOfDay(range.to) : endOfDay(range.from);
  return date >= from && date <= to;
}

function paymentStatusBadgeClass(status: string | null | undefined) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-600 text-white';
    case 'partial':
      return 'bg-amber-500 text-white';
    default:
      return 'bg-slate-500 text-white';
  }
}

function workflowBadgeClass(status: string | null | undefined) {
  switch (status) {
    case 'delivered':
      return 'bg-green-100 text-green-800';
    case 'fulfilled':
      return 'bg-emerald-100 text-emerald-800';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

function formatClientLabel(client: ClientOption) {
  return client.client_code ? `${client.client_name} (${client.client_code})` : client.client_name;
}

function clientInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function buildMonthlyPeriods(orders: ClientAnalyticsOrder[], range?: DateRange) {
  const realOrders = orders.filter((o) => !o.analytics_only && o.order_date);
  const orderedDates = realOrders
    .map((o) => new Date(o.order_date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  let start: Date;
  let end: Date;

  if (range?.from) {
    start = startOfMonth(range.from);
    end = range.to ? endOfMonth(range.to) : endOfMonth(range.from);
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

function mapLineItems(rows: ClientAnalyticsItem[]): PoLineItem[] {
  return rows.map((row) => {
    const variant = firstRelation(row.variants);
    const brand = firstRelation(variant?.brands)?.name || '—';
    const quantity = Number(row.quantity || 0);
    const unitPrice = Number(row.unit_price || 0);
    const totalPrice = Number(row.total_price ?? quantity * unitPrice);
    return {
      id: row.id,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      brand,
      variant: variant?.name || '—',
      variantType: variant?.variant_type || '—',
    };
  });
}

export default function KeyAccountClientAnalyticsTab({
  orders,
  items,
  clients,
  formatCurrency,
  chartDateRange,
  usePageDateFilter = false,
  dateRangeFilter,
  onDateRangeFilterChange,
  orderRevenueById = EMPTY_ORDER_REVENUE_MAP,
  paymentRows = EMPTY_PAYMENT_ROWS,
}: KeyAccountClientAnalyticsTabProps) {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [itemsDialogOrder, setItemsDialogOrder] = useState<ClientAnalyticsOrder | null>(null);
  const [dialogPayments, setDialogPayments] = useState<PaymentHistoryRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dialogPaidTotal, setDialogPaidTotal] = useState<number | null>(null);
  const [dialogPaymentCount, setDialogPaymentCount] = useState(0);
  const [dialogPaymentLoading, setDialogPaymentLoading] = useState(false);
  const [dialogRebateSource, setDialogRebateSource] = useState<{
    rebate_number: string;
    source_po_number: string;
  } | null>(null);
  const [poHistoryPage, setPoHistoryPage] = useState(1);
  const [poHistorySearch, setPoHistorySearch] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [periodDetailOpen, setPeriodDetailOpen] = useState(false);
  const [selectedPeriodRow, setSelectedPeriodRow] = useState<ClientPaymentPeriodRow | null>(null);

  const itemsByOrderId = useMemo(() => {
    const map = new Map<string, ClientAnalyticsItem[]>();
    items.forEach((item) => {
      const list = map.get(item.purchase_order_id) || [];
      list.push(item);
      map.set(item.purchase_order_id, list);
    });
    return map;
  }, [items]);

  const paymentsByOrderId = useMemo(() => {
    const map = new Map<string, KeyAccountDashboardPaymentRow[]>();
    paymentRows.forEach((row) => {
      const list = map.get(row.purchase_order_id) || [];
      list.push(row);
      map.set(row.purchase_order_id, list);
    });
    return map;
  }, [paymentRows]);

  const paidByOrderId = useMemo(() => {
    const map = new Map<string, number>();
    paymentRows.forEach((row) => {
      map.set(row.purchase_order_id, (map.get(row.purchase_order_id) || 0) + Number(row.amount || 0));
    });
    return map;
  }, [paymentRows]);

  const pageOrderDateRange = useMemo(() => {
    if (!dateRangeFilter) return undefined;
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const dateRangeLabel = useMemo(() => {
    if (!dateRangeFilter) {
      if (!dateRange?.from) return 'All time';
      const start = formatDateForInput(dateRange.from);
      const end = dateRange.to ? formatDateForInput(dateRange.to) : start;
      return `${start} – ${end}`;
    }
    return getDatePresetLabel(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRange, dateRangeFilter]);

  const effectiveDateRange = useMemo(() => {
    if (usePageDateFilter && pageOrderDateRange) {
      return { from: pageOrderDateRange.start, to: pageOrderDateRange.end };
    }
    if (usePageDateFilter) return chartDateRange;
    return dateRange;
  }, [chartDateRange, dateRange, pageOrderDateRange, usePageDateFilter]);

  const baseOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (order.analytics_only) return false;
        if (!usePageDateFilter && !inRange(order.order_date, dateRange)) return false;
        if (selectedClient !== 'all' && order.key_account_client_id !== selectedClient) return false;
        return true;
      }),
    [dateRange, orders, selectedClient, usePageDateFilter]
  );

  const productRevenueOrders = useMemo(
    () => baseOrders.filter(isKeyAccountAnalyticsEligibleOrder),
    [baseOrders]
  );

  const computePaymentSummary = (scopeOrders: ClientAnalyticsOrder[], period?: DateRange) => {
    let paidRevenue = 0;
    let partialRevenue = 0;
    let unpaidRevenue = 0;
    let consignmentRevenue = 0;
    let settlementDiscountRevenue = 0;
    let paidOrders = 0;
    let partialOrders = 0;
    let unpaidOrders = 0;
    let consignmentOrders = 0;

    const inPeriod = (value: string) => inRange(value, period);

    scopeOrders.forEach((order) => {
      const total = Number(order.total_amount) || 0;
      if (isKeyAccountConsignmentOrder(order)) {
        if (inPeriod(order.order_date)) {
          const chunks = getCappedConsignmentPaymentChunks(total, paymentsByOrderId.get(order.id) || []);
          const paidAll = chunks.reduce((sum, chunk) => sum + chunk.amount, 0);
          const discountAll = chunks.reduce((sum, chunk) => sum + chunk.settlement_discount, 0);
          const remaining = Math.max(0, Math.round((total - paidAll - discountAll) * 100) / 100);
          if (remaining > 0) {
            consignmentRevenue += remaining;
            consignmentOrders += 1;
          }
        }
        const chunks = getCappedConsignmentPaymentChunks(total, paymentsByOrderId.get(order.id) || []);
        chunks.forEach((chunk) => {
          if (inPeriod(chunk.created_at)) {
            paidRevenue += chunk.amount;
            settlementDiscountRevenue += chunk.settlement_discount;
            if (chunk.amount > 0 || chunk.settlement_discount > 0) paidOrders += 1;
          }
        });
        return;
      }

      if (!inPeriod(order.order_date)) return;
      const rows = paymentsByOrderId.get(order.id) || [];
      const cash = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const discount = rows.reduce((sum, row) => sum + Number(row.settlement_discount || 0), 0);
      const split = splitKeyAccountPoPaymentRevenue(total, cash, false, discount);
      paidRevenue += split.paidRevenue;
      partialRevenue += split.partialRevenue;
      unpaidRevenue += split.unpaidRevenue;
      settlementDiscountRevenue += split.settlementDiscountRevenue;
      if (
        (split.paidRevenue > 0 || split.settlementDiscountRevenue > 0) &&
        split.partialRevenue <= 0 &&
        split.unpaidRevenue <= 0
      ) {
        paidOrders += 1;
      }
      if (split.partialRevenue > 0) partialOrders += 1;
      if (split.unpaidRevenue > 0) unpaidOrders += 1;
    });

    return {
      paidRevenue,
      partialRevenue,
      unpaidRevenue,
      consignmentRevenue,
      settlementDiscountRevenue,
      totalRevenue:
        paidRevenue +
        partialRevenue +
        unpaidRevenue +
        consignmentRevenue +
        settlementDiscountRevenue,
      paidOrders,
      partialOrders,
      unpaidOrders,
      consignmentOrders,
    };
  };

  const monthlySalesData = useMemo(() => {
    const periods = buildMonthlyPeriods(orders, effectiveDateRange);
    return periods.map((period) => {
      return {
        month: period.label,
        periodStart: period.start.toISOString(),
        ...computePaymentSummary(productRevenueOrders, { from: period.start, to: period.end }),
      };
    });
  }, [effectiveDateRange, orders, paymentsByOrderId, productRevenueOrders]);

  const poHistory = useMemo(
    () =>
      [...baseOrders].sort(
        (a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      ),
    [baseOrders]
  );

  const filteredPoHistory = useMemo(() => {
    const query = poHistorySearch.trim().toLowerCase();
    if (!query) return poHistory;
    return poHistory.filter((order) => {
      const client = firstRelation(order.client);
      const paymentStatus = String(order.key_account_payment_status || 'unpaid').replace(/_/g, ' ');
      const workflow = String(order.workflow_status || order.status || '').replace(/_/g, ' ');
      const poKind = String(order.po_order_kind || '');
      return [
        order.po_number,
        order.order_date,
        client?.client_name || '',
        paymentStatus,
        workflow,
        poKind,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [poHistory, poHistorySearch]);

  const paginatedPoHistory = useMemo(
    () => paginateAnalyticsRows(filteredPoHistory, poHistoryPage),
    [filteredPoHistory, poHistoryPage]
  );

  useEffect(() => {
    setPoHistoryPage(1);
  }, [
    filteredPoHistory.length,
    selectedClient,
    usePageDateFilter,
    datePreset,
    dateRange?.from,
    dateRange?.to,
    chartDateRange?.from,
    chartDateRange?.to,
    dateRangeFilter?.preset,
    dateRangeFilter?.customStart,
    dateRangeFilter?.customEnd,
    poHistorySearch,
  ]);

  const summary = useMemo(() => {
    const grossRevenue = productRevenueOrders.reduce((sum, order) => {
      const revenue = getKeyAccountOrderNetRevenueFromAttribution(orderRevenueById.get(order.id));
      return sum + revenue.grossRevenue;
    }, 0);
    const rebatedRevenue = productRevenueOrders.reduce((sum, order) => {
      const revenue = getKeyAccountOrderNetRevenueFromAttribution(orderRevenueById.get(order.id));
      return sum + revenue.rebatedRevenue;
    }, 0);
    const payment = computePaymentSummary(productRevenueOrders, effectiveDateRange);
    const deliveredPos = baseOrders.filter(isDeliveredRevenue).length;
    return {
      totalPos: baseOrders.length,
      deliveredPos,
      grossRevenue,
      rebatedRevenue,
      paidRevenue: payment.paidRevenue,
      partialRevenue: payment.partialRevenue,
      unpaidRevenue: payment.unpaidRevenue,
      consignmentRevenue: payment.consignmentRevenue,
      settlementDiscountRevenue: payment.settlementDiscountRevenue,
      totalRevenue: payment.totalRevenue,
      paidCount: payment.paidOrders,
      partialCount: payment.partialOrders,
      unpaidCount: payment.unpaidOrders,
      consignmentCount: payment.consignmentOrders,
    };
  }, [baseOrders, effectiveDateRange, orderRevenueById, paymentsByOrderId, productRevenueOrders]);

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

  const selectedPeriodClientRows = useMemo(() => {
    if (!selectedPeriodRow || selectedClient !== 'all') return [];

    return clientOptions
      .map((client) => {
        const clientOrders = productRevenueOrders.filter((order) => order.key_account_client_id === client.id);
        const monthStart = new Date(selectedPeriodRow.periodStart);
        const payment = computePaymentSummary(clientOrders, {
          from: startOfMonth(monthStart),
          to: endOfMonth(monthStart),
        });
        return {
          id: client.id,
          label: formatClientLabel(client),
          ...payment,
        };
      })
      .filter((row) => row.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [clientOptions, computePaymentSummary, productRevenueOrders, selectedClient, selectedPeriodRow]);

  const setPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') {
      setDateRange(customStartDate ? { from: customStartDate, to: customEndDate || customStartDate } : undefined);
      return;
    }
    setDateRange(presetRange(preset));
  };

  const clearDateRange = () => {
    setDatePreset('all');
    setDateRange(undefined);
    setCustomStartDate(undefined);
    setCustomEndDate(undefined);
  };

  const openItemsDialog = async (order: ClientAnalyticsOrder) => {
    setItemsDialogOrder(order);
    setDialogPayments([]);
    setDialogPaidTotal(null);
    setDialogPaymentCount(0);
    setDialogRebateSource(null);
    setDialogPaymentLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('purchase_order_key_account_payments')
          .select(
            `
            id,
            amount,
            created_at,
            payment_method,
            bank_type,
            recorder:profiles!purchase_order_key_account_payments_recorded_by_fkey(full_name,email)
          `
          )
          .eq('purchase_order_id', order.id)
          .order('created_at', { ascending: true });
        if (error) throw error;
        const rows = (data || []) as PaymentHistoryRow[];
        const paid = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
        setDialogPayments(rows);
        setDialogPaidTotal(paid);
        setDialogPaymentCount(rows.length);
      } catch {
        setDialogPayments([]);
        setDialogPaidTotal(0);
        setDialogPaymentCount(0);
      } finally {
        setDialogPaymentLoading(false);
      }
    })();

    if (String(order.po_order_kind || '') === 'rebate_fulfillment' && order.source_rebate_id) {
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('key_account_po_rebates')
            .select(
              'rebate_number, source_po:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number)'
            )
            .eq('id', order.source_rebate_id)
            .maybeSingle();
          if (error || !data) return;
          const src = (data as any).source_po;
          const poNum = Array.isArray(src) ? src?.[0]?.po_number : src?.po_number;
          if (!poNum) return;
          setDialogRebateSource({
            rebate_number: String((data as any).rebate_number || ''),
            source_po_number: String(poNum || ''),
          });
        } catch {
          setDialogRebateSource(null);
        }
      })();
    }

    setItemsLoading(false);
  };

  const exportPeriodBounds = useMemo(() => {
    if (usePageDateFilter && pageOrderDateRange) {
      return {
        periodStart: pageOrderDateRange.start ? formatDateForInput(pageOrderDateRange.start) : 'all',
        periodEnd: pageOrderDateRange.end ? formatDateForInput(pageOrderDateRange.end) : 'all',
      };
    }
    if (dateRange?.from) {
      return {
        periodStart: formatDateForInput(dateRange.from),
        periodEnd: dateRange.to ? formatDateForInput(dateRange.to) : formatDateForInput(dateRange.from),
      };
    }
    return { periodStart: 'all', periodEnd: 'all' };
  }, [dateRange, pageOrderDateRange, usePageDateFilter]);

  const handleExportExcel = async () => {
    if (!poHistory.length) {
      toast({
        title: 'No data to export',
        description: 'No purchase orders for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    setExporting(true);
    try {
      await exportKeyAccountClientAnalyticsExcel(
        poHistory.map((order) => {
          const client = firstRelation(order.client);
          const clientOption = clientOptions.find((c) => c.id === order.key_account_client_id);
          const revenue = getKeyAccountOrderNetRevenueFromAttribution(orderRevenueById.get(order.id));
          const poKind = String(order.po_order_kind || '');
          let poKindLabel = 'Standard';
          if (poKind === 'rebate_fulfillment') poKindLabel = 'Rebate replacement';
          else if (poKind === 'rebate_topup') poKindLabel = 'Rebate top-up';
          else if (poKind === 'consignment') poKindLabel = 'Consignment';

          return {
            poNumber: order.po_number,
            orderDate: order.order_date
              ? new Date(order.order_date).toLocaleDateString()
              : '—',
            clientName: client?.client_name || clientOption?.client_name || '—',
            clientCode: clientOption?.client_code || '',
            grossAmount: revenue.grossRevenue,
            rebatedAmount: revenue.rebatedRevenue,
            netAmount: revenue.totalRevenue,
            paymentStatus: String(order.key_account_payment_status || 'unpaid').replace(/_/g, ' '),
            workflowStatus: String(order.workflow_status || order.status || '—').replace(/_/g, ' '),
            poKind: poKindLabel,
          };
        }),
        {
          dateRangeLabel,
          periodStart: exportPeriodBounds.periodStart,
          periodEnd: exportPeriodBounds.periodEnd,
          clientLabel: selectedClientLabel,
          brandLabel: 'All brands',
          totalPos: summary.totalPos,
          deliveredPos: summary.deliveredPos,
          grossDeliveredRevenue: summary.grossRevenue,
          rebatedDeliveredRevenue: summary.rebatedRevenue,
          deliveredRevenue: summary.totalRevenue,
          paidCount: summary.paidCount,
        }
      );
      toast({
        title: 'Export successful',
        description: `Exported ${poHistory.length} PO row(s) for ${dateRangeLabel}.`,
      });
    } catch (error) {
      console.error('Key Account client analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate the Excel file.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const openPeriodDetail = (row: ClientPaymentPeriodRow) => {
    setSelectedPeriodRow(row);
    setPeriodDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Purchase orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalPos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Client revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Paid {formatCurrency(summary.paidRevenue)} · Partial {formatCurrency(summary.partialRevenue)}
              {' · '}Unpaid {formatCurrency(summary.unpaidRevenue)} · Consignment{' '}
              {formatCurrency(summary.consignmentRevenue)} · Settlement disc.{' '}
              {formatCurrency(summary.settlementDiscountRevenue)}
            </p>
            {summary.rebatedRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Gross {formatCurrency(summary.grossRevenue)} · Rebated{' '}
                <span className="text-amber-700 dark:text-amber-400">
                  −{formatCurrency(summary.rebatedRevenue)}
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{summary.deliveredPos} delivered POs</p>
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
            <div className="text-2xl font-bold">{clientOptions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PO Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.paidCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.partialCount} partial · {summary.unpaidCount} unpaid
              {summary.consignmentCount > 0 ? ` · ${summary.consignmentCount} consignment` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Sales Overview</CardTitle>
          <CardDescription>
            Filter by client, brand, and date range. Monthly chart uses PO payment buckets:
            paid, partial, unpaid, consignment, and settlement discount. Click a month to view the breakdown.
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

                {usePageDateFilter && dateRangeFilter && onDateRangeFilterChange && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label>Date range</Label>
                    <DateRangeFilterPopover
                      value={dateRangeFilter}
                      onChange={onDateRangeFilterChange}
                      triggerClassName="w-full justify-between h-10"
                      align="start"
                    />
                  </div>
                )}

                {!usePageDateFilter && (
                <div className="space-y-2 pt-2 border-t">
                  <Label>Date Range</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-between text-left font-normal ${!dateRange?.from ? 'text-muted-foreground' : ''}`}
                      >
                        <span className="flex items-center truncate">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {dateRange?.from
                              ? dateRange.to
                                ? `${formatLongDate(dateRange.from)} - ${formatLongDate(dateRange.to)}`
                                : formatLongDate(dateRange.from)
                              : 'All Time'}
                          </span>
                        </span>
                        {dateRange?.from && (
                          <span
                            role="button"
                            className="rounded-full hover:bg-muted p-1 -mr-2"
                            onClick={(event) => {
                              event.stopPropagation();
                              clearDateRange();
                            }}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[430px] p-0" align="start">
                      <div className="p-5 space-y-5">
                        <div className="space-y-3">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Quick Filters
                          </Label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ['this_month', 'This Month'],
                                ['last_month', 'Last Month'],
                                ['last_3_months', 'Last 3 Months'],
                                ['last_6_months', 'Last 6 Months'],
                                ['this_year', 'This Year'],
                                ['last_year', 'Last Year'],
                              ] as const
                            ).map(([preset, label]) => (
                              <Button
                                key={preset}
                                variant={datePreset === preset ? 'default' : 'outline'}
                                onClick={() => setPreset(preset)}
                                className="h-11"
                              >
                                {label}
                              </Button>
                            ))}
                            <Button
                              variant={datePreset === 'all' ? 'default' : 'outline'}
                              onClick={() => setPreset('all')}
                              className="col-span-2 h-11"
                            >
                              All Time
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-3 pt-4 border-t">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Custom Range
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="ka-client-start-date" className="text-xs text-muted-foreground">
                                From
                              </Label>
                              <Input
                                id="ka-client-start-date"
                                type="date"
                                value={formatDateInput(customStartDate)}
                                onChange={(event) => {
                                  const next = parseDateInput(event.target.value);
                                  setCustomStartDate(next);
                                  if (next && customEndDate) {
                                    setDatePreset('custom');
                                    setDateRange({ from: next, to: customEndDate });
                                  }
                                }}
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor="ka-client-end-date" className="text-xs text-muted-foreground">
                                To
                              </Label>
                              <Input
                                id="ka-client-end-date"
                                type="date"
                                value={formatDateInput(customEndDate)}
                                onChange={(event) => {
                                  const next = parseDateInput(event.target.value);
                                  setCustomEndDate(next);
                                  if (customStartDate && next) {
                                    setDatePreset('custom');
                                    setDateRange({ from: customStartDate, to: next });
                                  }
                                }}
                                className="h-11"
                              />
                            </div>
                          </div>
                          {customStartDate && customEndDate && (
                            <Button
                              variant={datePreset === 'custom' ? 'default' : 'outline'}
                              onClick={() => setPreset('custom')}
                              className="w-full h-10"
                            >
                              <CalendarIcon className="h-4 w-4 mr-2" />
                              Apply Custom Range
                            </Button>
                          )}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                )}

                <Button
                  variant="outline"
                  className="w-full h-10 gap-2"
                  onClick={() => void handleExportExcel()}
                  disabled={exporting || poHistory.length === 0}
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

            <div className="space-y-6 min-w-0">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Revenue by month — paid, partial, unpaid, consignment, and settlement discount
                </p>
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
                            const row = payload[0].payload as ClientPaymentPeriodRow;
                            const total = row.totalRevenue || 0;

                            return (
                              <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                                <p className="font-semibold mb-2">{label}</p>
                                <p className="text-xs text-muted-foreground">
                                  Client: {selectedClientLabel}
                                </p>
                                <p className="text-lg font-bold">{formatCurrency(total)}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Paid {formatCurrency(row.paidRevenue)} · Partial {formatCurrency(row.partialRevenue)}
                                  {' · '}Unpaid {formatCurrency(row.unpaidRevenue)} · Consignment{' '}
                                  {formatCurrency(row.consignmentRevenue)} · Settlement disc.{' '}
                                  {formatCurrency(row.settlementDiscountRevenue)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {row.paidOrders} paid · {row.partialOrders} partial · {row.unpaidOrders} unpaid
                                  {row.consignmentOrders > 0 ? ` · ${row.consignmentOrders} consignment` : ''}
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={periodDetailOpen} onOpenChange={setPeriodDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedPeriodRow?.month} — Client revenue breakdown</DialogTitle>
            <DialogDescription>
              {selectedClientLabel}
              {' · '}Payment buckets for this month.
            </DialogDescription>
          </DialogHeader>
          {selectedPeriodRow && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Paid</p>
                  <p className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(selectedPeriodRow.paidRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Partial</p>
                  <p className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatCurrency(selectedPeriodRow.partialRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Unpaid</p>
                  <p className="font-semibold text-orange-600 dark:text-orange-400">
                    {formatCurrency(selectedPeriodRow.unpaidRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Consignment</p>
                  <p className="font-semibold text-sky-600 dark:text-sky-400">
                    {formatCurrency(selectedPeriodRow.consignmentRevenue)}
                  </p>
                </div>
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <span className="font-medium">Total</span>
                <span className="text-lg font-bold">{formatCurrency(selectedPeriodRow.totalRevenue)}</span>
              </div>
              <div className="border-t pt-3 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Paid POs</span>
                  <span>{selectedPeriodRow.paidOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Partial POs</span>
                  <span>{selectedPeriodRow.partialOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unpaid POs</span>
                  <span>{selectedPeriodRow.unpaidOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span>Consignment POs</span>
                  <span>{selectedPeriodRow.consignmentOrders}</span>
                </div>
              </div>
              {selectedClient === 'all' && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    By client
                  </p>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead className="text-right">Partial</TableHead>
                          <TableHead className="text-right">Unpaid</TableHead>
                          <TableHead className="text-right">Consignment</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPeriodClientRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              No client revenue for this month.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedPeriodClientRows.map((row) => (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.label}</TableCell>
                              <TableCell className="text-right text-green-600 dark:text-green-400">
                                {formatCurrency(row.paidRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-amber-600 dark:text-amber-400">
                                {formatCurrency(row.partialRevenue)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600 dark:text-orange-400">
                                {formatCurrency(row.unpaidRevenue)}
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
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Client PO History</CardTitle>
          <CardDescription>
            Purchase orders for the selected client and filters. Net amounts use the same product
            analytics rules as the summary cards (line items, rebates, and change-item swaps).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              value={poHistorySearch}
              onChange={(event) => setPoHistorySearch(event.target.value)}
              placeholder="Search PO #, client, payment status, workflow..."
              className="max-w-md"
            />
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Order date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Net amount</TableHead>
                  <TableHead className="text-right">Remaining balance</TableHead>
                  <TableHead>Payment status</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPoHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No purchase orders found for the selected filters/search.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPoHistory.map((order) => {
                    const client = firstRelation(order.client);
                    const paymentStatus = order.key_account_payment_status || 'unpaid';
                    const amountRevenue = getKeyAccountOrderNetRevenueFromAttribution(
                      orderRevenueById.get(order.id)
                    );
                    const paidTotal = paidByOrderId.get(order.id) || 0;
                    const remainingBalance = Math.max(
                      0,
                      Math.round(((Number(order.total_amount) || 0) - paidTotal) * 100) / 100
                    );
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{order.po_number}</span>
                            {String(order.po_order_kind || '') === 'rebate_fulfillment' ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Rebate replacement
                              </Badge>
                            ) : String(order.po_order_kind || '') === 'rebate_topup' ? (
                              <Badge variant="secondary" className="text-xs font-normal">
                                Rebate top-up
                              </Badge>
                            ) : String(order.po_order_kind || '') === 'consignment' ? (
                              <Badge
                                variant="outline"
                                className="text-xs font-normal border-amber-300 text-amber-800 bg-amber-50"
                              >
                                Consignment
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {order.order_date
                            ? new Date(order.order_date).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>{client?.client_name || '—'}</TableCell>
                        <TableCell className="text-right font-medium">
                          <div>{formatCurrency(amountRevenue.totalRevenue)}</div>
                          {amountRevenue.rebatedRevenue > 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-normal">
                              −{formatCurrency(amountRevenue.rebatedRevenue)} rebated
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(remainingBalance)}
                        </TableCell>
                        <TableCell>
                          <Badge className={paymentStatusBadgeClass(String(paymentStatus))}>
                            {String(paymentStatus).replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={workflowBadgeClass(order.workflow_status || order.status)}
                          >
                            {String(order.workflow_status || order.status || '—').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => void openItemsDialog(order)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <AnalyticsTablePagination
              page={poHistoryPage}
              onPageChange={setPoHistoryPage}
              totalRows={filteredPoHistory.length}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!itemsDialogOrder}
        onOpenChange={(open) => {
          if (!open) {
            setItemsDialogOrder(null);
            setDialogPayments([]);
            setItemsLoading(false);
            setDialogPaidTotal(null);
            setDialogPaymentCount(0);
            setDialogPaymentLoading(false);
            setDialogRebateSource(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Payment history — {itemsDialogOrder?.po_number}</span>
              {String(itemsDialogOrder?.po_order_kind || '') === 'rebate_fulfillment' ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Rebate replacement
                </Badge>
              ) : String(itemsDialogOrder?.po_order_kind || '') === 'rebate_topup' ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Rebate top-up
                </Badge>
              ) : String(itemsDialogOrder?.po_order_kind || '') === 'consignment' ? (
                <Badge
                  variant="outline"
                  className="text-xs font-normal border-amber-300 text-amber-800 bg-amber-50"
                >
                  Consignment
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {firstRelation(itemsDialogOrder?.client ?? null)?.client_name || 'Client'} ·{' '}
              {itemsDialogOrder?.order_date
                ? new Date(itemsDialogOrder.order_date).toLocaleDateString()
                : '—'}{' '}
              · PO total {formatCurrency(Number(itemsDialogOrder?.total_amount || 0))}
              {itemsDialogOrder?.key_account_payment_mode ? (
                <>
                  {' '}
                  · Paid {dialogPaymentLoading ? '…' : formatCurrency(Number(dialogPaidTotal || 0))}
                  {dialogPaymentCount > 0 ? ` (${dialogPaymentCount})` : ''}
                </>
              ) : null}
              {dialogRebateSource?.source_po_number && dialogRebateSource?.rebate_number ? (
                <>
                  {' '}
                  · Source PO {dialogRebateSource.source_po_number} · Rebate {dialogRebateSource.rebate_number}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {itemsLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading payment history…
            </div>
          ) : dialogPayments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No payment history recorded for this PO.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">PO total</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(Number(itemsDialogOrder?.total_amount || 0))}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Paid so far</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(Number(dialogPaidTotal || 0))}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Remaining balance</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(
                      Math.max(
                        0,
                        Math.round(
                          ((Number(itemsDialogOrder?.total_amount || 0) - Number(dialogPaidTotal || 0)) *
                            100)
                        ) / 100
                      )
                    )}
                  </p>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dialogPayments.map((payment) => {
                      const recorder = firstRelation(payment.recorder);
                      const method = payment.payment_method
                        ? String(payment.payment_method).replace(/_/g, ' ')
                        : '—';
                      const bank = payment.bank_type
                        ? ` · ${String(payment.bank_type).replace(/_/g, ' ')}`
                        : '';
                      return (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">
                            {payment.created_at
                              ? new Date(payment.created_at).toLocaleString()
                              : '—'}
                          </TableCell>
                          <TableCell>{`${method}${bank}`}</TableCell>
                          <TableCell>{recorder?.full_name || recorder?.email || '—'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(Number(payment.amount || 0))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground mr-2">Payment entries</span>
                <span className="font-semibold">{dialogPaymentCount}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
