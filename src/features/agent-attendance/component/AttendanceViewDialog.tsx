import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { getAgentAttendancePhotoSignedUrl } from '@/features/agent-attendance/lib/attendancePhotoUrl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type AttendanceViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentLabel: string;
  businessDateLabel: string;
  photoPath: string | null | undefined;
  note: string | null | undefined;
};

export function AttendanceViewDialog({
  open,
  onOpenChange,
  agentLabel,
  businessDateLabel,
  photoPath,
  note,
}: AttendanceViewDialogProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  const trimmedNote = note?.trim() ?? '';

  useEffect(() => {
    if (!open) {
      setPhotoUrl(null);
      setPhotoLoading(false);
      setPhotoError(false);
      return;
    }

    if (!photoPath?.trim()) {
      setPhotoUrl(null);
      setPhotoLoading(false);
      setPhotoError(false);
      return;
    }

    let cancelled = false;
    setPhotoLoading(true);
    setPhotoError(false);

    void getAgentAttendancePhotoSignedUrl(photoPath).then(url => {
      if (cancelled) return;
      setPhotoUrl(url);
      setPhotoError(!url);
      setPhotoLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, photoPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attendance</DialogTitle>
          <DialogDescription>
            {agentLabel} · {businessDateLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {photoPath?.trim() ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Time-in photo</p>
              <div className="flex min-h-[12rem] items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                {photoLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
                ) : photoError || !photoUrl ? (
                  <p className="px-4 text-center text-sm text-muted-foreground">
                    Could not load the attendance photo.
                  </p>
                ) : (
                  <img
                    src={photoUrl}
                    alt={`Time-in photo for ${agentLabel}`}
                    className="max-h-[min(50vh,24rem)] w-full object-contain"
                  />
                )}
              </div>
            </div>
          ) : null}

          {trimmedNote ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Note</p>
              <div className="max-h-[min(30vh,12rem)] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-foreground">
                {trimmedNote}
              </div>
            </div>
          ) : !photoPath?.trim() ? (
            <p className="text-sm text-muted-foreground">No photo or note on file for this record.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Present row with a time-in photo and/or a note worth opening in the view dialog. */
export function canViewAttendanceDetails(row: {
  status: string;
  photo?: string | null;
  note?: string | null;
}): boolean {
  if (row.status !== 'present') return false;
  return Boolean(row.photo?.trim() || row.note?.trim());
}
