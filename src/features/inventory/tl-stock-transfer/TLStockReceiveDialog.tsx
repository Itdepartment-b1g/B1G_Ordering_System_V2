import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  MultiProofPhotoField,
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import { uploadPackageProofPhotos } from '@/features/orders/utils/uploadPackageProofPhotos';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  TL_RECEIVE_SHORTFALL_OPTIONS,
  invalidateTlTransferQueries,
  tlDispatchShortfallSummary,
  tlRemainingToReceive,
  type TLReceiveShortfallReason,
} from './tlStockTransferShared';

const PROOF_BUCKET = 'tl-stock-request-signatures';

type Props = {
  open: boolean;
  request: TLRequestWithDetails | null;
  allRequests?: TLRequestWithDetails[];
  onOpenChange: (open: boolean) => void;
};

export function TLStockReceiveDialog({ open, request, allRequests = [], onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [reasonById, setReasonById] = useState<Record<string, TLReceiveShortfallReason | ''>>({});
  const [notes, setNotes] = useState('');
  const [packagePhotos, setPackagePhotos] = useState<PackageProofPhotoItem[]>([]);
  const [packagePhotoError, setPackagePhotoError] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const lines = useMemo(() => {
    if (!request) return [];
    const grouped = (allRequests.length > 0 ? allRequests : [request]).filter(
      (row) => row.request_number === request.request_number
    );
    return (grouped.length > 0 ? grouped : [request]).filter(
      (row) => row.status === 'pending_receipt' && tlRemainingToReceive(row) > 0
    );
  }, [allRequests, request]);

  useEffect(() => {
    if (!open || !request) return;
    setQtyById(
      Object.fromEntries(lines.map((line) => [line.id, tlRemainingToReceive(line)]))
    );
    setReasonById({});
    setNotes('');
    setPackagePhotos((prev) => {
      revokePackageProofPreviews(prev);
      return [];
    });
    setPackagePhotoError(null);
    setSignatureDataUrl(null);
    setShowSignatureModal(false);
    setConfirmOpen(false);
  }, [open, request, lines]);

  const lineRows = useMemo(
    () =>
      lines.map((line) => {
        const remaining = tlRemainingToReceive(line);
        const qty = Math.max(0, Math.min(remaining, Number(qtyById[line.id] ?? remaining)));
        const shortfall = Math.max(0, remaining - qty);
        return { line, remaining, qty, shortfall };
      }),
    [lines, qtyById]
  );

  const totalReceive = lineRows.reduce((sum, row) => sum + row.qty, 0);
  const shortRows = lineRows.filter((row) => row.shortfall > 0);
  const dispatchShortRows = lineRows
    .map((row) => ({ row, summary: tlDispatchShortfallSummary(row.line) }))
    .filter((entry) => entry.summary);
  const dispatcherNotes =
    lines.map((line) => line.source_tl_notes?.trim()).find((note) => note) || null;
  const adminNotes =
    lines.map((line) => line.admin_notes?.trim()).find((note) => note) ||
    request?.admin_notes?.trim() ||
    null;
  const requesterNotes =
    lines.map((line) => line.requester_notes?.trim()).find((note) => note) ||
    request?.requester_notes?.trim() ||
    null;

  const handleClose = (next: boolean) => {
    if (!next) {
      revokePackageProofPreviews(packagePhotos);
      setConfirmOpen(false);
    }
    onOpenChange(next);
  };

  const validateReceive = () => {
    if (!user?.id || !user.company_id || !request || lineRows.length === 0) return false;
    for (const row of lineRows) {
      if (row.qty < 0 || row.qty > row.remaining) {
        toast({
          title: 'Invalid quantity',
          description: `${row.line.variant.name} must be between 0 and ${row.remaining}.`,
          variant: 'destructive',
        });
        return false;
      }
      if (row.shortfall > 0 && !reasonById[row.line.id]) {
        toast({
          title: 'Shortfall reason required',
          description: `Select why ${row.line.variant.name} is short.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    if (shortRows.length > 0 && !notes.trim()) {
      toast({
        title: 'Notes required',
        description: 'Explain the shortfall when receiving less than dispatched.',
        variant: 'destructive',
      });
      return false;
    }
    if (packagePhotos.length < 1) {
      setPackagePhotoError('At least one package photo is required.');
      toast({
        title: 'Package photo required',
        description: 'Upload at least one photo of what you received.',
        variant: 'destructive',
      });
      return false;
    }
    if (!signatureDataUrl?.trim()) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm receipt.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const openConfirm = () => {
    if (!validateReceive()) return;
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    if (!user?.id || !request || !signatureDataUrl || !validateReceive()) return;

    setSaving(true);
    try {
      const companyId = request.company_id || user.company_id;
      const storageBase = `${companyId}/tl-transfer/${request.request_number}`;
      const packageUpload = await uploadPackageProofPhotos({
        photos: packagePhotos,
        bucket: PROOF_BUCKET,
        pathPrefix: storageBase,
        fileStem: `receive_${request.request_number}`,
      });

      const base64Data = signatureDataUrl.split(',')[1];
      if (!base64Data) throw new Error('Invalid signature data');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const signatureBlob = new Blob([bytes], { type: 'image/png' });
      const signaturePath = `${storageBase}/receive_signature_${Date.now()}.png`;

      const { error: sigUploadErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .upload(signaturePath, signatureBlob, {
          upsert: false,
          contentType: 'image/png',
        });
      if (sigUploadErr) throw sigUploadErr;

      const { data: sigUrlData, error: sigUrlErr } = await supabase.storage
        .from(PROOF_BUCKET)
        .createSignedUrl(signaturePath, 60 * 60 * 24 * 365);
      if (sigUrlErr || !sigUrlData?.signedUrl) throw new Error('Failed to create signature URL');

      let incompleteCount = 0;
      let receivedUnits = 0;
      for (const row of lineRows) {
        const { data: result, error } = await supabase.rpc('requester_tl_receive_stock', {
          p_request_id: row.line.id,
          p_signature_url: sigUrlData.signedUrl,
          p_signature_path: signaturePath,
          p_received_quantity: row.qty,
          p_shortfall_reason: row.shortfall > 0 ? reasonById[row.line.id] : null,
          p_shortfall_notes:
            row.shortfall > 0
              ? [
                  formatShortfallReasonLabel(reasonById[row.line.id], notes),
                  notes.trim(),
                ]
                  .filter(Boolean)
                  .join('\n')
              : null,
          p_proof_urls: packageUpload.urls,
        });
        if (error) throw error;
        if (!result?.success) throw new Error(result?.error || 'Failed to receive stock');
        receivedUnits += Number(result.transferred_quantity || row.qty);
        if (result.status === 'incomplete') incompleteCount += 1;
      }

      toast({
        title: incompleteCount > 0 ? 'Received with shortage' : 'Stock received',
        description:
          incompleteCount > 0
            ? `${receivedUnits} units received. ${incompleteCount} item(s) sent to the dispatcher for investigation.`
            : `${receivedUnits} units transferred to your inventory.`,
      });
      invalidateTlTransferQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['tl-transfer-shortages'] });
      handleClose(false);
    } catch (error: any) {
      toast({
        title: 'Could not receive',
        description: error.message || 'Failed to receive stock',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 pr-12 text-left">
            <DialogTitle>Receive transfer</DialogTitle>
            <DialogDescription>
              Confirm what arrived for each item. Package photos and your signature are required
              once. Short items go to the dispatching TL for investigation.
            </DialogDescription>
          </DialogHeader>

          {request ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Transfer #</p>
                  <p className="font-medium font-mono">{request.request_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">TDR</p>
                  <p className="font-medium font-mono">{request.tdr_number || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">From</p>
                  <p className="font-medium">{request.source.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Receiving now</p>
                  <p className="font-medium tabular-nums">
                    {lineRows.length} item{lineRows.length === 1 ? '' : 's'} · {totalReceive} units
                  </p>
                </div>
              </div>

              {(requesterNotes || adminNotes) ? (
                <div className="space-y-2 text-sm">
                  {requesterNotes ? (
                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Request notes</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{requesterNotes}</p>
                    </div>
                  ) : null}
                  {adminNotes ? (
                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">Admin notes</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{adminNotes}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dispatchShortRows.length > 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 leading-snug">
                    <p className="font-medium">Sent less than requested</p>
                    {dispatchShortRows.map(({ row, summary }) => (
                      <p key={row.line.id} className="text-amber-900/90">
                        {row.line.variant.brand_name} · {row.line.variant.name}: {summary?.dispatched ?? '—'} of{' '}
                        {summary?.requested}
                        {summary?.reasonLabel ? ` · ${summary.reasonLabel}` : ''}
                        {dispatcherNotes && dispatchShortRows.length === 1
                          ? ` · ${dispatcherNotes}`
                          : ''}
                      </p>
                    ))}
                    {dispatcherNotes && dispatchShortRows.length > 1 ? (
                      <p className="text-amber-900/80">Note: {dispatcherNotes}</p>
                    ) : null}
                  </div>
                </div>
              ) : dispatcherNotes ? (
                <p className="text-xs text-muted-foreground">Dispatcher note: {dispatcherNotes}</p>
              ) : null}

              <div className="max-h-[40vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px] bg-muted/40">Item</TableHead>
                      <TableHead className="bg-muted/40 text-right">Requested</TableHead>
                      <TableHead className="bg-muted/40 text-right">Dispatched</TableHead>
                      <TableHead className="bg-muted/40 text-right">To receive</TableHead>
                      <TableHead className="w-28 bg-muted/40">Received qty</TableHead>
                      <TableHead className="min-w-[200px] bg-muted/40">If short</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineRows.map((row) => {
                      const dispatchShort = tlDispatchShortfallSummary(row.line);
                      return (
                      <TableRow key={row.line.id}>
                        <TableCell>
                          <p className="font-medium">
                            {row.line.variant.brand_name} · {row.line.variant.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{row.line.variant.type}</p>
                          {dispatchShort?.reasonLabel ? (
                            <p className="mt-1 text-xs text-amber-800">
                              Dispatcher: {dispatchShort.reasonLabel}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.line.requested_quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.line.dispatched_quantity ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {row.remaining}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={row.remaining}
                            className="h-8"
                            value={qtyById[row.line.id] ?? ''}
                            onChange={(e) => {
                              const next = Math.max(
                                0,
                                Math.min(row.remaining, Math.floor(Number(e.target.value) || 0))
                              );
                              setQtyById((prev) => ({ ...prev, [row.line.id]: next }));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {row.shortfall > 0 ? (
                            <Select
                              value={reasonById[row.line.id] || ''}
                              onValueChange={(value) =>
                                setReasonById((prev) => ({
                                  ...prev,
                                  [row.line.id]: value as TLReceiveShortfallReason,
                                }))
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                {TL_RECEIVE_SHORTFALL_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">Full qty</span>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {shortRows.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="receive-notes">Shortfall notes *</Label>
                  <Textarea
                    id="receive-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Describe what arrived vs what was dispatched."
                  />
                </div>
              ) : null}

              <MultiProofPhotoField
                label="Package photos"
                value={packagePhotos}
                onChange={(next) => {
                  setPackagePhotoError(null);
                  setPackagePhotos(next);
                }}
                error={packagePhotoError}
                emptyTitle="Upload package photo"
                recommendedHint="Required"
                disabled={saving}
              />

              <div className="space-y-2">
                <Label>Receiver e-signature</Label>
                {signatureDataUrl ? (
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    <img src={signatureDataUrl} alt="Receiver signature" className="mx-auto max-h-20" />
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
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground">
                      Draw your signature to confirm receipt. Photos alone are not enough.
                    </p>
                    <Button type="button" size="sm" onClick={() => setShowSignatureModal(true)}>
                      Add signature
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleClose(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={openConfirm}
                  disabled={saving || !signatureDataUrl || packagePhotos.length < 1 || lineRows.length === 0}
                >
                  Confirm receipt
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to receive this transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmed units will be added to your inventory from {request?.source.full_name || 'the source TL'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">Transfer</p>
              <p className="font-medium font-mono">{request?.request_number}</p>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">To receive</TableHead>
                    <TableHead className="text-right">Receiving</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineRows.map((row) => (
                    <TableRow key={row.line.id}>
                      <TableCell>
                        <p className="font-medium">
                          {row.line.variant.brand_name} · {row.line.variant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const dispatchShort = tlDispatchShortfallSummary(row.line);
                            const parts: string[] = [];
                            if (dispatchShort?.reasonLabel) {
                              parts.push(
                                `Sent ${dispatchShort.dispatched} of ${dispatchShort.requested} · ${dispatchShort.reasonLabel}`
                              );
                            }
                            if (row.shortfall > 0) {
                              parts.push(
                                `${row.shortfall} arrival short${
                                  reasonById[row.line.id]
                                    ? ` · ${formatShortfallReasonLabel(reasonById[row.line.id])}`
                                    : ''
                                }`
                              );
                            }
                            return parts.length > 0 ? parts.join(' · ') : row.line.variant.type;
                          })()}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.remaining}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground">
              {lineRows.length} item{lineRows.length === 1 ? '' : 's'} · {totalReceive} units receiving
              {shortRows.length > 0 ? ` · ${shortRows.length} short` : ''}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Receiving...
                </>
              ) : (
                'Yes, receive transfer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign for receipt</DialogTitle>
            <DialogDescription>Sign to confirm the quantities you received.</DialogDescription>
          </DialogHeader>
          <SignatureCanvas
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setShowSignatureModal(false);
            }}
            onCancel={() => setShowSignatureModal(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
