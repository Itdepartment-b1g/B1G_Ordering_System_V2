import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../http/errors';

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
  if (error || !data.user) {
    throw new HttpError(401, 'Invalid or expired session');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
