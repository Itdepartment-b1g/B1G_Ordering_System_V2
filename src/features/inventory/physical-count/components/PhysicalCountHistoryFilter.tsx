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

import type {
  PhysicalCountHistoryFilterKey,
  PhysicalCountHistoryFilterOption,
} from '../utils/physicalCountHistoryFilters';

type PhysicalCountHistoryFilterProps = {
  selectedFilter: PhysicalCountHistoryFilterKey;
  filterValue: string;
  dateRangeFilter: DateRangeFilterValue;
  batchOptions: PhysicalCountHistoryFilterOption[];
  locationOptions: PhysicalCountHistoryFilterOption[];
  performedByOptions: PhysicalCountHistoryFilterOption[];
  showLocationFilter: boolean;
  isLoading?: boolean;
  onSelectedFilterChange: (value: PhysicalCountHistoryFilterKey) => void;
  onFilterValueChange: (value: string) => void;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  onClearFilters: () => void;
};

export function PhysicalCountHistoryFilter({
  selectedFilter,
  filterValue,
  dateRangeFilter,
  batchOptions,
  locationOptions,
  performedByOptions,
  showLocationFilter,
  isLoading = false,
  onSelectedFilterChange,
  onFilterValueChange,
  onDateRangeFilterChange,
  onClearFilters,
}: PhysicalCountHistoryFilterProps) {
  const selectTriggerClass = 'w-[160px]';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedFilter}
        onValueChange={(value) => {
          onSelectedFilterChange(value as PhysicalCountHistoryFilterKey);
          onFilterValueChange('');
        }}
      >
        <SelectTrigger className={selectTriggerClass}>
          <SelectValue placeholder="Filter by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="batch">Batch</SelectItem>
          {showLocationFilter && <SelectItem value="location">Sub-warehouse</SelectItem>}
          <SelectItem value="performed_by">Counted by</SelectItem>
        </SelectContent>
      </Select>

      {selectedFilter === 'batch' && (
        <Select
          value={filterValue || undefined}
          onValueChange={onFilterValueChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={isLoading ? 'Loading batches…' : 'Select batch'} />
          </SelectTrigger>
          <SelectContent>
            {batchOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedFilter === 'location' && showLocationFilter && (
        <Select
          value={filterValue || undefined}
          onValueChange={onFilterValueChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue
              placeholder={isLoading ? 'Loading locations…' : 'Select sub-warehouse'}
            />
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

      {selectedFilter === 'performed_by' && (
        <Select
          value={filterValue || undefined}
          onValueChange={onFilterValueChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={isLoading ? 'Loading users…' : 'Select user'} />
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
