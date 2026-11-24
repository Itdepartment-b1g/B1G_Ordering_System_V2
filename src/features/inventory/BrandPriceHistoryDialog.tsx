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
import { PriceChangeItemsGroupedTable } from './PriceChangeItemsGroupedTable';

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
  const items = batch.items ?? [];
  const latestItem = items.reduce<string | null>((max, item) => {
    const at = item.updated_at || item.created_at;
    if (!max || new Date(at).getTime() > new Date(max).getTime()) return at;
    return max;
  }, null);
  const raw = latestItem || batch.main_applied_at || batch.created_at;
  return new Date(raw).toLocaleString();
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
    staleTime: 0,
    refetchOnMount: 'always',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price history — {brandName}</DialogTitle>
          <DialogDescription>
            Selling / DSP / RSP changes for this brand, grouped by batch and update time.
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="font-normal">
                      {batch.scope_type === 'team'
                        ? `Team: ${(
                            batch.target_leader_names ||
                            batch.target_leader_name ||
                            'Team Leader'
                          ).trim()}`
                        : 'Company'}
                    </Badge>
                    <Badge variant="outline">{statusLabel(batch.status)}</Badge>
                  </div>
                </div>
                <PriceChangeItemsGroupedTable batch={batch} viewMode="table" compact />
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
