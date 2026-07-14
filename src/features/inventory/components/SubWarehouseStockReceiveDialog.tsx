import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, PenTool, Trash2, Truck, X } from 'lucide-react';
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
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getItemRemainingQty,
  getRequestDeliveryTotals,
  type SubWarehouseStockRequest,
  type SubWarehouseStockRequestItem,
} from './SubWarehouseStockRequestDialog';

const MAX_PROOF_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export type ReceiveConfirmLine = {
  variantId: string;
  quantityThisReceive: number;
};

export type ReceiveConfirmPayload = {
  requestId: string;
  lines: ReceiveConfirmLine[];
  notes: string;
  proofImageDataUrl: string;
  proofImageName?: string;
  signatureDataUrl: string;
};

type LineDraft = {
  variantId: string;
  variantName: string;
  deliveredQuantity: number;
  alreadyReceived: number;
  remaining: number;
  receivedInput: string;
};

function buildDrafts(request: SubWarehouseStockRequest): LineDraft[] {
  return request.items
    .map((item) => {
      const deliveredQuantity = getItemDeliveredQty(item);
      const alreadyReceived = getItemReceivedQty(item);
      const remaining = getItemRemainingQty(item);
      return {
        variantId: item.variantId,
        variantName: item.variantName,
        deliveredQuantity,
        alreadyReceived,
        remaining,
        receivedInput: String(remaining),
      };
    })
    .filter((line) => line.remaining > 0);
}

function parseReceiveInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image'));
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

type SubWarehouseStockReceiveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: SubWarehouseStockRequest | null;
  submitting?: boolean;
  onConfirm: (payload: ReceiveConfirmPayload) => void | Promise<void>;
};

