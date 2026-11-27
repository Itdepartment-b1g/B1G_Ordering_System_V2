import { format, isValid } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, ImagePlus, Loader2, Pencil, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  MultiProofPhotoField,
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  CLIENT_ORDER_RETURN_PAYOUT_REVISIONS_QUERY_KEY,
  fetchPayoutAttachmentRevisions,
  replaceClientOrderReturnPayoutAttachment,
} from './clientReturnApi';
import {
  MAX_PAYOUT_PROOF_EDITS,
  canReplacePayoutProof,
  getPayoutProofEditCount,
  type ClientReturnProofPhoto,
  type PayoutAttachmentRevision,
  type PreviewClientReturn,
} from './clientReturnPreview';

function formatMetaDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!isValid(parsed)) return value;
  return format(parsed, withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
}

function ZoomablePhoto({
  url,
  fileName,
  onZoom,
  className,
}: {
  url: string;
  fileName: string;
  onZoom: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onZoom}
      title="Click to zoom"
      className={`group relative block w-full overflow-hidden rounded-lg border bg-muted/40 text-left cursor-zoom-in ${className || ''}`}
    >
      <img src={url} alt={fileName} className="w-full max-h-[52vh] object-contain bg-muted/30" />
      <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">
          <ZoomIn className="h-3.5 w-3.5" />
          Click to zoom
        </span>
      </span>
    </button>
  );
}

