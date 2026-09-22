import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  fetchBrandPriceHistory,
  type CompanyPriceChangeBatch,
  type PriceChangeBatchStatus,
} from './companyPriceChangeApi';
import { PriceChangeDisplay } from './PriceChangeDisplay';

function statusLabel(status: PriceChangeBatchStatus) {
  switch (status) {
    case 'pending_agreement':
      return 'Pending';
    case 'applied':
      return 'Applied';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function updatedDateLabel(batch: CompanyPriceChangeBatch): string {
  const raw = batch.main_applied_at || batch.created_at;
  return new Date(raw).toLocaleString();
}

function VariantPriceLine({
  name,
  oldSelling,
  newSelling,
  oldDsp,
  newDsp,
  oldRsp,
  newRsp,
}: {
  name: string;
  oldSelling: number;
  newSelling: number;
  oldDsp: number;
  newDsp: number;
  oldRsp: number;
  newRsp: number;
}) {
  const dspChanged = Number(oldDsp) !== Number(newDsp);
  const rspChanged = Number(oldRsp) !== Number(newRsp);

  return (
    <li className="text-sm py-1.5 border-b border-border/50 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">{name}</span>
        <PriceChangeDisplay oldVal={oldSelling} newVal={newSelling} />
      </div>
      {(dspChanged || rspChanged) && (
        <div className="mt-0.5 text-xs flex flex-wrap gap-x-3 items-center">
          {dspChanged && (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">DSP</span>
              <PriceChangeDisplay oldVal={oldDsp} newVal={newDsp} className="text-xs" />
            </span>
          )}
          {rspChanged && (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">RSP</span>
              <PriceChangeDisplay oldVal={oldRsp} newVal={newRsp} className="text-xs" />
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function BrandPriceHistoryDialog({
  open,
  onOpenChange,
  companyId,
  brandId,
  brandName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  brandId: string | null;
  brandName: string;
}) {
  const { data: batches = [], isLoading, isError, error } = useQuery({
    queryKey: ['brand-price-history', companyId, brandId],
    queryFn: () => fetchBrandPriceHistory(companyId!, brandId!),
    enabled: open && !!companyId && !!brandId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price history — {brandName}</DialogTitle>
          <DialogDescription>
            Selling price changes for this brand, grouped by batch.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive py-4">
            {error instanceof Error ? error.message : 'Failed to load price history'}
          </p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No price changes recorded for this brand yet.
          </p>
        ) : (
          <div className="space-y-5">
            {batches.map((batch) => (
              <section key={batch.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono text-sm font-semibold break-all">
                      {batch.batch_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      UPDATED PRICE DATE: {updatedDateLabel(batch)}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabel(batch.status)}</Badge>
                </div>
                <ul className="mt-1">
                  {(batch.items ?? []).map((item) => (
                    <VariantPriceLine
                      key={item.id}
                      name={item.variant_name}
                      oldSelling={item.old_selling_price}
                      newSelling={item.new_selling_price}
                      oldDsp={item.old_dsp_price}
                      newDsp={item.new_dsp_price}
                      oldRsp={item.old_rsp_price}
                      newRsp={item.new_rsp_price}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
