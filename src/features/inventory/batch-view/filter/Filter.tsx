import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import { ALL_WAREHOUSES_FILTER_VALUE } from '../utils/batchInventoryFilters';

type BrandOption = {
  id: string;
  name: string;
};

type LocationOption = {
  id: string;
  name: string;
};

type BatchViewFilterProps = {
  search: string;
  brandId: string;
  dateRangeFilter: DateRangeFilterValue;
  brandOptions: BrandOption[];
  locationOptions: LocationOption[];
  selectedLocationId: string;
  showLocationPicker: boolean;
  isLoadingBrands: boolean;
  onSearchChange: (value: string) => void;
  onBrandIdChange: (value: string) => void;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  onLocationChange: (value: string) => void;
  onClearFilters: () => void;
};

export function BatchViewFilter({
  search,
  brandId,
  dateRangeFilter,
  brandOptions,
  locationOptions,
  selectedLocationId,
  showLocationPicker,
  isLoadingBrands,
  onSearchChange,
  onBrandIdChange,
  onDateRangeFilterChange,
  onLocationChange,
  onClearFilters,
}: BatchViewFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search batch, brand, or variant..."
        className="w-full max-w-xs"
      />

      {showLocationPicker && (
        <Select
          value={selectedLocationId || ALL_WAREHOUSES_FILTER_VALUE}
          onValueChange={onLocationChange}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_WAREHOUSES_FILTER_VALUE}>All warehouses</SelectItem>
            {locationOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={brandId || 'all'} onValueChange={(v) => onBrandIdChange(v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={isLoadingBrands ? 'Loading brands...' : 'All brands'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All brands</SelectItem>
          {brandOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
