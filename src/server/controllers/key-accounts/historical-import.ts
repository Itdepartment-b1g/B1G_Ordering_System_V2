import { requireAuthUser } from '../../auth/requireAuthUser';
import { HttpError, toErrorResult } from '../../http/errors';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import type { ApiResult } from '../executive/executiveController';
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

export async function postKAHistoricalImport(
  authorization?: string,
  body: unknown = {}
): Promise<ApiResult<unknown>> {
  try {
    const user = await requireAuthUser(authorization);
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single();
    if (error || !data?.company_id) throw new HttpError(403, 'Could not resolve user profile');
    if (!HISTORICAL_IMPORT_ROLES.includes(data.role as (typeof HISTORICAL_IMPORT_ROLES)[number])) {
      throw new HttpError(403, 'Only Sales Admin or Sales Head can import historical purchase orders');
    }

    const ctx = {
      userId: user.id,
      companyId: data.company_id,
      role: data.role,
      accessToken: accessTokenFromAuthorization(authorization),
    };
    const payload = (body || {}) as { action?: string };
    const rows = parseRows(body);

    if (payload.action === 'import') {
      return { status: 200, body: await importKAHistoricalPos(ctx, rows) };
    }
    return { status: 200, body: await dryRunKAHistoricalImport(ctx, rows) };
  } catch (error) {
    return toErrorResult(error);
  }
}
