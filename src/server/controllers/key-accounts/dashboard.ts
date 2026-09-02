import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import {
  getKADashboardOverview,
  getKADashboardPurchaseBreakdown,
  getKADashboardTabs,
} from '../../repositories/key-accounts/dashboard';
import type { ApiResult } from '../executive/executiveController';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

type QueryMap = Record<string, string | string[] | undefined>;

const VIEW_ROLES = ['sales_head', 'sales_admin', 'sales_director', 'key_account_manager'];

function parseYear(raw?: string) {
  const year = Number(raw);
  if (Number.isFinite(year) && year >= 2000 && year <= 2100) return Math.floor(year);
  return new Date().getFullYear();
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
    throw new HttpError(403, 'You do not have access to the Key Account dashboard');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
  };
}

export async function getKADashboardHandler(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const resource = firstString(query.resource) || 'overview';
    const year = parseYear(firstString(query.year));
    const dateStart = firstString(query.dateStart) || null;
    const dateEnd = firstString(query.dateEnd) || null;

    switch (resource) {
      case 'overview':
        return { status: 200, body: await getKADashboardOverview(ctx, year) };
      case 'tabs':
        return { status: 200, body: await getKADashboardTabs(ctx, dateStart, dateEnd) };
      case 'purchase-breakdown':
        return {
          status: 200,
          body: await getKADashboardPurchaseBreakdown(ctx, dateStart, dateEnd),
        };
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  } catch (error) {
    return toErrorResult(error);
  }
}
