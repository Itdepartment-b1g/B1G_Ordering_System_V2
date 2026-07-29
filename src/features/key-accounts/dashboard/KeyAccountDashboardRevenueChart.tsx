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
  formatKeyAccountDashboardCurrency,
  type KeyAccountDashboardMonthlyPaymentRow,
} from './keyAccountDashboardRevenue';

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
}: {
  monthlyData: KeyAccountDashboardMonthlyPaymentRow[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Revenue Overview
        </CardTitle>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs font-normal text-muted-foreground text-right sm:block">
            Standard by order date · Consignment paid by payment date
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
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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

                  return (
                    <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                      <p className="font-semibold mb-2">{label}</p>
                      <p className="text-lg font-bold">{formatKeyAccountDashboardCurrency(total)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Paid {formatKeyAccountDashboardCurrency(paid)} · Partial{' '}
                        {formatKeyAccountDashboardCurrency(partial)} · Unpaid{' '}
                        {formatKeyAccountDashboardCurrency(unpaid)} · Consignment{' '}
                        {formatKeyAccountDashboardCurrency(consignment)} · Settlement disc.{' '}
                        {formatKeyAccountDashboardCurrency(settlementDiscount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Consignment paid uses payment date; float stays on order month
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
              <Bar dataKey="paidRevenue" stackId="revenue" fill="#22c55e" name="paidRevenue" />
              <Bar dataKey="partialRevenue" stackId="revenue" fill="#f59e0b" name="partialRevenue" />
              <Bar dataKey="unpaidRevenue" stackId="revenue" fill="#f97316" name="unpaidRevenue" />
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
        </div>
      </CardContent>
    </Card>
  );
}
