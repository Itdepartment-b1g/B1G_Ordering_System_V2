import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { BatchViewSortDirection, BatchViewSortKey } from '../utils/batchInventorySorting';

type SortableTableHeadProps = {
  label: string;
  sortKey: BatchViewSortKey;
  activeSortKey: BatchViewSortKey;
  sortDirection: BatchViewSortDirection;
  onSort: (key: BatchViewSortKey) => void;
  className?: string;
};

export function SortableTableHead({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  className,
}: SortableTableHeadProps) {
  const isActive = activeSortKey === sortKey;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground',
          className?.includes('text-right') && 'w-full justify-end',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
