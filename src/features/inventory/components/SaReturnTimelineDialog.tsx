import { History } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildSaReturnTimeline,
  formatSaReturnTimelineAt,
  type SaReturnTimelineEvent,
  type SaReturnTimelineReceipt,
  type SaReturnType,
} from '../utils/saReturnDisplay';

export type SaReturnTimelineDialogInput = {
  requestNumber: string;
  createdAt: string;
  createdByName?: string | null;
  sourceAgentName?: string | null;
  sourceAgentId?: string | null;
  approvedAt?: string | null;
  approvedByName?: string | null;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  status: string;
  returnType?: SaReturnType | null;
  destinationLocationName?: string | null;
  receipts?: SaReturnTimelineReceipt[];
};

type SaReturnTimelineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnRequest: SaReturnTimelineDialogInput | null;
};

export function SaReturnTimelineDialog({
  open,
  onOpenChange,
  returnRequest,
}: SaReturnTimelineDialogProps) {
  const events: SaReturnTimelineEvent[] = returnRequest
    ? buildSaReturnTimeline({
        createdAt: returnRequest.createdAt,
        createdByName: returnRequest.createdByName,
        sourceAgentId: returnRequest.sourceAgentId,
        sourceAgentName: returnRequest.sourceAgentName,
        approvedAt: returnRequest.approvedAt,
        approvedByName: returnRequest.approvedByName,
        cancelledAt: returnRequest.cancelledAt,
        cancelledByName: returnRequest.cancelledByName,
        status: returnRequest.status,
        returnType: returnRequest.returnType,
        destinationLocationName: returnRequest.destinationLocationName,
        receipts: returnRequest.receipts,
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Timeline
          </DialogTitle>
          <DialogDescription>
            {returnRequest?.requestNumber
              ? `Activity for ${returnRequest.requestNumber}`
              : 'Return activity'}
          </DialogDescription>
        </DialogHeader>

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No timeline events yet.</p>
        ) : (
          <div className="relative ml-2 space-y-4 border-l pl-4 py-1">
            {events.map((event) => (
              <div key={event.id} className="relative">
                <span
                  className={`absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full ${
                    event.at ? 'bg-primary' : 'bg-muted-foreground/40'
                  }`}
                />
                <p className="font-medium text-sm">{event.title}</p>
                {event.detail ? (
                  <p className="text-xs text-muted-foreground">{event.detail}</p>
                ) : null}
                {event.outcomes && event.outcomes.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {event.outcomes.map((outcome) => (
                      <li key={outcome} className="text-xs text-muted-foreground">
                        {outcome}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatSaReturnTimelineAt(event.at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
