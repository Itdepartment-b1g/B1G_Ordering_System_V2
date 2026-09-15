import { supabase } from '@/lib/supabase';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import type {
  TLDiscrepancyStatus,
  TLReceiveShortfallReason,
  TLRequestWithDetails,
} from '@/types/tlStockRequests.types';
import { tlDispatchedQty } from './tlStockTransferShared';

export type TlTransferHistoryLine = {
  itemId?: string;
  label: string;
  brandName: string;
  variantName: string;
  quantity: number;
  reason?: string | null;
};

export type TlTransferHistoryEventType =
  | 'created'
  | 'admin_approved'
  | 'rejected'
  | 'cancelled'
  | 'dispatched'
  | 'receive_confirmed'
  | 'shortage_opened'
  | 'shortage_resolved_redeliver'
  | 'shortage_resolved_found_keep'
  | 'shortage_resolved_write_off'
  | 'shortage_resolved_write_off_replace';

export type TlTransferHistoryEvent = {
  id: string;
  type: TlTransferHistoryEventType;
  at: string;
  byName?: string;
  note?: string;
  tdrNumber?: string;
  tdrKind?: string;
  fromName?: string;
  lines?: TlTransferHistoryLine[];
  shortQuantity?: number;
  awaitingReceive?: boolean;
  proofImageUrls?: string[];
  signatureDataUrl?: string;
};

export type TlTransferHistoryItem = {
  itemId: string;
  label: string;
  brandName: string;
  variantName: string;
  requestedQuantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
};

export type TlTransferHistoryPayload = {
  requestNumber: string;
  requesterName: string;
  sourceName: string;
  items: TlTransferHistoryItem[];
  history: TlTransferHistoryEvent[];
  lines: TLRequestWithDetails[];
};

type TdrItemRow = {
  tdr_id: string;
  request_item_id: string;
  dispatched_quantity: number;
  received_quantity: number;
};

type TdrRow = {
  id: string;
  tdr_number: string;
  kind: string;
  created_at: string;
  items: TdrItemRow[];
};

type ShortageRow = {
  id: string;
  request_item_id: string | null;
  variant_id: string | null;
  quantity: number;
  reason: TLReceiveShortfallReason | string | null;
  reporter_notes: string | null;
  status: TLDiscrepancyStatus | string;
  reported_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
};

type MovementRow = {
  variant_id: string;
  transaction_type: string;
  quantity: number;
  created_at: string;
  notes: string | null;
};

function skuParts(line: {
  variant?: { name?: string | null; brand_name?: string | null };
  id?: string;
}) {
  const brandName = line.variant?.brand_name?.trim() || '';
  const variantName = line.variant?.name?.trim() || 'Item';
  return {
    brandName: brandName || '—',
    variantName,
    label: [brandName, variantName].filter(Boolean).join(' · ') || 'Item',
  };
}

function lineFromSku(line: TLRequestWithDetails, quantity: number, reason?: string | null): TlTransferHistoryLine {
  const parts = skuParts(line);
  return {
    itemId: line.id,
    label: parts.label,
    brandName: parts.brandName,
    variantName: parts.variantName,
    quantity,
    reason: reason || undefined,
  };
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))];
}

function isFoundReturnNote(notes: string | null | undefined) {
  const value = (notes || '').toLowerCase();
  return value.includes('found') && value.includes('returned');
}

function isReceiveNote(notes: string | null | undefined) {
  return (notes || '').toLowerCase().startsWith('tl transfer receive');
}

