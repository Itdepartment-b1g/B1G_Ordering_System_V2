import { supabase } from '@/lib/supabase';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import {
  parseClientReturnStatus,
  parseClientReturnType,
  type PayoutAttachmentRevision,
  type PreviewChangeItemSku,
  type PreviewClientReturn,
} from './clientReturnPreview';
import {
  uploadClientOrderReturnProof,
  uploadClientOrderReturnSignature,
} from './uploadClientOrderReturnEvidence';

export const CLIENT_ORDER_RETURNS_QUERY_KEY = 'client-order-returns';
export const CLIENT_ORDER_RETURN_PAYOUT_REVISIONS_QUERY_KEY = 'client-order-return-payout-revisions';
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
  id?: string;
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

function mapLine(item: Record<string, unknown>): PreviewClientReturn['lines'][number] {
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
    clientOrderItemId: item.client_order_item_id
      ? String(item.client_order_item_id)
      : undefined,
  };
}

function mapReturnRow(row: Record<string, unknown>): PreviewClientReturn {
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
    returnType: parseClientReturnType(row.return_type),
    lines: items.map(mapLine),
    changeLines: changeItems.map(mapLine),
    proofLabels: proofPhotos.map((photo) => photo.fileName),
    proofPhotos,
    payoutPhotos,
    status: parseClientReturnStatus(row.status),
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

export async function fetchClientOrderReturns(): Promise<PreviewClientReturn[]> {
  const { data, error } = await supabase
    .from('client_order_returns')
    .select(RETURN_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapReturnRow(asRecord(row)));
}

export async function fetchClientOrderReturnsForOrder(orderId: string): Promise<PreviewClientReturn[]> {
  const { data, error } = await supabase
    .from('client_order_returns')
    .select(RETURN_SELECT)
    .eq('client_order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapReturnRow(asRecord(row)));
}

const POSTED_RETURNS_ORDER_ID_CHUNK = 100;

export async function fetchPostedClientOrderReturnsForOrders(
  orderIds: string[]
): Promise<PreviewClientReturn[]> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const rows: PreviewClientReturn[] = [];
  for (let i = 0; i < ids.length; i += POSTED_RETURNS_ORDER_ID_CHUNK) {
    const chunk = ids.slice(i, i + POSTED_RETURNS_ORDER_ID_CHUNK);
    const { data, error } = await supabase
      .from('client_order_returns')
      .select(RETURN_SELECT)
      .in('client_order_id', chunk)
      .eq('status', 'posted')
      .order('created_at', { ascending: false });
    if (error) throw error;
    rows.push(...(data || []).map((row) => mapReturnRow(asRecord(row))));
  }
  return rows;
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
): Promise<PreviewChangeItemSku[]> {
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
      } satisfies PreviewChangeItemSku;
    })
    .filter(Boolean) as PreviewChangeItemSku[];
}

export function buildReturnedStockByVariantId(
  returns: PreviewClientReturn[],
  options?: { holderId?: string | null }
): Map<string, { qty: number; returns: PreviewClientReturn[] }> {
  const map = new Map<string, { qty: number; returns: PreviewClientReturn[] }>();
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
  returns: PreviewClientReturn[];
};

export function buildReturnedInventoryRows(
  returns: PreviewClientReturn[],
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

async function uploadReturnPhotoAttachments(
  photos: PackageProofPhotoItem[],
  companyId: string,
  kind: 'proof' | 'payout'
) {
  const attachments = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const photoKind =
      kind === 'payout'
        ? 'payout'
        : photo.fileName.toLowerCase().startsWith('capture')
          ? 'capture'
          : 'proof';
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
      companyId,
      fileName: photo.fileName,
      kind: photoKind,
    });
    attachments.push({
      file_url: uploaded.url,
      file_path: uploaded.path,
      file_name: photo.fileName,
      content_type: uploaded.contentType,
      source: photoKind === 'capture' ? 'capture' : 'upload',
      sort_order: index,
    });
  }
  return attachments;
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
  returnType?: 'change_item' | 'refund';
}): Promise<{ id: string; returnNumber: string; status: string }> {
  const signature = await uploadClientOrderReturnSignature({
    signatureDataUrl: input.signatureDataUrl,
    companyId: input.companyId,
  });

  const attachments = await uploadReturnPhotoAttachments(input.photos, input.companyId, 'proof');

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
    p_return_type: input.returnType === 'refund' ? 'refund' : 'change_item',
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

export async function approveClientOrderReturn(
  returnId: string,
  payout?: { companyId: string; photos: PackageProofPhotoItem[] }
): Promise<void> {
  let payoutAttachments: Awaited<ReturnType<typeof uploadReturnPhotoAttachments>> | undefined;
  if (payout) {
    if (!payout.photos.length) {
      throw new Error('Attach a photo as proof that cash was sent');
    }
    payoutAttachments = await uploadReturnPhotoAttachments(payout.photos, payout.companyId, 'payout');
  }

  const { data, error } = await supabase.rpc('approve_client_order_return', {
    p_return_id: returnId,
    ...(payoutAttachments ? { p_payout_attachments: payoutAttachments } : {}),
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to approve client return');
  if (!result.success) throw new Error(result.error || 'Failed to approve client return');
}

export async function fetchPayoutAttachmentRevisions(returnId: string): Promise<PayoutAttachmentRevision[]> {
  const { data, error } = await supabase
    .from('client_order_return_attachment_revisions')
    .select(
      'id, attachment_id, previous_file_url, previous_file_name, new_file_url, new_file_name, reason, changed_by_name, created_at'
    )
    .eq('return_id', returnId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => {
    const rec = asRecord(row);
    return {
      id: String(rec.id),
      attachmentId: String(rec.attachment_id),
      previousFileUrl: String(rec.previous_file_url || ''),
      previousFileName: rec.previous_file_name == null ? null : String(rec.previous_file_name),
      newFileUrl: String(rec.new_file_url || ''),
      newFileName: rec.new_file_name == null ? null : String(rec.new_file_name),
      reason: String(rec.reason || ''),
      changedByName: rec.changed_by_name == null ? null : String(rec.changed_by_name),
      createdAt: String(rec.created_at || ''),
    };
  });
}

export async function replaceClientOrderReturnPayoutAttachment(input: {
  attachmentId: string;
  companyId: string;
  photo: PackageProofPhotoItem;
  reason: string;
}): Promise<void> {
  const uploaded = await uploadReturnPhotoAttachments([input.photo], input.companyId, 'payout');
  const file = uploaded[0];
  if (!file) throw new Error('New proof photo is required');

  const { data, error } = await supabase.rpc('replace_client_order_return_payout_attachment', {
    p_attachment_id: input.attachmentId,
    p_file_url: file.file_url,
    p_file_path: file.file_path,
    p_file_name: file.file_name,
    p_content_type: file.content_type,
    p_reason: input.reason.trim(),
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to replace cash-sent proof');
  if (!result.success) throw new Error(result.error || 'Failed to replace cash-sent proof');
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

export function canOpenClientOrderTimeline(
  hasWarehouseHubLink: boolean,
  role?: string | null
): boolean {
  if (!canShowClientOrderReturns(hasWarehouseHubLink, role)) return false;
  return role === 'super_admin' || role === 'finance' || role === 'team_leader';
}

export function canCreateClientOrderReturn(role?: string | null): boolean {
  return role === 'mobile_sales' || role === 'sales_agent' || role === 'team_leader';
}
