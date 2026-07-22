import { useEffect, useRef, useState } from 'react';
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
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Loader2 } from 'lucide-react';
import type { PoReceiveLine } from './PoBuyerReceiveDialog';

const CANCEL_PROOF_BUCKET = 'ka-delivery-rider-photos';
const CANCEL_SIGNATURE_BUCKET = 'ka-delivery-warehouse-signatures';
const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deliveryId: string;
  purchaseOrderId: string;
  companyId: string;
  drNumber?: string | null;
  lines: PoReceiveLine[];
  warehouseLocationName?: string | null;
  onSuccess?: () => void;
};

export function PoBuyerCancelDialog({
  open,
  onOpenChange,
  deliveryId,
  purchaseOrderId,
  companyId,
  drNumber,
  lines,
  warehouseLocationName = null,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const wh = warehouseLocationName?.trim() || null;
  const context = [drNumber || null, wh ? `from ${wh}` : null].filter(Boolean).join(' ');
  const totalUnits = lines.reduce((s, l) => s + l.quantity_dispatched, 0);

  useEffect(() => {
    if (!open) return;
    setNotes('');
    setProofFile(null);
    setProofPreview(null);
    setSignatureDataUrl(null);
    setShowSignatureModal(false);
    if (proofInputRef.current) proofInputRef.current.value = '';
  }, [open, deliveryId]);

  useEffect(() => {
    if (!proofFile) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

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

  const handleSubmit = async () => {
    if (!user?.id) {
      toast({ title: 'Not signed in', variant: 'destructive' });
      return;
    }
    if (!notes.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add notes explaining why this DR is being refused.',
        variant: 'destructive',
      });
      return;
    }
    if (!proofFile) {
      toast({
        title: 'Proof required',
        description: 'Upload a proof photo for the cancellation.',
        variant: 'destructive',
      });
      return;
    }
    if (!signatureDataUrl?.trim()) {
      toast({
        title: 'Signature required',
        description: 'Draw your signature to confirm refusal of this DR.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const uploadTs = Date.now();
      const storageBase = `${companyId}/po/${purchaseOrderId}`;
      const ext = proofFile.name.split('.').pop() || 'jpg';
      const proofPath = `${storageBase}/cancel_${deliveryId}_${uploadTs}.${ext}`;

      const base64Data = signatureDataUrl.split(',')[1];
      if (!base64Data) throw new Error('Invalid signature data');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const signatureBlob = new Blob([bytes], { type: 'image/png' });
      const signaturePath = `${storageBase}/cancel_signature_${deliveryId}_${uploadTs}.png`;

      const [{ error: uploadErr }, { error: sigUploadErr }] = await Promise.all([
        supabase.storage.from(CANCEL_PROOF_BUCKET).upload(proofPath, proofFile, {
          upsert: false,
          contentType: proofFile.type || 'image/jpeg',
        }),
        supabase.storage.from(CANCEL_SIGNATURE_BUCKET).upload(signaturePath, signatureBlob, {
          upsert: false,
          contentType: 'image/png',
        }),
      ]);
      if (uploadErr) throw uploadErr;
      if (sigUploadErr) throw sigUploadErr;

      const [{ data: urlData, error: urlErr }, { data: sigUrlData, error: sigUrlErr }] =
        await Promise.all([
          supabase.storage.from(CANCEL_PROOF_BUCKET).createSignedUrl(proofPath, 60 * 60 * 24 * 365),
          supabase.storage
            .from(CANCEL_SIGNATURE_BUCKET)
            .createSignedUrl(signaturePath, 60 * 60 * 24 * 365),
        ]);
      if (urlErr) throw urlErr;
      if (sigUrlErr) throw sigUrlErr;
      const proofUrl = urlData?.signedUrl;
      const signatureUrl = sigUrlData?.signedUrl;
      if (!proofUrl) throw new Error('Failed to create proof URL');
      if (!signatureUrl) throw new Error('Failed to create signature URL');

      const { data, error } = await supabase.rpc('cancel_po_delivery', {
        p_delivery_id: deliveryId,
        p_proof_url: proofUrl,
        p_signature_url: signatureUrl,
        p_signature_path: signaturePath,
        p_notes: notes.trim(),
      });
      if (error) throw error;
      if (!(data as { success?: boolean })?.success) {
        throw new Error((data as { error?: string })?.error || 'Cancel failed');
      }

      toast({
        title: 'DR cancelled',
        description: `${drNumber || 'Delivery'} refused. ${totalUnits} unit(s) returned to warehouse for another dispatch.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast({
        title: 'Cancel failed',
        description: e instanceof Error ? e.message : 'Could not cancel delivery',
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
            <DialogTitle>Refuse / cancel delivery</DialogTitle>
            <DialogDescription>
              Refuse this DR{context ? ` (${context})` : ''}. All dispatched qty returns to warehouse
              stock so it can be shipped again.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-4">
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              Returning{' '}
              <span className="font-semibold">{totalUnits}</span> unit(s)
              {drNumber ? (
                <>
                  {' '}
                  for <span className="font-mono font-medium">{drNumber}</span>
                </>
              ) : null}
              {wh ? (
                <>
                  {' '}
                  from <span className="font-medium">{wh}</span>
                </>
              ) : null}
              .
            </div>

            {lines.length > 0 ? (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8 text-xs">Item</TableHead>
                      <TableHead className="h-8 text-xs text-right">Dispatched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.variant_id}>
                        <TableCell className="py-2 text-xs font-medium">
                          {[line.brand_name, line.variant_name].filter(Boolean).join(' · ') ||
                            line.variant_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-right font-semibold">
                          {line.quantity_dispatched}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Reason / notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why is this DR being refused?"
                rows={2}
              />
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
                    alt="Cancel proof preview"
                    className="max-h-40 w-full object-contain mx-auto"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Buyer e-signature</Label>
              {signatureDataUrl ? (
                <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                  <img src={signatureDataUrl} alt="Cancel signature" className="max-h-20 mx-auto" />
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
                    Sign to confirm you refuse this delivery.
                  </p>
                  <Button type="button" size="sm" onClick={() => setShowSignatureModal(true)}>
                    Add signature
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleSubmit()}
              disabled={saving || lines.length === 0 || !signatureDataUrl || !proofFile || !notes.trim()}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm cancel ({totalUnits})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cancel signature</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Draw your signature in the area below"
            description="This signature confirms you refuse this dispatched DR and return stock to the warehouse."
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
