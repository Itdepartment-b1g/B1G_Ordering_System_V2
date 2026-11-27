import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquareText,
  PackageCheck,
  PackageX,
  Send,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import { exportTlTdrPdf } from './exportTlTransferPdfs';
import {
  dispatchEventTitle,
  tlTransferShortQuantity,
  withGrossDispatchedQuantities,
  type TlTransferHistoryEvent,
  type TlTransferHistoryEventType,
  type TlTransferHistoryItem,
  type TlTransferHistoryLine,
  type TlTransferHistoryPayload,
} from './tlTransferHistory';

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function unitLabel(n: number): string {
  return `${n.toLocaleString()} unit${n === 1 ? '' : 's'}`;
}

function itemLabel(n: number): string {
  return `${n.toLocaleString()} item${n === 1 ? '' : 's'}`;
}

function linesTotalQty(lines: TlTransferHistoryLine[] | undefined): number {
  return (lines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
}

function eventTitle(event: TlTransferHistoryEvent): string {
  switch (event.type) {
    case 'created':
      return 'Request created';
    case 'admin_approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'dispatched':
      return dispatchEventTitle(event);
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'shortage_opened':
      return 'Under investigation';
    case 'shortage_resolved_redeliver':
      return 'Found · dispatch again';
    case 'shortage_resolved_found_keep':
      return 'Found · kept';
    case 'shortage_resolved_write_off':
      return 'Write off';
    case 'shortage_resolved_write_off_replace':
      return 'Write off & replace';
    default:
      return 'Event';
  }
}

function eventSummary(event: TlTransferHistoryEvent, items?: TlTransferHistoryItem[]): string | null {
  if (event.type === 'created') {
    const requested = items?.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0) ?? 0;
    if (!items?.length) return null;
    return `Requested ${unitLabel(requested)} across ${itemLabel(items.length)}`;
  }

  if (event.type === 'admin_approved') {
    const qty = linesTotalQty(event.lines);
    const count = event.lines?.length ?? 0;
    if (qty > 0) return `Approved ${unitLabel(qty)} · ${itemLabel(count)}`;
    return 'Approved — awaiting dispatch';
  }

  if (event.type === 'dispatched') {
    const qty = linesTotalQty(event.lines);
    const count = event.lines?.length ?? 0;
    const fromName = event.fromName?.trim();
    return fromName
      ? `Dispatched ${unitLabel(qty)} · ${itemLabel(count)} · from ${fromName}`
      : `Dispatched ${unitLabel(qty)} · ${itemLabel(count)}`;
  }

  if (event.type === 'receive_confirmed') {
    const qty = linesTotalQty(event.lines);
    const fromName = event.fromName?.trim();
    const fromPart = fromName ? ` · from ${fromName}` : '';
    if ((event.shortQuantity ?? 0) > 0) {
      return `Received ${unitLabel(qty)} · ${unitLabel(event.shortQuantity || 0)} still left on this TDR${fromPart}`;
    }
    return `Received ${unitLabel(qty)} · complete${fromPart}`;
  }

  if (event.type === 'rejected') {
    return event.note?.trim()
      ? `Transfer was rejected${event.byName ? ` by ${event.byName}` : ''}`
      : 'Transfer was rejected';
  }

  if (event.type === 'cancelled') {
    return 'Transfer was cancelled';
  }

  if (event.type === 'shortage_opened') {
    const qty = linesTotalQty(event.lines) || event.shortQuantity || 0;
    const reasons = [...new Set((event.lines ?? []).map((line) => line.reason).filter(Boolean))];
    const reasonPart = reasons.length === 1 ? ` · ${reasons[0]}` : '';
    return `${unitLabel(qty)} short${reasonPart}`;
  }

  if (event.type === 'shortage_resolved_redeliver') {
    return `Found ${unitLabel(event.shortQuantity || linesTotalQty(event.lines))} · dispatch again from Incoming`;
  }
  if (event.type === 'shortage_resolved_found_keep') {
    return `Found ${unitLabel(event.shortQuantity || linesTotalQty(event.lines))} · kept by dispatcher`;
  }
  if (event.type === 'shortage_resolved_write_off_replace') {
    return `Wrote off ${unitLabel(event.shortQuantity || linesTotalQty(event.lines))} · dispatch replacement from Incoming`;
  }
  if (event.type === 'shortage_resolved_write_off') {
    return `Wrote off ${unitLabel(event.shortQuantity || linesTotalQty(event.lines))} · no replacement`;
  }

  return null;
}

