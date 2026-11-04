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
