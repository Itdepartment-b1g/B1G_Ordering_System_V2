export function firstString(raw?: string | string[]): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw || undefined;
}

export function parseCompanyIds(raw?: string | string[]): string[] | undefined {
  const value = Array.isArray(raw) ? raw.join(',') : raw;
  if (!value) return undefined;
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

export function parsePositiveInt(raw?: string | string[], fallback = 10): number {
  const n = Number(firstString(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}