function EventIcon({ type, className }: { type: TlTransferHistoryEventType; className?: string }) {
  const iconClass = cn('h-3.5 w-3.5', className);
  if (type === 'created') return <Clock className={iconClass} />;
  if (type === 'admin_approved') return <CheckCircle2 className={iconClass} />;
  if (type === 'dispatched') return <Send className={iconClass} />;
  if (type === 'receive_confirmed') return <PackageCheck className={iconClass} />;
  if (type === 'shortage_opened') return <AlertTriangle className={iconClass} />;
  if (type === 'shortage_resolved_write_off') return <PackageX className={iconClass} />;
  if (type === 'rejected' || type === 'cancelled') return <XCircle className={iconClass} />;
  return <PackageCheck className={iconClass} />;
}

function eventTone(type: TlTransferHistoryEventType): { rail: string; iconWrap: string } {
  switch (type) {
    case 'admin_approved':
      return { rail: 'bg-sky-500', iconWrap: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'dispatched':
      return { rail: 'bg-blue-500', iconWrap: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'receive_confirmed':
    case 'shortage_resolved_redeliver':
    case 'shortage_resolved_found_keep':
    case 'shortage_resolved_write_off_replace':
      return { rail: 'bg-emerald-500', iconWrap: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'shortage_opened':
      return { rail: 'bg-amber-500', iconWrap: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'shortage_resolved_write_off':
      return { rail: 'bg-orange-500', iconWrap: 'bg-orange-50 text-orange-800 border-orange-200' };
    case 'rejected':
    case 'cancelled':
      return { rail: 'bg-red-500', iconWrap: 'bg-red-50 text-red-700 border-red-200' };
    case 'created':
    default:
      return {
        rail: 'bg-muted-foreground/40',
        iconWrap: 'bg-muted text-muted-foreground border-border',
      };
  }
}

function qtyHeaderForEvent(type: TlTransferHistoryEventType): string {
  if (type === 'created') return 'Requested';
  if (type === 'admin_approved') return 'Approved';
  if (type === 'receive_confirmed') return 'Received';
  if (type === 'dispatched') return 'Dispatched';
  if (
    type === 'shortage_opened' ||
    type === 'shortage_resolved_redeliver' ||
    type === 'shortage_resolved_found_keep' ||
    type === 'shortage_resolved_write_off' ||
    type === 'shortage_resolved_write_off_replace'
  ) {
    return 'Short';
  }
  return 'Qty';
}

function TimelineStep({
  type,
  isLast,
  children,
}: {
  type: TlTransferHistoryEventType;
  isLast: boolean;
  children: ReactNode;
}) {
  const tone = eventTone(type);
  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0 w-7">
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full border shrink-0',
            tone.iconWrap
          )}
        >
          <EventIcon type={type} />
        </span>
        {!isLast ? (
          <span className={cn('mt-1 w-px flex-1 min-h-[12px]', tone.rail)} aria-hidden />
        ) : null}
      </div>
      <div className={cn('min-w-0 flex-1 space-y-2', !isLast && 'pb-4')}>{children}</div>
    </li>
  );
}

function DetailsToggle({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 mr-1 transition-transform', open && 'rotate-180')}
          />
          {open ? 'Hide' : 'Show'} {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function HistoryLinesTable({
  lines,
  qtyHeader,
}: {
  lines: TlTransferHistoryLine[];
  qtyHeader: string;
}) {
  if (lines.length === 0) return null;
  const showReason = lines.some((line) => !!line.reason?.trim());
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">SKU</TableHead>
            {showReason ? <TableHead className="h-8 text-xs">Reason</TableHead> : null}
            <TableHead className="h-8 text-xs text-right">{qtyHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow key={`${line.itemId || line.label}-${index}`} className="hover:bg-transparent">
              <TableCell className="py-2 text-xs">{line.label}</TableCell>
              {showReason ? (
                <TableCell className="py-2 text-xs text-muted-foreground">
                  {line.reason?.trim() || '—'}
                </TableCell>
              ) : null}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {line.quantity.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EventAttachments({
  proofImageUrls,
  signatureDataUrl,
}: {
  proofImageUrls?: string[];
  signatureDataUrl?: string;
}) {
  const urls = (proofImageUrls || []).filter(Boolean);
  if (urls.length === 0 && !signatureDataUrl) return null;
  const parts: string[] = [];
  if (urls.length === 1) parts.push('package photo');
  if (urls.length > 1) parts.push(`${urls.length} package photos`);
  if (signatureDataUrl) parts.push('signature');
  return (
    <DetailsToggle label={parts.join(' & ')}>
      <div className="flex flex-wrap gap-3">
        {urls.map((url, index) => (
          <div key={`${url}-${index}`} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              {urls.length > 1 ? `Package ${index + 1}` : 'Package photo'}
            </p>
            <img
              src={url}
              alt={urls.length > 1 ? `Package ${index + 1}` : 'Package photo'}
              className="h-40 w-40 max-w-full rounded-md object-cover border bg-muted/30"
            />
          </div>
        ))}
        {signatureDataUrl ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Signature</p>
            <img
              src={signatureDataUrl}
              alt="Signature"
              className="h-28 w-56 max-w-full rounded-md object-contain bg-white border"
            />
          </div>
        ) : null}
      </div>
    </DetailsToggle>
  );
}

function TransferStatusSummary({
  items,
  history,
}: {
  items: TlTransferHistoryItem[];
  history: TlTransferHistoryEvent[];
}) {
  const displayItems = withGrossDispatchedQuantities(items, history);
  const requested = displayItems.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0);
  const dispatched = displayItems.reduce((sum, item) => sum + Math.max(0, item.dispatchedQuantity), 0);
  const received = displayItems.reduce((sum, item) => sum + Math.max(0, item.receivedQuantity), 0);
  const shortDisplay = tlTransferShortQuantity(displayItems, history);
  const chips = [
    { label: 'Requested', value: requested, tone: 'border-slate-200 bg-slate-100 text-slate-700' },
    {
      label: 'Dispatched',
      value: dispatched,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      title:
        'Units that left your inventory. Found → redeliver is not double-counted; write off & replace is.',
    },
    { label: 'Received', value: received, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    {
      label: 'Short',
      value: shortDisplay,
      tone:
        shortDisplay > 0
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-600',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge
            key={chip.label}
            variant="outline"
            title={'title' in chip ? chip.title : undefined}
            className={cn('gap-1.5 font-normal tabular-nums px-2.5 py-1', chip.tone)}
          >
            <span className="opacity-80">{chip.label}</span>
            <span className="font-semibold">{chip.value.toLocaleString()}</span>
          </Badge>
        ))}
      </div>
      <div className="rounded-md border divide-y overflow-hidden">
        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
          <span>SKU</span>
          <span className="text-right">Requested</span>
          <span className="text-right">Dispatched</span>
          <span className="text-right">Received</span>
        </div>
        {displayItems.map((item) => (
          <div
            key={item.itemId}
            className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 px-3 py-2 text-sm"
          >
            <span className="truncate">{item.label}</span>
            <span className="text-right tabular-nums">{item.requestedQuantity.toLocaleString()}</span>
            <span className="text-right tabular-nums">{item.dispatchedQuantity.toLocaleString()}</span>
            <span className="text-right tabular-nums">{item.receivedQuantity.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TLTransferHistoryTimeline({
  payload,
  emptyLabel = 'No history yet.',
}: {
  payload: TlTransferHistoryPayload | null;
  emptyLabel?: string;
}) {
  const { toast } = useToast();
  const [printingEventId, setPrintingEventId] = useState<string | null>(null);
  const events = payload?.history ?? [];
  const items = payload?.items ?? [];
  const header = payload?.lines[0];

  const handlePrintTdr = async (event: TlTransferHistoryEvent) => {
    if (!payload || !header || !event.tdrNumber) return;
    setPrintingEventId(event.id);
    try {
      const receiveEvent = events.find((row) => row.type === 'receive_confirmed');
      await exportTlTdrPdf({
        tdrNumber: event.tdrNumber,
        kind: event.tdrKind || 'dispatch',
        dispatchedAt: event.at,
        requestNumber: payload.requestNumber,
        requesterName: payload.requesterName,
        sourceName: payload.sourceName,
        lines: (event.lines || []).map((line) => {
          const match = payload.lines.find((sku) => sku.id === line.itemId);
          const received =
            match?.received_quantity != null
              ? Math.min(line.quantity, Number(match.received_quantity || 0))
              : 0;
          const receiveConfirmed = match?.received_quantity != null || !!receiveEvent;
          const short = Math.max(0, line.quantity - received);
          return {
            label: line.label.includes(' · ') ? line.label.replace(' · ', ' — ') : line.label,
            dispatched: line.quantity,
            received,
            receiveConfirmed,
            shortfallReason:
              short > 0 && receiveConfirmed && match?.receive_shortfall_reason
                ? formatShortfallReasonLabel(
                    match.receive_shortfall_reason,
                    match.receive_shortfall_notes
                  )
                : null,
          };
        }),
      });
    } catch (error: unknown) {
      toast({
        title: 'Could not open TDR',
        description: error instanceof Error ? error.message : 'Failed to generate transfer receipt',
        variant: 'destructive',
      });
    } finally {
      setPrintingEventId(null);
    }
  };

  return (
    <div className="space-y-4">
      {items.length > 0 ? <TransferStatusSummary items={items} history={events} /> : null}

      {payload?.requesterName || payload?.sourceName ? (
        <div className="rounded-md border px-3 py-2 text-sm space-y-0.5">
          {payload.requesterName ? (
            <p>
              <span className="text-muted-foreground">Requested by</span>
              {' · '}
              <span className="font-medium">{payload.requesterName}</span>
            </p>
          ) : null}
          {payload.sourceName ? (
            <p>
              <span className="text-muted-foreground">From</span>
              {' · '}
              <span className="font-medium">{payload.sourceName}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Timeline</p>
          <ol className="space-y-0">
            {events.map((event, eventIndex) => {
              const isLast = eventIndex === events.length - 1;
              const summary = eventSummary(event, items);
              const lines = event.lines;
              const hasShortBadge =
                (event.type === 'receive_confirmed' || event.type === 'shortage_opened') &&
                (event.shortQuantity ?? 0) > 0;
              const shortBadgeLabel =
                event.type === 'shortage_opened'
                  ? `${(event.shortQuantity ?? 0).toLocaleString()} under investigation`
                  : `${(event.shortQuantity ?? 0).toLocaleString()} left on TDR`;
              const canPrintTdr = event.type === 'dispatched' && !!event.tdrNumber;
              const isPrinting = printingEventId === event.id;
              const showNote =
                !!event.note?.trim() &&
                event.type !== 'shortage_opened' &&
                event.type !== 'rejected';

              return (
                <TimelineStep key={event.id} type={event.type} isLast={isLast}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{eventTitle(event)}</p>
                      {summary ? (
                        <p className="text-sm text-foreground/80 leading-snug mt-0.5">{summary}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatAt(event.at)}
                        {event.byName ? ` · ${event.byName}` : ''}
                        {event.tdrNumber ? ` · ${event.tdrNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {event.awaitingReceive ? (
                        <Badge
                          variant="secondary"
                          className="border-sky-200 bg-sky-50 text-sky-900 font-medium"
                        >
                          Ready to receive
                        </Badge>
                      ) : null}
                      {hasShortBadge ? (
                        <Badge
                          variant="secondary"
                          className="border-amber-200 bg-amber-50 text-amber-900 font-medium"
                        >
                          {shortBadgeLabel}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {canPrintTdr ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!!printingEventId}
                        onClick={() => void handlePrintTdr(event)}
                      >
                        {isPrinting ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        TDR receipt
                      </Button>
                    </div>
                  ) : null}

                  {lines && lines.length > 0 ? (
                    <DetailsToggle label={`item details (${lines.length})`}>
                      <HistoryLinesTable lines={lines} qtyHeader={qtyHeaderForEvent(event.type)} />
                    </DetailsToggle>
                  ) : null}

                  <EventAttachments
                    proofImageUrls={event.proofImageUrls}
                    signatureDataUrl={event.signatureDataUrl}
                  />

                  {event.type === 'rejected' && event.note?.trim() ? (
                    <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-950">
                      <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-700" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-semibold uppercase tracking-wide text-red-800 text-[10px]">
                          Rejected{event.byName ? ` by ${event.byName}` : ''}
                        </p>
                        <p className="whitespace-pre-wrap">{event.note.trim()}</p>
                      </div>
                    </div>
                  ) : null}

                  {showNote ? (
                    <div className="flex gap-2 rounded-md border bg-muted/40 px-2.5 py-2 text-xs">
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                      <p className="whitespace-pre-wrap">{event.note?.trim()}</p>
                    </div>
                  ) : null}
                </TimelineStep>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
