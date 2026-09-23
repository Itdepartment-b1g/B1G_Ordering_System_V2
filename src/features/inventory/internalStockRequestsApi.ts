/**
 * Client API for internal stock requests (sub → main) and main-initiated allocations.
 * All data access goes through /api/warehouse/internal-stock-requests.
 */
import { warehouseRequest } from '@/store/slices/warehouse/api';
import { mapInternalStockRequestRow } from './internalStockRequestsMappers';
import type { SubWarehouseStockRequest } from './components/SubWarehouseStockRequestDialog';

export const INTERNAL_STOCK_REQUESTS_QUERY_KEY = 'internal-stock-requests';

export type InternalStockRequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'ready_to_deliver'
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'rejected';

export type InternalStockInitiationType = 'sub_request' | 'main_allocation';

export type InternalStockRequestRow = {
  id: string;
  company_id: string;
  request_number: string;
  from_location_id: string;
  status: InternalStockRequestStatus;
  initiation_type?: InternalStockInitiationType | null;
  notes: string | null;
  receive_notes: string | null;
  rejection_reason: string | null;
  requested_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  approval_signature_url: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  dr_number: string | null;
  rider_name?: string | null;
  rider_plate_number?: string | null;
  rider_photo_url?: string | null;
  rider_photo_path?: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_signature_url: string | null;
  created_at: string;
  updated_at: string;
  open_discrepancy_count?: number;
  from_location?: { id: string; name: string; code: string } | null;
  requested_by_user?: { id: string; full_name: string | null } | null;
  items?: InternalStockRequestItemRow[];
  events?: InternalStockRequestEventRow[];
};

export type InternalStockRequestItemRow = {
  id: string;
  request_id: string;
  variant_id: string;
  requested_quantity: number;
  delivered_quantity: number;
  received_quantity: number;
  open_receive_quantity: number;
  variant?: {
    id: string;
    name: string;
    brand?: { id: string; name: string } | { id: string; name: string }[] | null;
  } | null;
};

export type InternalStockRequestEventRow = {
  id: string;
  request_id: string;
  event_type: string;
  note: string | null;
  lines: unknown;
  short_quantity: number | null;
  proof_image_url: string | null;
  proof_image_urls?: string[] | null;
  signature_url: string | null;
  rider_name?: string | null;
  rider_plate_number?: string | null;
  rider_photo_url?: string | null;
  dr_number?: string | null;
  created_by: string | null;
  created_at: string;
  created_by_user?: { full_name: string | null } | null;
};

type RpcResult = {
  success?: boolean;
  error?: string;
  request_id?: string;
  request_number?: string;
  status?: string;
  dr_number?: string;
  allocated?: number;
  short_quantity?: number;
  discrepancy_count?: number;
};

/**
 * List views do not need signed proof/signature blobs — drop them to cut JSON size and render cost.
 */
export function slimInternalStockRequestForList(
  request: SubWarehouseStockRequest
): SubWarehouseStockRequest {
  if (!request.history?.length) return request;
  return {
    ...request,
    history: request.history.map((event) => {
      if (
        !('proofImageDataUrl' in event) &&
        !('proofImageUrls' in event) &&
        !('signatureDataUrl' in event) &&
        !('riderPhotoUrl' in event)
      ) {
        return event;
      }
      return {
        ...event,
        proofImageDataUrl: undefined,
        proofImageUrls: undefined,
        signatureDataUrl: undefined,
        riderPhotoUrl: undefined,
      };
    }),
  };
}

function withOpenDiscrepancyCount(
  mapped: SubWarehouseStockRequest,
  row: InternalStockRequestRow
): SubWarehouseStockRequest {
  return {
    ...mapped,
    openDiscrepancyCount: row.open_discrepancy_count ?? mapped.openDiscrepancyCount ?? 0,
  };
}

function assertRpcOk<T extends RpcResult>(result: T, fallback: string): T {
  if (!result?.success) {
    throw new Error(result?.error || fallback);
  }
  return result;
}