function nearestIndex(at: number, times: number[]) {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const dist = Math.abs(time - at);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

function latestIndexAt(at: number, times: number[]) {
  let latest = -1;
  times.forEach((time, index) => {
    if (time <= at) latest = index;
  });
  return latest;
}

function historyLineKey(line: { itemId?: string; label: string }) {
  return line.itemId || line.label;
}

/** Remaining on the TDR this receive belongs to — not all TDRs combined. */
function shortOnMatchingTdr(
  waveIndex: number,
  waves: Array<{ at: string; lines: TlTransferHistoryLine[] }>,
  tdrs: TdrRow[],
  skuLines: TLRequestWithDetails[],
  movements: MovementRow[]
): { shortQuantity: number; tdrNumber?: string; tdrKind?: string } {
  const wave = waves[waveIndex];
  if (!wave) return { shortQuantity: 0 };
  if (tdrs.length === 0) {
    const dispatched = skuLines.reduce((sum, line) => sum + tlDispatchedQty(line), 0);
    const receivedToDate = waves
      .slice(0, waveIndex + 1)
      .reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + line.quantity, 0), 0);
    return { shortQuantity: Math.max(0, dispatched - receivedToDate) };
  }

  const tdrTimes = tdrs.map((tdr) => new Date(tdr.created_at).getTime());
  const tdrIndex = Math.max(0, latestIndexAt(new Date(wave.at).getTime(), tdrTimes));
  const tdr = tdrs[tdrIndex];
  const dispatchedLines = dispatchLinesForTdr(tdr, tdrIndex, tdrs, skuLines, movements);
  const receivedByKey = new Map<string, number>();
  waves.forEach((row, index) => {
    if (index > waveIndex) return;
    const rowTdr = Math.max(0, latestIndexAt(new Date(row.at).getTime(), tdrTimes));
    if (rowTdr !== tdrIndex) return;
    for (const line of row.lines) {
      const key = historyLineKey(line);
      receivedByKey.set(key, (receivedByKey.get(key) || 0) + line.quantity);
    }
  });
  const shortQuantity = dispatchedLines.reduce((sum, line) => {
    const received = receivedByKey.get(historyLineKey(line)) || 0;
    return sum + Math.max(0, line.quantity - received);
  }, 0);
  return { shortQuantity, tdrNumber: tdr?.tdr_number, tdrKind: tdr?.kind };
}

function timeBucket(iso: string) {
  return Math.round(new Date(iso).getTime() / 120_000);
}

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => !!value);
}

function eventFlowOrder(type: TlTransferHistoryEventType): number {
  switch (type) {
    case 'created':
      return 10;
    case 'admin_approved':
      return 20;
    case 'dispatched':
      return 40;
    case 'receive_confirmed':
      return 60;
    case 'shortage_opened':
      return 65;
    case 'shortage_resolved_redeliver':
    case 'shortage_resolved_found_keep':
    case 'shortage_resolved_write_off':
    case 'shortage_resolved_write_off_replace':
      return 68;
    case 'rejected':
    case 'cancelled':
      return 70;
    default:
      return 100;
  }
}

export function sortTlTransferHistoryEvents(
  events: TlTransferHistoryEvent[],
  direction: 'asc' | 'desc' = 'desc'
): TlTransferHistoryEvent[] {
  const sign = direction === 'desc' ? 1 : -1;
  return [...events].sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (ta !== tb) return sign * (tb - ta);
    return sign * (eventFlowOrder(b.type) - eventFlowOrder(a.type));
  });
}

function resolvedShortageType(
  status: string
): Extract<
  TlTransferHistoryEventType,
  | 'shortage_resolved_redeliver'
  | 'shortage_resolved_found_keep'
  | 'shortage_resolved_write_off'
  | 'shortage_resolved_write_off_replace'
> | null {
  switch (status) {
    case 'resolved_redeliver':
      return 'shortage_resolved_redeliver';
    case 'resolved_found_keep':
      return 'shortage_resolved_found_keep';
    case 'resolved_write_off':
      return 'shortage_resolved_write_off';
    case 'resolved_write_off_replace':
      return 'shortage_resolved_write_off_replace';
    default:
      return null;
  }
}

