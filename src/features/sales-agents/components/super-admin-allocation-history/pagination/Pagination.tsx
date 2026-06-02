import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const PAGE_SIZES = [5, 10, 15, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 15;

type SuperAdminAllocationHistoryPaginationProps = {
  pageSize: PageSize;
  safePage: number;
  pageCount: number;
  onPageSizeChange: (value: PageSize) => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function SuperAdminAllocationHistoryPagination({
  pageSize,
  safePage,
  pageCount,
  onPageSizeChange,
  onPrevious,
  onNext,
}: SuperAdminAllocationHistoryPaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Rows per page</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value) as PageSize)}
        >
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={safePage <= 0} onClick={onPrevious}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {safePage + 1} of {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
