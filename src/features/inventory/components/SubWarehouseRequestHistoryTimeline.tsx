import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  ImageIcon,
  MessageSquareText,
  PackageCheck,
  Printer,
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
import { cn } from '@/lib/utils';
import type {
  SubWarehouseReleaseLine,
  SubWarehouseRequestHistoryEvent,
  SubWarehouseStockInitiationType,
  SubWarehouseStockRequest,
  SubWarehouseStockRequestItem,
} from './SubWarehouseStockRequestDialog';
import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getRequestDeliveryTotals,
} from './SubWarehouseStockRequestDialog';
import {
  canExportDeliveryReceiptForEvent,
  type DeliveryReceiptWaveEvent,
} from '../utils/exportInternalStockDeliveryReceiptPdf';

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

function isMainAllocation(initiationType?: SubWarehouseStockInitiationType): boolean {
  return initiationType === 'main_allocation';
}

function eventTitle(
  event: SubWarehouseRequestHistoryEvent,
  initiationType?: SubWarehouseStockInitiationType
): string {
  switch (event.type) {
    case 'created':
      return isMainAllocation(initiationType) ? 'Created' : 'Request created';
    case 'main_allocated':
      return 'Created';
    case 'approved':
      return 'Approved';
    case 'delivered':
    case 'approved_released':
      return 'Delivered';
    case 'remaining_released':
      return 'Remaining short allocated';
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Event';
  }
}

function linesTotalQty(lines: SubWarehouseReleaseLine[] | undefined): number {
  return (lines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
}

function unitLabel(n: number): string {
  return `${n.toLocaleString()} unit${n === 1 ? '' : 's'}`;
}

function variantLabel(n: number): string {
  return `${n.toLocaleString()} item${n === 1 ? '' : 's'}`;
}

function eventSummary(
  event: SubWarehouseRequestHistoryEvent,
  items?: SubWarehouseStockRequestItem[],
  initiationType?: SubWarehouseStockInitiationType
): string | null {
  if (event.type === 'created') {
    if (!items?.length) return null;
    const requested = items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0);
    if (isMainAllocation(initiationType)) {
      return `Allocated ${unitLabel(requested)} across ${variantLabel(items.length)}`;
    }
    return `Requested ${unitLabel(requested)} across ${variantLabel(items.length)}`;
  }

  if (event.type === 'main_allocated') {
    const qty = linesTotalQty(event.lines);
    if (qty > 0) {
      return `Allocated ${unitLabel(qty)} · pending receive`;
    }
    if (!items?.length) return 'Main-initiated allocation · pending receive';
    const allocated = items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0);
    return `Allocated ${unitLabel(allocated)} · pending receive`;
  }

  if (event.type === 'approved') {
    return 'Approved — awaiting delivery';
  }

  if (event.type === 'delivered' || event.type === 'approved_released') {
    const qty = linesTotalQty(event.lines);
    const count = event.lines?.length ?? 0;
    return `Delivered ${unitLabel(qty)} · ${variantLabel(count)}`;
  }

  if (event.type === 'receive_confirmed') {
    const qty = linesTotalQty(event.lines);
    if (event.shortQuantity > 0) {
      return `Received ${unitLabel(qty)} · ${unitLabel(event.shortQuantity)} still left on this request`;
    }
    return `Received ${unitLabel(qty)} · complete`;
  }

  if (event.type === 'rejected') {
    return isMainAllocation(initiationType) ? 'Allocation was rejected' : 'Request was rejected';
  }

  if (event.type === 'remaining_released') {
    const qty = linesTotalQty(event.lines);
    return `Allocated ${unitLabel(qty)} toward remaining short`;
  }

  return null;
}

function EventIcon({
  type,
  className,
}: {
  type: SubWarehouseRequestHistoryEvent['type'];
  className?: string;
}) {
  const iconClass = cn('h-3.5 w-3.5', className);
  if (type === 'created') return <Clock className={iconClass} />;
  if (type === 'main_allocated') return <Send className={iconClass} />;
  if (type === 'approved') return <CheckCircle2 className={iconClass} />;
  if (type === 'delivered' || type === 'approved_released' || type === 'remaining_released') {
    return <Send className={iconClass} />;
  }
  if (type === 'receive_confirmed') return <PackageCheck className={iconClass} />;
  if (type === 'rejected') return <XCircle className={iconClass} />;
  return <CheckCircle2 className={iconClass} />;
}

