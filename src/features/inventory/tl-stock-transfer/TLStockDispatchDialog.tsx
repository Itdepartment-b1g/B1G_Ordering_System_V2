import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  InternalStockDeliveryProofFields,
  isInternalStockDeliveryProofComplete,
  useInternalStockDeliveryProof,
} from '@/features/inventory/components/InternalStockDeliveryProofFields';
import { uploadPackageProofPhotos } from '@/features/orders/utils/uploadPackageProofPhotos';
import type { TLDispatchShortfallReason, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  TL_DISPATCH_SHORTFALL_OPTIONS,
  invalidateTlTransferQueries,
  tlRemainingToDispatch,
} from './tlStockTransferShared';

type DispatchLine = {
  request: TLRequestWithDetails;
  available: number;
  shipQty: number;
  shortfallReason: TLDispatchShortfallReason | '';
};

type Props = {
  open: boolean;
  requests: TLRequestWithDetails[];
  onOpenChange: (open: boolean) => void;
};

function dataUrlToBlob(dataUrl: string, fallbackMime = 'image/png'): Blob {
  const [header, base64Data] = dataUrl.split(',');
  if (!base64Data) throw new Error('Invalid image data');
  const mimeMatch = header?.match(/data:([^;]+);/);
  const mime = mimeMatch?.[1] || fallbackMime;
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function TLStockDispatchDialog({ open, requests, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [lines, setLines] = useState<DispatchLine[]>([]);
  const [notes, setNotes] = useState('');
  const [loadingLines, setLoadingLines] = useState(false);
  const [processing, setProcessing] = useState(false);
  const proof = useInternalStockDeliveryProof(open);

  const first = requests[0] ?? null;

  const requestKey = requests.map((row) => row.id).join(',');

  useEffect(() => {
    if (!open || requests.length === 0 || !user?.id) {
      setStep(1);
      setLines([]);
      setNotes('');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoadingLines(true);
      setStep(1);
      setNotes('');
      const variantIds = [...new Set(requests.map((row) => row.variant_id))];
      const { data } = await supabase
        .from('agent_inventory')
        .select('variant_id, stock')
        .eq('agent_id', user.id)
        .in('variant_id', variantIds);
      if (cancelled) return;
      const stockByVariant = new Map(
        (data || []).map((row) => [row.variant_id as string, Number(row.stock || 0)])
      );
      setLines(
        requests.map((request) => {
          const remaining = tlRemainingToDispatch(request);
          const available = stockByVariant.get(request.variant_id) || 0;
          return {
            request,
            available,
            shipQty: Math.max(0, Math.min(available, remaining)),
            shortfallReason: '',
          };
        })
      );
      setLoadingLines(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, requestKey, requests, user?.id]);

  const totals = useMemo(
    () => ({
      approved: lines.reduce((sum, line) => sum + tlRemainingToDispatch(line.request), 0),
      shipping: lines.reduce((sum, line) => sum + line.shipQty, 0),
    }),
    [lines]
  );

  const validateStep1 = () => {
    if (lines.length === 0) {
      toast({ title: 'No items to dispatch', variant: 'destructive' });
      return false;
    }
    for (const line of lines) {
      const remaining = tlRemainingToDispatch(line.request);
      const label = `${line.request.variant.brand_name} ${line.request.variant.name}`;
      if (line.shipQty <= 0) {
        toast({
          title: 'Quantity required',
          description: `Enter a ship quantity for ${label}.`,
          variant: 'destructive',
        });
        return false;
      }
      if (line.shipQty > remaining || line.shipQty > line.available) {
        toast({
          title: 'Invalid quantity',
          description: `${label} must be between 1 and ${Math.min(remaining, line.available)}.`,
          variant: 'destructive',
        });
        return false;
      }
      if (line.shipQty < remaining && !line.shortfallReason) {
        toast({
          title: 'Reason required',
          description: `Say why you are shipping less than remaining for ${label}.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    return true;
  };

  const handleDispatch = async () => {
    if (!first || !user?.company_id) return;
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!isInternalStockDeliveryProofComplete(proof.value)) {
      toast({
        title: 'Missing info',
        description: 'Rider name, plate number, rider photo, package photos, and signature are required.',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    try {
      const storageBase = `${user.company_id}/tl-transfer/${first.request_number}`;
      const packageUpload = await uploadPackageProofPhotos({
        photos: proof.value.packagePhotos,
        bucket: 'tl-stock-request-signatures',
        pathPrefix: storageBase,
        fileStem: `dispatch_${first.request_number}`,
      });

      const signatureBlob = dataUrlToBlob(proof.value.signatureDataUrl, 'image/png');
      const signaturePath = `${storageBase}/dispatch_signature_${Date.now()}.png`;
      const { error: signatureUploadError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .upload(signaturePath, signatureBlob, { contentType: 'image/png', upsert: false });
      if (signatureUploadError) throw signatureUploadError;
      const { data: signatureUrlData, error: signatureUrlError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .createSignedUrl(signaturePath, 31536000);
      if (signatureUrlError || !signatureUrlData?.signedUrl) {
        throw new Error('Failed to generate signature URL');
      }

      const riderBlob = dataUrlToBlob(proof.value.riderPhotoDataUrl, 'image/jpeg');
      const riderExt = proof.value.riderPhotoName.split('.').pop()?.toLowerCase() || 'jpg';
      const riderPath = `${storageBase}/rider_${Date.now()}.${riderExt}`;
      const { error: riderUploadError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .upload(riderPath, riderBlob, { contentType: riderBlob.type || 'image/jpeg', upsert: false });
      if (riderUploadError) throw riderUploadError;
      const { data: riderUrlData, error: riderUrlError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .createSignedUrl(riderPath, 31536000);
      if (riderUrlError || !riderUrlData?.signedUrl) {
        throw new Error('Failed to generate rider photo URL');
      }

      let reuseRedispatchTdr: string | null = null;
      for (const line of lines) {
        const remaining = tlRemainingToDispatch(line.request);
        const isRedispatch = line.request.received_quantity != null;
        const { data: result, error } = await supabase.rpc('source_tl_dispatch_stock', {
          p_request_id: line.request.id,
          p_dispatched_quantity: line.shipQty,
          p_signature_url: signatureUrlData.signedUrl,
          p_signature_path: signaturePath,
          p_shortfall_reason: line.shipQty < remaining ? line.shortfallReason : null,
          p_notes: notes.trim() || null,
          p_proof_urls: packageUpload.urls,
          p_reuse_tdr: isRedispatch ? reuseRedispatchTdr : null,
        });
        if (error) throw error;
        if (!result?.success) throw new Error(result?.error || 'Failed to dispatch');
        if (isRedispatch && result.tdr_number) reuseRedispatchTdr = result.tdr_number;
      }

      toast({
        title: 'Stock dispatched',
        description: `${totals.shipping} unit(s) left your inventory and are in transit.`,
      });
      proof.reset();
      onOpenChange(false);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      toast({
        title: 'Could not dispatch',
        description: error.message || 'Failed to dispatch stock',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) proof.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-3">
          <DialogTitle>Dispatch / Delivery</DialogTitle>
          <DialogDescription>
            {step === 1
              ? `Step 1 of 2 — confirm quantities${first ? ` for ${first.request_number}` : ''}.`
              : `Step 2 of 2 — rider, signature, and notes${first ? ` for ${first.request_number}` : ''}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          {step === 1 ? (
            <>
              {first?.requester_notes ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Requester notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{first.requester_notes}</p>
                </div>
              ) : null}

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <div className="text-sm font-medium">Quantities to dispatch</div>
                <p className="text-xs text-muted-foreground">
                  You can ship less than remaining. A reason is required for any short line.
                </p>
                {loadingLines ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading remaining qty…
                  </div>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-md border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">Item</TableHead>
                          <TableHead className="h-8 text-xs text-right">To dispatch</TableHead>
                          <TableHead className="h-8 text-xs text-right">Available</TableHead>
                          <TableHead className="h-8 w-24 text-xs text-right">Ship now</TableHead>
                          <TableHead className="h-8 min-w-[140px] text-xs">If less</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line) => {
                          const remaining = tlRemainingToDispatch(line.request);
                          const short = line.shipQty > 0 && line.shipQty < remaining;
                          return (
                            <TableRow key={line.request.id}>
                              <TableCell className="py-2 text-xs">
                                <p className="font-medium">
                                  {line.request.variant.brand_name} · {line.request.variant.name}
                                </p>
                                <p className="text-muted-foreground">{line.request.variant.type}</p>
                              </TableCell>
                              <TableCell className="py-2 text-right text-xs font-semibold tabular-nums">
                                {remaining}
                              </TableCell>
                              <TableCell className="py-2 text-right text-xs tabular-nums">
                                {line.available}
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={Math.min(remaining, line.available)}
                                  className="h-8 text-right"
                                  value={line.shipQty || ''}
                                  onChange={(e) => {
                                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    setLines((prev) =>
                                      prev.map((row) =>
                                        row.request.id === line.request.id
                                          ? {
                                              ...row,
                                              shipQty: Math.min(n, remaining, line.available),
                                            }
                                          : row
                                      )
                                    );
                                  }}
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                {short ? (
                                  <Select
                                    value={line.shortfallReason}
                                    onValueChange={(value) =>
                                      setLines((prev) =>
                                        prev.map((row) =>
                                          row.request.id === line.request.id
                                            ? {
                                                ...row,
                                                shortfallReason: value as TLDispatchShortfallReason,
                                              }
                                            : row
                                        )
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TL_DISPATCH_SHORTFALL_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Total shipping:{' '}
                <span className="font-medium text-foreground">{totals.shipping}</span> of {totals.approved}.
              </p>
            </>
          ) : (
            <>
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                Confirming dispatch of <span className="font-semibold">{totals.shipping}</span> /{' '}
                {totals.approved} unit(s)
                {first ? (
                  <>
                    {' '}
                    for <span className="font-mono font-medium">{first.request_number}</span>
                  </>
                ) : null}
                .
              </div>

              <InternalStockDeliveryProofFields
                mode="full"
                value={proof.value}
                onChange={proof.patch}
                riderPhotoError={proof.riderPhotoError}
                proofError={proof.proofError}
                onRiderPhotoError={proof.setRiderPhotoError}
                onProofError={proof.setProofError}
                labels={{
                  idPrefix: 'tl-dispatch',
                  sectionTitle: 'Rider & signature',
                  proofLabel: 'Package photos (required)',
                  proofUploadTitle: 'Upload package photo',
                  signatureAlt: 'Dispatcher signature',
                  signatureDialogTitle: 'Sign to dispatch',
                  signatureCanvasTitle: 'Dispatcher signature',
                  signatureCanvasDescription: 'Draw your signature to confirm this dispatch',
                }}
              />

              <div className="space-y-2">
                <Label>
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery instructions, gate pass, etc."
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4 sm:gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!validateStep1()) return;
                  setStep(2);
                }}
                disabled={loadingLines || lines.length === 0}
              >
                Next
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={processing}>
                Back
              </Button>
              <Button
                onClick={() => void handleDispatch()}
                disabled={processing || !isInternalStockDeliveryProofComplete(proof.value)}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Dispatching...
                  </>
                ) : (
                  `Dispatch ${totals.shipping} units`
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
