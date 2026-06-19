import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, format } from 'date-fns';
import { Eye, Loader2, Package, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { BatchLotAdjustmentsDialog } from './BatchLotAdjustmentsDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const SOURCE_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  stock_request_receive: 'Stock request',
  adjustment_in: 'Adjustment',
};

type BatchLotRow = {
  lot_id: string;
  batch_id: string;
  batch_number: string;
  source_type: string;
  quantity_remaining: number;
  quantity_received: number;
  received_at: string;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type VariantBatchLotsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variantId: string | null;
  variantName: string;
  brandName: string;
  companyId: string | undefined;
  locationId?: string | null;
  locationLabel?: string;
};

const BATCH_LOTS_QUERY_KEY = 'variant-batch-lots';

const BATCH_LOTS_SELECT = `
  id,
  quantity_remaining,
  quantity_received,
  received_at,
  batch:inventory_batches (
    id,
    batch_number,
    source_type
  ),
  warehouse_location:warehouse_locations!inner (
    id,
    is_main
  )
`;

export function VariantBatchLotsDialog({
  open,
  onOpenChange,
  variantId,
  variantName,
  brandName,
  companyId,
  locationId: locationIdProp,
  locationLabel,
}: VariantBatchLotsDialogProps) {
  const locationScope = locationIdProp ?? 'main';
  const [adjustmentViewTarget, setAdjustmentViewTarget] = useState<BatchLotRow | null>(null);

  const {
    data: lots = [],
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [BATCH_LOTS_QUERY_KEY, companyId, locationScope, variantId],
    enabled: open && !!companyId && !!variantId,
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<BatchLotRow[]> => {
      let query = supabase
        .from('inventory_batch_lots')
        .select(BATCH_LOTS_SELECT)
        .eq('company_id', companyId!)
        .eq('variant_id', variantId!)
        .gt('quantity_remaining', 0)
        .order('received_at', { ascending: true });

      if (locationIdProp) {
        query = query.eq('warehouse_location_id', locationIdProp);
      } else {
        query = query.eq('warehouse_location.is_main', true);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const batch = firstRelation(
            r.batch as { id: string; batch_number: string; source_type: string } | null
          );
          if (!batch) return null;
          const remaining = Number(r.quantity_remaining);
          if (!Number.isFinite(remaining) || remaining <= 0) return null;
          return {
            lot_id: r.id as string,
            batch_id: batch.id,
            batch_number: batch.batch_number,
            source_type: batch.source_type,
            quantity_remaining: remaining,
            quantity_received: Number(r.quantity_received),
            received_at: r.received_at as string,
          } satisfies BatchLotRow;
        })
        .filter(Boolean) as BatchLotRow[];
    },
  });

  const totalRemaining = useMemo(
    () => lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0),
    [lots]
  );

  const showInitialLoading = isLoading && lots.length === 0;
  const isRefreshing = isFetching && lots.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Batch inventory
          </DialogTitle>
          <DialogDescription>
            {brandName} · {variantName}
            {locationLabel && (
              <span className="ml-1 text-muted-foreground">({locationLabel})</span>
            )}
            {lots.length > 0 && (
              <span className="ml-2 font-medium text-foreground">
                — {totalRemaining.toLocaleString()} unit{totalRemaining === 1 ? '' : 's'} across{' '}
                {lots.length} batch{lots.length === 1 ? '' : 'es'}
              </span>
            )}
            {isRefreshing && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
                Updating…
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {showInitialLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading batches…
            </div>
          ) : lots.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No batches with remaining stock for this variant
              {locationLabel ? ` at ${locationLabel}` : ' at this location'}.
            </div>
          ) : (
            <Table className={cn(isRefreshing && 'opacity-70')}>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch #</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Received date</TableHead>
                  <TableHead className="text-right">Days in warehouse</TableHead>
                  <TableHead className="text-right w-[90px]">Adjustments</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((lot) => (
                  <TableRow key={lot.lot_id}>
                    <TableCell className="font-medium">{lot.batch_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SOURCE_LABELS[lot.source_type] ?? lot.source_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{lot.quantity_received.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {lot.quantity_remaining.toLocaleString()}
                    </TableCell>
                    <TableCell>{format(new Date(lot.received_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell className="text-right">
                      {differenceInDays(new Date(), new Date(lot.received_at))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setAdjustmentViewTarget(lot)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <BatchLotAdjustmentsDialog
          open={!!adjustmentViewTarget}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAdjustmentViewTarget(null);
          }}
          companyId={companyId}
          lotId={adjustmentViewTarget?.lot_id ?? null}
          batchId={adjustmentViewTarget?.batch_id ?? null}
          batchNumber={adjustmentViewTarget?.batch_number ?? ''}
          variantName={variantName}
        />
      </DialogContent>
    </Dialog>
  );
}
