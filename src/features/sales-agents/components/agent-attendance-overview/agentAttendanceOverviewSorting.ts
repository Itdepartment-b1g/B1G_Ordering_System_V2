export type AgentAttendanceOverviewSortKey =
  | 'businessDate'
  | 'agent'
  | 'role'
  | 'timeIn'
  | 'timeOut'
  | 'totalHours'
  | 'status';

export type AgentAttendanceOverviewSortDirection = 'asc' | 'desc';

export const DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_KEY: AgentAttendanceOverviewSortKey =
  'businessDate';
export const DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_DIRECTION: AgentAttendanceOverviewSortDirection =
  'desc';

export type AgentAttendanceOverviewRowSortable = {
  business_date: string;
  created_at: string;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  status: string;
  agent: { full_name?: string; role?: string } | null;
};

/** PostgREST cannot order by `profiles.role` via FK embed (conflicts with parent table). */
export function isClientSideAgentAttendanceSortKey(
  sortKey: AgentAttendanceOverviewSortKey
): sortKey is 'agent' | 'role' {
  return sortKey === 'agent' || sortKey === 'role';
}

export function sortAttendanceOverviewRowsClient<T extends AgentAttendanceOverviewRowSortable>(
  rows: T[],
  sortKey: 'agent' | 'role',
  sortDirection: AgentAttendanceOverviewSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const aValue = sortKey === 'agent' ? a.agent?.full_name ?? '' : a.agent?.role ?? '';
    const bValue = sortKey === 'agent' ? b.agent?.full_name ?? '' : b.agent?.role ?? '';
    const result = aValue.localeCompare(bValue);
    if (result !== 0) return result * direction;
    return b.business_date.localeCompare(a.business_date) * direction;
  });
}

export function applyAgentAttendanceOverviewSort<T extends { order: (...args: never[]) => T }>(
  query: T,
  sortKey: AgentAttendanceOverviewSortKey,
  sortDirection: AgentAttendanceOverviewSortDirection
): T {
  const ascending = sortDirection === 'asc';

  if (isClientSideAgentAttendanceSortKey(sortKey)) {
    return query.order('business_date', { ascending: false }).order('created_at', { ascending: false });
  }

  switch (sortKey) {
    case 'businessDate':
      return query.order('business_date', { ascending }).order('created_at', { ascending: false });
    case 'timeIn':
      return query
        .order('time_in', { ascending, nullsFirst: ascending })
        .order('created_at', { ascending: false });
    case 'timeOut':
      return query
        .order('time_out', { ascending, nullsFirst: ascending })
        .order('created_at', { ascending: false });
    case 'totalHours':
      return query
        .order('total_hours', { ascending, nullsFirst: ascending })
        .order('created_at', { ascending: false });
    case 'status':
      return query.order('status', { ascending }).order('created_at', { ascending: false });
    default:
      return query.order('business_date', { ascending: false }).order('created_at', { ascending: false });
  }
}
