import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Expand, Loader2, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { TLRequestStatus, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import {
  TL_DISPATCH_SHORTFALL_LABELS,
  tlDispatchShortfallSummary,
  tlDispatchedQty,
  tlRollupItemStatus,
  tlStatusLabel,
  tlTdrKindLabel,
} from './tlStockTransferShared';
import { exportTlTdrPdf, printTlStockTransferRequest } from './exportTlTransferPdfs';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TLRequestWithDetails | null;
  allRequests?: TLRequestWithDetails[];
};

function statusBadgeClass(status: TLRequestStatus | string) {
  switch (status) {
    case 'pending_admin':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'pending_source_tl':
    case 'admin_approved':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'pending_receipt':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'completed':
      return 'bg-green-50 text-green-800 border-green-200';
    case 'incomplete':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'admin_rejected':
    case 'source_tl_rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-800 border-red-200';
    default:
      return '';
  }
}

function qtyDisplay(value: number | null | undefined) {
  return value == null ? '—' : value;
}

function lineNotes(line: TLRequestWithDetails) {
  const notes: string[] = [];
  const dispatchShort = tlDispatchShortfallSummary(line);
  if (dispatchShort?.reasonLabel) {
    notes.push(`Dispatch: ${dispatchShort.reasonLabel}`);
  } else if (line.dispatch_shortfall_reason) {
    notes.push(`Dispatch: ${TL_DISPATCH_SHORTFALL_LABELS[line.dispatch_shortfall_reason]}`);
  }
  if (dispatchShort?.notes) {
    notes.push(dispatchShort.notes);
  }
  if (line.receive_shortfall_reason) {
    notes.push(
      `Receive: ${formatShortfallReasonLabel(line.receive_shortfall_reason, line.receive_shortfall_notes)}`
    );
  }
  if (line.rejection_reason) {
    notes.push(line.rejection_reason);
  }
  return notes;
}

function variantLabel(line: {
  variant?: { name?: string | null; brand_name?: string | null; brand?: { name?: string | null } | null };
}) {
  const brand =
    line.variant?.brand_name ||
    (line.variant?.brand && typeof line.variant.brand === 'object' && !Array.isArray(line.variant.brand)
      ? line.variant.brand.name
      : null);
  return [brand, line.variant?.name].filter(Boolean).join(' · ') || 'Item';
}

type TdrDisplayLine = {
  key: string;
  requestItemId?: string;
  label: string;
  dispatched: number;
  received: number;
  pendingNote: string;
};

type TdrDisplay = {
  tdr_number: string;
  kind: string;
  created_at: string;
  lines: TdrDisplayLine[];
};

type TdrShortage = {
  request_item_id: string | null;
  quantity: number;
  created_at: string;
};

type TdrMovement = {
  variant_id: string;
  transaction_type: string;
  quantity: number;
  created_at: string;
  notes: string | null;
};

function displayLine(
  key: string,
  label: string,
  dispatched: number,
  received: number,
  requestItemId?: string,
  receiveConfirmed = false
): TdrDisplayLine | null {
  if (dispatched <= 0) return null;
  const pending = Math.max(0, dispatched - received);
  return {
    key,
    requestItemId,
    label,
    dispatched,
    received,
    pendingNote: pending > 0 && receiveConfirmed ? ` · ${pending} short` : '',
  };
}

function lineVariantId(line: TLRequestWithDetails) {
  return line.variant_id || line.variant?.id || '';
}

function isFoundReturnNote(notes: string | null | undefined) {
  const value = (notes || '').toLowerCase();
  return value.includes('found') && value.includes('returned');
}

function isReceiveNote(notes: string | null | undefined) {
  return (notes || '').toLowerCase().startsWith('tl transfer receive');
}

