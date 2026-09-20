import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RotateCcw } from 'lucide-react';
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
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import {
  clientReturnStatusBadgeClass,
  clientReturnTypeBadgeClass,
  formatClientReturnStatus,
  formatClientReturnType,
  formatClientReturnPeso,
  getClientReturnRefundAmount,
  getPreviewReturnLineQty,
  type PreviewClientReturn,
} from './clientReturnPreview';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';

type ClientReturnViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: PreviewClientReturn | null;
  mode?: 'view' | 'approve' | 'reject';
  acting?: boolean;
  skipNameConfirm?: boolean;
  onApprove?: (photos?: PackageProofPhotoItem[]) => void;
  onReject?: (note: string) => void;
};

function namesMatch(typed: string, expected: string) {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim().length > 0;
}

export function ClientReturnViewDialog({
  open,
  onOpenChange,
  row,
  mode = 'view',
  acting = false,
  skipNameConfirm = false,
  onApprove,
  onReject,
}: ClientReturnViewDialogProps) {
  const isApprove = mode === 'approve';
  const isReject = mode === 'reject';
  const isReview = isApprove || isReject;
  const isSaRefund = row?.returnType === 'refund' && row.status === 'pending_super_admin';
  const qty = row ? getPreviewReturnLineQty(row) : 0;
  const brandGroups = row ? groupLinesByBrand(row.lines) : [];
  const changeGroups = row ? groupLinesByBrand(row.changeLines || []) : [];
  const [agentNameInput, setAgentNameInput] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [nameConfirmOpen, setNameConfirmOpen] = useState(false);
  const [payoutPhotos, setPayoutPhotos] = useState<PackageProofPhotoItem[]>([]);
  const [payoutStep, setPayoutStep] = useState(false);
  const openingConfirmRef = useRef(false);
  const requirePayoutProof =
    isApprove && row?.returnType === 'refund' && row.status === 'pending_finance';

  useEffect(() => {
    if (!open) {
      openingConfirmRef.current = false;
      setAgentNameInput('');
      setRejectNote('');
      setNameConfirmOpen(false);
      setPayoutStep(false);
      setPayoutPhotos((current) => {
        revokePackageProofPreviews(current);
        return [];
      });
      return;
    }
    setAgentNameInput('');
    setRejectNote('');
    setNameConfirmOpen(false);
    setPayoutStep(false);
    setPayoutPhotos((current) => {
      revokePackageProofPreviews(current);
      return [];
    });
  }, [open, row?.id, mode]);

  const agentName = row?.returnedByName?.trim() || '';
  const agentNameMatches = namesMatch(agentNameInput, agentName);
  const showMismatch = agentNameInput.trim().length > 0 && !agentNameMatches;

  const closeNameConfirm = () => {
    if (acting) return;
    openingConfirmRef.current = false;
    setNameConfirmOpen(false);
    setAgentNameInput('');
    setRejectNote('');
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (acting && !nextOpen) return;
          if (!nextOpen && payoutStep) {
            setPayoutStep(false);
            return;
          }
          if (!nextOpen && (nameConfirmOpen || openingConfirmRef.current)) {
            openingConfirmRef.current = false;
            return;
          }
          if (!nextOpen) closeNameConfirm();
          onOpenChange(nextOpen);
        }}
      >
        <DialogContent
          overlayClassName="z-[70]"
          className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col z-[70]"
          onPointerDownOutside={(event) => {
            if (nameConfirmOpen || payoutStep) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (nameConfirmOpen || payoutStep) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (nameConfirmOpen || payoutStep) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <RotateCcw className="h-5 w-5 text-rose-600" />
              <span className="font-mono">{row?.returnNumber || 'Return'}</span>
              {row ? (
                <Badge variant="outline" className={`font-normal ${clientReturnTypeBadgeClass(row.returnType)}`}>
                  {formatClientReturnType(row.returnType)}
                </Badge>
              ) : null}
              {row ? (
                <Badge variant="outline" className={`font-normal ${clientReturnStatusBadgeClass(row.status)}`}>
                  {formatClientReturnStatus(row.status)}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {row ? (
                isApprove ? (
                  skipNameConfirm ? (
                    <>Review this refund, then click Approve to attach proof that cash was sent.</>
                  ) : requirePayoutProof ? (
                    <>
                      Review this refund, then click Approve to attach proof that cash was sent and
                      confirm the mobile sales name.
                    </>
                  ) : isSaRefund ? (
                    <>
                      Review this refund, then click Approve and type the mobile sales name to send{' '}
                      {row.returnNumber} to finance. No cash-sent photo is needed here — Finance
                      attaches that when they approve.
                    </>
                  ) : (
                    <>
                      Review this return, then click Approve and type the mobile sales name to post{' '}
                      {row.returnNumber} and update returned stock.
                    </>
                  )
                ) : isReject ? (
                  skipNameConfirm ? (
                    <>Review this refund, then reject {row.returnNumber} if cash should not be sent.</>
                  ) : isSaRefund ? (
                    <>
                      Review this refund, then click Reject and type the mobile sales name to close{' '}
                      {row.returnNumber}. The agent can file a new CR on {row.orderNumber}.
                    </>
                  ) : (
                    <>
                      Review this return, then click Reject and type the mobile sales name to close{' '}
                      {row.returnNumber}. The agent can file a new CR on {row.orderNumber}.
                    </>
                  )
                ) : (
                  <>
                    {row.orderNumber} · {row.clientName} · {qty} unit{qty === 1 ? '' : 's'}
                    {row.returnType === 'refund'
                      ? ` · ${formatClientReturnPeso(getClientReturnRefundAmount(row))}`
                      : ''}
                  </>
                )
              ) : (
                'Return details'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {row ? (
              <>
                {isReview ? (
                  <p className="text-sm text-muted-foreground">
                    {row.orderNumber} · {row.clientName} · {qty} unit{qty === 1 ? '' : 's'}
                  </p>
                ) : null}
                <ClientReturnExpandedMeta row={row} />
                {brandGroups.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Returned</p>
                    {brandGroups.map((group) => (
                      <BrandReturnedTable
                        key={`ret-${group.brandName}`}
                        brandName={group.brandName}
                        variants={group.variants}
                        showStockFate
                      />
                    ))}
                  </div>
                ) : null}
                {changeGroups.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Change item</p>
                    {changeGroups.map((group) => (
                      <BrandReturnedTable
                        key={`chg-${group.brandName}`}
                        brandName={group.brandName}
                        variants={group.variants}
                        qtyClassName="text-emerald-700"
                      />
                    ))}
                  </div>
                ) : null}
                {skipNameConfirm && isReject ? (
                  <div className="space-y-2">
                    <Label htmlFor="finance-reject-note">Note (optional)</Label>
                    <Textarea
                      id="finance-reject-note"
                      value={rejectNote}
                      onChange={(event) => setRejectNote(event.target.value)}
                      placeholder="Why this refund is rejected"
                      rows={3}
                      disabled={acting}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {isReview ? (
            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={acting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className={
                  isReject
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
                onClick={() => {
                  if (skipNameConfirm && isReject) {
                    onReject?.(rejectNote);
                    return;
                  }
                  if (isApprove && requirePayoutProof && !isSaRefund) {
                    setPayoutStep(true);
                    return;
                  }
                  if (skipNameConfirm && isApprove && !isSaRefund) {
                    onApprove?.(undefined);
                    return;
                  }
                  openingConfirmRef.current = true;
                  setAgentNameInput('');
                  setRejectNote('');
                  setNameConfirmOpen(true);
                }}
                disabled={acting || !row}
              >
                {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isReject ? 'Reject' : 'Approve'}
              </Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(open && requirePayoutProof && payoutStep && row)}
        onOpenChange={(nextOpen) => {
          if (acting && !nextOpen) return;
          if (!nextOpen) setPayoutStep(false);
        }}
      >
        <DialogContent
          className="sm:max-w-lg z-[80]"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onFocusOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImagePlus className="h-5 w-5" />
              Proof cash was sent
            </DialogTitle>
            <DialogDescription>
              Attach a photo as proof that cash was sent, then approve {row?.returnNumber}.
            </DialogDescription>
          </DialogHeader>
          <MultiProofPhotoField
            label="Cash-sent photos"
            value={payoutPhotos}
            onChange={setPayoutPhotos}
            emptyTitle="Add a photo of the cash sent"
            enableCamera
            showPreview
            recommendedHint="Take a photo or choose a file"
            disabled={acting}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayoutStep(false)}
              disabled={acting}
            >
              Back
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (skipNameConfirm) {
                  onApprove?.(payoutPhotos);
                  return;
                }
                openingConfirmRef.current = true;
                setAgentNameInput('');
                setRejectNote('');
                setNameConfirmOpen(true);
              }}
              disabled={acting || !row || payoutPhotos.length === 0}
            >
              {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(open && isReview && nameConfirmOpen && row && !skipNameConfirm)}
        onOpenChange={(nextOpen) => {
          if (acting && !nextOpen) return;
          if (!nextOpen) closeNameConfirm();
        }}
      >
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm mobile sales name</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-left">
                <p>
                  This return was filed by{' '}
                  <span className="font-semibold text-foreground">{agentName || 'this agent'}</span>.
                  {isSaRefund && isApprove
                    ? ' Type that name to send this refund to finance. No photo is required — Finance will attach cash-sent proof when they approve.'
                    : ` Type that name to confirm ${isReject ? 'reject' : 'approve'}.`}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="review-agent-name">Mobile sales name</Label>
                  <Input
                    id="review-agent-name"
                    className="text-black"
                    value={agentNameInput}
                    onChange={(event) => setAgentNameInput(event.target.value)}
                    placeholder="Enter mobile sales name"
                    autoComplete="off"
                    disabled={acting || !row}
                  />
                  {showMismatch ? (
                    <p className="text-xs text-destructive">Name does not match.</p>
                  ) : null}
                </div>
                {isReject ? (
                  <div className="space-y-2">
                    <Label htmlFor="reject-note">Note (optional)</Label>
                    <Textarea
                      id="reject-note"
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
                disabled={!agentNameMatches || acting || !row}
              >
                {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Reject
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onApprove?.(requirePayoutProof ? payoutPhotos : undefined)}
                disabled={!agentNameMatches || acting || !row || (requirePayoutProof && payoutPhotos.length === 0)}
              >
                {acting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isSaRefund ? 'Send to finance' : 'Approve'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
