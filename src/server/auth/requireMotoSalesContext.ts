import { HttpError } from '../http/errors';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { requireAuthUser } from './requireAuthUser';

const CREATE_ROLES = ['mobile_sales', 'sales_agent', 'team_leader'] as const;
const VIEW_ROLES = [
  'mobile_sales',
  'sales_agent',
  'team_leader',
  'super_admin',
  'admin',
  'finance',
] as const;
const TL_TRANSFER_ROLES = ['team_leader', 'admin', 'super_admin', 'system_administrator'];
const ADMIN_ROLES = ['admin', 'super_admin', 'system_administrator'];

export type MotoSalesContext = {
  userId: string;
  companyId: string;
  role: string;
  fullName: string | null;
  accessToken: string;
};

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

export type RequireMotoSalesOptions = {
  /** Roles allowed for this endpoint. Defaults to view roles. */
  allowedRoles?: readonly string[];
  /**
   * Company a system administrator is viewing. Everyone else is locked to
   * the company on their profile.
   */
  companyId?: string | null;
};

function isOptions(
  value: RequireMotoSalesOptions | string | null | undefined
): value is RequireMotoSalesOptions {
  return typeof value === 'object' && value !== null;
}

/**
 * Auth + profile for `/api/moto-sales/*` and `/api/motosales/*`.
 *
 * Standard account flows pass an options object (or nothing) and stay on the
 * company stored on the profile.
 *
 * TL stock transfers pass a company id. A system administrator may view that
 * company; everyone else is locked to the company on their profile.
 */
export async function requireMotoSalesContext(
  authorization?: string,
  optionsOrCompanyId?: RequireMotoSalesOptions | string | null
): Promise<MotoSalesContext> {
  const user = await requireAuthUser(authorization);
  const accessToken = accessTokenFromAuthorization(authorization);
  if (!accessToken) throw new HttpError(401, 'Missing access token');

  const companyScoped = typeof optionsOrCompanyId === 'string' || optionsOrCompanyId === null;
  const options = isOptions(optionsOrCompanyId) ? optionsOrCompanyId : undefined;
  const requestedCompanyId = companyScoped ? optionsOrCompanyId : options?.companyId;

  const sb = getSupabaseAdmin();
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('company_id, role, status, full_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) throw new HttpError(403, 'Could not resolve user profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');

  const allowedRoles: readonly string[] = options?.allowedRoles?.length
    ? options.allowedRoles
    : companyScoped
      ? TL_TRANSFER_ROLES
      : VIEW_ROLES;
  if (!allowedRoles.includes(profile.role)) {
    throw new HttpError(403, 'You do not have access to moto-sales APIs');
  }

  const profileCompanyId = (profile.company_id as string | null) || null;
  const requested = requestedCompanyId?.trim() || null;
  let companyId = profileCompanyId;

  if (profile.role === 'system_administrator') {
    companyId = requested || profileCompanyId;
    if (!companyId) throw new HttpError(403, 'Select a company to view stock transfers');
    const { data: company, error: companyError } = await sb
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
    fullName: (profile.full_name as string | null) ?? null,
    accessToken,
  };
}

export function requireMotoSalesCreateRoles(ctx: MotoSalesContext) {
  if (!(CREATE_ROLES as readonly string[]).includes(ctx.role)) {
    throw new HttpError(403, 'Only mobile sales or team leaders can file a client return');
  }
}

export function assertMotoSalesAdmin(ctx: MotoSalesContext) {
  if (!ADMIN_ROLES.includes(ctx.role)) {
    throw new HttpError(403, 'Requires an admin role');
  }
}

export { CREATE_ROLES as MOTO_SALES_CREATE_ROLES, VIEW_ROLES as MOTO_SALES_VIEW_ROLES };