async function postAction<T extends RpcResult>(
  body: Record<string, unknown>,
  fallback: string
): Promise<T> {
  const result = await warehouseRequest<T>('internal-stock-requests', {
    method: 'POST',
    body,
  });
  return assertRpcOk(result, fallback);
}

export async function fetchInternalStockRequests(options?: {
  status?: InternalStockRequestStatus | 'all';
  fromLocationId?: string | 'all';
  search?: string;
  /** Keep proof/signature URLs on events (default false for list speed). */
  includeAttachments?: boolean;
}): Promise<SubWarehouseStockRequest[]> {
  const includeEvents = options?.includeAttachments === true;
  const { requests } = await warehouseRequest<{ requests: InternalStockRequestRow[] }>(
    'internal-stock-requests',
    {
      params: {
        resource: 'list',
        status: options?.status && options.status !== 'all' ? options.status : undefined,
        fromLocationId:
          options?.fromLocationId && options.fromLocationId !== 'all'
            ? options.fromLocationId
            : undefined,
        includeEvents: includeEvents ? '1' : undefined,
      },
    }
  );

  let mapped = (requests ?? []).map((row) =>
    withOpenDiscrepancyCount(mapInternalStockRequestRow(row), row)
  );

  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    mapped = mapped.filter(
      (r) =>
        r.requestNumber.toLowerCase().includes(q) ||
        (r.drNumber || '').toLowerCase().includes(q) ||
        r.fromLocationName.toLowerCase().includes(q)
    );
  }

  if (includeEvents) return mapped;
  return mapped.map(slimInternalStockRequestForList);
}

export async function fetchInternalStockRequestById(requestId: string) {
  const { request } = await warehouseRequest<{ request: InternalStockRequestRow | null }>(
    'internal-stock-requests',
    { params: { resource: 'detail', requestId } }
  );
  if (!request) return null;
  return withOpenDiscrepancyCount(mapInternalStockRequestRow(request), request);
}

export async function fetchSubLocationsForAllocate() {
  const { locations } = await warehouseRequest<{
    locations: Array<{ id: string; name: string; is_main: boolean }>;
  }>('internal-stock-requests', { params: { resource: 'sub-locations' } });
  return locations ?? [];
}

export async function fetchMainWarehouseLocationName() {
  const { name } = await warehouseRequest<{ name: string }>('internal-stock-requests', {
    params: { resource: 'main-location' },
  });
  return name || 'Main warehouse';
}

export async function createInternalStockRequest(input: {
  items: Array<{ variant_id: string; quantity: number }>;
  notes?: string;
  fromLocationId?: string;
}) {
  return postAction(
    {
      action: 'create',
      items: input.items,
      notes: input.notes ?? null,
      from_location_id: input.fromLocationId ?? null,
    },
    'Failed to create stock request'
  );
}

/** @deprecated Prefer createMainStockAllocation + deliverMainStockAllocation. */
export async function createAndDeliverMainStockAllocation(_input: unknown) {
  throw new Error('createAndDeliverMainStockAllocation is deprecated');
}

export async function createMainStockAllocation(input: {
  fromLocationId: string;
  items: Array<{ variant_id: string; quantity: number }>;
  proofImageUrl: string;
  proofImagePath?: string;
  proofImageUrls?: string[];
  proofImagePaths?: string[];
  notes?: string;
}) {
  return postAction(
    {
      action: 'create-allocation',
      from_location_id: input.fromLocationId,
      items: input.items,
      proof_image_url: input.proofImageUrl,
      proof_image_path: input.proofImagePath ?? null,
      proof_image_urls: input.proofImageUrls ?? null,
      proof_image_paths: input.proofImagePaths ?? null,
      notes: input.notes ?? null,
    },
    'Failed to create stock allocation'
  );
}

