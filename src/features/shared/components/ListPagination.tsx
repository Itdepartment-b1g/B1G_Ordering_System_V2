import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 15;

/** @deprecated Use PAGE_SIZE_OPTIONS */
export const PAGE_SIZES = PAGE_SIZE_OPTIONS;

export type ListPaginationSlice<T> = {
  pageCount: number;
  safePage: number;
  startIndex: number;
  endIndex: number;
  pagedItems: T[];
};

export function getListPaginationSlice<T>(
  items: T[],
  page: number,
  pageSize: number,
): ListPaginationSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const startIndex = safePage * pageSize;

  return {
    pageCount,
    safePage,
    startIndex,
    endIndex: startIndex + pageSize,
    pagedItems: items.slice(startIndex, startIndex + pageSize),
  };
}

type ListPaginationProps = {
  pageSize: PageSize;
  safePage: number;
  pageCount: number;
  onPageSizeChange: (value: PageSize) => void;
  onPrevious: () => void;
  onNext: () => void;
  rowsPerPageLabel?: string;
};

function PageSizeSelect({
  pageSize,
  onPageSizeChange,
  ariaLabel,
  triggerClassName,
}: {
  pageSize: PageSize;
  onPageSizeChange: (value: PageSize) => void;
  ariaLabel: string;
  triggerClassName: string;
}) {
  return (
    <Select
      value={String(pageSize)}
      onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
    >
      <SelectTrigger className={triggerClassName} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_SIZE_OPTIONS.map((size) => (
          <SelectItem key={size} value={String(size)}>
            {size}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ListPagination({
  pageSize,
  safePage,
  pageCount,
  onPageSizeChange,
  onPrevious,
  onNext,
  rowsPerPageLabel = 'Rows per page',
}: ListPaginationProps) {
  return (
    <>
      <div className="flex items-center gap-1 sm:hidden">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={safePage <= 0}
          onClick={onPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-0 flex-1 text-center text-sm tabular-nums text-muted-foreground">
          Page {safePage + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm text-muted-foreground">rows</span>
          <PageSizeSelect
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            ariaLabel={rowsPerPageLabel}
            triggerClassName="h-8 w-[4.25rem] px-2"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          disabled={safePage >= pageCount - 1}
          onClick={onNext}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{rowsPerPageLabel}</span>
          <PageSizeSelect
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
            ariaLabel={rowsPerPageLabel}
            triggerClassName="h-9 w-[90px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={safePage <= 0} onClick={onPrevious}>
            Previous
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
