import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type StatusFilter = 'all' | 'present' | 'absent';

type AttendanceOverviewFiltersProps = {
  dateRangeFilter: DateRangeFilterValue;
  onDateRangeFilterChange: (value: DateRangeFilterValue) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  agentNameSearch: string;
  onAgentNameSearchChange: (value: string) => void;
  agentEmailSearch: string;
  onAgentEmailSearchChange: (value: string) => void;
  onClearFilters: () => void;
  filtersActive: boolean;
};

export function AttendanceOverviewFilters({
  dateRangeFilter,
  onDateRangeFilterChange,
  statusFilter,
  onStatusFilterChange,
  agentNameSearch,
  onAgentNameSearchChange,
  agentEmailSearch,
  onAgentEmailSearchChange,
  onClearFilters,
  filtersActive,
}: AttendanceOverviewFiltersProps) {
  const controlClass = 'h-10 w-full';

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium leading-none">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={v => {
              if (v === 'all' || v === 'present' || v === 'absent') {
                onStatusFilterChange(v);
              }
            }}
          >
            <SelectTrigger className={controlClass}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 min-w-0">
          <Label htmlFor="att-name" className="text-sm font-medium leading-none">
            Agent name
          </Label>
          <Input
            id="att-name"
            className={controlClass}
            placeholder="Name"
            value={agentNameSearch}
            onChange={e => onAgentNameSearchChange(e.target.value)}
          />
        </div>

        <div className="space-y-2 min-w-0">
          <Label htmlFor="att-email" className="text-sm font-medium leading-none">
            Agent email
          </Label>
          <Input
            id="att-email"
            className={controlClass}
            placeholder="Email"
            value={agentEmailSearch}
            onChange={e => onAgentEmailSearchChange(e.target.value)}
          />
        </div>

        <div className="space-y-2 min-w-0">
          <Label className="text-sm font-medium leading-none">Date range</Label>
          <DateRangeFilterPopover
            value={dateRangeFilter}
            onChange={onDateRangeFilterChange}
            triggerClassName={`${controlClass} justify-between`}
            align="end"
          />
        </div>

        <div className="space-y-2">
          <Label
            className="text-sm font-medium leading-none invisible pointer-events-none select-none"
            aria-hidden
          >
            Actions
          </Label>
          <Button
            type="button"
            variant="outline"
            className={`${controlClass} w-full sm:w-auto`}
            disabled={!filtersActive}
            onClick={onClearFilters}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Business dates use Asia/Manila. Use the date filter for presets (This Month, Last Month, etc.) or a
        custom range — same as Allocation History. Only <span className="font-medium text-foreground">present</span>{' '}
        and <span className="font-medium text-foreground">absent</span> rows are shown.
      </p>
    </div>
  );
}
