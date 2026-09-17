import { supabase } from '@/lib/supabase';
import type { PackageProofPhotoItem } from '@/features/shared/components/MultiProofPhotoField';
import type { ReturnedInventoryRow } from './clientReturnApi';
import { uploadClientOrderReturnProof, uploadClientOrderReturnSignature } from './uploadClientOrderReturnEvidence';

export const RETURN_LEADER_HANDOVERS_QUERY_KEY = 'return-leader-handovers';
export const CLIENT_RETURN_STOCK_HOLDS_QUERY_KEY = 'client-return-stock-holds';

export type ReturnLeaderStatus =
  | 'pending_leader'
  | 'pending_super_admin'
  | 'received'
  | 'rejected'
  | 'cancelled';

export type ReturnLeaderHandoverLine = {
  variantId: string;
  brandId?: string;
  variantTypeId?: string;
  brandName: string;
  variantName: string;
  variantType: string;
  quantity: number;
};

export type ReturnLeaderProofPhoto = {
  fileName: string;
  url: string;
  path: string;
};

export type ReturnLeaderHandover = {
  id: string;
  returnNumber: string;
  submittedByName: string;
  submittedBy: string;
  initiatorRole: string;
  fromHolderId: string;
  fromHolderName?: string;
  toHolderId: string;
  toHolderName?: string;
  status: ReturnLeaderStatus;
  notes: string | null;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  agentSignatureUrl: string | null;
  lines: ReturnLeaderHandoverLine[];
  proofPhotos: ReturnLeaderProofPhoto[];
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

function nestedRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function parseRpcResult(data: unknown, fallbackError: string): RpcResult {
  if (data && typeof data === 'object') return data as RpcResult;
  throw new Error(fallbackError);
}

function mapLine(item: Record<string, unknown>): ReturnLeaderHandoverLine {
  const variant = nestedRecord(item.variant ?? item.variants);
  const brand = nestedRecord(variant.brand ?? variant.brands);
  return {
    variantId: String(item.variant_id || variant.id || ''),
    brandId: item.brand_id ? String(item.brand_id) : brand.id ? String(brand.id) : undefined,
    variantTypeId: item.variant_type_id ? String(item.variant_type_id) : undefined,
    brandName: String(brand.name || 'Unknown'),
    variantName: String(variant.name || 'Unknown'),
    variantType: String(variant.variant_type || 'flavor'),
    quantity: Number(item.quantity) || 0,
  };
}

function mapHandover(row: Record<string, unknown>): ReturnLeaderHandover {
  const items = nestedRows(row.items ?? row.return_leader_handover_items);
  const attachments = nestedRows(row.attachments ?? row.return_leader_handover_attachments)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  return {
    id: String(row.id),
    returnNumber: String(row.return_number || ''),
    submittedBy: String(row.submitted_by || ''),
    submittedByName: String(row.submitted_by_name || 'Agent'),
    initiatorRole: String(row.initiator_role || ''),
    fromHolderId: String(row.from_holder_id || ''),
    toHolderId: String(row.to_holder_id || ''),
    status: String(row.status || 'pending_leader') as ReturnLeaderStatus,
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at || ''),
    approvedByName: row.approved_by_name == null ? null : String(row.approved_by_name),
    approvedAt: row.approved_at == null ? null : String(row.approved_at),
    rejectedByName: row.rejected_by_name == null ? null : String(row.rejected_by_name),
    rejectedAt: row.rejected_at == null ? null : String(row.rejected_at),
    rejectionNote: row.rejection_note == null ? null : String(row.rejection_note),
    agentSignatureUrl: row.agent_signature_url == null ? null : String(row.agent_signature_url),
    lines: items.map(mapLine),
    proofPhotos: attachments.map((attachment, index) => ({
      fileName: String(attachment.file_name || `photo-${index + 1}.jpg`),
      url: String(attachment.file_url || ''),
      path: String(attachment.file_path || ''),
    })),
  };
}

