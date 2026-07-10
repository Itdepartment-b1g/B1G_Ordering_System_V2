import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

type SortableTableHeadProps<T extends string> = {
  label: string;
  sortKey: T;
  /** null = neutral (default/reset); asc/desc = active sort on this column */
  sortDirection: SortDirection | null;
  onSort: (key: T) => void;
  className?: string;
};

export function SortableTableHead<T extends string>({
  label,
  sortKey,
  sortDirection,
  onSort,
  className,
}: SortableTableHeadProps<T>) {
  const isActive = sortDirection !== null;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground',
          className?.includes('text-right') && 'w-full justify-end',
          className?.includes('text-center') && 'w-full justify-center',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {sortDirection === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 shrink-0" />
        ) : sortDirection === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
