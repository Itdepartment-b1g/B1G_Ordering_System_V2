import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../db/supabaseAdmin';

export type AuthUser = {
  id: string;
  email: string | null;
};

function getSupabasePublicConfig() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new HttpError(500, 'Supabase auth is not configured on the server');
  }

  return { url, anonKey };
}

export async function requireAuthUser(authorization?: string): Promise<AuthUser> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    throw new HttpError(401, 'Missing access token');
  }

  const { url, anonKey } = getSupabasePublicConfig();
  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (!error && data.user) {
    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  }

  // The anon client can reject a still-valid session token. The service-role
  // client validates the same JWT against the project.
  try {
    const retry = await getSupabaseAdmin().auth.getUser(token);
    if (!retry.error && retry.data.user) {
      return {
        id: retry.data.user.id,
        email: retry.data.user.email ?? null,
      };
    }
  } catch {
    // Service role is unavailable; keep the original auth error.
  }

  // Auth getUser() rejects some access tokens that PostgREST still accepts.
  // The previous shortages page queried with that same token, so accept it when
  // the database can read this user's own profile.
  const fromDatabase = await userFromDatabaseToken(token);
  if (fromDatabase) return fromDatabase;

  throw new HttpError(401, 'Invalid or expired session');
}

function jwtSubject(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

async function userFromDatabaseToken(token: string): Promise<AuthUser | null> {
  const sub = jwtSubject(token);
  if (!sub) return null;
  try {
    const { data, error } = await getSupabaseUser(token)
      .from('profiles')
      .select('id')
      .eq('id', sub)
      .maybeSingle();
    if (error || !data?.id) return null;
    return { id: data.id, email: null };
  } catch {
    return null;
  }
}
