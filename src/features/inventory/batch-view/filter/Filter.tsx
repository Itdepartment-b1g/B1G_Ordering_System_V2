import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import { ALL_WAREHOUSES_FILTER_VALUE } from '../utils/batchInventoryFilters';

type BrandOption = {
  id: string;
  name: string;
};

type LocationOption = {
  id: string;
  name: string;
};

export type BatchViewQuickColumn = 'brand';
type BatchViewStatusFilter = 'all';

const BatchViewQuickFilterSheet = QuickFilterSheet<BatchViewQuickColumn, BatchViewStatusFilter>;

type BatchViewFilterProps = {
  search: string;
  dateRangeFilter: DateRangeFilterValue;
  brandOptions: BrandOption[];
  locationOptions: LocationOption[];
  selectedLocationId: string;
  showLocationPicker: boolean;
  isLoadingBrands: boolean;
  columnClauses: QuickFilterAndClause<BatchViewQuickColumn>[];
  onSearchChange: (value: string) => void;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  onLocationChange: (value: string) => void;
  onColumnClausesChange: (clauses: QuickFilterAndClause<BatchViewQuickColumn>[]) => void;
  onClearFilters: () => void;
};

export function BatchViewFilter({
  search,
  dateRangeFilter,
  brandOptions,
  locationOptions,
  selectedLocationId,
  showLocationPicker,
  isLoadingBrands,
  columnClauses,
  onSearchChange,
  onDateRangeFilterChange,
  onLocationChange,
  onColumnClausesChange,
  onClearFilters,
}: BatchViewFilterProps) {
  const columns: QuickFilterColumn<BatchViewQuickColumn>[] = [
    {
      key: 'brand',
      label: isLoadingBrands ? 'Brand (loading…)' : 'Brand',
      options: brandOptions.map((opt) => ({ value: opt.id, label: opt.name })),
      searchPlaceholder: 'Search brand…',
    },
  ];

  const clearQuickFilters = () => {
    onDateRangeFilterChange(ALL_TIME_DATE_RANGE);
    onColumnClausesChange([createQuickFilterAndClause<BatchViewQuickColumn>()]);
    if (showLocationPicker) {
      onLocationChange(ALL_WAREHOUSES_FILTER_VALUE);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search batch, brand, or variant..."
        className="w-full max-w-xs"
      />

      <BatchViewQuickFilterSheet
        dateRange={dateRangeFilter}
        onDateRangeChange={onDateRangeFilterChange}
        columns={columns}
        columnClauses={columnClauses}
        onColumnClausesChange={onColumnClausesChange}
        status="all"
        statusOptions={[{ value: 'all', label: 'All' }]}
        onStatusChange={() => undefined}
        extraSelects={
          showLocationPicker
            ? [
                {
                  title: 'Warehouse',
                  value: selectedLocationId || ALL_WAREHOUSES_FILTER_VALUE,
                  options: [
                    { value: ALL_WAREHOUSES_FILTER_VALUE, label: 'All warehouses' },
                    ...locationOptions.map((opt) => ({ value: opt.id, label: opt.name })),
                  ],
                  onChange: onLocationChange,
                },
              ]
            : []
        }
        onClear={clearQuickFilters}
      />

      <Button type="button" variant="outline" className="shrink-0" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
