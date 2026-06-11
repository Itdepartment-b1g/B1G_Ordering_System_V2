import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { buildPageItems, PAGE_SIZE_OPTIONS } from "./hubListPagination";

type HubListPaginationFooterProps = {
  page: number;
  pageSize: number;
  total: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function HubListPaginationFooter({
  page,
  pageSize,
  total,
  isFetching,
  onPageChange,
  onPageSizeChange,
}: HubListPaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);
  const pageItems = buildPageItems(page, totalPages);

  return (
    <CardFooter className="flex flex-col gap-4 border-t bg-muted/30 px-6 py-4">
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            Showing{" "}
            <span className="font-medium text-foreground">
              {fromIdx}–{toIdx}
            </span>{" "}
            of <span className="font-medium text-foreground">{total}</span>
          </p>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Rows per page
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                onPageSizeChange(Number(v));
                onPageChange(1);
              }}
              disabled={isFetching}
            >
              <SelectTrigger
                className="h-9 w-[4.5rem]"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Pagination className="mx-0 w-full justify-center lg:w-auto lg:justify-end">
          <PaginationContent className="flex-wrap justify-center gap-1">
            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 pl-2.5"
                disabled={page <= 1 || isFetching || totalPages <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            </PaginationItem>

            {totalPages > 1
              ? pageItems.map((item, idx) =>
                  item === "ellipsis" ? (
                    <PaginationItem key={`e-${idx}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item}>
                      <Button
                        type="button"
                        variant={item === page ? "outline" : "ghost"}
                        size="icon"
                        className="h-9 w-9"
                        disabled={isFetching}
                        onClick={() => onPageChange(item)}
                        aria-current={item === page ? "page" : undefined}
                      >
                        {item}
                      </Button>
                    </PaginationItem>
                  ),
                )
              : null}

            <PaginationItem>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 pr-2.5"
                disabled={page >= totalPages || isFetching || totalPages <= 1}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </CardFooter>
  );
}
