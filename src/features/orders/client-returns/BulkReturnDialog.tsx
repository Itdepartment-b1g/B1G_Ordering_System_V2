import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Loader2, PenTool, Search, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Textarea } from '@/components/ui/textarea';
import {
  MultiProofPhotoField,
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import { cn } from '@/lib/utils';
import type { ReturnedInventoryRow } from './clientReturnApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';
import { createReturnLeaderHandover } from './returnLeaderApi';

const ROW_COLS = 'grid grid-cols-[2.25rem_minmax(0,1fr)_5.75rem] items-center gap-3';
const QTY_CELL = 'flex w-full items-center justify-end';

const STEPS = [
  { id: 0, label: 'Items' },
  { id: 1, label: 'Proof & sign' },
  { id: 2, label: 'Review' },
] as const;

type BrandGroup = {
  brandName: string;
  qty: number;
  variants: ReturnedInventoryRow[];
};

type SelectedItem = {
  row: ReturnedInventoryRow;
  qty: number;
  maxQty: number;
};

type BulkReturnDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: ReturnedInventoryRow[];
  companyId?: string;
  submitterName?: string;
  onSubmitted?: () => void;
};

function namesMatch(typed: string, expected: string) {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim().length > 0;
}

function groupRowsByBrand(rows: ReturnedInventoryRow[]): BrandGroup[] {
  const map = new Map<string, ReturnedInventoryRow[]>();
  for (const row of rows) {
    const brand = row.brandName.trim() || 'Unknown';
    const list = map.get(brand) || [];
    list.push(row);
    map.set(brand, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([brandName, variants]) => ({
      brandName,
      qty: variants.reduce((sum, row) => sum + row.qty, 0),
      variants: variants.slice().sort((a, b) => a.variantName.localeCompare(b.variantName)),
    }));
}

function buildSelectionMap(sourceRows: ReturnedInventoryRow[]): Map<string, SelectedItem> {
  const next = new Map<string, SelectedItem>();
  for (const row of sourceRows) {
    next.set(row.variantId, { row, qty: row.qty, maxQty: row.qty });
  }
  return next;
}

function Stepper({
  currentStep,
  itemsDone,
  proofDone,
  onStepClick,
}: {
  currentStep: number;
  itemsDone: boolean;
  proofDone: boolean;
  onStepClick: (step: number) => void;
}) {
  return (
    <ol className="flex w-full items-start" aria-label="Return to TL progress">
      {STEPS.map((step, index) => {
        const status = index === currentStep ? 'current' : index < currentStep ? 'completed' : 'upcoming';
        const canClick =
          index === currentStep ||
          index < currentStep ||
          (index === 1 && itemsDone) ||
          (index === 2 && itemsDone && proofDone);
        const isLast = index === STEPS.length - 1;

        return (
          <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
            {!isLast ? (
              <span aria-hidden className="absolute left-1/2 top-3 z-0 h-px w-full bg-primary" />
            ) : null}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => {
                if (canClick) onStepClick(index);
              }}
              aria-current={status === 'current' ? 'step' : undefined}
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                status === 'completed' && 'bg-primary text-primary-foreground',
                status === 'current' && 'bg-primary text-primary-foreground ring-4 ring-primary/20',
                status === 'upcoming' && 'bg-muted text-muted-foreground',
                !canClick && 'opacity-60'
              )}
            >
              {status === 'completed' ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </button>
            <span
              className={cn(
                'mt-2 text-center text-xs font-medium',
                status === 'current' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function BulkReturnDialog({
  open,
  onOpenChange,
  rows,
  companyId,
  submitterName = '',
  onSubmitted,
}: BulkReturnDialogProps) {
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [openBrands, setOpenBrands] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PackageProofPhotoItem[]>([]);
  const [agentSignatureDataUrl, setAgentSignatureDataUrl] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [showNameConfirm, setShowNameConfirm] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.brandName.toLowerCase().includes(needle) ||
        row.variantName.toLowerCase().includes(needle) ||
        row.variantType.toLowerCase().includes(needle)
    );
  }, [rows, searchQuery]);

  const brandGroups = useMemo(() => groupRowsByBrand(filteredRows), [filteredRows]);

  const selectedReviewGroups = useMemo(() => {
    const selectedRows = Array.from(selected.values()).map((item) => ({
      ...item.row,
      qty: item.qty,
    }));
    return groupRowsByBrand(selectedRows);
  }, [selected]);

  const selectedSummary = useMemo(() => {
    let units = 0;
    for (const item of selected.values()) units += item.qty;
    return { skus: selected.size, units };
  }, [selected]);

  const itemsReady = selected.size > 0;
  const proofReady = photos.length > 0 && !!agentSignatureDataUrl;
  const nameMatches = namesMatch(typedName, submitterName);
  const showNameMismatch = typedName.trim().length > 0 && !nameMatches;
  const canProceedToName = itemsReady && proofReady && !!companyId && !submitting;
  const canConfirmSubmit = canProceedToName && nameMatches;

  const stepDescription =
    step === 0
      ? 'Select brands or variants to hand over, then continue.'
      : step === 1
        ? 'Add a proof photo and your signature.'
        : 'Review everything, then confirm to submit.';

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSearchQuery('');
    setSelected(buildSelectionMap(rows));
    setOpenBrands(new Set(groupRowsByBrand(rows).map((group) => group.brandName)));
    setNotes('');
    setPhotos((prev) => {
      revokePackageProofPreviews(prev);
      return [];
    });
    setAgentSignatureDataUrl('');
    setSignatureOpen(false);
    setShowNameConfirm(false);
    setTypedName('');
    setSubmitError(null);
    setSubmitting(false);
  }, [open, rows]);

  const selectAll = () => setSelected(buildSelectionMap(filteredRows));
  const clearSelection = () => setSelected(new Map());

  const toggleBrandOpen = (brandName: string) => {
    setOpenBrands((current) => {
      const next = new Set(current);
      if (next.has(brandName)) next.delete(brandName);
      else next.add(brandName);
      return next;
    });
  };

  const toggleBrand = (group: BrandGroup, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const row of group.variants) {
        if (checked) {
          next.set(row.variantId, {
            row,
            qty: current.get(row.variantId)?.qty ?? row.qty,
            maxQty: row.qty,
          });
        } else {
          next.delete(row.variantId);
        }
      }
      return next;
    });
  };

  const isBrandChecked = (group: BrandGroup) =>
    group.variants.length > 0 && group.variants.every((row) => selected.has(row.variantId));

  const isBrandIndeterminate = (group: BrandGroup) => {
    const count = group.variants.filter((row) => selected.has(row.variantId)).length;
    return count > 0 && count < group.variants.length;
  };

  const toggleVariant = (row: ReturnedInventoryRow, checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) {
        next.set(row.variantId, {
          row,
          qty: current.get(row.variantId)?.qty ?? row.qty,
          maxQty: row.qty,
        });
      } else {
        next.delete(row.variantId);
      }
      return next;
    });
  };

  const setVariantQty = (variantId: string, raw: string) => {
    setSelected((current) => {
      const item = current.get(variantId);
      if (!item) return current;
      const parsed = Number.parseInt(raw, 10);
      const qty = Number.isFinite(parsed) ? Math.min(Math.max(1, parsed), item.maxQty) : 1;
      const next = new Map(current);
      next.set(variantId, { ...item, qty });
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canConfirmSubmit || !agentSignatureDataUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items = Array.from(selected.values()).map((item) => ({
        variantId: item.row.variantId,
        brandId: item.row.brandId,
        quantity: item.qty,
      }));
      await createReturnLeaderHandover({
        companyId: companyId!,
        items,
        notes,
        photos,
        signatureDataUrl: agentSignatureDataUrl,
      });
      setShowNameConfirm(false);
      onOpenChange(false);
      onSubmitted?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit return to leader');
    } finally {
      setSubmitting(false);
    }
  };

  const openNameConfirm = () => {
    if (!canProceedToName) return;
    setSubmitError(null);
    setTypedName('');
    setShowNameConfirm(true);
  };

  const closeNameConfirm = () => {
    if (submitting) return;
    setShowNameConfirm(false);
    setTypedName('');
    setSubmitError(null);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting && !nextOpen) return;
          if (!nextOpen) {
            setShowNameConfirm(false);
            setTypedName('');
            setSignatureOpen(false);
          }
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 space-y-3 text-left">
            <DialogTitle>Return to TL</DialogTitle>
            <DialogDescription>{stepDescription}</DialogDescription>
            <Stepper
              currentStep={step}
              itemsDone={itemsReady}
              proofDone={proofReady}
              onStepClick={(nextStep) => {
                if (submitting) return;
                if (nextStep >= 1 && !itemsReady) return;
                if (nextStep >= 2 && !proofReady) return;
                setStep(nextStep);
              }}
            />
            {step === 0 ? (
              <>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search brand or variant..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={selectAll}
                      disabled={submitting || filteredRows.length === 0}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={clearSelection}
                      disabled={submitting || selected.size === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{selectedSummary.skus}</span> SKU
                  {selectedSummary.skus === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold tabular-nums text-rose-700">{selectedSummary.units}</span>{' '}
                  unit{selectedSummary.units === 1 ? '' : 's'} selected
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Returning{' '}
                <span className="font-semibold text-foreground tabular-nums">{selectedSummary.skus}</span> SKU
                {selectedSummary.skus === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-rose-700 tabular-nums">{selectedSummary.units}</span> unit
                {selectedSummary.units === 1 ? '' : 's'}
              </p>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 space-y-3 pb-3">
            {step === 0 ? (
              <>
                {brandGroups.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {searchQuery ? 'No matching items.' : 'No returned stock to return.'}
                  </p>
                ) : (
                  <>
                    <div className={`${ROW_COLS} px-3 text-xs font-medium text-muted-foreground`}>
                      <span />
                      <span>Brand / Variant</span>
                      <span className="text-right">Qty</span>
                    </div>

                    {brandGroups.map((group) => {
                      const isOpen = openBrands.has(group.brandName);
                      return (
                        <section key={group.brandName} className="rounded-xl border overflow-hidden">
                          <div className={`${ROW_COLS} px-3 py-2.5 bg-muted/40 border-b`}>
                            <Checkbox
                              checked={
                                isBrandIndeterminate(group) ? 'indeterminate' : isBrandChecked(group)
                              }
                              onCheckedChange={(checked) => toggleBrand(group, checked === true)}
                              aria-label={`Select all ${group.brandName}`}
                              className="justify-self-center"
                              disabled={submitting}
                            />
                            <button
                              type="button"
                              className="min-w-0 flex items-center gap-2 text-left"
                              onClick={() => toggleBrandOpen(group.brandName)}
                            >
                              <h3 className="font-semibold truncate">{group.brandName}</h3>
                              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                {group.variants.length} variant{group.variants.length === 1 ? '' : 's'}
                              </span>
                              <ChevronDown
                                className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                  isOpen ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            <p className={`${QTY_CELL} font-semibold tabular-nums text-rose-700`}>
                              {group.qty}
                            </p>
                          </div>

                          {isOpen ? (
                            <ul className="divide-y">
                              {group.variants.map((row) => {
                                const selectedItem = selected.get(row.variantId);
                                const isSelected = !!selectedItem;
                                return (
                                  <li key={row.variantId} className={`${ROW_COLS} px-3 py-3`}>
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => toggleVariant(row, checked === true)}
                                      aria-label={`Select ${row.variantName}`}
                                      className="justify-self-center"
                                      disabled={submitting}
                                    />
                                    <div className="min-w-0">
                                      <p className="font-medium leading-snug break-words">{row.variantName}</p>
                                      <Badge
                                        variant="secondary"
                                        className={`mt-1 font-normal ${variantTypeBadgeClass(row.variantType)}`}
                                      >
                                        {formatVariantType(row.variantType)}
                                      </Badge>
                                    </div>
                                    <div className={QTY_CELL}>
                                      {isSelected ? (
                                        <div className="w-full space-y-0.5">
                                          <Input
                                            type="number"
                                            min={1}
                                            max={row.qty}
                                            value={selectedItem.qty}
                                            className="h-9 w-full text-center tabular-nums"
                                            onChange={(e) => setVariantQty(row.variantId, e.target.value)}
                                            disabled={submitting}
                                          />
                                          <p className="text-[10px] text-muted-foreground text-center tabular-nums leading-none">
                                            of {row.qty}
                                          </p>
                                        </div>
                                      ) : (
                                        <span className="font-semibold tabular-nums text-muted-foreground">
                                          {row.qty}
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </section>
                      );
                    })}
                  </>
                )}

                <div className="space-y-2 pt-1">
                  <Label htmlFor="bulk-rl-notes">Notes (optional)</Label>
                  <Textarea
                    id="bulk-rl-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Handover notes..."
                    rows={2}
                    disabled={submitting}
                  />
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <MultiProofPhotoField
                  label="Proof photo"
                  value={photos}
                  onChange={setPhotos}
                  emptyTitle="Add a proof photo"
                  recommendedHint="Required · take a photo or choose a file"
                  enableCamera
                  disabled={submitting}
                />

                <div className="space-y-2">
                  <Label>Agent signature *</Label>
                  <p className="text-xs text-muted-foreground">
                    Sign to confirm you are submitting this return to your team leader.
                  </p>
                  {!agentSignatureDataUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10"
                      disabled={submitting}
                      onClick={() => setSignatureOpen(true)}
                    >
                      <PenTool className="h-4 w-4 mr-2" />
                      Add signature
                    </Button>
                  ) : (
                    <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                      <img
                        src={agentSignatureDataUrl}
                        alt="Agent signature"
                        className="max-h-28 mx-auto bg-white rounded-md"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={submitting}
                          onClick={() => setAgentSignatureDataUrl('')}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={submitting}
                          onClick={() => setSignatureOpen(true)}
                        >
                          Re-sign
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <div className="rounded-md border p-3 text-sm space-y-3">
                  <div className="space-y-1.5">
                    <p>
                      <span className="text-muted-foreground">SKUs · </span>
                      <span className="font-semibold tabular-nums">{selectedSummary.skus}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Units · </span>
                      <span className="font-semibold tabular-nums text-rose-700">{selectedSummary.units}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Notes · </span>
                      {notes.trim() || '—'}
                    </p>
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <p className="text-muted-foreground">
                      Proof photo ·{' '}
                      <span className="text-foreground">{photos.length} attached</span>
                    </p>
                    {photos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {photos.map((photo, index) => (
                          <img
                            key={`${photo.fileName}-${index}`}
                            src={photo.previewUrl}
                            alt={photo.fileName || `Proof ${index + 1}`}
                            className="h-24 w-32 rounded-md border object-cover bg-muted"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 border-t pt-3">
                    <p className="text-muted-foreground">
                      Agent signature ·{' '}
                      <span className="text-foreground">
                        {agentSignatureDataUrl ? 'Captured' : 'Missing'}
                      </span>
                    </p>
                    {agentSignatureDataUrl ? (
                      <div className="rounded-md border bg-white p-3">
                        <img
                          src={agentSignatureDataUrl}
                          alt="Agent signature"
                          className="max-h-28 mx-auto"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Items</p>
                  {selectedReviewGroups.map((group) => (
                    <section key={group.brandName} className="rounded-xl border overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-muted/40 border-b">
                        <h3 className="font-semibold truncate">{group.brandName}</h3>
                        <p className="text-right font-semibold tabular-nums text-rose-700 shrink-0">
                          {group.qty}
                        </p>
                      </div>
                      <ul className="divide-y">
                        {group.variants.map((row) => (
                          <li
                            key={row.variantId}
                            className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="font-medium leading-snug break-words">{row.variantName}</p>
                              <Badge
                                variant="secondary"
                                className={`mt-1 font-normal ${variantTypeBadgeClass(row.variantType)}`}
                              >
                                {formatVariantType(row.variantType)}
                              </Badge>
                            </div>
                            <p className="text-right font-semibold tabular-nums text-rose-700">{row.qty}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t px-4 py-3 sm:px-6 gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (step > 0) {
                  setStep(step - 1);
                  return;
                }
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              {step > 0 ? 'Back' : 'Cancel'}
            </Button>
            {step < 2 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={
                  submitting || (step === 0 ? !itemsReady : !proofReady)
                }
              >
                Next
              </Button>
            ) : (
              <Button onClick={openNameConfirm} disabled={!canProceedToName}>
                Confirm return
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agent signature</DialogTitle>
            <DialogDescription>Sign to confirm this return to TL.</DialogDescription>
          </DialogHeader>
          <SignatureCanvas
            onSave={(dataUrl) => {
              setAgentSignatureDataUrl(dataUrl);
              setSignatureOpen(false);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(open && showNameConfirm)}
        onOpenChange={(nextOpen) => {
          if (submitting && !nextOpen) return;
          if (!nextOpen) closeNameConfirm();
        }}
      >
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your name</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-left">
                <p>
                  You are returning{' '}
                  <span className="font-semibold text-foreground tabular-nums">{selectedSummary.skus}</span> SKU
                  {selectedSummary.skus === 1 ? '' : 's'} (
                  <span className="font-semibold text-foreground tabular-nums">{selectedSummary.units}</span> unit
                  {selectedSummary.units === 1 ? '' : 's'}) to your team leader.
                </p>
                <p>
                  Enter <span className="font-semibold text-foreground">{submitterName || 'your full name'}</span>{' '}
                  exactly to submit.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="bulk-rl-confirm-name">Your full name</Label>
                  <Input
                    id="bulk-rl-confirm-name"
                    className="text-black"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Your full name"
                    autoComplete="off"
                    disabled={submitting || !submitterName}
                  />
                  {showNameMismatch ? <p className="text-xs text-destructive">Name does not match.</p> : null}
                  {!submitterName ? (
                    <p className="text-xs text-destructive">Your profile name is missing. Refresh and try again.</p>
                  ) : null}
                </div>
                {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting} onClick={closeNameConfirm}>
              Back
            </AlertDialogCancel>
            <Button onClick={() => void handleSubmit()} disabled={!canConfirmSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit return'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
