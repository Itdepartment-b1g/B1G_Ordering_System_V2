import { CheckCircle2, ChevronDown, Clock, RotateCcw, ShoppingCart, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
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
import type { Order } from '../OrderContext';
import {
  formatClientReturnPeso,
  formatClientReturnReason,
  formatClientReturnType,
  getClientReturnRefundAmount,
  getPreviewReturnLineQty,
  type PreviewClientReturn,
} from './clientReturnPreview';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturnsForOrder,
} from './clientReturnApi';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnPayoutProofButton } from './ClientReturnPayoutProofDialog';

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: 'neutral' | 'success' | 'danger' | 'return';
  returnId?: string;
  showItems?: boolean;
  actorLabel?: string;
  actorName?: string;
  extras?: string[];
  showPayoutPhotos?: boolean;
};

function returnEvent(
  cr: PreviewClientReturn,
  id: string,
  at: string,
  title: string,
  tone: TimelineEvent['tone'],
  options?: {
    showItems?: boolean;
    actorLabel?: string;
    actorName?: string;
    extras?: string[];
    showPayoutPhotos?: boolean;
  }
): TimelineEvent {
  return {
    id: `${cr.id}:${id}`,
    returnId: cr.id,
    at,
    title: `${title} · ${cr.returnNumber}`,
    tone,
    showItems: options?.showItems,
    actorLabel: options?.actorLabel,
    actorName: options?.actorName,
    extras: options?.extras,
    showPayoutPhotos: options?.showPayoutPhotos,
  };
}

function queueEvent(
  cr: PreviewClientReturn,
  id: string,
  at: string,
  waiting: boolean,
  pendingTitle: string,
  sentTitle: string,
  waitingExtra?: string
): TimelineEvent {
  return returnEvent(cr, id, at, waiting ? pendingTitle : sentTitle, 'return', {
    extras: waiting && waitingExtra ? [waitingExtra] : undefined,
  });
}

function buildReturnTimelineEvents(cr: PreviewClientReturn): TimelineEvent[] {
  const kind = formatClientReturnType(cr.returnType);
  const events: TimelineEvent[] = [
    returnEvent(cr, 'filed', cr.createdAt, `${kind} filed`, 'return', {
      showItems: true,
      actorLabel: 'Filed by',
      actorName: cr.returnedByName,
    }),
  ];

  if (cr.returnType === 'refund') {
    const waitingSa = cr.status === 'pending_super_admin';
    const saApproved = !!(cr.saApprovedAt || cr.saApprovedByName);
    const waitingFinance = cr.status === 'pending_finance';
    const financeApproved = cr.status === 'posted';
    const reachedFinance =
      waitingFinance ||
      financeApproved ||
      (saApproved && (cr.status === 'rejected' || cr.status === 'cancelled'));

    events.push(
      queueEvent(
        cr,
        'queue-sa',
        cr.createdAt,
        waitingSa,
        'Refund pending Super Admin',
        'Sent to Super Admin'
      )
    );

    if (saApproved) {
      events.push(
        returnEvent(cr, 'sa', cr.saApprovedAt || cr.createdAt, 'Refund approved by Super Admin', 'success', {
          actorLabel: 'Approved by',
          actorName: cr.saApprovedByName || 'Super Admin',
        })
      );
    }

    if (reachedFinance) {
      events.push(
        queueEvent(
          cr,
          'queue-finance',
          cr.saApprovedAt || cr.createdAt,
          waitingFinance,
          'Refund pending Finance',
          'Sent to Finance',
          'Waiting for Finance'
        )
      );
    }

    if (financeApproved) {
      events.push(
        returnEvent(cr, 'finance', cr.approvedAt || cr.createdAt, 'Refund approved by Finance', 'success', {
          actorLabel: 'Approved by',
          actorName: cr.approvedByName || 'Finance',
          extras: ['Refund amount posted', 'Returned stock recorded'],
          showPayoutPhotos: true,
        })
      );
    }
  } else {
    const waitingTl = cr.status === 'pending_leader';
    events.push(
      queueEvent(cr, 'queue-tl', cr.createdAt, waitingTl, 'Change item pending TL', 'Sent to TL')
    );

    if (cr.status === 'posted') {
      events.push(
        returnEvent(
          cr,
          'posted',
          cr.approvedAt || cr.createdAt,
          'Change item approved by Team Leader',
          'success',
          {
            actorLabel: 'Approved by',
            actorName: cr.approvedByName || 'Team leader',
          }
        )
      );
    }
  }

  if (cr.status === 'rejected') {
    events.push(
      returnEvent(cr, 'rejected', cr.rejectedAt || cr.createdAt, `${kind} rejected`, 'danger', {
        actorLabel: 'Rejected by',
        actorName: cr.rejectedByName || 'Reviewer',
      })
    );
  } else if (cr.status === 'cancelled') {
    events.push(returnEvent(cr, 'cancelled', cr.rejectedAt || cr.createdAt, `${kind} cancelled`, 'danger'));
  }

  return events;
}

