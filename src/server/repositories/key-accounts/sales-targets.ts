import { HttpError } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import { fetchAllPaginated } from '../../../lib/supabasePaginate';
import {
  chunkIds,
  firstRelation,
  isKaCommercialProductOrder,
} from './analytics/shared';

export type UserContext = {
  userId: string;
  companyId: string;
  role: string;
};

export type KASalesTargetAssigneeRole = 'sales_director' | 'key_account_manager';

export type KASalesTargetAssignee = {
  id: string;
  fullName: string;
  role: KASalesTargetAssigneeRole;
  directorId: string | null;
  directorName: string | null;
};

export type KASalesTargetRow = {
  id: string;
  assigneeId: string;
  targetMonth: string;
  targetRevenue: number;
};

export type KASalesTargetActual = {
  assigneeId: string;
  month: string;
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
};

export type KASalesTargetPo = {
  id: string;
  poNumber: string;
  poDate: string;
  clientName: string;
  shopName: string;
  balance: number;
  total: number;
};

export type KASalesTargetUpsertPayload = {
  assigneeId: string;
  targetMonth: string;
  targetRevenue: number;
};

const ASSIGNEE_ROLES: KASalesTargetAssigneeRole[] = [
  'sales_director',
  'key_account_manager',
];

const WRITE_ROLES = ['sales_head', 'sales_admin'];

type PoRow = {
  id: string;
  po_number: string | null;
  order_date: string;
  total_amount: number | null;
  kam_id: string | null;
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  key_account_payment_mode?: string | null;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  shop?: { shop_name: string | null } | { shop_name: string | null }[] | null;
};

const MONTH_RE = /^\d{4}-\d{2}$/;

export function parseYearMonth(raw?: string | null): string | null {
  const value = String(raw || '').trim();
  if (!MONTH_RE.test(value)) return null;
  return value;
}

export function monthStartDate(yearMonth: string): string {
  return `${yearMonth}-01`;
}

