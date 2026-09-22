import { supabase } from '@/lib/supabase';

export type PriceChangeBatchStatus =
  | 'pending_agreement'
  | 'applied'
  | 'rejected'
  | 'cancelled';

export type PriceChangeAgreementStatus = 'pending' | 'confirmed' | 'revoked';

export interface PriceChangeItemInput {
  variant_id: string;
  new_selling_price: number;
  new_dsp_price: number;
  new_rsp_price: number;
}

export interface CompanyPriceChangeItem {
  id: string;
  batch_id: string;
  company_id: string;
  brand_id: string | null;
  brand_name: string;
  variant_id: string;
  variant_name: string;
  variant_type: string;
  old_selling_price: number;
  new_selling_price: number;
  old_dsp_price: number;
  new_dsp_price: number;
  old_rsp_price: number;
  new_rsp_price: number;
  agent_rows_updated: number | null;
  created_at: string;
  updated_at?: string;
}

export interface CompanyPriceChangeAgreement {
  id: string;
  batch_id: string;
  company_id: string;
  profile_id: string;
  profile_name: string;
  profile_role: 'team_leader' | 'mobile_sales';
  status: PriceChangeAgreementStatus;
  confirmed_at: string | null;
  last_confirmed_at?: string | null;
  note: string | null;
  created_at: string;
}

export interface CompanyPriceChangeBatch {
  id: string;
  company_id: string;
  batch_number: string;
  status: PriceChangeBatchStatus;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  main_applied_at: string | null;
  agents_applied_at: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  rejected_at: string | null;
  rejection_note: string | null;
  rejected_by_name: string | null;
  items?: CompanyPriceChangeItem[];
  agreements?: CompanyPriceChangeAgreement[];
}

type RpcResult = {
  success?: boolean;
  error?: string;
  batch_id?: string;
  batch_number?: string;
  item_count?: number;
  agreement_count?: number;
  auto_applied?: boolean;
  appended?: boolean;
  reset_confirmed_count?: number;
  bag_rows_updated?: number;
  bag_applied?: boolean;
  apply_result?: {
    success?: boolean;
    applied?: boolean;
    pending?: number;
    confirmed?: number;
    agent_rows_updated?: number;
    already_applied?: boolean;
  };
};

function asRpcResult(data: unknown): RpcResult {
  return (data ?? {}) as RpcResult;
}