function formatWhen(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function buildTimelineEvents(order: Order, returns: PreviewClientReturn[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: 'created',
      at: order.createdAt || order.date,
      title: 'Order created',
      detail: `${order.orderNumber} · ${order.agentName || 'Agent'}`,
      tone: 'neutral',
    },
  ];

  for (const cr of returns) {
    events.push(...buildReturnTimelineEvents(cr));
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function EventIcon({ tone }: { tone: TimelineEvent['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5" />;
  if (tone === 'return') return <Clock className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const TONE_CLASS: Record<TimelineEvent['tone'], { wrap: string; rail: string }> = {
  neutral: { wrap: 'border-muted-foreground/30 bg-muted text-muted-foreground', rail: 'bg-border' },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-700', rail: 'bg-emerald-200' },
  danger: { wrap: 'border-red-200 bg-red-50 text-red-700', rail: 'bg-red-200' },
  return: { wrap: 'border-amber-200 bg-amber-50 text-amber-700', rail: 'bg-amber-200' },
};

function TimelineMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground break-words">{value}</dd>
    </div>
  );
}

function extraMetaCells(extras?: string[]): Array<{ label: string; value: string }> {
  return (extras || []).filter(Boolean).map((line) => {
    if (line === 'Refund amount posted') return { label: 'Refund', value: 'Posted' };
    if (line === 'Returned stock recorded') return { label: 'Stock', value: 'Recorded' };
    if (line === 'Waiting for Finance') return { label: 'Status', value: 'Waiting for Finance' };
    return { label: 'Detail', value: line };
  });
}

function ReturnEventMeta({
  cr,
  actorLabel,
  actorName,
  extras,
}: {
  cr: PreviewClientReturn;
  actorLabel?: string;
  actorName?: string;
  extras?: string[];
}) {
  const qty = getPreviewReturnLineQty(cr);
  const cells = [
    { label: 'Client name', value: cr.clientName || '—' },
    { label: 'Type', value: formatClientReturnType(cr.returnType) },
    { label: 'Unit', value: `${qty}` },
    {
      label: 'Price',
      value:
        cr.returnType === 'refund' ? formatClientReturnPeso(getClientReturnRefundAmount(cr)) : '—',
    },
    { label: actorLabel || 'Approved by', value: actorName || '—' },
    { label: 'Note', value: cr.notes?.trim() || '—' },
    { label: 'Reason', value: formatClientReturnReason(cr.reason) },
    ...extraMetaCells(extras),
  ].slice(0, 9);

  return (
    <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
      {cells.map((cell) => (
        <TimelineMetaRow key={`${cell.label}-${cell.value}`} label={cell.label} value={cell.value} />
      ))}
    </dl>
  );
}

function ReturnEventPayoutPhotos({ cr }: { cr: PreviewClientReturn }) {
  if ((cr.payoutPhotos?.length ?? 0) === 0) {
    return <p className="pt-2 text-xs text-muted-foreground">No cash-sent proof attached.</p>;
  }

  return (
    <div className="pt-2">
      <ClientReturnPayoutProofButton row={cr} />
    </div>
  );
}

function ReturnEventItems({ cr }: { cr: PreviewClientReturn }) {
  const returnedGroups = groupLinesByBrand(cr.lines);
  const changeGroups = groupLinesByBrand(cr.changeLines || []);
  if (returnedGroups.length === 0 && changeGroups.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {returnedGroups.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Returned</p>
          {returnedGroups.map((group) => (
            <BrandReturnedTable
              key={`ret-${cr.id}-${group.brandName}`}
              brandName={group.brandName}
              variants={group.variants}
            />
          ))}
        </div>
      ) : null}
      {changeGroups.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold">Change item</p>
          {changeGroups.map((group) => (
            <BrandReturnedTable
              key={`chg-${cr.id}-${group.brandName}`}
              brandName={group.brandName}
              variants={group.variants}
              qtyClassName="text-emerald-700"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ClientOrderReturnTimelineProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order | null;
};

export function ClientOrderReturnTimeline({ open, onOpenChange, order }: ClientOrderReturnTimelineProps) {
  const { data: returns = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'order', order?.id],
    enabled: open && !!order?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchClientOrderReturnsForOrder(order!.id),
  });
  const events = order ? buildTimelineEvents(order, returns) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            Order timeline
            <Badge variant="outline" className="font-normal">
              {events.length} event{events.length === 1 ? '' : 's'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {order ? `${order.orderNumber} · ${order.clientName}` : 'Order events'}
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
                const cr = event.returnId
                  ? returns.find((row) => row.id === event.returnId)
                  : undefined;
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
                      {cr ? (
                        <details open className="mt-0.5 group">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            Details
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="pt-1">
                            <ReturnEventMeta
                              cr={cr}
                              actorLabel={event.actorLabel}
                              actorName={event.actorName}
                              extras={event.extras}
                            />
                            {event.showItems ? <ReturnEventItems cr={cr} /> : null}
                            {event.showPayoutPhotos ? <ReturnEventPayoutPhotos cr={cr} /> : null}
                          </div>
                        </details>
                      ) : event.detail ? (
                        <p className="text-xs text-muted-foreground leading-5">{event.detail}</p>
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
