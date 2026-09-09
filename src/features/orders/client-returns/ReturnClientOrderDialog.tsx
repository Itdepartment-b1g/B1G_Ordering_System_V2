import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, PenTool, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  MultiProofPhotoField,
  type PackageProofPhotoItem,
  revokePackageProofPreviews,
  validatePackageProofFile,
} from '@/features/shared/components/MultiProofPhotoField';
import {
  CLIENT_RETURN_REASON_OPTIONS,
  buildMockChangeItemCatalog,
  formatClientReturnReason,
  getMockAlreadyReturnedQty,
  type ClientReturnReasonOption,
  type MockChangeItemSku,
} from './clientReturnMock';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';

export type ReturnClientOrderLine = {
  id: string;
  brandName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  variantType?: string;
};

type ReturnClientOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  clientName: string;
  items: ReturnClientOrderLine[];
};

type StockShortfall = {
  brand: string;
  returned: number;
  sellable: number;
};

const RETURN_STEPS = [
  { id: 0, label: 'Return Items' },
  { id: 1, label: 'Change Items' },
  { id: 2, label: 'Reason' },
  { id: 3, label: 'Proof' },
  { id: 4, label: 'Sign' },
  { id: 5, label: 'Review' },
] as const;

const LAST_STEP = RETURN_STEPS.length - 1;

