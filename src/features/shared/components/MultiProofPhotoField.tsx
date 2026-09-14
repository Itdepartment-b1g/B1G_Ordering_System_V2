/**
 * Multi package / proof photo picker: max N photos (default 3).
 * Optional camera capture (getUserMedia + file capture fallback).
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
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

function isUnusableCameraLabel(label: string) {
  return /ir\b|infrared|windows hello|tof|depth/i.test(label);
}

async function openCameraStream(mode: 'user' | 'environment'): Promise<MediaStream> {
  const withFacingMode = () =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

  try {
    const bootstrap = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    const usable = cameras.filter((device) => !isUnusableCameraLabel(device.label));
    const pool = usable.length > 0 ? usable : cameras;
    const preferred =
      mode === 'environment'
        ? pool.find((device) => /back|rear|environment/i.test(device.label)) || pool[0]
        : pool.find((device) => /front|user|face/i.test(device.label)) || pool[0];
    const currentId = bootstrap.getVideoTracks()[0]?.getSettings().deviceId;
    if (!preferred?.deviceId || preferred.deviceId === currentId) {
      return bootstrap;
    }
    bootstrap.getTracks().forEach((track) => track.stop());
    return await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: preferred.deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch {
    return withFacingMode();
  }
}

function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream) {
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  const play = () => {
    void video.play().catch(() => undefined);
  };
  video.onloadedmetadata = play;
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
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
  /** When true, show Take photo (camera) in addition to Choose file. */
  enableCamera?: boolean;
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
  enableCamera = false,
}: MultiProofPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setShowCamera(false);
  };

  useEffect(() => {
    if (disabled) stopCamera();
  }, [disabled]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  const openPicker = (replaceIndex: number | null = null) => {
    if (disabled) return;
    replaceIndexRef.current = replaceIndex;
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const openCapturePicker = () => {
    if (disabled) return;
    replaceIndexRef.current = null;
    if (captureInputRef.current) {
      captureInputRef.current.value = '';
      captureInputRef.current.click();
    }
  };

  const handleFile = async (file: File | null, fromCapture = false) => {
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
      fileName: fromCapture && !file.name?.startsWith('capture')
        ? `capture-${Date.now()}.jpg`
        : file.name || `proof-${Date.now()}.jpg`,
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

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    if (disabled) return;
    if (value.length >= max) {
      setLocalError(`You can upload up to ${max} photos.`);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError('Camera not available. Choose a file or use Take photo on mobile.');
      openCapturePicker();
      return;
    }
    setLocalError(null);
    setCameraStarting(true);
    try {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      const stream = await openCameraStream(mode);
      cameraStreamRef.current = stream;
      setFacingMode(mode);
      setShowCamera(true);
      requestAnimationFrame(() => {
        if (videoRef.current && cameraStreamRef.current) {
          attachStreamToVideo(videoRef.current, cameraStreamRef.current);
        }
      });
    } catch (err) {
      cameraStreamRef.current = null;
      setShowCamera(false);
      const denied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setLocalError(
        denied
          ? 'Allow camera access, then try again — or choose a file.'
          : 'Could not open camera. Choose a file instead.'
      );
      openCapturePicker();
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhotoFromCamera = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setLocalError('Camera not ready. Wait a moment, then capture again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setLocalError('Could not capture photo. Try again or choose a file.');
          return;
        }
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        void handleFile(file, true);
        stopCamera();
      },
      'image/jpeg',
      0.9
    );
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
      {enableCamera ? (
        <input
          ref={captureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null, true);
            e.target.value = '';
          }}
        />
      ) : null}

      {value.length === 0 && !showCamera ? (
        enableCamera ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center space-y-3">
            <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{emptyTitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{recommendedHint}</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, or GIF · max 5MB</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={disabled || cameraStarting}
                onClick={() => void startCamera('environment')}
              >
                {cameraStarting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                Take photo
              </Button>
              <Button type="button" variant="outline" disabled={disabled} onClick={() => openPicker(null)}>
                <ImagePlus className="h-4 w-4 mr-2" />
                Choose file
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => openPicker(null)}
            className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors disabled:opacity-50"
          >
            <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">{recommendedHint}</p>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, or GIF · max 5MB</p>
          </button>
        )
      ) : null}

      {enableCamera && showCamera ? (
        <div className="relative border rounded-lg overflow-hidden bg-black">
          <video
            ref={(el) => {
              videoRef.current = el;
              if (el && cameraStreamRef.current) {
                attachStreamToVideo(el, cameraStreamRef.current);
              }
            }}
            autoPlay
            playsInline
            muted
            className="relative z-0 w-full h-64 bg-black object-cover -scale-x-100"
          />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 px-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={stopCamera}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void startCamera(facingMode === 'user' ? 'environment' : 'user')}
              className="bg-gray-700 hover:bg-gray-800 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {facingMode === 'user' ? 'Back' : 'Front'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={capturePhotoFromCamera}
              className="bg-white hover:bg-gray-100 text-gray-900"
            >
              <Camera className="h-4 w-4 mr-2" />
              Capture
            </Button>
          </div>
        </div>
      ) : null}

      {value.length > 0 ? (
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

          {value.length < max && !showCamera ? (
            enableCamera ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={disabled || cameraStarting}
                  onClick={() => void startCamera('environment')}
                >
                  {cameraStarting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={disabled}
                  onClick={() => openPicker(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Choose file
                </Button>
              </div>
            ) : (
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
            )
          ) : null}
        </div>
      ) : null}

      {displayError ? <p className="text-xs text-destructive">{displayError}</p> : null}
    </div>
  );
}