function dispatchLinesForTdr(
  tdr: TdrRow,
  tdrIndex: number,
  tdrs: TdrRow[],
  skuLines: TLRequestWithDetails[],
  movements: MovementRow[]
): TlTransferHistoryLine[] {
  const stored = (tdr.items || [])
    .map((item) => {
      const match = skuLines.find((line) => line.id === item.request_item_id);
      const qty = Number(item.dispatched_quantity || 0);
      if (qty <= 0 || !match) return null;
      return lineFromSku(match, qty);
    })
    .filter((row): row is TlTransferHistoryLine => !!row);

  const tdrTimes = tdrs.map((row) => new Date(row.created_at).getTime());
  const fromMovements = skuLines
    .map((line) => {
      const variantId = line.variant_id || line.variant?.id || '';
      const qty = movements
        .filter((tx) => {
          if (tx.transaction_type !== 'tl_stock_transfer_out') return false;
          if (tx.variant_id !== variantId) return false;
          if (isFoundReturnNote(tx.notes)) return false;
          return nearestIndex(new Date(tx.created_at).getTime(), tdrTimes) === tdrIndex;
        })
        .reduce((sum, tx) => sum + Number(tx.quantity || 0), 0);
      return qty > 0 ? lineFromSku(line, qty) : null;
    })
    .filter((row): row is TlTransferHistoryLine => !!row);

  const storedQty = stored.reduce((sum, row) => sum + row.quantity, 0);
  const movementQty = fromMovements.reduce((sum, row) => sum + row.quantity, 0);
  if (movementQty > 0 && (storedQty === 0 || storedQty > movementQty)) return fromMovements;
  if (stored.length > 0) return stored;
  return fromMovements;
}

function receiveWaves(
  tdrs: TdrRow[],
  skuLines: TLRequestWithDetails[],
  movements: MovementRow[]
): Array<{ at: string; lines: TlTransferHistoryLine[] }> {
  const receiveMoves = movements.filter(
    (tx) => tx.transaction_type === 'tl_stock_transfer_in' && isReceiveNote(tx.notes)
  );
  if (receiveMoves.length > 0) {
    const groups = new Map<number, MovementRow[]>();
    for (const tx of receiveMoves) {
      const key = timeBucket(tx.created_at);
      const list = groups.get(key) ?? [];
      list.push(tx);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, rows]) => {
        const byVariant = new Map<string, number>();
        for (const tx of rows) {
          byVariant.set(tx.variant_id, (byVariant.get(tx.variant_id) || 0) + Number(tx.quantity || 0));
        }
        const lines = skuLines
          .map((line) => {
            const variantId = line.variant_id || line.variant?.id || '';
            const qty = byVariant.get(variantId) || 0;
            return qty > 0 ? lineFromSku(line, qty) : null;
          })
          .filter((row): row is TlTransferHistoryLine => !!row);
        return {
          at: rows[0]?.created_at || skuLines[0]?.received_at || new Date().toISOString(),
          lines,
        };
      })
      .filter((wave) => wave.lines.length > 0);
  }

  const receivedAt = firstNonEmpty(skuLines.map((line) => line.received_at));
  if (!receivedAt) return [];

  if (tdrs.length > 0) {
    const tdrTimes = tdrs.map((row) => new Date(row.created_at).getTime());
    const receiveTime = new Date(receivedAt).getTime();
    const tdrIndex = Math.max(0, latestIndexAt(receiveTime, tdrTimes));
    const tdr = tdrs[tdrIndex];
    const lines = (tdr?.items || [])
      .map((item) => {
        const match = skuLines.find((line) => line.id === item.request_item_id);
        const qty = Number(item.received_quantity || 0);
        if (qty <= 0 || !match) return null;
        return lineFromSku(match, qty);
      })
      .filter((row): row is TlTransferHistoryLine => !!row);
    if (lines.length > 0) return [{ at: receivedAt, lines }];
  }

  const lines = skuLines
    .map((line) => {
      const qty = Number(line.received_quantity || 0);
      return qty > 0 || line.received_quantity != null ? lineFromSku(line, qty) : null;
    })
    .filter((row): row is TlTransferHistoryLine => !!row);
  return lines.length > 0 ? [{ at: receivedAt, lines }] : [];
}

