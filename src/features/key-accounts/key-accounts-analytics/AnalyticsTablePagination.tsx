import { Button } from '@/components/ui/button';

export const ANALYTICS_TABLE_PAGE_SIZE = 10;

export function paginateAnalyticsRows<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * ANALYTICS_TABLE_PAGE_SIZE;
  return rows.slice(start, start + ANALYTICS_TABLE_PAGE_SIZE);
}

export function getAnalyticsPageCount(total: number) {
  return Math.max(1, Math.ceil(total / ANALYTICS_TABLE_PAGE_SIZE));
}

interface AnalyticsTablePaginationProps {
  page: number;
  onPageChange: (page: number) => void;
  totalRows: number;
}

export function AnalyticsTablePagination({ page, onPageChange, totalRows }: AnalyticsTablePaginationProps) {
  if (totalRows <= ANALYTICS_TABLE_PAGE_SIZE) return null;

  const totalPages = getAnalyticsPageCount(totalRows);
  const start = (page - 1) * ANALYTICS_TABLE_PAGE_SIZE + 1;
  const end = Math.min(page * ANALYTICS_TABLE_PAGE_SIZE, totalRows);

  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
      <span>
        Showing {start}-{end} of {totalRows}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span>
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
