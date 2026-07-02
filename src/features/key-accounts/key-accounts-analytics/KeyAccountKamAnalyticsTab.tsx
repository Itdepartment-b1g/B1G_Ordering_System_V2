import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, FileDown, Filter, Loader2, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
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
import { exportKeyAccountAgentAnalyticsExcel } from './exportKeyAccountAgentAnalyticsExcel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';
import {
  getKeyAccountOrderNetRevenueFromAttribution,
  isDeliveredKeyAccountOrder,
  isKeyAccountAnalyticsEligibleOrder,
  isKeyAccountPartialDeliveredOrder,
  isKeyAccountPendingWorkflowOrder,
  isKeyAccountProductAnalyticsOrder,
  isRebateFulfillmentReplacementOrder,
  sumKeyAccountOrderPoLineCounts,
  type KeyAccountOrderRevenueAttribution,
  type KeyAccountOrderRevenueSplitContext,
  type KeyAccountProductLineItemInput,
} from './keyAccountAnalyticsShared';

interface AnalyticsOrder {
  id: string;
  order_date: string;
  total_amount: number | null;
  subtotal?: number | null;
  status: string | null;
  workflow_status: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  warehouse_location_id?: string | null;
  kam_id: string | null;
  key_account_client_id: string | null;
  analytics_only?: boolean;
  kam?: { full_name: string | null; email: string | null; role: string | null } | { full_name: string | null; email: string | null; role: string | null }[] | null;
}

interface AnalyticsItem extends KeyAccountProductLineItemInput {
  variants?: { name: string | null } | { name: string | null }[] | null;
}

interface DateRange {
  from?: Date;
  to?: Date;
}

interface KeyAccountKamAnalyticsTabProps {
  orders: AnalyticsOrder[];
  items: AnalyticsItem[];
  people?: unknown[];
  formatCurrency: (value: number) => string;
  dateRangeFilter: DateRangeFilterValue;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  orderRevenueById?: Map<string, KeyAccountOrderRevenueAttribution>;
  rebateDeductionByPoItemId?: Map<string, number>;
  poLineSubtotalByOrderId?: Map<string, number>;
  reservationByKey?: Map<string, { quantity_fulfilled: number; quantity_reserved: number }>;
  locationStatusByKey?: Map<string, string>;
}

const EMPTY_ORDER_REVENUE_MAP = new Map<string, KeyAccountOrderRevenueAttribution>();
const EMPTY_REBATE_DEDUCTION_MAP = new Map<string, number>();
const EMPTY_PO_LINE_SUBTOTAL_MAP = new Map<string, number>();
const EMPTY_RESERVATION_MAP = new Map<string, { quantity_fulfilled: number; quantity_reserved: number }>();
const EMPTY_LOCATION_STATUS_MAP = new Map<string, string>();

type MetricType = 'revenue' | 'orders' | 'clients';
type RoleType = 'all' | 'key_account_manager' | 'sales_director';

const KAM_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

interface TimeSeriesDataPoint {
  period: string;
  periodStart: string;
  periodEnd: string;
  [key: string]: string | number;
}

const revenueGrossKey = (agentId: string) => `${agentId}_gross`;
const revenueRebatedKey = (agentId: string) => `${agentId}_rebated`;
const revenueDeliveredNetKey = (agentId: string) => `${agentId}_delivered_net`;
const revenuePendingNetKey = (agentId: string) => `${agentId}_pending_net`;
const revenuePartialDeliveredKey = (agentId: string) => `${agentId}_partial_delivered`;
const ordersPendingKey = (agentId: string) => `${agentId}_pending`;
const ordersPartialDeliveredKey = (agentId: string) => `${agentId}_partial_delivered`;
const ordersDeliveredPoLinesKey = (agentId: string) => `${agentId}_delivered_po_lines`;
const ordersPendingPoLinesKey = (agentId: string) => `${agentId}_pending_po_lines`;
const ordersTotalKey = (agentId: string) => `${agentId}_total`;
const ordersRebateReplacementKey = (agentId: string) => `${agentId}_rebate_replacement`;

interface ClickableChartDotProps {
  cx?: number;
  cy?: number;
  payload?: TimeSeriesDataPoint;
  fill?: string;
  r?: number;
  onPeriodClick: (row: TimeSeriesDataPoint) => void;
}

const ClickableChartDot = ({ cx, cy, payload, fill, r = 5, onPeriodClick }: ClickableChartDotProps) => {
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke={fill}
      strokeWidth={2}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onPeriodClick(payload);
      }}
    />
  );
};

interface CustomLegendProps {
  payload?: Array<{
    value?: string;
    color?: string;
    dataKey?: unknown;
    [key: string]: unknown;
  }>;
}