export function buildTlTransferHistory(args: {
  skuLines: TLRequestWithDetails[];
  tdrs: TdrRow[];
  shortages: ShortageRow[];
  movements: MovementRow[];
  namesById: Map<string, string>;
}): TlTransferHistoryPayload | null {
  const { skuLines, tdrs, shortages, movements, namesById } = args;
  const header = skuLines[0];
  if (!header) return null;

  const nameOf = (id: string | null | undefined, fallback?: string) =>
    (id ? namesById.get(id) : undefined) || fallback;

  const items: TlTransferHistoryItem[] = skuLines.map((line) => {
    const parts = skuParts(line);
    return {
      itemId: line.id,
      label: parts.label,
      brandName: parts.brandName,
      variantName: parts.variantName,
      requestedQuantity: Number(line.requested_quantity || 0),
      dispatchedQuantity: line.dispatched_quantity == null && !line.dispatched_at ? 0 : tlDispatchedQty(line),
      receivedQuantity: Number(line.received_quantity || 0),
    };
  });

  const history: TlTransferHistoryEvent[] = [];

  history.push({
    id: `created-${header.request_id}`,
    type: 'created',
    at: header.created_at,
    byName: header.requester?.full_name,
    note: header.requester_notes || undefined,
    lines: skuLines.map((line) => lineFromSku(line, Number(line.requested_quantity || 0))),
  });

  const approvedAt = firstNonEmpty(skuLines.map((line) => line.admin_approved_at));
  if (approvedAt) {
    const approvedBy = firstNonEmpty(skuLines.map((line) => line.admin_approved_by));
    history.push({
      id: `admin-approved-${header.request_id}`,
      type: 'admin_approved',
      at: approvedAt,
      byName: nameOf(approvedBy, 'Admin'),
      note: firstNonEmpty(skuLines.map((line) => line.admin_notes)),
      lines: skuLines.map((line) =>
        lineFromSku(line, Number(line.admin_approved_quantity ?? line.requested_quantity ?? 0))
      ),
    });
  }

  const rejectedAt = firstNonEmpty(skuLines.map((line) => line.rejected_at));
  const rejectedStatus = skuLines.find((line) =>
    ['admin_rejected', 'source_tl_rejected', 'cancelled'].includes(line.status)
  )?.status;
  if (rejectedAt || rejectedStatus === 'cancelled') {
    const rejectedBy = firstNonEmpty(skuLines.map((line) => line.rejected_by));
    const isCancelled = rejectedStatus === 'cancelled';
    history.push({
      id: `closed-${header.request_id}`,
      type: isCancelled ? 'cancelled' : 'rejected',
      at: rejectedAt || header.updated_at || header.created_at,
      byName: nameOf(
        rejectedBy,
        rejectedStatus === 'source_tl_rejected' ? header.source?.full_name : 'Admin'
      ),
      note: firstNonEmpty(skuLines.map((line) => line.rejection_reason)),
      lines: skuLines.map((line) => lineFromSku(line, Number(line.requested_quantity || 0))),
    });
  }

  const dispatchProofs = [...new Set(skuLines.flatMap((line) => line.dispatch_proof_urls || []))];
  const dispatchSignature = firstNonEmpty(skuLines.map((line) => line.source_tl_signature_url));
  const sourceName = header.source?.full_name;
  const dispatchBy = nameOf(
    firstNonEmpty(skuLines.map((line) => line.source_tl_approved_by)),
    sourceName
  );

  const tdrList =
    tdrs.length > 0
      ? tdrs
      : header.tdr_number
        ? [
            {
              id: header.tdr_number,
              tdr_number: header.tdr_number,
              kind: 'dispatch',
              created_at: header.dispatched_at || header.created_at,
              items: [],
            },
          ]
        : [];

  if (tdrList.length === 0) {
    const dispatchedAt = firstNonEmpty(skuLines.map((line) => line.dispatched_at));
    if (dispatchedAt) {
      const lines = skuLines
        .map((line) => {
          const qty = tlDispatchedQty(line);
          return qty > 0 ? lineFromSku(line, qty) : null;
        })
        .filter((row): row is TlTransferHistoryLine => !!row);
      if (lines.length > 0) {
        history.push({
          id: `dispatched-${header.request_id}`,
          type: 'dispatched',
          at: dispatchedAt,
          byName: dispatchBy,
          fromName: sourceName,
          note: firstNonEmpty(skuLines.map((line) => line.source_tl_notes)),
          lines,
          awaitingReceive: skuLines.some(
            (line) => line.status === 'pending_receipt' && line.received_quantity == null
          ),
          proofImageUrls: dispatchProofs,
          signatureDataUrl: dispatchSignature,
        });
      }
    }
  } else {
    tdrList.forEach((tdr, tdrIndex) => {
      const lines = dispatchLinesForTdr(tdr, tdrIndex, tdrList, skuLines, movements);
      if (lines.length === 0) return;
      const isFirst = tdrIndex === 0;
      history.push({
        id: `dispatched-${tdr.tdr_number}`,
        type: 'dispatched',
        at: tdr.created_at,
        byName: dispatchBy,
        fromName: sourceName,
        tdrNumber: tdr.tdr_number,
        tdrKind: tdr.kind,
        note: isFirst ? firstNonEmpty(skuLines.map((line) => line.source_tl_notes)) : undefined,
        lines,
        awaitingReceive: skuLines.some(
          (line) => line.status === 'pending_receipt' && line.received_quantity == null
        ) && tdrIndex === tdrList.length - 1,
        proofImageUrls: isFirst ? dispatchProofs : undefined,
        signatureDataUrl: isFirst ? dispatchSignature : undefined,
      });
    });
  }

  const waves = receiveWaves(tdrList, skuLines, movements);
  const receiveProofs = [...new Set(skuLines.flatMap((line) => line.receive_proof_urls || []))];
  const receiveSignature = firstNonEmpty(skuLines.map((line) => line.received_signature_url));
  const receiveBy = nameOf(
    firstNonEmpty(skuLines.map((line) => line.received_by)),
    header.requester?.full_name
  );

  waves.forEach((wave, waveIndex) => {
    const matched = shortOnMatchingTdr(waveIndex, waves, tdrList, skuLines, movements);
    const isLast = waveIndex === waves.length - 1;
    history.push({
      id: `receive-${header.request_id}-${waveIndex}`,
      type: 'receive_confirmed',
      at: wave.at,
      byName: receiveBy,
      fromName: sourceName,
      tdrNumber: matched.tdrNumber,
      tdrKind: matched.tdrKind,
      lines: wave.lines,
      shortQuantity: matched.shortQuantity,
      proofImageUrls: isLast ? receiveProofs : undefined,
      signatureDataUrl: isLast ? receiveSignature : undefined,
    });
  });

  shortages.forEach((row) => {
    const match =
      skuLines.find((line) => line.id === row.request_item_id) ||
      skuLines.find((line) => (line.variant_id || line.variant?.id) === row.variant_id);
    const reason = formatShortfallReasonLabel(row.reason, row.reporter_notes);
    const line = match
      ? lineFromSku(match, Number(row.quantity || 0), reason)
      : {
          label: 'Item',
          brandName: '—',
          variantName: 'Item',
          quantity: Number(row.quantity || 0),
          reason,
        };
    history.push({
      id: `shortage-open-${row.id}`,
      type: 'shortage_opened',
      at: row.created_at,
      byName: nameOf(row.reported_by, header.requester?.full_name),
      note: row.reporter_notes || undefined,
      lines: [line],
      shortQuantity: Number(row.quantity || 0),
    });
    const resolvedType = row.resolved_at ? resolvedShortageType(row.status) : null;
    if (row.resolved_at && resolvedType) {
      history.push({
        id: `shortage-resolved-${row.id}`,
        type: resolvedType,
        at: row.resolved_at,
        byName: nameOf(row.resolved_by, header.source?.full_name),
        note: row.resolution_notes || undefined,
        lines: [line],
        shortQuantity: Number(row.quantity || 0),
      });
    }
  });

  return {
    requestNumber: header.request_number,
    requesterName: header.requester?.full_name || '—',
    sourceName: sourceName || '—',
    items,
    history: sortTlTransferHistoryEvents(history, 'desc'),
    lines: skuLines,
  };
}

