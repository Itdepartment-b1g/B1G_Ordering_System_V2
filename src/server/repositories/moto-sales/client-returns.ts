import { HttpError } from '../../http/errors';
import type { MotoSalesContext } from '../../auth/requireMotoSalesContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

export type ChangeItemSku = {
  id: string;
  brandId: string;
  brandName: string;
  variantName: string;
  variantType: string;
  variantTypeId?: string;
  sellableQty: number;
};

export type CreateClientReturnItemInput = {
  client_order_item_id: string;
  quantity: number;
  stock_fate: 'restock' | 'disposal';
};

export type CreateClientReturnChangeItemInput = {
  variant_id: string;
  quantity: number;
};

export type CreateClientReturnAttachmentInput = {
  file_url: string;
  file_path: string;
  file_name: string;
  content_type?: string;
  source?: string;
  sort_order?: number;
};

export type CreateClientReturnPayload = {
  client_order_id: string;
  return_date: string;
  reason: string;
  notes?: string | null;
  agent_signature_url: string;
  items: CreateClientReturnItemInput[];
  change_items?: CreateClientReturnChangeItemInput[];
  attachments?: CreateClientReturnAttachmentInput[];
  return_type?: 'change_item' | 'refund';
};

type RpcResult = {
  success?: boolean;
  error?: string;
  id?: string;
  return_number?: string;
  status?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nestedRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === 'object') return [asRecord(value)];
  return [];
}

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (!result.success) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
}

/**
 * Posted return qty keyed by client_order_item_id for one order.
 * Pending / rejected do not consume returnable qty.
 */
export async function getPostedReturnedQtyByItemId(
  ctx: MotoSalesContext,
  orderId: string
): Promise<{ qtyByItemId: Record<string, number> }> {
  if (!orderId) throw new HttpError(400, 'orderId is required');

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('client_order_returns')
    .select(
      `
      status,
      items:client_order_return_items (
        client_order_item_id,
        quantity
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .eq('client_order_id', orderId)
    .eq('status', 'posted');
  if (error) throw error;

  const qtyByItemId: Record<string, number> = {};
  for (const header of data || []) {
    for (const item of nestedRows(asRecord(header).items)) {
      const itemId = String(item.client_order_item_id || '');
      if (!itemId) continue;
      qtyByItemId[itemId] = (qtyByItemId[itemId] || 0) + (Number(item.quantity) || 0);
    }
  }
  return { qtyByItemId };
}

/**
 * Sellable agent inventory for change-item SKUs, filtered to order brand ids.
 */
export async function getChangeItemCatalog(
  ctx: MotoSalesContext,
  brandIds: string[]
): Promise<{ skus: ChangeItemSku[] }> {
  const wanted = new Set(brandIds.filter(Boolean));
  if (wanted.size === 0) return { skus: [] };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('agent_inventory')
    .select(
      `
      variant_id,
      stock,
      variant:variants (
        id,
        name,
        variant_type,
        variant_type_id,
        brand_id,
        brand:brands ( id, name )
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .eq('agent_id', ctx.userId);
  if (error) throw error;

  const skus = (data || [])
    .map((row) => {
      const record = asRecord(row);
      const variant = Array.isArray(record.variant) ? record.variant[0] : record.variant;
      const variantRecord = asRecord(variant);
      const brand = Array.isArray(variantRecord.brand) ? variantRecord.brand[0] : variantRecord.brand;
      const brandRecord = asRecord(brand);
      const brandId = String(variantRecord.brand_id || brandRecord.id || '');
      if (!wanted.has(brandId)) return null;
      const variantId = String(record.variant_id || variantRecord.id || '');
      if (!variantId) return null;
      return {
        id: variantId,
        brandId,
        brandName: String(brandRecord.name || 'Unknown'),
        variantName: String(variantRecord.name || variantId),
        variantType: String(variantRecord.variant_type || 'flavor'),
        variantTypeId: variantRecord.variant_type_id
          ? String(variantRecord.variant_type_id)
          : undefined,
        sellableQty: Math.max(0, Number(record.stock) || 0),
      } satisfies ChangeItemSku;
    })
    .filter(Boolean) as ChangeItemSku[];

  return { skus };
}

/**
 * Create client order return via existing RPC (auth.uid() from user JWT).
 * Phase 1: orchestration stays in Postgres; callers no longer edit SQL for reads.
 */
export async function createClientOrderReturn(
  ctx: MotoSalesContext,
  payload: CreateClientReturnPayload
) {
  if (!payload.client_order_id) throw new HttpError(400, 'client_order_id is required');
  if (!payload.return_date) throw new HttpError(400, 'return_date is required');
  if (!payload.reason?.trim()) throw new HttpError(400, 'reason is required');
  if (!payload.agent_signature_url) throw new HttpError(400, 'agent_signature_url is required');
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one return item is required');
  }

  const returnType = payload.return_type === 'refund' ? 'refund' : 'change_item';
  if (returnType === 'change_item') {
    const changeItems = payload.change_items || [];
    if (changeItems.length === 0) {
      throw new HttpError(400, 'At least one change item is required for change returns');
    }
  }

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('create_client_order_return', {
    p_client_order_id: payload.client_order_id,
    p_return_date: payload.return_date,
    p_reason: payload.reason,
    p_notes: payload.notes ?? '',
    p_agent_signature_url: payload.agent_signature_url,
    p_items: payload.items.map((item) => ({
      client_order_item_id: item.client_order_item_id,
      quantity: item.quantity,
      stock_fate: item.stock_fate === 'restock' ? 'restock' : 'disposal',
    })),
    p_change_items: (payload.change_items || []).map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    })),
    p_attachments: payload.attachments || [],
    p_return_type: returnType,
  });
  if (error) throw error;

  const result = assertRpcSuccess(data, 'Failed to create client return');
  if (!result.id || !result.return_number) {
    throw new HttpError(400, result.error || 'Failed to create client return');
  }

  return {
    id: String(result.id),
    returnNumber: result.return_number,
    status: String(result.status || 'pending_leader'),
  };
}

