import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Loader2, PenTool, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  formatClientReturnReason,
  type ClientReturnReasonOption,
  type MockChangeItemSku,
} from './clientReturnMock';
import {
  CLIENT_ORDER_RETURN_CHANGE_CATALOG_QUERY_KEY,
  CLIENT_ORDER_RETURN_POSTED_QTY_QUERY_KEY,
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  createClientOrderReturn,
  fetchChangeItemCatalog,
  fetchPostedReturnedQtyByItemId,
} from './clientReturnApi';
import { formatVariantType, variantTypeBadgeClass } from './ClientReturnBrandTable';

export type ReturnClientOrderLine = {
  id: string;
  brandId?: string;
  brandName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  variantType?: string;
};

type ReturnClientOrderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  clientName: string;
  items: ReturnClientOrderLine[];
  onSuccess?: () => void;
};

type StockShortfall = {
  brand: string;
  returned: number;
  sellable: number;
};

type ClientReturnKind = 'change' | 'refund';

const RETURN_STEPS = [
  { id: 0, label: 'Return Items' },
  { id: 1, label: 'Change Items' },
  { id: 2, label: 'Reason' },
  { id: 3, label: 'Proof' },
  { id: 4, label: 'Sign' },
  { id: 5, label: 'Review' },
] as const;

const CHANGE_ITEMS_STEP = 1;
const LAST_STEP = RETURN_STEPS[RETURN_STEPS.length - 1].id;

function stepsForReturnType(kind: ClientReturnKind) {
  return kind === 'refund' ? RETURN_STEPS.filter((step) => step.id !== CHANGE_ITEMS_STEP) : [...RETURN_STEPS];
}

function adjacentStep(kind: ClientReturnKind, current: number, direction: 1 | -1) {
  const steps = stepsForReturnType(kind);
  const index = Math.max(0, steps.findIndex((step) => step.id === current));
  return steps[Math.min(steps.length - 1, Math.max(0, index + direction))]?.id ?? current;
}

