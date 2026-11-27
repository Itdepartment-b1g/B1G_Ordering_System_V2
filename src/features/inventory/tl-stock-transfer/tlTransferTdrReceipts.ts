import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  buildTlTdrPdfHtml,
  exportTlTdrPdf,
  type TlTdrPdfOptions,
} from './exportTlTransferPdfs';
import { tlDispatchedQty } from './tlStockTransferShared';
import type { TlTdrDetails } from '@/store/slices/motosales/tl-stock-transfers';

export type TdrDisplayLine = {
  key: string;
  requestItemId?: string;
  label: string;
  dispatched: number;
  received: number;
  pendingNote: string;
};

export type TdrDisplay = {
  tdr_number: string;
  kind: string;
  created_at: string;
  lines: TdrDisplayLine[];
};

export type TlTransferReceiptPreview = {
  key: string;
  title: string;
  html: string;
  options: TlTdrPdfOptions;
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

function fallbackLinesFromItems(lines: TLRequestWithDetails[]): TdrDisplayLine[] {
  return lines
    .map((line) =>
      displayLine(
        line.id,
        variantLabel(line),
        tlDispatchedQty(line),
        Number(line.received_quantity || 0),
        line.id,
        line.received_quantity != null
      )
    )
    .filter((row): row is TdrDisplayLine => !!row);
}

export function buildTlTransferTdrDisplays(
  lines: TLRequestWithDetails[],
  tdrQuery?: TlTdrDetails | null
): TdrDisplay[] {
  const headerRequest = lines[0];
  if (!headerRequest) return [];

  const fetchedTdrs = tdrQuery?.tdrs || [];
  const shortages = tdrQuery?.shortages || [];
  const source =
    fetchedTdrs.length > 0
      ? fetchedTdrs
      : headerRequest.tdrs && headerRequest.tdrs.length > 0
        ? headerRequest.tdrs
        : headerRequest.tdr_number
          ? [
              {
                tdr_number: headerRequest.tdr_number,
                kind: 'dispatch',
                created_at: headerRequest.dispatched_at || headerRequest.created_at,
              },
            ]
          : [];

  if (source.length === 0) return [];

  const fromMovements = reconstructTdrLinesFromMovements(
    source as { tdr_number: string; created_at: string }[],
    lines,
    tdrQuery?.movements || []
  );
  const fromShortages = reconstructTdrLinesFromShortages(
    source as { tdr_number: string }[],
    lines,
    shortages
  );
  const fallback = fallbackLinesFromItems(lines);

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

    let resolved = useStored
      ? fromStore
      : movementLines.length > 0
        ? movementLines
        : fromShortages[index] || [];

    if (resolved.length === 0 && fallback.length > 0 && source.length === 1) {
      resolved = fallback;
    }

    return {
      tdr_number: String(entry.tdr_number),
      kind: String(entry.kind || 'dispatch'),
      created_at: String(entry.created_at || headerRequest.created_at),
      lines: resolved,
    };
  });
}

export function buildTlTdrPdfOptions(
  entry: TdrDisplay,
  lines: TLRequestWithDetails[]
): TlTdrPdfOptions | null {
  const headerRequest = lines[0];
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
        label: line.label.includes(' · ') ? line.label.replace(' · ', ' — ') : line.label,
        dispatched: line.dispatched,
        received: line.received,
        shortfallReason,
        receiveConfirmed,
      };
    }),
  };
}

export function buildTlTransferReceiptPreviews(
  lines: TLRequestWithDetails[],
  tdrQuery?: TlTdrDetails | null
): TlTransferReceiptPreview[] {
  return buildTlTransferTdrDisplays(lines, tdrQuery)
    .map((entry) => {
      const options = buildTlTdrPdfOptions(entry, lines);
      if (!options) return null;
      return {
        key: entry.tdr_number,
        title: `TDR — ${entry.tdr_number}`,
        html: buildTlTdrPdfHtml(options),
        options,
      };
    })
    .filter((preview): preview is TlTransferReceiptPreview => !!preview);
}

export async function printTlTransferTdrs(
  lines: TLRequestWithDetails[],
  tdrQuery?: TlTdrDetails | null
): Promise<number> {
  const previews = buildTlTransferReceiptPreviews(lines, tdrQuery);
  if (previews.length === 0) {
    throw new Error('No delivery receipt yet for this transfer.');
  }
  for (const preview of previews) {
    await exportTlTdrPdf(preview.options);
  }
  return previews.length;
}

/** Fetch TDR details when possible, then open printable TDR(s). */
export async function printTlTransferGroupTdrs(
  lines: TLRequestWithDetails[],
  fetchDetails?: (requestId: string) => Promise<TlTdrDetails>
): Promise<number> {
  const headerId = lines[0]?.request_id;
  let tdrQuery: TlTdrDetails | null = null;
  if (headerId && fetchDetails) {
    try {
      tdrQuery = await fetchDetails(headerId);
    } catch {
      tdrQuery = null;
    }
  }
  return printTlTransferTdrs(lines, tdrQuery);
}
