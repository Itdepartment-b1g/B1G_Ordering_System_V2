import { HttpError } from '../../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';
import type { MotoSalesContext } from '../../auth/requireMotoSalesContext';

const TL_REQUEST_SELECT = `
  *,
  requester:profiles!requester_leader_id(id, full_name, region, email),
  source:profiles!source_leader_id(id, full_name, region, email),
  tdrs:tl_stock_request_tdrs(tdr_number, kind, created_at),
  items:tl_stock_request_items(
    *,
    variant:variants(
      id,
      name,
      variant_type,
      brand_id,
      brand:brands(name)
    )
  )
`;

const LOST_STATUSES = ['open', 'resolved_write_off', 'resolved_write_off_replace'];

type RpcResult = Record<string, unknown> & { success?: boolean; error?: string };

function userClient(ctx: MotoSalesContext) {
  if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
  return getSupabaseUser(ctx.accessToken);
}

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (!result.success) throw new HttpError(400, result.error || fallback);
  return result;
}

function relationName(value: unknown): string {
  if (Array.isArray(value)) return relationName(value[0]);
  if (value && typeof value === 'object' && 'full_name' in value) {
    return String((value as { full_name?: string | null }).full_name || '');
  }
  if (value && typeof value === 'object' && 'name' in value) {
    return String((value as { name?: string | null }).name || '');
  }
  return '';
}

