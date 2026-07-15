import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Brand, Variant } from '../InventoryContext';

export type SubWarehouseStockRequestStatus =
  | 'pending_approval'
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'rejected';

export type SubWarehouseStockRequestItem = {
  variantId: string;
  variantName: string;
  brandName?: string;
  /** Original request qty (kept for history). */
  requestedQuantity: number;
  /** Qty main has released/shipped for this line (cumulative obligation). */
  deliveredQuantity: number;
  /** Qty sub has confirmed received so far. */
  receivedQuantity: number;
  /**
   * Qty main unlocked for the next receive confirm (manual allocate remaining).
   * Sub can only receive up to this until main allocates again.
   */
  openReceiveQuantity: number;
};

export type SubWarehouseReceiveProof = {
  at: string;
  notes?: string;
  proofImageDataUrl: string;
  proofImageName?: string;
  signatureDataUrl: string;
  /** Line qtys confirmed in this receive event. */
  lines?: Array<{ variantId: string; variantName: string; brandName?: string; quantity: number }>;
};

export type SubWarehouseReleaseLine = {
  variantId: string;
  variantName: string;
  brandName?: string;
  quantity: number;
};

export type SubWarehouseRequestHistoryEvent =
  | {
      id: string;
      type: 'created';
      at: string;
      note?: string;
      byName?: string;
    }
  | {
      id: string;
      type: 'approved_released';
      at: string;
      note?: string;
      byName?: string;
      lines: SubWarehouseReleaseLine[];
      proofImageDataUrl?: string;
      signatureDataUrl?: string;
    }
  | {
      id: string;
      type: 'remaining_released';
      at: string;
      note?: string;
      byName?: string;
      lines: SubWarehouseReleaseLine[];
      proofImageDataUrl?: string;
      signatureDataUrl?: string;
    }
  | {
      id: string;
      type: 'receive_confirmed';
      at: string;
      note?: string;
      byName?: string;
      lines: SubWarehouseReleaseLine[];
      shortQuantity: number;
      proofImageDataUrl?: string;
      signatureDataUrl?: string;
    }
  | {
      id: string;
      type: 'rejected';
      at: string;
      note?: string;
      byName?: string;
      lines?: SubWarehouseReleaseLine[];
      signatureDataUrl?: string;
    };

export type SubWarehouseStockRequest = {
  id: string;
  requestNumber: string;
  createdAt: string;
  status: SubWarehouseStockRequestStatus;
  /** Sub-warehouse that raised the request. */
  fromLocationId: string;
  fromLocationName: string;
  requestedByName?: string;
  notes?: string;
  receiveNotes?: string;
  rejectionReason?: string;
  /** Main approve signature (from request row or history event). */
  approvalSignatureUrl?: string;
  /** Main reject signature (from request row or history event). */
  rejectionSignatureUrl?: string;
  /** Receive proof snapshots (also mirrored into history). */
  receiveProofs?: SubWarehouseReceiveProof[];
  /** Full timeline for this request number. */
  history?: SubWarehouseRequestHistoryEvent[];
  items: SubWarehouseStockRequestItem[];
};

export function newHistoryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getItemDeliveredQty(item: SubWarehouseStockRequestItem): number {
  return Math.max(0, item.deliveredQuantity ?? 0);
}

export function getItemReceivedQty(item: SubWarehouseStockRequestItem): number {
  return Math.max(0, item.receivedQuantity ?? 0);
}

export function getItemShortQty(item: SubWarehouseStockRequestItem): number {
  return Math.max(0, getItemDeliveredQty(item) - getItemReceivedQty(item));
}

/** How many units the sub can confirm right now (unlocked by main). */
export function getItemOpenReceiveQty(item: SubWarehouseStockRequestItem): number {
  const open = Math.max(0, item.openReceiveQuantity ?? 0);
  // Never allow receiving more than remaining short against delivered.
  return Math.min(open, getItemShortQty(item));
}

/** How much of the short main can still unlock (short minus already unlocked). */
export function getItemAllocatableQty(item: SubWarehouseStockRequestItem): number {
  return Math.max(0, getItemShortQty(item) - getItemOpenReceiveQty(item));
}

/** Qty the sub may confirm in the receive dialog (must be unlocked by main). */
export function getItemRemainingQty(item: SubWarehouseStockRequestItem): number {
  return getItemOpenReceiveQty(item);
}

