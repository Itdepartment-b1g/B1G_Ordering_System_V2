import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { respond } from '../../http/respond';
import { listKAUsers } from '../../repositories/key-accounts/user-management';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';

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

export async function getKAUsers(req: any, res: any) {
  return respond(res, async () => {
    const user = await requireAuthUser(getAuthorizationHeader(req.headers || {}));
    const companyId = await resolveCompanyId(user.id);
    return { status: 200, body: await listKAUsers(user.id, companyId) };
  });
}