export async function listMyTlTransfers(ctx: MotoSalesContext) {
  const { data, error } = await userClient(ctx)
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('requester_leader_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { requests: data || [] };
}

export async function listIncomingTlTransfers(ctx: MotoSalesContext) {
  const { data, error } = await userClient(ctx)
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('source_leader_id', ctx.userId)
    .in('status', ['pending_source_tl', 'admin_approved', 'pending_receipt'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { requests: data || [] };
}

export async function listDispatchedTlTransfers(ctx: MotoSalesContext) {
  const { data, error } = await userClient(ctx)
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('source_leader_id', ctx.userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { requests: data || [] };
}

export async function listAdminTlTransfers(ctx: MotoSalesContext) {
  // Service role: a system administrator viewing a company is not in the
  // team-leader RLS policy, so the user client returns no rows.
  const { data, error } = await getSupabaseAdmin()
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { requests: data || [] };
}

export async function getTlTransfer(ctx: MotoSalesContext, requestId: string) {
  if (!requestId) throw new HttpError(400, 'id is required');
  const { data, error } = await userClient(ctx)
    .from('tl_stock_requests')
    .select(TL_REQUEST_SELECT)
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw error;
  return { request: data };
}

export async function listTlTransferLeaders(ctx: MotoSalesContext) {
  const { data, error } = await userClient(ctx)
    .from('profiles')
    .select('id, full_name, region')
    .eq('company_id', ctx.companyId)
    .eq('role', 'team_leader')
    .eq('status', 'active')
    .neq('id', ctx.userId)
    .order('full_name');
  if (error) throw error;
  return { leaders: data || [] };
}

export async function listTlSourceStock(ctx: MotoSalesContext, sourceLeaderId: string) {
  if (!sourceLeaderId) throw new HttpError(400, 'source_leader_id is required');
  const { data, error } = await userClient(ctx)
    .from('agent_inventory')
    .select(
      `
      stock,
      variant_id,
      variant:variants(
        id,
        name,
        variant_type,
        brand:brands(name)
      )
    `
    )
    .eq('agent_id', sourceLeaderId)
    .gt('stock', 0);
  if (error) throw error;

  const rows = (data || []).map((row: any) => ({
    variant_id: row.variant_id as string,
    variant_name: row.variant?.name || '',
    variant_type: row.variant?.variant_type || '',
    brand_name: relationName(row.variant?.brand),
    stock: Number(row.stock || 0),
  }));
  return { source_leader_id: sourceLeaderId, rows };
}

export async function listTlSourceAvailability(
  ctx: MotoSalesContext,
  sourceLeaderId: string,
  variantIds: string[]
) {
  if (!sourceLeaderId || variantIds.length === 0) return { rows: [] as { variant_id: string; stock: number }[] };
  const { data, error } = await userClient(ctx)
    .from('agent_inventory')
    .select('variant_id, stock')
    .eq('agent_id', sourceLeaderId)
    .in('variant_id', variantIds);
  if (error) throw error;
  return {
    rows: (data || []).map((row: any) => ({
      variant_id: String(row.variant_id),
      stock: Number(row.stock || 0),
    })),
  };
}

export async function listTlTransferShortages(ctx: MotoSalesContext) {
  const isAdmin =
    ctx.role === 'admin' || ctx.role === 'super_admin' || ctx.role === 'system_administrator';
  // Admins track every shortage in the company. The dispatcher still uses their
  // own session, then we keep only the transfers they sent.
  const client = isAdmin ? getSupabaseAdmin() : userClient(ctx);
  const { data, error } = await client
    .from('tl_stock_request_discrepancies')
    .select(
      `
      id,
      request_id,
      request_item_id,
      quantity,
      reason,
      reporter_notes,
      resolution_notes,
      status,
      created_at,
      resolved_at,
      request:tl_stock_requests(
        request_number,
        tdr_number,
        source_leader_id,
        requester:profiles!requester_leader_id(full_name),
        source:profiles!source_leader_id(full_name)
      ),
      item:tl_stock_request_items(
        variant:variants(name, brand:brands(name))
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const mapped = (data || []).map((row: any) => ({
    id: row.id,
    request_id: row.request_id,
    quantity: row.quantity,
    reason: row.reason,
    reporter_notes: row.reporter_notes,
    resolution_notes: row.resolution_notes,
    status: row.status,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
    request_number: row.request?.request_number || '',
    tdr_number: row.request?.tdr_number || '',
    requester_name: relationName(row.request?.requester),
    source_name: relationName(row.request?.source),
    source_leader_id: row.request?.source_leader_id || '',
    brand_name: relationName(row.item?.variant?.brand),
    variant_name: row.item?.variant?.name || '',
  }));

  return {
    shortages: isAdmin ? mapped : mapped.filter((row) => row.source_leader_id === ctx.userId),
  };
}

export async function listTlLostLines(ctx: MotoSalesContext) {
  const { data, error } = await userClient(ctx)
    .from('tl_stock_request_discrepancies')
    .select(
      `
      id,
      request_id,
      variant_id,
      quantity,
      reason,
      reporter_notes,
      status,
      created_at,
      resolved_at,
      request:tl_stock_requests(
        request_number,
        tdr_number,
        source_leader_id,
        requester_leader_id,
        requester:profiles!requester_leader_id(full_name),
        source:profiles!source_leader_id(full_name)
      ),
      item:tl_stock_request_items(
        variant:variants(id, name, variant_type, brand:brands(name))
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .in('status', LOST_STATUSES)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const lines = (data || []).flatMap((row: any) => {
    const request = row.request;
    const sourceLeaderId = request?.source_leader_id || '';
    const requesterLeaderId = request?.requester_leader_id || '';
    if (sourceLeaderId !== ctx.userId && requesterLeaderId !== ctx.userId) return [];
    const variant = row.item?.variant;
    return [
      {
        id: row.id,
        requestId: row.request_id,
        requestNumber: request?.request_number || '',
        tdrNumber: request?.tdr_number || '',
        quantity: Number(row.quantity || 0),
        reason: row.reason,
        reporterNotes: row.reporter_notes,
        status: row.status,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        requesterName: relationName(request?.requester),
        sourceName: relationName(request?.source),
        sourceLeaderId,
        requesterLeaderId,
        variantId: variant?.id || row.variant_id || '',
        brandName: relationName(variant?.brand),
        variantName: variant?.name || '',
        variantType: variant?.variant_type || variant?.type || '',
      },
    ];
  });

  return { lines };
}

export async function getTlTransferHistory(
  ctx: MotoSalesContext,
  requestId: string,
  extraProfileIds: string[] = []
) {
  if (!requestId) throw new HttpError(400, 'request_id is required');
  const sb = userClient(ctx);
  const [{ data: tdrs, error: tdrError }, { data: discs, error: discError }, { data: txs, error: txError }] =
    await Promise.all([
      sb
        .from('tl_stock_request_tdrs')
        .select('id, tdr_number, kind, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true }),
      sb
        .from('tl_stock_request_discrepancies')
        .select(
          'id, request_item_id, variant_id, quantity, reason, reporter_notes, status, reported_by, resolved_by, resolved_at, resolution_notes, created_at'
        )
        .eq('request_id', requestId)
        .order('created_at', { ascending: true }),
      sb
        .from('inventory_transactions')
        .select('variant_id, transaction_type, quantity, created_at, notes')
        .eq('reference_type', 'tl_stock_request')
        .eq('reference_id', requestId)
        .in('transaction_type', ['tl_stock_transfer_out', 'tl_stock_transfer_in'])
        .order('created_at', { ascending: true }),
    ]);

  if (tdrError) throw tdrError;
  if (discError && !String(discError.message || '').includes('tl_stock_request_discrepancies')) {
    throw discError;
  }
  if (txError) throw txError;

  const tdrRows = tdrs || [];
  let tdrItems: Array<Record<string, unknown>> = [];
  if (tdrRows.length > 0) {
    const { data: items, error: itemError } = await sb
      .from('tl_stock_request_tdr_items')
      .select('tdr_id, request_item_id, dispatched_quantity, received_quantity')
      .in(
        'tdr_id',
        tdrRows.map((row) => row.id)
      );
    if (itemError) throw itemError;
    tdrItems = items || [];
  }

  const profileIds = [
    ...new Set(
      [
        ...extraProfileIds,
        ...(discs || []).flatMap((row) => [row.reported_by, row.resolved_by]),
      ].filter((id): id is string => !!id)
    ),
  ];

  let profiles: Array<{ id: string; full_name: string | null }> = [];
  if (profileIds.length > 0) {
    const { data } = await sb.from('profiles').select('id, full_name').in('id', profileIds);
    profiles = data || [];
  }

  return {
    tdrs: tdrRows.map((tdr) => ({
      ...tdr,
      items: tdrItems.filter((item) => item.tdr_id === tdr.id),
    })),
    shortages: discError ? [] : discs || [],
    movements: txs || [],
    profiles,
  };
}

export async function getTlTransferTdrDetails(ctx: MotoSalesContext, requestId: string) {
  if (!requestId) throw new HttpError(400, 'request_id is required');
  const sb = userClient(ctx);
  const { data: tdrs, error: tdrError } = await sb
    .from('tl_stock_request_tdrs')
    .select('id, tdr_number, kind, created_at')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (tdrError) throw tdrError;

  const rows = tdrs || [];
  if (rows.length === 0) {
    return { tdrs: [], shortages: [], movements: [] };
  }

  const [{ data: tdrItems, error: itemError }, { data: discs }, { data: txs }] = await Promise.all([
    sb
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
    sb
      .from('tl_stock_request_discrepancies')
      .select('request_item_id, quantity, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true }),
    sb
      .from('inventory_transactions')
      .select('variant_id, transaction_type, quantity, created_at, notes')
      .eq('reference_type', 'tl_stock_request')
      .eq('reference_id', requestId)
      .in('transaction_type', ['tl_stock_transfer_out', 'tl_stock_transfer_in'])
      .order('created_at', { ascending: true }),
  ]);

  const itemsByTdr = new Map<string, unknown[]>();
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
    shortages: discs || [],
    movements: txs || [],
  };
}

export type SubmitTlTransferPayload = {
  source_leader_id: string;
  items: Array<{ variant_id: string; quantity: number }>;
  notes?: string | null;
};

export async function submitTlTransfer(ctx: MotoSalesContext, payload: SubmitTlTransferPayload) {
  if (!payload.source_leader_id) throw new HttpError(400, 'source_leader_id is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }
  const { data, error } = await userClient(ctx).rpc('submit_tl_stock_request', {
    p_company_id: ctx.companyId,
    p_source_leader_id: payload.source_leader_id,
    p_items: payload.items,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to submit transfer');
}

export type DispatchTlTransferPayload = {
  request_id: string;
  dispatched_quantity: number;
  signature_url: string;
  signature_path: string;
  shortfall_reason?: string | null;
  notes?: string | null;
  proof_urls?: string[] | null;
  reuse_tdr?: string | null;
};

export async function dispatchTlTransfer(ctx: MotoSalesContext, payload: DispatchTlTransferPayload) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  const { data, error } = await userClient(ctx).rpc('source_tl_dispatch_stock', {
    p_request_id: payload.request_id,
    p_dispatched_quantity: payload.dispatched_quantity,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path,
    p_shortfall_reason: payload.shortfall_reason ?? null,
    p_notes: payload.notes ?? null,
    p_proof_urls: payload.proof_urls ?? null,
    p_reuse_tdr: payload.reuse_tdr ?? null,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to dispatch');
}

export type ReceiveTlTransferPayload = {
  request_id: string;
  signature_url: string;
  signature_path: string;
  received_quantity: number;
  shortfall_reason?: string | null;
  shortfall_notes?: string | null;
  proof_urls?: string[] | null;
};

export async function receiveTlTransfer(ctx: MotoSalesContext, payload: ReceiveTlTransferPayload) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  const { data, error } = await userClient(ctx).rpc('requester_tl_receive_stock', {
    p_request_id: payload.request_id,
    p_signature_url: payload.signature_url,
    p_signature_path: payload.signature_path,
    p_received_quantity: payload.received_quantity,
    p_shortfall_reason: payload.shortfall_reason ?? null,
    p_shortfall_notes: payload.shortfall_notes ?? null,
    p_proof_urls: payload.proof_urls ?? null,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to receive stock');
}

export async function rejectTlTransfer(
  ctx: MotoSalesContext,
  payload: { request_id: string; reason: string }
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  if (!payload.reason?.trim()) throw new HttpError(400, 'Rejection reason is required');
  const { data, error } = await userClient(ctx).rpc('source_tl_reject_request', {
    p_request_id: payload.request_id,
    p_reason: payload.reason,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to reject request');
}

export async function adminApproveTlTransfer(
  ctx: MotoSalesContext,
  payload: { request_id: string; approved_quantity: number; notes?: string | null }
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  const { data, error } = await userClient(ctx).rpc('admin_approve_tl_request', {
    p_request_id: payload.request_id,
    p_approved_quantity: payload.approved_quantity,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to approve request');
}

export async function adminRejectTlTransfer(
  ctx: MotoSalesContext,
  payload: { request_id: string; reason: string }
) {
  if (!payload.request_id) throw new HttpError(400, 'request_id is required');
  if (!payload.reason?.trim()) throw new HttpError(400, 'Rejection reason is required');
  const { data, error } = await userClient(ctx).rpc('admin_reject_tl_request', {
    p_request_id: payload.request_id,
    p_reason: payload.reason,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to reject request');
}

export async function resolveTlDiscrepancy(
  ctx: MotoSalesContext,
  payload: { discrepancy_id: string; resolution: string; notes?: string | null }
) {
  if (!payload.discrepancy_id) throw new HttpError(400, 'discrepancy_id is required');
  if (!payload.resolution) throw new HttpError(400, 'resolution is required');
  const { data, error } = await userClient(ctx).rpc('resolve_tl_stock_request_discrepancy', {
    p_discrepancy_id: payload.discrepancy_id,
    p_resolution: payload.resolution,
    p_notes: payload.notes ?? null,
  });
  if (error) throw error;
  return assertRpcSuccess(data, 'Failed to resolve shortage');
}
