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
  type KeyAccountMonthlyRevenueRow,
} from './keyAccountDashboardRevenue';

export function KeyAccountDashboardRevenueChart({
  monthlyData,
  selectedYear,
  onYearChange,
}: {
  monthlyData: KeyAccountMonthlyRevenueRow[];
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
            Net revenue after rebates — delivered vs pending
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
                  const row = payload[0].payload as KeyAccountMonthlyRevenueRow;
                  const delivered = row.deliveredRevenue || 0;
                  const pending = row.pendingRevenue || 0;
                  const gross = row.grossRevenue || 0;
                  const rebated = row.rebatedRevenue || 0;
                  const total = row.totalRevenue || delivered + pending;

                  return (
                    <div className="bg-white border rounded-lg p-3 shadow-lg text-sm max-w-xs">
                      <p className="font-semibold mb-2">{label}</p>
                      <p className="text-lg font-bold">{formatKeyAccountDashboardCurrency(total)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Net after rebates · Delivered {formatKeyAccountDashboardCurrency(delivered)} ·
                        Pending {formatKeyAccountDashboardCurrency(pending)}
                      </p>
                      {rebated > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Gross {formatKeyAccountDashboardCurrency(gross)} · Rebated{' '}
                          <span className="text-amber-700 dark:text-amber-400">
                            −{formatKeyAccountDashboardCurrency(rebated)}
                          </span>
                        </p>
                      )}
                    </div>
                  );
                }}
              />
              <Legend
                formatter={(value: string) =>
                  value === 'deliveredRevenue' ? 'Delivered' : 'Pending'
                }
              />
              <Bar dataKey="deliveredRevenue" stackId="revenue" fill="#3b82f6" name="deliveredRevenue" />
              <Bar dataKey="pendingRevenue" stackId="revenue" fill="#f97316" name="pendingRevenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
