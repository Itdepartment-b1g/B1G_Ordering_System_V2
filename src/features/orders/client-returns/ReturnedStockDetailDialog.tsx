import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { formatClientReturnReason, type MockClientReturn } from './clientReturnMock';
import {
  BrandReturnedTable,
  formatVariantType,
  groupLinesByBrand,
  variantTypeBadgeClass,
} from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';

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

  useEffect(() => {
    if (open) {
      setPage(0);
      setPageSize(CR_PAGE_SIZE);
    }
  }, [open, returns]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(returns, page, pageSize);

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
              No returns for this variant.
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
                <div className="grid grid-cols-[1.5rem_1.1fr_1.1fr_0.9fr_0.75fr_1.15fr_0.8fr_0.4fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b">
                  <span />
                  <span>CR #</span>
                  <span>ORD #</span>
                  <span>Client</span>
                  <span>Returned date</span>
                  <span>Created</span>
                  <span>Reason</span>
                  <span className="text-right">Qty</span>
                </div>

                <Accordion type="multiple" className="w-full">
                  {pagedItems.map((row) => {
                    const qty = qtyForVariant(row, variantId, variantName);
                    const brandGroups = groupLinesByBrand(row.lines);
                    return (
                      <AccordionItem key={row.id} value={row.id} className="px-3">
                        <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                          <div className="grid w-full grid-cols-[1.1fr_1.1fr_0.9fr_0.75fr_1.15fr_0.8fr_0.4fr] gap-2 text-left text-sm">
                            <span className="font-mono text-xs font-semibold">{row.returnNumber}</span>
                            <span className="font-mono text-xs text-muted-foreground">{row.orderNumber}</span>
                            <span className="truncate">{row.clientName}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.returnDate), 'MMM d, yyyy')}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span>
                              <Badge variant="outline" className="font-normal">
                                {formatClientReturnReason(row.reason)}
                              </Badge>
                            </span>
                            <span className="font-semibold text-rose-700 tabular-nums text-right">
                              {qty}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 mb-2 ml-6">
                            <ClientReturnExpandedMeta row={row} />
                            {brandGroups.map((group) => (
                              <BrandReturnedTable
                                key={group.brandName}
                                brandName={group.brandName}
                                variants={group.variants}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
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