export function tlTransferShortQuantity(
  items: TlTransferHistoryItem[],
  history: TlTransferHistoryEvent[]
): number {
  const requested = items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity), 0);
  const received = items.reduce((sum, item) => sum + Math.max(0, item.receivedQuantity), 0);
  if (received <= 0) return 0;

  const writeOffOnly = history.reduce((sum, event) => {
    if (event.type !== 'shortage_resolved_write_off') return sum;
    const fromLines = (event.lines ?? []).reduce((lineSum, line) => lineSum + Math.max(0, line.quantity), 0);
    return sum + Math.max(0, event.shortQuantity ?? fromLines);
  }, 0);

  return Math.max(0, requested - received - writeOffOnly);
}

/**
 * Header / SKU Dispatched: physical units that left the dispatcher.
 * Found → redeliver is the same units (do not double-count).
 * Write off & replace is new stock (do count).
 */
export function withGrossDispatchedQuantities(
  items: TlTransferHistoryItem[],
  history: TlTransferHistoryEvent[]
): TlTransferHistoryItem[] {
  const fromEvents = new Map<string, number>();
  let anyDispatch = false;
  for (const event of history) {
    if (event.type !== 'dispatched') continue;
    if (event.tdrKind === 'redeliver') continue;
    anyDispatch = true;
    for (const line of event.lines ?? []) {
      const key = line.itemId || line.label;
      fromEvents.set(key, (fromEvents.get(key) || 0) + Math.max(0, line.quantity));
    }
  }
  if (!anyDispatch) return items;
  return items.map((item) => ({
    ...item,
    dispatchedQuantity:
      fromEvents.get(item.itemId) ?? fromEvents.get(item.label) ?? item.dispatchedQuantity,
  }));
}

