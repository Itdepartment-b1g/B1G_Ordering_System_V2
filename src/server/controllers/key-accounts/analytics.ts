import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  getKAAnalyticsDataset,
  getKAAnalyticsPoPaymentHistory,
  getKAAnalyticsRebateSource,
  getKAFsnCatalog,
  getKAFsnSetup,
  getKAProductPaidByBrand,
} from '../../repositories/key-accounts/analytics';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

const VIEW_ROLES = [
  'sales_head',
  'sales_admin',
  'sales_director',
  'key_account_manager',
  'key_account_accounting',
];

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

async function resolveUserContext(userId: string, accessToken?: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');
  if (!VIEW_ROLES.includes(data.role)) {
    throw new HttpError(403, 'You do not have access to Key Account analytics');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
    accessToken,
  };
}

export async function getKAAnalyticsHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const query = req.query || {};
    const resource = firstString(query.resource) || 'product-paid-by-brand';
    const dateStart = firstString(query.dateStart) || null;
    const dateEnd = firstString(query.dateEnd) || null;

    switch (resource) {
      case 'dataset':
        return { status: 200, body: await getKAAnalyticsDataset(ctx) };
      case 'product-paid-by-brand':
        return {
          status: 200,
          body: await getKAProductPaidByBrand(
            ctx,
            dateStart,
            dateEnd,
            firstString(query.clientId) || null
          ),
        };
      case 'fsn-setup':
        return { status: 200, body: await getKAFsnSetup(ctx) };
      case 'fsn-catalog': {
        const locationId = firstString(query.locationId) || '';
        return { status: 200, body: await getKAFsnCatalog(ctx, locationId) };
      }
      case 'po-payment-history': {
        const poId = firstString(query.poId) || '';
        if (!poId) throw new HttpError(400, 'poId is required');
        return { status: 200, body: await getKAAnalyticsPoPaymentHistory(ctx, poId) };
      }
      case 'rebate-source': {
        const rebateId = firstString(query.rebateId) || '';
        if (!rebateId) throw new HttpError(400, 'rebateId is required');
        return { status: 200, body: await getKAAnalyticsRebateSource(ctx, rebateId) };
      }
      default:
        throw new HttpError(400, 'Unknown resource');
    }
  });
}
