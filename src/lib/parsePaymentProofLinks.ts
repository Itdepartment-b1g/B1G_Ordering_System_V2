const URL_RE = /https?:\/\/[^\s<>"'\\]+/gi;

export function parsePaymentProofLinks(value: unknown): string[] {
  const raw = String(value || '').replace(/\r/g, '');
  if (!raw.trim()) return [];
  const joined = raw.replace(/\n(?!\s*https?:)/gi, '');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of joined.match(URL_RE) || []) {
    const url = match.replace(/[.,);]+$/g, '');
    if (!/^https?:\/\//i.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export function collectPaymentProofLinks(values: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    for (const url of parsePaymentProofLinks(value)) {
      const key = url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(url);
    }
  }
  return out;
}
