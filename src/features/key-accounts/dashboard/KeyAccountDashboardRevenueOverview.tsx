import { KeyAccountDashboardRevenueChart } from './KeyAccountDashboardRevenueChart';
import type {
  KeyAccountDashboardMonthlyPaymentRow,
  KeyAccountDashboardOrder,
  KeyAccountDashboardPaymentRow,
} from './keyAccountDashboardRevenue';

/** Shared revenue overview chart for Sales Head, Sales Admin, and Sales Director dashboards. */
export function KeyAccountDashboardRevenueOverview({
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
  return (
    <KeyAccountDashboardRevenueChart
      monthlyData={monthlyData}
      selectedYear={selectedYear}
      onYearChange={onYearChange}
      orders={orders}
      payments={payments}
    />
  );
}
