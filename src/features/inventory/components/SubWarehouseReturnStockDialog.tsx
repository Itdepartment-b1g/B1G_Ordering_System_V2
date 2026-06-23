import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SubWarehouseLocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

type ReturnLotRow = {
  lot_id: string;
  variant_id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  batch_number: string;
  quantity_remaining: number;
  received_at: string;
};

function normalizeTypeLabel(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'PODS';
  if (t === 'battery') return 'DEVICE';
  if (t === 'posm') return 'POSM';
  return typeKey.toUpperCase();
}

function getReturnLotTypeGroups(rows: ReturnLotRow[]): [string, ReturnLotRow[]][] {
  const m = new Map<string, ReturnLotRow[]>();
  for (const r of rows) {
    const k = r.variantType || 'unknown';
    const list = m.get(k) || [];
    list.push(r);
    m.set(k, list);
  }
  return Array.from(m.entries())
    .map(
      ([type, list]) =>
        [
          type,
          list.sort(
            (a, b) =>
              a.variantName.localeCompare(b.variantName) || a.batch_number.localeCompare(b.batch_number)
          ),
        ] as [string, ReturnLotRow[]]
    )
    .sort(([a], [b]) => a.localeCompare(b));
}

export interface SubWarehouseReturnStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isMainWarehouseUser: boolean;
  myLocationId: string | null;
  locations: SubWarehouseLocationOption[];
  userId: string | null;
  onSuccess?: () => void | Promise<void>;
}

