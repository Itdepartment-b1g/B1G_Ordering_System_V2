import { Button } from '@/components/ui/button';
import {
  ALL_TIME_DATE_RANGE,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/features/shared/components/QuickFilterSheet';

import type {
  PhysicalCountHistoryFilterOption,
  PhysicalCountHistoryQuickColumn,
} from '../utils/physicalCountHistoryFilters';

type PhysicalCountStatusFilter = 'all';

const PhysicalCountHistoryQuickFilterSheet = QuickFilterSheet<
  PhysicalCountHistoryQuickColumn,
  PhysicalCountStatusFilter
>;

type PhysicalCountHistoryFilterProps = {
  dateRangeFilter: DateRangeFilterValue;
  columnClauses: QuickFilterAndClause<PhysicalCountHistoryQuickColumn>[];
  batchOptions: PhysicalCountHistoryFilterOption[];
  locationOptions: PhysicalCountHistoryFilterOption[];
  performedByOptions: PhysicalCountHistoryFilterOption[];
  showLocationFilter: boolean;
  isLoading?: boolean;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  onColumnClausesChange: (
    clauses: QuickFilterAndClause<PhysicalCountHistoryQuickColumn>[]
  ) => void;
  onClearFilters: () => void;
};

export function PhysicalCountHistoryFilter({
  dateRangeFilter,
  columnClauses,
  batchOptions,
  locationOptions,
  performedByOptions,
  showLocationFilter,
  isLoading = false,
  onDateRangeFilterChange,
  onColumnClausesChange,
  onClearFilters,
}: PhysicalCountHistoryFilterProps) {
  const columns: QuickFilterColumn<PhysicalCountHistoryQuickColumn>[] = [
    {
      key: 'batch',
      label: isLoading ? 'Batch (loading…)' : 'Batch',
      options: batchOptions.map((opt) => ({ value: opt.id, label: opt.name })),
      searchPlaceholder: 'Search batch…',
    },
    ...(showLocationFilter
      ? ([
          {
            key: 'location' as const,
            label: isLoading ? 'Location (loading…)' : 'Sub-warehouse',
            options: locationOptions.map((opt) => ({ value: opt.id, label: opt.name })),
            searchPlaceholder: 'Search location…',
          },
        ] satisfies QuickFilterColumn<PhysicalCountHistoryQuickColumn>[])
      : []),
    {
      key: 'performed_by',
      label: isLoading ? 'Counted by (loading…)' : 'Counted by',
      options: performedByOptions.map((opt) => ({ value: opt.id, label: opt.name })),
      searchPlaceholder: 'Search person…',
    },
  ];

  const clearQuickFilters = () => {
    onDateRangeFilterChange(ALL_TIME_DATE_RANGE);
    onColumnClausesChange([createQuickFilterAndClause<PhysicalCountHistoryQuickColumn>()]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PhysicalCountHistoryQuickFilterSheet
        dateRange={dateRangeFilter}
        onDateRangeChange={onDateRangeFilterChange}
        columns={columns}
        columnClauses={columnClauses}
        onColumnClausesChange={onColumnClausesChange}
        status="all"
        statusOptions={[{ value: 'all', label: 'All' }]}
        onStatusChange={() => undefined}
        onClear={clearQuickFilters}
      />

      <Button type="button" variant="outline" className="shrink-0" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