export function monthEndDate(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(last).padStart(2, '0')}`;
}

function toYearMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const slice = String(value).slice(0, 7);
  return MONTH_RE.test(slice) ? slice : null;
}

function assertCanWrite(ctx: UserContext) {
  if (!WRITE_ROLES.includes(ctx.role)) {
    throw new HttpError(403, 'Only Sales Head or Sales Admin can set sales targets');
  }
}

function emptyActual(assigneeId: string, month: string): KASalesTargetActual {
  return {
    assigneeId,
    month,
    actualRevenue: 0,
    actualOrders: 0,
    actualQty: 0,
  };
}

function addActual(into: KASalesTargetActual, add: Omit<KASalesTargetActual, 'assigneeId' | 'month'>) {
  into.actualRevenue += add.actualRevenue;
  into.actualOrders += add.actualOrders;
  into.actualQty += add.actualQty;
}

async function listScopedAssignees(ctx: UserContext): Promise<KASalesTargetAssignee[]> {
  const sb = getSupabaseAdmin();

  const { data: profiles, error: profileError } = await sb
    .from('profiles')
    .select('id, full_name, role, status')
    .eq('company_id', ctx.companyId)
    .in('role', ASSIGNEE_ROLES)
    .eq('status', 'active')
    .order('full_name', { ascending: true });
  if (profileError) throw profileError;

  const profileIds = (profiles || []).map((row) => row.id).filter(Boolean);
  const { data: assignments, error: assignError } = profileIds.length
    ? await sb
        .from('kam_director_assignments')
        .select(
          'director_id, kam_id, director:profiles!kam_director_assignments_director_id_fkey(id, full_name)'
        )
        .in('kam_id', profileIds)
    : { data: [], error: null };
  if (assignError) throw assignError;

  const directorByKam = new Map<string, { id: string; name: string }>();
  for (const row of assignments || []) {
    const kamId = typeof row.kam_id === 'string' ? row.kam_id : '';
    if (!kamId || directorByKam.has(kamId)) continue;
    const director = firstRelation(row.director as { id?: string; full_name?: string | null } | null);
    directorByKam.set(kamId, {
      id: director?.id || (typeof row.director_id === 'string' ? row.director_id : ''),
      name: director?.full_name?.trim() || '',
    });
  }

  let people: KASalesTargetAssignee[] = (profiles || [])
    .filter((row): row is { id: string; full_name: string | null; role: KASalesTargetAssigneeRole; status: string | null } =>
      Boolean(row.id) && ASSIGNEE_ROLES.includes(row.role as KASalesTargetAssigneeRole)
    )
    .map((row) => {
      const director = row.role === 'key_account_manager' ? directorByKam.get(row.id) : undefined;
      return {
        id: row.id,
        fullName: row.full_name?.trim() || '—',
        role: row.role,
        directorId: director?.id || null,
        directorName: director?.name || null,
      };
    });

  if (ctx.role === 'sales_director') {
    const kamIds = new Set(
      people.filter((p) => p.role === 'key_account_manager' && p.directorId === ctx.userId).map((p) => p.id)
    );
    people = people.filter((p) => p.id === ctx.userId || kamIds.has(p.id));
  } else if (ctx.role === 'key_account_manager') {
    people = people.filter((p) => p.id === ctx.userId);
  }

  return people;
}

async function fetchCommercialPos(
  ctx: UserContext,
  startMonth: string,
  endMonth: string,
  kamIds: string[]
): Promise<PoRow[]> {
  if (kamIds.length === 0) return [];
  const sb = getSupabaseAdmin();
  const dateStart = monthStartDate(startMonth);
  const dateEnd = monthEndDate(endMonth);
  const rows: PoRow[] = [];

  for (const chunk of chunkIds(kamIds)) {
    const page = await fetchAllPaginated<PoRow>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_orders')
        .select(
          `
          id,
          po_number,
          order_date,
          total_amount,
          kam_id,
          status,
          workflow_status,
          po_order_kind,
          source_rebate_id,
          key_account_payment_mode,
          client:key_account_clients(client_name),
          shop:key_account_shops(shop_name)
        `
        )
        .eq('company_id', ctx.companyId)
        .eq('company_account_type', 'Key Accounts')
        .in('kam_id', chunk)
        .gte('order_date', dateStart)
        .lte('order_date', dateEnd)
        .order('order_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to);
      return { data: (data as PoRow[] | null) ?? null, error };
    });
    rows.push(...page);
  }

  return rows.filter((row) => isKaCommercialProductOrder(row));
}

async function qtyByPoId(poIds: string[]): Promise<Map<string, number>> {
  const qty = new Map<string, number>();
  if (poIds.length === 0) return qty;
  const sb = getSupabaseAdmin();

  for (const chunk of chunkIds(poIds)) {
    const rows = await fetchAllPaginated<{ purchase_order_id: string; quantity: number | null }>(
      async (from, to) => {
        const { data, error } = await sb
          .from('purchase_order_items')
          .select('purchase_order_id, quantity')
          .in('purchase_order_id', chunk)
          .range(from, to);
        return { data, error };
      }
    );
    for (const row of rows) {
      qty.set(row.purchase_order_id, (qty.get(row.purchase_order_id) || 0) + (Number(row.quantity) || 0));
    }
  }

  return qty;
}

async function appliedByPoId(poIds: string[]): Promise<Map<string, number>> {
  const applied = new Map<string, number>();
  if (poIds.length === 0) return applied;
  const sb = getSupabaseAdmin();

  for (const chunk of chunkIds(poIds)) {
    const rows = await fetchAllPaginated<{
      purchase_order_id: string;
      amount: number | null;
      settlement_discount: number | null;
    }>(async (from, to) => {
      const { data, error } = await sb
        .from('purchase_order_key_account_payments')
        .select('purchase_order_id, amount, settlement_discount')
        .in('purchase_order_id', chunk)
        .range(from, to);
      return { data, error };
    });
    for (const row of rows) {
      const add = (Number(row.amount) || 0) + (Number(row.settlement_discount) || 0);
      applied.set(row.purchase_order_id, (applied.get(row.purchase_order_id) || 0) + add);
    }
  }

  return applied;
}

function buildActuals(
  assignees: KASalesTargetAssignee[],
  months: string[],
  pos: PoRow[],
  qtyByPo: Map<string, number>
): KASalesTargetActual[] {
  const kamIds = new Set(assignees.filter((a) => a.role === 'key_account_manager').map((a) => a.id));
  const kamsByDirector = new Map<string, string[]>();
  for (const assignee of assignees) {
    if (assignee.role !== 'key_account_manager' || !assignee.directorId) continue;
    const list = kamsByDirector.get(assignee.directorId) || [];
    list.push(assignee.id);
    kamsByDirector.set(assignee.directorId, list);
  }

  const kamMonth = new Map<string, KASalesTargetActual>();
  const directorOwn = new Map<string, KASalesTargetActual>();

  for (const po of pos) {
    const month = toYearMonth(po.order_date);
    const kamId = po.kam_id;
    if (!month || !kamId) continue;
    const stats = {
      actualRevenue: Number(po.total_amount) || 0,
      actualOrders: 1,
      actualQty: qtyByPo.get(po.id) || 0,
    };
    if (kamIds.has(kamId)) {
      const key = `${kamId}:${month}`;
      const current = kamMonth.get(key) || emptyActual(kamId, month);
      addActual(current, stats);
      kamMonth.set(key, current);
    } else {
      const key = `${kamId}:${month}`;
      const current = directorOwn.get(key) || emptyActual(kamId, month);
      addActual(current, stats);
      directorOwn.set(key, current);
    }
  }

  const actuals: KASalesTargetActual[] = [];
  for (const assignee of assignees) {
    for (const month of months) {
      if (assignee.role === 'key_account_manager') {
        actuals.push(kamMonth.get(`${assignee.id}:${month}`) || emptyActual(assignee.id, month));
        continue;
      }

      const rolled = emptyActual(assignee.id, month);
      for (const kamId of kamsByDirector.get(assignee.id) || []) {
        const kamActual = kamMonth.get(`${kamId}:${month}`);
        if (kamActual) addActual(rolled, kamActual);
      }
      const own = directorOwn.get(`${assignee.id}:${month}`);
      if (own) addActual(rolled, own);
      actuals.push(rolled);
    }
  }

  return actuals;
}

function monthsInRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  const [startY, startM] = startMonth.split('-').map(Number);
  const [endY, endM] = endMonth.split('-').map(Number);
  const cursor = new Date(startY, startM - 1, 1);
  const last = new Date(endY, endM - 1, 1);
  while (cursor <= last && months.length < 24) {
    months.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export async function listKASalesTargets(
  ctx: UserContext,
  startMonth: string,
  endMonth: string
) {
  const assignees = await listScopedAssignees(ctx);
  const sb = getSupabaseAdmin();

  const { data: targetRows, error: targetError } = await sb
    .from('key_account_monthly_sales_targets')
    .select('id, assignee_id, target_month, target_revenue')
    .eq('company_id', ctx.companyId)
    .gte('target_month', monthStartDate(startMonth))
    .lte('target_month', monthStartDate(endMonth));
  if (targetError) throw targetError;

  const assigneeIds = new Set(assignees.map((a) => a.id));
  const targets: KASalesTargetRow[] = (targetRows || [])
    .filter((row) => assigneeIds.has(row.assignee_id))
    .map((row) => ({
      id: row.id,
      assigneeId: row.assignee_id,
      targetMonth: toYearMonth(row.target_month) || startMonth,
      targetRevenue: Number(row.target_revenue) || 0,
    }));

  const pos = await fetchCommercialPos(ctx, startMonth, endMonth, [...assigneeIds]);
  const qtyByPo = await qtyByPoId(pos.map((po) => po.id));
  const actuals = buildActuals(assignees, monthsInRange(startMonth, endMonth), pos, qtyByPo);

  return { assignees, targets, actuals };
}

export async function listKASalesTargetPos(
  ctx: UserContext,
  assigneeId: string,
  month: string
): Promise<{ purchaseOrders: KASalesTargetPo[] }> {
  const assignees = await listScopedAssignees(ctx);
  const assignee = assignees.find((a) => a.id === assigneeId);
  if (!assignee) throw new HttpError(404, 'Assignee not found');

  const kamIds =
    assignee.role === 'sales_director'
      ? [
          assignee.id,
          ...assignees
            .filter((a) => a.role === 'key_account_manager' && a.directorId === assignee.id)
            .map((a) => a.id),
        ]
      : [assignee.id];

  const pos = await fetchCommercialPos(ctx, month, month, kamIds);
  const applied = await appliedByPoId(pos.map((po) => po.id));

  const purchaseOrders: KASalesTargetPo[] = pos
    .map((po) => {
      const total = Number(po.total_amount) || 0;
      const paid = applied.get(po.id) || 0;
      const client = firstRelation(po.client);
      const shop = firstRelation(po.shop);
      return {
        id: po.id,
        poNumber: po.po_number || po.id,
        poDate: po.order_date,
        clientName: client?.client_name?.trim() || '—',
        shopName: shop?.shop_name?.trim() || '—',
        balance: Math.max(0, Math.round((total - paid) * 100) / 100),
        total,
      };
    })
    .sort((a, b) => b.poDate.localeCompare(a.poDate));

  return { purchaseOrders };
}

export async function upsertKASalesTarget(ctx: UserContext, input: KASalesTargetUpsertPayload) {
  assertCanWrite(ctx);

  const assigneeId = String(input.assigneeId || '').trim();
  const targetMonth = parseYearMonth(input.targetMonth);
  const targetRevenue = Number(input.targetRevenue);
  if (!assigneeId) throw new HttpError(400, 'assigneeId is required');
  if (!targetMonth) throw new HttpError(400, 'targetMonth must be YYYY-MM');
  if (!Number.isFinite(targetRevenue) || targetRevenue < 0) {
    throw new HttpError(400, 'targetRevenue must be a number of 0 or more');
  }

  const sb = getSupabaseAdmin();
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('id, company_id, role, status')
    .eq('id', assigneeId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new HttpError(404, 'Assignee not found');
  if (!ASSIGNEE_ROLES.includes(profile.role as KASalesTargetAssigneeRole)) {
    throw new HttpError(400, 'Targets can only be set for Sales Directors and KAMs');
  }
  if (profile.status && profile.status !== 'active') {
    throw new HttpError(400, 'Cannot set a target for an inactive user');
  }

  const monthDate = monthStartDate(targetMonth);
  const { data: existing, error: existingError } = await sb
    .from('key_account_monthly_sales_targets')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('assignee_id', assigneeId)
    .eq('target_month', monthDate)
    .maybeSingle();
  if (existingError) throw existingError;

  const payload = {
    company_id: ctx.companyId,
    assignee_id: assigneeId,
    assignee_role: profile.role as KASalesTargetAssigneeRole,
    target_month: monthDate,
    target_revenue: Math.round(targetRevenue * 100) / 100,
    updated_by: ctx.userId,
  };

  const query = existing?.id
    ? sb
        .from('key_account_monthly_sales_targets')
        .update(payload)
        .eq('id', existing.id)
        .eq('company_id', ctx.companyId)
        .select('id, assignee_id, target_month, target_revenue')
        .single()
    : sb
        .from('key_account_monthly_sales_targets')
        .insert({ ...payload, created_by: ctx.userId })
        .select('id, assignee_id, target_month, target_revenue')
        .single();

  const { data, error } = await query;
  if (error) throw error;

  return {
    target: {
      id: data.id,
      assigneeId: data.assignee_id,
      targetMonth: toYearMonth(data.target_month) || targetMonth,
      targetRevenue: Number(data.target_revenue) || 0,
    } satisfies KASalesTargetRow,
  };
}

export async function deleteKASalesTarget(
  ctx: UserContext,
  assigneeIdRaw: string,
  targetMonthRaw: string
) {
  assertCanWrite(ctx);

  const assigneeId = String(assigneeIdRaw || '').trim();
  const targetMonth = parseYearMonth(targetMonthRaw);
  if (!assigneeId) throw new HttpError(400, 'assigneeId is required');
  if (!targetMonth) throw new HttpError(400, 'targetMonth must be YYYY-MM');

  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from('key_account_monthly_sales_targets')
    .delete()
    .eq('company_id', ctx.companyId)
    .eq('assignee_id', assigneeId)
    .eq('target_month', monthStartDate(targetMonth));
  if (error) throw error;

  return { ok: true as const, assigneeId, targetMonth };
}