export async function createCompanyPriceChangeBatch(
  items: PriceChangeItemInput[],
  note?: string
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('create_company_price_change_batch', {
    p_items: items,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const result = asRpcResult(data);
  if (!result.success) throw new Error(result.error || 'Failed to create price change batch');
  return result;
}

export async function confirmCompanyPriceChange(batchId: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('confirm_company_price_change', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  const result = asRpcResult(data);
  if (!result.success) throw new Error(result.error || 'Failed to confirm');
  return result;
}

export async function rejectCompanyPriceChange(batchId: string, note?: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('reject_company_price_change', {
    p_batch_id: batchId,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const result = asRpcResult(data);
  if (!result.success) throw new Error(result.error || 'Failed to reject');
  return result;
}

export async function cancelCompanyPriceChange(batchId: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('cancel_company_price_change', {
    p_batch_id: batchId,
  });
  if (error) throw error;
  const result = asRpcResult(data);
  if (!result.success) throw new Error(result.error || 'Failed to cancel');
  return result;
}

export async function fetchPriceChangeBatches(companyId: string): Promise<CompanyPriceChangeBatch[]> {
  const { data, error } = await supabase
    .from('company_price_change_batches')
    .select('*, company_price_change_agreements(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as Array<CompanyPriceChangeBatch & {
    company_price_change_agreements?: CompanyPriceChangeAgreement[];
  }>).map((row) => {
    const { company_price_change_agreements, ...batch } = row;
    return {
      ...batch,
      agreements: company_price_change_agreements ?? [],
    };
  });
}

export async function fetchPriceChangeBatchDetail(
  batchId: string
): Promise<CompanyPriceChangeBatch | null> {
  const { data: batch, error } = await supabase
    .from('company_price_change_batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) return null;

  const [{ data: items, error: itemsError }, { data: agreements, error: agrError }] =
    await Promise.all([
      supabase
        .from('company_price_change_items')
        .select('*')
        .eq('batch_id', batchId)
        .order('brand_name')
        .order('variant_name'),
      supabase
        .from('company_price_change_agreements')
        .select('*')
        .eq('batch_id', batchId)
        .order('profile_role')
        .order('profile_name'),
    ]);
  if (itemsError) throw itemsError;
  if (agrError) throw agrError;

  return {
    ...(batch as CompanyPriceChangeBatch),
    items: (items ?? []) as CompanyPriceChangeItem[],
    agreements: (agreements ?? []) as CompanyPriceChangeAgreement[],
  };
}

export async function fetchMyPendingPriceAgreements(
  companyId: string,
  profileId: string
): Promise<CompanyPriceChangeBatch[]> {
  const { data: agrRows, error: agrError } = await supabase
    .from('company_price_change_agreements')
    .select('batch_id')
    .eq('company_id', companyId)
    .eq('profile_id', profileId)
    .eq('status', 'pending');
  if (agrError) throw agrError;

  const batchIds = [...new Set((agrRows ?? []).map((r) => r.batch_id as string))];
  if (batchIds.length === 0) return [];

  const { data: batches, error } = await supabase
    .from('company_price_change_batches')
    .select('*')
    .in('id', batchIds)
    .eq('status', 'pending_agreement')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const details = await Promise.all(
    (batches ?? []).map(async (b) => {
      const detail = await fetchPriceChangeBatchDetail(b.id);
      return detail!;
    })
  );
  return details.filter(Boolean);
}

export function formatPriceAmount(val: number): string {
  return `₱${Number(val ?? 0).toFixed(2)}`;
}

export function formatPriceChange(oldVal: number, newVal: number): string {
  return `${formatPriceAmount(oldVal)} → ${formatPriceAmount(newVal)}`;
}

/** Item was covered by this user's last confirm (updated_at <= last_confirmed_at). */
export function isPriceItemAlreadyConfirmed(
  item: CompanyPriceChangeItem,
  myAgreement: CompanyPriceChangeAgreement | null | undefined
): boolean {
  if (!myAgreement?.last_confirmed_at) return false;
  const itemAt = item.updated_at || item.created_at;
  return new Date(itemAt).getTime() <= new Date(myAgreement.last_confirmed_at).getTime();
}

/** Batches that touched this brand, newest first, with brand-only items. */
export async function fetchBrandPriceHistory(
  companyId: string,
  brandId: string
): Promise<CompanyPriceChangeBatch[]> {
  const { data: brandItems, error: itemsError } = await supabase
    .from('company_price_change_items')
    .select('*')
    .eq('company_id', companyId)
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });
  if (itemsError) throw itemsError;

  const items = (brandItems ?? []) as CompanyPriceChangeItem[];
  if (items.length === 0) return [];

  const batchIds = [...new Set(items.map((i) => i.batch_id))];
  const { data: batches, error } = await supabase
    .from('company_price_change_batches')
    .select('*')
    .in('id', batchIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const itemsByBatch = new Map<string, CompanyPriceChangeItem[]>();
  for (const item of items) {
    const list = itemsByBatch.get(item.batch_id) ?? [];
    list.push(item);
    itemsByBatch.set(item.batch_id, list);
  }

  return ((batches ?? []) as CompanyPriceChangeBatch[]).map((batch) => ({
    ...batch,
    items: (itemsByBatch.get(batch.id) ?? []).sort((a, b) =>
      a.variant_name.localeCompare(b.variant_name)
    ),
  }));
}

export function agreementProgress(agreements: CompanyPriceChangeAgreement[] | undefined): {
  confirmed: number;
  pending: number;
  total: number;
  tlConfirmed: number;
  tlTotal: number;
  msConfirmed: number;
  msTotal: number;
  label: string;
} {
  const active = (agreements ?? []).filter((a) => a.status !== 'revoked');
  const confirmed = active.filter((a) => a.status === 'confirmed').length;
  const pending = active.filter((a) => a.status === 'pending').length;
  const tl = active.filter((a) => a.profile_role === 'team_leader');
  const ms = active.filter((a) => a.profile_role === 'mobile_sales');
  const tlConfirmed = tl.filter((a) => a.status === 'confirmed').length;
  const msConfirmed = ms.filter((a) => a.status === 'confirmed').length;
  return {
    confirmed,
    pending,
    total: active.length,
    tlConfirmed,
    tlTotal: tl.length,
    msConfirmed,
    msTotal: ms.length,
    label: `Confirmed ${confirmed} / ${active.length} (${tlConfirmed} TL · ${msConfirmed} MS)`,
  };
}

/** Super Admin / Admin: everyone. TL: self + leader_teams reports. MS: self only. */
export function filterVisiblePriceAgreements(
  agreements: CompanyPriceChangeAgreement[] | undefined,
  opts: {
    role: string | undefined;
    profileId: string | undefined;
    /** agent_ids from leader_teams where leader_id = this TL */
    teamReportIds?: string[];
  }
): CompanyPriceChangeAgreement[] {
  const list = agreements ?? [];
  const { role, profileId, teamReportIds = [] } = opts;
  if (!profileId) return [];

  if (role === 'super_admin' || role === 'admin') {
    return list;
  }

  if (role === 'team_leader') {
    const allowed = new Set<string>([profileId, ...teamReportIds]);
    return list.filter((a) => allowed.has(a.profile_id));
  }

  if (role === 'mobile_sales') {
    return list.filter((a) => a.profile_id === profileId);
  }

  // Other roles: do not expose field confirm roster
  return [];
}

export async function fetchLeaderTeamReportIds(
  companyId: string,
  leaderId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('leader_teams')
    .select('agent_id')
    .eq('company_id', companyId)
    .eq('leader_id', leaderId);
  if (error) throw error;
  return (data ?? []).map((r) => r.agent_id as string).filter(Boolean);
}

/** agent_id → team leader full name (from leader_teams). */
export async function fetchAgentToLeaderNameMap(
  companyId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('leader_teams')
    .select('agent_id, leader_id')
    .eq('company_id', companyId);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return {};

  const leaderIds = [...new Set(rows.map((r) => r.leader_id as string).filter(Boolean))];
  const { data: leaders, error: leadersError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', leaderIds);
  if (leadersError) throw leadersError;

  const nameById = new Map(
    (leaders ?? []).map((p) => [p.id as string, (p.full_name as string) || '—'])
  );
  const map: Record<string, string> = {};
  for (const row of rows) {
    const agentId = row.agent_id as string;
    const leaderName = nameById.get(row.leader_id as string);
    if (agentId && leaderName) map[agentId] = leaderName;
  }
  return map;
}

export function priceAgreementRoleLabel(
  agreement: CompanyPriceChangeAgreement,
  leaderNameByAgentId: Record<string, string>
): string {
  if (agreement.profile_role === 'team_leader') {
    return 'Team Leader';
  }
  const leaderName = leaderNameByAgentId[agreement.profile_id];
  if (leaderName) {
    return `Mobile Sales under ${leaderName}`;
  }
  return 'Mobile Sales';
}
