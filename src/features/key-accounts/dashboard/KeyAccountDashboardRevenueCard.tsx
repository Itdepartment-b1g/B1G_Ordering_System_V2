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
          Total product revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatKeyAccountDashboardCurrency(summary.totalRevenue)}</div>
        <p className="text-xs text-muted-foreground mt-1">
          Net after rebates · Delivered {formatKeyAccountDashboardCurrency(summary.deliveredRevenue)} ·
          Pending {formatKeyAccountDashboardCurrency(summary.pendingRevenue)}
        </p>
        {summary.rebatedRevenue > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Gross {formatKeyAccountDashboardCurrency(summary.grossRevenue)} · Rebated{' '}
            <span className="text-amber-700 dark:text-amber-400">
              −{formatKeyAccountDashboardCurrency(summary.rebatedRevenue)}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
