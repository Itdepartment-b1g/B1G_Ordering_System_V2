import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  applyBatchDefaultsToVariants,
  clearBatchDefaultsFromVariants,
  createReceiveLotSplit,
  EMPTY_RECEIVE_BATCH_DEFAULTS,
  formatReceiveCurrency,
  getMaxQtyForSplit,
  getReceiveBatchTotal,
  getReceiveTotalUnits,
  getSplitLineAmount,
  getVariantAllocatedQty,
  isReceiveConfirmReady,
  type ReceiveBatchDefaults,
  type ReceiveVariantItem,
} from '../warehouseStockReceiveShared';

type WarehouseStockReceiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestNumber: string;
  variants: ReceiveVariantItem[];
  onVariantsChange: (variants: ReceiveVariantItem[]) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  submitting: boolean;
  onConfirm: () => void;
};

export function WarehouseStockReceiveDialog({
  open,
  onOpenChange,
  requestNumber,
  variants,
  onVariantsChange,
  notes,
  onNotesChange,
  submitting,
  onConfirm,
}: WarehouseStockReceiveDialogProps) {
  const [defaults, setDefaults] = useState<ReceiveBatchDefaults>(EMPTY_RECEIVE_BATCH_DEFAULTS);

  const batchTotal = useMemo(() => getReceiveBatchTotal(variants), [variants]);
  const totalUnits = useMemo(() => getReceiveTotalUnits(variants), [variants]);
  const canConfirm = useMemo(() => isReceiveConfirmReady(variants), [variants]);

  const updateVariant = (variantId: string, updater: (variant: ReceiveVariantItem) => ReceiveVariantItem) => {
    onVariantsChange(variants.map((variant) => (variant.variantId === variantId ? updater(variant) : variant)));
  };

  const handleApplyDefaults = () => {
    onVariantsChange(applyBatchDefaultsToVariants(variants, defaults));
  };

  const handleClearAllRows = () => {
    setDefaults(EMPTY_RECEIVE_BATCH_DEFAULTS);
    onVariantsChange(clearBatchDefaultsFromVariants(variants));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Receive stock — {requestNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            One receive creates one batch (<code className="text-xs">BATCH-YYYY-MM-#####</code>). Add
            extra rows when expiry or unit cost differs for the same variant.
          </p>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Batch defaults</p>
                <p className="text-xs text-muted-foreground">
                  Apply the same mfg date, expiry, and unit cost to all receive rows.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleApplyDefaults}>
                  Apply to all rows
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleClearAllRows}>
                  Clear all rows
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="receive-default-mfg">Mfg date</Label>
                <Input
                  id="receive-default-mfg"
                  type="date"
                  value={defaults.manufacturedDate}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, manufacturedDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="receive-default-exp">Expiry date</Label>
                <Input
                  id="receive-default-exp"
                  type="date"
                  value={defaults.expirationDate}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, expirationDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="receive-default-cost">Unit cost</Label>
                <Input
                  id="receive-default-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={defaults.unitCost}
                  onChange={(e) => setDefaults((prev) => ({ ...prev, unitCost: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 rounded-lg border px-3 py-2 text-sm">
            <span>
              <span className="text-muted-foreground">Total units:</span>{' '}
              <span className="font-semibold tabular-nums">{totalUnits.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Batch total:</span>{' '}
              <span className="font-semibold tabular-nums">{formatReceiveCurrency(batchTotal)}</span>
            </span>
          </div>

          <div className="space-y-4">
            {variants.map((variant) => {
              const allocated = getVariantAllocatedQty(variant.splits);
              const unallocated = Math.max(0, variant.remaining - allocated);

              return (
                <div key={variant.variantId} className="rounded-lg border p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-2">
                        {unallocated > 0 && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                            title="Quantity left to assign"
                            aria-label="Quantity left to assign"
                          />
                        )}
                        <span className="truncate">{variant.variantLabel}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Remaining: {variant.remaining} of {variant.orderedQuantity}
                        <span className="ml-2">
                          · Allocated {allocated}/{variant.remaining}
                          {unallocated > 0 ? ` · ${unallocated} left to assign` : ''}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={allocated >= variant.remaining}
                      onClick={() =>
                        updateVariant(variant.variantId, (current) => ({
                          ...current,
                          splits: [...current.splits, createReceiveLotSplit()],
                        }))
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add row
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {variant.splits.map((split) => {
                      const maxQtyForRow = getMaxQtyForSplit(variant, split.id);

                      return (
                      <div
                        key={split.id}
                        className="grid gap-2 sm:grid-cols-[88px_1fr_1fr_1fr_auto] items-end"
                      >
                        <div className="grid gap-1">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            min={0}
                            max={maxQtyForRow}
                            value={split.quantity || ''}
                            onChange={(e) => {
                              const qty = Math.min(
                                maxQtyForRow,
                                Math.max(0, parseInt(e.target.value, 10) || 0)
                              );
                              updateVariant(variant.variantId, (current) => ({
                                ...current,
                                splits: current.splits.map((row) =>
                                  row.id === split.id ? { ...row, quantity: qty } : row
                                ),
                              }));
                            }}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Mfg date</Label>
                          <Input
                            type="date"
                            value={split.manufacturedDate}
                            onChange={(e) =>
                              updateVariant(variant.variantId, (current) => ({
                                ...current,
                                splits: current.splits.map((row) =>
                                  row.id === split.id
                                    ? { ...row, manufacturedDate: e.target.value }
                                    : row
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Expiry date</Label>
                          <Input
                            type="date"
                            value={split.expirationDate}
                            onChange={(e) =>
                              updateVariant(variant.variantId, (current) => ({
                                ...current,
                                splits: current.splits.map((row) =>
                                  row.id === split.id
                                    ? { ...row, expirationDate: e.target.value }
                                    : row
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="grid gap-1">
                          <div className="flex items-center justify-between gap-2 min-h-4">
                            <Label className="text-xs">Unit cost</Label>
                            {getSplitLineAmount(split) > 0 && (
                              <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                                Line: {formatReceiveCurrency(getSplitLineAmount(split))}
                              </span>
                            )}
                          </div>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={split.unitCost}
                            onChange={(e) =>
                              updateVariant(variant.variantId, (current) => ({
                                ...current,
                                splits: current.splits.map((row) =>
                                  row.id === split.id ? { ...row, unitCost: e.target.value } : row
                                ),
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={variant.splits.length <= 1}
                          onClick={() =>
                            updateVariant(variant.variantId, (current) => ({
                              ...current,
                              splits: current.splits.filter((row) => row.id !== split.id),
                            }))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-2">
            <Label>Receive notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting || !canConfirm}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm receive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
