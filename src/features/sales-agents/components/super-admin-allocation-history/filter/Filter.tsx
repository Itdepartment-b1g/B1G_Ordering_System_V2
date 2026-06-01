import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { RecipientRole } from '../hooks/useCompanyTeamLeaders';
import type { AllocationFilterKey } from '../utils/allocationHistoryFilters';

type FilterOption = {
  id: string;
  name: string;
};

type SuperAdminAllocationHistoryFilterProps = {
  selectedFilter: AllocationFilterKey;
  filterValue: string;
  allocatedToRole: RecipientRole | '';
  fromDate: string;
  toDate: string;
  allocatedToTeamLeaderOptions: FilterOption[];
  allocatedToMobileSalesOptions: FilterOption[];
  allocatedByOptions: FilterOption[];
  brandOptions: FilterOption[];
  isLoadingBrands: boolean;
  onSelectedFilterChange: (value: AllocationFilterKey) => void;
  onFilterValueChange: (value: string) => void;
  onAllocatedToRoleChange: (value: RecipientRole | '') => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onClearFilters: () => void;
};

export function SuperAdminAllocationHistoryFilter({
  selectedFilter,
  filterValue,
  allocatedToRole,
  fromDate,
  toDate,
  allocatedToTeamLeaderOptions,
  allocatedToMobileSalesOptions,
  allocatedByOptions,
  brandOptions,
  isLoadingBrands,
  onSelectedFilterChange,
  onFilterValueChange,
  onAllocatedToRoleChange,
  onFromDateChange,
  onToDateChange,
  onClearFilters,
}: SuperAdminAllocationHistoryFilterProps) {
  const allocatedToUserOptions =
    allocatedToRole === 'team_leader'
      ? allocatedToTeamLeaderOptions
      : allocatedToRole === 'mobile_sales'
        ? allocatedToMobileSalesOptions
        : [];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Select
        value={selectedFilter}
        onValueChange={(value) => {
          onSelectedFilterChange(value as AllocationFilterKey);
          onFilterValueChange('');
          onAllocatedToRoleChange('');
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Filter by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="allocated_to">Allocated to</SelectItem>
          <SelectItem value="flow">Flow</SelectItem>
          <SelectItem value="brand">Brand</SelectItem>
          <SelectItem value="allocated_by">Allocated by</SelectItem>
        </SelectContent>
      </Select>

      {selectedFilter === 'allocated_to' && (
        <>
          <Select
            value={allocatedToRole || undefined}
            onValueChange={(value) => {
              onAllocatedToRoleChange(value as RecipientRole);
              onFilterValueChange('');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="team_leader">Team Leader</SelectItem>
              <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterValue}
            onValueChange={onFilterValueChange}
            disabled={!allocatedToRole}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !allocatedToRole
                    ? 'Select role first'
                    : allocatedToRole === 'team_leader'
                      ? 'Select team leader'
                      : 'Select mobile sales'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {allocatedToUserOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {selectedFilter === 'allocated_by' && (
        <Select value={filterValue} onValueChange={onFilterValueChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select allocator" />
          </SelectTrigger>
          <SelectContent>
            {allocatedByOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedFilter === 'flow' && (
        <Select value={filterValue} onValueChange={onFilterValueChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select flow" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main_to_leader">Main to Leader</SelectItem>
            <SelectItem value="leader_to_agent">Leader to Agent</SelectItem>
          </SelectContent>
        </Select>
      )}

      {selectedFilter === 'brand' && (
        <Select value={filterValue} onValueChange={onFilterValueChange} disabled={isLoadingBrands}>
          <SelectTrigger>
            <SelectValue placeholder={isLoadingBrands ? 'Loading brands...' : 'Select brand'} />
          </SelectTrigger>
          <SelectContent>
            {brandOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input type="date" value={fromDate} onChange={(e) => onFromDateChange(e.target.value)} />
      <Input type="date" value={toDate} onChange={(e) => onToDateChange(e.target.value)} />

      <Button variant="outline" className="w-fit justify-self-start" onClick={onClearFilters}>
        Clear filters
      </Button>
    </div>
  );
}
