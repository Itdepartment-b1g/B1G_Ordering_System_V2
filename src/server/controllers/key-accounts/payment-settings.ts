import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { respond } from '../../http/respond';
import {
  createKAPaymentSettings,
  getKAPaymentSettings,
  updateKAPaymentSettings,
  type KAPaymentSettingsUpdatePayload,
  type KAPaymentSettingsWritePayload,
} from '../../repositories/key-accounts/payment-settings';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

const VIEW_ROLES = [
  'sales_head',
  'sales_director',
  'sales_admin',
  'key_account_manager',
  'key_account_accounting',
];

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
    throw new HttpError(403, 'You do not have access to Key Account Payment Settings');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
  };
}

export async function getKAPaymentSettingsHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    return { status: 200, body: await getKAPaymentSettings(ctx) };
  });
}

export async function createKAPaymentSettingsHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const payload = (req.body || {}) as KAPaymentSettingsWritePayload;
    return { status: 201, body: await createKAPaymentSettings(ctx, payload) };
  });
}

export async function updateKAPaymentSettingsHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const payload = (req.body || {}) as KAPaymentSettingsUpdatePayload;
    if (!payload.id) throw new HttpError(400, 'id is required');
    return { status: 200, body: await updateKAPaymentSettings(ctx, payload) };
  });
}
