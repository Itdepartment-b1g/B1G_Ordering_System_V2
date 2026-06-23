export type TeamStatsSortKey =
  | 'leaderName'
  | 'remittanceCount'
  | 'totalItems'
  | 'totalRevenue'
  | 'lastRemittanceDate';

export type RemittanceLogSortKey = 'agentName' | 'date' | 'items' | 'revenue';

export type AdminTeamRemittanceSortDirection = 'asc' | 'desc';

export const DEFAULT_TEAM_STATS_SORT_KEY: TeamStatsSortKey = 'lastRemittanceDate';
export const DEFAULT_TEAM_STATS_SORT_DIRECTION: AdminTeamRemittanceSortDirection = 'desc';

export const DEFAULT_REMITTANCE_LOG_SORT_KEY: RemittanceLogSortKey = 'date';
export const DEFAULT_REMITTANCE_LOG_SORT_DIRECTION: AdminTeamRemittanceSortDirection = 'desc';

export type TeamStatsSortable = {
  leaderId: string;
  leaderName: string;
  remittanceCount: number;
  totalItems: number;
  totalRevenue: number;
  lastRemittanceDate: string;
};

export type RemittanceLogSortable = {
  id: string;
  agent_name?: string;
  remitted_at: string;
  items_remitted: number;
  total_revenue: number;
};

function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

export function sortTeamStats<T extends TeamStatsSortable>(
  rows: T[],
  sortKey: TeamStatsSortKey,
  sortDirection: AdminTeamRemittanceSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'leaderName':
        result = a.leaderName.localeCompare(b.leaderName);
        break;
      case 'remittanceCount':
        result = a.remittanceCount - b.remittanceCount;
        break;
      case 'totalItems':
        result = a.totalItems - b.totalItems;
        break;
      case 'totalRevenue':
        result = a.totalRevenue - b.totalRevenue;
        break;
      case 'lastRemittanceDate':
        result = compareDates(a.lastRemittanceDate, b.lastRemittanceDate);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.leaderName.localeCompare(b.leaderName);
  });
}

export function sortRemittanceLogs<T extends RemittanceLogSortable>(
  rows: T[],
  sortKey: RemittanceLogSortKey,
  sortDirection: AdminTeamRemittanceSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'agentName':
        result = (a.agent_name ?? '').localeCompare(b.agent_name ?? '');
        break;
      case 'date':
        result = compareDates(a.remitted_at, b.remitted_at);
        break;
      case 'items':
        result = a.items_remitted - b.items_remitted;
        break;
      case 'revenue':
        result = a.total_revenue - b.total_revenue;
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(a.remitted_at, b.remitted_at);
  });
}