export type ClientReturnProofPhoto = {
  id?: string;
  fileName: string;
  url: string;
  path: string;
};

export type ClientReturnLine = {
  variantName: string;
  brandName: string;
  variantType: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  variantId?: string;
  brandId?: string;
  variantTypeId?: string;
  clientOrderItemId?: string;
  stockFate?: 'restock' | 'disposal';
};

export type ClientReturnRow = {
  id: string;
  returnNumber: string;
  clientOrderId?: string;
  orderNumber: string;
  clientName: string;
  returnedByName: string;
  returnDate: string;
  createdAt: string;
  reason: string;
  notes: string | null;
  returnType: 'change_item' | 'refund';
  lines: ClientReturnLine[];
  changeLines: ClientReturnLine[];
  proofLabels: string[];
  proofPhotos: ClientReturnProofPhoto[];
  payoutPhotos: ClientReturnProofPhoto[];
  status:
    | 'pending_leader'
    | 'pending_super_admin'
    | 'pending_finance'
    | 'posted'
    | 'rejected'
    | 'cancelled';
  rejectionNote: string | null;
  saApprovedByName: string | null;
  saApprovedAt: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  originalAgentId: string | null;
  returnedBy: string | null;
};

const RETURN_SELECT = `
  id,
  return_number,
  client_order_id,
  order_number,
  client_name,
  returned_by,
  returned_by_name,
  original_agent_id,
  return_date,
  created_at,
  reason,
  notes,
  status,
  return_type,
  rejection_note,
  sa_approved_by_name,
  sa_approved_at,
  approved_by_name,
  approved_at,
  rejected_by_name,
  rejected_at,
  items:client_order_return_items (
    client_order_item_id,
    variant_id,
    brand_id,
    variant_type_id,
    quantity,
    unit_price,
    line_total,
    stock_fate,
    variant:variants (
      name,
      variant_type,
      brand:brands ( id, name )
    )
  ),
  change_items:client_order_return_change_items (
    variant_id,
    brand_id,
    variant_type_id,
    quantity,
    variant:variants (
      name,
      variant_type,
      brand:brands ( id, name )
    )
  ),
  attachments:client_order_return_attachments (
    id,
    file_url,
    file_path,
    file_name,
    sort_order,
    purpose
  )
`;

function nestedRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function parseReturnType(value: unknown): 'change_item' | 'refund' {
  return String(value || '').toLowerCase() === 'refund' ? 'refund' : 'change_item';
}

function parseReturnStatus(value: unknown): ClientReturnRow['status'] {
  const raw = String(value || '');
  if (
    raw === 'pending_leader' ||
    raw === 'pending_super_admin' ||
    raw === 'pending_finance' ||
    raw === 'posted' ||
    raw === 'rejected' ||
    raw === 'cancelled'
  ) {
    return raw;
  }
  return 'pending_leader';
}

function parseStockFate(value: unknown): 'restock' | 'disposal' | undefined {
  const raw = String(value || '').toLowerCase();
  if (raw === 'restock') return 'restock';
  if (raw === 'disposal') return 'disposal';
  return undefined;
}

function mapLine(item: Record<string, unknown>): ClientReturnLine {
  const variant = nestedRecord(item.variant ?? item.variants);
  const brand = nestedRecord(variant.brand ?? variant.brands);
  const variantId = item.variant_id ? String(item.variant_id) : variant.id ? String(variant.id) : undefined;
  const brandId = item.brand_id ? String(item.brand_id) : brand.id ? String(brand.id) : undefined;
  const variantTypeId = item.variant_type_id ? String(item.variant_type_id) : undefined;
  return {
    variantName: String(variant.name || item.variant_name || 'Unknown'),
    brandName: String(brand.name || item.brand_name || 'Unknown'),
    variantType: String(variant.variant_type || item.variant_type || 'flavor'),
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unit_price) || 0,
    lineTotal: Number(item.line_total) || 0,
    variantId,
    brandId,
    variantTypeId,
    clientOrderItemId: item.client_order_item_id ? String(item.client_order_item_id) : undefined,
    stockFate: parseStockFate(item.stock_fate),
  };
}