export function dispatchEventTitle(event: TlTransferHistoryEvent): string {
  if (event.type !== 'dispatched') return 'Dispatched';
  if (event.tdrKind === 'redeliver') return 'Redispatched';
  if (event.tdrKind === 'replace') return 'Replacement dispatched';
  return 'Dispatched';
}

export async function fetchTlTransferHistory(
  skuLines: TLRequestWithDetails[]
): Promise<TlTransferHistoryPayload> {
  const header = skuLines[0];
  if (!header) {
    return {
      requestNumber: '',
      requesterName: '',
      sourceName: '',
      items: [],
      history: [],
      lines: [],
    };
  }

  const headerId = header.request_id;
  const [{ data: tdrs, error: tdrError }, { data: discs, error: discError }, { data: txs }] =
    await Promise.all([
      supabase
        .from('tl_stock_request_tdrs')
        .select('id, tdr_number, kind, created_at')
        .eq('request_id', headerId)
        .order('created_at', { ascending: true }),
      supabase
        .from('tl_stock_request_discrepancies')
        .select(
          'id, request_item_id, variant_id, quantity, reason, reporter_notes, status, reported_by, resolved_by, resolved_at, resolution_notes, created_at'
        )
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

  if (tdrError) throw tdrError;
  if (discError && !String(discError.message || '').includes('tl_stock_request_discrepancies')) {
    throw discError;
  }

  const tdrRows = (tdrs || []) as Omit<TdrRow, 'items'>[];
  let tdrItems: TdrItemRow[] = [];
  if (tdrRows.length > 0) {
    const { data: items } = await supabase
      .from('tl_stock_request_tdr_items')
      .select('tdr_id, request_item_id, dispatched_quantity, received_quantity')
      .in(
        'tdr_id',
        tdrRows.map((row) => row.id)
      );
    tdrItems = (items || []) as TdrItemRow[];
  }

  const tdrsWithItems: TdrRow[] = tdrRows.map((tdr) => ({
    ...tdr,
    items: tdrItems.filter((item) => item.tdr_id === tdr.id),
  }));

  const shortages = (discs || []) as ShortageRow[];
  const movements = (txs || []) as MovementRow[];

  const profileIds = uniqueIds([
    ...skuLines.map((line) => line.admin_approved_by),
    ...skuLines.map((line) => line.source_tl_approved_by),
    ...skuLines.map((line) => line.received_by),
    ...skuLines.map((line) => line.rejected_by),
    ...shortages.map((row) => row.reported_by),
    ...shortages.map((row) => row.resolved_by),
  ]);

  const namesById = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', profileIds);
    for (const profile of profiles || []) {
      if (profile.id && profile.full_name) namesById.set(profile.id, profile.full_name);
    }
  }

  return (
    buildTlTransferHistory({
      skuLines,
      tdrs: tdrsWithItems,
      shortages,
      movements,
      namesById,
    }) || {
      requestNumber: header.request_number,
      requesterName: header.requester?.full_name || '—',
      sourceName: header.source?.full_name || '—',
      items: [],
      history: [],
      lines: skuLines,
    }
  );
}
