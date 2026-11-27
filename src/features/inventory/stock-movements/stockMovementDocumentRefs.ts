/** Detect ORD / CR / TLREQ / allocation dates in Stock Movement notes and deep-link them. */

import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import { parseDateFromInput } from '@/lib/dateRangePresets';

export type StockMovementDocumentKind =
  | 'order'
  | 'client_return'
  | 'tl_request'
  | 'standard_account_return'
  | 'allocation';

export type StockMovementDocumentRef = {
  kind: StockMovementDocumentKind;
  value: string;
};

/** Matches ORD-…, CR-…, TLREQ-…, RT-… (company initials + digits/dashes). */
export const STOCK_MOVEMENT_DOC_NUMBER_RE =
  /\b((?:ORD|CR|TLREQ|RT)-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b/gi;

export function classifyStockMovementDocumentNumber(
  value: string
): Exclude<StockMovementDocumentKind, 'allocation'> | null {
  const upper = value.trim().toUpperCase();
  if (upper.startsWith('ORD-')) return 'order';
  if (upper.startsWith('CR-')) return 'client_return';
  if (upper.startsWith('TLREQ-')) return 'tl_request';
  if (upper.startsWith('RT-')) return 'standard_account_return';
  return null;
}

/** Manila calendar day as YYYY-MM-DD (matches allocation history filters). */
export function toStockMovementManilaYmd(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Friendly allocation date shown in Notes, e.g. "Mar 12, 2026". */
export function formatStockMovementAllocationDateLabel(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function buildOrdersSearchPath(role: string | null | undefined, orderNumber: string): string {
  const q = encodeURIComponent(orderNumber.trim());
  if (role === 'team_leader') return `/leader-orders?q=${q}`;
  if (role === 'mobile_sales' || role === 'sales_agent') return `/my-orders?q=${q}`;
  return `/orders?q=${q}`;
}

export function buildClientReturnSearchPath(returnNumber: string): string {
  return `/client-order-returns?q=${encodeURIComponent(returnNumber.trim())}`;
}

export function buildTlRequestSearchPath(requestNumber: string): string {
  return `/inventory/tl-stock-requests?q=${encodeURIComponent(requestNumber.trim())}`;
}

/** Standard Account warehouse returns (RT-YYYYMM-####). */
export function buildStandardAccountReturnSearchPath(
  role: string | null | undefined,
  returnNumber: string
): string {
  const q = encodeURIComponent(returnNumber.trim());
  if (role === 'warehouse') return `/inventory/client-stock-returns?q=${q}`;
  return `/inventory/return-to-warehouse?q=${q}`;
}

export type AllocationDeepLinkInput = {
  sessionId?: string | null;
  dateYmd?: string | null;
  referenceType?: string | null;
};

function withAllocationQuery(path: string, input: AllocationDeepLinkInput): string {
  const params = new URLSearchParams();
  const dateYmd = (input.dateYmd || '').trim();
  const sessionId = (input.sessionId || '').trim();
  if (dateYmd) params.set('date', dateYmd);
  if (sessionId) params.set('session', sessionId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function buildAllocationHistoryPath(
  role: string | null | undefined,
  input: AllocationDeepLinkInput = {}
): string {
  const sessionId = (input.sessionId || '').trim();
  const referenceType = (input.referenceType || '').trim();

  if (referenceType === 'warehouse_allocation_history') {
    return withAllocationQuery('/inventory/allocation-history', input);
  }

  if (role === 'warehouse') {
    return withAllocationQuery('/inventory/allocation-history', input);
  }

  if (role === 'team_leader') {
    return withAllocationQuery('/leader-allocation-history', input);
  }

  if (role === 'mobile_sales' || role === 'sales_agent') {
    if (sessionId) return `/my-allocation-history/${encodeURIComponent(sessionId)}`;
    return withAllocationQuery('/my-allocation-history', input);
  }

  return withAllocationQuery('/allocation-history', input);
}

export function buildStockMovementDocumentPath(
  kind: StockMovementDocumentKind,
  value: string,
  role?: string | null,
  allocation?: AllocationDeepLinkInput
): string {
  switch (kind) {
    case 'order':
      return buildOrdersSearchPath(role, value);
    case 'client_return':
      return buildClientReturnSearchPath(value);
    case 'tl_request':
      return buildTlRequestSearchPath(value);
    case 'standard_account_return':
      return buildStandardAccountReturnSearchPath(role, value);
    case 'allocation':
      return buildAllocationHistoryPath(role, {
        sessionId: allocation?.sessionId || value || null,
        dateYmd: allocation?.dateYmd || null,
        referenceType: allocation?.referenceType || null,
      });
  }
}

export type NoteTextPart =
  | { type: 'text'; value: string }
  | {
      type: 'doc';
      kind: StockMovementDocumentKind;
      /** Visible link text (ORD-… / CR-… / date label). */
      value: string;
      dateYmd?: string;
      sessionId?: string | null;
      referenceType?: string | null;
    };

export type SplitStockMovementNoteOptions = {
  allocation?: {
    dateLabel: string;
    dateYmd: string;
    sessionId?: string | null;
    referenceType?: string | null;
  } | null;
};

/** Split note text into plain text + clickable document / allocation-date parts. */
export function splitStockMovementNoteParts(
  notes: string,
  options?: SplitStockMovementNoteOptions
): NoteTextPart[] {
  const text = notes ?? '';
  if (!text) return [];

  type RawMatch = {
    index: number;
    length: number;
    part: Extract<NoteTextPart, { type: 'doc' }>;
  };

  const matches: RawMatch[] = [];

  const docRe = new RegExp(STOCK_MOVEMENT_DOC_NUMBER_RE.source, 'gi');
  let docMatch: RegExpExecArray | null;
  while ((docMatch = docRe.exec(text)) !== null) {
    const value = docMatch[1] ?? docMatch[0];
    const kind = classifyStockMovementDocumentNumber(value);
    if (!kind) continue;
    matches.push({
      index: docMatch.index,
      length: value.length,
      part: { type: 'doc', kind, value },
    });
  }

  const allocation = options?.allocation;
  const dateLabel = allocation?.dateLabel?.trim() || '';
  if (allocation && dateLabel) {
    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(dateLabel, from);
      if (index < 0) break;
      matches.push({
        index,
        length: dateLabel.length,
        part: {
          type: 'doc',
          kind: 'allocation',
          value: dateLabel,
          dateYmd: allocation.dateYmd,
          sessionId: allocation.sessionId ?? null,
          referenceType: allocation.referenceType ?? null,
        },
      });
      from = index + dateLabel.length;
    }
  }

  matches.sort((a, b) => a.index - b.index || b.length - a.length);

  const parts: NoteTextPart[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.index < lastIndex) continue;
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    parts.push(match.part);
    lastIndex = match.index + match.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: text }];
}

/** Read `?date=` / `?session=` deep-links used by allocation history pages. */
export function readAllocationHistoryDeepLink(searchParams: URLSearchParams): {
  dateYmd: string | null;
  sessionId: string | null;
  dateRange: DateRangeFilterValue | null;
} {
  const dateYmdRaw = searchParams.get('date')?.trim() || '';
  const sessionId = searchParams.get('session')?.trim() || null;
  const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(dateYmdRaw) ? dateYmdRaw : null;
  if (!dateYmd) {
    return { dateYmd: null, sessionId, dateRange: null };
  }
  const parsed = parseDateFromInput(dateYmd);
  if (!parsed) {
    return { dateYmd: null, sessionId, dateRange: null };
  }
  return {
    dateYmd,
    sessionId,
    dateRange: { preset: 'custom', customStart: parsed, customEnd: parsed },
  };
}

/** Prefer the deep-linked session when present; otherwise keep the date-filtered list. */
export function preferAllocationSessionGroups<T extends { groupId: string }>(
  filtered: T[],
  all: T[],
  sessionId: string | null | undefined
): T[] {
  const id = (sessionId || '').trim();
  if (!id) return filtered;
  const inFiltered = filtered.filter((group) => group.groupId === id);
  if (inFiltered.length > 0) return inFiltered;
  const inAll = all.filter((group) => group.groupId === id);
  return inAll.length > 0 ? inAll : filtered;
}
