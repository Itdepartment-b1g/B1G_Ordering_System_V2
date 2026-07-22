import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Expand, FileText, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  onImageClick?: () => void;
};

export function PaymentProofPreviewContent({
  previewUrl,
  isImage,
  isPdf,
  alt = 'Payment proof preview',
  maxImageHeightClass = 'max-h-[280px]',
  iframeHeightClass = 'h-[280px]',
  onImageClick,
}: PaymentProofPreviewContentProps) {
  if (isImage) {
    const image = (
      <img
        src={previewUrl}
        alt={alt}
        className={`w-full h-auto ${maxImageHeightClass} object-contain mx-auto rounded-md`}
      />
    );

    if (onImageClick) {
      return (
        <button
          type="button"
          className="block w-full border rounded-lg overflow-hidden bg-muted/30 p-2 cursor-pointer hover:opacity-90 transition-opacity"
          onClick={onImageClick}
          title="View full size"
        >
          {image}
        </button>
      );
    }

    return <div className="border rounded-lg overflow-hidden bg-muted/30 p-2">{image}</div>;
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
  const { toast } = useToast();
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

  const handleFileChange = (selected: File | null) => {
    if (!selected) {
      onFileChange(null);
      return;
    }
    if (!isPaymentProofImage(selected)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Payment proof must be an image (JPEG, PNG, WebP, or GIF).',
      });
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }
    onFileChange(selected);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
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
  label?: string;
  showViewFull?: boolean;
};

export function KeyAccountPaymentProofStoredPreview({
  storagePath,
  compact = false,
  label = 'Payment proof',
  showViewFull = true,
}: KeyAccountPaymentProofStoredPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);

  const isImage = paymentProofPathIsImage(storagePath);
  const isPdf = paymentProofPathIsPdf(storagePath);
  const canViewFull = showViewFull && isImage;

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
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          {canViewFull ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setFullOpen(true)}
            >
              <Expand className="h-3.5 w-3.5 mr-1" />
              View full
            </Button>
          ) : null}
        </div>
        <PaymentProofPreviewContent
          previewUrl={previewUrl}
          isImage={isImage}
          isPdf={isPdf}
          maxImageHeightClass={compact ? 'max-h-[200px]' : 'max-h-[280px]'}
          iframeHeightClass={compact ? 'h-[200px]' : 'h-[280px]'}
          onImageClick={canViewFull ? () => setFullOpen(true) : undefined}
        />
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <div className="rounded-md border bg-muted/20 overflow-auto max-h-[80vh] flex items-center justify-center p-2">
              <img
                src={previewUrl}
                alt={label}
                className="max-w-full max-h-[75vh] w-auto h-auto object-contain"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
