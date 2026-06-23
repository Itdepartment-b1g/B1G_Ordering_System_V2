import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getTableSortDisplayDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { cn } from '@/lib/utils';

import type { HubSortKey } from './hubListSorting';

const th =
  'h-11 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';

type HubListTableHeaderProps = {
  sortState: TableSortCycleState<HubSortKey>;
  onSort: (key: HubSortKey) => void;
};

export function HubListTableHeader({ sortState, onSort }: HubListTableHeaderProps) {
  return (
    <TableHeader
      className={cn(
        'sticky top-0 z-10 border-b border-border/60 bg-gradient-to-b from-muted/90 to-muted/70 shadow-sm',
        'backdrop-blur-md supports-[backdrop-filter]:from-muted/80 supports-[backdrop-filter]:to-muted/60',
        '[&_tr]:border-0',
      )}
    >
      <TableRow className="border-0 hover:bg-transparent">
        <SortableTableHead
          label="Hub Name"
          sortKey="hubName"
          sortDirection={getTableSortDisplayDirection(sortState, 'hubName')}
          onSort={onSort}
          className={cn(th, 'min-w-[160px] pl-6')}
        />
        <SortableTableHead
          label="Location"
          sortKey="location"
          sortDirection={getTableSortDisplayDirection(sortState, 'location')}
          onSort={onSort}
          className={cn(th, 'min-w-[220px]')}
        />
        <SortableTableHead
          label="Team leader"
          sortKey="teamLeader"
          sortDirection={getTableSortDisplayDirection(sortState, 'teamLeader')}
          onSort={onSort}
          className={cn(th, 'min-w-[140px]')}
        />
        <SortableTableHead
          label="Created by"
          sortKey="createdBy"
          sortDirection={getTableSortDisplayDirection(sortState, 'createdBy')}
          onSort={onSort}
          className={cn(th, 'min-w-[168px]')}
        />
        <SortableTableHead
          label="Created"
          sortKey="createdAt"
          sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
          onSort={onSort}
          className={cn(th, 'min-w-[128px] whitespace-nowrap')}
        />
        <TableHead className={cn(th, 'w-[72px] pr-6 text-right')}>Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}
