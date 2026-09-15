import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { respond } from '../../http/respond';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import {
  dryRunKAHistoricalImport,
  importKAHistoricalPos,
  HISTORICAL_IMPORT_ROLES,
  type KAHistoricalLineInput,
} from '../../repositories/key-accounts/historical-import';

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

function parseRows(body: unknown): KAHistoricalLineInput[] {
  const payload = (body || {}) as { rows?: unknown };
  if (!Array.isArray(payload.rows)) throw new HttpError(400, 'rows array is required');
  return payload.rows as KAHistoricalLineInput[];
}

async function resolveUserContext(userId: string, accessToken?: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('profiles')
    .select('company_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) throw new HttpError(403, 'Could not resolve user profile');
  if (!data.company_id) throw new HttpError(403, 'User has no company assigned');
  if (!HISTORICAL_IMPORT_ROLES.includes(data.role as (typeof HISTORICAL_IMPORT_ROLES)[number])) {
    throw new HttpError(403, 'Only Sales Admin or Sales Head can import historical purchase orders');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
    accessToken,
  };
}

export async function postKAHistoricalImportHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const payload = (req.body || {}) as { action?: string };
    const rows = parseRows(req.body || {});

    if (payload.action === 'import') {
      return { status: 200, body: await importKAHistoricalPos(ctx, rows) };
    }
    return { status: 200, body: await dryRunKAHistoricalImport(ctx, rows) };
  });
}
