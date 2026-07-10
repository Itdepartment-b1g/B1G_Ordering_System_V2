import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from '@/components/ui/table';



import type { BatchInventoryGroup } from '../types';

import type { BatchViewSortKey } from '../utils/batchInventorySorting';

import { BatchViewRow } from './BatchViewRow';

import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getTableSortDisplayDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';

type BatchViewTableProps = {
  isLoading: boolean;
  pagedGroups: BatchInventoryGroup[];
  locationLabel: string;
  companyId?: string;
  sortState: TableSortCycleState<BatchViewSortKey>;
  onSort: (key: BatchViewSortKey) => void;
};

export function BatchViewTable({
  isLoading,
  pagedGroups,
  locationLabel,
  companyId,
  sortState,
  onSort,
}: BatchViewTableProps) {

  return (

    <div className="overflow-hidden rounded-md border">

      <Table>

        <TableHeader>

          <TableRow>

            <TableHead className="w-10" />

            <SortableTableHead
              label="Batch"
              sortKey="batchNumber"
              sortDirection={getTableSortDisplayDirection(sortState, 'batchNumber')}
              onSort={onSort}
            />

            <SortableTableHead
              label="Warehouse"
              sortKey="locationName"
              sortDirection={getTableSortDisplayDirection(sortState, 'locationName')}
              onSort={onSort}
            />

            <SortableTableHead
              label="SKUs"
              sortKey="skuCount"
              sortDirection={getTableSortDisplayDirection(sortState, 'skuCount')}
              onSort={onSort}
              className="text-right"
            />

            <SortableTableHead
              label="Total units"
              sortKey="totalUnits"
              sortDirection={getTableSortDisplayDirection(sortState, 'totalUnits')}
              onSort={onSort}
              className="text-right"
            />

            <SortableTableHead
              label="Date"
              sortKey="receivedAt"
              sortDirection={getTableSortDisplayDirection(sortState, 'receivedAt')}
              onSort={onSort}
            />

            <TableHead className="text-right">Actions</TableHead>

          </TableRow>

        </TableHeader>

        <TableBody>

          {isLoading && (

            <TableRow>

              <TableCell colSpan={7} className="h-24 text-center">

                Loading batch inventory...

              </TableCell>

            </TableRow>

          )}

          {!isLoading &&

            pagedGroups.map((group) => (
              <BatchViewRow key={group.batchId} group={group} companyId={companyId} />
            ))}

          {!isLoading && pagedGroups.length === 0 && (

            <TableRow>

              <TableCell colSpan={7} className="h-24 text-center">

                No active batches at {locationLabel}. Stock appears here after receiving stock

                requests or opening balance imports.

              </TableCell>

            </TableRow>

          )}

        </TableBody>

      </Table>

    </div>

  );

}

