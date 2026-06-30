import { Loader2 } from 'lucide-react';

import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type PhysicalCountSignatureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting: boolean;
  onSubmitWithSignature: (signatureDataUrl: string) => void;
};

export function PhysicalCountSignatureDialog({
  open,
  onOpenChange,
  submitting,
  onSubmitWithSignature,
}: PhysicalCountSignatureDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign to confirm count</DialogTitle>
          <DialogDescription>
            Your signature confirms you performed this physical count. Submission is blocked until
            you sign.
          </DialogDescription>
        </DialogHeader>

        {submitting ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Submitting physical count…</p>
          </div>
        ) : (
          <SignatureCanvas
            title="Counter signature"
            description="Sign below to confirm this physical count"
            onSave={onSubmitWithSignature}
            onCancel={() => onOpenChange(false)}
          />
        )}

        {submitting && (
          <DialogFooter>
            <Button disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting…
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
