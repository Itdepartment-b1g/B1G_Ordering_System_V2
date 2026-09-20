import { requireAuthUser } from '../../auth/requireAuthUser';
import { getAuthorizationHeader } from '../../http/headers';
import { HttpError } from '../../http/errors';
import { respond } from '../../http/respond';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import {
  dryRunKASalesRecordImport,
  importKASalesRecordPos,
  SALES_RECORD_IMPORT_ROLES,
  type KASalesRecordLineInput,
} from '../../repositories/key-accounts/sales-record-import';

function accessTokenFromAuthorization(authorization?: string) {
  if (!authorization) return '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
}

function parseRows(body: unknown): KASalesRecordLineInput[] {
  const payload = (body || {}) as { rows?: unknown };
  if (!Array.isArray(payload.rows)) throw new HttpError(400, 'rows array is required');
  return payload.rows as KASalesRecordLineInput[];
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
  if (!SALES_RECORD_IMPORT_ROLES.includes(data.role as (typeof SALES_RECORD_IMPORT_ROLES)[number])) {
    throw new HttpError(403, 'Only Sales Admin or Sales Head can import client sales records');
  }

  return {
    userId,
    companyId: data.company_id,
    role: data.role,
    accessToken,
  };
}

export async function postKASalesRecordImportHandler(req: any, res: any) {
  return respond(res, async () => {
    const authorization = getAuthorizationHeader(req.headers || {});
    const user = await requireAuthUser(authorization);
    const ctx = await resolveUserContext(user.id, accessTokenFromAuthorization(authorization));
    const payload = (req.body || {}) as { action?: string; create_missing?: boolean };
    const rows = parseRows(req.body || {});
    const options = { createMissing: payload.create_missing !== false };

    if (payload.action === 'import') {
      return { status: 200, body: await importKASalesRecordPos(ctx, rows, options) };
    }
    return { status: 200, body: await dryRunKASalesRecordImport(ctx, rows, options) };
  });
}
