import { useSyncExternalStore } from 'react';
import {
  getItemAllocatableQty,
  newHistoryId,
  type SubWarehouseRequestHistoryEvent,
  type SubWarehouseStockRequest,
  type SubWarehouseStockRequestItem,
  type SubWarehouseStockRequestStatus,
} from './components/SubWarehouseStockRequestDialog';

const STORAGE_KEY = 'b1g.internal-sub-stock-requests.v8';

/** Derive short location code: "Santa Rosa" → STR */
export function deriveLocationCode(locationName: string): string {
  const words = locationName
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Z]/g, ''))
    .filter(Boolean);
  if (words.length === 0) return 'LOC';

  let code = '';
  for (const word of words) {
    if (code.length >= 3) break;
    code += word[0];
  }

  // Two-word names with 2 initials: insert last consonant of first word → Santa Rosa = STR
  if (code.length === 2 && words.length >= 2 && words[0].length > 1) {
    const consonants: string[] = [];
    for (let i = 1; i < words[0].length; i++) {
      const ch = words[0][i];
      if ('BCDFGHJKLMNPQRSTVWXYZ'.includes(ch)) consonants.push(ch);
    }
    if (consonants.length > 0) {
      code = code[0] + consonants[consonants.length - 1] + code[1];
    }
  }

  if (code.length < 3) {
    const letters = locationName.toUpperCase().replace(/[^A-Z]/g, '');
    for (const ch of letters) {
      if (code.length >= 3) break;
      if (!code.includes(ch)) code += ch;
    }
  }

  while (code.length < 3) code += 'X';
  return code.slice(0, 3);
}

function nextRequestNumber(
  existing: SubWarehouseStockRequest[],
  fromLocationName: string
): string {
  const code = deriveLocationCode(fromLocationName);
  const prefix = `RN-${code}-`;
  let maxSeq = 0;
  for (const req of existing) {
    if (!req.requestNumber.startsWith(prefix)) continue;
    const raw = req.requestNumber.slice(prefix.length);
    const n = Number(raw);
    if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

function appendHistory(
  req: SubWarehouseStockRequest,
  event: SubWarehouseRequestHistoryEvent
): SubWarehouseRequestHistoryEvent[] {
  return [...(req.history ?? []), event];
}

function normalizeItem(item: SubWarehouseStockRequestItem): SubWarehouseStockRequestItem {
  return {
    ...item,
    requestedQuantity: item.requestedQuantity ?? 0,
    deliveredQuantity: item.deliveredQuantity ?? 0,
    receivedQuantity: item.receivedQuantity ?? 0,
    openReceiveQuantity: item.openReceiveQuantity ?? 0,
  };
}

type Listener = () => void;

function loadInitial(): SubWarehouseStockRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SubWarehouseStockRequest[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => ({
      ...row,
      fromLocationId: row.fromLocationId || 'unknown-location',
      fromLocationName: row.fromLocationName || 'Sub-warehouse',
      history: row.history ?? [],
      items: (row.items || []).map((item) => normalizeItem(item as SubWarehouseStockRequestItem)),
    }));
  } catch {
    return [];
  }
}

let requestsState: SubWarehouseStockRequest[] = loadInitial();
const listeners = new Set<Listener>();

function persist(next: SubWarehouseStockRequest[]) {
  requestsState = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures — in-memory still works.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return requestsState;
}

export type AllocateRemainingLineInput = {
  variantId: string;
  quantity: number;
};

