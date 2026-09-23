import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  clearSubWarehouseReturnLots,
  createSubWarehouseStockReturn,
  fetchSubWarehouseReturnLots,
  type ReturnLotRow,
} from '@/store/slices/warehouse/sub-warehouses';
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

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'MMM d, yyyy');
}

function formatReturnLotLabel(row: ReturnLotRow): string {
  const exp = row.expiration_date ? ` · exp ${formatLotDate(row.expiration_date)}` : '';
  return `${row.batch_number}${exp} · ${row.quantity_remaining} in lot`;
}

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
              a.variantName.localeCompare(b.variantName) ||
              a.batch_number.localeCompare(b.batch_number) ||
              formatLotDate(a.expiration_date).localeCompare(formatLotDate(b.expiration_date))
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
  onSuccess?: () => void | Promise<void>;
}

export function SubWarehouseReturnStockDialog({
  open,
  onOpenChange,
  isMainWarehouseUser,
  myLocationId,
  locations,
  onSuccess,
}: SubWarehouseReturnStockDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const returnLots = useAppSelector((s) => s.warehouseSubWarehouses.returnLots);
  const returnLotsLocationId = useAppSelector((s) => s.warehouseSubWarehouses.returnLotsLocationId);
  const returnLotsStatus = useAppSelector((s) => s.warehouseSubWarehouses.returnLotsStatus);
  const mutationStatus = useAppSelector((s) => s.warehouseSubWarehouses.mutationStatus);

  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnLotQuantities, setReturnLotQuantities] = useState<Record<string, number>>({});
  const [returnFilter, setReturnFilter] = useState('');

  const returning = mutationStatus === 'loading';
  const loadingReturnBatchLots =
    !!returnLocationId &&
    (returnLotsStatus === 'loading' ||
      (returnLotsStatus === 'idle' && returnLotsLocationId !== returnLocationId) ||
      (returnLotsStatus === 'succeeded' && returnLotsLocationId !== returnLocationId));

  const returnBatchLots =
    returnLotsLocationId === returnLocationId ? returnLots : ([] as ReturnLotRow[]);

  useEffect(() => {
    if (!open) {
      setReturnLocationId('');
      setReturnLotQuantities({});
      setReturnFilter('');
      dispatch(clearSubWarehouseReturnLots());
      return;
    }
    if (!isMainWarehouseUser && myLocationId) {
      setReturnLocationId(myLocationId);
    }
  }, [open, isMainWarehouseUser, myLocationId, dispatch]);

  useEffect(() => {
    if (!open || !returnLocationId) return;
    void dispatch(fetchSubWarehouseReturnLots(returnLocationId));
  }, [open, returnLocationId, dispatch]);

  const returnSummary = useMemo(() => {
    const lines = Object.entries(returnLotQuantities).filter(([, q]) => (q ?? 0) > 0);
    const totalQty = lines.reduce((s, [, q]) => s + (q ?? 0), 0);
    return { lineCount: lines.length, totalQty };
  }, [returnLotQuantities]);

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
      const result = await dispatch(
        createSubWarehouseStockReturn({
          from_location_id: returnLocationId,
          items,
          notes: 'Returned from sub-warehouse',
        })
      ).unwrap();

      if (result && result.success === false) {
        throw new Error(result.error || 'Return request failed');
      }

      const requestNumber = result?.request_number;
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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0">
        <DialogHeader>
          <DialogTitle>Submit return to main warehouse</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground px-1">
          Choose the sub-warehouse batch lot to return (including expiry when the same batch has
          multiple dates). Main warehouse will assign where it is restocked at inspect.
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
                placeholder="Search by brand, product, or batch…"
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
                                      {formatReturnLotLabel(r)}
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
