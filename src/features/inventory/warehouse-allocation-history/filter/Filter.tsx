import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';

import type { WarehouseAllocationFilterKey } from '../utils/warehouseAllocationHistoryFilters';

type FilterOption = {
  id: string;
  name: string;
};

type WarehouseAllocationHistoryFilterProps = {
  selectedFilter: WarehouseAllocationFilterKey;
  filterValue: string;
  dateRangeFilter: DateRangeFilterValue;
  locationOptions: FilterOption[];
  performedByOptions: FilterOption[];
  brandOptions: FilterOption[];
  isLoadingBrands: boolean;
  showLocationFilter: boolean;
  onSelectedFilterChange: (value: WarehouseAllocationFilterKey) => void;
  onFilterValueChange: (value: string) => void;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  onClearFilters: () => void;
};

export function WarehouseAllocationHistoryFilter({
  selectedFilter,
  filterValue,
  dateRangeFilter,
  locationOptions,
  performedByOptions,
  brandOptions,
  isLoadingBrands,
  showLocationFilter,
  onSelectedFilterChange,
  onFilterValueChange,
  onDateRangeFilterChange,
  onClearFilters,
}: WarehouseAllocationHistoryFilterProps) {
  const selectTriggerClass = 'w-[160px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedFilter}
        onValueChange={(value) => {
          onSelectedFilterChange(value as WarehouseAllocationFilterKey);
          onFilterValueChange('');
        }}
      >
        <SelectTrigger className={selectTriggerClass}>
          <SelectValue placeholder="Filter by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {showLocationFilter && <SelectItem value="location">Sub-warehouse</SelectItem>}
          <SelectItem value="brand">Brand</SelectItem>
          <SelectItem value="performed_by">Performed by</SelectItem>
        </SelectContent>
      </Select>

      {selectedFilter === 'location' && showLocationFilter && (
        <Select value={filterValue || undefined} onValueChange={onFilterValueChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select sub-warehouse" />
          </SelectTrigger>
          <SelectContent>
            {locationOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedFilter === 'brand' && (
        <Select value={filterValue || undefined} onValueChange={onFilterValueChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={isLoadingBrands ? 'Loading brands...' : 'Select brand'} />
          </SelectTrigger>
          <SelectContent>
            {brandOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedFilter === 'performed_by' && (
        <Select value={filterValue || undefined} onValueChange={onFilterValueChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {performedByOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <DateRangeFilterPopover
        value={dateRangeFilter}
        onChange={onDateRangeFilterChange}
        triggerClassName="w-[160px]"
      />

      <Button type="button" variant="outline" className="shrink-0" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
