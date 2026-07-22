import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getTableSortDisplayDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { cn } from '@/lib/utils';

import type { MainInventoryVariantSortKey } from '../utils/mainInventoryVariantSorting';

type InventoryVariantTableHeaderProps = {
  nameLabel: string;
  rowClassName: string;
  headClassName: string;
  isSubWarehouseUser: boolean;
  isWarehouse: boolean;
  showPoReservedColumn?: boolean;
  sortState: TableSortCycleState<MainInventoryVariantSortKey>;
  onSort: (key: MainInventoryVariantSortKey) => void;
};

export function InventoryVariantTableHeader({
  nameLabel,
  rowClassName,
  headClassName,
  isSubWarehouseUser,
  isWarehouse,
  showPoReservedColumn = false,
  sortState,
  onSort,
}: InventoryVariantTableHeaderProps) {
  const th = cn(headClassName, 'text-center');

  return (
    <TableHeader>
      <TableRow className={rowClassName}>
        <SortableTableHead
          label={nameLabel}
          sortKey="name"
          sortDirection={getTableSortDisplayDirection(sortState, 'name')}
          onSort={onSort}
          className={th}
        />
        <SortableTableHead
          label="Total Stock"
          sortKey="stock"
          sortDirection={getTableSortDisplayDirection(sortState, 'stock')}
          onSort={onSort}
          className={th}
        />
        {!isSubWarehouseUser && (
          <SortableTableHead
            label="Allocated"
            sortKey="allocated"
            sortDirection={getTableSortDisplayDirection(sortState, 'allocated')}
            onSort={onSort}
            className={th}
          />
        )}
        {showPoReservedColumn && (
          <SortableTableHead
            label="PO Reserved"
            sortKey="poReserved"
            sortDirection={getTableSortDisplayDirection(sortState, 'poReserved')}
            onSort={onSort}
            className={th}
          />
        )}
        {!isWarehouse && (
          <SortableTableHead
            label="Allocated (Remaining stocks)"
            sortKey="allocatedRemaining"
            sortDirection={getTableSortDisplayDirection(sortState, 'allocatedRemaining')}
            onSort={onSort}
            className={th}
          />
        )}
        {(!isSubWarehouseUser || showPoReservedColumn) && (
          <SortableTableHead
            label="Available"
            sortKey="available"
            sortDirection={getTableSortDisplayDirection(sortState, 'available')}
            onSort={onSort}
            className={th}
          />
        )}
        {!isWarehouse && (
          <SortableTableHead
            label="Selling Price"
            sortKey="sellingPrice"
            sortDirection={getTableSortDisplayDirection(sortState, 'sellingPrice')}
            onSort={onSort}
            className={th}
          />
        )}
        {!isWarehouse && (
          <SortableTableHead
            label="DSP"
            sortKey="dsp"
            sortDirection={getTableSortDisplayDirection(sortState, 'dsp')}
            onSort={onSort}
            className={th}
          />
        )}
        {!isWarehouse && (
          <SortableTableHead
            label="RSP"
            sortKey="rsp"
            sortDirection={getTableSortDisplayDirection(sortState, 'rsp')}
            onSort={onSort}
            className={th}
          />
        )}
        <SortableTableHead
          label="Status"
          sortKey="status"
          sortDirection={getTableSortDisplayDirection(sortState, 'status')}
          onSort={onSort}
          className={th}
        />
        <TableHead className={th}>Actions</TableHead>
      </TableRow>
    </TableHeader>
  );
}
