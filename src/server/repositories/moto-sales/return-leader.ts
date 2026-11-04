import { HttpError } from '../../http/errors';
import type { MotoSalesContext } from '../../auth/requireMotoSalesContext';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';

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

export type ReturnedInventoryHoldRow = {
  variantId: string;
  brandId?: string;
  brandName: string;
  variantName: string;
  variantType: string;
  qty: number;
  returns: [];
};

export type ReturnLeaderAttachmentInput = {
  file_url: string;
  file_path: string;
  file_name: string;
  content_type?: string;
  source?: string;
  sort_order?: number;
};

export type CreateReturnLeaderPayload = {
  items: Array<{
    variant_id: string;
    brand_id?: string | null;
    variant_type_id?: string | null;
    quantity: number;
  }>;
  notes?: string | null;
  attachments: ReturnLeaderAttachmentInput[];
  agent_signature_url: string;
  agent_signature_path?: string | null;
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

function assertRpcSuccess(data: unknown, fallback: string): RpcResult {
  const result = (data ?? {}) as RpcResult;
  if (!result.success) {
    throw new HttpError(400, result.error || fallback);
  }
  return result;
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

export async function listReturnLeaderHandovers(
  ctx: MotoSalesContext
): Promise<{ handovers: ReturnLeaderHandover[] }> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('return_leader_handovers')
    .select(HANDOVER_SELECT)
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });

  // Match former RLS: MS/agents only see RLs they submitted / hold / receive.
  if (ctx.role === 'mobile_sales' || ctx.role === 'sales_agent') {
    query = query.or(
      `submitted_by.eq.${ctx.userId},from_holder_id.eq.${ctx.userId},to_holder_id.eq.${ctx.userId}`
    );
  } else if (ctx.role === 'team_leader') {
    const { data: teamRows, error: teamError } = await sb
      .from('leader_teams')
      .select('agent_id')
      .eq('company_id', ctx.companyId)
      .eq('leader_id', ctx.userId);
    if (teamError) throw teamError;
    const agentIds = [
      ...new Set((teamRows || []).map((row) => String(row.agent_id)).filter(Boolean)),
    ];
    const parts = [
      `submitted_by.eq.${ctx.userId}`,
      `from_holder_id.eq.${ctx.userId}`,
      `to_holder_id.eq.${ctx.userId}`,
    ];
    if (agentIds.length > 0) {
      parts.push(`submitted_by.in.(${agentIds.join(',')})`);
      parts.push(`from_holder_id.in.(${agentIds.join(',')})`);
    }
    query = query.or(parts.join(','));
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []).map((row) => mapHandover(asRecord(row)));
  const holderIds = [
    ...new Set(rows.flatMap((row) => [row.toHolderId, row.fromHolderId]).filter(Boolean)),
  ];
  if (holderIds.length === 0) return { handovers: rows };

  const { data: profiles, error: profileError } = await sb
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', ctx.companyId)
    .in('id', holderIds);
  if (profileError || !profiles) return { handovers: rows };

  const nameById = new Map(
    profiles.map((profile) => [String(profile.id), String(profile.full_name || '').trim()])
  );
  return {
    handovers: rows.map((row) => ({
      ...row,
      fromHolderName: nameById.get(row.fromHolderId) || row.submittedByName,
      toHolderName: nameById.get(row.toHolderId) || undefined,
    })),
  };
}

