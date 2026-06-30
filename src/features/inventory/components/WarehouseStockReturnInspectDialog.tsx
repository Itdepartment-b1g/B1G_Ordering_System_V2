import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  createInspectSplit,
  getInspectRemaining,
  getItemAllocatedQty,
  getMaxQtyForInspectSplit,
  getSplitInspectedQty,
  type InspectRequestItem,
} from '../warehouseStockReturnInspectShared';

export type InspectMainLotOption = {
  lot_id: string;
  variant_id: string;
  batch_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
};

type WarehouseStockReturnInspectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestNumber: string;
  fromLocationName: string;
  items: InspectRequestItem[];
  onItemsChange: (items: InspectRequestItem[]) => void;
  mainLots: InspectMainLotOption[];
  loadingLots: boolean;
  formatSubLotLabel: (batch: string | null, expiry: string | null) => string;
  formatMainLotLabel: (lot: InspectMainLotOption) => string;
  notes: string;
  onNotesChange: (notes: string) => void;
  validationError: string | null;
  submitting: boolean;
  onConfirm: () => void;
};

export function WarehouseStockReturnInspectDialog({
  open,
  onOpenChange,
  requestNumber,
  fromLocationName,
  items,
  onItemsChange,
  mainLots,
  loadingLots,
  formatSubLotLabel,
  formatMainLotLabel,
  notes,
  onNotesChange,
  validationError,
  submitting,
  onConfirm,
}: WarehouseStockReturnInspectDialogProps) {
  const updateItem = (
    requestItemId: string,
    updater: (item: InspectRequestItem) => InspectRequestItem
  ) => {
    onItemsChange(items.map((item) => (item.request_item_id === requestItemId ? updater(item) : item)));
  };

  const updateSplit = (
    requestItemId: string,
    splitId: string,
    patch: Partial<InspectRequestItem['splits'][0]>
  ) => {
    updateItem(requestItemId, (item) => ({
      ...item,
      splits: item.splits.map((split) => (split.id === splitId ? { ...split, ...patch } : split)),
    }));
  };

  const setSplitGood = (requestItemId: string, splitId: string, qtyGood: number) => {
    updateItem(requestItemId, (item) => {
      const maxTotal = getMaxQtyForInspectSplit(item, splitId);
      const good = Math.max(0, Math.min(maxTotal, qtyGood));
      return {
        ...item,
        splits: item.splits.map((split) =>
          split.id === splitId ? { ...split, qty_good: good, qty_damaged: 0 } : split
        ),
      };
    });
  };

  const setSplitDamaged = (requestItemId: string, splitId: string, qtyDamaged: number) => {
    updateItem(requestItemId, (item) => {
      const maxTotal = getMaxQtyForInspectSplit(item, splitId);
      const damaged = Math.max(0, Math.min(maxTotal, qtyDamaged));
      return {
        ...item,
        splits: item.splits.map((split) =>
          split.id === splitId ? { ...split, qty_damaged: damaged, qty_good: 0 } : split
        ),
      };
    });
  };

  const setSplitQty = (
    requestItemId: string,
    splitId: string,
    field: 'qty_good' | 'qty_damaged',
    value: number
  ) => {
    updateItem(requestItemId, (item) => {
      const maxTotal = getMaxQtyForInspectSplit(item, splitId);
      return {
        ...item,
        splits: item.splits.map((split) => {
          if (split.id !== splitId) return split;
          let qtyGood = field === 'qty_good' ? Math.max(0, value) : split.qty_good;
          let qtyDamaged = field === 'qty_damaged' ? Math.max(0, value) : split.qty_damaged;
          if (qtyGood + qtyDamaged > maxTotal) {
            if (field === 'qty_good') {
              qtyDamaged = Math.max(0, maxTotal - qtyGood);
            } else {
              qtyGood = Math.max(0, maxTotal - qtyDamaged);
            }
          }
          return { ...split, qty_good: qtyGood, qty_damaged: qtyDamaged };
        }),
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Inspect returned stock — {requestNumber}</DialogTitle>
          <DialogDescription>
            From {fromLocationName}. Sub batch is fixed from submit. Add rows to distribute returned
            qty across main warehouse batches (and expiry when needed), then split good vs damaged.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-4">
          {loadingLots ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading main batch lots…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing left to inspect.</p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const remaining = getInspectRemaining(item);
                const allocated = getItemAllocatedQty(item);
                const unallocated = Math.max(0, remaining - allocated);
                const lotOptions = mainLots.filter((lot) => lot.variant_id === item.variant_id);

                return (
                  <div key={item.request_item_id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">
                          {item.brand_name} · {item.variant_name}
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            ({item.variant_type})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Sub: {formatSubLotLabel(item.sub_batch_number, item.sub_expiration_date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Remaining: {remaining} · Allocated {allocated}/{remaining}
                          {unallocated > 0 ? ` · ${unallocated} left to assign` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={allocated >= remaining || lotOptions.length === 0}
                        onClick={() =>
                          updateItem(item.request_item_id, (current) => ({
                            ...current,
                            splits: [...current.splits, createInspectSplit()],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add row
                      </Button>
                    </div>

                    {lotOptions.length === 0 ? (
                      <p className="text-xs text-destructive">No main batches for this product.</p>
                    ) : (
                      <div className="space-y-2">
                        {item.splits.map((split) => {
                          const maxRow = getMaxQtyForInspectSplit(item, split.id);
                          const rowTotal = getSplitInspectedQty(split);

                          return (
                            <div
                              key={split.id}
                              className="grid gap-2 sm:grid-cols-[minmax(200px,1.4fr)_88px_88px_auto] items-end"
                            >
                              <div className="grid gap-1">
                                <Label className="text-xs">Main batch</Label>
                                <Select
                                  value={split.destination_lot_id || undefined}
                                  onValueChange={(value) =>
                                    updateSplit(item.request_item_id, split.id, {
                                      destination_lot_id: value,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Select main batch" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lotOptions.map((lot) => (
                                      <SelectItem key={lot.lot_id} value={lot.lot_id}>
                                        {formatMainLotLabel(lot)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">Good</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={maxRow}
                                  className="h-9 text-right"
                                  value={split.qty_good || ''}
                                  onChange={(e) =>
                                    setSplitQty(
                                      item.request_item_id,
                                      split.id,
                                      'qty_good',
                                      parseInt(e.target.value, 10) || 0
                                    )
                                  }
                                />
                              </div>
                              <div className="grid gap-1">
                                <Label className="text-xs">Damaged</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={maxRow}
                                  className="h-9 text-right"
                                  value={split.qty_damaged || ''}
                                  onChange={(e) =>
                                    setSplitQty(
                                      item.request_item_id,
                                      split.id,
                                      'qty_damaged',
                                      parseInt(e.target.value, 10) || 0
                                    )
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-2 text-xs"
                                  disabled={maxRow <= 0}
                                  onClick={() =>
                                    setSplitGood(item.request_item_id, split.id, maxRow)
                                  }
                                >
                                  All good
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-2 text-xs"
                                  disabled={maxRow <= 0}
                                  onClick={() =>
                                    setSplitDamaged(item.request_item_id, split.id, maxRow)
                                  }
                                >
                                  All dmg
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                                  disabled={item.splits.length <= 1}
                                  onClick={() =>
                                    updateItem(item.request_item_id, (current) => ({
                                      ...current,
                                      splits: current.splits.filter((s) => s.id !== split.id),
                                    }))
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              {rowTotal > maxRow && (
                                <p className="text-xs text-destructive sm:col-span-4">
                                  Row total exceeds available ({maxRow}).
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-2">
            <Label>Inspection notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} />
          </div>
          {validationError && <p className="text-sm text-destructive">{validationError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || loadingLots || !!validationError || items.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              'Confirm inspection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
