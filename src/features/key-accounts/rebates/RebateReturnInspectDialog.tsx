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
  createRebateInspectSplit,
  getMaxQtyForRebateInspectSplit,
  getRebateItemAllocatedQty,
  getRebateSplitInspectedQty,
  type RebateInspectItem,
} from './keyAccountRebateReturnInspectShared';

export type RebateInspectLotOption = {
  lot_id: string;
  variant_id: string;
  warehouse_location_id: string;
  batch_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
};

type RebateReturnInspectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: RebateInspectItem[];
  onItemsChange: (items: RebateInspectItem[]) => void;
  warehouseLots: RebateInspectLotOption[];
  loadingLots: boolean;
  formatLotLabel: (lot: RebateInspectLotOption) => string;
  notes: string;
  onNotesChange: (notes: string) => void;
  validationError: string | null;
  submitting: boolean;
  onConfirm: () => void;
  blockedMessage?: string | null;
  initialLoading?: boolean;
};

export function RebateReturnInspectDialog({
  open,
  onOpenChange,
  items,
  onItemsChange,
  warehouseLots,
  loadingLots,
  formatLotLabel,
  notes,
  onNotesChange,
  validationError,
  submitting,
  onConfirm,
  blockedMessage = null,
  initialLoading = false,
}: RebateReturnInspectDialogProps) {
  const updateItem = (
    rebateLineId: string,
    updater: (item: RebateInspectItem) => RebateInspectItem
  ) => {
    onItemsChange(items.map((item) => (item.rebate_line_id === rebateLineId ? updater(item) : item)));
  };

  const updateSplit = (
    rebateLineId: string,
    splitId: string,
    patch: Partial<RebateInspectItem['splits'][0]>
  ) => {
    updateItem(rebateLineId, (item) => ({
      ...item,
      splits: item.splits.map((split) => (split.id === splitId ? { ...split, ...patch } : split)),
    }));
  };

  const setSplitGood = (rebateLineId: string, splitId: string, qtyGood: number) => {
    updateItem(rebateLineId, (item) => {
      const maxTotal = getMaxQtyForRebateInspectSplit(item, splitId);
      const good = Math.max(0, Math.min(maxTotal, qtyGood));
      return {
        ...item,
        splits: item.splits.map((split) =>
          split.id === splitId ? { ...split, qty_good: good, qty_damaged: 0 } : split
        ),
      };
    });
  };

  const setSplitDamaged = (rebateLineId: string, splitId: string, qtyDamaged: number) => {
    updateItem(rebateLineId, (item) => {
      const maxTotal = getMaxQtyForRebateInspectSplit(item, splitId);
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
    rebateLineId: string,
    splitId: string,
    field: 'qty_good' | 'qty_damaged',
    value: number
  ) => {
    updateItem(rebateLineId, (item) => {
      const maxTotal = getMaxQtyForRebateInspectSplit(item, splitId);
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
          <DialogTitle>Inspect returned items</DialogTitle>
          <DialogDescription>
            For each disputed line, distribute quantity across warehouse batch lots (with expiry when
            needed), then split good condition (restock) vs damaged (disposal).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto space-y-4">
          {initialLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading return items…
            </p>
          ) : blockedMessage ? (
            <p className="text-sm text-muted-foreground py-4">{blockedMessage}</p>
          ) : loadingLots ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading warehouse batch lots…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No disputed lines to inspect.</p>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const allocated = getRebateItemAllocatedQty(item);
                const unallocated = Math.max(0, item.disputed_quantity - allocated);
                const lotOptions = warehouseLots.filter(
                  (lot) =>
                    lot.variant_id === item.variant_id &&
                    lot.warehouse_location_id === item.warehouse_location_id
                );

                return (
                  <div key={item.rebate_line_id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">
                          {item.brand_name} · {item.variant_name}
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            ({item.variant_type})
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ship-from: {item.warehouse_location_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Disputed: {item.disputed_quantity} · Allocated {allocated}/
                          {item.disputed_quantity}
                          {unallocated > 0 ? ` · ${unallocated} left to assign` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={allocated >= item.disputed_quantity || lotOptions.length === 0}
                        onClick={() =>
                          updateItem(item.rebate_line_id, (current) => ({
                            ...current,
                            splits: [...current.splits, createRebateInspectSplit()],
                          }))
                        }
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add row
                      </Button>
                    </div>

                    {lotOptions.length === 0 ? (
                      <p className="text-xs text-destructive">
                        No batch lots for this product at {item.warehouse_location_name}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {item.splits.map((split) => {
                          const maxRow = getMaxQtyForRebateInspectSplit(item, split.id);
                          const rowTotal = getRebateSplitInspectedQty(split);

                          return (
                            <div
                              key={split.id}
                              className="grid gap-2 sm:grid-cols-[minmax(200px,1.4fr)_88px_88px_auto] items-end"
                            >
                              <div className="grid gap-1">
                                <Label className="text-xs">Warehouse batch</Label>
                                <Select
                                  value={split.destination_lot_id || undefined}
                                  onValueChange={(value) =>
                                    updateSplit(item.rebate_line_id, split.id, {
                                      destination_lot_id: value,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Select batch lot" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lotOptions.map((lot) => (
                                      <SelectItem key={lot.lot_id} value={lot.lot_id}>
                                        {formatLotLabel(lot)}
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
                                      item.rebate_line_id,
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
                                      item.rebate_line_id,
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
                                  onClick={() => setSplitGood(item.rebate_line_id, split.id, maxRow)}
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
                                    setSplitDamaged(item.rebate_line_id, split.id, maxRow)
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
                                    updateItem(item.rebate_line_id, (current) => ({
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
            disabled={
              submitting ||
              initialLoading ||
              !!blockedMessage ||
              loadingLots ||
              !!validationError ||
              items.length === 0
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              'Confirm receive'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