function PayoutRevisionHistory({
  revisions,
  onZoom,
}: {
  revisions: PayoutAttachmentRevision[];
  onZoom: (url: string, fileName: string) => void;
}) {
  if (revisions.length === 0) return null;
  return (
    <div className="rounded-lg border overflow-hidden">
      <p className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/40">
        Edit history ({revisions.length})
      </p>
      <div className="divide-y">
        {revisions.map((revision) => (
          <div key={revision.id} className="p-3 space-y-2.5">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {formatMetaDate(revision.createdAt, true)}
                {revision.changedByName ? ` · ${revision.changedByName}` : ''}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Reason: </span>
                {revision.reason}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Previous</p>
                {revision.previousFileUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      onZoom(revision.previousFileUrl, revision.previousFileName || 'Previous proof')
                    }
                    className="block w-full overflow-hidden rounded-md border bg-muted cursor-zoom-in hover:opacity-90"
                    title="Click to zoom"
                  >
                    <img
                      src={revision.previousFileUrl}
                      alt={revision.previousFileName || 'Previous proof'}
                      className="h-28 w-full object-contain bg-muted"
                    />
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">New</p>
                {revision.newFileUrl ? (
                  <button
                    type="button"
                    onClick={() => onZoom(revision.newFileUrl, revision.newFileName || 'New proof')}
                    className="block w-full overflow-hidden rounded-md border bg-muted cursor-zoom-in hover:opacity-90"
                    title="Click to zoom"
                  >
                    <img
                      src={revision.newFileUrl}
                      alt={revision.newFileName || 'New proof'}
                      className="h-28 w-full object-contain bg-muted"
                    />
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClientReturnPayoutProofDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: PreviewClientReturn | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [zoom, setZoom] = useState<{ url: string; fileName: string } | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<ClientReturnProofPhoto | null>(null);
  const [editPhotos, setEditPhotos] = useState<PackageProofPhotoItem[]>([]);
  const [editReason, setEditReason] = useState('');
  const [replacing, setReplacing] = useState(false);
  const canEditPayout =
    user?.role === 'finance' && row?.returnType === 'refund' && row.status === 'posted';

  const { data: payoutRevisions = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURN_PAYOUT_REVISIONS_QUERY_KEY, row?.id],
    enabled: open && !!row && row.returnType === 'refund' && (row.payoutPhotos?.length ?? 0) > 0,
    queryFn: () => fetchPayoutAttachmentRevisions(row!.id),
  });

  const revisionsByAttachment = useMemo(() => {
    const grouped = new Map<string, PayoutAttachmentRevision[]>();
    for (const revision of payoutRevisions) {
      const current = grouped.get(revision.attachmentId) || [];
      current.push(revision);
      grouped.set(revision.attachmentId, current);
    }
    return grouped;
  }, [payoutRevisions]);

  useEffect(() => {
    if (open) return;
    setZoom(null);
    setZoomedIn(false);
    setEditingPhoto(null);
    setEditReason('');
    setEditPhotos((current) => {
      revokePackageProofPreviews(current);
      return [];
    });
  }, [open, row?.id]);

  useEffect(() => {
    if (editingPhoto) return;
    setEditReason('');
    setEditPhotos((current) => {
      revokePackageProofPreviews(current);
      return [];
    });
  }, [editingPhoto]);

  const closeEdit = () => {
    if (replacing) return;
    setEditingPhoto(null);
  };

  const handleReplace = async () => {
    const companyId = user?.company_id;
    const photo = editPhotos[0];
    const attachmentId = editingPhoto?.id;
    if (!row || !companyId || !photo?.file || !attachmentId) {
      toast({
        title: 'Photo required',
        description: 'Choose a new cash-sent photo before saving.',
        variant: 'destructive',
      });
      return;
    }
    if (!editReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Explain why this cash-sent proof is being replaced.',
        variant: 'destructive',
      });
      return;
    }
    if (!canReplacePayoutProof(attachmentId, payoutRevisions)) {
      toast({
        title: 'Max edits reached',
        description: `This cash-sent proof can only be edited ${MAX_PAYOUT_PROOF_EDITS} times.`,
        variant: 'destructive',
      });
      return;
    }
    setReplacing(true);
    try {
      await replaceClientOrderReturnPayoutAttachment({
        attachmentId,
        companyId,
        photo,
        reason: editReason,
      });
      await queryClient.invalidateQueries({ queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY] });
      await queryClient.invalidateQueries({
        queryKey: [CLIENT_ORDER_RETURN_PAYOUT_REVISIONS_QUERY_KEY, row.id],
      });
      toast({
        title: 'Cash-sent proof updated',
        description: 'The previous photo was kept in edit history.',
      });
      setEditingPhoto(null);
    } catch (err) {
      toast({
        title: 'Could not replace photo',
        description: err instanceof Error ? err.message : 'Failed to replace cash-sent proof',
        variant: 'destructive',
      });
    } finally {
      setReplacing(false);
    }
  };

  const photos = row?.payoutPhotos || [];

  return (
    <>
      <Dialog
        open={open && !!row}
        onOpenChange={(nextOpen) => {
          if (replacing && !nextOpen) return;
          if (!nextOpen && (editingPhoto || zoom)) return;
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto z-[80]"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="flex items-center gap-2">
                  <ImagePlus className="h-5 w-5" />
                  Cash sent proof
                </DialogTitle>
                <DialogDescription>
                  {row
                    ? `${row.returnNumber} · ${row.clientName}`
                    : 'Proof that cash was sent.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cash-sent proof attached.</p>
          ) : (
            <div className="space-y-4">
              {photos.map((photo) => {
                const editCount = getPayoutProofEditCount(photo.id, payoutRevisions);
                const canReplace = canEditPayout && canReplacePayoutProof(photo.id, payoutRevisions);
                return (
                  <div key={`payout-${photo.path}-${photo.fileName}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{photo.fileName}</p>
                      {canEditPayout && photo.id ? (
                        canReplace ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0"
                            onClick={() => setEditingPhoto(photo)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            Edit ({editCount}/{MAX_PAYOUT_PROOF_EDITS})
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground shrink-0">
                            Max edits reached ({MAX_PAYOUT_PROOF_EDITS}/{MAX_PAYOUT_PROOF_EDITS})
                          </p>
                        )
                      ) : null}
                    </div>
                    {photo.url ? (
                      <ZoomablePhoto
                        url={photo.url}
                        fileName={photo.fileName}
                        onZoom={() => {
                          setZoomedIn(false);
                          setZoom({ url: photo.url, fileName: photo.fileName });
                        }}
                      />
                    ) : (
                      <div className="h-48 flex items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                );
              })}
              <PayoutRevisionHistory
                revisions={payoutRevisions}
                onZoom={(url, fileName) => {
                  setZoomedIn(false);
                  setZoom({ url, fileName });
                }}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!zoom}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setZoom(null);
            setZoomedIn(false);
          }
        }}
      >
        <DialogContent className="max-w-[96vw] w-auto p-3 sm:p-4 z-[90] bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-base">Zoom</DialogTitle>
            <DialogDescription className="text-zinc-300">
              {zoom?.fileName || 'Cash-sent proof'} · click the photo to {zoomedIn ? 'zoom out' : 'zoom in'}
            </DialogDescription>
          </DialogHeader>
          {zoom?.url ? (
            <div className="max-h-[80vh] overflow-auto rounded-md bg-black">
              <button
                type="button"
                onClick={() => setZoomedIn((current) => !current)}
                className={`block w-full ${zoomedIn ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                title={zoomedIn ? 'Click to zoom out' : 'Click to zoom in'}
              >
                <img
                  src={zoom.url}
                  alt={zoom.fileName}
                  className={
                    zoomedIn
                      ? 'w-[160%] max-w-none h-auto object-contain'
                      : 'w-full max-h-[75vh] object-contain'
                  }
                />
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPhoto} onOpenChange={(nextOpen) => !nextOpen && closeEdit()}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto z-[90]">
          <DialogHeader>
            <DialogTitle>Replace cash-sent proof</DialogTitle>
            <DialogDescription>
              Upload the correct photo. The previous image is kept in history. Each proof can be
              edited up to {MAX_PAYOUT_PROOF_EDITS} times.
            </DialogDescription>
          </DialogHeader>
          {editingPhoto ? (
            <div className="space-y-4 py-1">
              <p className="text-xs text-muted-foreground">
                Edits used: {getPayoutProofEditCount(editingPhoto.id, payoutRevisions)} of{' '}
                {MAX_PAYOUT_PROOF_EDITS}
              </p>
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Current photo</p>
                {editingPhoto.url ? (
                  <img
                    src={editingPhoto.url}
                    alt={editingPhoto.fileName}
                    className="w-full h-auto object-contain max-h-[160px] rounded-md bg-muted"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No photo on file</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>New photo</Label>
                <MultiProofPhotoField
                  label="New cash-sent photo"
                  value={editPhotos}
                  onChange={setEditPhotos}
                  max={1}
                  emptyTitle="Add the corrected photo"
                  enableCamera
                  showPreview
                  recommendedHint="Take a photo or choose a file"
                  disabled={replacing}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout-edit-reason">Reason</Label>
                <Textarea
                  id="payout-edit-reason"
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder="Why this cash-sent proof is being replaced"
                  rows={3}
                  disabled={replacing}
                />
              </div>
              {editingPhoto.id ? (
                <PayoutRevisionHistory
                  revisions={revisionsByAttachment.get(editingPhoto.id) || []}
                  onZoom={(url, fileName) => {
                    setZoomedIn(false);
                    setZoom({ url, fileName });
                  }}
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEdit} disabled={replacing}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleReplace()}
              disabled={replacing || editPhotos.length === 0 || !editReason.trim()}
            >
              {replacing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save replacement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ClientReturnPayoutProofButton({
  row,
  size = 'sm',
}: {
  row: PreviewClientReturn;
  size?: 'sm' | 'default';
}) {
  const [open, setOpen] = useState(false);
  if (row.returnType !== 'refund' || (row.payoutPhotos?.length ?? 0) === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={size === 'sm' ? 'h-8' : undefined}
        onClick={() => setOpen(true)}
      >
        <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
        View cash-sent proof
      </Button>
      <ClientReturnPayoutProofDialog open={open} onOpenChange={setOpen} row={row} />
    </>
  );
}
