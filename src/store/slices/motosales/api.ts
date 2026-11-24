import { supabase } from '@/lib/supabase';

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token) throw new Error('Not authenticated');

  const expiresAt = session.expires_at ?? 0;
  const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
  if (secondsLeft < 60 && session.refresh_token) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session?.access_token) return refreshed.data.session.access_token;
  }
  return session.access_token;
}

export async function motoSalesRequest<T>(
  path: string,
  options?: {
    method?: string;
    params?: Record<string, string | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options?.params || {})) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  const url = `/api/motosales/${path}${qs ? `?${qs}` : ''}`;

  const send = async (token: string) => {
    const res = await fetch(url, {
      method: options?.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  };

  const token = await accessToken();
  const { res, body } = await send(token);
  if (!res.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Failed to load ${path}`);
  }
  return body as T;
}