function mapReturnRow(row: Record<string, unknown>): ClientReturnRow {
  const items = nestedRows(row.items ?? row.client_order_return_items);
  const changeItems = nestedRows(row.change_items ?? row.client_order_return_change_items);
  const attachments = nestedRows(row.attachments ?? row.client_order_return_attachments)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const proofPhotos: ClientReturnProofPhoto[] = [];
  const payoutPhotos: ClientReturnProofPhoto[] = [];
  attachments.forEach((attachment, index) => {
    const photo: ClientReturnProofPhoto = {
      id: attachment.id == null ? undefined : String(attachment.id),
      fileName: String(attachment.file_name || `photo-${index + 1}.jpg`),
      url: String(attachment.file_url || ''),
      path: String(attachment.file_path || ''),
    };
    if (String(attachment.purpose || 'return') === 'finance_payout') {
      payoutPhotos.push(photo);
    } else {
      proofPhotos.push(photo);
    }
  });

  return {
    id: String(row.id),
    returnNumber: String(row.return_number || ''),
    clientOrderId: row.client_order_id == null ? undefined : String(row.client_order_id),
    orderNumber: String(row.order_number || ''),
    clientName: String(row.client_name || 'Client'),
    returnedByName: String(row.returned_by_name || 'Agent'),
    returnDate: String(row.return_date || ''),
    createdAt: String(row.created_at || ''),
    reason: String(row.reason || ''),
    notes: row.notes == null ? null : String(row.notes),
    returnType: parseReturnType(row.return_type),
    lines: items.map(mapLine),
    changeLines: changeItems.map(mapLine),
    proofLabels: proofPhotos.map((photo) => photo.fileName),
    proofPhotos,
    payoutPhotos,
    status: parseReturnStatus(row.status),
    rejectionNote: row.rejection_note == null ? null : String(row.rejection_note),
    saApprovedByName: row.sa_approved_by_name == null ? null : String(row.sa_approved_by_name),
    saApprovedAt: row.sa_approved_at == null ? null : String(row.sa_approved_at),
    approvedByName: row.approved_by_name == null ? null : String(row.approved_by_name),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
    rejectedByName: row.rejected_by_name == null ? null : String(row.rejected_by_name),
    rejectedAt: row.rejected_at == null ? null : String(row.rejected_at),
    originalAgentId: row.original_agent_id == null ? null : String(row.original_agent_id),
    returnedBy: row.returned_by == null ? null : String(row.returned_by),
  };
}

export async function listClientOrderReturns(
  ctx: MotoSalesContext,
  options?: { orderId?: string }
): Promise<{ returns: ClientReturnRow[] }> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('client_order_returns')
    .select(RETURN_SELECT)
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });

  if (options?.orderId) {
    query = query.eq('client_order_id', options.orderId);
  }

  // Match former RLS: MS/agents only see returns they filed or own as original agent.
  if (ctx.role === 'mobile_sales' || ctx.role === 'sales_agent') {
    query = query.or(`returned_by.eq.${ctx.userId},original_agent_id.eq.${ctx.userId}`);
  } else if (ctx.role === 'team_leader') {
    const { data: teamRows, error: teamError } = await sb
      .from('leader_teams')
      .select('agent_id')
      .eq('company_id', ctx.companyId)
      .eq('leader_id', ctx.userId);
    if (teamError) throw teamError;
    const agentIds = [
      ctx.userId,
      ...new Set((teamRows || []).map((row) => String(row.agent_id)).filter(Boolean)),
    ];
    query = query.or(
      `returned_by.in.(${agentIds.join(',')}),original_agent_id.in.(${agentIds.join(',')})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return { returns: (data || []).map((row) => mapReturnRow(asRecord(row))) };
}

export type ApproveClientReturnPayload = {
  return_id: string;
  payout_attachments?: CreateClientReturnAttachmentInput[];
};

export async function approveClientOrderReturn(
  ctx: MotoSalesContext,
  payload: ApproveClientReturnPayload
) {
  if (!payload.return_id) throw new HttpError(400, 'return_id is required');

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('approve_client_order_return', {
    p_return_id: payload.return_id,
    ...(payload.payout_attachments?.length
      ? { p_payout_attachments: payload.payout_attachments }
      : {}),
  });
  if (error) throw error;
  assertRpcSuccess(data, 'Failed to approve client return');
  return { success: true as const };
}

export type RejectClientReturnPayload = {
  return_id: string;
  note?: string | null;
};

export async function rejectClientOrderReturn(
  ctx: MotoSalesContext,
  payload: RejectClientReturnPayload
) {
  if (!payload.return_id) throw new HttpError(400, 'return_id is required');

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('reject_client_order_return', {
    p_return_id: payload.return_id,
    p_note: payload.note?.trim() || null,
  });
  if (error) throw error;
  assertRpcSuccess(data, 'Failed to reject client return');
  return { success: true as const };
}
