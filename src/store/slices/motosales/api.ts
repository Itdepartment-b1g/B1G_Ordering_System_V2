import { supabase } from '@/lib/supabase';

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

type AuthProfile = { id: string; company_id: string; role: string };

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

async function authProfile(): Promise<AuthProfile> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData.user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', sessionData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id) throw new Error('Profile not found');
  return data as AuthProfile;
}

function assertRpcSuccess(data: unknown, fallback: string) {
  const result = (data ?? {}) as { success?: boolean; error?: string };
  if (!result.success) throw new Error(result.error || fallback);
  return result;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export async function motoSalesRequest<T>(
  path: string,
  options?: {
    method?: string;
    params?: Record<string, string | undefined>;
    body?: unknown;
  }
): Promise<T> {
  if (path !== 'tl-stock-transfers') {
    throw new Error(`Unknown moto-sales path: ${path}`);
  }

  const method = (options?.method || 'GET').toUpperCase();
  const profile = await authProfile();
  const params = options?.params || {};
  const companyId = params.company_id || profile.company_id;

  if (method === 'GET') {
    return (await handleGet(profile, companyId, params)) as T;
  }
  if (method === 'POST') {
    return (await handlePost(profile, companyId, (options?.body || {}) as Record<string, unknown>)) as T;
  }
  throw new Error(`Unsupported method ${method}`);
}

async function handleGet(
  profile: AuthProfile,
  companyId: string,
  params: Record<string, string | undefined>
) {
  const resource = params.resource || 'mine';
  const sb = supabase;

  switch (resource) {
    case 'mine': {
      const { data, error } = await sb
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('requester_leader_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { requests: data || [] };
    }
    case 'incoming': {
      const { data, error } = await sb
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('source_leader_id', profile.id)
        .in('status', ['pending_source_tl', 'admin_approved', 'pending_receipt'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { requests: data || [] };
    }
    case 'dispatched': {
      const { data, error } = await sb
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('source_leader_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { requests: data || [] };
    }
    case 'admin': {
      const { data, error } = await sb
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return { requests: data || [] };
    }
    case 'request': {
      const { data, error } = await sb
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('id', params.id || '')
        .maybeSingle();
      if (error) throw error;
      return { request: data };
    }
    case 'leaders': {
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, region')
        .eq('company_id', companyId)
        .eq('role', 'team_leader')
        .eq('status', 'active')
        .neq('id', profile.id)
        .order('full_name');
      if (error) throw error;
      return { leaders: data || [] };
    }
    case 'source-stock': {
      const sourceLeaderId = params.source_leader_id || '';
      const { data, error } = await sb
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
    case 'source-availability': {
      const sourceLeaderId = params.source_leader_id || '';
      const variantIds = stringList(params.variant_ids);
      if (!sourceLeaderId || variantIds.length === 0) return { rows: [] };
      const { data, error } = await sb
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
    case 'shortages': {
      const isAdmin =
        profile.role === 'admin' ||
        profile.role === 'super_admin' ||
        profile.role === 'system_administrator';
      const { data, error } = await sb
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
        .eq('company_id', companyId)
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
        shortages: isAdmin ? mapped : mapped.filter((row) => row.source_leader_id === profile.id),
      };
    }
    case 'lost': {
      const { data, error } = await sb
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
        .eq('company_id', companyId)
        .in('status', LOST_STATUSES)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const lines = (data || []).flatMap((row: any) => {
        const request = row.request;
        const sourceLeaderId = request?.source_leader_id || '';
        const requesterLeaderId = request?.requester_leader_id || '';
        if (sourceLeaderId !== profile.id && requesterLeaderId !== profile.id) return [];
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
    case 'history':
      return getHistory(params.request_id || '', stringList(params.profile_ids));
    case 'tdr-details':
      return getTdrDetails(params.request_id || '');
    default:
      throw new Error('Unknown resource');
  }
}

async function getHistory(requestId: string, extraProfileIds: string[]) {
  const sb = supabase;
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
      [...extraProfileIds, ...(discs || []).flatMap((row) => [row.reported_by, row.resolved_by])].filter(
        (id): id is string => !!id
      )
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

async function getTdrDetails(requestId: string) {
  const sb = supabase;
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

async function handlePost(
  profile: AuthProfile,
  companyId: string,
  body: Record<string, unknown>
) {
  const action = typeof body.action === 'string' ? body.action : '';
  const sb = supabase;

  switch (action) {
    case 'submit': {
      const { data, error } = await sb.rpc('submit_tl_stock_request', {
        p_company_id: companyId,
        p_source_leader_id: String(body.source_leader_id || ''),
        p_items: body.items ?? [],
        p_notes: (body.notes as string | null | undefined) ?? null,
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to submit transfer');
    }
    case 'dispatch': {
      const { data, error } = await sb.rpc('source_tl_dispatch_stock', {
        p_request_id: String(body.request_id || ''),
        p_dispatched_quantity: Number(body.dispatched_quantity || 0),
        p_signature_url: String(body.signature_url || ''),
        p_signature_path: String(body.signature_path || ''),
        p_shortfall_reason: (body.shortfall_reason as string | null | undefined) ?? null,
        p_notes: (body.notes as string | null | undefined) ?? null,
        p_proof_urls: (body.proof_urls as string[] | null | undefined) ?? null,
        p_reuse_tdr: (body.reuse_tdr as string | null | undefined) ?? null,
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to dispatch');
    }
    case 'receive': {
      const { data, error } = await sb.rpc('requester_tl_receive_stock', {
        p_request_id: String(body.request_id || ''),
        p_signature_url: String(body.signature_url || ''),
        p_signature_path: String(body.signature_path || ''),
        p_received_quantity: Number(body.received_quantity || 0),
        p_shortfall_reason: (body.shortfall_reason as string | null | undefined) ?? null,
        p_shortfall_notes: (body.shortfall_notes as string | null | undefined) ?? null,
        p_proof_urls: (body.proof_urls as string[] | null | undefined) ?? null,
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to receive stock');
    }
    case 'reject': {
      const { data, error } = await sb.rpc('source_tl_reject_request', {
        p_request_id: String(body.request_id || ''),
        p_reason: String(body.reason || ''),
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to reject request');
    }
    case 'admin-approve': {
      const { data, error } = await sb.rpc('admin_approve_tl_request', {
        p_request_id: String(body.request_id || ''),
        p_approved_quantity: Number(body.approved_quantity || 0),
        p_notes: (body.notes as string | null | undefined) ?? null,
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to approve request');
    }
    case 'admin-reject': {
      const { data, error } = await sb.rpc('admin_reject_tl_request', {
        p_request_id: String(body.request_id || ''),
        p_reason: String(body.reason || ''),
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to reject request');
    }
    case 'resolve-discrepancy': {
      const { data, error } = await sb.rpc('resolve_tl_stock_request_discrepancy', {
        p_discrepancy_id: String(body.discrepancy_id || ''),
        p_resolution: String(body.resolution || ''),
        p_notes: (body.notes as string | null | undefined) ?? null,
      });
      if (error) throw error;
      return assertRpcSuccess(data, 'Failed to resolve shortage');
    }
    default:
      throw new Error('Unknown action');
  }
}
