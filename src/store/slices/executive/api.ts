import { supabase } from "@/lib/supabase";

export async function executiveFetch<T>(
  path: string,
  params?: Record<string, string | undefined>
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  const res = await fetch(`/api/executive/${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `Failed to load ${path}`);
  }
  return body as T;
}

export function dateCompanyParams(args: {
  companyIds: string[];
  from?: string;
  to?: string;
  limit?: number;
  brandId?: string | null;
}) {
  return {
    companyIds: args.companyIds.length ? args.companyIds.join(",") : undefined,
    from: args.from,
    to: args.to,
    limit: args.limit != null ? String(args.limit) : undefined,
    brandId: args.brandId || undefined,
  };
}
