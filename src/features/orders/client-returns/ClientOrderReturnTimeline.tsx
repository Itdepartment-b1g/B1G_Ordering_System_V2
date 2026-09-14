import { CheckCircle2, Clock, RotateCcw, ShoppingCart, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Order } from '../OrderContext';
import {
  formatClientReturnReason,
  getMockReturnLineQty,
  type MockClientReturn,
} from './clientReturnMock';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  fetchClientOrderReturnsForOrder,
} from './clientReturnApi';

type TimelineEvent = {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone: 'neutral' | 'success' | 'danger' | 'return';
};

function formatWhen(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function buildTimelineEvents(order: Order, returns: MockClientReturn[]): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: 'created',
      at: order.createdAt || order.date,
      title: 'Order created',
      detail: `${order.orderNumber} · ${order.agentName || 'Agent'}`,
      tone: 'neutral',
    },
  ];

  if (order.stage === 'finance_pending' || order.stage === 'agent_pending') {
    events.push({
      id: 'pending',
      at: order.createdAt || order.date,
      title: order.stage === 'finance_pending' ? 'Pending finance review' : 'Pending approval',
      tone: 'neutral',
    });
  }

  if (order.stage === 'needs_revision') {
    events.push({
      id: 'revision',
      at: order.createdAt || order.date,
      title: 'Returned for revision',
      tone: 'neutral',
    });
  }

  if (order.status === 'approved' || order.stage === 'admin_approved') {
    events.push({
      id: 'approved',
      at: order.approvedAt || order.createdAt || order.date,
      title: 'Order approved',
      detail: order.approvedByName ? `Approved by ${order.approvedByName}` : undefined,
      tone: 'success',
    });
  }

  if (order.status === 'rejected' || order.stage === 'admin_rejected' || order.stage === 'leader_rejected') {
    events.push({
      id: 'rejected',
      at: order.createdAt || order.date,
      title: 'Order rejected',
      tone: 'danger',
    });
  }

  for (const cr of returns) {
    const qty = getMockReturnLineQty(cr);
    const title =
      cr.status === 'posted'
        ? `Return posted · ${cr.returnNumber}`
        : cr.status === 'rejected'
          ? `Return rejected · ${cr.returnNumber}`
          : cr.status === 'pending_leader'
            ? `Return pending · ${cr.returnNumber}`
            : `Return cancelled · ${cr.returnNumber}`;
    events.push({
      id: cr.id,
      at: cr.status === 'posted' ? cr.approvedAt || cr.createdAt : cr.rejectedAt || cr.createdAt,
      title,
      detail: `${formatClientReturnReason(cr.reason)} · ${qty} unit${qty === 1 ? '' : 's'} · ${cr.returnedByName}${cr.notes ? ` · ${cr.notes}` : ''}`,
      tone: cr.status === 'rejected' ? 'danger' : 'return',
    });
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function EventIcon({ tone }: { tone: TimelineEvent['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5" />;
  if (tone === 'return') return <RotateCcw className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const TONE_CLASS: Record<TimelineEvent['tone'], { wrap: string; rail: string }> = {
  neutral: { wrap: 'border-muted-foreground/30 bg-muted text-muted-foreground', rail: 'bg-border' },
  success: { wrap: 'border-emerald-200 bg-emerald-50 text-emerald-700', rail: 'bg-emerald-200' },
  danger: { wrap: 'border-red-200 bg-red-50 text-red-700', rail: 'bg-red-200' },
  return: { wrap: 'border-rose-200 bg-rose-50 text-rose-700', rail: 'bg-rose-200' },
};

type ClientOrderReturnTimelineProps = {
  order: Order;
};

export function ClientOrderReturnTimeline({ order }: ClientOrderReturnTimelineProps) {
  const { data: returns = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, 'order', order.id],
    enabled: !!order.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () => fetchClientOrderReturnsForOrder(order.id),
  });
  const events = buildTimelineEvents(order, returns);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-lg">Order timeline</h4>
        <Badge variant="outline" className="font-normal">
          {events.length} event{events.length === 1 ? '' : 's'}
        </Badge>
      </div>

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
                {event.detail ? (
                  <p className="text-xs text-muted-foreground leading-5">{event.detail}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
