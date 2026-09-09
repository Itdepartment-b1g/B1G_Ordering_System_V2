import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';

const CR_PAGE_SIZE: PageSize = 25;

type ReturnedStockDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandName?: string;
  variantName: string;
  totalReturned: number;
  returns: MockClientReturn[];
};

export function ReturnedStockDetailDialog({
  open,
  onOpenChange,
  brandName,
  variantName,
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
      <DialogContent className="max-w-4xl w-[95vw] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-600" />
            Returned items
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {brandName ? <span className="font-medium text-foreground">{brandName} — </span> : null}
            {variantName}
            {' · '}
            {totalReturned} unit{totalReturned === 1 ? '' : 's'} in returned stock
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertDescription>Visual mock — these rows are dummy data, not live returns.</AlertDescription>
          </Alert>

          {returns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No returns for this variant.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.5rem_1.1fr_1.1fr_0.9fr_0.75fr_1.15fr_0.8fr_0.4fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b">
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
                  const qty = row.lines.reduce((sum, line) => sum + line.quantity, 0);
                  const brandGroups = groupLinesByBrand(row.lines);
                  return (
                    <AccordionItem key={row.id} value={row.id} className="px-3">
                      <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                        <div className="grid w-full grid-cols-1 md:grid-cols-[1.1fr_1.1fr_0.9fr_0.75fr_1.15fr_0.8fr_0.4fr] gap-1 md:gap-2 text-left text-sm">
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
                          <span className="font-semibold text-rose-700 tabular-nums md:text-right">{qty}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 mb-2 md:ml-6">
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
              <div className="border-t px-3 py-2">
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
