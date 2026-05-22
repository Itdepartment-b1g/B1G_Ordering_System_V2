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
import { Award, CalendarIcon, Filter, ShoppingCart, TrendingUp, Users, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from './AnalyticsTablePagination';

interface AnalyticsOrder {
  id: string;
  order_date: string;
  total_amount: number | null;
  status: string | null;
  workflow_status: string | null;
  kam_id: string | null;
  key_account_client_id: string | null;
  analytics_only?: boolean;
  kam?: { full_name: string | null; email: string | null; role: string | null } | { full_name: string | null; email: string | null; role: string | null }[] | null;
}

interface AnalyticsItem {
  purchase_order_id: string;
  quantity: number | null;
  variants?: { name: string | null } | { name: string | null }[] | null;
}

interface KeyAccountKamAnalyticsTabProps {
  orders: AnalyticsOrder[];
  items: AnalyticsItem[];
  people?: unknown[];
  formatCurrency: (value: number) => string;
}

type MetricType = 'revenue' | 'orders' | 'clients';
type RoleType = 'all' | 'key_account_manager' | 'sales_director';
type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_year' | 'custom';

interface DateRange {
  from?: Date;
  to?: Date;
}

const KAM_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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

export default function KeyAccountKamAnalyticsTab({ orders, items, formatCurrency }: KeyAccountKamAnalyticsTabProps) {
  const [selectedRole, setSelectedRole] = useState<RoleType>('all');
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [agentTablePage, setAgentTablePage] = useState(1);

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
    () => orders.filter((order) => !order.analytics_only && inRange(order.order_date, dateRange)),
    [dateRange, orders]
  );

  const deliveredOrders = useMemo(() => filteredOrders.filter(isDeliveredRevenue), [filteredOrders]);
  const deliveredOrderById = useMemo(() => new Map(deliveredOrders.map((order) => [order.id, order])), [deliveredOrders]);

  const timeSeriesData = useMemo(() => {
    const periods = buildPeriods(orders, dateRange);
    return periods.map((period) => {
      const point: Record<string, string | number> = { period: period.label };
      visibleAgents.forEach((agent) => {
        const periodOrders = deliveredOrders.filter((order) => {
          const date = new Date(order.order_date);
          return (order.kam_id || 'unassigned') === agent.id && date >= period.start && date <= period.end;
        });

        if (selectedMetric === 'revenue') {
          point[agent.id] = periodOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
        } else if (selectedMetric === 'orders') {
          point[agent.id] = periodOrders.length;
        } else {
          point[agent.id] = new Set(periodOrders.map((order) => order.key_account_client_id).filter(Boolean)).size;
        }
      });
      return point;
    });
  }, [dateRange, deliveredOrders, orders, selectedMetric, visibleAgents]);

  const rows = useMemo(() => {
    const rowMap = new Map<string, {
      kamId: string;
      name: string;
      email: string;
      totalOrders: number;
      deliveredOrders: number;
      pendingOrders: number;
      deliveredRevenue: number;
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
        deliveredRevenue: 0,
        clientIds: new Set<string>(),
        productQty: new Map<string, number>(),
      });
    });

    filteredOrders.forEach((order) => {
      const kamId = order.kam_id || 'unassigned';
      const row = rowMap.get(kamId);
      if (!row) return;

      row.totalOrders += 1;
      if ((order.workflow_status || '').includes('pending') || order.status === 'pending') row.pendingOrders += 1;
      if (isDeliveredRevenue(order)) {
        row.deliveredOrders += 1;
        row.deliveredRevenue += Number(order.total_amount || 0);
        if (order.key_account_client_id) row.clientIds.add(order.key_account_client_id);
      }
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
        deliveredRevenue: row.deliveredRevenue,
        uniqueClients: row.clientIds.size,
        avgOrderValue: row.deliveredOrders > 0 ? row.deliveredRevenue / row.deliveredOrders : 0,
        topProduct: Array.from(row.productQty.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No delivered products',
      }))
      .sort((a, b) => b.deliveredRevenue - a.deliveredRevenue);
  }, [deliveredOrderById, filteredOrders, items, visibleAgents]);

  const paginatedRows = useMemo(
    () => paginateAnalyticsRows(rows, agentTablePage),
    [rows, agentTablePage]
  );

  useEffect(() => {
    setAgentTablePage(1);
  }, [rows.length, selectedRole, selectedPerson, datePreset, dateRange?.from, dateRange?.to]);

  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.deliveredRevenue,
      totalOrders: acc.totalOrders + row.totalOrders,
      deliveredOrders: acc.deliveredOrders + row.deliveredOrders,
      clients: acc.clients + row.uniqueClients,
    }),
    { revenue: 0, totalOrders: 0, deliveredOrders: 0, clients: 0 }
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

  const formatValue = (value: number) => (
    selectedMetric === 'revenue' ? formatCurrency(value) : value.toLocaleString()
  );

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
              Delivered revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Delivered POs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.deliveredOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">{totals.totalOrders} total POs</p>
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
          <CardDescription>Compare Key Account user performance across different metrics and time periods.</CardDescription>
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
                            <Button variant={datePreset === 'this_month' ? 'default' : 'outline'} onClick={() => setPreset('this_month')} className="h-11">
                              This Month
                            </Button>
                            <Button variant={datePreset === 'last_month' ? 'default' : 'outline'} onClick={() => setPreset('last_month')} className="h-11">
                              Last Month
                            </Button>
                            <Button variant={datePreset === 'last_3_months' ? 'default' : 'outline'} onClick={() => setPreset('last_3_months')} className="h-11">
                              Last 3 Months
                            </Button>
                            <Button variant={datePreset === 'last_6_months' ? 'default' : 'outline'} onClick={() => setPreset('last_6_months')} className="h-11">
                              Last 6 Months
                            </Button>
                            <Button variant={datePreset === 'this_year' ? 'default' : 'outline'} onClick={() => setPreset('this_year')} className="h-11">
                              This Year
                            </Button>
                            <Button variant={datePreset === 'last_year' ? 'default' : 'outline'} onClick={() => setPreset('last_year')} className="h-11">
                              Last Year
                            </Button>
                            <Button variant={datePreset === 'all' ? 'default' : 'outline'} onClick={() => setPreset('all')} className="col-span-2 h-11">
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
                              <Label htmlFor="ka-agent-start-date" className="text-xs text-muted-foreground">From</Label>
                              <Input
                                id="ka-agent-start-date"
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
                              <Label htmlFor="ka-agent-end-date" className="text-xs text-muted-foreground">To</Label>
                              <Input
                                id="ka-agent-end-date"
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
              </CardContent>
            </Card>

            <div className="min-h-[520px]">
              {timeSeriesData.length > 0 && visibleAgents.length > 0 ? (
                <ResponsiveContainer width="100%" height={520}>
                  <LineChart data={timeSeriesData} margin={{ top: 16, right: 24, left: 8, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatValue(Number(value))} labelFormatter={(label) => `${label}`} />
                    <Legend content={(props) => <CustomLegend payload={props.payload as CustomLegendProps['payload']} />} />
                    {visibleAgents.map((agent) => (
                      <Line
                        key={agent.id}
                        type="monotone"
                        dataKey={agent.id}
                        stroke={agent.color}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: agent.color }}
                        activeDot={{ r: 6 }}
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
                  <TableHead className="text-right">Delivered Revenue</TableHead>
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
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                      <TableCell className="text-right font-medium">{formatCurrency(row.deliveredRevenue)}</TableCell>
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
    </div>
  );
}
