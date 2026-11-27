import { useEffect, useMemo, useState } from 'react';
import { Expand, History, Loader2, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TLRequestStatus, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import {
  tlDispatchShortfallSummary,
  tlDispatchedQty,
  tlRollupItemStatus,
  tlStatusLabelForRequest,
} from './tlStockTransferShared';
import {
  TransferItemsBreakdownTable,
  TransferNumber,
  TlTransferDetailField,
} from './TlTransferAccordionList';
import {
  buildTlTdrPdfHtml,
  printTlStockTransferRequest,
  type TlTdrPdfOptions,
} from './exportTlTransferPdfs';
import { TLTransferHistoryDialog } from './TLTransferHistoryDialog';
import { useAppDispatch } from '@/store/store';
import {
  fetchTlTransferTdrDetails,
  type TlTdrDetails,
} from '@/store/slices/motosales/tl-stock-transfers';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function firstTimestamp(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function brandNames(lines: TLRequestWithDetails[]) {
  const names = [
    ...new Set(
      lines
        .map((item) => item.variant?.brand_name?.trim())
        .filter((name): name is string => !!name)
    ),
  ];
  return names.length > 0 ? names.join(', ') : '—';
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: TLRequestWithDetails | null;
  allRequests?: TLRequestWithDetails[];
};

function statusBadgeClass(status: TLRequestStatus | string) {
  const base = 'whitespace-nowrap';
  switch (status) {
    case 'pending_admin':
      return `${base} bg-yellow-50 text-yellow-800 border-yellow-200`;
    case 'pending_source_tl':
    case 'admin_approved':
      return `${base} bg-blue-50 text-blue-800 border-blue-200`;
    case 'pending_receipt':
      return `${base} bg-purple-50 text-purple-800 border-purple-200`;
    case 'completed':
      return `${base} bg-green-50 text-green-800 border-green-200`;
    case 'incomplete':
      return `${base} bg-orange-50 text-orange-800 border-orange-200`;
    case 'admin_rejected':
    case 'source_tl_rejected':
    case 'cancelled':
      return `${base} bg-red-50 text-red-800 border-red-200`;
    default:
      return base;
  }
}

function lineBrandName(line: {
  variant?: { brand_name?: string | null; brand?: { name?: string | null } | null };
}) {
  const brand =
    line.variant?.brand_name ||
    (line.variant?.brand && typeof line.variant.brand === 'object' && !Array.isArray(line.variant.brand)
      ? line.variant.brand.name
      : null);
  return brand?.trim() || 'Unbranded';
}

function variantLabel(line: {
  variant?: { name?: string | null; brand_name?: string | null; brand?: { name?: string | null } | null };
}) {
  const brand = lineBrandName(line);
  const name = line.variant?.name;
  return [brand === 'Unbranded' ? null : brand, name].filter(Boolean).join(' · ') || 'Item';
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
  const dispatch = useAppDispatch();
  const [fullImage, setFullImage] = useState<{ url: string; title: string } | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'details' | 'receipts'>('details');
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
          acc.dispatched += tlDispatchedQty(line);
          acc.received += Number(line.received_quantity || 0);
          return acc;
        },
        { requested: 0, dispatched: 0, received: 0 }
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

  const [tdrQuery, setTdrQuery] = useState<TlTdrDetails | null>(null);

  useEffect(() => {
    if (!open) {
      setDetailTab('details');
      setTdrQuery(null);
      return;
    }
    if (!headerId) {
      setTdrQuery(null);
      return;
    }
    let cancelled = false;
    void dispatch(fetchTlTransferTdrDetails(headerId))
      .unwrap()
      .then((data) => {
        if (!cancelled) setTdrQuery(data);
      })
      .catch(() => {
        if (!cancelled) setTdrQuery(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, open, headerId]);

  const detailSummary = useMemo(() => {
    if (!headerRequest) return null;
    const brands = brandNames(lines);
    const requestedAt = headerRequest.created_at;
    const dispatchedAt = firstTimestamp(lines.map((line) => line.dispatched_at));
    const receivedAt = firstTimestamp(lines.map((line) => line.received_at));
    const hasDispatched = lines.some((line) => line.dispatched_quantity != null);
    const hasReceived = lines.some((line) => line.received_quantity != null);
    const dispatchedBy = dispatchedAt ? headerRequest.source?.full_name : null;
    const receivedBy = receivedAt ? headerRequest.requester?.full_name : null;
    const dispatchShort = lines
      .map((line) => tlDispatchShortfallSummary(line))
      .find((summary) => summary?.reasonLabel);
    return {
      brands,
      requestedAt,
      dispatchedAt,
      receivedAt,
      hasDispatched,
      hasReceived,
      dispatchedBy,
      receivedBy,
      dispatchShort,
    };
  }, [headerRequest, lines]);

  const tdrDisplays = useMemo((): TdrDisplay[] => {
    const fetchedTdrs = tdrQuery?.tdrs || [];
    const shortages = tdrQuery?.shortages || [];
    const rawSource =
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

    const source = rawSource
      .map((entry) => {
        const row = entry as {
          tdr_number?: unknown;
          kind?: unknown;
          created_at?: unknown;
          items?: unknown;
        };
        const tdrNumber = typeof row.tdr_number === 'string' ? row.tdr_number : '';
        if (!tdrNumber) return null;
        return {
          tdr_number: tdrNumber,
          kind: typeof row.kind === 'string' ? row.kind : 'dispatch',
          created_at:
            typeof row.created_at === 'string'
              ? row.created_at
              : headerRequest?.created_at || new Date().toISOString(),
          items: Array.isArray(row.items) ? row.items : [],
        };
      })
      .filter(
        (
          entry
        ): entry is {
          tdr_number: string;
          kind: string;
          created_at: string;
          items: unknown[];
        } => !!entry
      );

    const fromMovements = reconstructTdrLinesFromMovements(
      source,
      lines,
      tdrQuery?.movements || []
    );
    const fromShortages = reconstructTdrLinesFromShortages(source, lines, shortages);

    return source.map((entry, index) => {
      const stored = entry.items;
      const fromStore: TdrDisplayLine[] = stored
        .map((item) => {
          const row = item as {
            request_item_id?: string;
            dispatched_quantity?: number;
            received_quantity?: number;
            variant?: {
              name?: string | null;
              brand_name?: string | null;
              brand?: { name?: string | null } | null;
            };
          };
          const match = lines.find((line) => line.id === row.request_item_id);
          return displayLine(
            `${entry.tdr_number}-${row.request_item_id}`,
            variantLabel(match || row),
            Number(row.dispatched_quantity || 0),
            Number(row.received_quantity || 0),
            row.request_item_id,
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

  const buildTdrOptions = (entry: TdrDisplay): TlTdrPdfOptions | null => {
    if (!headerRequest || entry.lines.length === 0) return null;
    return {
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
    };
  };

  const receiptPreviews = useMemo(() => {
    return tdrDisplays
      .map((entry) => {
        const options = buildTdrOptions(entry);
        if (!options) return null;
        return {
          key: entry.tdr_number,
          title: `TDR — ${entry.tdr_number}`,
          html: buildTlTdrPdfHtml(options),
          options,
        };
      })
      .filter(
        (
          preview
        ): preview is {
          key: string;
          title: string;
          html: string;
          options: TlTdrPdfOptions;
        } => !!preview
      );
  }, [tdrDisplays, headerRequest, lines]);

  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFullImage(null);
          setHistoryOpen(false);
          setDetailTab('details');
        }
        onOpenChange(next);
      }}
    >
      {headerRequest && detailSummary ? (
        <DialogContent className="flex w-[95vw] max-w-5xl max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-3 border-b px-6 py-5 pr-12 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-xl">Transfer details</DialogTitle>
              {/* <DialogDescription className="font-mono text-sm text-foreground whitespace-nowrap">
                {headerRequest.request_number}
                {headerRequest.tdr_number ? ` · ${headerRequest.tdr_number}` : ''}
              </DialogDescription> */}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistoryOpen(true)}
              >
                <History className="mr-1 h-4 w-4" />
                History
              </Button>
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
                Print TL Stock Transfer
              </Button>
              <Badge variant="secondary" className={statusBadgeClass(displayStatus)}>
                {tlStatusLabelForRequest({
                  ...headerRequest,
                  status: displayStatus as typeof headerRequest.status,
                })}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={detailTab}
          onValueChange={(value) => setDetailTab(value as 'details' | 'receipts')}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 border-b px-6 pt-3">
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
              <TabsTrigger value="details">Transfer details</TabsTrigger>
              <TabsTrigger value="receipts" className="gap-2">
                Delivery receipts
                {tdrDisplays.length > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {tdrDisplays.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="details"
            className="mt-0 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 data-[state=inactive]:hidden"
          >
            <section>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Details
              </h4>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <TlTransferDetailField
                  label="Transfer Number"
                  value={<TransferNumber value={headerRequest.request_number} />}
                />
                <TlTransferDetailField
                  label="TDR"
                  value={headerRequest.tdr_number || '—'}
                />
                <TlTransferDetailField
                  label="Requested by"
                  value={
                    headerRequest.requester?.region
                      ? `${headerRequest.requester.full_name} · ${headerRequest.requester.region}`
                      : headerRequest.requester?.full_name || '—'
                  }
                />
                <TlTransferDetailField
                  label="Requested from"
                  value={
                    headerRequest.source?.region
                      ? `${headerRequest.source.full_name} · ${headerRequest.source.region}`
                      : headerRequest.source?.full_name || '—'
                  }
                />
                <TlTransferDetailField label="Brand" value={detailSummary.brands} />
                <TlTransferDetailField
                  label="Requested Total Qty"
                  value={totals.requested}
                />
                <TlTransferDetailField
                  label="Dispatched Total Qty"
                  value={detailSummary.hasDispatched ? totals.dispatched : '—'}
                />
                <TlTransferDetailField
                  label="Received Total Qty"
                  value={detailSummary.hasReceived ? totals.received : '—'}
                />
                <TlTransferDetailField
                  label="Request At"
                  value={formatDateTime(detailSummary.requestedAt)}
                />
                <TlTransferDetailField
                  label="Dispatch At"
                  value={formatDateTime(detailSummary.dispatchedAt)}
                />
                <TlTransferDetailField
                  label="Receive At"
                  value={formatDateTime(detailSummary.receivedAt)}
                />
                <TlTransferDetailField
                  label="Dispatched By"
                  value={detailSummary.dispatchedBy || '—'}
                />
                <TlTransferDetailField
                  label="Received By"
                  value={detailSummary.receivedBy || '—'}
                />
                <TlTransferDetailField
                  label="Status"
                  value={
                    <Badge
                      variant="secondary"
                      className={statusBadgeClass(displayStatus)}
                    >
                      {tlStatusLabelForRequest({
                        ...headerRequest,
                        status: displayStatus as typeof headerRequest.status,
                      })}
                    </Badge>
                  }
                />
                <TlTransferDetailField
                  label="Date"
                  value={formatDate(headerRequest.created_at)}
                />
              </dl>
              {detailSummary.dispatchShort?.reasonLabel ? (
                <p className="mt-3 text-xs text-amber-800">
                  Dispatch note: {detailSummary.dispatchShort.reasonLabel}
                </p>
              ) : null}

              <div className="mt-5 space-y-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes
                </h5>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-md border px-3 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">Request notes</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {headerRequest.requester_notes?.trim() || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border px-3 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">Admin notes</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {headerRequest.admin_notes?.trim() || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border px-3 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">Dispatcher notes</p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {headerRequest.source_tl_notes?.trim() || '—'}
                    </p>
                  </div>
                  <div
                    className={`rounded-md border px-3 py-2.5 text-sm ${
                      headerRequest.rejection_reason
                        ? 'border-destructive/30 bg-destructive/5'
                        : ''
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">Rejection reason</p>
                    <p
                      className={`mt-1 whitespace-pre-wrap ${
                        headerRequest.rejection_reason ? 'text-destructive' : ''
                      }`}
                    >
                      {headerRequest.rejection_reason?.trim() || '—'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Photos
                </h5>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ProofStrip
                    title="Dispatch photos"
                    urls={proofUrls.dispatch}
                    emptyLabel="No dispatch photos yet"
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
                  <ProofStrip
                    title="Receive photos"
                    urls={proofUrls.receive}
                    emptyLabel="No receive photos yet"
                    onView={(url, index) =>
                      setFullImage({
                        url,
                        title:
                          proofUrls.receive.length > 1
                            ? `Receive photo ${index + 1}`
                            : 'Receive photo',
                      })
                    }
                  />
                </div>
              </div>
            </section>

            <section>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Received Items
              </h4>
              <TransferItemsBreakdownTable items={lines} mode="transfers" />
            </section>
          </TabsContent>

          <TabsContent
            value="receipts"
            className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 data-[state=inactive]:hidden"
          >
            {receiptPreviews.length > 0 ? (
              <div className="space-y-4">
                {receiptPreviews.map((preview) => (
                  <iframe
                    key={preview.key}
                    title={preview.title}
                    srcDoc={preview.html}
                    className="h-[min(70vh,760px)] w-full rounded-lg border bg-white"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1 py-12 text-center">
                <p className="text-sm font-medium">No delivery receipt yet</p>
                <p className="text-sm text-muted-foreground">
                  There is no delivery receipt for this transaction yet. It will
                  appear here once stock is dispatched.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
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
    <TLTransferHistoryDialog open={historyOpen} lines={lines} onOpenChange={setHistoryOpen} />
    </>
  );
}

function ProofStrip({
  title,
  urls,
  emptyLabel = 'No photos yet',
  onView,
}: {
  title: string;
  urls: string[];
  emptyLabel?: string;
  onView: (url: string, index: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{title}</p>
        {urls.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onView(urls[0], 0)}
          >
            <Expand className="mr-1 h-3.5 w-3.5" />
            View full
          </Button>
        ) : null}
      </div>
      {urls.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <button
              key={url}
              type="button"
              className="block h-16 w-16 cursor-pointer overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-90"
              onClick={() => onView(url, index)}
              title="View full size"
            >
              <img
                src={url}
                alt={`${title} ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
