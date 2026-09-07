import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  getKADashboardOverview,
  getKADashboardPurchaseBreakdown,
  getKADashboardTabs,
} from '../../repositories/key-accounts/dashboard';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

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

export async function getKADashboardHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const query = req.query || {};
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
  });
}
