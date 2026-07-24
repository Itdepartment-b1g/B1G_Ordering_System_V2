import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Loader2 } from 'lucide-react';
import type { PurchaseOrder } from '../types';
import { generateAndOpenReceiveReceiptPdf } from '../dr/generateReceiveReceiptPdf';
import {
  formatShortfallReasonLabel,
  SHORTFALL_REASON_OPTIONS,
  type ShortfallReason,
} from '@/features/orders/deliveryDiscrepancyShared';

const BUYER_PROOF_BUCKET = 'ka-delivery-rider-photos';
const BUYER_SIGNATURE_BUCKET = 'ka-delivery-warehouse-signatures';
const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export type PoReceiveLine = {
  variant_id: string;
  quantity_dispatched: number;
  brand_name?: string | null;
  variant_name?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  purchaseOrderId: string;
  companyId: string;
  drNumber?: string | null;
  lines: PoReceiveLine[];
  /** When set, opens Received Receipt after a successful receive. */
  purchaseOrder?: PurchaseOrder | null;
  warehouseLocationId?: string | null;
  warehouseLocationName?: string | null;
  onSuccess?: () => void;
};

export function PoBuyerReceiveDialog({
  open,
  onOpenChange,
  deliveryId,
  purchaseOrderId,
  companyId,
  drNumber,
  lines,
  purchaseOrder = null,
  warehouseLocationId = null,
  warehouseLocationName = null,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>({});
  const [reasonByVariant, setReasonByVariant] = useState<Record<string, ShortfallReason | ''>>({});
  const [otherDetailByVariant, setOtherDetailByVariant] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, number> = {};
    const reasons: Record<string, ShortfallReason | ''> = {};
    const otherDetails: Record<string, string> = {};
    for (const line of lines) {
      next[line.variant_id] = line.quantity_dispatched;
      reasons[line.variant_id] = '';
      otherDetails[line.variant_id] = '';
    }
    setQtyByVariant(next);
    setReasonByVariant(reasons);
    setOtherDetailByVariant(otherDetails);
    setNotes('');
    setProofFile(null);
    setProofPreview(null);
    setSignatureDataUrl(null);
    setShowSignatureModal(false);
    setStep(1);
    if (proofInputRef.current) proofInputRef.current.value = '';
  }, [open, lines]);

  useEffect(() => {
    if (!proofFile) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  const totalDispatched = useMemo(
    () => lines.reduce((s, l) => s + l.quantity_dispatched, 0),
    [lines]
  );
  const totalReceiving = useMemo(
    () => lines.reduce((s, l) => s + (qtyByVariant[l.variant_id] ?? 0), 0),
    [lines, qtyByVariant]
  );
  const shortfallLines = useMemo(
    () =>
      lines
        .map((line) => {
          const recv = qtyByVariant[line.variant_id] ?? 0;
          const short = Math.max(0, line.quantity_dispatched - recv);
          return short > 0
            ? {
                ...line,
                shortfall: short,
                reason: reasonByVariant[line.variant_id] || '',
                otherDetail: otherDetailByVariant[line.variant_id] || '',
              }
            : null;
        })
        .filter(Boolean) as Array<
        PoReceiveLine & {
          shortfall: number;
          reason: ShortfallReason | '';
          otherDetail: string;
        }
      >,
    [lines, qtyByVariant, reasonByVariant, otherDetailByVariant]
  );
  const totalShortfall = useMemo(
    () => shortfallLines.reduce((s, l) => s + l.shortfall, 0),
    [shortfallLines]
  );

  const handleProofChange = (file: File | null) => {
    if (!file) {
      setProofFile(null);
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      toast({
        title: 'File too large',
        description: 'Proof image must be 5 MB or less.',
        variant: 'destructive',
      });
      return;
    }
    setProofFile(file);
  };

  const validateQtys = () => {
    for (const line of lines) {
      const qty = qtyByVariant[line.variant_id] ?? 0;
      if (qty < 0 || qty > line.quantity_dispatched) {
        toast({
          title: 'Invalid quantity',
          description: 'Received qty must be between 0 and dispatched qty.',
          variant: 'destructive',
        });
        return false;
      }
    }
    for (const short of shortfallLines) {
      const itemLabel =
        [short.brand_name, short.variant_name].filter(Boolean).join(' · ') || 'item';
      if (!short.reason) {
        toast({
          title: 'Shortfall reason required',
          description: `Select a reason for the ${short.shortfall} missing unit(s) of ${itemLabel}.`,
          variant: 'destructive',
        });
        return false;
      }
      if (short.reason === 'other' && !short.otherDetail.trim()) {
        toast({
          title: 'Describe the shortfall',
          description: `Enter a reason for the ${short.shortfall} missing unit(s) of ${itemLabel}.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateQtys()) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    if (!validateQtys()) return;
    if (!proofFile) {
      toast({
        title: 'Proof required',
        description: 'Upload a proof photo of the received items.',
        variant: 'destructive',
      });
      return;
    }
    if (!signatureDataUrl?.trim()) {
      toast({
        title: 'Signature required',
        description: 'Draw your signature to confirm receipt.',
        variant: 'destructive',
      });
      return;
    }
    if (totalShortfall > 0 && !notes.trim()) {
      toast({
        title: 'Notes required',
        description:
          'Add a note explaining the shortfall when receiving less than dispatched.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const uploadTs = Date.now();
      const storageBase = `${companyId}/po/${purchaseOrderId}`;

      const ext = proofFile.name.split('.').pop() || 'jpg';
      const proofPath = `${storageBase}/receive_${deliveryId}_${uploadTs}.${ext}`;

      const base64Data = signatureDataUrl.split(',')[1];
      if (!base64Data) throw new Error('Invalid signature data');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const signatureBlob = new Blob([bytes], { type: 'image/png' });
      const signaturePath = `${storageBase}/receive_signature_${deliveryId}_${uploadTs}.png`;

      const [{ error: uploadErr }, { error: sigUploadErr }] = await Promise.all([
        supabase.storage.from(BUYER_PROOF_BUCKET).upload(proofPath, proofFile, {
          upsert: false,
          contentType: proofFile.type || 'image/jpeg',
        }),
        supabase.storage.from(BUYER_SIGNATURE_BUCKET).upload(signaturePath, signatureBlob, {
          upsert: false,
          contentType: 'image/png',
        }),
      ]);
      if (uploadErr) throw uploadErr;
      if (sigUploadErr) throw sigUploadErr;

      const [{ data: urlData, error: urlErr }, { data: sigUrlData, error: sigUrlErr }] =
        await Promise.all([
          supabase.storage.from(BUYER_PROOF_BUCKET).createSignedUrl(proofPath, 60 * 60 * 24 * 365),
          supabase.storage
            .from(BUYER_SIGNATURE_BUCKET)
            .createSignedUrl(signaturePath, 60 * 60 * 24 * 365),
        ]);
      if (urlErr) throw urlErr;
      if (sigUrlErr) throw sigUrlErr;
      const proofUrl = urlData?.signedUrl;
      const signatureUrl = sigUrlData?.signedUrl;
      if (!proofUrl) throw new Error('Failed to create proof URL');
      if (!signatureUrl) throw new Error('Failed to create signature URL');

      const payload = lines.map((line) => {
        const quantity_received = qtyByVariant[line.variant_id] ?? 0;
        const shortfall = line.quantity_dispatched - quantity_received;
        const reason = reasonByVariant[line.variant_id];
        const otherDetail = otherDetailByVariant[line.variant_id]?.trim() || '';
        return {
          variant_id: line.variant_id,
          quantity_received,
          ...(shortfall > 0 && reason
            ? {
                shortfall_reason: reason,
                ...(reason === 'other' && otherDetail ? { shortfall_notes: otherDetail } : {}),
              }
            : {}),
        };
      });

      const { data, error } = await supabase.rpc('receive_po_delivery', {
        p_delivery_id: deliveryId,
        p_items: payload,
        p_proof_url: proofUrl,
        p_notes: notes.trim() || null,
        p_signature_url: signatureUrl,
        p_signature_path: signaturePath,
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        throw new Error((data as { error?: string })?.error || 'Receive failed');
      }

      const shortfall = totalDispatched - totalReceiving;
      const { logPurchaseOrderEvent } = await import('../purchaseOrderEventsApi');
      // Log receive first, then shortage, so timeline order is Receive → Under investigation.
      await logPurchaseOrderEvent({
        purchaseOrderId,
        eventType: 'receive_confirmed',
        note: notes.trim() || null,
        lines: lines
          .map((line) => ({
            variant_id: line.variant_id,
            quantity: qtyByVariant[line.variant_id] ?? 0,
            variant_name: line.variant_name,
            brand_name: line.brand_name,
          }))
          .filter((l) => l.quantity > 0),
        shortQuantity: shortfall > 0 ? shortfall : 0,
        proofImageUrl: proofUrl,
        signatureUrl: signatureUrl,
        signaturePath: signaturePath,
        deliveryId,
        createdBy: user?.id,
      });
      if (shortfall > 0) {
        const shortageLines = lines
          .map((line) => {
            const quantityReceived = qtyByVariant[line.variant_id] ?? 0;
            const shortageQty = line.quantity_dispatched - quantityReceived;
            const reason = reasonByVariant[line.variant_id];
            if (shortageQty <= 0) return null;
            return {
              variant_id: line.variant_id,
              quantity: shortageQty,
              variant_name: line.variant_name,
              brand_name: line.brand_name,
              reason: reason
                ? formatShortfallReasonLabel(reason, otherDetailByVariant[line.variant_id])
                : 'Under investigation',
            };
          })
          .filter((line): line is NonNullable<typeof line> => line != null);

        await logPurchaseOrderEvent({
          purchaseOrderId,
          eventType: 'shortage_opened',
          note: notes.trim() || null,
          lines: shortageLines,
          shortQuantity: shortfall,
          deliveryId,
          createdBy: user?.id,
          createdAt: new Date(Date.now() + 1000).toISOString(),
        });
      }

      const discrepancyCount =
        Number((data as { discrepancies_opened?: number })?.discrepancies_opened) || 0;
      toast({
        title: shortfall > 0 ? 'Partial receive saved' : 'Items received',
        description:
          shortfall > 0
            ? `Received ${totalReceiving} of ${totalDispatched}. ${discrepancyCount || shortfall} unit shortfall sent to warehouse for investigation.`
            : `All ${totalReceiving} unit(s) received for${drNumber ? ` ${drNumber}` : ' this DR'}.`,
      });

      if (purchaseOrder && warehouseLocationId && drNumber) {
        const receiptLines = lines.map((line) => {
          const quantity_received = qtyByVariant[line.variant_id] ?? 0;
          const shortfallQty = line.quantity_dispatched - quantity_received;
          const reason = reasonByVariant[line.variant_id];
          return {
            brand_name: line.brand_name,
            variant_name: line.variant_name,
            quantity_dispatched: line.quantity_dispatched,
            quantity_received,
            shortfall_reason:
              shortfallQty > 0 && reason
                ? formatShortfallReasonLabel(reason, otherDetailByVariant[line.variant_id])
                : null,
          };
        });
        void generateAndOpenReceiveReceiptPdf(purchaseOrder, {
          drNumber,
          warehouseLocationId,
          warehouseLocationName: warehouseLocationName || 'Warehouse',
          lines: receiptLines,
          receivedAt: new Date().toISOString(),
          buyerNotes: notes.trim() || null,
          buyerSignatureUrl: signatureUrl,
        }).catch((e) => console.warn('[RR] auto-open after receive failed', e));
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast({
        title: 'Receive failed',
        description: e instanceof Error ? e.message : 'Could not save receive',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 space-y-1">
            <DialogTitle>Receive delivery</DialogTitle>
            <DialogDescription>
              {(() => {
                const wh =
                  warehouseLocationName?.trim() ||
                  (warehouseLocationId ? 'Selected warehouse' : null);
                const context = [drNumber || null, wh ? `from ${wh}` : null]
                  .filter(Boolean)
                  .join(' ');
                return step === 1
                  ? `Step 1 of 2 — confirm quantities${context ? ` for ${context}` : ''}.`
                  : `Step 2 of 2 — proof, signature, and notes${context ? ` for ${context}` : ''}.`;
              })()}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
            {step === 1 ? (
              <>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Item</TableHead>
                        <TableHead className="h-8 text-xs text-right">Dispatched</TableHead>
                        <TableHead className="h-8 text-xs text-right w-28">Received</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.variant_id}>
                          <TableCell className="py-2 text-xs">
                            <div className="font-medium">
                              {[line.brand_name, line.variant_name].filter(Boolean).join(' · ') ||
                                line.variant_id.slice(0, 8)}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-right font-semibold">
                            {line.quantity_dispatched}
                          </TableCell>
                          <TableCell className="py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={line.quantity_dispatched}
                              className="h-8 text-right"
                              value={qtyByVariant[line.variant_id] ?? 0}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                const nextQty = Number.isFinite(n) ? n : 0;
                                setQtyByVariant((prev) => ({
                                  ...prev,
                                  [line.variant_id]: nextQty,
                                }));
                                if (nextQty >= line.quantity_dispatched) {
                                  setReasonByVariant((prev) => ({
                                    ...prev,
                                    [line.variant_id]: '',
                                  }));
                                  setOtherDetailByVariant((prev) => ({
                                    ...prev,
                                    [line.variant_id]: '',
                                  }));
                                }
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {shortfallLines.length > 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 space-y-3 p-3">
                    <p className="text-xs font-medium text-foreground">
                      Shortfall ({totalShortfall} unit
                      {totalShortfall === 1 ? '' : 's'}) — warehouse will investigate. Stock is not
                      restored until they choose redeliver or write-off.
                    </p>
                    {shortfallLines.map((line) => (
                      <div key={line.variant_id} className="space-y-1.5">
                        <Label className="text-xs">
                          {[line.brand_name, line.variant_name].filter(Boolean).join(' · ') ||
                            line.variant_id.slice(0, 8)}{' '}
                          <span className="text-muted-foreground font-normal">
                            ({line.shortfall} short)
                          </span>
                        </Label>
                        <Select
                          value={line.reason || undefined}
                          onValueChange={(v) => {
                            const next = v as ShortfallReason;
                            setReasonByVariant((prev) => ({
                              ...prev,
                              [line.variant_id]: next,
                            }));
                            if (next !== 'other') {
                              setOtherDetailByVariant((prev) => ({
                                ...prev,
                                [line.variant_id]: '',
                              }));
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select reason…" />
                          </SelectTrigger>
                          <SelectContent>
                            {SHORTFALL_REASON_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {line.reason === 'other' ? (
                          <Input
                            className="h-8 text-xs"
                            value={line.otherDetail}
                            onChange={(e) =>
                              setOtherDetailByVariant((prev) => ({
                                ...prev,
                                [line.variant_id]: e.target.value,
                              }))
                            }
                            placeholder="Describe the shortfall…"
                            maxLength={500}
                            aria-label="Other shortfall reason"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Total receiving:{' '}
                    <span className="font-medium text-foreground">{totalReceiving}</span> of{' '}
                    {totalDispatched}.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="rounded-md border bg-muted/20 p-3 text-sm space-y-1">
                  <div>
                    Confirming receive of{' '}
                    <span className="font-semibold">{totalReceiving}</span> / {totalDispatched}{' '}
                    unit(s)
                    {drNumber ? (
                      <>
                        {' '}
                        for <span className="font-mono font-medium">{drNumber}</span>
                      </>
                    ) : null}
                    {warehouseLocationName?.trim() ? (
                      <>
                        {' '}
                        from <span className="font-medium">{warehouseLocationName.trim()}</span>
                      </>
                    ) : null}
                    .
                  </div>
                  {shortfallLines.length > 0 ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      {totalShortfall} unit{totalShortfall === 1 ? '' : 's'} will be reported to
                      warehouse for investigation
                      {shortfallLines
                        .map((l) =>
                          l.reason
                            ? ` (${formatShortfallReasonLabel(l.reason, l.otherDetail)})`
                            : ''
                        )
                        .filter(Boolean)
                        .join('')}
                      .
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Proof photo</Label>
                  <Input
                    ref={proofInputRef}
                    type="file"
                    accept={PROOF_ACCEPT}
                    onChange={(e) => handleProofChange(e.target.files?.[0] ?? null)}
                  />
                  {proofPreview ? (
                    <div className="rounded border overflow-hidden bg-muted/30 p-2">
                      <img
                        src={proofPreview}
                        alt="Receive proof preview"
                        className="max-h-40 w-full object-contain mx-auto"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Receiver e-signature</Label>
                  {signatureDataUrl ? (
                    <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                      <img
                        src={signatureDataUrl}
                        alt="Buyer signature"
                        className="max-h-20 mx-auto"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowSignatureModal(true)}
                        >
                          Change signature
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-md p-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        Draw your signature to confirm receipt.
                      </p>
                      <Button type="button" size="sm" onClick={() => setShowSignatureModal(true)}>
                        Add signature
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    Notes{' '}
                    {totalShortfall > 0 ? (
                      <span className="text-destructive font-normal">(required for shortfall)</span>
                    ) : (
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    )}
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={
                      totalShortfall > 0
                        ? 'Explain the shortfall (what happened, gate notes, etc.)…'
                        : 'Damaged units, missing pieces, gate notes…'
                    }
                    rows={2}
                    required={totalShortfall > 0}
                    aria-required={totalShortfall > 0}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2">
            {step === 1 ? (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={goNext} disabled={lines.length === 0}>
                  Next
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                  Back
                </Button>
                <Button
                  onClick={() => void handleSubmit()}
                  disabled={
                    saving ||
                    lines.length === 0 ||
                    !signatureDataUrl ||
                    !proofFile ||
                    (totalShortfall > 0 && !notes.trim())
                  }
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Confirm receive ({totalReceiving})
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receiver signature</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Draw your signature in the area below"
            description="This signature confirms you received the dispatched items for this DR."
            onSave={(sigDataUrl) => {
              setSignatureDataUrl(sigDataUrl);
              setShowSignatureModal(false);
            }}
            onCancel={() => setShowSignatureModal(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