export function SubWarehouseReturnStockDialog({
  open,
  onOpenChange,
  isMainWarehouseUser,
  myLocationId,
  locations,
  userId,
  onSuccess,
}: SubWarehouseReturnStockDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [returning, setReturning] = useState(false);
  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnLotQuantities, setReturnLotQuantities] = useState<Record<string, number>>({});
  const [returnFilter, setReturnFilter] = useState('');

  useEffect(() => {
    if (!open) {
      setReturnLocationId('');
      setReturnLotQuantities({});
      setReturnFilter('');
      return;
    }
    if (!isMainWarehouseUser && myLocationId) {
      setReturnLocationId(myLocationId);
    }
  }, [open, isMainWarehouseUser, myLocationId]);

  const returnSummary = useMemo(() => {
    const lines = Object.entries(returnLotQuantities).filter(([, q]) => (q ?? 0) > 0);
    const totalQty = lines.reduce((s, [, q]) => s + (q ?? 0), 0);
    return { lineCount: lines.length, totalQty };
  }, [returnLotQuantities]);

  const { data: returnBatchLots = [], isLoading: loadingReturnBatchLots } = useQuery({
    queryKey: ['warehouse-return-batch-lots', returnLocationId],
    enabled: open && !!returnLocationId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          variant_id,
          quantity_remaining,
          received_at,
          batch:inventory_batches ( batch_number ),
          variant:variants!inventory_batch_lots_variant_id_fkey (
            name,
            variant_type,
            brand:brands!variants_brand_id_fkey ( name )
          )
        `
        )
        .eq('warehouse_location_id', returnLocationId)
        .gt('quantity_remaining', 0)
        .order('received_at', { ascending: true });
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const batch = Array.isArray(r.batch) ? r.batch[0] : r.batch;
          const variant = Array.isArray(r.variant) ? r.variant[0] : r.variant;
          const brand = variant && (Array.isArray(variant.brand) ? variant.brand[0] : variant.brand);
          const remaining = Number(r.quantity_remaining);
          if (!Number.isFinite(remaining) || remaining <= 0) return null;
          return {
            lot_id: r.id as string,
            variant_id: r.variant_id as string,
            brandName: (brand as { name?: string })?.name ?? 'Unknown Brand',
            variantName: (variant as { name?: string })?.name ?? String(r.variant_id),
            variantType: (variant as { variant_type?: string })?.variant_type ?? 'unknown',
            batch_number: (batch as { batch_number?: string })?.batch_number ?? '—',
            quantity_remaining: remaining,
            received_at: r.received_at as string,
          } satisfies ReturnLotRow;
        })
        .filter(Boolean) as ReturnLotRow[];
    },
  });

  const returnLotRowsFiltered = useMemo(() => {
    const q = returnFilter.trim().toLowerCase();
    if (!q) return returnBatchLots;
    return returnBatchLots.filter(
      (r) =>
        r.brandName.toLowerCase().includes(q) ||
        r.variantName.toLowerCase().includes(q) ||
        r.batch_number.toLowerCase().includes(q)
    );
  }, [returnBatchLots, returnFilter]);

  const returnLotsByBrand = useMemo(() => {
    const m = new Map<string, ReturnLotRow[]>();
    for (const row of returnLotRowsFiltered) {
      const list = m.get(row.brandName) || [];
      list.push(row);
      m.set(row.brandName, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [returnLotRowsFiltered]);

  const subLocations = useMemo(
    () =>
      locations
        .filter((l) => !l.is_main)
        .filter((l) => (isMainWarehouseUser ? true : l.id === myLocationId)),
    [locations, isMainWarehouseUser, myLocationId]
  );

  const submitReturn = async () => {
    if (!returnLocationId) return;
    const items = Object.entries(returnLotQuantities)
      .map(([lot_id, quantity]) => ({ lot_id, quantity }))
      .filter((x) => (x.quantity ?? 0) > 0);

    if (items.length === 0) {
      toast({
        title: 'Nothing to return',
        description: 'Enter a return quantity for at least one batch lot.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setReturning(true);
      const { data, error } = await supabase.rpc('create_warehouse_stock_return_request', {
        p_from_location_id: returnLocationId,
        p_items: items,
        p_notes: 'Returned from sub-warehouse',
        p_created_by: userId,
      });
      if (error) throw error;
      if (data && (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || 'Return request failed');
      }

      const requestNumber = (data as { request_number?: string })?.request_number;
      toast({
        title: 'Return submitted',
        description: requestNumber
          ? `${requestNumber} is pending main-warehouse inspection.`
          : 'Return request submitted for main-warehouse inspection.',
      });
      onOpenChange(false);

      await queryClient.invalidateQueries({
        queryKey: ['warehouse-location-inventory-brands'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['warehouse-location-inventory', returnLocationId],
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-return-batch-lots', returnLocationId] });
      await queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-stock-returns'] });
      await queryClient.refetchQueries({ queryKey: ['warehouse-stock-returns'] });
      await onSuccess?.();
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to return stock',
        variant: 'destructive',
      });
    } finally {
      setReturning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0">
        <DialogHeader>
          <DialogTitle>Submit return to main warehouse</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground px-1">
          Choose specific batch lots to return. Each line returns from one batch; main warehouse
          inspects good vs damaged and restores the same batch at main.
        </p>

        <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
          <div className="space-y-2 shrink-0">
            <Label>Sub-warehouse</Label>
            <Select
              value={returnLocationId || undefined}
              onValueChange={setReturnLocationId}
              disabled={!isMainWarehouseUser}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {subLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <div className="space-y-2 flex-1">
              <Label htmlFor="return-filter">Filter brands, SKUs, or batches</Label>
              <Input
                id="return-filter"
                placeholder="Search by brand or product name…"
                value={returnFilter}
                onChange={(e) => setReturnFilter(e.target.value)}
                disabled={!returnLocationId || loadingReturnBatchLots}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={returnSummary.lineCount === 0}
                onClick={() => setReturnLotQuantities({})}
              >
                Clear quantities
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-[200px] max-h-[55vh] border rounded-md p-3 bg-muted/20">
            {!returnLocationId ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Select a sub-warehouse to list its inventory.
              </p>
            ) : loadingReturnBatchLots ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading batch lots…
              </div>
            ) : returnBatchLots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No batch lots at this sub-warehouse.
              </p>
            ) : returnLotRowsFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No lots match your search.</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {returnLotsByBrand.map(([brandName, rows]) => {
                  const typeGroups = getReturnLotTypeGroups(rows);
                  const brandQty = rows.reduce((sum, r) => sum + (returnLotQuantities[r.lot_id] ?? 0), 0);
                  return (
                    <AccordionItem key={brandName} value={brandName} className="border-b-0">
                      <AccordionTrigger className="py-3 hover:no-underline rounded-md px-2 -mx-2 hover:bg-muted/60">
                        <span className="flex items-center gap-2 min-w-0 text-left">
                          <span className="font-medium truncate">{brandName}</span>
                          {brandQty > 0 && (
                            <Badge variant="secondary" className="shrink-0">
                              {brandQty} to return
                            </Badge>
                          )}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pb-4 pt-0">
                        {typeGroups.map(([type, list]) => (
                          <div key={type}>
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                              {normalizeTypeLabel(type)}
                            </h4>
                            <div className="space-y-2 rounded-lg border bg-background p-3">
                              {list.map((r) => (
                                <div key={r.lot_id} className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate" title={r.variantName}>
                                      {r.variantName}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                      {r.batch_number} · {r.quantity_remaining} in lot
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Label
                                      htmlFor={`ret-lot-${r.lot_id}`}
                                      className="text-xs text-muted-foreground whitespace-nowrap"
                                    >
                                      Qty
                                    </Label>
                                    <Input
                                      id={`ret-lot-${r.lot_id}`}
                                      type="number"
                                      min={0}
                                      max={r.quantity_remaining}
                                      className="w-24 h-9"
                                      value={returnLotQuantities[r.lot_id] ?? 0}
                                      onChange={(e) =>
                                        setReturnLotQuantities((q) => ({
                                          ...q,
                                          [r.lot_id]: Math.max(
                                            0,
                                            Math.min(r.quantity_remaining, parseInt(e.target.value, 10) || 0)
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t pt-4 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground order-2 sm:order-1">
            {returnLocationId && returnSummary.lineCount > 0 ? (
              <span>
                <span className="font-medium text-foreground">{returnSummary.lineCount}</span> batch
                {returnSummary.lineCount !== 1 ? ' lines' : ' line'} · total qty{' '}
                <span className="font-medium text-foreground">{returnSummary.totalQty}</span>
              </span>
            ) : returnLocationId ? (
              <span>Enter quantities per batch lot above.</span>
            ) : null}
          </div>
          <div className="flex gap-2 order-1 sm:order-2 sm:ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={returning}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitReturn()}
              disabled={returning || !returnLocationId || returnSummary.lineCount === 0}
            >
              {returning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit return'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
