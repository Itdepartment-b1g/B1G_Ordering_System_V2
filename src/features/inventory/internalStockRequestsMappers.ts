import type {
  SubWarehouseReceiveProof,
  SubWarehouseRequestHistoryEvent,
  SubWarehouseReleaseLine,
  SubWarehouseStockRequest,
  SubWarehouseStockRequestItem,
  SubWarehouseStockRequestStatus,
} from './components/SubWarehouseStockRequestDialog';
import type {
  InternalStockRequestEventRow,
  InternalStockRequestRow,
} from './internalStockRequestsApi';

type RawEventLine = {
  variant_id?: string;
  variantId?: string;
  quantity?: number;
  variant_name?: string;
  variantName?: string;
  brand_name?: string;
  brandName?: string;
};

function mapItems(row: InternalStockRequestRow): SubWarehouseStockRequestItem[] {
  return (row.items ?? []).map((item) => {
    const brand = item.variant?.brand;
    const brandObj = Array.isArray(brand) ? brand[0] : brand;
    return {
      variantId: item.variant_id,
      variantName: item.variant?.name || item.variant_id,
      brandName: brandObj?.name,
      requestedQuantity: item.requested_quantity ?? 0,
      deliveredQuantity: item.delivered_quantity ?? 0,
      receivedQuantity: item.received_quantity ?? 0,
      openReceiveQuantity: item.open_receive_quantity ?? 0,
    };
  });
}

function resolveLines(
  raw: unknown,
  items: SubWarehouseStockRequestItem[]
): SubWarehouseReleaseLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const line = entry as RawEventLine;
    const variantId = String(line.variant_id || line.variantId || '');
    const item = items.find((i) => i.variantId === variantId);
    return {
      variantId,
      variantName: line.variantName || line.variant_name || item?.variantName || variantId,
      brandName: line.brandName || line.brand_name || item?.brandName,
      quantity: Number(line.quantity) || 0,
    };
  });
}

function mapEvent(
  event: InternalStockRequestEventRow & {
    created_by_user?: { full_name: string | null } | null;
  },
  items: SubWarehouseStockRequestItem[]
): SubWarehouseRequestHistoryEvent | null {
  const byName = event.created_by_user?.full_name || undefined;
  const base = {
    id: event.id,
    at: event.created_at,
    note: event.note || undefined,
    byName,
  };
  const lines = resolveLines(event.lines, items);

  switch (event.event_type) {
    case 'created':
      return { ...base, type: 'created' };
    case 'main_allocated':
      return {
        ...base,
        type: 'main_allocated',
        lines: lines.length > 0 ? lines : undefined,
      };
    case 'approved':
      return { ...base, type: 'approved' };
    case 'delivered':
      return {
        ...base,
        type: 'delivered',
        lines,
        proofImageDataUrl: event.proof_image_url || undefined,
        signatureDataUrl: event.signature_url || undefined,
      };
    case 'approved_released':
      return {
        ...base,
        type: 'approved_released',
        lines,
        proofImageDataUrl: event.proof_image_url || undefined,
        signatureDataUrl: event.signature_url || undefined,
      };
    case 'remaining_released':
      return {
        ...base,
        type: 'remaining_released',
        lines,
        proofImageDataUrl: event.proof_image_url || undefined,
        signatureDataUrl: event.signature_url || undefined,
      };
    case 'receive_confirmed':
      return {
        ...base,
        type: 'receive_confirmed',
        lines,
        shortQuantity: event.short_quantity ?? 0,
        proofImageDataUrl: event.proof_image_url || undefined,
        signatureDataUrl: event.signature_url || undefined,
      };
    case 'rejected':
      return {
        ...base,
        type: 'rejected',
        lines: lines.length > 0 ? lines : undefined,
        signatureDataUrl: event.signature_url || undefined,
      };
    default:
      return null;
  }
}

function mapReceiveProofs(
  events: SubWarehouseRequestHistoryEvent[]
): SubWarehouseReceiveProof[] {
  return events
    .filter((e): e is Extract<SubWarehouseRequestHistoryEvent, { type: 'receive_confirmed' }> =>
      e.type === 'receive_confirmed'
    )
    .map((e) => ({
      at: e.at,
      notes: e.note,
      proofImageDataUrl: e.proofImageDataUrl || '',
      signatureDataUrl: e.signatureDataUrl || '',
      lines: e.lines,
    }));
}

export function mapInternalStockRequestRow(row: InternalStockRequestRow): SubWarehouseStockRequest {
  const items = mapItems(row);
  let history = (row.events ?? [])
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((event) => mapEvent(event, items))
    .filter((e): e is SubWarehouseRequestHistoryEvent => e != null);

  // Fallback: request-level signature URLs if event rows omit them.
  history = history.map((event) => {
    if (
      (event.type === 'delivered' || event.type === 'approved_released') &&
      !event.signatureDataUrl &&
      row.approval_signature_url
    ) {
      return { ...event, signatureDataUrl: row.approval_signature_url };
    }
    if (event.type === 'rejected' && !event.signatureDataUrl && row.rejection_signature_url) {
      return { ...event, signatureDataUrl: row.rejection_signature_url };
    }
    return event;
  });

  return {
    id: row.id,
    requestNumber: row.request_number,
    createdAt: row.created_at,
    status: row.status as SubWarehouseStockRequestStatus,
    initiationType:
      row.initiation_type === 'main_allocation' ? 'main_allocation' : 'sub_request',
    fromLocationId: row.from_location_id,
    fromLocationName: row.from_location?.name || 'Sub-warehouse',
    requestedByName: row.requested_by_user?.full_name || undefined,
    notes: row.notes || undefined,
    receiveNotes: row.receive_notes || undefined,
    rejectionReason: row.rejection_reason || undefined,
    approvalSignatureUrl: row.approval_signature_url || undefined,
    rejectionSignatureUrl: row.rejection_signature_url || undefined,
    drNumber: row.dr_number || undefined,
    items,
    history,
    receiveProofs: mapReceiveProofs(history),
  };
}

export function countRequestsByStatus(
  requests: SubWarehouseStockRequest[],
  status: SubWarehouseStockRequestStatus
): number {
  return requests.filter((r) => r.status === status).length;
}
