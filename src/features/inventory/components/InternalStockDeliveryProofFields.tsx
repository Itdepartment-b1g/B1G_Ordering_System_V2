/**
 * Shared rider + delivery proof + signature fields for internal stock
 * deliver / allocate-remaining / main-allocate flows.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, PenTool, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignatureCanvas } from '@/components/ui/signature-canvas';

export const MAX_INTERNAL_STOCK_PROOF_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_INTERNAL_STOCK_PROOF_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type InternalStockDeliveryProofValue = {
  riderName: string;
  riderPlate: string;
  riderPhotoDataUrl: string;
  riderPhotoName: string;
  proofImageDataUrl: string;
  proofImageName: string;
  signatureDataUrl: string;
};

export type InternalStockDeliveryProofLabels = {
  idPrefix?: string;
  sectionTitle?: string;
  proofLabel?: string;
  proofUploadTitle?: string;
  proofAlt?: string;
  signatureAlt?: string;
  signatureDialogTitle?: string;
  signatureCanvasTitle?: string;
  signatureCanvasDescription?: string;
};

export function emptyInternalStockDeliveryProof(): InternalStockDeliveryProofValue {
  return {
    riderName: '',
    riderPlate: '',
    riderPhotoDataUrl: '',
    riderPhotoName: '',
    proofImageDataUrl: '',
    proofImageName: '',
    signatureDataUrl: '',
  };
}

export function isInternalStockDeliveryProofComplete(
  value: InternalStockDeliveryProofValue
): boolean {
  return (
    !!value.riderName.trim() &&
    !!value.riderPlate.trim() &&
    !!value.riderPhotoDataUrl &&
    !!value.proofImageDataUrl &&
    !!value.signatureDataUrl
  );
}

export function validateInternalStockProofFile(file: File): string | null {
  if (
    !(ACCEPTED_INTERNAL_STOCK_PROOF_TYPES as readonly string[]).includes(file.type)
  ) {
    return 'Use JPG, PNG, WEBP, or GIF.';
  }
  if (file.size > MAX_INTERNAL_STOCK_PROOF_BYTES) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
}

export function readInternalStockProofAsDataUrl(file: File): Promise<string> {
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

/** Controlled proof state with optional reset when `resetKey` becomes true. */
export function useInternalStockDeliveryProof(resetKey?: boolean) {
  const [value, setValue] = useState(emptyInternalStockDeliveryProof);
  const [riderPhotoError, setRiderPhotoError] = useState<string | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  useEffect(() => {
    if (!resetKey) return;
    setValue(emptyInternalStockDeliveryProof());
    setRiderPhotoError(null);
    setProofError(null);
  }, [resetKey]);

  const patch = (partial: Partial<InternalStockDeliveryProofValue>) => {
    setValue((prev) => ({ ...prev, ...partial }));
  };

  const reset = () => {
    setValue(emptyInternalStockDeliveryProof());
    setRiderPhotoError(null);
    setProofError(null);
  };

  return {
    value,
    setValue,
    patch,
    reset,
    isComplete: isInternalStockDeliveryProofComplete(value),
    riderPhotoError,
    setRiderPhotoError,
    proofError,
    setProofError,
  };
}

type ImageUploadFieldProps = {
  label: string;
  emptyTitle: string;
  alt: string;
  dataUrl: string;
  fileName: string;
  error: string | null;
  onPick: (file: File | null) => void;
  onClear: () => void;
};