export async function deliverMainStockAllocation(input: {
  requestId: string;
  signatureUrl: string;
  riderName: string;
  riderPlateNumber: string;
  riderPhotoUrl: string;
  signaturePath?: string;
  riderPhotoPath?: string;
}) {
  return postAction(
    {
      action: 'deliver-allocation',
      request_id: input.requestId,
      signature_url: input.signatureUrl,
      signature_path: input.signaturePath ?? null,
      rider_name: input.riderName,
      rider_plate_number: input.riderPlateNumber,
      rider_photo_url: input.riderPhotoUrl,
      rider_photo_path: input.riderPhotoPath ?? null,
    },
    'Failed to deliver allocation'
  );
}

export async function approveInternalStockRequest(input: { requestId: string }) {
  return postAction(
    { action: 'approve', request_id: input.requestId },
    'Failed to approve request'
  );
}

export async function deliverInternalStockRequest(input: {
  requestId: string;
  signatureUrl: string;
  proofImageUrl: string;
  riderName: string;
  riderPlateNumber: string;
  riderPhotoUrl: string;
  signaturePath?: string;
  proofImagePath?: string;
  riderPhotoPath?: string;
}) {
  return postAction(
    {
      action: 'deliver',
      request_id: input.requestId,
      signature_url: input.signatureUrl,
      signature_path: input.signaturePath ?? null,
      proof_image_url: input.proofImageUrl,
      proof_image_path: input.proofImagePath ?? null,
      rider_name: input.riderName,
      rider_plate_number: input.riderPlateNumber,
      rider_photo_url: input.riderPhotoUrl,
      rider_photo_path: input.riderPhotoPath ?? null,
    },
    'Failed to deliver request'
  );
}

export async function rejectInternalStockRequest(input: {
  requestId: string;
  reason: string;
  signatureUrl: string;
  signaturePath?: string;
}) {
  return postAction(
    {
      action: 'reject',
      request_id: input.requestId,
      reason: input.reason,
      signature_url: input.signatureUrl,
      signature_path: input.signaturePath ?? null,
    },
    'Failed to reject request'
  );
}

export async function allocateInternalStockRequestRemaining(input: {
  requestId: string;
  lines: Array<{ variant_id: string; quantity: number }>;
  proofImageUrl: string;
  signatureUrl: string;
  riderName: string;
  riderPlateNumber: string;
  riderPhotoUrl: string;
  note?: string;
  proofImagePath?: string;
  signaturePath?: string;
  riderPhotoPath?: string;
}) {
  return postAction(
    {
      action: 'allocate-remaining',
      request_id: input.requestId,
      lines: input.lines,
      proof_image_url: input.proofImageUrl,
      signature_url: input.signatureUrl,
      note: input.note ?? null,
      proof_image_path: input.proofImagePath ?? null,
      signature_path: input.signaturePath ?? null,
      rider_name: input.riderName,
      rider_plate_number: input.riderPlateNumber,
      rider_photo_url: input.riderPhotoUrl,
      rider_photo_path: input.riderPhotoPath ?? null,
    },
    'Failed to allocate remaining'
  );
}

export async function confirmInternalStockRequestReceive(input: {
  requestId: string;
  lines: Array<{
    variant_id: string;
    quantity: number;
    shortfall_reason?: string;
    shortfall_notes?: string;
  }>;
  proofImageUrl: string;
  signatureUrl: string;
  notes?: string;
  proofImagePath?: string;
  proofImageName?: string;
  signaturePath?: string;
}) {
  return postAction(
    {
      action: 'confirm-receive',
      request_id: input.requestId,
      lines: input.lines,
      proof_image_url: input.proofImageUrl,
      signature_url: input.signatureUrl,
      notes: input.notes ?? null,
      proof_image_path: input.proofImagePath ?? null,
      proof_image_name: input.proofImageName ?? null,
      signature_path: input.signaturePath ?? null,
    },
    'Failed to confirm receive'
  );
}
