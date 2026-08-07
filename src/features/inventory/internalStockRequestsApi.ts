/**
 * Supabase API for internal stock requests (sub → main) and main-initiated allocations.
 * Request numbers: RN-{LOCATION_CODE}-{####} (e.g. RN-STR-0001).
 * Allocation numbers: AL-{COMPANY_INITIALS}-{####} (e.g. AL-BMW-0001 for B1G Main Warehouse).
 */
import { supabase } from '@/lib/supabase';
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

const REQUEST_SELECT = `
  *,
  from_location:warehouse_locations!internal_stock_requests_from_location_id_fkey (
    id, name, code
  ),
  requested_by_user:profiles!internal_stock_requests_requested_by_fkey (
    id, full_name
  ),
  items:internal_stock_request_items (
    id,
    request_id,
    variant_id,
    requested_quantity,
    delivered_quantity,
    received_quantity,
    open_receive_quantity,
    variant:variants (
      id,
      name,
      brand:brands ( id, name )
    )
  ),
  events:internal_stock_request_events (
    id,
    request_id,
    event_type,
    note,
    lines,
    short_quantity,
    proof_image_url,
    proof_image_urls,
    signature_url,
    rider_name,
    rider_plate_number,
    rider_photo_url,
    dr_number,
    created_by,
    created_at,
    created_by_user:profiles!internal_stock_request_events_created_by_fkey (
      full_name
    )
  )
`;

function assertRpcOk<T extends { success?: boolean; error?: string }>(result: T, fallback: string): T {
  if (!result?.success) {
    throw new Error(result?.error || fallback);
  }
  return result;
}