const HANDOVER_SELECT = `
  id,
  return_number,
  submitted_by,
  submitted_by_name,
  initiator_role,
  from_holder_id,
  to_holder_id,
  status,
  notes,
  created_at,
  approved_by_name,
  approved_at,
  rejected_by_name,
  rejected_at,
  rejection_note,
  agent_signature_url,
  agent_signature_path,
  items:return_leader_handover_items (
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
  attachments:return_leader_handover_attachments (
    file_url,
    file_path,
    file_name,
    sort_order
  )
`;

export async function fetchReturnLeaderHandovers(): Promise<ReturnLeaderHandover[]> {
  const { data, error } = await supabase
    .from('return_leader_handovers')
    .select(HANDOVER_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []).map((row) => mapHandover(asRecord(row)));
  const holderIds = [
    ...new Set(rows.flatMap((row) => [row.toHolderId, row.fromHolderId]).filter(Boolean)),
  ];
  if (holderIds.length === 0) return rows;

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', holderIds);
  if (profileError || !profiles) return rows;

  const nameById = new Map(
    profiles.map((profile) => [String(profile.id), String(profile.full_name || '').trim()])
  );
  return rows.map((row) => ({
    ...row,
    fromHolderName: nameById.get(row.fromHolderId) || row.submittedByName,
    toHolderName: nameById.get(row.toHolderId) || undefined,
  }));
}

const HOLD_SELECT = `
  holder_id,
  variant_id,
  brand_id,
  qty_on_hand,
  variant:variants (
    name,
    variant_type,
    brand:brands ( id, name )
  )
`;

export async function fetchClientReturnStockHolds(holderId: string): Promise<ReturnedInventoryRow[]> {
  const [{ data, error }, { data: pendingHandovers, error: pendingError }] = await Promise.all([
    supabase
      .from('client_return_stock_holds')
      .select(HOLD_SELECT)
      .eq('holder_id', holderId)
      .gt('qty_on_hand', 0),
    supabase
      .from('return_leader_handovers')
      .select('id, items:return_leader_handover_items ( variant_id, quantity )')
      .eq('from_holder_id', holderId)
      .in('status', ['pending_leader', 'pending_super_admin']),
  ]);
  if (error) throw error;
  if (pendingError) throw pendingError;

  const reservedByVariant = new Map<string, number>();
  for (const raw of pendingHandovers || []) {
    const handover = asRecord(raw);
    const items = Array.isArray(handover.items) ? handover.items : [];
    for (const itemRaw of items) {
      const item = asRecord(itemRaw);
      const variantId = String(item.variant_id || '');
      if (!variantId) continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      reservedByVariant.set(variantId, (reservedByVariant.get(variantId) ?? 0) + qty);
    }
  }

  const rows: ReturnedInventoryRow[] = [];
  for (const raw of data || []) {
    const row = asRecord(raw);
    const variant = nestedRecord(row.variant);
    const brand = nestedRecord(variant.brand);
    const variantId = String(row.variant_id || variant.id || '');
    if (!variantId) continue;
    const onHand = Number(row.qty_on_hand) || 0;
    const reserved = reservedByVariant.get(variantId) ?? 0;
    // Match get_client_return_available_qty: hide stock already in a pending RL.
    const available = Math.max(0, onHand - reserved);
    if (available <= 0) continue;
    rows.push({
      variantId,
      brandId: row.brand_id ? String(row.brand_id) : brand.id ? String(brand.id) : undefined,
      brandName: String(brand.name || 'Unknown'),
      variantName: String(variant.name || variantId),
      variantType: String(variant.variant_type || 'flavor'),
      qty: available,
      returns: [],
    });
  }

  return rows.sort((a, b) => {
    const brandCompare = a.brandName.localeCompare(b.brandName);
    if (brandCompare !== 0) return brandCompare;
    return a.variantName.localeCompare(b.variantName);
  });
}

export async function fetchAvailableReturnQty(
  companyId: string,
  holderId: string,
  variantId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('get_client_return_available_qty', {
    p_company_id: companyId,
    p_holder_id: holderId,
    p_variant_id: variantId,
  });
  if (error) throw error;
  return Math.max(0, Number(data) || 0);
}

