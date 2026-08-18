import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { listKAUsers } from '../../repositories/key-accounts/user-management';
import type { ApiResult } from '../executive/executiveController';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

type QueryMap = Record<string, string | string[] | undefined>;

async function resolveCompanyId(userId: string): Promise<string> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');

  const allowedRoles = ['sales_head', 'sales_admin'];
  if (!allowedRoles.includes(data.role)) {
    throw new HttpError(403, 'Only Sales Head or Sales Admin can access Key Account User Management');
  }

  return data.company_id;
}

export async function getKAUsers(
  authorization?: string,
  _query: QueryMap = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const companyId = await resolveCompanyId(user.id);
    return { status: 200, body: await listKAUsers(user.id, companyId) };
  } catch (error) {
    return toErrorResult(error);
  }
}
