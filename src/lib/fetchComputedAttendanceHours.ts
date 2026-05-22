import { supabase } from '@/lib/supabase';
import type { AgentAttendance } from '@/types/database.types';
import { sumResolvedAttendanceHours } from '@/lib/agentAttendanceTotalHours';

const BATCH = 1000;

type ComputedHoursRow = Pick<
  AgentAttendance,
  'business_date' | 'time_in' | 'time_out' | 'total_hours'
> & {
  agent: { full_name: string; email: string } | null;
};

export type FetchComputedAttendanceHoursParams = {
  dateFrom: string;
  dateTo: string;
  /** Lowercased name or email substring (matches if either contains). */
  searchNorm?: string;
  /** Lowercased name substring (AND with email when both set). */
  agentNameSearch?: string;
  /** Lowercased email substring (AND with name when both set). */
  agentEmailSearch?: string;
  /** When set, only sum rows for these agents (e.g. team leader scope). */
  restrictToUserIds?: string[];
};

function rowMatchesAgentSearch(
  name: string,
  email: string,
  params: FetchComputedAttendanceHoursParams
): boolean {
  const legacy = (params.searchNorm ?? '').trim();
  if (legacy) {
    return name.includes(legacy) || email.includes(legacy);
  }
  const nameNorm = (params.agentNameSearch ?? '').trim().toLowerCase();
  const emailNorm = (params.agentEmailSearch ?? '').trim().toLowerCase();
  if (!nameNorm && !emailNorm) return false;
  if (nameNorm && !name.includes(nameNorm)) return false;
  if (emailNorm && !email.includes(emailNorm)) return false;
  return true;
}

/** Sum capped daily hours for present rows in a date range matching agent search. */
export async function fetchComputedHoursForFilteredAgent(
  params: FetchComputedAttendanceHoursParams
): Promise<{ totalHours: number; agentLabel: string | null }> {
  const { dateFrom, dateTo, restrictToUserIds } = params;

  if (restrictToUserIds && restrictToUserIds.length === 0) {
    return { totalHours: 0, agentLabel: null };
  }

  const matching: ComputedHoursRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('agent_attendances')
      .select(
        `
        business_date,
        time_in,
        time_out,
        total_hours,
        agent:profiles!agent_attendances_user_id_fkey(full_name, email)
      `
      )
      .eq('status', 'present')
      .not('time_out', 'is', null)
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo);

    if (restrictToUserIds?.length) {
      query = query.in('user_id', restrictToUserIds);
    }

    const { data, error } = await query.range(offset, offset + BATCH - 1);
    if (error) throw error;

    const batch = (data ?? []) as unknown as ComputedHoursRow[];
    for (const row of batch) {
      const name = row.agent?.full_name?.toLowerCase() ?? '';
      const email = row.agent?.email?.toLowerCase() ?? '';
      if (rowMatchesAgentSearch(name, email, params)) {
        matching.push(row);
      }
    }

    if (batch.length < BATCH) break;
    offset += BATCH;
  }

  const agentLabel = matching[0]?.agent?.full_name ?? matching[0]?.agent?.email ?? null;
  return {
    totalHours: sumResolvedAttendanceHours(matching),
    agentLabel,
  };
}
