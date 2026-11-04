import { HttpError } from '../http/errors';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { requireAuthUser } from './requireAuthUser';

const MOTO_SALES_ROLES = ['team_leader', 'admin', 'super_admin', 'system_administrator'];
const ADMIN_ROLES = ['admin', 'super_admin', 'system_administrator'];

export type MotoSalesContext = {
  userId: string;
  companyId: string;
  role: string;
  accessToken: string;
};

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

/**
 * Auth + company for `/api/motosales/*`.
 * A system administrator viewing a company passes that company id. Everyone else
 * is locked to the company on their profile.
 */
export async function requireMotoSalesContext(
  authorization?: string,
  requestedCompanyId?: string | null
): Promise<MotoSalesContext> {
  const user = await requireAuthUser(authorization);
  const accessToken = accessTokenFromAuthorization(authorization);
  if (!accessToken) throw new HttpError(401, 'Missing access token');

  const admin = getSupabaseAdmin();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('company_id, role, status')
    .eq('id', user.id)
    .single();

  if (error || !profile) throw new HttpError(403, 'Could not resolve user profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');
  if (!MOTO_SALES_ROLES.includes(profile.role)) {
    throw new HttpError(403, 'You do not have access to moto sales APIs');
  }

  const profileCompanyId = (profile.company_id as string | null) || null;
  const requested = requestedCompanyId?.trim() || null;
  let companyId = profileCompanyId;

  if (profile.role === 'system_administrator') {
    companyId = requested || profileCompanyId;
    if (!companyId) throw new HttpError(403, 'Select a company to view stock transfers');
    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (!company) throw new HttpError(403, 'Company not found');
  } else if (!profileCompanyId) {
    throw new HttpError(403, 'User has no company assigned');
  } else if (requested && requested !== profileCompanyId) {
    throw new HttpError(403, 'Company does not match your account');
  }

  return {
    userId: user.id,
    companyId: companyId as string,
    role: profile.role as string,
    accessToken,
  };
}

export function assertMotoSalesAdmin(ctx: MotoSalesContext) {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    throw new HttpError(403, 'Requires an admin role');
  }
}