export function SubWarehouseStockReceiveDialog({
  open,
  onOpenChange,
  request,
  submitting = false,
  onConfirm,
}: SubWarehouseStockReceiveDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');
  const [proofImageName, setProofImageName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false);

  useEffect(() => {
    if (!open || !request) return;
    setLines(buildDrafts(request));
    setNotes('');
    setError(null);
    setProofImageDataUrl('');
    setProofImageName('');
    setSignatureDataUrl('');
    setSignatureOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, request]);

  const totals = useMemo(() => {
    let delivered = 0;
    let thisReceive = 0;
    let remainingCap = 0;
    for (const line of lines) {
      delivered += line.deliveredQuantity;
      remainingCap += line.remaining;
      const parsed = parseReceiveInput(line.receivedInput);
      if (parsed != null) thisReceive += parsed;
    }
    return { delivered, thisReceive, remainingCap };
  }, [lines]);

  const qtyValidationError = useMemo(() => {
    if (lines.length === 0) return 'Nothing left to receive on this request.';

    let anyPositive = false;
    let hasShortage = false;
    for (const line of lines) {
      const parsed = parseReceiveInput(line.receivedInput);
      if (parsed == null) {
        return `${line.variantName}: enter a whole number (0 or more).`;
      }
      if (parsed < 0) {
        return `${line.variantName}: received cannot be negative.`;
      }
      if (parsed > line.remaining) {
        return `${line.variantName}: received cannot exceed remaining (${line.remaining}).`;
      }
      if (parsed > 0) anyPositive = true;
      if (parsed < line.remaining) hasShortage = true;
    }

    if (!anyPositive) {
      return 'Enter at least one line with received greater than 0 to confirm.';
    }

    if (hasShortage && !notes.trim()) {
      return 'Notes are required when received quantity is less than delivered (missing qty).';
    }

    return null;
  }, [lines, notes]);

  const proofValidationError = useMemo(() => {
    if (!proofImageDataUrl) return 'Upload a proof photo of the received stock.';
    if (!signatureDataUrl) return 'Add your signature to confirm receive.';
    return null;
  }, [proofImageDataUrl, signatureDataUrl]);

  const validationError = qtyValidationError || proofValidationError;

  const hasShortage = useMemo(() => {
    return lines.some((line) => {
      const parsed = parseReceiveInput(line.receivedInput);
      return parsed != null && parsed < line.remaining;
    });
  }, [lines]);

  const handleProofFileChange = async (file: File | null) => {
    setError(null);
    if (!file) return;

    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      setError('Proof photo must be JPG, PNG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_PROOF_IMAGE_BYTES) {
      setError('Proof photo must be 5MB or smaller.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProofImageDataUrl(dataUrl);
      setProofImageName(file.name);
    } catch {
      setError('Could not read the selected image.');
    }
  };

  const clearProofImage = () => {
    setProofImageDataUrl('');
    setProofImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError(null);
  };

  const handleConfirm = async () => {
    if (!request || submitting) return;
    if (validationError) {
      setError(validationError);
      return;
    }

    const confirmLines: ReceiveConfirmLine[] = lines.map((line) => ({
      variantId: line.variantId,
      quantityThisReceive: parseReceiveInput(line.receivedInput) ?? 0,
    }));

    await onConfirm({
      requestId: request.id,
      lines: confirmLines,
      notes: notes.trim(),
      proofImageDataUrl,
      proofImageName: proofImageName || undefined,
      signatureDataUrl,
    });
  };

  const updateLineInput = (variantId: string, value: string) => {
    setError(null);
    setLines((prev) =>
      prev.map((line) => (line.variantId === variantId ? { ...line, receivedInput: value } : line))
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {request?.status === 'partially_received'
                ? `Confirm partial receive${request ? ` — ${request.requestNumber}` : ''}`
                : `Confirm receive${request ? ` — ${request.requestNumber}` : ''}`}
            </DialogTitle>
            <p className="text-sm text-muted-foreground font-normal pt-1">
              {request?.status === 'partially_received' ? (
                <>
                  Enter received quantities for the unlocked top-up, attach proof, and sign.
                  {totals.remainingCap > 0 && request ? (
                    <>
                      {' '}
                      <span className="font-medium text-foreground tabular-nums">
                        Unlocked {totals.remainingCap} of short{' '}
                        {getRequestDeliveryTotals(request.items).short}
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                'Enter received quantities, attach a proof photo, and sign to confirm.'
              )}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border divide-y">
              <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_5.5rem_5.5rem] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                <span>SKU</span>
                <span className="text-right">Delivered</span>
                <span className="text-right">Received</span>
              </div>
              {lines.map((line) => (
                <div
                  key={line.variantId}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_5.5rem_5.5rem] gap-2 sm:gap-3 px-3 py-3 items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{line.variantName}</p>
                    <p className="text-xs text-muted-foreground">
                      Delivered {line.deliveredQuantity}
                      {line.alreadyReceived > 0 ? ` · Already received ${line.alreadyReceived}` : ''}
                      {` · Unlocked to receive ${line.remaining}`}
                    </p>
                  </div>
                  <div className="flex sm:block items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground sm:hidden">Delivered from Main</span>
                    <p className="text-sm tabular-nums text-right font-medium">{line.deliveredQuantity}</p>
                  </div>
                  <div className="flex sm:block items-center justify-between gap-2">
                    <Label
                      htmlFor={`recv-${line.variantId}`}
                      className="text-xs text-muted-foreground sm:sr-only"
                    >
                      Received
                    </Label>
                    <Input
                      id={`recv-${line.variantId}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={line.remaining}
                      step={1}
                      className="h-9 text-right tabular-nums"
                      value={line.receivedInput}
                      onChange={(e) => updateLineInput(line.variantId, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm space-y-1">
              <p>
                This confirm:{' '}
                <span className="font-medium tabular-nums">{totals.thisReceive}</span>
                {' / '}
                <span className="tabular-nums">{totals.remainingCap}</span> remaining
              </p>
              <p className="text-xs text-muted-foreground">
                Received cannot exceed remaining for each SKU. Shortage leaves the request as
                partially received until main allocates the rest.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sw-receive-notes">
                Notes
                {hasShortage ? (
                  <span className="text-destructive"> (required — missing qty)</span>
                ) : (
                  <span className="text-muted-foreground font-normal"> (optional)</span>
                )}
              </Label>
              <Textarea
                id="sw-receive-notes"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setError(null);
                }}
                placeholder={
                  hasShortage
                    ? 'Required: explain missing/short qty (e.g. 5 units damaged or not in carton)'
                    : 'e.g. received complete shipment'
                }
                rows={2}
                aria-required={hasShortage}
              />
              {hasShortage && !notes.trim() ? (
                <p className="text-xs text-amber-800">
                  You entered less than remaining on at least one SKU. Add a note before confirming.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Proof photo (required)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void handleProofFileChange(e.target.files?.[0] ?? null)}
              />
              {!proofImageDataUrl ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                >
                  <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Upload receive proof</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, or GIF · max 5MB</p>
                </button>
              ) : (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {proofImageName || 'Proof image'}
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={clearProofImage}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                  <img
                    src={proofImageDataUrl}
                    alt="Receive proof"
                    className="max-h-48 mx-auto rounded-md object-contain"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace photo
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Signature (required)</Label>
              {!signatureDataUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSignatureOpen(true)}
                >
                  <PenTool className="h-4 w-4 mr-2" />
                  Add signature
                </Button>
              ) : (
                <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                  <img
                    src={signatureDataUrl}
                    alt="Receiver signature"
                    className="max-h-28 mx-auto bg-white rounded-md"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSignatureDataUrl('')}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSignatureOpen(true)}>
                      Re-sign
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By signing, you confirm the quantities above were received at your sub-warehouse.
                  </p>
                </div>
              )}
            </div>

            {(error || validationError) && (
              <p className="text-sm text-destructive">{error || validationError}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!!validationError || submitting} onClick={() => void handleConfirm()}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : request?.status === 'partially_received' ? (
                'Confirm partial receive'
              ) : (
                'Confirm receive'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to confirm receive</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Receiver signature"
            description="Draw your signature to confirm this receipt"
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setSignatureOpen(false);
              setError(null);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Apply a receive confirm onto request items (local mock). */
export function applyReceiveConfirmToItems(
  items: SubWarehouseStockRequestItem[],
  lines: ReceiveConfirmLine[]
): SubWarehouseStockRequestItem[] {
  const qtyByVariant = new Map(lines.map((line) => [line.variantId, line.quantityThisReceive]));
  return items.map((item) => {
    const add = qtyByVariant.get(item.variantId) ?? 0;
    if (add <= 0) return item;
    const nextReceived = Math.min(getItemDeliveredQty(item), getItemReceivedQty(item) + add);
    const nextOpen = Math.max(0, (item.openReceiveQuantity ?? 0) - add);
    return {
      ...item,
      receivedQuantity: nextReceived,
      openReceiveQuantity: nextOpen,
    };
  });
}
