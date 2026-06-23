export type LeaderRemittanceSortKey = 'date' | 'agentName' | 'items' | 'orders' | 'revenue';

export type LeaderRemittanceSortDirection = 'asc' | 'desc';

export const DEFAULT_LEADER_REMITTANCE_SORT_KEY: LeaderRemittanceSortKey = 'date';
export const DEFAULT_LEADER_REMITTANCE_SORT_DIRECTION: LeaderRemittanceSortDirection = 'desc';

export type LeaderRemittanceSortable = {
  id: string;
  agent_name?: string;
  remitted_at: string;
  items_remitted: number;
  orders_count: number;
  total_revenue: number;
};

function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

export function sortLeaderRemittances<T extends LeaderRemittanceSortable>(
  rows: T[],
  sortKey: LeaderRemittanceSortKey,
  sortDirection: LeaderRemittanceSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'date':
        result = compareDates(a.remitted_at, b.remitted_at);
        break;
      case 'agentName':
        result = (a.agent_name ?? '').localeCompare(b.agent_name ?? '');
        break;
      case 'items':
        result = a.items_remitted - b.items_remitted;
        break;
      case 'orders':
        result = a.orders_count - b.orders_count;
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
