import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import { respond } from '../../http/respond';
import {
  createKAPaymentTermOption,
  deleteKAPaymentTermOption,
  listKAPaymentTermOptions,
  updateKAPaymentTermOption,
  type KAPaymentTermCreatePayload,
  type KAPaymentTermUpdatePayload,
} from '../../repositories/key-accounts/payment-terms';
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
    throw new HttpError(403, 'You do not have access to Key Account Payment Terms');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
  };
}

export async function getKAPaymentTermsHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const activeOnly = firstString((req.query || {}).activeOnly) === 'true';
    return { status: 200, body: await listKAPaymentTermOptions(ctx, activeOnly) };
  });
}

export async function createKAPaymentTermHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const payload = (req.body || {}) as KAPaymentTermCreatePayload;
    return { status: 201, body: await createKAPaymentTermOption(ctx, payload) };
  });
}

export async function updateKAPaymentTermHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const payload = (req.body || {}) as KAPaymentTermUpdatePayload;
    if (!payload.id) throw new HttpError(400, 'id is required');
    return { status: 200, body: await updateKAPaymentTermOption(ctx, payload) };
  });
}

export async function deleteKAPaymentTermHandler(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const ctx = await resolveUserContext(user.id);
    const id = firstString((req.query || {}).id);
    if (!id) throw new HttpError(400, 'id is required');
    return { status: 200, body: await deleteKAPaymentTermOption(ctx, id) };
  });
}
