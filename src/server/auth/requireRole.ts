import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { hasDatabaseUrl } from '../db/pool';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { profiles } from '../db/schema/executive';
import { HttpError } from '../http/errors';
import type { AuthUser } from './requireAuthUser';

export async function requireRole(user: AuthUser, role: string) {
  if (!hasDatabaseUrl()) {
    const { data: profile, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, role, status')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.status !== 'active') {
      throw new HttpError(403, 'Account is not active');
    }
    if (profile.role !== role) {
      throw new HttpError(403, `Requires ${role} role`);
    }
    return profile;
  }

  const [profile] = await getDb()
    .select({
      id: profiles.id,
      role: profiles.role,
      status: profiles.status,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.status !== 'active') {
    throw new HttpError(403, 'Account is not active');
  }

  if (profile.role !== role) {
    throw new HttpError(403, `Requires ${role} role`);
  }

  return profile;
}
