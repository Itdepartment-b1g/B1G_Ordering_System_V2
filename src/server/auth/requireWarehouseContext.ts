import { HttpError } from '../http/errors';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { requireAuthUser } from './requireAuthUser';

export type WarehouseMembershipStatus = 'main' | 'sub' | 'unlinked';

export type WarehouseContext = {
  userId: string;
  companyId: string;
  role: string;
  status: WarehouseMembershipStatus;
  isMain: boolean;
  locationId: string | null;
  accessToken: string;
};

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

export type RequireWarehouseOptions = {
  /** Roles allowed beyond `warehouse`. Empty = warehouse only. */
  allowedRoles?: string[];
  /** When true, require main-warehouse membership (or unlinked treated as main). */
  requireMain?: boolean;
};

/**
 * Auth + profile + warehouse location membership for `/api/warehouse/*`.
 * Unlinked warehouse users are treated as main (same fail-safe as the client hook).
 */
export async function requireWarehouseContext(
  authorization?: string,
  options?: RequireWarehouseOptions
): Promise<WarehouseContext> {
  const user = await requireAuthUser(authorization);
  const accessToken = accessTokenFromAuthorization(authorization);
  if (!accessToken) throw new HttpError(401, 'Missing access token');

  const sb = getSupabaseAdmin();
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('company_id, role, status')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) throw new HttpError(403, 'Could not resolve user profile');
  if (profile.status !== 'active') throw new HttpError(403, 'Account is not active');
  if (!profile.company_id) throw new HttpError(403, 'User has no company assigned');

  const allowedRoles = options?.allowedRoles?.length
    ? options.allowedRoles
    : ['warehouse'];
  if (!allowedRoles.includes(profile.role)) {
    throw new HttpError(403, 'You do not have access to warehouse APIs');
  }

  const { data: linkRow, error: linkError } = await sb
    .from('warehouse_location_users')
    .select('location_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (linkError) throw linkError;

  let status: WarehouseMembershipStatus = 'unlinked';
  let isMain = true;
  let locationId: string | null = null;

  if (linkRow?.location_id) {
    locationId = linkRow.location_id as string;
    const { data: locRow, error: locError } = await sb
      .from('warehouse_locations')
      .select('is_main')
      .eq('id', locationId)
      .maybeSingle();
    if (locError) throw locError;
    isMain = !!locRow?.is_main;
    status = isMain ? 'main' : 'sub';
  }

  if (options?.requireMain && !isMain) {
    throw new HttpError(403, 'Only main warehouse users can perform this action');
  }

  return {
    userId: user.id,
    companyId: profile.company_id,
    role: profile.role,
    status,
    isMain,
    locationId,
    accessToken,
  };
}
