import { HttpError } from '../http/errors';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { requireAuthUser } from './requireAuthUser';

export type MotoSalesContext = {
  userId: string;
  companyId: string;
  role: string;
  fullName: string | null;
  accessToken: string;
};

const CREATE_ROLES = ['mobile_sales', 'sales_agent', 'team_leader'] as const;
const VIEW_ROLES = [
  'mobile_sales',
  'sales_agent',
  'team_leader',
  'super_admin',
  'admin',
  'finance',
] as const;

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

export type RequireMotoSalesOptions = {
  /** Roles allowed for this endpoint. Defaults to view roles. */
  allowedRoles?: readonly string[];
};

/**
 * Auth + profile for `/api/moto-sales/*` (Standard Account / moto sales flows).
 */
export async function requireMotoSalesContext(
  authorization?: string,
  options?: RequireMotoSalesOptions
): Promise<MotoSalesContext> {
  const user = await requireAuthUser(authorization);
  const accessToken = accessTokenFromAuthorization(authorization);
  if (!accessToken) throw new HttpError(401, 'Missing access token');

  const sb = getSupabaseAdmin();
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('company_id, role, status, full_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) throw new HttpError(403, 'Could not resolve user profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');
  if (!profile.company_id) throw new HttpError(403, 'User has no company assigned');

  const allowedRoles = options?.allowedRoles?.length ? options.allowedRoles : VIEW_ROLES;
  if (!allowedRoles.includes(profile.role)) {
    throw new HttpError(403, 'You do not have access to moto-sales APIs');
  }

  return {
    userId: user.id,
    companyId: profile.company_id,
    role: profile.role,
    fullName: profile.full_name ?? null,
    accessToken,
  };
}

export function requireMotoSalesCreateRoles(ctx: MotoSalesContext) {
  if (!(CREATE_ROLES as readonly string[]).includes(ctx.role)) {
    throw new HttpError(403, 'Only mobile sales or team leaders can file a client return');
  }
}

export { CREATE_ROLES as MOTO_SALES_CREATE_ROLES, VIEW_ROLES as MOTO_SALES_VIEW_ROLES };
