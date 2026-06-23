import type { BatchInventoryGroup } from '../types';

export type BatchViewSortKey =
  | 'batchNumber'
  | 'locationName'
  | 'skuCount'
  | 'totalUnits'
  | 'receivedAt';

export type BatchViewSortDirection = 'asc' | 'desc';

export const DEFAULT_BATCH_VIEW_SORT_KEY: BatchViewSortKey = 'receivedAt';
export const DEFAULT_BATCH_VIEW_SORT_DIRECTION: BatchViewSortDirection = 'desc';

export function sortBatchInventoryGroups(
  groups: BatchInventoryGroup[],
  sortKey: BatchViewSortKey,
  sortDirection: BatchViewSortDirection
): BatchInventoryGroup[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'batchNumber':
        result = a.batchNumber.localeCompare(b.batchNumber, undefined, { numeric: true });
        break;
      case 'locationName':
        result = a.locationName.localeCompare(b.locationName);
        break;
      case 'skuCount':
        result = a.skuCount - b.skuCount;
        break;
      case 'totalUnits':
        result = a.totalUnits - b.totalUnits;
        break;
      case 'receivedAt':
        result = new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.batchNumber.localeCompare(b.batchNumber, undefined, { numeric: true }) * direction;
  });
}

export function getNextBatchViewSortDirection(
  currentKey: BatchViewSortKey,
  clickedKey: BatchViewSortKey,
  currentDirection: BatchViewSortDirection
): BatchViewSortDirection {
  if (currentKey !== clickedKey) return 'asc';
  return currentDirection === 'asc' ? 'desc' : 'asc';
}
