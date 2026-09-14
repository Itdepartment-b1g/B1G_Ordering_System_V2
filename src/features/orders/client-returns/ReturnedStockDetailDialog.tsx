import { format } from 'date-fns';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { formatClientReturnReason, type MockClientReturn } from './clientReturnMock';
import {
  BrandReturnedTable,
  formatVariantType,
  groupLinesByBrand,
  variantTypeBadgeClass,
} from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';
import {
  DEFAULT_RETURNED_STOCK_DETAIL_SORT_DIRECTION,
  DEFAULT_RETURNED_STOCK_DETAIL_SORT_KEY,
  sortReturnedStockDetailRows,
  type ReturnedStockDetailSortKey,
} from './utils/clientReturnsSorting';

const CR_PAGE_SIZE: PageSize = 25;

type ReturnedStockDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandName?: string;
  variantName: string;
  variantType?: string;
  variantId?: string;
  totalReturned: number;
  returns: MockClientReturn[];
};

function qtyForVariant(row: MockClientReturn, variantId?: string, variantName?: string): number {
  return row.lines
    .filter((line) =>
      variantId ? line.variantId === variantId : line.variantName === variantName
    )
    .reduce((sum, line) => sum + line.quantity, 0);
}

function MobileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold break-words">{value}</p>
    </div>
  );
}

