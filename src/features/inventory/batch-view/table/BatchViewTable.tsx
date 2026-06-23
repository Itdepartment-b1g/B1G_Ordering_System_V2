import {

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableHeader,

  TableRow,

} from '@/components/ui/table';



import type { BatchInventoryGroup } from '../types';

import type { BatchViewSortDirection, BatchViewSortKey } from '../utils/batchInventorySorting';

import { BatchViewRow } from './BatchViewRow';

import { SortableTableHead } from './SortableTableHead';



type BatchViewTableProps = {

  isLoading: boolean;

  pagedGroups: BatchInventoryGroup[];

  locationLabel: string;

  sortKey: BatchViewSortKey;

  sortDirection: BatchViewSortDirection;

  onSort: (key: BatchViewSortKey) => void;

};



export function BatchViewTable({

  isLoading,

  pagedGroups,

  locationLabel,

  sortKey,

  sortDirection,

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

              activeSortKey={sortKey}

              sortDirection={sortDirection}

              onSort={onSort}

            />

            <SortableTableHead

              label="Warehouse"

              sortKey="locationName"

              activeSortKey={sortKey}

              sortDirection={sortDirection}

              onSort={onSort}

            />

            <SortableTableHead

              label="SKUs"

              sortKey="skuCount"

              activeSortKey={sortKey}

              sortDirection={sortDirection}

              onSort={onSort}

              className="text-right"

            />

            <SortableTableHead

              label="Total units"

              sortKey="totalUnits"

              activeSortKey={sortKey}

              sortDirection={sortDirection}

              onSort={onSort}

              className="text-right"

            />

            <SortableTableHead

              label="Date"

              sortKey="receivedAt"

              activeSortKey={sortKey}

              sortDirection={sortDirection}

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

            pagedGroups.map((group) => <BatchViewRow key={group.batchId} group={group} />)}

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

