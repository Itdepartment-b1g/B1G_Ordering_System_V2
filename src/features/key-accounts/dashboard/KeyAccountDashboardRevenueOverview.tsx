import { KeyAccountDashboardRevenueChart } from './KeyAccountDashboardRevenueChart';
import type { KeyAccountDashboardMonthlyPaymentRow } from './keyAccountDashboardRevenue';

/** Shared revenue overview chart for Sales Head, Sales Admin, and Sales Director dashboards. */
export function KeyAccountDashboardRevenueOverview({
  monthlyData,
  selectedYear,
  onYearChange,
}: {
  monthlyData: KeyAccountDashboardMonthlyPaymentRow[];
  selectedYear: number;
  onYearChange: (year: number) => void;
}) {
  return (
    <KeyAccountDashboardRevenueChart
      monthlyData={monthlyData}
      selectedYear={selectedYear}
      onYearChange={onYearChange}
    />
  );
}