function ImageUploadField({
  label,
  emptyTitle,
  alt,
  dataUrl,
  fileName,
  error,
  onPick,
  onClear,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />
      {!dataUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
        >
          <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG, WEBP, or GIF · max 5MB
          </p>
        </button>
      ) : (
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">{fileName || alt}</p>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              <Trash2 className="h-4 w-4 mr-1" />
              Remove
            </Button>
          </div>
          <img
            src={dataUrl}
            alt={alt}
            className="max-h-40 mx-auto rounded-md object-contain"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Replace photo
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function InternalStockDeliveryProofFields({
  value,
  onChange,
  riderPhotoError,
  proofError,
  onRiderPhotoError,
  onProofError,
  labels,
}: {
  value: InternalStockDeliveryProofValue;
  onChange: (partial: Partial<InternalStockDeliveryProofValue>) => void;
  riderPhotoError?: string | null;
  proofError?: string | null;
  onRiderPhotoError?: (error: string | null) => void;
  onProofError?: (error: string | null) => void;
  labels?: InternalStockDeliveryProofLabels;
}) {
  const reactId = useId();
  const prefix = labels?.idPrefix || reactId;
  const [signatureOpen, setSignatureOpen] = useState(false);

  const handleImagePick = async (
    file: File | null,
    kind: 'rider' | 'proof'
  ) => {
    const setErr = kind === 'rider' ? onRiderPhotoError : onProofError;
    setErr?.(null);
    if (!file) return;
    const err = validateInternalStockProofFile(file);
    if (err) {
      setErr?.(err);
      return;
    }
    try {
      const dataUrl = await readInternalStockProofAsDataUrl(file);
      if (kind === 'rider') {
        onChange({ riderPhotoDataUrl: dataUrl, riderPhotoName: file.name });
      } else {
        onChange({ proofImageDataUrl: dataUrl, proofImageName: file.name });
      }
    } catch {
      setErr?.('Could not read image file.');
    }
  };

  return (
    <div className="space-y-3">
      {labels?.sectionTitle ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.sectionTitle}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-rider-name`}>Rider name (required)</Label>
          <Input
            id={`${prefix}-rider-name`}
            value={value.riderName}
            onChange={(e) => onChange({ riderName: e.target.value })}
            placeholder="e.g. Juan Dela Cruz"
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-rider-plate`}>Plate number (required)</Label>
          <Input
            id={`${prefix}-rider-plate`}
            value={value.riderPlate}
            onChange={(e) => onChange({ riderPlate: e.target.value })}
            placeholder="e.g. ABC-1234"
            className="h-10"
          />
        </div>
      </div>

      <ImageUploadField
        label="Rider photo (required)"
        emptyTitle="Upload rider photo"
        alt="Rider"
        dataUrl={value.riderPhotoDataUrl}
        fileName={value.riderPhotoName}
        error={riderPhotoError ?? null}
        onPick={(file) => void handleImagePick(file, 'rider')}
        onClear={() => onChange({ riderPhotoDataUrl: '', riderPhotoName: '' })}
      />

      <ImageUploadField
        label={labels?.proofLabel || 'Delivery proof (required)'}
        emptyTitle={labels?.proofUploadTitle || 'Upload delivery / cargo proof'}
        alt={labels?.proofAlt || 'Delivery proof'}
        dataUrl={value.proofImageDataUrl}
        fileName={value.proofImageName}
        error={proofError ?? null}
        onPick={(file) => void handleImagePick(file, 'proof')}
        onClear={() => onChange({ proofImageDataUrl: '', proofImageName: '' })}
      />

      <div className="space-y-2">
        <Label>Signature (required)</Label>
        {!value.signatureDataUrl ? (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10"
            onClick={() => setSignatureOpen(true)}
          >
            <PenTool className="h-4 w-4 mr-2" />
            Add signature
          </Button>
        ) : (
          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <img
              src={value.signatureDataUrl}
              alt={labels?.signatureAlt || 'Signature'}
              className="max-h-28 mx-auto bg-white rounded-md"
            />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ signatureDataUrl: '' })}
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

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {labels?.signatureDialogTitle || 'Sign delivery'}
            </DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title={labels?.signatureCanvasTitle || 'Delivery signature'}
            description={
              labels?.signatureCanvasDescription ||
              'Draw your signature to confirm this delivery'
            }
            onSave={(dataUrl) => {
              onChange({ signatureDataUrl: dataUrl });
              setSignatureOpen(false);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
