import { getSupabaseAdmin } from '../../../db/supabaseAdmin';

export type KAAnalyticsUserContext = {
  userId: string;
  companyId: string;
  role: string;
};

export const KA_ANALYTICS_PENDING_WORKFLOWS = [
  'owner_pending',
  'kam_pending',
  'admin_pending',
  'director_pending',
  'warehouse_reserved',
] as const;

export function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isCancelledOrRejected(order: {
  status?: string | null;
  workflow_status?: string | null;
}) {
  const status = String(order.status || '').toLowerCase();
  const workflow = String(order.workflow_status || '').toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'rejected' ||
    workflow === 'cancelled' ||
    workflow === 'rejected'
  );
}

export function isRebateDerivedPo(order: {
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
}) {
  const kind = String(order.po_order_kind || '');
  if (kind === 'rebate_fulfillment' || kind === 'rebate_topup') return true;
  return !!order.source_rebate_id;
}

export function isConsignmentPo(order: { po_order_kind?: string | null }) {
  return String(order.po_order_kind || '').trim().toLowerCase() === 'consignment';
}

export function hasAnalyticsWorkflow(workflowStatus?: string | null) {
  const ws = String(workflowStatus || '');
  if (ws === 'delivered' || ws === 'fulfilled' || ws === 'partial_delivered') return true;
  return (KA_ANALYTICS_PENDING_WORKFLOWS as readonly string[]).includes(ws);
}

/** Same gate as dashboard Revenue Overview / product analytics commercial POs. */
export function isKaAnalyticsSalesOrder(order: {
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  total_amount?: number | null;
}) {
  if (isCancelledOrRejected(order)) return false;
  if (!hasAnalyticsWorkflow(order.workflow_status)) return false;
  if (isRebateDerivedPo(order) && (Number(order.total_amount) || 0) <= 0) return false;
  return true;
}

/** Commercial product-analytics POs (excludes rebate-derived). */
export function isKaCommercialProductOrder(order: {
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  total_amount?: number | null;
}) {
  return isKaAnalyticsSalesOrder(order) && !isRebateDerivedPo(order);
}

export function isPartialDeliveredPo(order: { workflow_status?: string | null }) {
  return order.workflow_status === 'partial_delivered';
}

export async function resolveHubCompanyId(companyId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('warehouse_company_assignments')
    .select('warehouse_user_id')
    .eq('client_company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.warehouse_user_id) return null;

  const { data: warehouseProfile, error: profileErr } = await sb
    .from('profiles')
    .select('company_id')
    .eq('id', data.warehouse_user_id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  return warehouseProfile?.company_id ?? null;
}

export function parseRangeBound(raw?: string | null): Date | null {
  if (!raw || !String(raw).trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inclusive range, calendar-day style (matches client isDateInRange). */
export function inDateRange(value: string | null | undefined, start: Date | null, end: Date | null) {
  if (!start && !end) return true;
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(12, 0, 0, 0);
  if (start) {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    if (d < s) return false;
  }
  if (end) {
    const e = new Date(end);
    e.setHours(23, 59, 59, 999);
    if (d > e) return false;
  }
  return true;
}

export function chunkIds(ids: string[], size = 100) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

export function paymentStatus(paid: number, discount: number, remaining: number) {
  if (remaining <= 0.001) return 'paid' as const;
  if (paid + discount > 0.001) return 'partial' as const;
  return 'unpaid' as const;
}