function eventTone(type: SubWarehouseRequestHistoryEvent['type']): {
  rail: string;
  iconWrap: string;
} {
  switch (type) {
    case 'main_allocated':
      return {
        rail: 'bg-violet-500',
        iconWrap: 'bg-violet-50 text-violet-700 border-violet-200',
      };
    case 'approved':
      return {
        rail: 'bg-sky-500',
        iconWrap: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    case 'delivered':
    case 'approved_released':
    case 'remaining_released':
      return {
        rail: 'bg-blue-500',
        iconWrap: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'receive_confirmed':
      return {
        rail: 'bg-emerald-500',
        iconWrap: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'rejected':
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

function resolveBrandName(
  line: { variantId: string; brandName?: string },
  items?: SubWarehouseStockRequestItem[]
): string {
  if (line.brandName?.trim()) return line.brandName;
  const fromItem = items?.find((item) => item.variantId === line.variantId)?.brandName;
  return fromItem?.trim() || '—';
}

function qtyHeaderForEvent(type: SubWarehouseRequestHistoryEvent['type']): string {
  if (type === 'receive_confirmed') return 'Received';
  if (type === 'remaining_released' || type === 'main_allocated') return 'Allocated';
  if (type === 'delivered' || type === 'approved_released') return 'Delivered';
  if (type === 'rejected') return 'Requested';
  return 'Qty';
}

function isBoilerplateAllocateNote(note: string | undefined): boolean {
  if (!note?.trim()) return true;
  return /^allocated\s+\d+\s+unit\(s\)\s+of\s+remaining\s+short\.?$/i.test(note.trim());
}

/** Business flow rank — used when events share the same timestamp (e.g. allocate+deliver). */
function eventFlowOrder(type: SubWarehouseRequestHistoryEvent['type']): number {
  switch (type) {
    case 'created':
      return 10;
    case 'main_allocated':
      return 20;
    case 'approved':
      return 30;
    case 'delivered':
    case 'approved_released':
      return 40;
    case 'remaining_released':
      return 50;
    case 'receive_confirmed':
      return 60;
    case 'rejected':
      return 70;
    default:
      return 100;
  }
}

/** Newest → oldest, with Delivered above Created when times collide. */
function compareHistoryEvents(
  a: SubWarehouseRequestHistoryEvent,
  b: SubWarehouseRequestHistoryEvent
): number {
  const ta = new Date(a.at).getTime();
  const tb = new Date(b.at).getTime();
  if (ta !== tb) return tb - ta;
  return eventFlowOrder(b.type) - eventFlowOrder(a.type);
}

type RemainingReleasedEvent = Extract<
  SubWarehouseRequestHistoryEvent,
  { type: 'remaining_released' }
>;

function HistoryLinesTable({
  lines,
  items,
  qtyHeader,
}: {
  lines: SubWarehouseReleaseLine[];
  items?: SubWarehouseStockRequestItem[];
  qtyHeader: string;
}) {
  if (lines.length === 0) return null;

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">Brand</TableHead>
            <TableHead className="h-8 text-xs">Variant</TableHead>
            <TableHead className="h-8 text-xs text-right">{qtyHeader}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, index) => (
            <TableRow
              key={`${line.variantId}-${line.quantity}-${index}`}
              className="hover:bg-transparent"
            >
              <TableCell className="py-2 text-xs">{resolveBrandName(line, items)}</TableCell>
              <TableCell className="py-2 text-xs">{line.variantName}</TableCell>
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

/** Per allocate-wave lines with cleared progress (e.g. 3 of 7). */
function AllocateWaveLinesTable({
  event,
  allHistory,
  items,
}: {
  event: RemainingReleasedEvent;
  allHistory: SubWarehouseRequestHistoryEvent[];
  items?: SubWarehouseStockRequestItem[];
}) {
  const shortByRowKey = buildAllocateShortProgress(allHistory, items);
  const lines = event.lines ?? [];
  if (lines.length === 0) return null;

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">Brand</TableHead>
            <TableHead className="h-8 text-xs">Variant</TableHead>
            <TableHead className="h-8 text-xs text-right">Allocated</TableHead>
            <TableHead className="h-8 text-xs text-right whitespace-nowrap">Cleared</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, lineIndex) => (
            <TableRow
              key={`${event.id}-${line.variantId}-${lineIndex}`}
              className="hover:bg-transparent"
            >
              <TableCell className="py-2 text-xs">{resolveBrandName(line, items)}</TableCell>
              <TableCell className="py-2 text-xs">{line.variantName}</TableCell>
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {line.quantity.toLocaleString()}
              </TableCell>
              <TableCell className="py-2 text-xs text-right tabular-nums font-medium">
                {shortByRowKey.get(`${event.id}:${line.variantId}:${lineIndex}`) ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * For each remaining-allocate line: "N of M short cleared" (e.g. 3 of 5, 5 of 5).
 * Resets after each receive that leaves a new shortage to clear.
 */
function buildAllocateShortProgress(
  history: SubWarehouseRequestHistoryEvent[],
  items?: SubWarehouseStockRequestItem[]
): Map<string, string> {
  const chronological = [...history].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (ta !== tb) return ta - tb;
    return eventFlowOrder(a.type) - eventFlowOrder(b.type);
  });

  const delivered = new Map<string, number>();
  const received = new Map<string, number>();
  for (const item of items ?? []) {
    delivered.set(item.variantId, Math.max(0, item.deliveredQuantity ?? item.requestedQuantity ?? 0));
    received.set(item.variantId, 0);
  }

  const phaseBaseline = new Map<string, number>();
  const phaseAllocated = new Map<string, number>();
  const result = new Map<string, string>();

  for (const event of chronological) {
    if ((event.type === 'delivered' || event.type === 'approved_released') && event.lines) {
      for (const line of event.lines) {
        delivered.set(line.variantId, Math.max(0, line.quantity));
        received.set(line.variantId, 0);
      }
      continue;
    }

    if (event.type === 'receive_confirmed' && event.lines) {
      for (const line of event.lines) {
        received.set(
          line.variantId,
          Math.max(0, (received.get(line.variantId) ?? 0) + line.quantity)
        );
      }
      for (const [variantId, del] of delivered) {
        const short = Math.max(0, del - (received.get(variantId) ?? 0));
        if (short > 0) {
          phaseBaseline.set(variantId, short);
          phaseAllocated.set(variantId, 0);
        } else {
          phaseBaseline.delete(variantId);
          phaseAllocated.delete(variantId);
        }
      }
      continue;
    }

    if (event.type !== 'remaining_released' || !event.lines) continue;

    event.lines.forEach((line, lineIndex) => {
      const del = delivered.get(line.variantId) ?? 0;
      const recv = received.get(line.variantId) ?? 0;
      const liveShort = Math.max(0, del - recv);

      if (!phaseBaseline.has(line.variantId)) {
        phaseBaseline.set(line.variantId, liveShort || line.quantity);
        phaseAllocated.set(line.variantId, 0);
      }

      const baseline = Math.max(
        1,
        phaseBaseline.get(line.variantId) ?? (liveShort || line.quantity)
      );
      const nextAllocated = Math.min(
        baseline,
        (phaseAllocated.get(line.variantId) ?? 0) + Math.max(0, line.quantity)
      );
      phaseAllocated.set(line.variantId, nextAllocated);

      result.set(
        `${event.id}:${line.variantId}:${lineIndex}`,
        `${nextAllocated} of ${baseline}`
      );
    });
  }

  return result;
}

function RequestStatusSummary({
  items,
  initiationType,
}: {
  items: SubWarehouseStockRequestItem[];
  initiationType?: SubWarehouseStockInitiationType;
}) {
  const requested = items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0);
  const delivered = items.reduce((sum, item) => sum + getItemDeliveredQty(item), 0);
  const received = items.reduce((sum, item) => sum + getItemReceivedQty(item), 0);
  const { short } = getRequestDeliveryTotals(items);
  // Short only after a receive leaves a gap; before first receive show 0.
  const shortDisplay = received > 0 ? short : 0;
  const originLabel = initiationType === 'main_allocation' ? 'Allocated' : 'Requested';

  const chips: { label: string; value: number; tone: string }[] = [
    {
      label: originLabel,
      value: requested,
      tone: 'border-slate-200 bg-slate-100 text-slate-700',
    },
    {
      label: 'Delivered',
      value: delivered,
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
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
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge
            key={chip.label}
            variant="outline"
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
          <span className="text-right">{originLabel}</span>
          <span className="text-right">Delivered</span>
          <span className="text-right">Received</span>
        </div>
        {items.map((item) => (
          <div
            key={item.variantId}
            className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 px-3 py-2 text-sm items-center"
          >
            <span className="truncate font-medium">{item.variantName}</span>
            <span className="text-right tabular-nums">{item.requestedQuantity}</span>
            <span className="text-right tabular-nums">{getItemDeliveredQty(item)}</span>
            <span className="text-right tabular-nums">{getItemReceivedQty(item)}</span>
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
  proofLabel = 'Proof photo',
}: {
  proofImageDataUrl?: string;
  signatureDataUrl?: string;
  signatureLabel: string;
  proofLabel?: string;
}) {
  if (!proofImageDataUrl && !signatureDataUrl) return null;

  const parts: string[] = [];
  if (proofImageDataUrl) parts.push(proofLabel.toLowerCase());
  if (signatureDataUrl) parts.push('signature');

  return (
    <DetailsToggle label={parts.join(' & ')}>
      <div className="flex flex-wrap gap-3">
        {proofImageDataUrl ? (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              {proofLabel}
            </p>
            <img
              src={proofImageDataUrl}
              alt={proofLabel}
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
  type: SubWarehouseRequestHistoryEvent['type'];
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

type SubWarehouseRequestHistoryTimelineProps = {
  history: SubWarehouseRequestHistoryEvent[] | undefined;
  items?: SubWarehouseStockRequestItem[];
  emptyLabel?: string;
  /** Full request used for Print DR (wave-scoped receipt). */
  request?: SubWarehouseStockRequest;
  /** Rider details from the request row (fallback for delivered events without event-level rider). */
  riderName?: string;
  riderPlateNumber?: string;
  riderPhotoUrl?: string;
  onPrintDeliveryReceipt?: (event: DeliveryReceiptWaveEvent) => void;
};

export function SubWarehouseRequestHistoryTimeline({
  history,
  items,
  emptyLabel = 'No history yet.',
  request,
  riderName,
  riderPlateNumber,
  riderPhotoUrl,
  onPrintDeliveryReceipt,
}: SubWarehouseRequestHistoryTimelineProps) {
  const events = [...(history ?? [])].sort(compareHistoryEvents);

  return (
    <div className="space-y-4">
      {items && items.length > 0 ? (
        <RequestStatusSummary items={items} initiationType={request?.initiationType} />
      ) : null}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Timeline</p>
          <ol className="space-y-0">
            {events.map((event, eventIndex) => {
              const isLast = eventIndex === events.length - 1;
              const lines = 'lines' in event ? event.lines : undefined;
              const summary = eventSummary(event, items, request?.initiationType);
              const hasShortBadge =
                event.type === 'receive_confirmed' && event.shortQuantity > 0;
              const isDelivered =
                event.type === 'delivered' || event.type === 'approved_released';
              const isAllocateWave = event.type === 'remaining_released';
              const eventRiderName =
                (isDelivered || isAllocateWave) && 'riderName' in event
                  ? event.riderName
                  : undefined;
              const eventRiderPlate =
                (isDelivered || isAllocateWave) && 'riderPlateNumber' in event
                  ? event.riderPlateNumber
                  : undefined;
              const eventRiderPhoto =
                (isDelivered || isAllocateWave) && 'riderPhotoUrl' in event
                  ? event.riderPhotoUrl
                  : undefined;
              const displayRiderName = eventRiderName?.trim() || (isDelivered ? riderName : undefined);
              const displayRiderPlate =
                eventRiderPlate?.trim() || (isDelivered ? riderPlateNumber : undefined);
              const displayRiderPhoto =
                eventRiderPhoto?.trim() || (isDelivered ? riderPhotoUrl : undefined);
              const showRiderOnThisEvent =
                !!displayRiderName?.trim() ||
                !!displayRiderPlate?.trim() ||
                !!displayRiderPhoto?.trim();
              const isRiderBoilerplateNote =
                (isDelivered || isAllocateWave) &&
                !!event.note?.trim() &&
                /^Rider:\s*.+\s·\sPlate:\s*.+$/i.test(event.note.trim());
              const showNote =
                !!event.note?.trim() &&
                !isRiderBoilerplateNote &&
                !(event.type === 'remaining_released' && isBoilerplateAllocateNote(event.note));
              const eventDrNumber =
                (isDelivered || isAllocateWave) && 'drNumber' in event
                  ? event.drNumber?.trim()
                  : undefined;
              const showPrintDr =
                !!request &&
                !!onPrintDeliveryReceipt &&
                canExportDeliveryReceiptForEvent(request, event);

              return (
                <TimelineStep key={event.id} type={event.type} isLast={isLast}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">
                        {eventTitle(event, request?.initiationType)}
                      </p>
                      {summary ? (
                        <p className="text-sm text-foreground/80 leading-snug mt-0.5">
                          {summary}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatAt(event.at)}
                        {event.byName ? ` · ${event.byName}` : ''}
                        {eventDrNumber ? ` · ${eventDrNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {showPrintDr ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            onPrintDeliveryReceipt(event as DeliveryReceiptWaveEvent)
                          }
                        >
                          <Printer className="h-3.5 w-3.5 mr-1" />
                          Print DR
                        </Button>
                      ) : null}
                      {hasShortBadge ? (
                        <Badge
                          variant="secondary"
                          className="shrink-0 border-amber-200 bg-amber-50 text-amber-900 font-medium"
                          title="Units still on this request after this confirm (may need main to allocate another wave)"
                        >
                          {event.shortQuantity.toLocaleString()} left on request
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {showRiderOnThisEvent ? (
                    <div className="rounded-md border bg-muted/20 px-2.5 py-2 space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rider
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
                        {displayRiderName?.trim() ? (
                          <p>
                            <span className="text-muted-foreground">Name: </span>
                            {displayRiderName.trim()}
                          </p>
                        ) : null}
                        {displayRiderPlate?.trim() ? (
                          <p>
                            <span className="text-muted-foreground">Plate: </span>
                            <span className="font-medium tabular-nums">
                              {displayRiderPlate.trim()}
                            </span>
                          </p>
                        ) : null}
                      </div>
                      {displayRiderPhoto?.trim() ? (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <ImageIcon className="h-3 w-3" />
                            Rider photo
                          </p>
                          <img
                            src={displayRiderPhoto}
                            alt="Rider"
                            className="h-40 w-40 max-w-full rounded-md object-cover border bg-muted/30"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {event.type === 'remaining_released' && lines && lines.length > 0 ? (
                    <DetailsToggle label={`item details (${lines.length})`}>
                      <AllocateWaveLinesTable
                        event={event}
                        allHistory={events}
                        items={items}
                      />
                    </DetailsToggle>
                  ) : lines && lines.length > 0 ? (
                    <DetailsToggle label={`item details (${lines.length})`}>
                      <HistoryLinesTable
                        lines={lines}
                        items={items}
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

                  {event.type === 'receive_confirmed' ? (
                    <EventAttachments
                      proofImageDataUrl={event.proofImageDataUrl}
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel="Signature"
                    />
                  ) : null}

                  {event.type === 'delivered' || event.type === 'approved_released' ? (
                    <EventAttachments
                      proofImageDataUrl={event.proofImageDataUrl}
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel="Delivery signature"
                      proofLabel="Delivery proof"
                    />
                  ) : null}

                  {event.type === 'remaining_released' ? (
                    <EventAttachments
                      proofImageDataUrl={event.proofImageDataUrl}
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel="Allocator signature"
                    />
                  ) : null}

                  {event.type === 'rejected' ? (
                    <EventAttachments
                      signatureDataUrl={event.signatureDataUrl}
                      signatureLabel="Rejection signature"
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
