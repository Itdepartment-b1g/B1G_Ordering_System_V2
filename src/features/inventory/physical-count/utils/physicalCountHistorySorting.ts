import type { PhysicalCountHistoryRow } from '../types';

export type PhysicalCountHistorySortKey =
  | 'countedAt'
  | 'batchNumber'
  | 'locationName'
  | 'performedBy'
  | 'lineCount'
  | 'totalVariance';

export type PhysicalCountHistorySortDirection = 'asc' | 'desc';

export const DEFAULT_PHYSICAL_COUNT_HISTORY_SORT_KEY: PhysicalCountHistorySortKey = 'countedAt';
export const DEFAULT_PHYSICAL_COUNT_HISTORY_SORT_DIRECTION: PhysicalCountHistorySortDirection =
  'desc';

function getBatchLabel(row: PhysicalCountHistoryRow): string {
  return row.batch?.batch_number ?? '';
}

function getLocationLabel(row: PhysicalCountHistoryRow): string {
  return row.warehouse_location?.name ?? '';
}

function getPerformedByLabel(row: PhysicalCountHistoryRow): string {
  return row.performed_by_user?.full_name ?? '';
}

export function sortPhysicalCountHistory(
  rows: PhysicalCountHistoryRow[],
  sortKey: PhysicalCountHistorySortKey,
  sortDirection: PhysicalCountHistorySortDirection
): PhysicalCountHistoryRow[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'countedAt':
        result = new Date(a.counted_at).getTime() - new Date(b.counted_at).getTime();
        break;
      case 'batchNumber':
        result = getBatchLabel(a).localeCompare(getBatchLabel(b), undefined, { numeric: true });
        break;
      case 'locationName':
        result = getLocationLabel(a).localeCompare(getLocationLabel(b));
        break;
      case 'performedBy':
        result = getPerformedByLabel(a).localeCompare(getPerformedByLabel(b));
        break;
      case 'lineCount':
        result = a.line_count - b.line_count;
        break;
      case 'totalVariance':
        result = a.total_variance - b.total_variance;
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.counted_at).getTime() - new Date(a.counted_at).getTime();
  });
}
