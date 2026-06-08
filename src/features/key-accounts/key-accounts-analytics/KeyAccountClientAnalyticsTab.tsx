import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
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
import { getKeyAccountOrderRevenueBreakdown } from './keyAccountAnalyticsShared';

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

interface ChartDateRange {
  from?: Date;
  to?: Date;
}

interface KeyAccountClientAnalyticsTabProps {
  orders: ClientAnalyticsOrder[];
  items: ClientAnalyticsItem[];
  clients: ClientOption[];
  brands: string[];
  formatCurrency: (value: number) => string;
  chartDateRange?: ChartDateRange;
  usePageDateFilter?: boolean;
  dateRangeFilter?: DateRangeFilterValue;
  onDateRangeFilterChange?: (value: DateRangeFilterValue) => void;
  rebateCreditByPurchaseOrderId?: Map<string, number>;
}

const EMPTY_REBATE_CREDIT_MAP = new Map<string, number>();

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
  brands,
  formatCurrency,
  chartDateRange,
  usePageDateFilter = false,
  dateRangeFilter,
  onDateRangeFilterChange,
  rebateCreditByPurchaseOrderId = EMPTY_REBATE_CREDIT_MAP,
}: KeyAccountClientAnalyticsTabProps) {
  const { toast } = useToast();
  const [selectedClient, setSelectedClient] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [itemsDialogOrder, setItemsDialogOrder] = useState<ClientAnalyticsOrder | null>(null);
  const [dialogLineItems, setDialogLineItems] = useState<PoLineItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dialogPaidTotal, setDialogPaidTotal] = useState<number | null>(null);
  const [dialogPaymentCount, setDialogPaymentCount] = useState(0);
  const [dialogPaymentLoading, setDialogPaymentLoading] = useState(false);
  const [dialogRebateSource, setDialogRebateSource] = useState<{
    rebate_number: string;
    source_po_number: string;
  } | null>(null);
  const [poHistoryPage, setPoHistoryPage] = useState(1);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const itemsByOrderId = useMemo(() => {
    const map = new Map<string, ClientAnalyticsItem[]>();
    items.forEach((item) => {
      const list = map.get(item.purchase_order_id) || [];
      list.push(item);
      map.set(item.purchase_order_id, list);
    });
    return map;
  }, [items]);

  const orderIdsByBrand = useMemo(() => {
    if (selectedBrand === 'all') return null;
    const ids = new Set<string>();
    items.forEach((item) => {
      const variant = firstRelation(item.variants);
      const brand = firstRelation(variant?.brands)?.name;
      if (brand === selectedBrand) ids.add(item.purchase_order_id);
    });
    return ids;
  }, [items, selectedBrand]);

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
        if (orderIdsByBrand && !orderIdsByBrand.has(order.id)) return false;
        return true;
      }),
    [dateRange, orderIdsByBrand, orders, selectedClient, usePageDateFilter]
  );

  const monthlySalesData = useMemo(() => {
    const periods = buildMonthlyPeriods(orders, effectiveDateRange);
    const delivered = baseOrders.filter(isDeliveredRevenue);
    return periods.map((period) => {
      const sales = delivered
        .filter((order) => {
          const d = new Date(order.order_date);
          return d >= period.start && d <= period.end;
        })
        .reduce((sum, order) => {
          const { net } = getKeyAccountOrderRevenueBreakdown(
            order.id,
            order.total_amount,
            rebateCreditByPurchaseOrderId
          );
          return sum + net;
        }, 0);
      return { month: period.label, sales: Math.round(sales) };
    });
  }, [baseOrders, effectiveDateRange, orders, rebateCreditByPurchaseOrderId]);

  const poHistory = useMemo(
    () =>
      [...baseOrders].sort(
        (a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
      ),
    [baseOrders]
  );

  const paginatedPoHistory = useMemo(
    () => paginateAnalyticsRows(poHistory, poHistoryPage),
    [poHistory, poHistoryPage]
  );

  useEffect(() => {
    setPoHistoryPage(1);
  }, [
    poHistory.length,
    selectedClient,
    selectedBrand,
    usePageDateFilter,
    datePreset,
    dateRange?.from,
    dateRange?.to,
    chartDateRange?.from,
    chartDateRange?.to,
    dateRangeFilter?.preset,
    dateRangeFilter?.customStart,
    dateRangeFilter?.customEnd,
  ]);

  const summary = useMemo(() => {
    const delivered = baseOrders.filter(isDeliveredRevenue);
    let grossDeliveredRevenue = 0;
    let rebatedDeliveredRevenue = 0;
    let deliveredRevenue = 0;
    delivered.forEach((order) => {
      const breakdown = getKeyAccountOrderRevenueBreakdown(
        order.id,
        order.total_amount,
        rebateCreditByPurchaseOrderId
      );
      grossDeliveredRevenue += breakdown.gross;
      rebatedDeliveredRevenue += breakdown.rebated;
      deliveredRevenue += breakdown.net;
    });
    const paidCount = baseOrders.filter((o) => o.key_account_payment_status === 'paid').length;
    return {
      totalPos: baseOrders.length,
      deliveredPos: delivered.length,
      grossDeliveredRevenue,
      rebatedDeliveredRevenue,
      deliveredRevenue,
      paidCount,
    };
  }, [baseOrders, rebateCreditByPurchaseOrderId]);

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
    setDialogPaidTotal(null);
    setDialogPaymentCount(0);
    setDialogRebateSource(null);

    if (order.key_account_payment_mode) {
      setDialogPaymentLoading(true);
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('purchase_order_key_account_payments')
            .select('amount')
            .eq('purchase_order_id', order.id);
          if (error) throw error;
          const rows = (data || []) as Array<{ amount: number | null }>;
          const paid = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
          setDialogPaidTotal(paid);
          setDialogPaymentCount(rows.length);
        } catch {
          setDialogPaidTotal(0);
          setDialogPaymentCount(0);
        } finally {
          setDialogPaymentLoading(false);
        }
      })();
    }

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

    const cached = itemsByOrderId.get(order.id);
    if (cached?.length) {
      setDialogLineItems(mapLineItems(cached));
      return;
    }

    setDialogLineItems([]);
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
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
        .eq('purchase_order_id', order.id)
        .order('id', { ascending: true });

      if (error) throw error;
      setDialogLineItems(mapLineItems((data || []) as ClientAnalyticsItem[]));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load PO items';
      toast({
        variant: 'destructive',
        title: 'Could not load items',
        description: message,
      });
      setItemsDialogOrder(null);
    } finally {
      setItemsLoading(false);
    }
  };

  const dialogItemsTotal = useMemo(
    () => dialogLineItems.reduce((sum, row) => sum + row.total_price, 0),
    [dialogLineItems]
  );

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
          const breakdown = getKeyAccountOrderRevenueBreakdown(
            order.id,
            order.total_amount,
            rebateCreditByPurchaseOrderId
          );
          const poKind = String(order.po_order_kind || '');
          let poKindLabel = 'Standard';
          if (poKind === 'rebate_fulfillment') poKindLabel = 'Rebate replacement';
          else if (poKind === 'rebate_topup') poKindLabel = 'Rebate top-up';

          return {
            poNumber: order.po_number,
            orderDate: order.order_date
              ? new Date(order.order_date).toLocaleDateString()
              : '—',
            clientName: client?.client_name || clientOption?.client_name || '—',
            clientCode: clientOption?.client_code || '',
            grossAmount: breakdown.gross,
            rebatedAmount: breakdown.rebated,
            netAmount: breakdown.net,
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
          brandLabel: selectedBrand === 'all' ? 'All brands' : selectedBrand,
          totalPos: summary.totalPos,
          deliveredPos: summary.deliveredPos,
          grossDeliveredRevenue: summary.grossDeliveredRevenue,
          rebatedDeliveredRevenue: summary.rebatedDeliveredRevenue,
          deliveredRevenue: summary.deliveredRevenue,
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
              Delivered sales (net)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.deliveredRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.deliveredPos} delivered POs</p>
            {summary.rebatedDeliveredRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Gross {formatCurrency(summary.grossDeliveredRevenue)} · Rebated{' '}
                <span className="text-amber-700 dark:text-amber-400">
                  −{formatCurrency(summary.rebatedDeliveredRevenue)}
                </span>
              </p>
            )}
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid POs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.paidCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Client Sales Overview</CardTitle>
          <CardDescription>
            Filter by client, brand, and date range. Monthly chart uses fulfilled and delivered PO sales.
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
                  <Label>Brand</Label>
                  <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                    <SelectTrigger>
                      <SelectValue placeholder="All brands" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All brands</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  Net delivered sales by month (after rebate credits)
                </p>
                <div className="h-[320px]">
                  {monthlySalesData.some((row) => row.sales > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlySalesData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value) => formatCurrency(Number(value))}
                          labelFormatter={(label) => `Month: ${label}`}
                        />
                        <Bar dataKey="sales" name="Sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      No delivered sales for the selected filters.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client PO History</CardTitle>
          <CardDescription>
            Purchase orders for the selected client and filters. Amounts show net after money/credit
            rebates; change-item replacements at the same value are not deducted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Order date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Net amount</TableHead>
                  <TableHead>Payment status</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No purchase orders found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPoHistory.map((order) => {
                    const client = firstRelation(order.client);
                    const paymentStatus = order.key_account_payment_status || 'unpaid';
                    const amountBreakdown = getKeyAccountOrderRevenueBreakdown(
                      order.id,
                      order.total_amount,
                      rebateCreditByPurchaseOrderId
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
                          <div>{formatCurrency(amountBreakdown.net)}</div>
                          {amountBreakdown.rebated > 0 && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-normal">
                              −{formatCurrency(amountBreakdown.rebated)} rebated
                            </p>
                          )}
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
              totalRows={poHistory.length}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!itemsDialogOrder}
        onOpenChange={(open) => {
          if (!open) {
            setItemsDialogOrder(null);
            setDialogLineItems([]);
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
              <span>PO items — {itemsDialogOrder?.po_number}</span>
              {String(itemsDialogOrder?.po_order_kind || '') === 'rebate_fulfillment' ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Rebate replacement
                </Badge>
              ) : String(itemsDialogOrder?.po_order_kind || '') === 'rebate_topup' ? (
                <Badge variant="secondary" className="text-xs font-normal">
                  Rebate top-up
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
              Loading items…
            </div>
          ) : dialogLineItems.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No line items on this purchase order.</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dialogLineItems.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.brand}</TableCell>
                        <TableCell>{line.variant}</TableCell>
                        <TableCell>{line.variantType}</TableCell>
                        <TableCell className="text-right">{line.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(line.total_price)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground mr-2">Items subtotal</span>
                <span className="font-semibold">{formatCurrency(dialogItemsTotal)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
