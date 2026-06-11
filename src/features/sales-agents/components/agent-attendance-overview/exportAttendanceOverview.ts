import { downloadBusinessHoursReportExcel } from '@/lib/businessHoursReportExcel';
import { supabase } from '@/lib/supabase';

type OverviewAttendanceStatus = 'present' | 'absent';

const OVERVIEW_STATUSES: OverviewAttendanceStatus[] = ['present', 'absent'];
const EXPORT_BATCH = 1000;

export type AttendanceOverviewExportRow = {
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

export type AttendanceOverviewExportFilters = {
  businessDateFrom: string;
  businessDateTo: string;
  statusFilter: 'all' | OverviewAttendanceStatus;
  /** Optional substring match on agent full name (case-insensitive). */
  agentNameSearch?: string;
  /** Optional substring match on agent email (case-insensitive). */
  agentEmailSearch?: string;
};

function applyOverviewFilters<
  T extends {
    gte: (col: string, val: string) => T;
    lte: (col: string, val: string) => T;
    in: (col: string, vals: string[]) => T;
    eq: (col: string, val: string) => T;
  },
>(query: T, filters: AttendanceOverviewExportFilters): T {
  let q = query;
  const dateFrom = filters.businessDateFrom.trim();
  const dateTo = filters.businessDateTo.trim();

  if (dateFrom) q = q.gte('business_date', dateFrom);
  if (dateTo) q = q.lte('business_date', dateTo);

  if (filters.statusFilter === 'all') {
    q = q.in('status', OVERVIEW_STATUSES);
  } else {
    q = q.eq('status', filters.statusFilter);
  }

  return q;
}

/** Applies active name / email filters to export rows (AND when both are set). */
export function filterAttendanceOverviewExportRows(
  rows: AttendanceOverviewExportRow[],
  filters: Pick<AttendanceOverviewExportFilters, 'agentNameSearch' | 'agentEmailSearch'>
): AttendanceOverviewExportRow[] {
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

export async function fetchAttendanceOverviewForExport(
  filters: AttendanceOverviewExportFilters
): Promise<AttendanceOverviewExportRow[]> {
  const all: AttendanceOverviewExportRow[] = [];
  let offset = 0;

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
      .order('business_date', { ascending: false })
      .order('created_at', { ascending: false });

    dataQuery = applyOverviewFilters(dataQuery, filters);

    const { data, error } = await dataQuery.range(offset, offset + EXPORT_BATCH - 1);
    if (error) throw error;

    const batch = (data ?? []) as unknown as AttendanceOverviewExportRow[];
    all.push(...batch);
    if (batch.length < EXPORT_BATCH) break;
    offset += EXPORT_BATCH;
  }

  return all;
}

/** Fetch rows for the current filters, apply agent search, and download Business Hours Report. */
export async function exportFilteredAttendanceOverviewExcel(
  filters: AttendanceOverviewExportFilters,
  fileNameDate = new Date().toISOString().split('T')[0]
): Promise<number> {
  let rows = await fetchAttendanceOverviewForExport(filters);
  rows = filterAttendanceOverviewExportRows(rows, filters);

  if (rows.length === 0) return 0;

  downloadBusinessHoursReportExcel(rows, {
    businessDateFrom: filters.businessDateFrom.trim(),
    businessDateTo: filters.businessDateTo.trim(),
  }, fileNameDate);
  return rows.length;
}