export function useInternalStockRequests() {
  const requests = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const createRequest = (input: {
    fromLocationId: string;
    fromLocationName: string;
    requestedByName?: string;
    notes?: string;
    items: SubWarehouseStockRequestItem[];
  }) => {
    const at = new Date().toISOString();
    const created: SubWarehouseStockRequest = {
      id: `local-${Date.now()}`,
      requestNumber: nextRequestNumber(requestsState, input.fromLocationName),
      createdAt: at,
      status: 'pending_approval',
      fromLocationId: input.fromLocationId,
      fromLocationName: input.fromLocationName,
      requestedByName: input.requestedByName,
      notes: input.notes || undefined,
      items: input.items.map((item) => normalizeItem(item)),
      history: [
        {
          id: newHistoryId('created'),
          type: 'created',
          at,
          byName: input.requestedByName,
          note: input.notes || undefined,
        },
      ],
    };
    persist([created, ...requestsState]);
    return created;
  };

  const updateRequest = (
    requestId: string,
    updater: (req: SubWarehouseStockRequest) => SubWarehouseStockRequest
  ) => {
    persist(requestsState.map((req) => (req.id === requestId ? updater(req) : req)));
  };

  const approveAndRelease = (
    requestId: string,
    options?: {
      byName?: string;
      signatureDataUrl?: string;
      proofImageDataUrl?: string;
    }
  ) => {
    updateRequest(requestId, (req) => {
      if (req.status !== 'pending_approval') return req;
      const at = new Date().toISOString();
      const lines = req.items.map((item) => ({
        variantId: item.variantId,
        variantName: item.variantName,
        brandName: item.brandName,
        quantity: item.requestedQuantity,
      }));
      return {
        ...req,
        status: 'pending_receive',
        items: req.items.map((item) => ({
          ...item,
          deliveredQuantity: item.requestedQuantity,
          receivedQuantity: 0,
          openReceiveQuantity: item.requestedQuantity,
        })),
        history: appendHistory(req, {
          id: newHistoryId('release'),
          type: 'approved_released',
          at,
          byName: options?.byName || 'Main Warehouse',
          lines,
          proofImageDataUrl: options?.proofImageDataUrl,
          signatureDataUrl: options?.signatureDataUrl,
        }),
      };
    });
  };

  /**
   * Manual allocate of short qty on the same request number (next wave).
   * After a partial receive, openReceive is cleared; this unlocks qty again.
   * Example: short 5, main allocates 3 → openReceive=3, status stays partially_received.
   * When short is fully received later → fully_received.
   */
  const allocateRemaining = (
    requestId: string,
    lines: AllocateRemainingLineInput[],
    options?: {
      note?: string;
      byName?: string;
      proofImageDataUrl?: string;
      signatureDataUrl?: string;
    }
  ) => {
    updateRequest(requestId, (req) => {
      if (req.status !== 'partially_received') return req;

      const qtyByVariant = new Map(
        lines
          .filter((line) => line.quantity > 0)
          .map((line) => [line.variantId, Math.floor(line.quantity)])
      );
      if (qtyByVariant.size === 0) return req;

      const historyLines: Array<{
        variantId: string;
        variantName: string;
        brandName?: string;
        quantity: number;
      }> = [];
      const nextItems = req.items.map((item) => {
        const requested = qtyByVariant.get(item.variantId) ?? 0;
        if (requested <= 0) return item;
        const allocatable = getItemAllocatableQty(item);
        const allocateQty = Math.min(requested, allocatable);
        if (allocateQty <= 0) return item;
        historyLines.push({
          variantId: item.variantId,
          variantName: item.variantName,
          brandName: item.brandName,
          quantity: allocateQty,
        });
        return {
          ...item,
          openReceiveQuantity: (item.openReceiveQuantity ?? 0) + allocateQty,
        };
      });

      if (historyLines.length === 0) return req;

      const at = new Date().toISOString();
      // Stay partially_received until sub receives enough to clear the short (fully_received).
      return {
        ...req,
        status: 'partially_received',
        items: nextItems,
        history: appendHistory(req, {
          id: newHistoryId('remaining'),
          type: 'remaining_released',
          at,
          byName: options?.byName || 'Main Warehouse',
          note:
            options?.note ||
            `Allocated ${historyLines.reduce((s, l) => s + l.quantity, 0)} unit(s) of remaining short`,
          lines: historyLines,
          proofImageDataUrl: options?.proofImageDataUrl,
          signatureDataUrl: options?.signatureDataUrl,
        }),
      };
    });
  };

  const rejectRequest = (
    requestId: string,
    reason: string,
    options?: { byName?: string; signatureDataUrl?: string }
  ) => {
    updateRequest(requestId, (req) => {
      if (req.status !== 'pending_approval') return req;
      const at = new Date().toISOString();
      const note = reason.trim() || 'Rejected by main warehouse';
      const lines = req.items.map((item) => ({
        variantId: item.variantId,
        variantName: item.variantName,
        brandName: item.brandName,
        quantity: item.requestedQuantity,
      }));
      return {
        ...req,
        status: 'rejected',
        rejectionReason: note,
        history: appendHistory(req, {
          id: newHistoryId('rejected'),
          type: 'rejected',
          at,
          byName: options?.byName || 'Main Warehouse',
          note,
          lines,
          signatureDataUrl: options?.signatureDataUrl,
        }),
      };
    });
  };

  return {
    requests,
    createRequest,
    updateRequest,
    approveAndRelease,
    allocateRemaining,
    rejectRequest,
  };
}

export function countByStatus(
  requests: SubWarehouseStockRequest[],
  status: SubWarehouseStockRequestStatus
) {
  return requests.filter((r) => r.status === status).length;
}