export async function createReturnLeaderHandover(input: {
  companyId: string;
  items: Array<{ variantId: string; brandId?: string; variantTypeId?: string; quantity: number }>;
  notes?: string;
  photos: PackageProofPhotoItem[];
  signatureDataUrl: string;
}): Promise<{ id: string; returnNumber: string; status: string }> {
  if (!input.photos.length) {
    throw new Error('Add at least one photo before submitting');
  }
  if (!input.signatureDataUrl.trim()) {
    throw new Error('Add your signature before submitting');
  }

  const [attachments, signature] = await Promise.all([
    uploadProofAttachments(input.photos, input.companyId),
    uploadClientOrderReturnSignature({
      signatureDataUrl: input.signatureDataUrl,
      companyId: input.companyId,
    }),
  ]);

  const { data, error } = await supabase.rpc('create_return_leader_handover', {
    p_items: input.items.map((item) => ({
      variant_id: item.variantId,
      brand_id: item.brandId || null,
      variant_type_id: item.variantTypeId || null,
      quantity: item.quantity,
    })),
    p_notes: input.notes?.trim() || null,
    p_attachments: attachments,
    p_agent_signature_url: signature.url,
    p_agent_signature_path: signature.path,
  });
  if (error) throw error;

  const result = parseRpcResult(data, 'Failed to create return to leader');
  if (!result.success || !result.id || !result.return_number) {
    throw new Error(result.error || 'Failed to create return to leader');
  }

  return {
    id: String(result.id),
    returnNumber: result.return_number,
    status: String(result.status || 'pending_leader'),
  };
}

async function uploadProofAttachments(
  photos: PackageProofPhotoItem[],
  companyId: string
): Promise<
  Array<{
    file_url: string;
    file_path: string;
    file_name: string;
    content_type: string;
    source: string;
    sort_order: number;
  }>
> {
  const attachments = [];
  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
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
      companyId,
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
  return attachments;
}

export async function approveReturnLeaderHandover(
  handoverId: string,
  photos: PackageProofPhotoItem[],
  companyId: string
): Promise<void> {
  const attachments = await uploadProofAttachments(photos, companyId);
  const { data, error } = await supabase.rpc('approve_return_leader_handover', {
    p_handover_id: handoverId,
    p_attachments: attachments,
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to approve return to leader');
  if (!result.success) throw new Error(result.error || 'Failed to approve return to leader');
}

export async function rejectReturnLeaderHandover(handoverId: string, note?: string): Promise<void> {
  const { data, error } = await supabase.rpc('reject_return_leader_handover', {
    p_handover_id: handoverId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const result = parseRpcResult(data, 'Failed to reject return to leader');
  if (!result.success) throw new Error(result.error || 'Failed to reject return to leader');
}

export function returnLeaderStatusLabel(status: ReturnLeaderStatus): string {
  switch (status) {
    case 'pending_leader':
      return 'Pending TL';
    case 'pending_super_admin':
      return 'Pending confirmation';
    case 'received':
      return 'Received';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function returnLeaderStatusBadgeClass(status: ReturnLeaderStatus): string {
  switch (status) {
    case 'pending_leader':
    case 'pending_super_admin':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'received':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'cancelled':
      return 'bg-gray-100 text-gray-700 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function canCreateReturnLeader(role?: string | null): boolean {
  return role === 'mobile_sales' || role === 'sales_agent';
}

export function canReviewReturnLeaderAsLeader(
  role?: string | null,
  handover?: ReturnLeaderHandover | null,
  userId?: string | null
): boolean {
  return (
    role === 'team_leader' &&
    !!handover &&
    handover.status === 'pending_leader' &&
    handover.toHolderId === userId
  );
}

export function canReviewReturnLeaderAsSuperAdmin(
  role?: string | null,
  handover?: ReturnLeaderHandover | null
): boolean {
  return role === 'super_admin' && !!handover && handover.status === 'pending_super_admin';
}

export function getReturnLeaderLineQty(handover: ReturnLeaderHandover): number {
  return handover.lines.reduce((sum, line) => sum + line.quantity, 0);
}
