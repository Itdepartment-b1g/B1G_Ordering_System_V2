import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { AllocationHistoryGroup } from '../utils/allocationHistoryMappers';
import { AllocationGroupRow } from './TableRow';

type SuperAdminAllocationHistoryTableProps = {
  isLoading: boolean;
  pagedGroups: AllocationHistoryGroup[];
};

export function SuperAdminAllocationHistoryTable({
  isLoading,
  pagedGroups,
}: SuperAdminAllocationHistoryTableProps) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Date</TableHead>
            <TableHead>Allocated To</TableHead>
            <TableHead>Flow</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Allocated By</TableHead>
            <TableHead className="text-right">SKUs</TableHead>
            <TableHead className="text-right">Total Units</TableHead>
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
