import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Loader2, X } from 'lucide-react';
import {
  getKeyAccountPaymentProofSignedUrl,
  isPaymentProofImage,
  isPaymentProofPdf,
  paymentProofPathIsImage,
  paymentProofPathIsPdf,
} from '@/features/key-accounts/kaPaymentProofUpload';

type PaymentProofPreviewContentProps = {
  previewUrl: string;
  isImage: boolean;
  isPdf: boolean;
  alt?: string;
  maxImageHeightClass?: string;
  iframeHeightClass?: string;
};

export function PaymentProofPreviewContent({
  previewUrl,
  isImage,
  isPdf,
  alt = 'Payment proof preview',
  maxImageHeightClass = 'max-h-[280px]',
  iframeHeightClass = 'h-[280px]',
}: PaymentProofPreviewContentProps) {
  if (isImage) {
    return (
      <div className="border rounded-lg overflow-hidden bg-muted/30 p-2">
        <img
          src={previewUrl}
          alt={alt}
          className={`w-full h-auto ${maxImageHeightClass} object-contain mx-auto rounded-md`}
        />
      </div>
    );
  }

  if (isPdf) {
    return (
      <div className="border rounded-lg overflow-hidden bg-muted/30">
        <iframe src={previewUrl} title={alt} className={`w-full ${iframeHeightClass} bg-white`} />
        <div className="px-3 py-2 border-t text-center">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <FileText className="h-3 w-3" />
            Open PDF in new tab
          </a>
        </div>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">Preview not available for this file type.</p>;
}

type KeyAccountPaymentProofUploadFieldProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  inputId?: string;
  label?: string;
  maxImageHeightClass?: string;
  iframeHeightClass?: string;
};

export function KeyAccountPaymentProofUploadField({
  file,
  onFileChange,
  inputId = 'ka-payment-proof-upload',
  label = 'Payment proof (optional)',
  maxImageHeightClass,
  iframeHeightClass,
}: KeyAccountPaymentProofUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clearFile = () => {
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      {file && previewUrl ? (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={clearFile}>
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <PaymentProofPreviewContent
              previewUrl={previewUrl}
              isImage={isPaymentProofImage(file)}
              isPdf={isPaymentProofPdf(file)}
              maxImageHeightClass={maxImageHeightClass}
              iframeHeightClass={iframeHeightClass}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

type KeyAccountPaymentProofStoredPreviewProps = {
  storagePath: string;
  compact?: boolean;
};

export function KeyAccountPaymentProofStoredPreview({
  storagePath,
  compact = false,
}: KeyAccountPaymentProofStoredPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);

    void (async () => {
      try {
        const url = await getKeyAccountPaymentProofSignedUrl(storagePath);
        if (cancelled) return;
        if (!url) {
          setError('Proof could not be loaded.');
          return;
        }
        setPreviewUrl(url);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Proof could not be loaded.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground ${compact ? 'text-xs py-1' : 'text-sm py-2'}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading proof…
      </div>
    );
  }

  if (error || !previewUrl) {
    return <p className={`text-destructive ${compact ? 'text-xs' : 'text-sm'}`}>{error || 'Proof unavailable.'}</p>;
  }

  return (
    <PaymentProofPreviewContent
      previewUrl={previewUrl}
      isImage={paymentProofPathIsImage(storagePath)}
      isPdf={paymentProofPathIsPdf(storagePath)}
      maxImageHeightClass={compact ? 'max-h-[200px]' : 'max-h-[280px]'}
      iframeHeightClass={compact ? 'h-[200px]' : 'h-[280px]'}
    />
  );
}
