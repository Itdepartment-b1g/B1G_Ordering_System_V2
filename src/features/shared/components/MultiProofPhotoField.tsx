/**
 * Multi package / proof photo picker: max N photos (default 3).
 * First slot labeled Recommended; optional 2nd/3rd via Add photo.
 */
import { useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export const MAX_PACKAGE_PROOF_PHOTOS = 3;
export const MAX_PACKAGE_PROOF_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PACKAGE_PROOF_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const PACKAGE_PROOF_ACCEPT = ACCEPTED_PACKAGE_PROOF_TYPES.join(',');

export type PackageProofPhotoItem = {
  /** Local preview (object URL or data URL) — not persisted as source of truth. */
  previewUrl: string;
  fileName: string;
  file: File | null;
};

export function validatePackageProofFile(file: File): string | null {
  if (!(ACCEPTED_PACKAGE_PROOF_TYPES as readonly string[]).includes(file.type)) {
    return 'Use JPG, PNG, WEBP, or GIF.';
  }
  if (file.size > MAX_PACKAGE_PROOF_BYTES) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
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

export function revokePackageProofPreviews(items: PackageProofPhotoItem[]) {
  for (const item of items) {
    if (item.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

type MultiProofPhotoFieldProps = {
  label?: string;
  value: PackageProofPhotoItem[];
  onChange: (next: PackageProofPhotoItem[]) => void;
  max?: number;
  error?: string | null;
  emptyTitle?: string;
  recommendedHint?: string;
  disabled?: boolean;
};

export function MultiProofPhotoField({
  label = 'Package photos',
  value,
  onChange,
  max = MAX_PACKAGE_PROOF_PHOTOS,
  error,
  emptyTitle = 'Upload package photo',
  recommendedHint = 'Recommended',
  disabled = false,
}: MultiProofPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const openPicker = (replaceIndex: number | null = null) => {
    if (disabled) return;
    replaceIndexRef.current = replaceIndex;
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const handleFile = async (file: File | null) => {
    setLocalError(null);
    if (!file) return;
    const err = validatePackageProofFile(file);
    if (err) {
      setLocalError(err);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const nextItem: PackageProofPhotoItem = {
      previewUrl,
      fileName: file.name,
      file,
    };

    const replaceIndex = replaceIndexRef.current;
    replaceIndexRef.current = null;

    if (replaceIndex != null && replaceIndex >= 0 && replaceIndex < value.length) {
      const prev = value[replaceIndex];
      if (prev?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      const next = [...value];
      next[replaceIndex] = nextItem;
      onChange(next);
      return;
    }

    if (value.length >= max) {
      URL.revokeObjectURL(previewUrl);
      setLocalError(`You can upload up to ${max} photos.`);
      return;
    }

    onChange([...value, nextItem]);
  };

  const removeAt = (index: number) => {
    const item = value[index];
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
    onChange(value.filter((_, i) => i !== index));
    setLocalError(null);
  };

  const displayError = error || localError;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {value.length}/{max}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={PACKAGE_PROOF_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      {value.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => openPicker(null)}
          className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors disabled:opacity-50"
        >
          <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground mt-1">{recommendedHint}</p>
          <p className="text-xs text-muted-foreground mt-1">
            JPG, PNG, WEBP, or GIF · max 5MB
          </p>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {value.map((item, index) => (
              <div
                key={`${item.fileName}-${index}`}
                className="rounded-md border p-3 space-y-2 bg-muted/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {index === 0 ? recommendedHint : `Photo ${index + 1}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.fileName || `Package ${index + 1}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <img
                  src={item.previewUrl}
                  alt={`Package photo ${index + 1}`}
                  className="max-h-32 w-full object-contain rounded-md bg-muted/30"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={disabled}
                  onClick={() => openPicker(index)}
                >
                  Replace
                </Button>
              </div>
            ))}
          </div>

          {value.length < max ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={disabled}
              onClick={() => openPicker(null)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add photo
            </Button>
          ) : null}
        </div>
      )}

      {displayError ? (
        <p className="text-xs text-destructive">{displayError}</p>
      ) : null}
    </div>
  );
}