function CustomLegend({ payload }: CustomLegendProps) {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="pt-6 pb-2">
      <div className="flex flex-wrap items-center gap-3 justify-start">
        {payload.map((entry, index) => (
          <div
            key={`legend-item-${index}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/50 hover:bg-muted transition-colors shadow-sm"
          >
            <div
              className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  return endOfDay(next);
}

function subMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() - amount, date.getDate());
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((endOfDay(to).getTime() - startOfDay(from).getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function buildPeriods(orders: AnalyticsOrder[], range?: DateRange) {
  if (range?.from) {
    const from = startOfDay(range.from);
    const to = range.to ? endOfDay(range.to) : endOfDay(range.from);
    const diff = daysBetween(from, to);
    const periods: { label: string; start: Date; end: Date }[] = [];

    if (diff <= 35) {
      const current = new Date(from);
      while (current <= to) {
        periods.push({ label: formatShortDate(current), start: startOfDay(current), end: endOfDay(current) });
        current.setDate(current.getDate() + 1);
      }
    } else if (diff <= 180) {
      const current = startOfWeek(from);
      while (current <= to) {
        const start = current < from ? from : current;
        const end = endOfWeek(current) > to ? to : endOfWeek(current);
        periods.push({ label: `Week of ${formatShortDate(start)}`, start, end });
        current.setDate(current.getDate() + 7);
      }
    } else {
      const current = startOfMonth(from);
      while (current <= to) {
        const start = current < from ? from : current;
        const end = endOfMonth(current) > to ? to : endOfMonth(current);
        periods.push({ label: formatMonthYear(start), start, end });
        current.setMonth(current.getMonth() + 1);
      }
    }

    return periods;
  }

  const orderedDates = orders
    .filter((order) => !order.analytics_only)
    .map((order) => new Date(order.order_date))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const latest = orderedDates[orderedDates.length - 1] || new Date();
  let earliest = orderedDates[0] || subMonths(latest, 5);
  const sixMonthsAgo = startOfMonth(subMonths(latest, 5));
  if (earliest > sixMonthsAgo) earliest = sixMonthsAgo;

  const periods: { label: string; start: Date; end: Date }[] = [];
  const current = startOfMonth(earliest);
  const end = endOfMonth(latest);
  while (current <= end) {
    periods.push({ label: formatMonthYear(current), start: startOfMonth(current), end: endOfMonth(current) });
    current.setMonth(current.getMonth() + 1);
  }
  return periods;
}

export default function KeyAccountKamAnalyticsTab({
  orders,
  items,
  formatCurrency,
  dateRangeFilter,
  onDateRangeFilterChange,
  orderRevenueById = EMPTY_ORDER_REVENUE_MAP,
  rebateDeductionByPoItemId = EMPTY_REBATE_DEDUCTION_MAP,
  poLineSubtotalByOrderId = EMPTY_PO_LINE_SUBTOTAL_MAP,
  reservationByKey = EMPTY_RESERVATION_MAP,
  locationStatusByKey = EMPTY_LOCATION_STATUS_MAP,
}: KeyAccountKamAnalyticsTabProps) {
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<RoleType>('all');
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [agentTablePage, setAgentTablePage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [periodDetailOpen, setPeriodDetailOpen] = useState(false);
  const [selectedPeriodRow, setSelectedPeriodRow] = useState<TimeSeriesDataPoint | null>(null);

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

  const agents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string; role: string; color: string }>();
    orders.forEach((order) => {
      const id = order.kam_id || 'unassigned';
      if (map.has(id)) return;
      const kam = firstRelation(order.kam);
      map.set(id, {
        id,
        name: kam?.full_name || 'Unassigned User',
        email: kam?.email || '',
        role: kam?.role || 'unknown',
        color: KAM_COLORS[map.size % KAM_COLORS.length],
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const roleAgents = useMemo(
    () => agents.filter((agent) => selectedRole === 'all' || agent.role === selectedRole),
    [agents, selectedRole]
  );

  const visibleAgents = useMemo(
    () => roleAgents.filter((agent) => selectedPerson === 'all' || agent.id === selectedPerson),
    [roleAgents, selectedPerson]
  );

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          !order.analytics_only &&
          isDateInRange(order.order_date, orderDateRange.start, orderDateRange.end)
      ),
    [orderDateRange, orders]
  );

  const revenueSplitContext = useMemo<KeyAccountOrderRevenueSplitContext>(
    () => ({
      poLineSubtotalByOrderId,
      rebateDeductionByPoItemId,
      reservationByKey,
      locationStatusByKey,
    }),
    [poLineSubtotalByOrderId, rebateDeductionByPoItemId, reservationByKey, locationStatusByKey]
  );

  const analyticsEligibleOrders = useMemo(
    () => filteredOrders.filter(isKeyAccountAnalyticsEligibleOrder),
    [filteredOrders]
  );

  const productAnalyticsOrders = useMemo(
    () => analyticsEligibleOrders.filter(isKeyAccountProductAnalyticsOrder),
    [analyticsEligibleOrders]
  );

  const deliveredOrders = useMemo(
    () => analyticsEligibleOrders.filter(isDeliveredKeyAccountOrder),
    [analyticsEligibleOrders]
  );
  const deliveredOrderById = useMemo(() => new Map(deliveredOrders.map((order) => [order.id, order])), [deliveredOrders]);

  const computeAgentPeriodRevenue = (agentOrders: AnalyticsOrder[]) => {
    let grossDelivered = 0;
    let grossPending = 0;
    let rebatedDelivered = 0;
    let rebatedPending = 0;

    agentOrders.forEach((order) => {
      if (!isKeyAccountProductAnalyticsOrder(order)) return;
      const revenue = getKeyAccountOrderNetRevenueFromAttribution(orderRevenueById.get(order.id));
      grossDelivered += revenue.grossDelivered;
      grossPending += revenue.grossPending;
      rebatedDelivered += revenue.rebatedDelivered;
      rebatedPending += revenue.rebatedPending;
    });

    const netDelivered = grossDelivered - rebatedDelivered;
    const netPending = grossPending - rebatedPending;
    return {
      grossDelivered,
      grossPending,
      rebatedDelivered,
      rebatedPending,
      netDelivered,
      netPending,
      gross: grossDelivered + grossPending,
      rebated: rebatedDelivered + rebatedPending,
      net: netDelivered + netPending,
    };
  };

  const computeAgentPeriodPoLineCounts = (
    agentOrders: AnalyticsOrder[],
    context: KeyAccountOrderRevenueSplitContext
  ) =>
    agentOrders.reduce(
      (acc, order) => {
        const counts = sumKeyAccountOrderPoLineCounts(order, items, context);
        if (!counts) return acc;
        return {
          deliveredPoLines: acc.deliveredPoLines + counts.deliveredPoLines,
          pendingPoLines: acc.pendingPoLines + counts.pendingPoLines,
        };
      },
      { deliveredPoLines: 0, pendingPoLines: 0 }
    );

  const timeSeriesData = useMemo(() => {
    const periods = buildPeriods(orders, chartDateRange);
    return periods.map((period) => {
      const point: TimeSeriesDataPoint = {
        period: period.label,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
      };

      visibleAgents.forEach((agent) => {
        const agentId = agent.id;
        const isAgentOrder = (order: AnalyticsOrder) =>
          (order.kam_id || 'unassigned') === agentId &&
          new Date(order.order_date) >= period.start &&
          new Date(order.order_date) <= period.end;

        const periodDeliveredOrders = deliveredOrders.filter(isAgentOrder);
        const periodAllOrders = filteredOrders.filter(isAgentOrder);
        const periodRevenueOrders = productAnalyticsOrders.filter(isAgentOrder);
        const periodPoLineOrders = productAnalyticsOrders.filter(isAgentOrder);

        if (selectedMetric === 'revenue') {
          const revenue = computeAgentPeriodRevenue(periodRevenueOrders);
          point[agentId] = revenue.netDelivered;
          point[revenueDeliveredNetKey(agentId)] = revenue.netDelivered;
          point[revenuePendingNetKey(agentId)] = revenue.netPending;
          point[revenueGrossKey(agentId)] = revenue.gross;
          point[revenueRebatedKey(agentId)] = revenue.rebated;
          point[revenuePartialDeliveredKey(agentId)] = periodAllOrders.filter(
            isKeyAccountPartialDeliveredOrder
          ).length;
        } else if (selectedMetric === 'orders') {
          const poLineCounts = computeAgentPeriodPoLineCounts(periodPoLineOrders, revenueSplitContext);
          point[agentId] = periodDeliveredOrders.length;
          point[ordersPendingKey(agentId)] = periodAllOrders.filter(isKeyAccountPendingWorkflowOrder).length;
          point[ordersPartialDeliveredKey(agentId)] = periodAllOrders.filter(
            isKeyAccountPartialDeliveredOrder
          ).length;
          point[ordersDeliveredPoLinesKey(agentId)] = poLineCounts.deliveredPoLines;
          point[ordersPendingPoLinesKey(agentId)] = poLineCounts.pendingPoLines;
          point[ordersTotalKey(agentId)] = periodAllOrders.length;
          point[ordersRebateReplacementKey(agentId)] = periodAllOrders.filter(
            isRebateFulfillmentReplacementOrder
          ).length;
        } else {
          point[agentId] = new Set(
            periodDeliveredOrders.map((order) => order.key_account_client_id).filter(Boolean)
          ).size;
        }
      });
      return point;
    });
  }, [
    deliveredOrders,
    filteredOrders,
    chartDateRange,
    items,
    orders,
    productAnalyticsOrders,
    orderRevenueById,
    revenueSplitContext,
    selectedMetric,
    visibleAgents,
  ]);

  const rows = useMemo(() => {
    const rowMap = new Map<string, {
      kamId: string;
      name: string;
      email: string;
      totalOrders: number;
      deliveredOrders: number;
      pendingOrders: number;
      grossDeliveredRevenue: number;
      grossPendingRevenue: number;
      rebatedDeliveredRevenue: number;
      rebatedPendingRevenue: number;
      deliveredRevenue: number;
      pendingRevenue: number;
      totalRevenue: number;
      clientIds: Set<string>;
      productQty: Map<string, number>;
    }>();

    visibleAgents.forEach((agent) => {
      rowMap.set(agent.id, {
        kamId: agent.id,
        name: agent.name,
        email: agent.email,
        totalOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        grossDeliveredRevenue: 0,
        grossPendingRevenue: 0,
        rebatedDeliveredRevenue: 0,
        rebatedPendingRevenue: 0,
        deliveredRevenue: 0,
        pendingRevenue: 0,
        totalRevenue: 0,
        clientIds: new Set<string>(),
        productQty: new Map<string, number>(),
      });
    });

    filteredOrders.forEach((order) => {
      const kamId = order.kam_id || 'unassigned';
      const row = rowMap.get(kamId);
      if (!row) return;

      row.totalOrders += 1;
      if (isKeyAccountPendingWorkflowOrder(order)) row.pendingOrders += 1;
      if (isDeliveredKeyAccountOrder(order)) {
        row.deliveredOrders += 1;
        if (order.key_account_client_id) row.clientIds.add(order.key_account_client_id);
      }
    });

    productAnalyticsOrders.forEach((order) => {
      const kamId = order.kam_id || 'unassigned';
      const row = rowMap.get(kamId);
      if (!row) return;

      const revenue = getKeyAccountOrderNetRevenueFromAttribution(orderRevenueById.get(order.id));
      row.grossDeliveredRevenue += revenue.grossDelivered;
      row.grossPendingRevenue += revenue.grossPending;
      row.rebatedDeliveredRevenue += revenue.rebatedDelivered;
      row.rebatedPendingRevenue += revenue.rebatedPending;
      row.deliveredRevenue += revenue.deliveredRevenue;
      row.pendingRevenue += revenue.pendingRevenue;
      row.totalRevenue += revenue.totalRevenue;
    });

    items.forEach((item) => {
      const order = deliveredOrderById.get(item.purchase_order_id);
      if (!order) return;
      const row = rowMap.get(order.kam_id || 'unassigned');
      if (!row) return;
      const variant = firstRelation(item.variants);
      const name = variant?.name || 'Unknown Variant';
      row.productQty.set(name, (row.productQty.get(name) || 0) + Number(item.quantity || 0));
    });

    return Array.from(rowMap.values())
      .map((row) => ({
        kamId: row.kamId,
        name: row.name,
        email: row.email,
        totalOrders: row.totalOrders,
        deliveredOrders: row.deliveredOrders,
        pendingOrders: row.pendingOrders,
        grossDeliveredRevenue: row.grossDeliveredRevenue,
        grossPendingRevenue: row.grossPendingRevenue,
        rebatedDeliveredRevenue: row.rebatedDeliveredRevenue,
        rebatedPendingRevenue: row.rebatedPendingRevenue,
        deliveredRevenue: row.deliveredRevenue,
        pendingRevenue: row.pendingRevenue,
        totalRevenue: row.totalRevenue,
        uniqueClients: row.clientIds.size,
        avgOrderValue: row.deliveredOrders > 0 ? row.deliveredRevenue / row.deliveredOrders : 0,
        topProduct: Array.from(row.productQty.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No delivered products',
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [deliveredOrderById, filteredOrders, items, orderRevenueById, productAnalyticsOrders, visibleAgents]);

  const paginatedRows = useMemo(
    () => paginateAnalyticsRows(rows, agentTablePage),
    [rows, agentTablePage]
  );

  useEffect(() => {
    setAgentTablePage(1);
  }, [rows.length, selectedRole, selectedPerson, dateRangeFilter]);

  const rebateReplacementOrders = useMemo(
    () => filteredOrders.filter(isRebateFulfillmentReplacementOrder).length,
    [filteredOrders]
  );

  const pendingWorkflowOrders = useMemo(
    () => filteredOrders.filter(isKeyAccountPendingWorkflowOrder).length,
    [filteredOrders]
  );

  const partialDeliveredOrders = useMemo(
    () => filteredOrders.filter(isKeyAccountPartialDeliveredOrder).length,
    [filteredOrders]
  );

  const totals = rows.reduce(
    (acc, row) => ({
      grossRevenue: acc.grossRevenue + row.grossDeliveredRevenue + row.grossPendingRevenue,
      rebatedRevenue:
        acc.rebatedRevenue + row.rebatedDeliveredRevenue + row.rebatedPendingRevenue,
      deliveredRevenue: acc.deliveredRevenue + row.deliveredRevenue,
      pendingRevenue: acc.pendingRevenue + row.pendingRevenue,
      totalRevenue: acc.totalRevenue + row.totalRevenue,
      totalOrders: acc.totalOrders + row.totalOrders,
      deliveredOrders: acc.deliveredOrders + row.deliveredOrders,
      clients: acc.clients + row.uniqueClients,
    }),
    {
      grossRevenue: 0,
      rebatedRevenue: 0,
      deliveredRevenue: 0,
      pendingRevenue: 0,
      totalRevenue: 0,
      totalOrders: 0,
      deliveredOrders: 0,
      clients: 0,
    }
  );

  const metricLabel = selectedMetric === 'revenue' ? 'Revenue' : selectedMetric === 'orders' ? 'Delivered Orders' : 'Buying Clients';
  const roleLabel =
    selectedRole === 'sales_director'
      ? 'Sales Director'
      : selectedRole === 'key_account_manager'
        ? 'Key Account Manager'
        : 'All Key Account Roles';
  const personAllLabel =
    selectedRole === 'all'
      ? 'All Key Account Roles'
      : `All ${roleLabel}s`;
  const chartTitle = selectedPerson === 'all' ? personAllLabel : agents.find((agent) => agent.id === selectedPerson)?.name || 'Selected person';

  const handleExportExcel = async () => {
    if (!rows.length) {
      toast({
        title: 'No data to export',
        description: 'No agent data for the selected filters.',
        variant: 'destructive',
      });
      return;
    }

    const periodStart = orderDateRange.start ? formatDateForInput(orderDateRange.start) : 'all';
    const periodEnd = orderDateRange.end ? formatDateForInput(orderDateRange.end) : 'all';
    setExporting(true);
    try {
      await exportKeyAccountAgentAnalyticsExcel(
        rows.map((row) => ({
          name: row.name,
          email: row.email,
          grossDeliveredRevenue: row.grossDeliveredRevenue,
          grossPendingRevenue: row.grossPendingRevenue,
          rebatedDeliveredRevenue: row.rebatedDeliveredRevenue,
          rebatedPendingRevenue: row.rebatedPendingRevenue,
          deliveredRevenue: row.deliveredRevenue,
          pendingRevenue: row.pendingRevenue,
          totalRevenue: row.totalRevenue,
          deliveredOrders: row.deliveredOrders,
          totalOrders: row.totalOrders,
          pendingOrders: row.pendingOrders,
          uniqueClients: row.uniqueClients,
          avgOrderValue: row.avgOrderValue,
          topProduct: row.topProduct,
        })),
        {
          dateRangeLabel,
          periodStart,
          periodEnd,
          roleLabel,
          personLabel: chartTitle,
        }
      );
      toast({
        title: 'Export successful',
        description: `Exported ${rows.length} agent row(s) for ${dateRangeLabel}.`,
      });
    } catch (error) {
      console.error('Key Account agent analytics export failed:', error);
      toast({
        title: 'Export failed',
        description: 'Could not generate the Excel file.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const formatValue = (value: number) => (
    selectedMetric === 'revenue' ? formatCurrency(value) : value.toLocaleString()
  );

  const openPeriodDetail = (row: TimeSeriesDataPoint) => {
    setSelectedPeriodRow(row);
    setPeriodDetailOpen(true);
  };

  const getPeriodDetailMetricTitle = () => {
    switch (selectedMetric) {
      case 'revenue':
        return 'Net Revenue';
      case 'orders':
        return 'Delivered Orders';
      case 'clients':
        return 'Buying Clients';
      default:
        return 'Performance';
    }
  };

  const computePeriodAggregateTotals = (row: TimeSeriesDataPoint) => {
    if (selectedMetric === 'revenue') {
      return visibleAgents.reduce(
        (acc, agent) => ({
          gross: acc.gross + Number(row[revenueGrossKey(agent.id)] ?? 0),
          rebated: acc.rebated + Number(row[revenueRebatedKey(agent.id)] ?? 0),
          netDelivered: acc.netDelivered + Number(row[revenueDeliveredNetKey(agent.id)] ?? 0),
          netPending: acc.netPending + Number(row[revenuePendingNetKey(agent.id)] ?? 0),
          partialDelivered: acc.partialDelivered + Number(row[revenuePartialDeliveredKey(agent.id)] ?? 0),
          net: acc.net + Number(row[revenueDeliveredNetKey(agent.id)] ?? 0) + Number(row[revenuePendingNetKey(agent.id)] ?? 0),
        }),
        { gross: 0, rebated: 0, netDelivered: 0, netPending: 0, partialDelivered: 0, net: 0 }
      );
    }

    if (selectedMetric === 'orders') {
      return visibleAgents.reduce(
        (acc, agent) => ({
          delivered: acc.delivered + Number(row[agent.id] ?? 0),
          pending: acc.pending + Number(row[ordersPendingKey(agent.id)] ?? 0),
          partialDelivered: acc.partialDelivered + Number(row[ordersPartialDeliveredKey(agent.id)] ?? 0),
          deliveredPoLines: acc.deliveredPoLines + Number(row[ordersDeliveredPoLinesKey(agent.id)] ?? 0),
          pendingPoLines: acc.pendingPoLines + Number(row[ordersPendingPoLinesKey(agent.id)] ?? 0),
          total: acc.total + Number(row[ordersTotalKey(agent.id)] ?? 0),
          rebateReplacement: acc.rebateReplacement + Number(row[ordersRebateReplacementKey(agent.id)] ?? 0),
        }),
        {
          delivered: 0,
          pending: 0,
          partialDelivered: 0,
          deliveredPoLines: 0,
          pendingPoLines: 0,
          total: 0,
          rebateReplacement: 0,
        }
      );
    }

    const clients = visibleAgents.reduce((sum, agent) => sum + Number(row[agent.id] ?? 0), 0);
    return { clients };
  };

  const renderPeriodSummary = (row: TimeSeriesDataPoint) => {
    if (selectedMetric === 'revenue') {
      const { gross, rebated, netDelivered, netPending, partialDelivered, net } = computePeriodAggregateTotals(row) as {
        gross: number;
        rebated: number;
        netDelivered: number;
        netPending: number;
        partialDelivered: number;
        net: number;
      };
      return (
        <div className="rounded-lg border bg-muted/40 p-4 mb-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Period total — all agents
          </p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Delivered (net)</p>
              <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(netDelivered)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Pending (net)</p>
              <p className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(netPending)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total (net)</p>
              <p className="text-xl font-bold">{formatCurrency(net)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
            <div>
              <p className="text-muted-foreground text-xs">Gross</p>
              <p className="font-semibold">{formatCurrency(gross)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Rebated</p>
              <p className="font-semibold text-amber-700 dark:text-amber-400">
                {rebated > 0 ? `−${formatCurrency(rebated)}` : '—'}
              </p>
            </div>
          </div>
          {partialDelivered > 0 && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Pending (net) includes remaining balance on {partialDelivered.toLocaleString()} partial-delivered
              PO{partialDelivered === 1 ? '' : 's'} (split by fulfilled qty).
            </p>
          )}
        </div>
      );
    }

    if (selectedMetric === 'orders') {
      const {
        delivered,
        pending,
        partialDelivered,
        deliveredPoLines,
        pendingPoLines,
        total,
        rebateReplacement,
      } = computePeriodAggregateTotals(row) as {
        delivered: number;
        pending: number;
        partialDelivered: number;
        deliveredPoLines: number;
        pendingPoLines: number;
        total: number;
        rebateReplacement: number;
      };
      return (
        <div className="rounded-lg border bg-muted/40 p-4 mb-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Period total — all agents
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Delivered POs</p>
              <p className="font-semibold text-green-600 dark:text-green-400">{delivered.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">In workflow</p>
              <p className="font-semibold text-amber-600 dark:text-amber-400">{pending.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Partial delivered</p>
              <p className="font-semibold text-blue-600 dark:text-blue-400">{partialDelivered.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total POs</p>
              <p className="font-semibold">{total.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
            <div>
              <p className="text-muted-foreground text-xs">Delivered PO lines</p>
              <p className="font-semibold">{deliveredPoLines.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Pending PO lines</p>
              <p className="font-semibold">{pendingPoLines.toLocaleString()}</p>
            </div>
          </div>
          {rebateReplacement > 0 && (
            <p className="text-xs text-muted-foreground">
              {rebateReplacement.toLocaleString()} rebate replacement PO
              {rebateReplacement === 1 ? '' : 's'} in this period.
            </p>
          )}
        </div>
      );
    }

    const { clients } = computePeriodAggregateTotals(row) as { clients: number };
    return (
      <div className="rounded-lg border bg-muted/40 p-4 mb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Period total — all agents
        </p>
        <p className="text-2xl font-bold">{clients.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground mt-1">Buying clients in this period (summed per KAM)</p>
      </div>
    );
  };

  const renderPeriodDetailContent = (row: TimeSeriesDataPoint) => {
    if (selectedMetric === 'clients') {
      return (
        <>
          {renderPeriodSummary(row)}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">By agent</p>
          <div className="space-y-3 text-sm">
            {visibleAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between gap-4 py-2 border-b last:border-0"
              >
                <span className="font-medium flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: agent.color }}
                  />
                  {agent.name}
                </span>
                <span className="font-semibold">{formatValue(Number(row[agent.id] ?? 0))}</span>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (selectedMetric === 'revenue') {
      return (
        <>
          {renderPeriodSummary(row)}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">By agent</p>
          <div className="space-y-4 text-sm">
            {visibleAgents.map((agent) => {
              const gross = Number(row[revenueGrossKey(agent.id)] ?? 0);
              const rebated = Number(row[revenueRebatedKey(agent.id)] ?? 0);
              const netDelivered = Number(row[revenueDeliveredNetKey(agent.id)] ?? 0);
              const netPending = Number(row[revenuePendingNetKey(agent.id)] ?? 0);
              const partialDelivered = Number(row[revenuePartialDeliveredKey(agent.id)] ?? 0);
              const net = netDelivered + netPending;
              return (
                <div key={agent.id} className="rounded-lg border p-3 space-y-2">
                  <p className="font-medium flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    {agent.name}
                  </p>
                  <div className="pl-4 space-y-1.5 text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Delivered (net):
                      </span>
                      <span className="font-medium text-foreground">{formatCurrency(netDelivered)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-orange-500" />
                        Pending (net):
                      </span>
                      <span className="font-medium text-foreground">{formatCurrency(netPending)}</span>
                    </div>
                    {partialDelivered > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-blue-500" />
                          Partial delivered POs:
                        </span>
                        <span className="font-medium text-foreground">{partialDelivered.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span>Gross:</span>
                      <span className="font-medium text-foreground">{formatCurrency(gross)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Rebated:</span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {rebated > 0 ? `−${formatCurrency(rebated)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t pt-2 mt-1">
                      <span className="font-medium text-foreground">Total (net):</span>
                      <span className="font-bold">{formatCurrency(net)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    return (
      <>
        {renderPeriodSummary(row)}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">By agent</p>
        <div className="space-y-4 text-sm">
          {visibleAgents.map((agent) => {
            const delivered = Number(row[agent.id] ?? 0);
            const pending = Number(row[ordersPendingKey(agent.id)] ?? 0);
            const partialDelivered = Number(row[ordersPartialDeliveredKey(agent.id)] ?? 0);
            const deliveredPoLines = Number(row[ordersDeliveredPoLinesKey(agent.id)] ?? 0);
            const pendingPoLines = Number(row[ordersPendingPoLinesKey(agent.id)] ?? 0);
            const total = Number(row[ordersTotalKey(agent.id)] ?? 0);
            const rebateReplacement = Number(row[ordersRebateReplacementKey(agent.id)] ?? 0);
            return (
              <div key={agent.id} className="rounded-lg border p-3 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: agent.color }}
                  />
                  {agent.name}
                </p>
                <div className="pl-4 space-y-1.5 text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Delivered POs:
                    </span>
                    <span className="font-medium text-foreground">{delivered.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      In workflow:
                    </span>
                    <span className="font-medium text-foreground">{pending.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Partial delivered:
                    </span>
                    <span className="font-medium text-foreground">{partialDelivered.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t pt-2 mt-1">
                    <span>Delivered PO lines:</span>
                    <span className="font-medium text-foreground">{deliveredPoLines.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Pending PO lines:</span>
                    <span className="font-medium text-foreground">{pendingPoLines.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Total POs:</span>
                    <span className="font-medium text-foreground">{total.toLocaleString()}</span>
                  </div>
                  {rebateReplacement > 0 && (
                    <div className="flex items-center justify-between gap-3 border-t pt-2 mt-1">
                      <span>Rebate replacement:</span>
                      <span className="font-medium text-foreground">{rebateReplacement.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              People
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total product revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Net after rebates · Delivered {formatCurrency(totals.deliveredRevenue)} · Pending{' '}
              {formatCurrency(totals.pendingRevenue)}
            </p>
            {totals.rebatedRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Gross {formatCurrency(totals.grossRevenue)} · Rebated{' '}
                <span className="text-amber-700 dark:text-amber-400">
                  −{formatCurrency(totals.rebatedRevenue)}
                </span>
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
            <div className="text-2xl font-bold">{totals.totalOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.deliveredOrders} delivered · {pendingWorkflowOrders} in workflow
              {partialDeliveredOrders > 0
                ? ` · ${partialDeliveredOrders} partial (split by fulfilled qty)`
                : ''}
              {rebateReplacementOrders > 0
                ? ` · ${rebateReplacementOrders} rebate replacement`
                : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Buying clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.clients}</div>
            <p className="text-xs text-muted-foreground mt-1">Summed per KAM</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Performance Overview</CardTitle>
          <CardDescription>
            Compare Key Account user performance across different metrics and time periods. Revenue
            uses the same product analytics rules as the summary cards (line items, money/credit
            rebates, and change-item swaps on the source PO month). Click a data point or period
            label to view the breakdown.
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
                  <Label>Role Type</Label>
                  <Select
                    value={selectedRole}
                    onValueChange={(value) => {
                      setSelectedRole(value as RoleType);
                      setSelectedPerson('all');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Key Account Roles</SelectItem>
                      <SelectItem value="key_account_manager">Key Account Manager</SelectItem>
                      <SelectItem value="sales_director">Sales Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Person</Label>
                  <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{personAllLabel}</SelectItem>
                      {roleAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                          {agent.role === 'sales_director' ? ' (Director)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Metric</Label>
                  <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="orders">Delivered Orders</SelectItem>
                      <SelectItem value="clients">Buying Clients</SelectItem>
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
                  disabled={exporting || rows.length === 0}
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

            <div className="min-h-[520px]">
              {timeSeriesData.length > 0 && visibleAgents.length > 0 ? (
                <ResponsiveContainer width="100%" height={520}>
                  <LineChart data={timeSeriesData} margin={{ top: 16, right: 24, left: 8, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="period"
                      height={80}
                      tick={(props) => {
                        const { x, y, payload: tickPayload } = props;
                        const period = tickPayload?.value as string;
                        const row = timeSeriesData.find((d) => d.period === period);
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={16}
                            textAnchor="end"
                            fill="hsl(var(--muted-foreground))"
                            fontSize={11}
                            transform={`rotate(-45, ${x}, ${y})`}
                            className={row ? 'cursor-pointer hover:fill-primary' : undefined}
                            onClick={() => row && openPeriodDetail(row)}
                          >
                            {period}
                          </text>
                        );
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={() => null} cursor={false} />
                    <Legend content={(props) => <CustomLegend payload={props.payload as CustomLegendProps['payload']} />} />
                    {visibleAgents.map((agent) => (
                      <Line
                        key={agent.id}
                        type="monotone"
                        dataKey={agent.id}
                        stroke={agent.color}
                        strokeWidth={2.5}
                        dot={(dotProps) => {
                          const { key, cx, cy, payload } = dotProps;
                          return (
                            <ClickableChartDot
                              key={key}
                              cx={cx}
                              cy={cy}
                              payload={payload as TimeSeriesDataPoint | undefined}
                              fill={agent.color}
                              onPeriodClick={openPeriodDetail}
                            />
                          );
                        }}
                        activeDot={(dotProps) => {
                          const { key, cx, cy, payload } = dotProps;
                          return (
                            <ClickableChartDot
                              key={key}
                              cx={cx}
                              cy={cy}
                              payload={payload as TimeSeriesDataPoint | undefined}
                              fill={agent.color}
                              r={7}
                              onPeriodClick={openPeriodDetail}
                            />
                          );
                        }}
                        name={agent.name}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <Award className="h-10 w-10 opacity-50 mb-2" />
                  <p>No agent performance data available for the selected period.</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Analytics</CardTitle>
          <CardDescription>
            {chartTitle} performance for {metricLabel.toLowerCase()} within the selected date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Rebated</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Delivered POs</TableHead>
                  <TableHead className="text-right">Total POs</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Clients</TableHead>
                  <TableHead className="text-right">Avg Delivered PO</TableHead>
                  <TableHead>Top Product</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                      No agent analytics found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRows.map((row) => (
                    <TableRow key={row.kamId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.name}</p>
                          {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(row.grossDeliveredRevenue + row.grossPendingRevenue)}
                      </TableCell>
                      <TableCell className="text-right text-amber-700 dark:text-amber-400">
                        {row.rebatedDeliveredRevenue + row.rebatedPendingRevenue > 0
                          ? `−${formatCurrency(row.rebatedDeliveredRevenue + row.rebatedPendingRevenue)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">{row.deliveredOrders}</TableCell>
                      <TableCell className="text-right">{row.totalOrders}</TableCell>
                      <TableCell className="text-right">
                        {row.pendingOrders > 0 ? (
                          <Badge variant="outline" className="text-amber-600">{row.pendingOrders}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.uniqueClients}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.avgOrderValue)}</TableCell>
                      <TableCell>{row.topProduct}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <AnalyticsTablePagination
              page={agentTablePage}
              onPageChange={setAgentTablePage}
              totalRows={rows.length}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={periodDetailOpen} onOpenChange={setPeriodDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>
              {selectedPeriodRow?.period} — {getPeriodDetailMetricTitle()}
            </DialogTitle>
            <DialogDescription>
              {selectedMetric === 'revenue'
                ? 'Delivered and pending net revenue by agent. Pending includes in-workflow POs and remaining balance on partial-delivered POs (split by fulfilled qty).'
                : selectedMetric === 'orders'
                  ? 'Delivered, in-workflow, and partial-delivered PO counts plus PO line splits (same rules as product analytics).'
                  : 'Unique buying clients per agent in this period (summed per KAM).'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6 pb-6 min-h-0">
            {selectedPeriodRow && renderPeriodDetailContent(selectedPeriodRow)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
