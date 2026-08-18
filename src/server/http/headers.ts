type HeaderMap = Record<string, string | string[] | undefined>;

export function getAuthorizationHeader(headers: HeaderMap): string | undefined {
  const raw = headers.authorization ?? headers.Authorization;
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

export function applyCors(
  res: { setHeader: (name: string, value: string) => void },
  methods = 'GET, OPTIONS'
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
