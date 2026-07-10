import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getTableSortDisplayDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';

import type { AllocationHistoryGroup } from '../utils/allocationHistoryMappers';
import type { SuperAdminAllocationSortKey } from '../utils/superAdminAllocationHistorySorting';
import { AllocationGroupRow } from './TableRow';

type SuperAdminAllocationHistoryTableProps = {
  isLoading: boolean;
  pagedGroups: AllocationHistoryGroup[];
  sortState: TableSortCycleState<SuperAdminAllocationSortKey>;
  onSort: (key: SuperAdminAllocationSortKey) => void;
};

export function SuperAdminAllocationHistoryTable({
  isLoading,
  pagedGroups,
  sortState,
  onSort,
}: SuperAdminAllocationHistoryTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <SortableTableHead
              label="Date"
              sortKey="createdAt"
              sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Allocated To"
              sortKey="allocatedToName"
              sortDirection={getTableSortDisplayDirection(sortState, 'allocatedToName')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Flow"
              sortKey="flow"
              sortDirection={getTableSortDisplayDirection(sortState, 'flow')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Brand"
              sortKey="brandName"
              sortDirection={getTableSortDisplayDirection(sortState, 'brandName')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Allocated By"
              sortKey="allocatedByName"
              sortDirection={getTableSortDisplayDirection(sortState, 'allocatedByName')}
              onSort={onSort}
            />
            <SortableTableHead
              label="SKUs"
              sortKey="lineCount"
              sortDirection={getTableSortDisplayDirection(sortState, 'lineCount')}
              onSort={onSort}
              className="text-right"
            />
            <SortableTableHead
              label="Total Units"
              sortKey="totalQuantity"
              sortDirection={getTableSortDisplayDirection(sortState, 'totalQuantity')}
              onSort={onSort}
              className="text-right"
            />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                Loading allocation history...
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            pagedGroups.map((group) => <AllocationGroupRow key={group.groupId} group={group} />)}
          {!isLoading && pagedGroups.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center">
                No allocation history yet. Use{' '}
                <Link to="/inventory/allocations" className="underline">
                  Stock Allocations
                </Link>{' '}
                to create sessions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
