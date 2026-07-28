import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import {
  formatKeyAccountDashboardCurrency,
  type KeyAccountDashboardRevenueResult,
} from './keyAccountDashboardRevenue';

export function KeyAccountDashboardRevenueCard({
  summary,
}: {
  summary: KeyAccountDashboardRevenueResult['summary'];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Total sales revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatKeyAccountDashboardCurrency(summary.totalRevenue)}</div>
        <p className="text-xs text-muted-foreground mt-1">
          By order date · Paid {formatKeyAccountDashboardCurrency(summary.paidRevenue)} · Partial{' '}
          {formatKeyAccountDashboardCurrency(summary.partialRevenue)} · Unpaid{' '}
          {formatKeyAccountDashboardCurrency(summary.unpaidRevenue)}
        </p>
      </CardContent>
    </Card>
  );
}