function MobileReturnCard({
  row,
  qty,
  variantId,
  variantName,
}: {
  row: MockClientReturn;
  qty: number;
  variantId?: string;
  variantName: string;
}) {
  const brandGroups = groupLinesByBrand(row.lines);

  return (
    <article className="rounded-2xl border bg-background p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-sm font-semibold break-all">{row.returnNumber}</p>
          <p className="font-mono text-xs text-muted-foreground break-all">{row.orderNumber}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums leading-none text-rose-700">{qty}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">this SKU</p>
        </div>
      </div>

      <h3 className="text-lg font-bold tracking-tight leading-snug break-words">{row.clientName}</h3>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <MobileField label="Returned date" value={format(new Date(row.returnDate), 'MMM d, yyyy')} />
        <MobileField label="Created" value={format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')} />
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground mb-1">Reason</p>
          <Badge variant="outline" className="font-normal">
            {formatClientReturnReason(row.reason)}
          </Badge>
        </div>
      </div>

      <ClientReturnExpandedMeta row={row} />

      {brandGroups.map((group) => (
        <section key={group.brandName} className="overflow-hidden rounded-xl border bg-muted/20">
          <div className="border-b bg-muted/40 px-3 py-2">
            <p className="text-sm font-semibold break-words">{group.brandName}</p>
          </div>
          <ul className="divide-y">
            {group.variants.map((line) => {
              const isFocus =
                (variantId && line.variantId === variantId) ||
                (!variantId && line.variantName === variantName);
              return (
                <li
                  key={`${group.brandName}-${line.variantType}-${line.variantName}`}
                  className={`flex items-center gap-3 px-3 py-2.5 ${isFocus ? 'bg-rose-50/70' : ''}`}
                >
                  <span className="w-3 shrink-0 text-center text-muted-foreground">-</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug break-words">{line.variantName}</p>
                    <Badge
                      variant="secondary"
                      className={`mt-1 font-normal ${variantTypeBadgeClass(line.variantType)}`}
                    >
                      {formatVariantType(line.variantType)}
                    </Badge>
                  </div>
                  <p className="shrink-0 text-base font-semibold tabular-nums text-rose-700">
                    {line.quantity}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function ReturnedStockDetailDialog({
  open,
  onOpenChange,
  brandName,
  variantName,
  variantType,
  variantId,
  totalReturned,
  returns,
}: ReturnedStockDetailDialogProps) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(CR_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<ReturnedStockDetailSortKey>>(createInitialTableSortCycle);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPage(0);
      setPageSize(CR_PAGE_SIZE);
      setSortState(createInitialTableSortCycle());
      setExpandedRows(new Set());
    }
  }, [open, returns]);

  const sortedReturns = useMemo(() => {
    const { key, direction } = resolveTableSortDirection(
      sortState,
      DEFAULT_RETURNED_STOCK_DETAIL_SORT_KEY,
      DEFAULT_RETURNED_STOCK_DETAIL_SORT_DIRECTION
    );
    return sortReturnedStockDetailRows(returns, key, direction, (row) =>
      qtyForVariant(row, variantId, variantName)
    );
  }, [returns, sortState, variantId, variantName]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(sortedReturns, page, pageSize);

  const handleSort = (key: ReturnedStockDetailSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
    setPage(0);
  };

  const toggleExpanded = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,100%)] w-[calc(100%-1rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[85vh]">
        <DialogHeader className="space-y-3 px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 shrink-0 text-rose-600" />
            Returned items
          </DialogTitle>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              {brandName ? <p className="text-sm font-semibold break-words">{brandName}</p> : null}
              <p className="text-base font-medium leading-snug break-words">{variantName}</p>
              {variantType ? (
                <Badge
                  variant="secondary"
                  className={`font-normal ${variantTypeBadgeClass(variantType)}`}
                >
                  {formatVariantType(variantType)}
                </Badge>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-bold tabular-nums leading-none text-rose-700">
                {totalReturned}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                unit{totalReturned === 1 ? '' : 's'} returned
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-6">
          {returns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {totalReturned > 0
                ? 'Stock is on hand, but no matching client return (CR) history was found for this variant.'
                : 'No returns for this variant.'}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="md:hidden space-y-3">
                {pagedItems.map((row) => (
                  <MobileReturnCard
                    key={row.id}
                    row={row}
                    qty={qtyForVariant(row, variantId, variantName)}
                    variantId={variantId}
                    variantName={variantName}
                  />
                ))}
              </div>

              <div className="hidden md:block rounded-md border overflow-hidden">
                <Table className="table-fixed min-w-[56rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 px-2" />
                      <SortableTableHead
                        label="CR #"
                        sortKey="returnNumber"
                        sortDirection={getTableSortDisplayDirection(sortState, 'returnNumber')}
                        onSort={handleSort}
                        className="w-[9rem]"
                      />
                      <SortableTableHead
                        label="ORD #"
                        sortKey="orderNumber"
                        sortDirection={getTableSortDisplayDirection(sortState, 'orderNumber')}
                        onSort={handleSort}
                        className="w-[9rem]"
                      />
                      <SortableTableHead
                        label="Client"
                        sortKey="clientName"
                        sortDirection={getTableSortDisplayDirection(sortState, 'clientName')}
                        onSort={handleSort}
                        className="w-[9rem]"
                      />
                      <SortableTableHead
                        label="Returned date"
                        sortKey="returnDate"
                        sortDirection={getTableSortDisplayDirection(sortState, 'returnDate')}
                        onSort={handleSort}
                        className="w-[7.5rem]"
                      />
                      <SortableTableHead
                        label="Created"
                        sortKey="createdAt"
                        sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                        onSort={handleSort}
                        className="w-[9rem]"
                      />
                      <SortableTableHead
                        label="Reason"
                        sortKey="reason"
                        sortDirection={getTableSortDisplayDirection(sortState, 'reason')}
                        onSort={handleSort}
                        className="w-[7rem]"
                      />
                      <SortableTableHead
                        label="Qty"
                        sortKey="qty"
                        sortDirection={getTableSortDisplayDirection(sortState, 'qty')}
                        onSort={handleSort}
                        className="w-16 text-right"
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => {
                      const qty = qtyForVariant(row, variantId, variantName);
                      const brandGroups = groupLinesByBrand(row.lines);
                      const isOpen = expandedRows.has(row.id);
                      return (
                        <Fragment key={row.id}>
                          <TableRow className={isOpen ? 'bg-muted/20' : undefined}>
                            <TableCell className="px-2">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                                onClick={() => toggleExpanded(row.id)}
                                aria-expanded={isOpen}
                              >
                                <ChevronDown
                                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                                    isOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold truncate">
                              {row.returnNumber}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground truncate">
                              {row.orderNumber}
                            </TableCell>
                            <TableCell className="truncate">{row.clientName}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {format(new Date(row.returnDate), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {format(new Date(row.createdAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {formatClientReturnReason(row.reason)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums text-rose-700">
                              {qty}
                            </TableCell>
                          </TableRow>
                          {isOpen ? (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={8} className="bg-muted/10 p-4">
                                <div className="space-y-3">
                                  <ClientReturnExpandedMeta row={row} />
                                  {brandGroups.map((group) => (
                                    <BrandReturnedTable
                                      key={group.brandName}
                                      brandName={group.brandName}
                                      variants={group.variants}
                                    />
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={(value) => {
                  setPageSize(value);
                  setPage(0);
                }}
                onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-4 py-3 sm:px-6">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
