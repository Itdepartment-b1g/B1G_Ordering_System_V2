import { CheckCircle2, ChevronDown, Clock, RotateCcw, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import {
  getReturnLeaderLineQty,
  returnLeaderStatusBadgeClass,
  returnLeaderStatusLabel,
  type ReturnLeaderHandover,
} from './returnLeaderApi';

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  tone: 'neutral' | 'success' | 'danger' | 'return';
  actorLabel?: string;
  actorName?: string;
  extras?: string[];
  showItems?: boolean;
};

function formatWhen(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function buildHandoverTimelineEvents(row: ReturnLeaderHandover): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: 'filed',
      at: row.createdAt,
      title: `Return to TL filed · ${row.returnNumber}`,
      tone: 'return',
      actorLabel: 'Submitted by',
      actorName: row.submittedByName,
      extras: row.toHolderName ? [`Return to ${row.toHolderName}`] : undefined,
      showItems: true,
    },
  ];

  const waitingTl = row.status === 'pending_leader';
  events.push({
    id: 'queue-tl',
    at: row.createdAt,
    title: waitingTl ? 'Return pending Team Leader' : 'Sent to Team Leader',
    tone: 'return',
    extras: waitingTl ? ['Waiting for Team Leader'] : undefined,
  });

  if (row.status === 'pending_super_admin') {
    events.push({
      id: 'queue-sa',
      at: row.createdAt,
      title: 'Return pending Super Admin',
      tone: 'return',
      extras: ['Waiting for confirmation'],
    });
  }

  if (row.status === 'received') {
    events.push({
      id: 'received',
      at: row.approvedAt || row.createdAt,
      title: 'Return received',
      tone: 'success',
      actorLabel: 'Received by',
      actorName: row.approvedByName || 'Reviewer',
      extras: ['Stock moved to team leader'],
    });
  }

  if (row.status === 'rejected') {
    events.push({
      id: 'rejected',
      at: row.rejectedAt || row.createdAt,
      title: 'Return rejected',
      tone: 'danger',
      actorLabel: 'Rejected by',
      actorName: row.rejectedByName || 'Reviewer',
      extras: row.rejectionNote?.trim() ? [row.rejectionNote.trim()] : undefined,
    });
  } else if (row.status === 'cancelled') {
    events.push({
      id: 'cancelled',
      at: row.rejectedAt || row.createdAt,
      title: 'Return cancelled',
      tone: 'danger',
    });
  }

  return events;
}

function EventIcon({ tone }: { tone: TimelineEvent['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const TONE_CLASS: Record<TimelineEvent['tone'], { wrap: string; rail: string }> = {
  neutral: { wrap: 'border-muted-foreground/30 bg-muted text-muted-foreground', rail: 'bg-border' },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-700', rail: 'bg-emerald-200' },
  danger: { wrap: 'border-red-200 bg-red-50 text-red-700', rail: 'bg-red-200' },
  return: { wrap: 'border-amber-200 bg-amber-50 text-amber-700', rail: 'bg-amber-200' },
};

function HandoverItems({ row }: { row: ReturnLeaderHandover }) {
  const groups = groupLinesByBrand(
    row.lines.map((line) => ({
      brandName: line.brandName,
      variantName: line.variantName,
      variantType: line.variantType,
      quantity: line.quantity,
      variantId: line.variantId,
      brandId: line.brandId,
      variantTypeId: line.variantTypeId,
    }))
  );
  if (groups.length === 0) return null;
  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold">Returned</p>
      {groups.map((group) => (
        <BrandReturnedTable
          key={`${row.id}-${group.brandName}`}
          brandName={group.brandName}
          variants={group.variants}
        />
      ))}
    </div>
  );
}

export function ReturnLeaderTimeline({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ReturnLeaderHandover | null;
}) {
  const events = row ? buildHandoverTimelineEvents(row) : [];
  const qty = row ? getReturnLeaderLineQty(row) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <RotateCcw className="h-5 w-5 text-muted-foreground" />
            Returned timeline
            {row ? (
              <Badge variant="outline" className={`font-normal ${returnLeaderStatusBadgeClass(row.status)}`}>
                {returnLeaderStatusLabel(row.status)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {row
              ? `${row.returnNumber} · ${row.submittedByName} · ${qty} unit${qty === 1 ? '' : 's'}`
              : 'Return to leader events'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          ) : (
            <ol className="space-y-0">
              {events.map((event, index) => {
                const tone = TONE_CLASS[event.tone];
                const isLast = index === events.length - 1;
                return (
                  <li key={event.id} className="relative flex gap-3">
                    <div className="flex flex-col items-center shrink-0 w-7">
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full border shrink-0',
                          tone.wrap
                        )}
                      >
                        <EventIcon tone={event.tone} />
                      </span>
                      {!isLast ? (
                        <span className={cn('mt-1 w-px flex-1 min-h-[18px]', tone.rail)} aria-hidden />
                      ) : null}
                    </div>
                    <div className={cn('min-w-0 flex-1 space-y-0.5', !isLast && 'pb-4')}>
                      <p className="text-sm font-medium leading-5">{event.title}</p>
                      <p className="text-xs text-muted-foreground">{formatWhen(event.at)}</p>
                      {event.actorName ? (
                        <p className="text-xs text-muted-foreground">
                          {event.actorLabel || 'By'}{' '}
                          <span className="font-medium text-foreground">{event.actorName}</span>
                        </p>
                      ) : null}
                      {event.extras?.map((extra) => (
                        <p key={extra} className="text-xs text-muted-foreground">
                          {extra}
                        </p>
                      ))}
                      {event.showItems && row ? (
                        <details open className="mt-0.5 group">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <HandoverItems row={row} />
                        </details>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
