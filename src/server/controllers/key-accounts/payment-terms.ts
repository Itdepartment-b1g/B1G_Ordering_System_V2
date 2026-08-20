import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { firstString } from '../../http/queryParams';
import {
  createKAPaymentTermOption,
  deleteKAPaymentTermOption,
  listKAPaymentTermOptions,
  updateKAPaymentTermOption,
  type KAPaymentTermCreatePayload,
  type KAPaymentTermUpdatePayload,
} from '../../repositories/key-accounts/payment-terms';
import type { ApiResult } from '../executive/executiveController';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

type QueryMap = Record<string, string | string[] | undefined>;

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

export async function getKAPaymentTermsHandler(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const activeOnly = firstString(query.activeOnly) === 'true';
    return { status: 200, body: await listKAPaymentTermOptions(ctx, activeOnly) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function createKAPaymentTermHandler(
  authorization?: string,
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const payload = (body || {}) as KAPaymentTermCreatePayload;
    return { status: 201, body: await createKAPaymentTermOption(ctx, payload) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function updateKAPaymentTermHandler(
  authorization?: string,
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const payload = (body || {}) as KAPaymentTermUpdatePayload;
    if (!payload.id) throw new HttpError(400, 'id is required');
    return { status: 200, body: await updateKAPaymentTermOption(ctx, payload) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function deleteKAPaymentTermHandler(
  authorization?: string,
  query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id);
    const id = firstString(query.id);
    if (!id) throw new HttpError(400, 'id is required');
    return { status: 200, body: await deleteKAPaymentTermOption(ctx, id) };
  } catch (error) {
    return toErrorResult(error);
  }
}
