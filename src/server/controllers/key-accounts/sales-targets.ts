import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  deleteKASalesTarget,
  listKASalesTargetPos,
  listKASalesTargets,
  parseYearMonth,
  upsertKASalesTarget,
  type KASalesTargetUpsertPayload,
} from '../../repositories/key-accounts/sales-targets';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

const VIEW_ROLES = [
  'sales_head',
  'sales_admin',
  'sales_director',
  'key_account_manager',
];

function currentYearMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function resolveUserContext(userId: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');
  if (!VIEW_ROLES.includes(data.role)) {
    throw new HttpError(403, 'You do not have access to Key Account Sales Targets');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
  };
}

function monthRangeFromQuery(query: Record<string, string | string[] | undefined>) {
  const startMonth = parseYearMonth(firstString(query.startMonth)) || currentYearMonth();
  const endMonth = parseYearMonth(firstString(query.endMonth)) || startMonth;
  return startMonth <= endMonth
    ? { startMonth, endMonth }
    : { startMonth: endMonth, endMonth: startMonth };
}

export async function getKASalesTargetsHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const query = req.query || {};
    const resource = firstString(query.resource) || 'board';

    if (resource === 'pos') {
      const assigneeId = firstString(query.assigneeId) || '';
      const month = parseYearMonth(firstString(query.month));
      if (!assigneeId) throw new HttpError(400, 'assigneeId is required');
      if (!month) throw new HttpError(400, 'month must be YYYY-MM');
      return { status: 200, body: await listKASalesTargetPos(ctx, assigneeId, month) };
    }

    const { startMonth, endMonth } = monthRangeFromQuery(query);
    return { status: 200, body: await listKASalesTargets(ctx, startMonth, endMonth) };
  });
}

export async function upsertKASalesTargetHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const payload = (req.body || {}) as KASalesTargetUpsertPayload;
    return { status: 200, body: await upsertKASalesTarget(ctx, payload) };
  });
}

export async function deleteKASalesTargetHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const query = req.query || {};
    return {
      status: 200,
      body: await deleteKASalesTarget(
        ctx,
        firstString(query.assigneeId) || '',
        firstString(query.targetMonth) || ''
      ),
    };
  });
}