/**
 * List views do not need signed proof/signature blobs — drop them to cut JSON size and render cost.
 * Detail / PDF / packing slip should call fetchInternalStockRequestById for full attachments.
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

async function attachOpenDiscrepancyCounts(
  requests: SubWarehouseStockRequest[]
): Promise<SubWarehouseStockRequest[]> {
  if (requests.length === 0) return requests;
  const ids = requests.map((r) => r.id);
  const { data, error } = await supabase
    .from('internal_stock_request_discrepancies')
    .select('request_id')
    .eq('status', 'open')
    .in('request_id', ids);
  if (error) {
    // Table may not exist until migration is applied.
    console.warn('[internalStockRequests] open discrepancy count failed', error);
    return requests.map((r) => ({ ...r, openDiscrepancyCount: r.openDiscrepancyCount ?? 0 }));
  }
  const countById = new Map<string, number>();
  for (const row of data || []) {
    const id = row.request_id as string;
    countById.set(id, (countById.get(id) ?? 0) + 1);
  }
  return requests.map((r) => ({
    ...r,
    openDiscrepancyCount: countById.get(r.id) ?? 0,
  }));
}

export async function fetchInternalStockRequests(options?: {
  status?: InternalStockRequestStatus | 'all';
  fromLocationId?: string | 'all';
  search?: string;
  /** Keep proof/signature URLs on events (default false for list speed). */
  includeAttachments?: boolean;
}): Promise<SubWarehouseStockRequest[]> {
  const includeEvents = options?.includeAttachments === true;
  const { data, error } = await supabase.rpc('list_internal_stock_requests_for_caller', {
    p_from_location_id:
      options?.fromLocationId && options.fromLocationId !== 'all'
        ? options.fromLocationId
        : null,
    p_status: options?.status && options.status !== 'all' ? options.status : null,
    p_include_events: includeEvents,
  });

  const finalize = (mapped: SubWarehouseStockRequest[]) => {
    const withCounts = attachOpenDiscrepancyCounts(mapped);
    if (includeEvents) return withCounts;
    return withCounts.then((rows) => rows.map(slimInternalStockRequestForList));
  };

  if (error) {
    // Fallback: older DBs without p_include_events, then direct select.
    console.warn('[internalStockRequests] list RPC failed, retrying without events flag', error);
    const retry = await supabase.rpc('list_internal_stock_requests_for_caller', {
      p_from_location_id:
        options?.fromLocationId && options.fromLocationId !== 'all'
          ? options.fromLocationId
          : null,
      p_status: options?.status && options.status !== 'all' ? options.status : null,
    });
    if (!retry.error) {
      let mapped = ((Array.isArray(retry.data) ? retry.data : []) as InternalStockRequestRow[]).map(
        mapInternalStockRequestRow
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
      return finalize(mapped);
    }

    console.warn('[internalStockRequests] list RPC failed, falling back to direct select', retry.error);
    let query = supabase
      .from('internal_stock_requests')
      .select(REQUEST_SELECT)
      .order('created_at', { ascending: false });

    if (options?.status && options.status !== 'all') {
      query = query.eq('status', options.status);
    }
    if (options?.fromLocationId && options.fromLocationId !== 'all') {
      query = query.eq('from_location_id', options.fromLocationId);
    }
    if (options?.search?.trim()) {
      query = query.ilike('request_number', `%${options.search.trim()}%`);
    }

    const fallback = await query;
    if (fallback.error) throw fallback.error;
    return finalize(
      ((fallback.data ?? []) as InternalStockRequestRow[]).map(mapInternalStockRequestRow)
    );
  }

  const rows = (Array.isArray(data) ? data : []) as InternalStockRequestRow[];
  let mapped = rows.map(mapInternalStockRequestRow);

  if (options?.search?.trim()) {
    const q = options.search.trim().toLowerCase();
    mapped = mapped.filter(
      (r) =>
        r.requestNumber.toLowerCase().includes(q) ||
        (r.drNumber || '').toLowerCase().includes(q) ||
        r.fromLocationName.toLowerCase().includes(q)
    );
  }

  return finalize(mapped);
}

export async function fetchInternalStockRequestById(requestId: string) {
  const { data, error } = await supabase
    .from('internal_stock_requests')
    .select(REQUEST_SELECT)
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [mapped] = await attachOpenDiscrepancyCounts([
    mapInternalStockRequestRow(data as InternalStockRequestRow),
  ]);
  return mapped;
}

export async function createInternalStockRequest(input: {
  items: Array<{ variant_id: string; quantity: number }>;
  notes?: string;
  fromLocationId?: string;
}) {
  const { data, error } = await supabase.rpc('create_internal_stock_request', {
    p_items: input.items,
    p_notes: input.notes ?? null,
    p_from_location_id: input.fromLocationId ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; request_id?: string; request_number?: string },
    'Failed to create stock request'
  );
}

/** @deprecated Prefer createMainStockAllocation + deliverMainStockAllocation. */
export async function createAndDeliverMainStockAllocation(input: {
  fromLocationId: string;
  items: Array<{ variant_id: string; quantity: number }>;
  signatureUrl: string;
  proofImageUrl: string;
  riderName: string;
  riderPlateNumber: string;
  riderPhotoUrl: string;
  signaturePath?: string;
  proofImagePath?: string;
  riderPhotoPath?: string;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc('create_and_deliver_main_stock_allocation', {
    p_from_location_id: input.fromLocationId,
    p_items: input.items,
    p_signature_url: input.signatureUrl,
    p_signature_path: input.signaturePath ?? null,
    p_proof_image_url: input.proofImageUrl,
    p_proof_image_path: input.proofImagePath ?? null,
    p_rider_name: input.riderName,
    p_rider_plate_number: input.riderPlateNumber,
    p_rider_photo_url: input.riderPhotoUrl,
    p_rider_photo_path: input.riderPhotoPath ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as {
      success: boolean;
      error?: string;
      request_id?: string;
      request_number?: string;
      dr_number?: string;
      status?: string;
    },
    'Failed to allocate stock to sub warehouse'
  );
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
  const { data, error } = await supabase.rpc('create_main_stock_allocation', {
    p_from_location_id: input.fromLocationId,
    p_items: input.items,
    p_proof_image_url: input.proofImageUrl,
    p_proof_image_path: input.proofImagePath ?? null,
    p_proof_image_urls: input.proofImageUrls ?? null,
    p_proof_image_paths: input.proofImagePaths ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as {
      success: boolean;
      error?: string;
      request_id?: string;
      request_number?: string;
      status?: string;
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
  const { data, error } = await supabase.rpc('deliver_main_stock_allocation', {
    p_request_id: input.requestId,
    p_signature_url: input.signatureUrl,
    p_signature_path: input.signaturePath ?? null,
    p_rider_name: input.riderName,
    p_rider_plate_number: input.riderPlateNumber,
    p_rider_photo_url: input.riderPhotoUrl,
    p_rider_photo_path: input.riderPhotoPath ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; status?: string; dr_number?: string },
    'Failed to deliver allocation'
  );
}

export async function approveInternalStockRequest(input: { requestId: string }) {
  const { data, error } = await supabase.rpc('approve_internal_stock_request', {
    p_request_id: input.requestId,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; status?: string },
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
  const { data, error } = await supabase.rpc('deliver_internal_stock_request', {
    p_request_id: input.requestId,
    p_signature_url: input.signatureUrl,
    p_signature_path: input.signaturePath ?? null,
    p_proof_image_url: input.proofImageUrl,
    p_proof_image_path: input.proofImagePath ?? null,
    p_rider_name: input.riderName,
    p_rider_plate_number: input.riderPlateNumber,
    p_rider_photo_url: input.riderPhotoUrl,
    p_rider_photo_path: input.riderPhotoPath ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; status?: string; dr_number?: string },
    'Failed to deliver request'
  );
}

export async function rejectInternalStockRequest(input: {
  requestId: string;
  reason: string;
  signatureUrl: string;
  signaturePath?: string;
}) {
  const { data, error } = await supabase.rpc('reject_internal_stock_request', {
    p_request_id: input.requestId,
    p_reason: input.reason,
    p_signature_url: input.signatureUrl,
    p_signature_path: input.signaturePath ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; status?: string },
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
  const { data, error } = await supabase.rpc('allocate_internal_stock_request_remaining', {
    p_request_id: input.requestId,
    p_lines: input.lines,
    p_proof_image_url: input.proofImageUrl,
    p_signature_url: input.signatureUrl,
    p_note: input.note ?? null,
    p_proof_image_path: input.proofImagePath ?? null,
    p_signature_path: input.signaturePath ?? null,
    p_rider_name: input.riderName,
    p_rider_plate_number: input.riderPlateNumber,
    p_rider_photo_url: input.riderPhotoUrl,
    p_rider_photo_path: input.riderPhotoPath ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as { success: boolean; error?: string; allocated?: number; dr_number?: string },
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
  const { data, error } = await supabase.rpc('confirm_internal_stock_request_receive', {
    p_request_id: input.requestId,
    p_lines: input.lines,
    p_proof_image_url: input.proofImageUrl,
    p_signature_url: input.signatureUrl,
    p_notes: input.notes ?? null,
    p_proof_image_path: input.proofImagePath ?? null,
    p_proof_image_name: input.proofImageName ?? null,
    p_signature_path: input.signaturePath ?? null,
  });
  if (error) throw error;
  return assertRpcOk(
    data as {
      success: boolean;
      error?: string;
      status?: string;
      short_quantity?: number;
      discrepancy_count?: number;
    },
    'Failed to confirm receive'
  );
}
