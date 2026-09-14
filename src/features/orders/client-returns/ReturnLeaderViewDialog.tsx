import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MultiProofPhotoField,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import {
  getReturnLeaderLineQty,
  returnLeaderStatusBadgeClass,
  returnLeaderStatusLabel,
  type ReturnLeaderHandover,
} from './returnLeaderApi';

type ReturnLeaderViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ReturnLeaderHandover | null;
  mode?: 'view' | 'approve' | 'reject';
  acting?: boolean;
  onApprove?: (photos: PackageProofPhotoItem[]) => void;
  onReject?: (note: string) => void;
};

function namesMatch(typed: string, expected: string) {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim().length > 0;
}

export function ReturnLeaderViewDialog({
  open,
  onOpenChange,
  row,
  mode = 'view',
  acting = false,
  onApprove,
  onReject,
}: ReturnLeaderViewDialogProps) {
  const isApprove = mode === 'approve';
  const isReject = mode === 'reject';
  const isReview = isApprove || isReject;
  const qty = row ? getReturnLeaderLineQty(row) : 0;
  const brandGroups = row
    ? groupLinesByBrand(
        row.lines.map((line) => ({
          brandName: line.brandName,
          variantName: line.variantName,
          variantType: line.variantType,
          quantity: line.quantity,
          variantId: line.variantId,
          brandId: line.brandId,
          variantTypeId: line.variantTypeId,
        }))
      )
    : [];
  const [rejectNote, setRejectNote] = useState('');
  const [photos, setPhotos] = useState<PackageProofPhotoItem[]>([]);
  const [submitterNameInput, setSubmitterNameInput] = useState('');
  const [nameConfirmOpen, setNameConfirmOpen] = useState(false);
  const openingConfirmRef = useRef(false);

  useEffect(() => {
    if (!open) {
      openingConfirmRef.current = false;
      setRejectNote('');
      setPhotos([]);
      setSubmitterNameInput('');
      setNameConfirmOpen(false);
      return;
    }
    setRejectNote('');
    setPhotos([]);
    setSubmitterNameInput('');
    setNameConfirmOpen(false);
  }, [open, row?.id, mode]);

  const submitterName = row?.submittedByName?.trim() || '';
  const submitterNameMatches = namesMatch(submitterNameInput, submitterName);
  const showMismatch = submitterNameInput.trim().length > 0 && !submitterNameMatches;
  const canOpenApproveConfirm = isApprove && photos.length > 0 && !acting && !!row;
  const canOpenRejectConfirm = isReject && !acting && !!row;

  const closeNameConfirm = () => {
    if (acting) return;
    openingConfirmRef.current = false;
    setNameConfirmOpen(false);
    setSubmitterNameInput('');
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (acting && !nextOpen) return;
          if (!nextOpen && (nameConfirmOpen || openingConfirmRef.current)) {
            openingConfirmRef.current = false;
            return;
          }
          if (!nextOpen) closeNameConfirm();
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col"
          onPointerDownOutside={(event) => {
            if (nameConfirmOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (nameConfirmOpen) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (nameConfirmOpen) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <span className="font-mono">{row?.returnNumber || 'Return to leader'}</span>
              {row ? (
                <Badge variant="outline" className={`font-normal ${returnLeaderStatusBadgeClass(row.status)}`}>
                  {returnLeaderStatusLabel(row.status)}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {row ? (
                isApprove ? (
                  <>
                    Upload proof of receipt, then confirm and type the submitter name for{' '}
                    {row.returnNumber}.
                  </>
                ) : isReject ? (
                  <>
                    Review this return, then reject and type the submitter name to close{' '}
                    {row.returnNumber}.
                  </>
                ) : (
                  <>
                    {row.submittedByName} · {qty} unit{qty === 1 ? '' : 's'}
                  </>
                )
              ) : (
                'Return to leader details'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {row ? (
              <>
                <div className="rounded-md border bg-muted/20 p-3 space-y-1.5 text-sm">
                  <p>
                    <span className="text-muted-foreground">Submitted by </span>
                    <span className="font-medium">{row.submittedByName}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Units </span>
                    <span className="font-semibold tabular-nums text-rose-700">{qty}</span>
                  </p>
                  {row.notes ? (
                    <p>
                      <span className="text-muted-foreground">Notes </span>
                      <span className="font-medium">{row.notes}</span>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    {isApprove ? 'Items to receive' : isReject ? 'Items in this return' : 'Items'}
                  </p>
                  {brandGroups.length > 0 ? (
                    brandGroups.map((group) => (
                      <BrandReturnedTable
                        key={group.brandName}
                        brandName={group.brandName}
                        variants={group.variants}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No item lines on this return.</p>
                  )}
                </div>

                {row.proofPhotos.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Submitter photos</p>
                    <div className="flex flex-wrap gap-2">
                      {row.proofPhotos.map((photo) => (
                        <a
                          key={photo.path}
                          href={photo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-32 rounded-md border overflow-hidden"
                        >
                          {photo.url ? (
                            <img src={photo.url} alt={photo.fileName} className="h-24 w-full object-cover bg-muted" />
                          ) : null}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {row.agentSignatureUrl ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Agent signature</p>
                    <div className="rounded-md border bg-white p-3">
                      <img
                        src={row.agentSignatureUrl}
                        alt="Agent signature"
                        className="max-h-28 mx-auto"
                      />
                    </div>
                  </div>
                ) : null}

                {isApprove ? (
                  <div className="space-y-2">
                    <Label>Proof of receipt</Label>
                    <MultiProofPhotoField
                      label="Proof photos"
                      value={photos}
                      onChange={setPhotos}
                      emptyTitle="Upload proof photo"
                      enableCamera
                      recommendedHint="Take a photo or choose a file"
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isReview ? (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={acting}>
                  Cancel
                </Button>
                {isReject ? (
                  <Button
                    variant="destructive"
                    disabled={!canOpenRejectConfirm}
                    onClick={() => {
                      openingConfirmRef.current = true;
                      setSubmitterNameInput('');
                      setRejectNote('');
                      setNameConfirmOpen(true);
                    }}
                  >
                    Reject
                  </Button>
                ) : (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={!canOpenApproveConfirm}
                    onClick={() => {
                      openingConfirmRef.current = true;
                      setSubmitterNameInput('');
                      setNameConfirmOpen(true);
                    }}
                  >
                    Confirm receipt
                  </Button>
                )}
              </>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(open && isReview && nameConfirmOpen && row)}
        onOpenChange={(nextOpen) => {
          if (acting && !nextOpen) return;
          if (!nextOpen) closeNameConfirm();
        }}
      >
        <AlertDialogContent className="z-[70] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm submitter name</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-left">
                <p>
                  This return was submitted by{' '}
                  <span className="font-semibold text-foreground">{submitterName || 'this agent'}</span>.
                  Type that name to confirm {isReject ? 'reject' : 'receipt'}.
                </p>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    {isReject ? 'Items being rejected' : 'Items being received'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {qty} unit{qty === 1 ? '' : 's'} · {brandGroups.length} brand
                    {brandGroups.length === 1 ? '' : 's'}
                  </p>
                  {brandGroups.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {brandGroups.map((group) => (
                        <BrandReturnedTable
                          key={`confirm-${group.brandName}`}
                          brandName={group.brandName}
                          variants={group.variants}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No item lines on this return.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rl-submitter-name">Submitter name</Label>
                  <Input
                    id="rl-submitter-name"
                    className="text-black"
                    value={submitterNameInput}
                    onChange={(event) => setSubmitterNameInput(event.target.value)}
                    placeholder="Enter submitter name"
                    autoComplete="off"
                    disabled={acting || !row}
                  />
                  {showMismatch ? (
                    <p className="text-xs text-destructive">Name does not match.</p>
                  ) : null}
                </div>
                {isReject ? (
                  <div className="space-y-2">
                    <Label htmlFor="rl-reject-note">Note (optional)</Label>
                    <Textarea
                      id="rl-reject-note"
                      className="text-black"
                      value={rejectNote}
                      onChange={(event) => setRejectNote(event.target.value)}
                      placeholder="Why this return is rejected"
                      rows={3}
                      disabled={acting}
                    />
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting} onClick={closeNameConfirm}>
              Cancel
            </AlertDialogCancel>
            {isReject ? (
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => onReject?.(rejectNote)}
                disabled={!submitterNameMatches || acting || !row}
              >
                {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Reject
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onApprove?.(photos)}
                disabled={!submitterNameMatches || acting || !row || photos.length === 0}
              >
                {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirm receipt
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
