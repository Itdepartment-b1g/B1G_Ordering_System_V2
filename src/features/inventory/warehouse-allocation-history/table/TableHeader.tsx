import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { WarehouseAllocationGroup } from '../types';
import { WarehouseAllocationGroupRow } from './TableRow';

type WarehouseAllocationHistoryTableProps = {
  isLoading: boolean;
  pagedGroups: WarehouseAllocationGroup[];
  mainBrandFilterName: string | null;
};

export function WarehouseAllocationHistoryTable({
  isLoading,
  pagedGroups,
  mainBrandFilterName,
}: WarehouseAllocationHistoryTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Date</TableHead>
            <TableHead>Sub-Warehouse</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Performed By</TableHead>
            <TableHead className="text-right">SKUs</TableHead>
            <TableHead className="text-right">Total Units</TableHead>
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
