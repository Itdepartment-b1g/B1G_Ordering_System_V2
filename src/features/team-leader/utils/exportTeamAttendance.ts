import { downloadAttendanceTimeInOutExcel } from '@/lib/attendanceTimeInOutReportExcel';
import {
  downloadBusinessHoursReportExcel,
  type BusinessHoursReportMeta,
} from '@/lib/businessHoursReportExcel';
import { supabase } from '@/lib/supabase';

type TeamAttendanceStatus = 'present' | 'absent';

const TEAM_STATUSES: TeamAttendanceStatus[] = ['present', 'absent'];
const EXPORT_BATCH = 1000;

export type TeamAttendanceExportRow = {
  business_date: string;
  status: string;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  note: string | null;
  agent: {
    full_name: string;
    email: string;
    role: string;
  } | null;
  hub: { hub_name: string } | null;
};

export type TeamAttendanceExportFilters = {
  businessDateFrom: string;
  businessDateTo: string;
  statusFilter: 'all' | TeamAttendanceStatus;
  teamAgentIds: string[];
  /** Optional substring match on agent full name (case-insensitive). */
  agentNameSearch?: string;
  /** Optional substring match on agent email (case-insensitive). */
  agentEmailSearch?: string;
};

/** Applies active name / email filters to export rows (AND when both are set). */
export function filterTeamAttendanceExportRows(
  rows: TeamAttendanceExportRow[],
  filters: Pick<TeamAttendanceExportFilters, 'agentNameSearch' | 'agentEmailSearch'>
): TeamAttendanceExportRow[] {
  const nameNorm = (filters.agentNameSearch ?? '').trim().toLowerCase();
  const emailNorm = (filters.agentEmailSearch ?? '').trim().toLowerCase();
  if (!nameNorm && !emailNorm) return rows;

  return rows.filter(row => {
    const name = row.agent?.full_name?.toLowerCase() ?? '';
    const email = row.agent?.email?.toLowerCase() ?? '';
    if (nameNorm && !name.includes(nameNorm)) return false;
    if (emailNorm && !email.includes(emailNorm)) return false;
    return true;
  });
}

export async function fetchTeamAttendanceForExport(
  filters: TeamAttendanceExportFilters
): Promise<TeamAttendanceExportRow[]> {
  if (filters.teamAgentIds.length === 0) return [];

  const all: TeamAttendanceExportRow[] = [];
  let offset = 0;
  const dateFrom = filters.businessDateFrom.trim();
  const dateTo = filters.businessDateTo.trim();

  while (true) {
    let dataQuery = supabase
      .from('agent_attendances')
      .select(
        `
        business_date,
        status,
        time_in,
        time_out,
        total_hours,
        note,
        agent:profiles!agent_attendances_user_id_fkey(full_name, email, role),
        hub:hubs!agent_attendances_hub_id_fkey(hub_name)
      `
      )
      .in('user_id', filters.teamAgentIds)
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (dateFrom) dataQuery = dataQuery.gte('business_date', dateFrom);
    if (dateTo) dataQuery = dataQuery.lte('business_date', dateTo);

    if (filters.statusFilter === 'all') {
      dataQuery = dataQuery.in('status', TEAM_STATUSES);
    } else {
      dataQuery = dataQuery.eq('status', filters.statusFilter);
    }

    const { data, error } = await dataQuery.range(offset, offset + EXPORT_BATCH - 1);
    if (error) throw error;

    const batch = (data ?? []) as unknown as TeamAttendanceExportRow[];
    all.push(...batch);
    if (batch.length < EXPORT_BATCH) break;
    offset += EXPORT_BATCH;
  }

  return all;
}

/** Fetch rows for the current filters, apply name/email filters, and download computed hours report. */
export async function exportFilteredTeamAttendanceComputedHoursExcel(
  filters: TeamAttendanceExportFilters,
  fileNameDate = new Date().toISOString().split('T')[0]
): Promise<number> {
  if (filters.teamAgentIds.length === 0) return 0;

  let rows = await fetchTeamAttendanceForExport(filters);
  rows = filterTeamAttendanceExportRows(rows, filters);

  if (rows.length === 0) return 0;

  await downloadBusinessHoursReportExcel(rows, {
    businessDateFrom: filters.businessDateFrom.trim(),
    businessDateTo: filters.businessDateTo.trim(),
  }, fileNameDate);
  return rows.length;
}

/** Fetch rows for the current filters, apply name/email filters, and download time in / time out report. */
export async function exportFilteredTeamAttendanceTimeInOutExcel(
  filters: TeamAttendanceExportFilters,
  fileNameDate = new Date().toISOString().split('T')[0]
): Promise<number> {
  if (filters.teamAgentIds.length === 0) return 0;

  let rows = await fetchTeamAttendanceForExport(filters);
  rows = filterTeamAttendanceExportRows(rows, filters);

  if (rows.length === 0) return 0;

  await downloadAttendanceTimeInOutExcel(rows, fileNameDate);
  return rows.length;
}

export type { BusinessHoursReportMeta };
