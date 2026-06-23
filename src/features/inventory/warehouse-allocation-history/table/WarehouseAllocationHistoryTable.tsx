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

import type { WarehouseAllocationGroup } from '../types';
import type { WarehouseAllocationSortKey } from '../utils/warehouseAllocationHistorySorting';
import { WarehouseAllocationGroupRow } from './TableRow';

export type WarehouseAllocationHistoryTableProps = {
  isLoading: boolean;
  pagedGroups: WarehouseAllocationGroup[];
  mainBrandFilterName: string | null;
  sortState: TableSortCycleState<WarehouseAllocationSortKey>;
  onSort: (key: WarehouseAllocationSortKey) => void;
};

export function WarehouseAllocationHistoryTable({
  isLoading,
  pagedGroups,
  mainBrandFilterName,
  sortState,
  onSort,
}: WarehouseAllocationHistoryTableProps) {
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
              label="Sub-Warehouse"
              sortKey="locationName"
              sortDirection={getTableSortDisplayDirection(sortState, 'locationName')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Brand"
              sortKey="brandName"
              sortDirection={getTableSortDisplayDirection(sortState, 'brandName')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Performed By"
              sortKey="performedByName"
              sortDirection={getTableSortDisplayDirection(sortState, 'performedByName')}
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
              <TableCell colSpan={8} className="h-24 text-center">
                Loading allocation history...
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            pagedGroups.map((group) => (
              <WarehouseAllocationGroupRow
                key={group.groupId}
                group={group}
                mainBrandFilterName={mainBrandFilterName}
              />
            ))}
          {!isLoading && pagedGroups.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center">
                No allocation history yet. Use{' '}
                <Link to="/inventory/sub-warehouses" className="underline">
                  Sub Warehouses
                </Link>{' '}
                to allocate stock.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