export function getRequestDeliveryTotals(items: SubWarehouseStockRequestItem[]) {
  const delivered = items.reduce((sum, item) => sum + getItemDeliveredQty(item), 0);
  const received = items.reduce((sum, item) => sum + getItemReceivedQty(item), 0);
  const short = Math.max(0, delivered - received);
  const openReceive = items.reduce((sum, item) => sum + getItemOpenReceiveQty(item), 0);
  return { delivered, received, short, openReceive };
}

export function resolveReceiveStatus(
  items: SubWarehouseStockRequestItem[]
): Extract<SubWarehouseStockRequestStatus, 'partially_received' | 'fully_received'> {
  const allFull = items.every((item) => getItemReceivedQty(item) >= getItemDeliveredQty(item));
  return allFull ? 'fully_received' : 'partially_received';
}

export function requestHasOpenReceive(items: SubWarehouseStockRequestItem[]): boolean {
  return items.some((item) => getItemOpenReceiveQty(item) > 0);
}

function getVariantsByTypeEntries(brand: Brand): [string, Variant[]][] {
  const v = brand.variantsByType;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.entries());
  return Object.entries(v as unknown as Record<string, Variant[]>);
}

function normalizeTypeLabel(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'PODS';
  if (t === 'battery') return 'DEVICE';
  if (t === 'posm') return 'POSM';
  return typeKey.toUpperCase();
}

/** Available units at main warehouse (total stock minus allocated). */
function getMainAvailableQty(variant: Pick<Variant, 'stock' | 'allocatedStock'>): number {
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
}

type CartLine = {
  id: string;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  quantity: number;
};

type SubWarehouseStockRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  loadingBrands?: boolean;
  /** Main warehouse location name stock is requested from. */
  sourceLocationName?: string;
  submitting?: boolean;
  onSubmit: (payload: {
    notes: string;
    items: SubWarehouseStockRequestItem[];
  }) => void | Promise<void>;
};