function ReturnItemsStepper({
  currentStep,
  completedSteps,
  onStepClick,
}: {
  currentStep: number;
  completedSteps: boolean[];
  onStepClick: (step: number) => void;
}) {
  return (
    <ol className="flex w-full max-w-3xl mx-auto items-start" aria-label="Return items progress">
      {RETURN_STEPS.map((step, index) => {
        const status = index === currentStep ? 'current' : index < currentStep ? 'completed' : 'upcoming';
        const canClick =
          index === currentStep ||
          index < currentStep ||
          completedSteps.slice(0, index).every(Boolean);
        const isLast = index === LAST_STEP;

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
                status === 'current' &&
                  'bg-primary text-primary-foreground ring-1 ring-primary ring-offset-1 ring-offset-background',
                status === 'upcoming' && 'border border-primary bg-background text-primary',
                canClick ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              {status === 'completed' ? <Check className="h-3 w-3" strokeWidth={2.5} /> : index + 1}
            </button>
            <span
              className={cn(
                'mt-1.5 max-w-[5.5rem] text-center text-[10px] leading-tight sm:max-w-none',
                status === 'current' ? 'font-semibold text-primary' : 'font-medium text-primary/50'
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

function TypeBadge({ type }: { type?: string }) {
  const value = type || 'flavor';
  return (
    <Badge variant="secondary" className={`font-normal capitalize ${variantTypeBadgeClass(value)}`}>
      {formatVariantType(value)}
    </Badge>
  );
}

function inputTintClass(type?: string) {
  const value = (type || 'flavor').trim().toLowerCase();
  if (value === 'flavor') return 'bg-blue-50';
  if (value === 'battery') return 'bg-green-50';
  if (value === 'posm') return 'bg-purple-50';
  if (value === 'foc') return 'bg-orange-50';
  if (value === 'ncv') return 'bg-pink-50';
  return 'bg-muted/40';
}

function QtyInputCard({
  title,
  type,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  actionTitle,
  actionHint,
  value,
  max,
  hint,
  invalid,
  fieldId,
  onValueChange,
}: {
  title: string;
  type?: string;
  leftLabel: string;
  leftValue: number;
  rightLabel: string;
  rightValue: number;
  actionTitle: string;
  actionHint: string;
  value: number;
  max: number;
  hint?: string;
  invalid?: boolean;
  fieldId: string;
  onValueChange: (next: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-base leading-tight min-w-0">{title}</p>
        <TypeBadge type={type} />
      </div>

      <div className="grid grid-cols-2 divide-x">
        <div>
          <p className="text-xs text-muted-foreground">{leftLabel}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{leftValue}</p>
        </div>
        <div className="pl-4">
          <p className="text-xs text-muted-foreground">{rightLabel}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">{rightValue}</p>
        </div>
      </div>

      <div className={cn('rounded-lg p-3 space-y-2', inputTintClass(type))}>
        <div>
          <p className="text-sm font-semibold">{actionTitle}</p>
          <p className="text-xs text-muted-foreground">{actionHint}</p>
        </div>
        <Input
          type="number"
          min={0}
          max={max}
          value={value}
          data-field={fieldId}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            onValueChange(Number.isNaN(parsed) ? 0 : parsed);
          }}
          className={cn(
            'h-11 w-full bg-background text-right text-lg',
            invalid && 'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
          )}
        />
        {hint ? (
          <p className="text-xs text-destructive leading-tight">{hint}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Max {max}</p>
        )}
      </div>
    </div>
  );
}

function groupByBrandName<T extends { brandName: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const brand = row.brandName?.trim() || 'Unknown';
    const list = map.get(brand) || [];
    list.push(row);
    map.set(brand, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function changeSkuMax(
  skuId: string,
  sellableQty: number,
  returnedQty: number,
  skuIds: string[],
  changeQuantities: Record<string, number>
) {
  const others = skuIds.reduce((sum, id) => (id === skuId ? sum : sum + (changeQuantities[id] || 0)), 0);
  return Math.min(sellableQty, Math.max(0, returnedQty - others));
}

export function ReturnClientOrderDialog({
  open,
  onOpenChange,
  orderNumber,
  clientName,
  items,
}: ReturnClientOrderDialogProps) {
  const { toast } = useToast();
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [changeQuantities, setChangeQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ClientReturnReasonOption | ''>('');
  const [otherReason, setOtherReason] = useState('');
  const [returnDate, setReturnDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PackageProofPhotoItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [qtyHints, setQtyHints] = useState<Record<string, string>>({});
  const [changeHints, setChangeHints] = useState<Record<string, string>>({});
  const [stockWarning, setStockWarning] = useState<StockShortfall[] | null>(null);
  const [clientConfirmOpen, setClientConfirmOpen] = useState(false);
  const [clientNameConfirmInput, setClientNameConfirmInput] = useState('');
  const [agentSignatureDataUrl, setAgentSignatureDataUrl] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false);
  const isMobile = useIsMobile();
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const [openReturnBrands, setOpenReturnBrands] = useState<string[]>([]);
  const [openChangeBrands, setOpenChangeBrands] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setQuantities({});
      setChangeQuantities({});
      setReason('');
      setOtherReason('');
      setReturnDate(format(new Date(), 'yyyy-MM-dd'));
      setNotes('');
      setFormError(null);
      setQtyHints({});
      setChangeHints({});
      setStockWarning(null);
      setClientConfirmOpen(false);
      setClientNameConfirmInput('');
      setAgentSignatureDataUrl('');
      setSignatureOpen(false);
      setInvalidField(null);
      setOpenReturnBrands([]);
      setOpenChangeBrands([]);
      revokePackageProofPreviews(photos);
      setPhotos([]);
      return;
    }
    const initial: Record<string, number> = {};
    for (const item of items) {
      initial[item.id] = 0;
    }
    setQuantities(initial);
    setChangeQuantities({});
    setStep(0);
    setFormError(null);
    setQtyHints({});
    setChangeHints({});
    setStockWarning(null);
    setClientConfirmOpen(false);
    setClientNameConfirmInput('');
    setAgentSignatureDataUrl('');
    setSignatureOpen(false);
    setInvalidField(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset photos only when dialog closes
  }, [open, items]);

  const lines = useMemo(
    () =>
      items.map((item) => {
        const alreadyReturned = getMockAlreadyReturnedQty(orderNumber, item.variantName);
        const remaining = Math.max(0, item.quantity - alreadyReturned);
        return { ...item, alreadyReturned, remaining, variantType: item.variantType || 'flavor' };
      }),
    [items, orderNumber]
  );

  const itemsByBrand = useMemo(() => groupByBrandName(lines), [lines]);

  const selectedLines = lines.filter((line) => (quantities[line.id] || 0) > 0);
  const totalReturning = selectedLines.reduce((sum, line) => sum + (quantities[line.id] || 0), 0);

  const returnedByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of selectedLines) {
      const brand = line.brandName?.trim() || 'Unknown';
      map.set(brand, (map.get(brand) || 0) + (quantities[line.id] || 0));
    }
    return map;
  }, [selectedLines, quantities]);

  const changeCatalog = useMemo(() => buildMockChangeItemCatalog(items), [items]);

  useEffect(() => {
    if (!open) return;
    setChangeQuantities((prev) => {
      let changed = false;
      const next = { ...prev };
      const brands = new Set(changeCatalog.map((sku) => sku.brandName));
      for (const brand of brands) {
        const returned = returnedByBrand.get(brand) || 0;
        const skus = changeCatalog.filter((sku) => sku.brandName === brand);
        let remaining = returned;
        for (const sku of skus) {
          const current = next[sku.id] || 0;
          const allowed = Math.min(current, sku.sellableQty, remaining);
          if (allowed !== current) {
            changed = true;
            if (allowed <= 0) delete next[sku.id];
            else next[sku.id] = allowed;
          }
          remaining -= allowed;
        }
      }
      for (const id of Object.keys(next)) {
        if (!changeCatalog.some((sku) => sku.id === id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [open, changeCatalog, returnedByBrand]);

  const brandsWithReturns = useMemo(
    () => Array.from(returnedByBrand.entries()).filter(([, qty]) => qty > 0),
    [returnedByBrand]
  );

  const changeSkusByBrand = useMemo(() => {
    return brandsWithReturns.map(([brand, returnedQty]) => ({
      brand,
      returnedQty,
      skus: changeCatalog.filter((sku) => sku.brandName === brand),
    }));
  }, [brandsWithReturns, changeCatalog]);

  useEffect(() => {
    if (!open) return;
    setOpenReturnBrands(itemsByBrand.map(([brand]) => brand));
  }, [open, itemsByBrand]);

  useEffect(() => {
    if (!open) return;
    setOpenChangeBrands(changeSkusByBrand.map((group) => group.brand));
  }, [open, changeSkusByBrand]);

  const selectedChangeSkus = changeCatalog.filter((sku) => (changeQuantities[sku.id] || 0) > 0);
  const totalChanging = selectedChangeSkus.reduce((sum, sku) => sum + (changeQuantities[sku.id] || 0), 0);

  const reviewReturnedByBrand = useMemo(() => groupByBrandName(selectedLines), [selectedLines]);
  const reviewChangeByBrand = useMemo(() => groupByBrandName(selectedChangeSkus), [selectedChangeSkus]);

  const sellableForBrand = (brand: string) =>
    changeCatalog.filter((sku) => sku.brandName === brand).reduce((sum, sku) => sum + sku.sellableQty, 0);

  const stockShortfalls = (): StockShortfall[] =>
    brandsWithReturns
      .map(([brand, returned]) => ({
        brand,
        returned,
        sellable: sellableForBrand(brand),
      }))
      .filter((row) => row.sellable < row.returned);

  const itemsError = (): string | null => {
    if (totalReturning <= 0) return 'Enter a quantity to return for at least one item.';
    for (const line of lines) {
      const qty = quantities[line.id] || 0;
      if (qty > line.remaining) return `Cannot return more than remaining qty for ${line.variantName}.`;
    }
    return null;
  };

  const changeError = (): string | null => {
    if (brandsWithReturns.length === 0) return 'Enter a quantity to return for at least one item.';
    for (const [brand, returned] of brandsWithReturns) {
      const skus = changeCatalog.filter((sku) => sku.brandName === brand);
      if (skus.length === 0) return `No change-item SKUs for ${brand}.`;
      const skuIds = skus.map((sku) => sku.id);
      let total = 0;
      for (const sku of skus) {
        const qty = changeQuantities[sku.id] || 0;
        const max = changeSkuMax(sku.id, sku.sellableQty, returned, skuIds, changeQuantities);
        if (qty > max) {
          return `${brand}: change qty cannot exceed returned qty (${returned}).`;
        }
        total += qty;
      }
      if (total !== returned) {
        return `${brand}: change item qty must equal returned qty (${returned}). Currently ${total}.`;
      }
    }
    return null;
  };

  const reasonError = (): string | null => {
    if (!reason) return 'Select a return reason.';
    if (reason === 'other' && !otherReason.trim()) return 'Type the return reason for Other.';
    if (!returnDate) return 'Select a returned date.';
    if (!notes.trim()) return 'Enter notes.';
    return null;
  };

  const proofError = (): string | null => {
    if (photos.length === 0) return 'Add at least one photo (take photo or upload).';
    return null;
  };

  const signatureError = (): string | null => {
    if (!agentSignatureDataUrl) return 'Add your signature.';
    return null;
  };

  const firstInvalidField = (currentStep: number): string | null => {
    if (currentStep === 0) {
      if (totalReturning <= 0) return lines[0] ? `return-${lines[0].id}` : null;
      const over = lines.find((line) => (quantities[line.id] || 0) > line.remaining);
      return over ? `return-${over.id}` : null;
    }
    if (currentStep === 1) {
      for (const group of changeSkusByBrand) {
        const skuIds = group.skus.map((sku) => sku.id);
        const total = group.skus.reduce((sum, sku) => sum + (changeQuantities[sku.id] || 0), 0);
        if (total === group.returnedQty) continue;
        const target =
          group.skus.find(
            (sku) => changeSkuMax(sku.id, sku.sellableQty, group.returnedQty, skuIds, changeQuantities) > 0
          ) || group.skus[0];
        return target ? `change-${target.id}` : null;
      }
      return null;
    }
    if (currentStep === 2) {
      if (!reason) return 'reason';
      if (reason === 'other' && !otherReason.trim()) return 'other-reason';
      if (!returnDate) return 'return-date';
      if (!notes.trim()) return 'notes';
      return null;
    }
    if (currentStep === 3) return photos.length === 0 ? 'proof' : null;
    if (currentStep === 4) return agentSignatureDataUrl ? null : 'signature';
    return null;
  };

  const revealInvalid = (field: string | null, error: string) => {
    setFormError(error);
    setInvalidField(field);
    if (!field) return;

    if (field.startsWith('return-')) {
      const line = lines.find((item) => `return-${item.id}` === field);
      const brand = line?.brandName?.trim() || 'Unknown';
      setOpenReturnBrands((prev) => (prev.includes(brand) ? prev : [...prev, brand]));
    }
    if (field.startsWith('change-')) {
      const sku = changeCatalog.find((item) => `change-${item.id}` === field);
      if (sku) {
        setOpenChangeBrands((prev) => (prev.includes(sku.brandName) ? prev : [...prev, sku.brandName]));
      }
    }

    window.setTimeout(() => {
      const el = document.querySelector(`[data-field="${field}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    }, 80);
  };

  const stepError = (currentStep: number): string | null => {
    if (currentStep === 0) return itemsError();
    if (currentStep === 1) return changeError();
    if (currentStep === 2) return reasonError();
    if (currentStep === 3) return proofError();
    if (currentStep === 4) return signatureError();
    return null;
  };

  const completedSteps = [!itemsError(), !changeError(), !reasonError(), !proofError(), !signatureError(), false];

  const goNext = () => {
    if (step === 0) {
      const error = itemsError();
      if (error) {
        revealInvalid(firstInvalidField(0), error);
        return;
      }
      const shortfalls = stockShortfalls();
      if (shortfalls.length > 0) {
        setFormError(null);
        setInvalidField(null);
        setStockWarning(shortfalls);
        return;
      }
    } else {
      const error = stepError(step);
      if (error) {
        revealInvalid(firstInvalidField(step), error);
        return;
      }
    }
    setFormError(null);
    setInvalidField(null);
    setStep((current) => Math.min(LAST_STEP, current + 1));
  };

  const goBack = () => {
    setFormError(null);
    setInvalidField(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const handleCaptureFile = (file: File | null) => {
    if (!file) return;
    const err = validatePackageProofFile(file);
    if (err) {
      setFormError(err);
      return;
    }
    if (photos.length >= 3) {
      setFormError('You can attach up to 3 photos.');
      return;
    }
    setFormError(null);
    setInvalidField(null);
    setPhotos((prev) => [
      ...prev,
      {
        previewUrl: URL.createObjectURL(file),
        fileName: file.name || `capture-${Date.now()}.jpg`,
        file,
      },
    ]);
  };

  const clientNameMatches =
    clientName.trim().length > 0 &&
    clientNameConfirmInput.trim().toLowerCase() === clientName.trim().toLowerCase();

  const handleConfirmReturnClick = () => {
    for (let current = 0; current <= 4; current += 1) {
      const error = stepError(current);
      if (error) {
        setStep(current);
        revealInvalid(firstInvalidField(current), error);
        return;
      }
    }
    setFormError(null);
    setInvalidField(null);
    setClientNameConfirmInput('');
    setClientConfirmOpen(true);
  };

  const handleSubmit = () => {
    const error = itemsError() || changeError() || reasonError() || proofError() || signatureError();
    if (error) {
      setFormError(error);
      setClientConfirmOpen(false);
      return;
    }
    if (!clientNameMatches) {
      toast({
        title: 'Name does not match',
        description: 'Please type the client name exactly to confirm.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Mock return only — not saved',
      description: `${totalReturning} unit(s) returned, ${totalChanging} change item(s) on ${orderNumber}. No database write.`,
    });
    setClientConfirmOpen(false);
    onOpenChange(false);
  };

  const reasonLabel =
    reason === 'other' ? otherReason.trim() || 'Other' : reason ? formatClientReturnReason(reason) : '—';

  const setClampedQty = (
    id: string,
    next: number,
    max: number,
    setter: typeof setQuantities,
    hintSetter: typeof setQtyHints
  ) => {
    const exceeded = next > max;
    const clamped = Math.min(max, Math.max(0, next));
    setInvalidField(null);
    setter((prev) => ({ ...prev, [id]: clamped }));
    hintSetter((prev) => {
      if (exceeded) {
        return { ...prev, [id]: `Max is ${max}.` };
      }
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Return items</DialogTitle>
            <DialogDescription>
              {orderNumber} · {clientName}
            </DialogDescription>
          </DialogHeader>

          <ReturnItemsStepper
            currentStep={step}
            completedSteps={completedSteps}
            onStepClick={(nextStep) => {
              if (nextStep <= step) {
                setFormError(null);
                setInvalidField(null);
                setStep(nextStep);
                return;
              }
              for (let current = 0; current < nextStep; current += 1) {
                const error = stepError(current);
                if (error) {
                  setStep(current);
                  revealInvalid(firstInvalidField(current), error);
                  return;
                }
                if (current === 0) {
                  const shortfalls = stockShortfalls();
                  if (shortfalls.length > 0) {
                    setFormError(null);
                    setInvalidField(null);
                    setStockWarning(shortfalls);
                    return;
                  }
                }
              }
              setFormError(null);
              setInvalidField(null);
              setStep(nextStep);
            }}
          />

          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 pt-2">
            <Alert className="border-amber-200 bg-amber-50 text-amber-950">
              <AlertDescription>
                Visual mock with dummy data. Confirm does not save a return or change stock.
              </AlertDescription>
            </Alert>

            {step === 0 && (
              <div className="space-y-3">
                <Accordion
                  type="multiple"
                  value={openReturnBrands}
                  onValueChange={setOpenReturnBrands}
                  className="rounded-md border"
                >
                  {itemsByBrand.map(([brand, brandLines]) => {
                    const brandReturning = brandLines.reduce((sum, line) => sum + (quantities[line.id] || 0), 0);
                    return (
                      <AccordionItem key={brand} value={brand} className="px-3">
                        <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                          <div className="flex w-full items-center justify-between gap-2 pr-2 text-left">
                            <span className="font-semibold text-sm">{brand}</span>
                            <span className="text-xs text-muted-foreground">
                              {brandLines.length} variant{brandLines.length === 1 ? '' : 's'}
                              {brandReturning > 0 ? ` · returning ${brandReturning}` : ''}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          {isMobile ? (
                            <div className="space-y-3 mb-3">
                              {brandLines.map((line) => (
                                <QtyInputCard
                                  key={line.id}
                                  title={line.variantName}
                                  type={line.variantType}
                                  leftLabel="Sold"
                                  leftValue={line.quantity}
                                  rightLabel="Already returned"
                                  rightValue={line.alreadyReturned}
                                  actionTitle="Return now"
                                  actionHint="Enter the number of items you want to return."
                                  value={quantities[line.id] ?? 0}
                                  max={line.remaining}
                                  hint={qtyHints[line.id]}
                                  invalid={invalidField === `return-${line.id}`}
                                  fieldId={`return-${line.id}`}
                                  onValueChange={(next) =>
                                    setClampedQty(line.id, next, line.remaining, setQuantities, setQtyHints)
                                  }
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-md border bg-muted/20 mb-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Variant</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Sold</TableHead>
                                    <TableHead className="text-right">Already returned</TableHead>
                                    <TableHead className="text-right w-28">Return now</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {brandLines.map((line) => (
                                    <TableRow key={line.id}>
                                      <TableCell className="font-medium">{line.variantName}</TableCell>
                                      <TableCell>
                                        <TypeBadge type={line.variantType} />
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                                      <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {line.alreadyReturned}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Input
                                          type="number"
                                          min={0}
                                          max={line.remaining}
                                          value={quantities[line.id] ?? 0}
                                          data-field={`return-${line.id}`}
                                          aria-invalid={invalidField === `return-${line.id}` || undefined}
                                          onChange={(e) => {
                                            const parsed = parseInt(e.target.value, 10);
                                            const next = Number.isNaN(parsed) ? 0 : parsed;
                                            setClampedQty(line.id, next, line.remaining, setQuantities, setQtyHints);
                                          }}
                                          className={cn(
                                            'h-8 w-20 ml-auto text-right',
                                            invalidField === `return-${line.id}` &&
                                              'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
                                          )}
                                        />
                                        {qtyHints[line.id] ? (
                                          <div className="text-[10px] text-destructive mt-0.5 leading-tight">
                                            {qtyHints[line.id]}
                                          </div>
                                        ) : (
                                          <div className="text-[10px] text-muted-foreground mt-0.5">
                                            max {line.remaining}
                                          </div>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pick any SKU of the same brand. Change qty must equal returned qty per brand.
                </p>
                {changeSkusByBrand.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No returned items yet.</p>
                ) : (
                  <Accordion
                    type="multiple"
                    value={openChangeBrands}
                    onValueChange={setOpenChangeBrands}
                    className="rounded-md border"
                  >
                    {changeSkusByBrand.map((group) => {
                      const chosen = group.skus.reduce((sum, sku) => sum + (changeQuantities[sku.id] || 0), 0);
                      const matched = chosen === group.returnedQty;
                      const skuIds = group.skus.map((sku) => sku.id);
                      return (
                        <AccordionItem key={group.brand} value={group.brand} className="px-3">
                          <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                            <div className="flex w-full items-center justify-between gap-2 pr-2 text-left">
                              <span className="font-semibold text-sm">{group.brand}</span>
                              <span className={cn('text-xs tabular-nums', matched ? 'text-muted-foreground' : 'text-destructive')}>
                                change {chosen} / {group.returnedQty} returned
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            {isMobile ? (
                              <div className="space-y-3 mb-3">
                                {group.skus.map((sku: MockChangeItemSku) => {
                                  const skuMax = changeSkuMax(
                                    sku.id,
                                    sku.sellableQty,
                                    group.returnedQty,
                                    skuIds,
                                    changeQuantities
                                  );
                                  return (
                                    <QtyInputCard
                                      key={sku.id}
                                      title={sku.variantName}
                                      type={sku.variantType}
                                      leftLabel="Available"
                                      leftValue={sku.sellableQty}
                                      rightLabel="Brand remaining"
                                      rightValue={Math.max(0, group.returnedQty - chosen)}
                                      actionTitle="Change qty"
                                      actionHint="Enter how many to give as replacement."
                                      value={changeQuantities[sku.id] ?? 0}
                                      max={skuMax}
                                      hint={changeHints[sku.id]}
                                      invalid={invalidField === `change-${sku.id}`}
                                      fieldId={`change-${sku.id}`}
                                      onValueChange={(next) =>
                                        setClampedQty(
                                          sku.id,
                                          next,
                                          skuMax,
                                          setChangeQuantities,
                                          setChangeHints
                                        )
                                      }
                                    />
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-md border bg-muted/20 mb-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Variant</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead className="text-right">Available</TableHead>
                                      <TableHead className="text-right w-28">Change qty</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.skus.map((sku: MockChangeItemSku) => {
                                      const skuMax = changeSkuMax(
                                        sku.id,
                                        sku.sellableQty,
                                        group.returnedQty,
                                        skuIds,
                                        changeQuantities
                                      );
                                      return (
                                        <TableRow key={sku.id}>
                                          <TableCell className="font-medium">{sku.variantName}</TableCell>
                                          <TableCell>
                                            <TypeBadge type={sku.variantType} />
                                          </TableCell>
                                          <TableCell className="text-right tabular-nums">{sku.sellableQty}</TableCell>
                                          <TableCell className="text-right">
                                            <Input
                                              type="number"
                                              min={0}
                                              max={skuMax}
                                              value={changeQuantities[sku.id] ?? 0}
                                              data-field={`change-${sku.id}`}
                                              aria-invalid={invalidField === `change-${sku.id}` || undefined}
                                              onChange={(e) => {
                                                const parsed = parseInt(e.target.value, 10);
                                                const next = Number.isNaN(parsed) ? 0 : parsed;
                                                setClampedQty(
                                                  sku.id,
                                                  next,
                                                  skuMax,
                                                  setChangeQuantities,
                                                  setChangeHints
                                                );
                                              }}
                                              className={cn(
                                                'h-8 w-20 ml-auto text-right',
                                                invalidField === `change-${sku.id}` &&
                                                  'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
                                              )}
                                            />
                                            {changeHints[sku.id] ? (
                                              <div className="text-[10px] text-destructive mt-0.5 leading-tight">
                                                {changeHints[sku.id]}
                                              </div>
                                            ) : (
                                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                                max {skuMax}
                                              </div>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select
                      value={reason}
                      onValueChange={(value) => {
                        setInvalidField(null);
                        setReason(value as ClientReturnReasonOption);
                      }}
                    >
                      <SelectTrigger
                        data-field="reason"
                        aria-invalid={invalidField === 'reason' || undefined}
                        className={cn(
                          invalidField === 'reason' &&
                            'border-destructive ring-1 ring-destructive focus:ring-destructive'
                        )}
                      >
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_RETURN_REASON_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reason === 'other' && (
                      <Input
                        value={otherReason}
                        data-field="other-reason"
                        aria-invalid={invalidField === 'other-reason' || undefined}
                        onChange={(e) => {
                          setInvalidField(null);
                          setOtherReason(e.target.value);
                        }}
                        placeholder="Type the reason"
                        className={cn(
                          invalidField === 'other-reason' &&
                            'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
                        )}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Returned date</Label>
                    <Input
                      type="date"
                      value={returnDate}
                      data-field="return-date"
                      aria-invalid={invalidField === 'return-date' || undefined}
                      onChange={(e) => {
                        setInvalidField(null);
                        setReturnDate(e.target.value);
                      }}
                      className={cn(
                        invalidField === 'return-date' &&
                          'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
                      )}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-return-notes">Notes *</Label>
                  <Textarea
                    id="client-return-notes"
                    value={notes}
                    data-field="notes"
                    aria-invalid={invalidField === 'notes' || undefined}
                    onChange={(e) => {
                      setInvalidField(null);
                      setNotes(e.target.value);
                    }}
                    placeholder="Details for this return"
                    rows={3}
                    className={cn(
                      invalidField === 'notes' &&
                        'border-destructive ring-1 ring-destructive focus-visible:ring-destructive'
                    )}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <div
                  data-field="proof"
                  tabIndex={-1}
                  className={cn(
                    'rounded-md',
                    invalidField === 'proof' && 'ring-1 ring-destructive border border-destructive rounded-lg p-2'
                  )}
                >
                  <MultiProofPhotoField
                    label="Proof photos"
                    value={photos}
                    onChange={(next) => {
                      setInvalidField(null);
                      setPhotos(next);
                    }}
                    emptyTitle="Upload photo"
                    recommendedHint="Upload or take photo"
                  />
                </div>
                <input
                  ref={captureInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    handleCaptureFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => captureInputRef.current?.click()}
                  disabled={photos.length >= 3}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Take photo
                </Button>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Agent signature only. Sign to confirm you are posting this return.
                </p>
                <div className="space-y-2">
                  <Label>Agent signature *</Label>
                  {!agentSignatureDataUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full h-10',
                        invalidField === 'signature' &&
                          'border-destructive ring-1 ring-destructive text-destructive'
                      )}
                      data-field="signature"
                      onClick={() => {
                        setInvalidField(null);
                        setSignatureOpen(true);
                      }}
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
                          onClick={() => setAgentSignatureDataUrl('')}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Clear
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSignatureOpen(true)}>
                          Re-sign
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Order · </span>
                    <span className="font-mono">{orderNumber}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Client · </span>
                    {clientName}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Returned date · </span>
                    {returnDate ? format(new Date(`${returnDate}T00:00:00`), 'MMM d, yyyy') : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Reason · </span>
                    {reasonLabel}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Notes · </span>
                    {notes}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Photos · </span>
                    {photos.length} attached
                  </p>
                  <p>
                    <span className="text-muted-foreground">Agent signature · </span>
                    {agentSignatureDataUrl ? 'Captured' : 'Missing'}
                  </p>
                </div>
                {agentSignatureDataUrl ? (
                  <div className="rounded-md border p-3 bg-muted/20">
                    <p className="text-sm font-semibold mb-2">Agent signature</p>
                    <img
                      src={agentSignatureDataUrl}
                      alt="Agent signature"
                      className="max-h-24 mx-auto bg-white rounded-md"
                    />
                  </div>
                ) : null}

                <p className="text-sm font-semibold">Returned</p>
                {reviewReturnedByBrand.map(([brand, brandLines]) => (
                  <div key={`ret-${brand}`} className="rounded-md border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 text-sm font-semibold">{brand}</div>
                    {isMobile ? (
                      <div className="p-2 space-y-2">
                        {brandLines.map((line) => (
                          <div key={line.id} className="rounded-md border bg-background p-3 flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-sm">{line.variantName}</p>
                              <TypeBadge type={line.variantType} />
                            </div>
                            <p className="font-semibold text-rose-700 tabular-nums">{quantities[line.id]}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Variant</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {brandLines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-medium">{line.variantName}</TableCell>
                              <TableCell>
                                <TypeBadge type={line.variantType} />
                              </TableCell>
                              <TableCell className="text-right font-semibold text-rose-700 tabular-nums">
                                {quantities[line.id]}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))}

                <p className="text-sm font-semibold pt-1">Change item</p>
                {reviewChangeByBrand.map(([brand, brandSkus]) => (
                  <div key={`chg-${brand}`} className="rounded-md border overflow-hidden">
                    <div className="px-3 py-2 bg-muted/50 text-sm font-semibold">{brand}</div>
                    {isMobile ? (
                      <div className="p-2 space-y-2">
                        {brandSkus.map((sku) => (
                          <div key={sku.id} className="rounded-md border bg-background p-3 flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <p className="font-medium text-sm">{sku.variantName}</p>
                              <TypeBadge type={sku.variantType} />
                            </div>
                            <p className="font-semibold text-emerald-700 tabular-nums">{changeQuantities[sku.id]}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Variant</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {brandSkus.map((sku) => (
                            <TableRow key={sku.id}>
                              <TableCell className="font-medium">{sku.variantName}</TableCell>
                              <TableCell>
                                <TypeBadge type={sku.variantType} />
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-700 tabular-nums">
                                {changeQuantities[sku.id]}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-between">
            <Badge variant="outline" className="tabular-nums w-fit">
              Returning {totalReturning} · Changing {totalChanging}
            </Badge>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {step > 0 && (
                <Button variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              {step < LAST_STEP ? (
                <Button onClick={goNext}>Next</Button>
              ) : (
                <Button onClick={handleConfirmReturnClick}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Confirm return
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agent signature</DialogTitle>
            <DialogDescription>Sign below to confirm this client return.</DialogDescription>
          </DialogHeader>
          <SignatureCanvas
            onSave={(dataUrl) => {
              setAgentSignatureDataUrl(dataUrl);
              setSignatureOpen(false);
              setFormError(null);
              setInvalidField(null);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={clientConfirmOpen}
        onOpenChange={(nextOpen) => {
          setClientConfirmOpen(nextOpen);
          if (!nextOpen) setClientNameConfirmInput('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm client return</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p>
                  This return is for{' '}
                  <span className="font-semibold text-foreground">{clientName || 'this client'}</span>
                  {' '}on{' '}
                  <span className="font-mono font-semibold text-foreground">{orderNumber}</span>
                  . Type the client name below to avoid posting against the wrong order.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="client-name-confirm">Client name</Label>
                  <Input
                    id="client-name-confirm"
                    className="text-black"
                    value={clientNameConfirmInput}
                    onChange={(e) => setClientNameConfirmInput(e.target.value)}
                    placeholder={clientName || 'Enter client name'}
                    autoComplete="off"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              disabled={!clientNameMatches}
            >
              Post return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!stockWarning} onOpenChange={(nextOpen) => !nextOpen && setStockWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Not enough stock</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Sellable stock is less than the qty you are returning. Stay on Items and reduce the return, or restock first.</p>
                {stockWarning?.map((row) => (
                  <p key={row.brand} className="tabular-nums">
                    <span className="font-medium text-foreground">{row.brand}</span>
                    {`: returning ${row.returned}, sellable ${row.sellable}`}
                  </p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setStockWarning(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