export async function listClientReturnStockHolds(
  ctx: MotoSalesContext,
  holderId: string
): Promise<{ holds: ReturnedInventoryHoldRow[] }> {
  if (!holderId) throw new HttpError(400, 'holderId is required');

  // Agents only see their own holds; leaders/admins may request any holder in company.
  if (
    (ctx.role === 'mobile_sales' || ctx.role === 'sales_agent') &&
    holderId !== ctx.userId
  ) {
    throw new HttpError(403, 'You can only view your own returned stock');
  }

  const sb = getSupabaseAdmin();
  const [{ data, error }, { data: pendingHandovers, error: pendingError }] = await Promise.all([
    sb
      .from('client_return_stock_holds')
      .select(HOLD_SELECT)
      .eq('company_id', ctx.companyId)
      .eq('holder_id', holderId)
      .gt('qty_on_hand', 0),
    sb
      .from('return_leader_handovers')
      .select('id, items:return_leader_handover_items ( variant_id, quantity )')
      .eq('company_id', ctx.companyId)
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

  const holds: ReturnedInventoryHoldRow[] = [];
  for (const raw of data || []) {
    const row = asRecord(raw);
    const variant = nestedRecord(row.variant);
    const brand = nestedRecord(variant.brand);
    const variantId = String(row.variant_id || variant.id || '');
    if (!variantId) continue;
    const onHand = Number(row.qty_on_hand) || 0;
    const reserved = reservedByVariant.get(variantId) ?? 0;
    const available = Math.max(0, onHand - reserved);
    if (available <= 0) continue;
    holds.push({
      variantId,
      brandId: row.brand_id ? String(row.brand_id) : brand.id ? String(brand.id) : undefined,
      brandName: String(brand.name || 'Unknown'),
      variantName: String(variant.name || variantId),
      variantType: String(variant.variant_type || 'flavor'),
      qty: available,
      returns: [],
    });
  }

  holds.sort((a, b) => {
    const brandCompare = a.brandName.localeCompare(b.brandName);
    if (brandCompare !== 0) return brandCompare;
    return a.variantName.localeCompare(b.variantName);
  });

  return { holds };
}

export async function createReturnLeaderHandover(
  ctx: MotoSalesContext,
  payload: CreateReturnLeaderPayload
) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new HttpError(400, 'At least one item is required');
  }
  if (!payload.attachments?.length) {
    throw new HttpError(400, 'Add at least one photo before submitting');
  }
  if (!payload.agent_signature_url) {
    throw new HttpError(400, 'Add your signature before submitting');
  }

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('create_return_leader_handover', {
    p_items: payload.items.map((item) => ({
      variant_id: item.variant_id,
      brand_id: item.brand_id || null,
      variant_type_id: item.variant_type_id || null,
      quantity: item.quantity,
    })),
    p_notes: payload.notes?.trim() || null,
    p_attachments: payload.attachments,
    p_agent_signature_url: payload.agent_signature_url,
    p_agent_signature_path: payload.agent_signature_path || null,
  });
  if (error) throw error;

  const result = assertRpcSuccess(data, 'Failed to create return to leader');
  if (!result.id || !result.return_number) {
    throw new HttpError(400, result.error || 'Failed to create return to leader');
  }

  return {
    id: String(result.id),
    returnNumber: result.return_number,
    status: String(result.status || 'pending_leader'),
  };
}

export async function approveReturnLeaderHandover(
  ctx: MotoSalesContext,
  payload: { handover_id: string; attachments: ReturnLeaderAttachmentInput[] }
) {
  if (!payload.handover_id) throw new HttpError(400, 'handover_id is required');

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('approve_return_leader_handover', {
    p_handover_id: payload.handover_id,
    p_attachments: payload.attachments || [],
  });
  if (error) throw error;
  assertRpcSuccess(data, 'Failed to approve return to leader');
  return { success: true as const };
}

export async function rejectReturnLeaderHandover(
  ctx: MotoSalesContext,
  payload: { handover_id: string; note?: string | null }
) {
  if (!payload.handover_id) throw new HttpError(400, 'handover_id is required');

  const userSb = getSupabaseUser(ctx.accessToken);
  const { data, error } = await userSb.rpc('reject_return_leader_handover', {
    p_handover_id: payload.handover_id,
    p_note: payload.note?.trim() || null,
  });
  if (error) throw error;
  assertRpcSuccess(data, 'Failed to reject return to leader');
  return { success: true as const };
}
