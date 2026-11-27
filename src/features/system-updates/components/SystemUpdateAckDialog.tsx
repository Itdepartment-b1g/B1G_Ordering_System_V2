import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Download, Info, Loader2, Megaphone, Paperclip } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  SYSTEM_UPDATE_UNACKED_QUERY_KEY,
  acknowledgeSystemUpdate,
  fetchUnacknowledgedSystemUpdates,
  getSystemUpdateAttachmentUrl,
  type SystemUpdateAttachment,
  type UnacknowledgedSystemUpdate,
} from '../systemUpdatesApi';

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function AttachmentRow({
  file,
  downloadingId,
  onDownload,
}: {
  file: SystemUpdateAttachment;
  downloadingId: string | null;
  onDownload: (file: SystemUpdateAttachment) => void;
}) {
  const sizeLabel = formatFileSize(file.size_bytes);
  const busy = downloadingId === file.id;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">Attachment</p>
        <p className="truncate text-sm font-medium">
          {file.file_name}
          {sizeLabel ? (
            <span className="font-normal text-muted-foreground"> ({sizeLabel})</span>
          ) : null}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        disabled={busy}
        onClick={() => onDownload(file)}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download
      </Button>
    </div>
  );
}

export function SystemUpdateAckDialog() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const enabled =
    isAuthenticated &&
    !!user?.id &&
    !!user?.company_id &&
    user.role !== 'system_administrator';

  const { data: updates = [], isLoading } = useQuery({
    queryKey: [SYSTEM_UPDATE_UNACKED_QUERY_KEY, user?.id, user?.company_id],
    enabled,
    queryFn: fetchUnacknowledgedSystemUpdates,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const current: UnacknowledgedSystemUpdate | null = updates[0] || null;

  useEffect(() => {
    setChecked(false);
  }, [current?.id]);

  const remaining = useMemo(() => Math.max(updates.length - 1, 0), [updates.length]);

  const publishedLabel = useMemo(() => {
    if (!current?.published_at) return null;
    try {
      return format(new Date(current.published_at), 'MMMM d, yyyy');
    } catch {
      return null;
    }
  }, [current?.published_at]);

  const ackMutation = useMutation({
    mutationFn: (updateId: string) => acknowledgeSystemUpdate(updateId),
    onSuccess: async () => {
      setChecked(false);
      await queryClient.invalidateQueries({ queryKey: [SYSTEM_UPDATE_UNACKED_QUERY_KEY] });
      toast({ title: 'Acknowledged', description: 'Thanks for reviewing this update.' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Could not acknowledge',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleDownload = async (file: SystemUpdateAttachment) => {
    try {
      setDownloadingId(file.id);
      const url = await getSystemUpdateAttachmentUrl(file.file_path);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Could not open attachment.',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  if (!enabled || isLoading || !current) return null;

  return (
    <Dialog open>
      <DialogContent
        className="flex max-h-[min(92vh,720px)] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:w-full [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b px-5 py-4 text-left sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <Megaphone className="h-5 w-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <DialogTitle className="text-base font-semibold leading-snug sm:text-lg">
                {current.title}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs sm:text-sm">
                System Update{publishedLabel ? ` • ${publishedLabel}` : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
          {current.short_description ? (
            <div className="flex gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3.5 py-3 text-sm text-sky-950">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <p className="leading-relaxed">{current.short_description}</p>
            </div>
          ) : null}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">What&apos;s New?</h3>
            {current.details.length > 0 ? (
              <ol className="space-y-3">
                {current.details.map((item, index) => (
                  <li key={`${current.id}-${index}`} className="text-sm">
                    <p className="font-medium leading-snug text-foreground">
                      {index + 1}. {item.title}
                    </p>
                    {item.description ? (
                      <p className="mt-1 whitespace-pre-wrap pl-4 font-normal leading-relaxed text-foreground">
                        {item.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No detail bullets for this update.</p>
            )}
          </div>

          {current.attachments.length > 0 ? (
            <div className="space-y-2">
              {current.attachments.map((file) => (
                <AttachmentRow
                  key={file.id}
                  file={file}
                  downloadingId={downloadingId}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          ) : null}

          {remaining > 0 ? (
            <p className="text-xs text-muted-foreground">
              {remaining} more update{remaining === 1 ? '' : 's'} waiting after this one.
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t px-5 py-4 sm:flex-col sm:space-x-0 sm:px-6">
          <div className="flex w-full items-start gap-2">
            <Checkbox
              id="system-update-ack"
              checked={checked}
              className="mt-0.5 h-3.5 w-3.5"
              onCheckedChange={(value) => setChecked(value === true)}
            />
            <Label
              htmlFor="system-update-ack"
              className="cursor-pointer text-xs font-normal leading-snug text-muted-foreground"
            >
              I have read and understood the updates and changes described above.
            </Label>
          </div>
          <Button
            type="button"
            className="h-11 w-full gap-2 rounded-xl text-sm font-medium"
            disabled={!checked || ackMutation.isPending}
            onClick={() => ackMutation.mutate(current.id)}
          >
            {ackMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Acknowledge Update
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