export function SubWarehouseStockRequestDialog({
  open,
  onOpenChange,
  brands,
  loadingBrands = false,
  sourceLocationName = 'Main warehouse',
  submitting = false,
  onSubmit,
}: SubWarehouseStockRequestDialogProps) {
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedBrandId('');
    setQuantities({});
    setCart([]);
    setNotes('');
    setFilter('');
  }, [open]);

  const selectedBrand = useMemo(
    () => brands.find((b) => b.id === selectedBrandId) ?? null,
    [brands, selectedBrandId]
  );

  const typeGroups = useMemo(() => {
    if (!selectedBrand) return [] as [string, Variant[]][];
    const q = filter.trim().toLowerCase();
    const brandMatch = !q || selectedBrand.name.toLowerCase().includes(q);
    return getVariantsByTypeEntries(selectedBrand)
      .map(([type, variants]) => {
        const filtered = brandMatch
          ? variants
          : variants.filter((v) => v.name.toLowerCase().includes(q));
        return [type, filtered] as [string, Variant[]];
      })
      .filter(([, variants]) => variants.length > 0)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [selectedBrand, filter]);

  const cartSummary = useMemo(() => {
    const totalQty = cart.reduce((s, line) => s + line.quantity, 0);
    return { lineCount: cart.length, totalQty };
  }, [cart]);

  const addBrandQuantitiesToCart = () => {
    if (!selectedBrand) return;
    const lines: CartLine[] = [];
    for (const [variantId, qty] of Object.entries(quantities)) {
      if (!qty || qty <= 0) continue;
      const variant = selectedBrand.allVariants.find((v) => v.id === variantId);
      if (!variant) continue;
      const available = getMainAvailableQty(variant);
      const quantity = Math.min(qty, available);
      if (quantity <= 0) continue;
      lines.push({
        id: `${selectedBrand.id}-${variant.id}`,
        brandId: selectedBrand.id,
        brandName: selectedBrand.name,
        variantId: variant.id,
        variantName: variant.name,
        quantity,
      });
    }
    if (lines.length === 0) return;

    setCart((prev) => {
      const next = [...prev];
      for (const line of lines) {
        const idx = next.findIndex((x) => x.variantId === line.variantId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
        } else {
          next.push(line);
        }
      }
      return next;
    });
    setQuantities({});
  };

  const removeCartLine = (variantId: string) => {
    setCart((prev) => prev.filter((line) => line.variantId !== variantId));
  };

  const handleSubmit = async () => {
    if (cart.length === 0 || submitting) return;
    await onSubmit({
      notes: notes.trim(),
      items: cart.map((line) => ({
        variantId: line.variantId,
        variantName: line.variantName,
        brandName: line.brandName,
        requestedQuantity: line.quantity,
        deliveredQuantity: 0,
        receivedQuantity: 0,
        openReceiveQuantity: 0,
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-3xl max-h-[90vh] flex flex-col gap-0 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Request stock from {sourceLocationName}</DialogTitle>
          <p className="text-sm text-muted-foreground font-normal pt-1">
            Quantities are based on available stock at {sourceLocationName} (stock − allocated).
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
            <div className="space-y-2 min-w-0">
              <Label>Brand</Label>
              <Select
                value={selectedBrandId || undefined}
                onValueChange={(id) => {
                  setSelectedBrandId(id);
                  setQuantities({});
                  setFilter('');
                }}
                disabled={loadingBrands || brands.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingBrands ? 'Loading brands…' : 'Select brand'} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-0">
              <Label htmlFor="sw-req-filter">Filter SKUs</Label>
              <Input
                id="sw-req-filter"
                placeholder="Search product…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={!selectedBrandId}
                className="w-full text-base sm:text-sm"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-[140px] max-h-[36vh] sm:max-h-[40vh] border rounded-md p-2 sm:p-3 bg-muted/20">
            {!selectedBrandId ? (
              <p className="text-sm text-muted-foreground text-center py-8">Select a brand to list SKUs.</p>
            ) : loadingBrands ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                Loading brands…
              </div>
            ) : typeGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No SKUs match your search.</p>
            ) : (
              <Accordion type="multiple" className="w-full">
                {typeGroups.map(([typeKey, variants]) => (
                  <AccordionItem key={typeKey} value={typeKey}>
                    <AccordionTrigger className="text-sm font-medium">
                      {normalizeTypeLabel(typeKey)} ({variants.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-1">
                        {variants.map((v) => {
                          const mainAvailable = getMainAvailableQty(v);
                          const outOfStock = mainAvailable <= 0;
                          return (
                            <div
                              key={v.id}
                              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 rounded-md border bg-background px-3 py-2 ${
                                outOfStock ? 'opacity-60' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{v.name}</p>
                                <p
                                  className={`text-xs tabular-nums ${
                                    outOfStock
                                      ? 'text-destructive'
                                      : mainAvailable <= 10
                                        ? 'text-amber-600 dark:text-amber-500'
                                        : 'text-emerald-600 dark:text-emerald-500'
                                  }`}
                                >
                                  {outOfStock
                                    ? `${sourceLocationName} Available: 0 (out of stock)`
                                    : `${sourceLocationName} Available: ${mainAvailable.toLocaleString()}`}
                                </p>
                              </div>
                              <Input
                                type="number"
                                min={0}
                                max={mainAvailable}
                                inputMode="numeric"
                                disabled={outOfStock}
                                className="w-full sm:w-24 h-9 sm:h-8 text-base sm:text-sm shrink-0"
                                value={quantities[v.id] ?? ''}
                                placeholder={outOfStock ? '—' : 'Qty'}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n) || n <= 0) {
                                    setQuantities((prev) => ({ ...prev, [v.id]: 0 }));
                                    return;
                                  }
                                  setQuantities((prev) => ({
                                    ...prev,
                                    [v.id]: Math.min(Math.floor(n), mainAvailable),
                                  }));
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          <div className="flex justify-stretch sm:justify-end shrink-0">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!selectedBrandId || Object.values(quantities).every((q) => !q)}
              onClick={addBrandQuantitiesToCart}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add to request
            </Button>
          </div>

          <div className="space-y-2 shrink-0 border rounded-md p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <Label>Request lines</Label>
              <span className="text-xs text-muted-foreground">
                {cartSummary.lineCount} SKU(s) · {cartSummary.totalQty} units
              </span>
            </div>
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No items added yet.</p>
            ) : (
              <ul className="space-y-2 max-h-32 overflow-y-auto">
                {cart.map((line) => (
                  <li
                    key={line.variantId}
                    className="flex items-center justify-between gap-2 text-sm rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{line.variantName}</p>
                      <p className="text-xs text-muted-foreground">{line.brandName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums">×{line.quantity}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeCartLine(line.variantId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 shrink-0">
            <Label htmlFor="sw-req-notes">Notes (optional)</Label>
            <Textarea
              id="sw-req-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Needed for weekend replenishment"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="pt-4 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={cart.length === 0 || submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              'Submit request'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
