import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { BarChart3 } from 'lucide-react';
import {
  buildKeyAccountDashboardMonthPoBreakdown,
  formatKeyAccountDashboardCurrency,
  KEY_ACCOUNT_DASHBOARD_MONTH_NAMES,
  type KeyAccountDashboardMonthPoRow,
  type KeyAccountDashboardMonthlyPaymentRow,
  type KeyAccountDashboardOrder,
  type KeyAccountDashboardPaymentRow,
} from './keyAccountDashboardRevenue';
import { KeyAccountDashboardRevenueMonthDialog } from './KeyAccountDashboardRevenueMonthDialog';

const BAR_LABELS: Record<string, string> = {
  paidRevenue: 'Paid',
  partialRevenue: 'Partial',
  unpaidRevenue: 'Unpaid',
  consignmentRevenue: 'Consignment',
  settlementDiscountRevenue: 'Settlement disc.',
};

export function KeyAccountDashboardRevenueChart({
  monthlyData,
  selectedYear,
  onYearChange,
  orders = [],
  payments = [],
}: {
  monthlyData: KeyAccountDashboardMonthlyPaymentRow[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  orders?: KeyAccountDashboardOrder[];
  payments?: KeyAccountDashboardPaymentRow[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);

  const selectedMonthlyRow =
    selectedMonthIndex === null ? null : monthlyData[selectedMonthIndex] ?? null;

  const poRows: KeyAccountDashboardMonthPoRow[] = useMemo(() => {
    if (selectedMonthIndex === null) return [];
    return buildKeyAccountDashboardMonthPoBreakdown(
      orders,
      payments,
      selectedYear,
      selectedMonthIndex
    );
  }, [orders, payments, selectedMonthIndex, selectedYear]);

  const openMonth = (monthLabel: string) => {
    const monthIndex = KEY_ACCOUNT_DASHBOARD_MONTH_NAMES.indexOf(
      monthLabel as (typeof KEY_ACCOUNT_DASHBOARD_MONTH_NAMES)[number]
    );
    if (monthIndex < 0) return;
    setSelectedMonthIndex(monthIndex);
    setDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Revenue Overview
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-normal text-muted-foreground text-right sm:block">
              Standard by order date · Consignment paid by payment date · Click a month for PO
              breakdown
            </span>
            <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
              <SelectTrigger className="h-9 w-[120px]">
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
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <div className="w-full h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                onClick={(state) => {
                  const label = state?.activeLabel;
                  if (typeof label === 'string') openMonth(label);
                }}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, cursor: 'pointer' }}
                  onClick={(data) => {
                    const label =
                      typeof data === 'object' && data && 'value' in data
                        ? String((data as { value?: unknown }).value ?? '')
                        : '';
                    if (label) openMonth(label);
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as KeyAccountDashboardMonthlyPaymentRow;
                    const paid = row.paidRevenue || 0;
                    const partial = row.partialRevenue || 0;
                    const unpaid = row.unpaidRevenue || 0;
                    const consignment = row.consignmentRevenue || 0;
                    const settlementDiscount = row.settlementDiscountRevenue || 0;
                    const total =
                      row.totalRevenue ||
                      paid + partial + unpaid + consignment + settlementDiscount;

                    const buckets = [
                      { label: 'Paid', value: paid, color: '#22c55e' },
                      { label: 'Partial', value: partial, color: '#f59e0b' },
                      { label: 'Unpaid', value: unpaid, color: '#f97316' },
                      { label: 'Consignment', value: consignment, color: '#0ea5e9' },
                      { label: 'Settlement disc.', value: settlementDiscount, color: '#64748b' },
                    ];

                    return (
                      <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                        <p className="font-semibold mb-1">{label}</p>
                        <p className="text-lg font-bold mb-2">
                          {formatKeyAccountDashboardCurrency(total)}
                        </p>
                        <div className="space-y-1">
                          {buckets.map((bucket) => (
                            <div
                              key={bucket.label}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="flex items-center gap-1.5 font-medium" style={{ color: bucket.color }}>
                                <span
                                  className="inline-block h-2 w-2 rounded-sm shrink-0"
                                  style={{ backgroundColor: bucket.color }}
                                  aria-hidden
                                />
                                {bucket.label}
                              </span>
                              <span className="font-semibold tabular-nums" style={{ color: bucket.color }}>
                                {formatKeyAccountDashboardCurrency(bucket.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Consignment paid uses payment date; float stays on order month
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Click to view PO breakdown
                        </p>
                        {(row.unpaidOrders > 0 ||
                          row.partialOrders > 0 ||
                          row.consignmentOrders > 0) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {row.unpaidOrders} unpaid · {row.partialOrders} partial ·{' '}
                            {row.consignmentOrders} consignment
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend formatter={(value: string) => BAR_LABELS[value] || value} />
                <Bar dataKey="paidRevenue" stackId="revenue" fill="#22c55e" name="paidRevenue" cursor="pointer" />
                <Bar dataKey="partialRevenue" stackId="revenue" fill="#f59e0b" name="partialRevenue" cursor="pointer" />
                <Bar dataKey="unpaidRevenue" stackId="revenue" fill="#f97316" name="unpaidRevenue" cursor="pointer" />
                <Bar
                  dataKey="consignmentRevenue"
                  stackId="revenue"
                  fill="#0ea5e9"
                  name="consignmentRevenue"
                  cursor="pointer"
                />
                <Bar
                  dataKey="settlementDiscountRevenue"
                  stackId="revenue"
                  fill="#64748b"
                  name="settlementDiscountRevenue"
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <KeyAccountDashboardRevenueMonthDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        monthLabel={selectedMonthlyRow?.month ?? null}
        year={selectedYear}
        monthlyRow={selectedMonthlyRow}
        poRows={poRows}
      />
    </>
  );
}
