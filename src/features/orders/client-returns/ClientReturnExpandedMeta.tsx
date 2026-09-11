import { format } from 'date-fns';
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
  getMockProofPhotoUrl,
  getReturnActionActor,
  type MockClientReturn,
} from './clientReturnMock';

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

export function ClientReturnExpandedMeta({ row }: { row: MockClientReturn }) {
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const previewUrl = previewFileName ? getMockProofPhotoUrl(previewFileName) : null;
  const actor = getReturnActionActor(row);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <dl className="space-y-1.5">
        <MetaRow label="Client name" value={row.clientName} />
        <MetaRow label="Agent name" value={row.returnedByName} />
        <MetaRow label="Returned date" value={format(new Date(row.returnDate), 'MMM d, yyyy')} />
        <MetaRow label="Created" value={format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')} />
        <MetaRow label="Status" value={formatClientReturnStatus(row.status)} />
        {actor.kind === 'approve' ? (
          <>
            <MetaRow label="Approved by" value={actor.name || '—'} />
            <MetaRow
              label="Approved at"
              value={actor.at ? format(new Date(actor.at), 'MMM d, yyyy · h:mm a') : '—'}
            />
          </>
        ) : null}
        {actor.kind === 'reject' ? (
          <>
            <MetaRow label="Rejected by" value={actor.name || '—'} />
            <MetaRow
              label="Rejected at"
              value={actor.at ? format(new Date(actor.at), 'MMM d, yyyy · h:mm a') : '—'}
            />
            <MetaRow label="Rejection" value={row.rejectionNote?.trim() || '—'} />
          </>
        ) : null}
        <MetaRow label="Reason" value={formatClientReturnReason(row.reason)} />
        <MetaRow label="Notes" value={row.notes?.trim() || '—'} />
      </dl>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Photo:</p>
        {row.proofLabels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photo</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {row.proofLabels.map((fileName) => (
              <button
                key={fileName}
                type="button"
                onClick={() => setPreviewFileName(fileName)}
                title="View full size"
                className="w-32 rounded-md border bg-background overflow-hidden text-left hover:opacity-90 transition-opacity cursor-pointer"
              >
                <img
                  src={getMockProofPhotoUrl(fileName)}
                  alt={fileName}
                  className="h-24 w-full object-cover bg-muted"
                />
                <span className="block text-[10px] px-1.5 py-1 truncate text-muted-foreground">{fileName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!previewFileName} onOpenChange={(open) => !open && setPreviewFileName(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photo</DialogTitle>
            <DialogDescription>{previewFileName || 'Proof photo'}</DialogDescription>
          </DialogHeader>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={previewFileName || 'Proof photo'}
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
