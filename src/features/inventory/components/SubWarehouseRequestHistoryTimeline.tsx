import { Clock, PackageCheck, Send, Truck, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  SubWarehouseReleaseLine,
  SubWarehouseRequestHistoryEvent,
  SubWarehouseStockRequestItem,
} from './SubWarehouseStockRequestDialog';

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

function eventTitle(event: SubWarehouseRequestHistoryEvent): string {
  switch (event.type) {
    case 'created':
      return 'Request created';
    case 'approved_released':
      return 'Approved & released';
    case 'remaining_released':
      return 'Remaining allocated / released';
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Event';
  }
}

function EventIcon({ type }: { type: SubWarehouseRequestHistoryEvent['type'] }) {
  if (type === 'created') return <Clock className="h-4 w-4" />;
  if (type === 'approved_released' || type === 'remaining_released') return <Send className="h-4 w-4" />;
  if (type === 'receive_confirmed') return <PackageCheck className="h-4 w-4" />;
  if (type === 'rejected') return <XCircle className="h-4 w-4" />;
  return <Truck className="h-4 w-4" />;
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
  if (type === 'remaining_released') return 'Allocated';
  if (type === 'approved_released') return 'Released';
  if (type === 'rejected') return 'Requested';
  return 'Qty';
}

function EventLinesTable({
  lines,
  items,
  qtyHeader,
}: {
  lines: SubWarehouseReleaseLine[];
  items?: SubWarehouseStockRequestItem[];
  qtyHeader: string;
}) {
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
          {lines.map((line) => (
            <TableRow key={`${line.variantId}-${line.quantity}`} className="hover:bg-transparent">
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

function RequestedItemsTable({ items }: { items: SubWarehouseStockRequestItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Requested items</p>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs">Brand</TableHead>
              <TableHead className="h-8 text-xs">Variant</TableHead>
              <TableHead className="h-8 text-xs text-right">Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.variantId} className="hover:bg-transparent">
                <TableCell className="py-2 text-xs">{item.brandName?.trim() || '—'}</TableCell>
                <TableCell className="py-2 text-xs">{item.variantName}</TableCell>
                <TableCell className="py-2 text-xs text-right tabular-nums">
                  {item.requestedQuantity.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type SubWarehouseRequestHistoryTimelineProps = {
  history: SubWarehouseRequestHistoryEvent[] | undefined;
  items?: SubWarehouseStockRequestItem[];
  emptyLabel?: string;
};

export function SubWarehouseRequestHistoryTimeline({
  history,
  items,
  emptyLabel = 'No history yet.',
}: SubWarehouseRequestHistoryTimelineProps) {
  const events = [...(history ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <div className="space-y-4">
      {items && items.length > 0 ? <RequestedItemsTable items={items} /> : null}

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Timeline</p>
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      <EventIcon type={event.type} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{eventTitle(event)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatAt(event.at)}
                        {event.byName ? ` · ${event.byName}` : ''}
                      </p>
                    </div>
                  </div>
                  {event.type === 'receive_confirmed' && event.shortQuantity > 0 ? (
                    <span className="text-xs font-medium text-amber-800 whitespace-nowrap">
                      Short {event.shortQuantity}
                    </span>
                  ) : null}
                </div>

                {'lines' in event && event.lines && event.lines.length > 0 ? (
                  <EventLinesTable
                    lines={event.lines}
                    items={items}
                    qtyHeader={qtyHeaderForEvent(event.type)}
                  />
                ) : null}

                {event.note ? (
                  <p className="text-xs text-muted-foreground">Note: {event.note}</p>
                ) : null}

                {event.type === 'receive_confirmed' &&
                (event.proofImageDataUrl || event.signatureDataUrl) ? (
                  <div className="flex flex-wrap gap-3">
                    {event.proofImageDataUrl ? (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Proof photo
                        </p>
                        <img
                          src={event.proofImageDataUrl}
                          alt="Proof"
                          className="h-40 w-40 max-w-full rounded-md object-cover border bg-muted/30"
                        />
                      </div>
                    ) : null}
                    {event.signatureDataUrl ? (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Signature
                        </p>
                        <img
                          src={event.signatureDataUrl}
                          alt="Signature"
                          className="h-28 w-56 max-w-full rounded-md object-contain bg-white border"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {event.type === 'approved_released' && event.signatureDataUrl ? (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Approver signature
                    </p>
                    <img
                      src={event.signatureDataUrl}
                      alt="Approver signature"
                      className="h-28 w-56 max-w-full rounded-md object-contain bg-white border"
                    />
                  </div>
                ) : null}

                {event.type === 'rejected' && event.signatureDataUrl ? (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Rejection signature
                    </p>
                    <img
                      src={event.signatureDataUrl}
                      alt="Rejection signature"
                      className="h-28 w-56 max-w-full rounded-md object-contain bg-white border"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
