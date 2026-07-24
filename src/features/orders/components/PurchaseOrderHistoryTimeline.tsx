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
  Receipt,
  Send,
  Truck,
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
import {
  computePurchaseOrderShortQuantity,
  sortPurchaseOrderHistoryEvents,
  type PurchaseOrderHistoryEvent,
  type PurchaseOrderHistoryItem,
  type PurchaseOrderHistoryLine,
} from '../purchaseOrderHistoryTypes';
import type { PurchaseOrder } from '../types';
import {
  printDrReceiptForDelivery,
  printReceiveReceiptForDelivery,
} from '../utils/printHistoryDeliveryReceipts';

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

function eventTitle(event: PurchaseOrderHistoryEvent): string {
  switch (event.type) {
    case 'created':
      return 'PO created';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'dispatched':
      return 'Dispatched';
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'cancelled':
      return 'DR cancelled';
    case 'shortage_opened':
      return 'Under investigation';
    case 'shortage_resolved_redeliver':
      return 'Found & redeliver';
    case 'shortage_resolved_write_off_replace':
      return 'Write off & replace';
    case 'shortage_resolved_write_off':
      return 'Write off';
    default:
      return 'Event';
  }
}

function linesTotalQty(lines: PurchaseOrderHistoryLine[] | undefined): number {
  return (lines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
}

function unitLabel(n: number): string {
  return `${n.toLocaleString()} unit${n === 1 ? '' : 's'}`;
}

function variantLabel(n: number): string {
  return `${n.toLocaleString()} item${n === 1 ? '' : 's'}`;
}

function eventSummary(
  event: PurchaseOrderHistoryEvent,
  items?: PurchaseOrderHistoryItem[]
): string | null {
  if (event.type === 'created') {
    if (!items?.length) return null;
    const ordered = items.reduce((sum, item) => sum + Math.max(0, item.orderedQuantity), 0);
    return `Ordered ${unitLabel(ordered)} across ${variantLabel(items.length)}`;
  }

  if (event.type === 'approved') {
    const qty = linesTotalQty(event.lines);
    const count = event.lines?.length ?? 0;
    if (qty > 0) return `Approved ${unitLabel(qty)} · ${variantLabel(count)}`;
    return 'Approved for fulfillment';
  }

  if (event.type === 'dispatched') {
    const qty = linesTotalQty(event.lines);
    const count = event.lines?.length ?? 0;
    const fromWh = event.warehouseLocationName?.trim();
    return fromWh
      ? `Dispatched ${unitLabel(qty)} · ${variantLabel(count)} · from ${fromWh}`
      : `Dispatched ${unitLabel(qty)} · ${variantLabel(count)}`;
  }

  if (event.type === 'receive_confirmed') {
    const qty = linesTotalQty(event.lines);
    const fromWh = event.warehouseLocationName?.trim();
    const fromPart = fromWh ? ` · from ${fromWh}` : '';
    if ((event.shortQuantity ?? 0) > 0) {
      return `Received ${unitLabel(qty)} · ${unitLabel(event.shortQuantity || 0)} still left on this DR${fromPart}`;
    }
    return `Received ${unitLabel(qty)} · complete${fromPart}`;
  }

  if (event.type === 'rejected') {
    return 'Purchase order was rejected';
  }

  if (event.type === 'cancelled') {
    const qty = linesTotalQty(event.lines);
    if (qty > 0) return `Cancelled DR · ${unitLabel(qty)} returned to warehouse`;
    return 'Delivery receipt cancelled';
  }

  if (event.type === 'shortage_opened') {
    const qty = linesTotalQty(event.lines) || event.shortQuantity || 0;
    const reasons = [
      ...new Set((event.lines ?? []).map((l) => l.reason).filter(Boolean)),
    ] as string[];
    const reasonPart = reasons.length === 1 ? ` · ${reasons[0]}` : '';
    return `${unitLabel(qty)} short sent to warehouse${reasonPart}`;
  }

  if (event.type === 'shortage_resolved_redeliver') {
    const qty = linesTotalQty(event.lines) || event.shortQuantity || 0;
    return `Found ${unitLabel(qty)} · stock restored · PO reopened for another DR`;
  }

  if (event.type === 'shortage_resolved_write_off_replace') {
    const qty = linesTotalQty(event.lines) || event.shortQuantity || 0;
    return `Wrote off ${unitLabel(qty)} · PO reopened for replacement DR`;
  }

  if (event.type === 'shortage_resolved_write_off') {
    const qty = linesTotalQty(event.lines) || event.shortQuantity || 0;
    return `Wrote off ${unitLabel(qty)} · no redispatch`;
  }

  return null;
}

function EventIcon({
  type,
  className,
}: {
  type: PurchaseOrderHistoryEvent['type'];
  className?: string;
}) {
  const iconClass = cn('h-3.5 w-3.5', className);
  if (type === 'created') return <Clock className={iconClass} />;
  if (type === 'approved') return <Send className={iconClass} />;
  if (type === 'dispatched') return <Truck className={iconClass} />;
  if (type === 'receive_confirmed') return <PackageCheck className={iconClass} />;
  if (type === 'shortage_opened') return <AlertTriangle className={iconClass} />;
  if (
    type === 'shortage_resolved_redeliver' ||
    type === 'shortage_resolved_write_off_replace'
  ) {
    return <PackageCheck className={iconClass} />;
  }
  if (type === 'shortage_resolved_write_off') return <PackageX className={iconClass} />;
  if (type === 'rejected' || type === 'cancelled') return <XCircle className={iconClass} />;
  return <CheckCircle2 className={iconClass} />;
}

function eventTone(type: PurchaseOrderHistoryEvent['type']): {
  rail: string;
  iconWrap: string;
} {
  switch (type) {
    case 'approved':
    case 'dispatched':
      return {
        rail: 'bg-blue-500',
        iconWrap: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'receive_confirmed':
    case 'shortage_resolved_redeliver':
      return {
        rail: 'bg-emerald-500',
        iconWrap: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'shortage_opened':
    case 'shortage_resolved_write_off_replace':
      return {
        rail: 'bg-amber-500',
        iconWrap: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'shortage_resolved_write_off':
    case 'rejected':
    case 'cancelled':
      return {
        rail: 'bg-red-500',
        iconWrap: 'bg-red-50 text-red-700 border-red-200',
      };
    case 'created':
    default:
      return {
        rail: 'bg-muted-foreground/40',
        iconWrap: 'bg-muted text-muted-foreground border-border',
      };
  }
}

function qtyHeaderForEvent(type: PurchaseOrderHistoryEvent['type']): string {
  if (type === 'receive_confirmed') return 'Received';
  if (type === 'dispatched') return 'Dispatched';
  if (type === 'cancelled') return 'Cancelled';
  if (type === 'approved' || type === 'created') return 'Ordered';
  if (
    type === 'shortage_opened' ||
    type === 'shortage_resolved_redeliver' ||
    type === 'shortage_resolved_write_off_replace' ||
    type === 'shortage_resolved_write_off'
  ) {
    return 'Short';
  }
  return 'Qty';
}

function HistoryLinesTable({
  lines,
  qtyHeader,
}: {
  lines: PurchaseOrderHistoryLine[];
  qtyHeader: string;
}) {
  if (lines.length === 0) return null;
  const showReason = lines.some((line) => !!line.reason?.trim());

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">Brand</TableHead>
            <TableHead className="h-8 text-xs">Variant</TableHead>
            {showReason ? <TableHead className="h-8 text-xs">Reason</TableHead> : null}
            <TableHead className="h-8 text-xs text-right">{qtyHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow
              key={`${line.variantId}-${line.quantity}-${index}`}
              className="hover:bg-transparent"
            >
              <TableCell className="py-2 text-xs">{line.brandName?.trim() || '—'}</TableCell>
              <TableCell className="py-2 text-xs">{line.variantName}</TableCell>
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

function OrderStatusSummary({
  items,
  history = [],
}: {
  items: PurchaseOrderHistoryItem[];
  history?: PurchaseOrderHistoryEvent[];
}) {
  const ordered = items.reduce((sum, item) => sum + Math.max(0, item.orderedQuantity), 0);
  const dispatched = items.reduce((sum, item) => sum + Math.max(0, item.dispatchedQuantity), 0);
  const received = items.reduce((sum, item) => sum + Math.max(0, item.receivedQuantity), 0);
  const shortDisplay = computePurchaseOrderShortQuantity(items, history);

  const chips: { label: string; value: number; tone: string; title?: string }[] = [
    {
      label: 'Ordered',
      value: ordered,
      tone: 'border-slate-200 bg-slate-100 text-slate-700',
    },
    {
      label: 'Dispatched',
      value: dispatched,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      title:
        'Unique fulfillment units (Found & redeliver redispatches are not double-counted; Write off & replace redispatches are)',
    },
    {
      label: 'Received',
      value: received,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    },
    {
      label: 'Short',
      value: shortDisplay,
      tone:
        shortDisplay > 0
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-600',
      title:
        'Units still outstanding vs ordered (write-off & replace redispatches do not inflate Short; pure write-offs are excluded)',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge
            key={chip.label}
            variant="outline"
            title={chip.title}
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
          <span className="text-right">Ordered</span>
          <span className="text-right">Dispatched</span>
          <span className="text-right">Received</span>
        </div>
        {items.map((item) => (
          <div
            key={item.variantId}
            className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 px-3 py-2 text-sm items-center"
          >
            <span className="truncate font-medium">{item.variantName}</span>
            <span className="text-right tabular-nums">{item.orderedQuantity}</span>
            <span className="text-right tabular-nums">{item.dispatchedQuantity}</span>
            <span className="text-right tabular-nums">{item.receivedQuantity}</span>
          </div>
        ))}
      </div>
    </div>
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

function EventAttachments({
  proofImageDataUrl,
  signatureDataUrl,
  signatureLabel,
}: {
  proofImageDataUrl?: string;
  signatureDataUrl?: string;
  signatureLabel: string;
}) {
  if (!proofImageDataUrl && !signatureDataUrl) return null;

  const parts: string[] = [];
  if (proofImageDataUrl) parts.push('proof photo');
  if (signatureDataUrl) parts.push('signature');

  return (
    <DetailsToggle label={parts.join(' & ')}>
      <div className="flex flex-wrap gap-3">
        {proofImageDataUrl ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              Proof photo
            </p>
            <img
              src={proofImageDataUrl}
              alt="Proof"
              className="h-40 w-40 max-w-full rounded-md object-cover border bg-muted/30"
            />
          </div>
        ) : null}
        {signatureDataUrl ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {signatureLabel}
            </p>
            <img
              src={signatureDataUrl}
              alt={signatureLabel}
              className="h-28 w-56 max-w-full rounded-md object-contain bg-white border"
            />
          </div>
        ) : null}
      </div>
    </DetailsToggle>
  );
}

function TimelineStep({
  type,
  isLast,
  children,
}: {
  type: PurchaseOrderHistoryEvent['type'];
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

type PurchaseOrderHistoryTimelineProps = {
  history: PurchaseOrderHistoryEvent[] | undefined;
  items?: PurchaseOrderHistoryItem[];
  /** When set, Dispatched / Receive confirmed events can open DR / received receipts. */
  purchaseOrder?: PurchaseOrder | null;
  emptyLabel?: string;
};

export function PurchaseOrderHistoryTimeline({
  history,
  items,
  purchaseOrder = null,
  emptyLabel = 'No history yet.',
}: PurchaseOrderHistoryTimelineProps) {
  const { toast } = useToast();
  const [printingEventId, setPrintingEventId] = useState<string | null>(null);

  const events = sortPurchaseOrderHistoryEvents(history ?? [], 'desc');

  const handlePrintDr = async (event: PurchaseOrderHistoryEvent) => {
    if (!purchaseOrder || !event.deliveryId) return;
    setPrintingEventId(event.id);
    try {
      await printDrReceiptForDelivery(purchaseOrder, event.deliveryId);
    } catch (e: unknown) {
      toast({
        title: 'Could not open DR',
        description: e instanceof Error ? e.message : 'Failed to generate delivery receipt',
        variant: 'destructive',
      });
    } finally {
      setPrintingEventId(null);
    }
  };

  const handlePrintReceiveReceipt = async (event: PurchaseOrderHistoryEvent) => {
    if (!purchaseOrder || !event.deliveryId) return;
    setPrintingEventId(event.id);
    try {
      await printReceiveReceiptForDelivery(purchaseOrder, event.deliveryId);
    } catch (e: unknown) {
      toast({
        title: 'Could not open received receipt',
        description: e instanceof Error ? e.message : 'Failed to generate received receipt',
        variant: 'destructive',
      });
    } finally {
      setPrintingEventId(null);
    }
  };

  return (
    <div className="space-y-4">
      {items && items.length > 0 ? (
        <OrderStatusSummary items={items} history={history} />
      ) : null}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Timeline</p>
          <ol className="space-y-0">
            {events.map((event, eventIndex) => {
              const isLast = eventIndex === events.length - 1;
              const lines = event.lines;
              const summary = eventSummary(event, items);
              const hasShortBadge =
                (event.type === 'receive_confirmed' || event.type === 'shortage_opened') &&
                (event.shortQuantity ?? 0) > 0;
              const shortBadgeLabel =
                event.type === 'shortage_opened'
                  ? `${(event.shortQuantity ?? 0).toLocaleString()} under investigation`
                  : `${(event.shortQuantity ?? 0).toLocaleString()} left on DR`;
              const showReadyToReceive =
                event.type === 'dispatched' && !!event.awaitingReceive;
              const showNote = !!event.note?.trim();
              const canPrintDr =
                !!purchaseOrder && event.type === 'dispatched' && !!event.deliveryId;
              const canPrintReceiveReceipt =
                !!purchaseOrder &&
                event.type === 'receive_confirmed' &&
                !!event.deliveryId;
              const isPrinting = printingEventId === event.id;

              return (
                <TimelineStep key={event.id} type={event.type} isLast={isLast}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{eventTitle(event)}</p>
                      {summary ? (
                        <p className="text-sm text-foreground/80 leading-snug mt-0.5">
                          {summary}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatAt(event.at)}
                        {event.byName ? ` · ${event.byName}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {showReadyToReceive ? (
                        <Badge
                          variant="secondary"
                          className="border-sky-200 bg-sky-50 text-sky-900 font-medium"
                          title="This DR is dispatched and waiting for the buyer to receive"
                        >
                          Ready to receive
                        </Badge>
                      ) : null}
                      {hasShortBadge ? (
                        <Badge
                          variant="secondary"
                          className="border-amber-200 bg-amber-50 text-amber-900 font-medium"
                          title={
                            event.type === 'shortage_opened'
                              ? 'Short quantity currently under warehouse investigation'
                              : 'Units still short on this DR after receive'
                          }
                        >
                          {shortBadgeLabel}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {canPrintDr || canPrintReceiveReceipt ? (
                    <div className="flex flex-wrap gap-2">
                      {canPrintDr ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!!printingEventId}
                          onClick={() => void handlePrintDr(event)}
                        >
                          {isPrinting ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          DR receipt
                        </Button>
                      ) : null}
                      {canPrintReceiveReceipt ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!!printingEventId}
                          onClick={() => void handlePrintReceiveReceipt(event)}
                        >
                          {isPrinting ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Receipt className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Received receipt
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {lines && lines.length > 0 ? (
                    <DetailsToggle label={`item details (${lines.length})`}>
                      <HistoryLinesTable
                        lines={lines}
                        qtyHeader={qtyHeaderForEvent(event.type)}
                      />
                    </DetailsToggle>
                  ) : null}

                  {event.type === 'rejected' && event.note?.trim() ? (
                    <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-950">
                      <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-700" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-semibold uppercase tracking-wide text-red-800 text-[10px]">
                          Reason
                        </p>
                        <p className="whitespace-pre-wrap leading-snug">{event.note}</p>
                      </div>
                    </div>
                  ) : event.type === 'shortage_opened' && event.note?.trim() ? (
                    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-semibold uppercase tracking-wide text-amber-800 text-[10px]">
                          Investigation note
                        </p>
                        <p className="whitespace-pre-wrap leading-snug">{event.note}</p>
                      </div>
                    </div>
                  ) : showNote ? (
                    <div className="flex gap-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-700" />
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-semibold uppercase tracking-wide text-sky-800 text-[10px]">
                          Note
                        </p>
                        <p className="whitespace-pre-wrap leading-snug">{event.note}</p>
                      </div>
                    </div>
                  ) : null}

                  {event.type === 'receive_confirmed' || event.type === 'cancelled' ? (
                    <EventAttachments
                      proofImageDataUrl={event.proofImageDataUrl}
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel={
                        event.type === 'cancelled' ? 'Cancel signature' : 'Buyer signature'
                      }
                    />
                  ) : null}

                  {event.type === 'dispatched' ? (
                    <EventAttachments
                      proofImageDataUrl={event.proofImageDataUrl}
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel="Warehouse signature"
                    />
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