function formatReturnPeso(amount: number) {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isUnusableCameraLabel(label: string) {
  return /ir\b|infrared|windows hello|tof|depth/i.test(label);
}

async function openCameraStream(mode: 'user' | 'environment'): Promise<MediaStream> {
  const withFacingMode = () =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

  try {
    const bootstrap = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    const usable = cameras.filter((device) => !isUnusableCameraLabel(device.label));
    const pool = usable.length > 0 ? usable : cameras;
    const preferred =
      mode === 'environment'
        ? pool.find((device) => /back|rear|environment/i.test(device.label)) || pool[0]
        : pool.find((device) => /front|user|face/i.test(device.label)) || pool[0];
    const currentId = bootstrap.getVideoTracks()[0]?.getSettings().deviceId;
    if (!preferred?.deviceId || preferred.deviceId === currentId) {
      return bootstrap;
    }
    bootstrap.getTracks().forEach((track) => track.stop());
    return await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: preferred.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch {
    return withFacingMode();
  }
}

function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  const play = () => {
    void video.play().catch(() => undefined);
  };
  video.onloadedmetadata = play;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
}

function ReturnItemsStepper({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
}: {
  steps: { id: number; label: string }[];
  currentStep: number;
  completedSteps: boolean[];
  onStepClick: (step: number) => void;
}) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentStep));
  const lastId = steps[steps.length - 1]?.id;

  return (
    <ol className="flex w-full max-w-3xl mx-auto items-start" aria-label="Return items progress">
      {steps.map((step, index) => {
        const status = index === currentIndex ? 'current' : index < currentIndex ? 'completed' : 'upcoming';
        const canClick =
          index === currentIndex ||
          index < currentIndex ||
          completedSteps.slice(0, index).every(Boolean);
        const isLast = step.id === lastId;

        return (
          <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
            {!isLast ? (
              <span aria-hidden className="absolute left-1/2 top-3 z-0 h-px w-full bg-primary" />
            ) : null}
            <button
              type="button"
              disabled={!canClick}
              onClick={() => {
                if (canClick) onStepClick(step.id);
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
  orderId,
  orderNumber,
  clientName,
  items,
  onSuccess,
}: ReturnClientOrderDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const captureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [step, setStep] = useState(0);
  const [returnType, setReturnType] = useState<ClientReturnKind>('change');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
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
  const [submitting, setSubmitting] = useState(false);

  const itemIdsKey = items.map((item) => item.id).join(',');

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setCameraStarting(false);
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep(0);
      setReturnType('change');
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
      setSubmitting(false);
      revokePackageProofPreviews(photos);
      setPhotos([]);
      return;
    }
    const initial: Record<string, number> = {};
    for (const item of items) {
      if (item.id) initial[item.id] = 0;
    }
    setQuantities(initial);
    setChangeQuantities({});
    setReturnType('change');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the dialog or order lines change
  }, [open, orderId, itemIdsKey]);

  useEffect(() => {
    if (!open || step !== 3) {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop the stream when leaving Proof
  }, [open, step]);

  useEffect(() => {
    if (!showCamera) return;
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream) return;
    attachStreamToVideo(video, stream);
  }, [showCamera]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  const orderBrandIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.brandId).filter((id): id is string => Boolean(id)))),
    [items]
  );

  const { data: postedQtyByItemId = {} } = useQuery({
    queryKey: [CLIENT_ORDER_RETURN_POSTED_QTY_QUERY_KEY, orderId],
    enabled: open && !!orderId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchPostedReturnedQtyByItemId(orderId),
  });

  const { data: liveChangeCatalog = [] } = useQuery({
    queryKey: [
      CLIENT_ORDER_RETURN_CHANGE_CATALOG_QUERY_KEY,
      user?.id,
      user?.company_id,
      orderBrandIds.join('|'),
    ],
    enabled: open && returnType === 'change' && !!user?.id && !!user?.company_id && orderBrandIds.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchChangeItemCatalog(user!.id, user!.company_id as string, orderBrandIds),
  });

  const lines = useMemo(
    () =>
      items.map((item) => {
        const alreadyReturned = Number(postedQtyByItemId[item.id]) || 0;
        const remaining = Math.max(0, item.quantity - alreadyReturned);
        return { ...item, alreadyReturned, remaining, variantType: item.variantType || 'flavor' };
      }),
    [items, postedQtyByItemId]
  );

  const itemsByBrand = useMemo(() => groupByBrandName(lines), [lines]);
  const remainingTotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.remaining, 0),
    [lines]
  );

  const selectedLines = lines.filter((line) => (quantities[line.id] || 0) > 0);
  const totalReturning = selectedLines.reduce((sum, line) => sum + (quantities[line.id] || 0), 0);
  const refundAmount = selectedLines.reduce(
    (sum, line) => sum + (quantities[line.id] || 0) * (Number(line.unitPrice) || 0),
    0
  );
  const visibleSteps = stepsForReturnType(returnType);
  const isChangeReturn = returnType === 'change';

  const returnedByBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of selectedLines) {
      const brand = line.brandName?.trim() || 'Unknown';
      map.set(brand, (map.get(brand) || 0) + (quantities[line.id] || 0));
    }
    return map;
  }, [selectedLines, quantities]);

  const changeCatalog = Array.isArray(liveChangeCatalog) ? liveChangeCatalog : [];

  useEffect(() => {
    if (!open || returnType !== 'change') return;
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
  }, [open, returnType, changeCatalog, returnedByBrand]);

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
    if (returnType !== 'change') return null;
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
    if (currentStep === CHANGE_ITEMS_STEP) return changeError();
    if (currentStep === 2) return reasonError();
    if (currentStep === 3) return proofError();
    if (currentStep === 4) return signatureError();
    return null;
  };

  const completedSteps = visibleSteps.map((item) => {
    if (item.id === 0) return !itemsError();
    if (item.id === CHANGE_ITEMS_STEP) return !changeError();
    if (item.id === 2) return !reasonError();
    if (item.id === 3) return !proofError();
    if (item.id === 4) return !signatureError();
    return false;
  });

  const handleReturnTypeChange = (next: ClientReturnKind) => {
    if (next === returnType) return;
    setReturnType(next);
    setChangeQuantities({});
    setChangeHints({});
    setStockWarning(null);
    setFormError(null);
    setInvalidField(null);
    if (next === 'refund' && step === CHANGE_ITEMS_STEP) {
      setStep(0);
    }
  };

  const goNext = () => {
    if (step === 0) {
      const error = itemsError();
      if (error) {
        revealInvalid(firstInvalidField(0), error);
        return;
      }
      if (isChangeReturn) {
        const shortfalls = stockShortfalls();
        if (shortfalls.length > 0) {
          setFormError(null);
          setInvalidField(null);
          setStockWarning(shortfalls);
          return;
        }
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
    setStep((current) => adjacentStep(returnType, current, 1));
  };

  const goBack = () => {
    setFormError(null);
    setInvalidField(null);
    setStep((current) => adjacentStep(returnType, current, -1));
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

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    if (photos.length >= 3) {
      setFormError('You can attach up to 3 photos.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({
        title: 'Camera not available',
        description: 'This browser cannot open the camera. Upload a photo from files instead.',
        variant: 'destructive',
      });
      captureInputRef.current?.click();
      return;
    }
    setFormError(null);
    setCameraStarting(true);
    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      const stream = await openCameraStream(mode);
      cameraStreamRef.current = stream;
      setFacingMode(mode);
      setShowCamera(true);
      requestAnimationFrame(() => {
        if (videoRef.current && cameraStreamRef.current) {
          attachStreamToVideo(videoRef.current, cameraStreamRef.current);
        }
      });
    } catch (err) {
      cameraStreamRef.current = null;
      setShowCamera(false);
      const denied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      toast({
        title: 'Could not open camera',
        description: denied
          ? 'Allow camera access in the browser, then try Take photo again. You can still upload a file.'
          : 'No camera was found, or it is in use. Upload a photo from files instead.',
        variant: 'destructive',
      });
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhotoFromCamera = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      toast({
        title: 'Camera not ready',
        description: 'Wait a moment for the preview, then capture again.',
      });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast({
            title: 'Could not capture photo',
            description: 'Try again, or upload a file instead.',
            variant: 'destructive',
          });
          return;
        }
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleCaptureFile(file);
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
  };

  const clientNameMatches =
    clientName.trim().length > 0 &&
    clientNameConfirmInput.trim().toLowerCase() === clientName.trim().toLowerCase();

  const handleConfirmReturnClick = () => {
    for (const item of visibleSteps) {
      if (item.id === LAST_STEP) continue;
      const error = stepError(item.id);
      if (error) {
        setStep(item.id);
        revealInvalid(firstInvalidField(item.id), error);
        return;
      }
    }
    setFormError(null);
    setInvalidField(null);
    setClientNameConfirmInput('');
    setClientConfirmOpen(true);
  };

  const handleSubmit = async () => {
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
    if (returnType === 'refund') {
      toast({
        title: 'Refund preview only',
        description: 'Saving and finance approval are not wired yet. You can still walk this flow.',
      });
      setClientConfirmOpen(false);
      return;
    }
    if (!orderId || !user?.company_id) {
      toast({
        title: 'Cannot save return',
        description: 'Missing order or company. Refresh and try again.',
        variant: 'destructive',
      });
      return;
    }
    const missingLineId = selectedLines.find((line) => !line.id);
    if (missingLineId) {
      toast({
        title: 'Cannot save return',
        description: 'This order is missing item ids. Refresh My Orders and try again.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const saved = await createClientOrderReturn({
        companyId: user.company_id,
        clientOrderId: orderId,
        returnDate,
        reason: reason === 'other' ? otherReason.trim() : reason,
        notes: notes.trim(),
        signatureDataUrl: agentSignatureDataUrl,
        items: selectedLines.map((line) => ({
          clientOrderItemId: line.id,
          quantity: quantities[line.id] || 0,
        })),
        changeItems: selectedChangeSkus.map((sku) => ({
          variantId: sku.id,
          quantity: changeQuantities[sku.id] || 0,
        })),
        photos,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURN_POSTED_QTY_QUERY_KEY, orderId] }),
        queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURN_CHANGE_CATALOG_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      onSuccess?.();

      toast({
        title: saved.status === 'posted' ? 'Return posted' : 'Return submitted',
        description:
          saved.status === 'posted'
            ? `${saved.returnNumber} saved and posted against ${orderNumber}.`
            : `${saved.returnNumber} saved. Waiting for team leader approval.`,
      });
      setClientConfirmOpen(false);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save client return';
      toast({
        title: 'Could not save return',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
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
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (submitting && !nextOpen) return;
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          className={cn(
            'max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col',
            showCamera &&
              '![transform:none] !left-4 !right-4 !top-8 !w-auto sm:!left-1/2 sm:!right-auto sm:!w-[min(95vw,48rem)] sm:!ml-[calc(min(95vw,48rem)/-2)]'
          )}
        >
          <DialogHeader>
            <DialogTitle>Return items</DialogTitle>
            <DialogDescription>
              {orderNumber} · {clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Return type</span>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'change', label: 'Change item' },
                  { id: 'refund', label: 'Refund' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleReturnTypeChange(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    returnType === option.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <ReturnItemsStepper
            steps={visibleSteps}
            currentStep={step}
            completedSteps={completedSteps}
            onStepClick={(nextStep) => {
              const fromIndex = visibleSteps.findIndex((item) => item.id === step);
              const toIndex = visibleSteps.findIndex((item) => item.id === nextStep);
              if (toIndex <= fromIndex) {
                setFormError(null);
                setInvalidField(null);
                setStep(nextStep);
                return;
              }
              for (let index = fromIndex; index < toIndex; index += 1) {
                const currentId = visibleSteps[index]?.id;
                if (currentId == null) continue;
                const error = stepError(currentId);
                if (error) {
                  setStep(currentId);
                  revealInvalid(firstInvalidField(currentId), error);
                  return;
                }
                if (currentId === 0 && isChangeReturn) {
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
            {step === 0 && (
              <div className="space-y-3">
                {returnType === 'refund' ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
                    Refund amount is calculated from the returned qty and the original unit price.
                    {totalReturning > 0 ? (
                      <>
                        {' '}
                        Estimated refund:{' '}
                        <span className="font-semibold text-foreground tabular-nums">{formatReturnPeso(refundAmount)}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {remainingTotal <= 0 ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
                    Nothing left to return on this order. Posted returns already used the sold qty.
                  </p>
                ) : null}
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

            {step === CHANGE_ITEMS_STEP && isChangeReturn && (
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
                    emptyTitle="Upload from files"
                    recommendedHint="Select a file, or take a photo"
                  />
                </div>
                <input
                  ref={captureInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleCaptureFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                {showCamera ? (
                  <div className="relative border rounded-lg overflow-hidden bg-black">
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        if (el && cameraStreamRef.current) {
                          attachStreamToVideo(el, cameraStreamRef.current);
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="relative z-0 w-full h-64 bg-black object-cover -scale-x-100"
                    />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={stopCamera}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void startCamera(facingMode === 'user' ? 'environment' : 'user')
                        }
                        className="bg-gray-700 hover:bg-gray-800 text-white"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {facingMode === 'user' ? 'Back' : 'Front'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={capturePhotoFromCamera}
                        className="bg-white hover:bg-gray-100 text-gray-900"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capture
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void startCamera('environment')}
                    disabled={photos.length >= 3 || cameraStarting}
                  >
                    {cameraStarting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4 mr-2" />
                    )}
                    Take photo
                  </Button>
                )}
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
                    <span className="text-muted-foreground">Type · </span>
                    {returnType === 'refund' ? 'Refund' : 'Change item'}
                  </p>
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
                  {returnType === 'refund' ? (
                    <p>
                      <span className="text-muted-foreground">Refund amount · </span>
                      <span className="font-semibold tabular-nums">{formatReturnPeso(refundAmount)}</span>
                    </p>
                  ) : null}
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
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-rose-700 tabular-nums">{quantities[line.id]}</p>
                              {returnType === 'refund' ? (
                                <p className="text-[11px] text-muted-foreground tabular-nums">
                                  {formatReturnPeso((quantities[line.id] || 0) * (Number(line.unitPrice) || 0))}
                                </p>
                              ) : null}
                            </div>
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
                            {returnType === 'refund' ? (
                              <TableHead className="text-right">Amount</TableHead>
                            ) : null}
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
                              {returnType === 'refund' ? (
                                <TableCell className="text-right tabular-nums">
                                  {formatReturnPeso((quantities[line.id] || 0) * (Number(line.unitPrice) || 0))}
                                </TableCell>
                              ) : null}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))}

                {returnType === 'refund' ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-3">
                    Finance will review and approve this refund later. Saving is not enabled yet.
                  </p>
                ) : null}

                {isChangeReturn ? (
                  <>
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
                  </>
                ) : null}
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-between">
            <Badge variant="outline" className="tabular-nums w-fit">
              {returnType === 'refund'
                ? `Returning ${totalReturning} · Refund ${formatReturnPeso(refundAmount)}`
                : `Returning ${totalReturning} · Changing ${totalChanging}`}
            </Badge>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              {step > 0 && (
                <Button variant="outline" onClick={goBack} disabled={submitting}>
                  Back
                </Button>
              )}
              {step < LAST_STEP ? (
                <Button onClick={goNext} disabled={submitting}>Next</Button>
              ) : (
                <Button onClick={handleConfirmReturnClick} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                  {returnType === 'refund' ? 'Confirm refund' : 'Confirm return'}
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
          if (submitting) return;
          setClientConfirmOpen(nextOpen);
          if (!nextOpen) setClientNameConfirmInput('');
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {returnType === 'refund' ? 'Confirm refund return' : 'Confirm client return'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2">
                <p>
                  This {returnType === 'refund' ? 'refund' : 'return'} is for{' '}
                  <span className="font-semibold text-foreground">{clientName || 'this client'}</span>
                  {' '}on{' '}
                  <span className="font-mono font-semibold text-foreground">{orderNumber}</span>
                  {returnType === 'refund' ? (
                    <>
                      {' '}for{' '}
                      <span className="font-semibold text-foreground tabular-nums">{formatReturnPeso(refundAmount)}</span>
                    </>
                  ) : null}
                  . Type the client name below to avoid posting against the wrong order.
                </p>
                {returnType === 'refund' ? (
                  <p>Saving and finance approval are not wired yet. This step is a preview of the confirm flow.</p>
                ) : null}
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
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              disabled={!clientNameMatches || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : returnType === 'refund' ? (
                'Preview refund'
              ) : (
                'Post return'
              )}
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
