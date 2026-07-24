/**
 * Main Warehouse: allocate/deliver stock to a Sub Warehouse without a prior request.
 * Combines destination + item cart + deliver proof/signature, then calls
 * create_and_deliver_main_stock_allocation.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Minus, Plus, Search, Trash2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import type { Brand, Variant } from '../InventoryContext';
import {
  InternalStockDeliveryProofFields,
  isInternalStockDeliveryProofComplete,
  useInternalStockDeliveryProof,
} from './InternalStockDeliveryProofFields';

export type SubWarehouseLocationOption = {
  id: string;
  name: string;
  code?: string | null;
};

type CartLine = {
  id: string;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  quantity: number;
};

export type MainAllocateSubmitPayload = {
  fromLocationId: string;
  notes: string;
  items: Array<{ variant_id: string; quantity: number }>;
  signatureUrl: string;
  proofImageUrl: string;
  riderName: string;
  riderPlateNumber: string;
  riderPhotoUrl: string;
};

type MainWarehouseAllocateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: SubWarehouseLocationOption[];
  loadingLocations?: boolean;
  brands: Brand[];
  loadingBrands?: boolean;
  submitting?: boolean;
  onSubmit: (payload: MainAllocateSubmitPayload) => void | Promise<void>;
};

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

function getMainAvailableQty(variant: Pick<Variant, 'stock' | 'allocatedStock'>): number {
  return Math.max(0, variant.stock - (variant.allocatedStock || 0));
}

function findVariantAvailable(brands: Brand[], variantId: string): number {
  for (const brand of brands) {
    const variant = brand.allVariants?.find((v) => v.id === variantId);
    if (variant) return getMainAvailableQty(variant);
  }
  return Number.POSITIVE_INFINITY;
}

function parseWholeQty(raw: string, max: number): number {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return 0;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, Math.max(0, max));
}

/** Text + inputMode qty with +/- — wheel scroll never changes the value. */
function QtyStepper({
  value,
  max,
  disabled,
  onChange,
  id,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  id?: string;
}) {
  const display = value > 0 ? String(value) : '';
  const canDec = !disabled && value > 0;
  const canInc = !disabled && value < max;

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={!canDec}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        className="w-16 h-9 text-center tabular-nums px-1"
        value={display}
        disabled={disabled || max <= 0}
        placeholder="0"
        onChange={(e) => onChange(parseWholeQty(e.target.value, max))}
        onFocus={(e) => e.target.select()}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={!canInc}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function MainWarehouseAllocateDialog({
  open,
  onOpenChange,
  locations,
  loadingLocations = false,
  brands,
  loadingBrands = false,
  submitting = false,
  onSubmit,
}: MainWarehouseAllocateDialogProps) {
  const [locationId, setLocationId] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('');
  const deliveryProof = useInternalStockDeliveryProof(open);

  useEffect(() => {
    if (!open) return;
    setLocationId('');
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

  const openAccordionTypes = useMemo(
    () => typeGroups.map(([type]) => type),
    [typeGroups]
  );

  const cartSummary = useMemo(() => {
    const totalQty = cart.reduce((s, line) => s + line.quantity, 0);
    return { lineCount: cart.length, totalQty };
  }, [cart]);

  const setSkuQty = (variantId: string, next: number) => {
    setQuantities((prev) => {
      if (next <= 0) {
        const rest = { ...prev };
        delete rest[variantId];
        return rest;
      }
      return { ...prev, [variantId]: next };
    });
  };

  const setCartQty = (variantId: string, next: number) => {
    setCart((prev) => {
      if (next <= 0) return prev.filter((line) => line.variantId !== variantId);
      return prev.map((line) =>
        line.variantId === variantId ? { ...line, quantity: next } : line
      );
    });
  };

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
          const available = findVariantAvailable(brands, line.variantId);
          const merged = Math.min(
            available === Number.POSITIVE_INFINITY
              ? next[idx].quantity + line.quantity
              : available,
            next[idx].quantity + line.quantity
          );
          next[idx] = { ...next[idx], quantity: merged };
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

  const canSubmit =
    !!locationId &&
    cart.length > 0 &&
    isInternalStockDeliveryProofComplete(deliveryProof.value) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const proof = deliveryProof.value;
    await onSubmit({
      fromLocationId: locationId,
      notes: notes.trim(),
      items: cart.map((line) => ({
        variant_id: line.variantId,
        quantity: line.quantity,
      })),
      signatureUrl: proof.signatureDataUrl,
      proofImageUrl: proof.proofImageDataUrl,
      riderName: proof.riderName.trim(),
      riderPlateNumber: proof.riderPlate.trim(),
      riderPhotoUrl: proof.riderPhotoDataUrl,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-3xl max-h-[90vh] flex flex-col gap-0 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Allocate to Sub Warehouse</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal pt-1">
              Push stock without a sub request. Sub must still confirm receive before their
              on-hand increases.
            </p>
          </DialogHeader>

          <div className="space-y-5 py-2 flex-1 min-h-0 flex flex-col overflow-y-auto">
            {/* Destination */}
            <section className="space-y-2 shrink-0">
              <SectionLabel>Destination</SectionLabel>
              <Label>Target sub-warehouse</Label>
              <Select
                value={locationId || undefined}
                onValueChange={setLocationId}
                disabled={loadingLocations || locations.length === 0}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue
                    placeholder={
                      loadingLocations ? 'Loading warehouses…' : 'Select sub-warehouse'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.code ? ` (${loc.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* Add items */}
            <section className="space-y-3 shrink-0">
              <SectionLabel>Add items</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <SelectTrigger className="w-full h-10">
                      <SelectValue
                        placeholder={loadingBrands ? 'Loading brands…' : 'Select brand'}
                      />
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
                  <Label htmlFor="main-alloc-filter">Filter SKUs</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="main-alloc-filter"
                      placeholder="Search product…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      disabled={!selectedBrand}
                      className="h-10 pl-9"
                    />
                  </div>
                </div>
              </div>

              {selectedBrand ? (
                <div className="rounded-md border">
                  {typeGroups.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No matching SKUs.</p>
                  ) : (
                    <Accordion
                      type="multiple"
                      value={openAccordionTypes}
                      onValueChange={() => {
                        /* keep all type groups expanded */
                      }}
                      className="px-2"
                    >
                      {typeGroups.map(([type, variants]) => (
                        <AccordionItem key={type} value={type}>
                          <AccordionTrigger className="text-sm py-2">
                            {normalizeTypeLabel(type)}
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-2 pb-2">
                              {variants.map((variant) => {
                                const available = getMainAvailableQty(variant);
                                const qty = quantities[variant.id] ?? 0;
                                return (
                                  <div
                                    key={variant.id}
                                    className={cn(
                                      'flex items-center justify-between gap-3 text-sm rounded-md px-1 py-1.5',
                                      qty > 0 && 'bg-muted/40'
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">{variant.name}</p>
                                      <p className="text-xs text-muted-foreground tabular-nums">
                                        Available {available.toLocaleString()}
                                      </p>
                                    </div>
                                    <QtyStepper
                                      value={qty}
                                      max={available}
                                      disabled={available <= 0}
                                      onChange={(next) => setSkuQty(variant.id, next)}
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a brand to add items from main warehouse stock.
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1 h-9"
                  disabled={!selectedBrand || Object.values(quantities).every((q) => !q)}
                  onClick={addBrandQuantitiesToCart}
                >
                  <Plus className="h-4 w-4" />
                  Add to allocation
                </Button>
              </div>
            </section>

            {/* Cart */}
            <section className="space-y-2 shrink-0">
              <SectionLabel>Cart</SectionLabel>
              <Label>
                Allocation cart
                {cartSummary.lineCount > 0
                  ? ` · ${cartSummary.lineCount} item${cartSummary.lineCount === 1 ? '' : 's'} · ${cartSummary.totalQty.toLocaleString()} units`
                  : ''}
              </Label>
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center">
                  No items yet.
                </p>
              ) : (
                <ul className="rounded-md border divide-y">
                  {cart.map((line) => {
                    const available = findVariantAvailable(brands, line.variantId);
                    const max =
                      available === Number.POSITIVE_INFINITY
                        ? Math.max(line.quantity, 99999)
                        : available;
                    return (
                      <li
                        key={line.variantId}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {line.brandName} · {line.variantName}
                          </p>
                          {available !== Number.POSITIVE_INFINITY ? (
                            <p className="text-xs text-muted-foreground tabular-nums">
                              Available {available.toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <QtyStepper
                            value={line.quantity}
                            max={max}
                            onChange={(next) => setCartQty(line.variantId, next)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 shrink-0"
                            onClick={() => removeCartLine(line.variantId)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove</span>
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Notes */}
            <section className="space-y-2 shrink-0">
              <SectionLabel>Notes</SectionLabel>
              <Label htmlFor="main-alloc-notes">Notes (optional)</Label>
              <Textarea
                id="main-alloc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for this allocation…"
                rows={2}
              />
            </section>

            {/* Rider & proof */}
            <section className="shrink-0">
              <InternalStockDeliveryProofFields
                value={deliveryProof.value}
                onChange={deliveryProof.patch}
                riderPhotoError={deliveryProof.riderPhotoError}
                proofError={deliveryProof.proofError}
                onRiderPhotoError={deliveryProof.setRiderPhotoError}
                onProofError={deliveryProof.setProofError}
                labels={{
                  idPrefix: 'main-alloc',
                  sectionTitle: 'Rider & proof',
                  signatureAlt: 'Allocation signature',
                  signatureDialogTitle: 'Sign allocation',
                  signatureCanvasTitle: 'Allocation signature',
                  signatureCanvasDescription:
                    'Draw your signature to confirm this allocation delivery',
                }}
              />
            </section>
          </div>

          <DialogFooter className="pt-3 border-t gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Allocating…
                </>
              ) : (
                'Allocate & deliver'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
