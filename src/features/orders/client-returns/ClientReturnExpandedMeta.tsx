import { format, isValid } from 'date-fns';
import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatClientReturnReason,
  formatClientReturnStatus,
  formatClientReturnType,
  formatClientReturnPeso,
  getClientReturnRefundAmount,
  getReturnActionActor,
  type PreviewClientReturn,
} from './clientReturnPreview';
import { ClientReturnPayoutProofButton } from './ClientReturnPayoutProofDialog';

function formatMetaDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!isValid(parsed)) return value;
  return format(parsed, withTime ? 'MMM d, yyyy · h:mm a' : 'MMM d, yyyy');
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-sm sm:grid sm:grid-cols-[7.5rem_1fr] sm:gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

export function ClientReturnExpandedMeta({ row }: { row: PreviewClientReturn }) {
  const photos = row.proofPhotos?.length
    ? row.proofPhotos
    : row.proofLabels.map((fileName) => ({ fileName, url: '', path: '' }));
  const [preview, setPreview] = useState<(typeof photos)[number] | null>(null);
  const actor = getReturnActionActor(row);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <dl className="space-y-1.5">
        <MetaRow label="Client name" value={row.clientName} />
        <MetaRow label="Type" value={formatClientReturnType(row.returnType)} />
        {row.returnType === 'refund' ? (
          <MetaRow label="Refund amount" value={formatClientReturnPeso(getClientReturnRefundAmount(row))} />
        ) : null}
        <MetaRow label="Agent name" value={row.returnedByName} />
        <MetaRow label="Returned date" value={formatMetaDate(row.returnDate)} />
        <MetaRow label="Created" value={formatMetaDate(row.createdAt, true)} />
        <MetaRow label="Status" value={formatClientReturnStatus(row.status)} />
        {row.returnType === 'refund' && (row.saApprovedByName || row.saApprovedAt) ? (
          <>
            <MetaRow label="SA approved by" value={row.saApprovedByName || '—'} />
            <MetaRow label="SA approved at" value={formatMetaDate(row.saApprovedAt, true)} />
          </>
        ) : null}
        {actor.kind === 'approve' ? (
          <>
            <MetaRow
              label={row.returnType === 'refund' ? 'Finance posted by' : 'Approved by'}
              value={actor.name || '—'}
            />
            <MetaRow
              label={row.returnType === 'refund' ? 'Finance posted at' : 'Approved at'}
              value={formatMetaDate(actor.at, true)}
            />
          </>
        ) : null}
        {actor.kind === 'reject' ? (
          <>
            <MetaRow label="Rejected by" value={actor.name || '—'} />
            <MetaRow label="Rejected at" value={formatMetaDate(actor.at, true)} />
            <MetaRow label="Rejection" value={row.rejectionNote?.trim() || '—'} />
          </>
        ) : null}
        <MetaRow label="Reason" value={formatClientReturnReason(row.reason)} />
        <MetaRow label="Notes" value={row.notes?.trim() || '—'} />
      </dl>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Photo:</p>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photo</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <button
                key={`${photo.path}-${photo.fileName}`}
                type="button"
                onClick={() => setPreview(photo)}
                title="View full size"
                className="w-32 rounded-md border bg-background overflow-hidden text-left hover:opacity-90 transition-opacity cursor-pointer"
              >
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={photo.fileName}
                    className="h-24 w-full object-cover bg-muted"
                  />
                ) : (
                  <div className="h-24 w-full flex items-center justify-center bg-muted text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <span className="block text-[10px] px-1.5 py-1 truncate text-muted-foreground">
                  {photo.fileName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ClientReturnPayoutProofButton row={row} />

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photo</DialogTitle>
            <DialogDescription>{preview?.fileName || 'Proof photo'}</DialogDescription>
          </DialogHeader>
          {preview?.url ? (
            <img
              src={preview.url}
              alt={preview.fileName || 'Proof photo'}
              className="w-full max-h-[75vh] object-contain rounded-md bg-muted"
            />
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
