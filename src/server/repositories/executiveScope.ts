import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { hasDatabaseUrl } from '../db/pool';
import { getSupabaseAdmin } from '../db/supabaseAdmin';
import { executiveCompanyAssignments } from '../db/schema/executive';
import { HttpError } from '../http/errors';

export function scopeCompanyIds(allowedIds: string[], requestedIds?: string[]): string[] {
  if (!requestedIds || requestedIds.length === 0) return allowedIds;
  const allowed = new Set(allowedIds);
  return requestedIds.filter((id) => allowed.has(id));
}

export async function getAssignedCompanyIds(executiveId: string): Promise<string[]> {
  if (!hasDatabaseUrl()) {
    const { data, error } = await getSupabaseAdmin()
      .from('executive_company_assignments')
      .select('company_id')
      .eq('executive_id', executiveId);
    if (error) throw error;
    return (data ?? []).map((row) => row.company_id).filter(Boolean);
  }

  const rows = await getDb()
    .select({ companyId: executiveCompanyAssignments.companyId })
    .from(executiveCompanyAssignments)
    .where(eq(executiveCompanyAssignments.executiveId, executiveId));

  return rows.map((row) => row.companyId);
}

export async function resolveExecutiveCompanyIds(
  executiveId: string,
  requestedIds?: string[]
): Promise<string[]> {
  const allowedIds = await getAssignedCompanyIds(executiveId);
  return scopeCompanyIds(allowedIds, requestedIds);
}

export async function assertCompanyAssigned(executiveId: string, companyId: string): Promise<string> {
  const allowedIds = await getAssignedCompanyIds(executiveId);
  if (!allowedIds.includes(companyId)) {
    throw new HttpError(403, 'Company is not assigned to this executive');
  }
  return companyId;
}
