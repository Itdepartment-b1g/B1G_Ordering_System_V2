import { supabase } from '@/lib/supabase';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import {
  type MockChangeItemSku,
  type MockClientReturn,
  type MockClientReturnStatus,
} from './clientReturnMock';
import {
  uploadClientOrderReturnProof,
  uploadClientOrderReturnSignature,
} from './uploadClientOrderReturnEvidence';

export const CLIENT_ORDER_RETURNS_QUERY_KEY = 'client-order-returns';
export const CLIENT_ORDER_RETURN_POSTED_QTY_QUERY_KEY = 'client-order-return-posted-qty';
export const CLIENT_ORDER_RETURN_CHANGE_CATALOG_QUERY_KEY = 'client-order-return-change-catalog';

type RpcResult = {
  success?: boolean;
  error?: string;
  id?: string;
  return_number?: string;
  status?: string;
};

export type ClientReturnProofPhoto = {
  fileName: string;
  url: string;
  path: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nestedRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord);
  if (value && typeof value === 'object') return [asRecord(value)];
  return [];
}

function parseRpcResult(data: unknown, fallbackError: string): RpcResult {
  if (data && typeof data === 'object') return data as RpcResult;
  throw new Error(fallbackError);
}

function nestedRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function mapLine(item: Record<string, unknown>): MockClientReturn['lines'][number] {
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
    variantId,
    brandId,
    variantTypeId,
  };
}

function mapReturnRow(row: Record<string, unknown>): MockClientReturn {
  const items = nestedRows(row.items ?? row.client_order_return_items);
  const changeItems = nestedRows(row.change_items ?? row.client_order_return_change_items);
  const attachments = nestedRows(row.attachments ?? row.client_order_return_attachments)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const proofPhotos: ClientReturnProofPhoto[] = attachments.map((attachment, index) => ({
    fileName: String(attachment.file_name || `photo-${index + 1}.jpg`),
    url: String(attachment.file_url || ''),
    path: String(attachment.file_path || ''),
  }));

  return {
    id: String(row.id),
    returnNumber: String(row.return_number || ''),
    orderNumber: String(row.order_number || ''),
    clientName: String(row.client_name || 'Client'),
    returnedByName: String(row.returned_by_name || 'Agent'),
    returnDate: String(row.return_date || ''),
    createdAt: String(row.created_at || ''),
    reason: String(row.reason || ''),
    notes: row.notes == null ? null : String(row.notes),
    lines: items.map(mapLine),
    changeLines: changeItems.map(mapLine),
    proofLabels: proofPhotos.map((photo) => photo.fileName),
    proofPhotos,
    status: (String(row.status || 'pending_leader') as MockClientReturnStatus),
    rejectionNote: row.rejection_note == null ? null : String(row.rejection_note),
    approvedByName: row.approved_by_name == null ? null : String(row.approved_by_name),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
    rejectedByName: row.rejected_by_name == null ? null : String(row.rejected_by_name),
    rejectedAt: row.rejected_at == null ? null : String(row.rejected_at),
    originalAgentId: row.original_agent_id == null ? null : String(row.original_agent_id),
    returnedBy: row.returned_by == null ? null : String(row.returned_by),
  };
}

const RETURN_SELECT = `
  id,
  return_number,
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
  rejection_note,
  approved_by_name,
  approved_at,
  rejected_by_name,
  rejected_at,
  items:client_order_return_items (
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
    file_url,
    file_path,
    file_name,
    sort_order
  )
`;

export async function fetchClientOrderReturns(): Promise<MockClientReturn[]> {
  const { data, error } = await supabase
    .from('client_order_returns')
    .select(RETURN_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapReturnRow(asRecord(row)));
}

export async function fetchClientOrderReturnsForOrder(orderId: string): Promise<MockClientReturn[]> {
  const { data, error } = await supabase
    .from('client_order_returns')
    .select(RETURN_SELECT)
    .eq('client_order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapReturnRow(asRecord(row)));
}

export async function fetchPostedReturnedQtyByItemId(
  orderId: string
): Promise<Record<string, number>> {
  const qtyByItem: Record<string, number> = {};
  const { data, error } = await supabase
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
    .eq('client_order_id', orderId)
    .eq('status', 'posted');
  if (error) throw error;

  for (const header of data || []) {
    for (const item of nestedRows(asRecord(header).items)) {
      const itemId = String(item.client_order_item_id || '');
      if (!itemId) continue;
      qtyByItem[itemId] = (qtyByItem[itemId] || 0) + (Number(item.quantity) || 0);
    }
  }
  return qtyByItem;
}

export async function fetchChangeItemCatalog(
  userId: string,
  companyId: string,
  brandIds: string[]
): Promise<MockChangeItemSku[]> {
  const wanted = new Set(brandIds.filter(Boolean));
  if (wanted.size === 0) return [];

  const { data, error } = await supabase
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
    .eq('company_id', companyId)
    .eq('agent_id', userId);
  if (error) throw error;

  return (data || [])
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
        variantTypeId: variantRecord.variant_type_id ? String(variantRecord.variant_type_id) : undefined,
        sellableQty: Math.max(0, Number(record.stock) || 0),
      } satisfies MockChangeItemSku;
    })
    .filter(Boolean) as MockChangeItemSku[];
}

