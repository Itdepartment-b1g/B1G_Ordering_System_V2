import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RotateCcw } from 'lucide-react';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';
import { ClientReturnHistoryList } from './ClientReturnHistoryList';
import { getReturnedStockFateQtyForVariant } from './clientReturnApi';
import {
  clientReturnStockFateBadgeClass,
  formatClientReturnStockFate,
  type PreviewClientReturn,
} from './clientReturnPreview';

type ReturnedStockDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandName?: string;
  variantName: string;
  variantType?: string;
  variantId?: string;
  totalReturned: number;
  restockQty?: number;
  disposalQty?: number;
  returns: PreviewClientReturn[];
};

export function ReturnedStockDetailDialog({
  open,
  onOpenChange,
  brandName,
  variantName,
  variantType,
  variantId,
  totalReturned,
  restockQty: restockQtyProp,
  disposalQty: disposalQtyProp,
  returns,
}: ReturnedStockDetailDialogProps) {
  const fateQty = useMemo(() => {
    if (
      typeof restockQtyProp === 'number' &&
      typeof disposalQtyProp === 'number'
    ) {
      return {
        restockQty: restockQtyProp,
        disposalQty: disposalQtyProp,
        totalQty: restockQtyProp + disposalQtyProp,
      };
    }
    // Variant-scoped when id is known; otherwise sum all lines in the provided CR list (brand/type rollup).
    return getReturnedStockFateQtyForVariant(
      returns,
      variantId ? { variantId } : undefined
    );
  }, [restockQtyProp, disposalQtyProp, returns, variantId]);

  const restockQty = fateQty.restockQty;
  const disposalQty = fateQty.disposalQty;
  const displayTotal =
    totalReturned > 0 ? totalReturned : fateQty.totalQty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(92dvh,100%)] w-[calc(100%-1rem)] max-w-[96rem] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-auto sm:max-h-[90vh]"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-radix-popper-content-wrapper], [role="dialog"]')) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="space-y-3 px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 shrink-0 text-rose-600" />
            Client returns
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
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge
                  variant="outline"
                  className={`font-normal ${clientReturnStockFateBadgeClass('restock')}`}
                >
                  {formatClientReturnStockFate('restock')} {restockQty}
                </Badge>
                <Badge
                  variant="outline"
                  className={`font-normal ${clientReturnStockFateBadgeClass('disposal')}`}
                >
                  {formatClientReturnStockFate('disposal')} {disposalQty}
                </Badge>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-bold tabular-nums leading-none text-rose-700">
                {displayTotal}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                unit{displayTotal === 1 ? '' : 's'} total
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 sm:px-6">
          {open ? (
            <ClientReturnHistoryList
              embedded
              resetKey={`${open}-${variantId || variantName}`}
              rows={returns}
              emptyTitle={
                displayTotal > 0
                  ? 'No matching client returns'
                  : 'No client returns'
              }
              emptyDescription={
                displayTotal > 0
                  ? 'Qty is on hand, but no matching client return (CR) history was found for this variant.'
                  : 'There are currently no restock or disposal returns for this item.'
              }
            />
          ) : null}
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
