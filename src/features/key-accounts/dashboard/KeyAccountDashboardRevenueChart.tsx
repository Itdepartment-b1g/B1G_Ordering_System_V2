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
            Sales by order date — paid vs partial vs unpaid
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
                  const total = row.totalRevenue || paid + partial + unpaid;

                  return (
                    <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                      <p className="font-semibold mb-2">{label}</p>
                      <p className="text-lg font-bold">{formatKeyAccountDashboardCurrency(total)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        By order date · Paid {formatKeyAccountDashboardCurrency(paid)} · Partial{' '}
                        {formatKeyAccountDashboardCurrency(partial)} · Unpaid{' '}
                        {formatKeyAccountDashboardCurrency(unpaid)}
                      </p>
                      {(row.unpaidOrders > 0 || row.partialOrders > 0) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.unpaidOrders} unpaid · {row.partialOrders} partial POs
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
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
