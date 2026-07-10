import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Loader2, Package, RefreshCw } from 'lucide-react';

import { supabase } from '@/lib/supabase';

import { cn } from '@/lib/utils';

import { BatchLotAdjustmentsDialog } from './BatchLotAdjustmentsDialog';

import { VariantBatchLotGroupRows } from './components/VariantBatchLotGroupRows';

import {

  Dialog,

  DialogContent,

  DialogDescription,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog';

import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {

  groupVariantBatchLots,

  type VariantBatchLotRow,

} from './variantBatchLotsGrouping';



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

  manufactured_date,

  expiration_date,

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

  const [adjustmentViewTarget, setAdjustmentViewTarget] = useState<VariantBatchLotRow | null>(null);



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

    queryFn: async (): Promise<VariantBatchLotRow[]> => {

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

            manufactured_date: (r.manufactured_date as string | null) ?? null,

            expiration_date: (r.expiration_date as string | null) ?? null,

          } satisfies VariantBatchLotRow;

        })

        .filter(Boolean) as VariantBatchLotRow[];

    },

  });



  const batchGroups = useMemo(() => groupVariantBatchLots(lots), [lots]);



  const totalRemaining = useMemo(

    () => lots.reduce((sum, lot) => sum + lot.quantity_remaining, 0),

    [lots]

  );



  const showInitialLoading = isLoading && lots.length === 0;

  const isRefreshing = isFetching && lots.length > 0;



  return (

    <Dialog open={open} onOpenChange={onOpenChange}>

      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">

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

                {batchGroups.length} batch{batchGroups.length === 1 ? '' : 'es'}

                {lots.length > batchGroups.length && (

                  <span className="text-muted-foreground font-normal">

                    {' '}

                    ({lots.length} lot{lots.length === 1 ? '' : 's'})

                  </span>

                )}

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

                  <TableHead className="w-10" />

                  <TableHead>Batch #</TableHead>

                  <TableHead>Source</TableHead>

                  <TableHead className="text-right">Received</TableHead>

                  <TableHead className="text-right">Remaining</TableHead>

                  <TableHead>Mfg date</TableHead>

                  <TableHead>Expiry</TableHead>

                  <TableHead>Received date</TableHead>

                  <TableHead className="text-right">Days in warehouse</TableHead>

                  <TableHead className="text-right w-[90px]">Adjustments</TableHead>

                </TableRow>

              </TableHeader>

              <TableBody>

                <VariantBatchLotGroupRows

                  groups={batchGroups}

                  onViewAdjustments={setAdjustmentViewTarget}

                />

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


