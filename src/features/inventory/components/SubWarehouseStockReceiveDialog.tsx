import { useEffect, useMemo, useState } from 'react';
import { Loader2, PenTool, Truck, X } from 'lucide-react';
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
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  SHORTFALL_REASON_OPTIONS,
  formatShortfallReasonLabel,
  type ShortfallReason,
} from '@/features/orders/deliveryDiscrepancyShared';
import {
  MultiProofPhotoField,
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getItemRemainingQty,
  getRequestDeliveryTotals,
  type SubWarehouseStockRequest,
} from './SubWarehouseStockRequestDialog';

export type ReceiveConfirmLine = {
  variantId: string;
  quantityThisReceive: number;
  shortfallReason?: ShortfallReason;
  shortfallNotes?: string;
};

export type ReceiveConfirmPayload = {
  requestId: string;
  lines: ReceiveConfirmLine[];
  notes: string;
  proofImageDataUrl: string;
  proofImageName?: string;
  packagePhotos: PackageProofPhotoItem[];
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
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [reasonByVariant, setReasonByVariant] = useState<Record<string, ShortfallReason | ''>>({});
  const [otherDetailByVariant, setOtherDetailByVariant] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [packagePhotos, setPackagePhotos] = useState<PackageProofPhotoItem[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false);

  useEffect(() => {
    if (!open || !request) return;
    setLines(buildDrafts(request));
    setReasonByVariant({});
    setOtherDetailByVariant({});
    setNotes('');
    setError(null);
    setPackagePhotos((prev) => {
      revokePackageProofPreviews(prev);
      return [];
    });
    setSignatureDataUrl('');
    setSignatureOpen(false);
  }, [open, request]);

  const shortfallLines = useMemo(() => {
    return lines
      .map((line) => {
        const parsed = parseReceiveInput(line.receivedInput);
        const qty = parsed ?? 0;
        const shortfall = Math.max(0, line.remaining - qty);
        return shortfall > 0
          ? {
              variantId: line.variantId,
              variantName: line.variantName,
              shortfall,
              reason: reasonByVariant[line.variantId] || '',
              otherDetail: otherDetailByVariant[line.variantId] || '',
            }
          : null;
      })
      .filter(Boolean) as Array<{
      variantId: string;
      variantName: string;
      shortfall: number;
      reason: ShortfallReason | '';
      otherDetail: string;
    }>;
  }, [lines, reasonByVariant, otherDetailByVariant]);

  const qtyValidationError = useMemo(() => {
    let anyPositive = false;
    for (const line of lines) {
      const parsed = parseReceiveInput(line.receivedInput);
      if (parsed == null) {
        return `Enter a valid receive quantity for ${line.variantName}.`;
      }
      if (parsed < 0 || parsed > line.remaining) {
        return `${line.variantName}: receive qty must be between 0 and ${line.remaining}.`;
      }
      if (parsed > 0) anyPositive = true;
    }

    if (!anyPositive) {
      return 'Enter at least one line with received greater than 0 to confirm.';
    }

    for (const short of shortfallLines) {
      if (!short.reason) {
        return `Select a shortage reason for ${short.variantName} (${short.shortfall} short).`;
      }
      if (short.reason === 'other' && !short.otherDetail.trim()) {
        return `Describe the shortage for ${short.variantName} when reason is Other.`;
      }
    }

    return null;
  }, [lines, shortfallLines]);

  const proofValidationError = useMemo(() => {
    if (packagePhotos.length < 1) return 'Upload at least one recommended package photo.';
    if (!signatureDataUrl) return 'Add your signature to confirm receive.';
    return null;
  }, [packagePhotos.length, signatureDataUrl]);

  const validationError = qtyValidationError || proofValidationError;
  const hasShortage = shortfallLines.length > 0;

  const handleConfirm = async () => {
    if (!request || submitting) return;
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    await onConfirm({
      requestId: request.id,
      notes: notes.trim(),
      proofImageDataUrl: packagePhotos[0]?.previewUrl || '',
      proofImageName: packagePhotos[0]?.fileName,
      packagePhotos,
      signatureDataUrl,
      lines: lines.map((line) => {
        const quantityThisReceive = parseReceiveInput(line.receivedInput) ?? 0;
        const shortfall = Math.max(0, line.remaining - quantityThisReceive);
        const reason = reasonByVariant[line.variantId];
        const otherDetail = otherDetailByVariant[line.variantId]?.trim() || '';
        return {
          variantId: line.variantId,
          quantityThisReceive,
          ...(shortfall > 0 && reason
            ? {
                shortfallReason: reason,
                ...(reason === 'other' && otherDetail ? { shortfallNotes: otherDetail } : {}),
              }
            : {}),
        };
      }),
    });
  };

  if (!request) return null;

  const requestTotals = getRequestDeliveryTotals(request.items);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-2xl max-h-[90vh] flex flex-col gap-0 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Confirm receive · {request.requestNumber}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 min-h-0 overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              Delivered {requestTotals.delivered} · already received {requestTotals.received} ·
              unlocked remaining {requestTotals.openReceive}.
            </p>

            <div className="space-y-3 rounded-md border p-3">
              {lines.map((line) => {
                const parsed = parseReceiveInput(line.receivedInput);
                const shortfall =
                  parsed == null ? 0 : Math.max(0, line.remaining - parsed);
                return (
                  <div
                    key={line.variantId}
                    className="space-y-2 border-b last:border-0 pb-3 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{line.variantName}</p>
                        <p className="text-xs text-muted-foreground">
                          Remaining unlocked: {line.remaining}
                        </p>
                      </div>
                      <div className="w-28">
                        <Label className="text-xs">Receive</Label>
                        <Input
                          className="h-9"
                          inputMode="numeric"
                          value={line.receivedInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            setLines((prev) =>
                              prev.map((row) =>
                                row.variantId === line.variantId
                                  ? { ...row, receivedInput: value }
                                  : row
                              )
                            );
                          }}
                        />
                      </div>
                    </div>
                    {shortfall > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Shortage reason</Label>
                          <Select
                            value={reasonByVariant[line.variantId] || undefined}
                            onValueChange={(value) =>
                              setReasonByVariant((prev) => ({
                                ...prev,
                                [line.variantId]: value as ShortfallReason,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHORTFALL_REASON_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {formatShortfallReasonLabel(opt.value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {reasonByVariant[line.variantId] === 'other' ? (
                          <div className="space-y-1">
                            <Label className="text-xs">Describe shortage</Label>
                            <Input
                              className="h-9"
                              value={otherDetailByVariant[line.variantId] || ''}
                              onChange={(e) =>
                                setOtherDetailByVariant((prev) => ({
                                  ...prev,
                                  [line.variantId]: e.target.value,
                                }))
                              }
                              placeholder="Required for Other"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>Notes {hasShortage ? '(optional extra)' : '(optional)'}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  hasShortage
                    ? 'Optional extra notes for main (gate notes, carton condition, etc.)'
                    : 'e.g. received complete shipment'
                }
                rows={2}
              />
            </div>

            <MultiProofPhotoField
              label="Package photos"
              value={packagePhotos}
              onChange={(next) => {
                setError(null);
                setPackagePhotos(next);
              }}
              emptyTitle="Upload package photo"
              recommendedHint="Recommended"
              disabled={submitting}
            />

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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSignatureOpen(true)}
                    >
                      Re-sign
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={submitting || !!validationError}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming…
                </>
              ) : (
                'Confirm receive'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign receive</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Receive signature"
            description="Draw your signature to confirm this receive"
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setSignatureOpen(false);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