function nearestTdrIndex(at: number, tdrTimes: number[]) {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  tdrTimes.forEach((time, index) => {
    const dist = Math.abs(time - at);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

function latestTdrIndexAt(at: number, tdrTimes: number[]) {
  let latest = -1;
  tdrTimes.forEach((time, index) => {
    if (time <= at) latest = index;
  });
  return latest;
}

function reconstructTdrLinesFromMovements(
  tdrs: { tdr_number: string; created_at: string }[],
  skuLines: TLRequestWithDetails[],
  movements: TdrMovement[]
): TdrDisplayLine[][] {
  const tdrTimes = tdrs.map((tdr) => new Date(tdr.created_at).getTime());
  return tdrs.map((tdr, tdrIndex) => {
    return skuLines.flatMap((line) => {
      const variantId = lineVariantId(line);
      const dispatched = movements
        .filter((tx) => {
          if (tx.transaction_type !== 'tl_stock_transfer_out') return false;
          if (tx.variant_id !== variantId) return false;
          if (isFoundReturnNote(tx.notes)) return false;
          return nearestTdrIndex(new Date(tx.created_at).getTime(), tdrTimes) === tdrIndex;
        })
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);
      const received = movements
        .filter((tx) => {
          if (tx.transaction_type !== 'tl_stock_transfer_in') return false;
          if (!isReceiveNote(tx.notes)) return false;
          if (tx.variant_id !== variantId) return false;
          return latestTdrIndexAt(new Date(tx.created_at).getTime(), tdrTimes) === tdrIndex;
        })
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);
      const row = displayLine(
        `${tdr.tdr_number}-${line.id}`,
        variantLabel(line),
        dispatched,
        received,
        line.id,
        line.received_quantity != null
      );
      return row ? [row] : [];
    });
  });
}

function reconstructTdrLinesFromShortages(
  tdrs: { tdr_number: string }[],
  skuLines: TLRequestWithDetails[],
  shortages: TdrShortage[]
): TdrDisplayLine[][] {
  return tdrs.map((tdr, tdrIndex) =>
    skuLines.flatMap((line) => {
      const discs = shortages
        .filter((row) => !row.request_item_id || row.request_item_id === line.id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const firstShort = Number(discs[0]?.quantity || 0);
      const totalReceived = Number(line.received_quantity || 0);
      const firstDispatched = Number(
        line.admin_approved_quantity ?? line.requested_quantity ?? tlDispatchedQty(line) ?? 0
      );
      const firstReceived =
        firstShort > 0 ? Math.min(totalReceived, Math.max(0, firstDispatched - firstShort)) : totalReceived;

      let dispatched = 0;
      let received = 0;
      if (tdrIndex === 0) {
        dispatched = firstDispatched;
        received = firstReceived;
      } else {
        const short = Number(discs[Math.min(tdrIndex - 1, Math.max(discs.length - 1, 0))]?.quantity || 0);
        dispatched = short;
        received = Math.max(0, Math.min(dispatched, totalReceived - firstReceived));
      }

      const row = displayLine(
        `${tdr.tdr_number}-${line.id}`,
        variantLabel(line),
        dispatched,
        received,
        line.id,
        line.received_quantity != null
      );
      return row ? [row] : [];
    })
  );
}

function lineQtyTotal(rows: TdrDisplayLine[]) {
  return rows.reduce(
    (acc, row) => {
      acc.dispatched += row.dispatched;
      acc.received += row.received;
      return acc;
    },
    { dispatched: 0, received: 0 }
  );
}

export function TLTransferDetailsDialog({ open, onOpenChange, request, allRequests = [] }: Props) {
  const { toast } = useToast();
  const [fullImage, setFullImage] = useState<{ url: string; title: string } | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const lines = useMemo(() => {
    if (!request) return [];
    const grouped = allRequests.filter((row) => row.request_number === request.request_number);
    return grouped.length > 0 ? grouped : [request];
  }, [allRequests, request]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, line) => {
          acc.requested += Number(line.requested_quantity || 0);
          acc.approved += Number(line.admin_approved_quantity || 0);
          acc.dispatched += tlDispatchedQty(line);
          acc.received += Number(line.received_quantity || 0);
          return acc;
        },
        { requested: 0, approved: 0, dispatched: 0, received: 0 }
      ),
    [lines]
  );

  const proofUrls = useMemo(() => {
    const dispatch = lines.flatMap((line) => line.dispatch_proof_urls || []);
    const receive = lines.flatMap((line) => line.receive_proof_urls || []);
    return {
      dispatch: [...new Set(dispatch)],
      receive: [...new Set(receive)],
    };
  }, [lines]);

  const headerRequest = request ?? lines[0] ?? null;
  const headerId = headerRequest?.request_id || null;
  const displayStatus = useMemo(() => tlRollupItemStatus(lines), [lines]);

  const { data: tdrQuery } = useQuery({
    queryKey: ['tl-transfer-tdr-details', headerId],
    enabled: open && !!headerId,
    queryFn: async () => {
      const { data: tdrs, error: tdrError } = await supabase
        .from('tl_stock_request_tdrs')
        .select('id, tdr_number, kind, created_at')
        .eq('request_id', headerId)
        .order('created_at', { ascending: true });
      if (tdrError) throw tdrError;
      const rows = tdrs || [];
      if (rows.length === 0) {
        return { tdrs: [] as any[], shortages: [] as TdrShortage[], movements: [] as TdrMovement[] };
      }

      const [{ data: tdrItems, error: itemError }, { data: discs }, { data: txs }] = await Promise.all([
        supabase
          .from('tl_stock_request_tdr_items')
          .select(
            `
            tdr_id,
            request_item_id,
            dispatched_quantity,
            received_quantity,
            variant:variants(
              id,
              name,
              brand:brands(name)
            )
          `
          )
          .in(
            'tdr_id',
            rows.map((row) => row.id)
          ),
        supabase
          .from('tl_stock_request_discrepancies')
          .select('request_item_id, quantity, created_at')
          .eq('request_id', headerId)
          .order('created_at', { ascending: true }),
        supabase
          .from('inventory_transactions')
          .select('variant_id, transaction_type, quantity, created_at, notes')
          .eq('reference_type', 'tl_stock_request')
          .eq('reference_id', headerId)
          .in('transaction_type', ['tl_stock_transfer_out', 'tl_stock_transfer_in'])
          .order('created_at', { ascending: true }),
      ]);

      const itemsByTdr = new Map<string, any[]>();
      if (!itemError) {
        for (const item of tdrItems || []) {
          const list = itemsByTdr.get(item.tdr_id) ?? [];
          list.push(item);
          itemsByTdr.set(item.tdr_id, list);
        }
      }

      return {
        tdrs: rows.map((tdr) => ({
          ...tdr,
          items: itemsByTdr.get(tdr.id) || [],
        })),
        shortages: (discs || []) as TdrShortage[],
        movements: (txs || []) as TdrMovement[],
      };
    },
  });

  const tdrDisplays = useMemo((): TdrDisplay[] => {
    const fetchedTdrs = tdrQuery?.tdrs || [];
    const shortages = tdrQuery?.shortages || [];
    const source =
      fetchedTdrs.length > 0
        ? fetchedTdrs
        : headerRequest?.tdrs && headerRequest.tdrs.length > 0
          ? headerRequest.tdrs
          : headerRequest?.tdr_number
            ? [
                {
                  tdr_number: headerRequest.tdr_number,
                  kind: 'dispatch',
                  created_at: headerRequest.dispatched_at || headerRequest.created_at,
                  items: [],
                },
              ]
            : [];

    const fromMovements = reconstructTdrLinesFromMovements(
      source,
      lines,
      tdrQuery?.movements || []
    );
    const fromShortages = reconstructTdrLinesFromShortages(source, lines, shortages);

    return source.map((entry: any, index: number) => {
      const stored = Array.isArray(entry.items) ? entry.items : [];
      const fromStore: TdrDisplayLine[] = stored
        .map((item: any) => {
          const match = lines.find((line) => line.id === item.request_item_id);
          return displayLine(
            `${entry.tdr_number}-${item.request_item_id}`,
            variantLabel(match || item),
            Number(item.dispatched_quantity || 0),
            Number(item.received_quantity || 0),
            item.request_item_id,
            match?.received_quantity != null
          );
        })
        .filter(Boolean) as TdrDisplayLine[];
      const storedQty = lineQtyTotal(fromStore);
      const movementLines = fromMovements[index] || [];
      const movementQty = lineQtyTotal(movementLines);
      const storedLooksInflated =
        (movementQty.dispatched > 0 && storedQty.dispatched > movementQty.dispatched) ||
        (movementQty.received > 0 && storedQty.received > movementQty.received);
      const useStored =
        fromStore.length > 0 &&
        storedQty.dispatched > 0 &&
        !storedLooksInflated &&
        (storedQty.received > 0 || movementQty.received === 0);

      return {
        tdr_number: entry.tdr_number,
        kind: entry.kind,
        created_at: entry.created_at,
        lines: useStored
          ? fromStore
          : movementLines.length > 0
            ? movementLines
            : fromShortages[index] || [],
      };
    });
  }, [tdrQuery, headerRequest, lines]);

  const printTransfer = async () => {
    setPrinting('transfer');
    try {
      await printTlStockTransferRequest(lines);
    } catch (error: any) {
      toast({
        title: 'Could not print transfer',
        description: error?.message || 'Failed to open the print view.',
        variant: 'destructive',
      });
    } finally {
      setPrinting(null);
    }
  };

  const printTdr = async (entry: TdrDisplay) => {
    if (!headerRequest) return;
    if (entry.lines.length === 0) {
      toast({
        title: 'Nothing to print on this TDR',
        description: 'This receipt has no dispatched quantities yet.',
        variant: 'destructive',
      });
      return;
    }
    setPrinting(entry.tdr_number);
    try {
      await exportTlTdrPdf({
        tdrNumber: entry.tdr_number,
        kind: entry.kind,
        dispatchedAt: entry.created_at,
        requestNumber: headerRequest.request_number,
        requesterName: headerRequest.requester?.full_name || '—',
        sourceName: headerRequest.source?.full_name || '—',
        lines: entry.lines.map((line) => {
          const match = lines.find((sku) => sku.id === line.requestItemId);
          const short = Math.max(0, line.dispatched - line.received);
          const receiveConfirmed = match?.received_quantity != null;
          const shortfallReason =
            short > 0 && receiveConfirmed && match?.receive_shortfall_reason
              ? formatShortfallReasonLabel(
                  match.receive_shortfall_reason,
                  match.receive_shortfall_notes
                )
              : null;
          return {
            label: line.label.includes(' · ')
              ? line.label.replace(' · ', ' — ')
              : line.label,
            dispatched: line.dispatched,
            received: line.received,
            shortfallReason,
            receiveConfirmed,
          };
        }),
      });
    } catch (error: any) {
      toast({
        title: 'Could not print TDR',
        description: error?.message || 'Failed to open the print view.',
        variant: 'destructive',
      });
    } finally {
      setPrinting(null);
    }
  };

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFullImage(null);
        onOpenChange(next);
      }}
    >
      {headerRequest ? (
        <DialogContent className="flex w-[95vw] max-w-4xl max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b px-6 py-5 pr-12 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl">Transfer details</DialogTitle>
              <DialogDescription className="font-mono text-sm text-foreground">
                {headerRequest.request_number}
                {headerRequest.tdr_number ? ` · ${headerRequest.tdr_number}` : ''}
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void printTransfer()}
                disabled={printing === 'transfer'}
              >
                {printing === 'transfer' ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="mr-1 h-4 w-4" />
                )}
                Print transfer
              </Button>
              <Badge variant="secondary" className={statusBadgeClass(displayStatus)}>
                {tlStatusLabel(displayStatus)}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Requested by
              </p>
              <p className="mt-1 font-medium">{headerRequest.requester?.full_name || '—'}</p>
              {headerRequest.requester?.region ? (
                <p className="text-xs text-muted-foreground">{headerRequest.requester.region}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To</p>
              <p className="mt-1 font-medium">{headerRequest.source?.full_name || '—'}</p>
              {headerRequest.source?.region ? (
                <p className="text-xs text-muted-foreground">{headerRequest.source.region}</p>
              ) : null}
            </div>
          </div>

          {tdrDisplays.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Delivery receipts</h3>
                {headerRequest.tdr_number ? (
                  <p className="font-mono text-xs text-muted-foreground">Latest {headerRequest.tdr_number}</p>
                ) : null}
              </div>
              <div className="space-y-3">
                {tdrDisplays.map((entry) => (
                  <div key={entry.tdr_number} className="rounded-lg border bg-muted/20 p-4 space-y-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">TDR number</p>
                          <p className="font-mono font-medium">{entry.tdr_number}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Type</p>
                          <p className="font-medium">{tlTdrKindLabel(entry.kind)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Dispatched Date</p>
                          <p className="font-medium">{new Date(entry.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => void printTdr(entry)}
                        disabled={printing === entry.tdr_number}
                      >
                        {printing === entry.tdr_number ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Printer className="mr-1 h-3.5 w-3.5" />
                        )}
                        Print TDR
                      </Button>
                    </div>
                    {entry.lines.length > 0 ? (
                      <div className="rounded-md border bg-background p-2 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Items quantities dispatched / received
                        </p>
                        {entry.lines.map((line) => (
                          <div key={line.key} className="flex justify-between gap-2 text-xs">
                            <span className="truncate">{line.label}</span>
                            <span className="shrink-0 font-medium tabular-nums">
                              recv {line.received}/{line.dispatched}
                              {line.pendingNote}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {headerRequest.requester_notes ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">Request notes</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{headerRequest.requester_notes}</p>
            </div>
          ) : null}

          {headerRequest.admin_notes ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">Admin notes</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{headerRequest.admin_notes}</p>
            </div>
          ) : null}

          {headerRequest.source_tl_notes ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium">Dispatcher notes</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{headerRequest.source_tl_notes}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Items</h3>
              <p className="text-xs text-muted-foreground">
                {lines.length} item{lines.length === 1 ? '' : 's'} · {totals.requested} units requested
              </p>
            </div>
            <div className="max-h-[46vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[220px] bg-muted/40">Item</TableHead>
                    <TableHead className="bg-muted/40 text-right">Requested</TableHead>
                    <TableHead className="bg-muted/40 text-right">Approved</TableHead>
                    <TableHead className="bg-muted/40 text-right">Dispatched </TableHead>
                    <TableHead className="bg-muted/40 text-right">Received</TableHead>
                    <TableHead className="min-w-[180px] bg-muted/40">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const notes = lineNotes(line);
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <p className="font-medium">
                            {line.variant.brand_name} · {line.variant.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{line.variant.type}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.requested_quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {qtyDisplay(line.admin_approved_quantity)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.dispatched_quantity == null && !line.dispatched_at
                            ? '—'
                            : tlDispatchedQty(line)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {qtyDisplay(line.received_quantity)}
                        </TableCell>
                        <TableCell>
                          {notes.length > 0 ? (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {notes.map((note) => (
                                <p key={note}>{note}</p>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.requested}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lines.some((line) => line.admin_approved_quantity != null)
                        ? totals.approved
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lines.some((line) => line.dispatched_quantity != null || line.dispatched_at)
                        ? totals.dispatched
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lines.some((line) => line.received_quantity != null) ? totals.received : '—'}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>

          {headerRequest.rejection_reason ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">Rejected</p>
              <p className="mt-1 text-muted-foreground">{headerRequest.rejection_reason}</p>
            </div>
          ) : null}

          {proofUrls.dispatch.length > 0 || proofUrls.receive.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {proofUrls.dispatch.length > 0 ? (
                <ProofStrip
                  title="Dispatch photos"
                  urls={proofUrls.dispatch}
                  onView={(url, index) =>
                    setFullImage({
                      url,
                      title:
                        proofUrls.dispatch.length > 1
                          ? `Dispatch photo ${index + 1}`
                          : 'Dispatch photo',
                    })
                  }
                />
              ) : null}
              {proofUrls.receive.length > 0 ? (
                <ProofStrip
                  title="Receive photos"
                  urls={proofUrls.receive}
                  onView={(url, index) =>
                    setFullImage({
                      url,
                      title:
                        proofUrls.receive.length > 1 ? `Receive photo ${index + 1}` : 'Receive photo',
                    })
                  }
                />
              ) : null}
            </div>
          ) : null}
        </div>
        </DialogContent>
      ) : null}
    </Dialog>
    <Dialog
      open={!!fullImage}
      onOpenChange={(next) => {
        if (!next) setFullImage(null);
      }}
    >
      <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{fullImage?.title || 'Photo'}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          {fullImage?.url ? (
            <div className="rounded-md border bg-muted/20 overflow-auto max-h-[80vh] flex items-center justify-center p-2">
              <img
                src={fullImage.url}
                alt={fullImage.title}
                className="max-w-full max-h-[75vh] w-auto h-auto object-contain"
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function ProofStrip({
  title,
  urls,
  onView,
}: {
  title: string;
  urls: string[];
  onView: (url: string, index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onView(urls[0], 0)}
        >
          <Expand className="h-3.5 w-3.5 mr-1" />
          View full
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, index) => (
          <button
            key={url}
            type="button"
            className="block h-16 w-16 overflow-hidden rounded-md border bg-muted cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onView(url, index)}
            title="View full size"
          >
            <img src={url} alt={`${title} ${index + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