export function buildReturnedStockByVariantId(
  returns: MockClientReturn[],
  options?: { holderId?: string | null }
): Map<string, { qty: number; returns: MockClientReturn[] }> {
  const map = new Map<string, { qty: number; returns: MockClientReturn[] }>();
  for (const cr of returns) {
    if (cr.status !== 'posted') continue;
    if (options?.holderId) {
      const holder = cr.originalAgentId || cr.returnedBy;
      if (holder && holder !== options.holderId) continue;
    }
    for (const line of cr.lines) {
      const variantId = line.variantId;
      if (!variantId) continue;
      const current = map.get(variantId) || { qty: 0, returns: [] };
      current.qty += line.quantity;
      if (!current.returns.some((row) => row.id === cr.id)) current.returns.push(cr);
      map.set(variantId, current);
    }
  }
  return map;
}

export type ReturnedInventoryRow = {
  variantId: string;
  brandId?: string;
  brandName: string;
  variantName: string;
  variantType: string;
  qty: number;
  returns: MockClientReturn[];
};

export function buildReturnedInventoryRows(
  returns: MockClientReturn[],
  options?: { holderId?: string | null }
): ReturnedInventoryRow[] {
  const byVariant = buildReturnedStockByVariantId(returns, options);
  const rows: ReturnedInventoryRow[] = [];

  for (const [variantId, stock] of byVariant) {
    const line = stock.returns
      .flatMap((cr) => cr.lines)
      .find((item) => item.variantId === variantId);
    rows.push({
      variantId,
      brandId: line?.brandId,
      brandName: line?.brandName || 'Unknown',
      variantName: line?.variantName || variantId,
      variantType: line?.variantType || 'flavor',
      qty: stock.qty,
      returns: stock.returns,
    });
  }

  return rows.sort((a, b) => {
    const brandCompare = a.brandName.localeCompare(b.brandName);
    if (brandCompare !== 0) return brandCompare;
    const typeCompare = a.variantType.localeCompare(b.variantType);
    if (typeCompare !== 0) return typeCompare;
    return a.variantName.localeCompare(b.variantName);
  });
}

export async function createClientOrderReturn(input: {
  companyId: string;
  clientOrderId: string;
  returnDate: string;
  reason: string;
  notes: string;
  signatureDataUrl: string;
  items: Array<{ clientOrderItemId: string; quantity: number }>;
  changeItems: Array<{ variantId: string; quantity: number }>;
  photos: PackageProofPhotoItem[];
}): Promise<{ id: string; returnNumber: string; status: string }> {
  const signature = await uploadClientOrderReturnSignature({
    signatureDataUrl: input.signatureDataUrl,
    companyId: input.companyId,
  });

  const attachments = [];
  for (let index = 0; index < input.photos.length; index += 1) {
    const photo = input.photos[index];
    const kind = photo.fileName.toLowerCase().startsWith('capture') ? 'capture' : 'proof';
    let file = photo.file;
    if (!file && photo.previewUrl.startsWith('blob:')) {
      const response = await fetch(photo.previewUrl);
      const blob = await response.blob();
      file = new File([blob], photo.fileName || `proof-${index + 1}.jpg`, {
        type: blob.type || 'image/jpeg',
      });
    }
    const uploaded = await uploadClientOrderReturnProof({
      file,
      dataUrl: file ? undefined : photo.previewUrl,
      companyId: input.companyId,
      fileName: photo.fileName,
      kind,
    });
    attachments.push({
      file_url: uploaded.url,
      file_path: uploaded.path,
      file_name: photo.fileName,
      content_type: uploaded.contentType,
      source: kind === 'capture' ? 'capture' : 'upload',
      sort_order: index,
    });
  }

  const { data, error } = await supabase.rpc('create_client_order_return', {
    p_client_order_id: input.clientOrderId,
    p_return_date: input.returnDate,
    p_reason: input.reason,
    p_notes: input.notes,
    p_agent_signature_url: signature.url,
    p_items: input.items.map((item) => ({
      client_order_item_id: item.clientOrderItemId,
      quantity: item.quantity,
    })),
    p_change_items: input.changeItems.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
    })),
    p_attachments: attachments,
  });
  if (error) throw error;

  const result = parseRpcResult(data, 'Failed to create client return');
  if (!result.success || !result.id || !result.return_number) {
    throw new Error(result.error || 'Failed to create client return');
  }

  return {
    id: String(result.id),
    returnNumber: result.return_number,
    status: String(result.status || 'pending_leader'),
  };
}

export async function approveClientOrderReturn(returnId: string): Promise<void> {
  const { data, error } = await supabase.rpc('approve_client_order_return', {
    p_return_id: returnId,
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to approve client return');
  if (!result.success) throw new Error(result.error || 'Failed to approve client return');
}

export async function rejectClientOrderReturn(returnId: string, note?: string): Promise<void> {
  const { data, error } = await supabase.rpc('reject_client_order_return', {
    p_return_id: returnId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to reject client return');
  if (!result.success) throw new Error(result.error || 'Failed to reject client return');
}

export function canShowClientOrderReturns(hasWarehouseHubLink: boolean, role?: string | null): boolean {
  if (role === 'warehouse') return false;
  return hasWarehouseHubLink;
}

export function canCreateClientOrderReturn(role?: string | null): boolean {
  return role === 'mobile_sales' || role === 'sales_agent' || role === 'team_leader';
}
