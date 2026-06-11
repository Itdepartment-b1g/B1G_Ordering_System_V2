import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { getAgentAttendancePhotoSignedUrl } from '@/features/agent-attendance/lib/attendancePhotoUrl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AttendanceTimeInPhotoProps = {
  photoPath: string | null | undefined;
  alt?: string;
  /** Thumbnail size in the list; tap/click opens full size. */
  size?: 'sm' | 'md';
  className?: string;
};

export function AttendanceTimeInPhoto({
  photoPath,
  alt = 'Time-in photo',
  size = 'sm',
  className,
}: AttendanceTimeInPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!photoPath?.trim()) {
      setUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    void getAgentAttendancePhotoSignedUrl(photoPath).then(signed => {
      if (cancelled) return;
      setUrl(signed);
      setError(!signed);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  if (!photoPath?.trim()) return null;

  const thumbClass = size === 'sm' ? 'h-14 w-14' : 'h-20 w-20';

  return (
    <>
      <div className={className}>
        <button
          type="button"
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${thumbClass}`}
          onClick={() => url && setExpanded(true)}
          disabled={loading || error || !url}
          aria-label="View time-in photo"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          ) : error || !url ? (
            <span className="px-1 text-center text-[10px] leading-tight text-muted-foreground">
              Unavailable
            </span>
          ) : (
            <img src={url} alt={alt} className="h-full w-full object-cover" />
          )}
        </button>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Time-in photo</DialogTitle>
          </DialogHeader>
          {url ? (
            <div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              <img
                src={url}
                alt={alt}
                className="max-h-[min(70vh,28rem)] w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
