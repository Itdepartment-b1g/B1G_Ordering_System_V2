import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../http/errors';

const globalForAdmin = globalThis as unknown as {
  supabaseAdmin?: SupabaseClient;
};

export function getSupabaseAdmin(): SupabaseClient {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    throw new HttpError(
      500,
      'DATABASE_URL is missing and SUPABASE_SERVICE_ROLE_KEY is not configured.'
    );
  }

  if (!globalForAdmin.supabaseAdmin) {
    globalForAdmin.supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return globalForAdmin.supabaseAdmin;
}

/** Anon-key client with the caller's JWT so Postgres auth.uid() is set. */
export function getSupabaseUser(accessToken: string): SupabaseClient {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!url || !anonKey) {
    throw new HttpError(500, 'Supabase auth is not configured on the server');
  }
  if (!accessToken) {
    throw new HttpError(401, 'Missing access token');
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
