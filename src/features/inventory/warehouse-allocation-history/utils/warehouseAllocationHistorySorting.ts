import type { WarehouseAllocationGroup } from '../types';

export type WarehouseAllocationSortKey =
  | 'createdAt'
  | 'locationName'
  | 'brandName'
  | 'performedByName'
  | 'lineCount'
  | 'totalQuantity';

export type WarehouseAllocationSortDirection = 'asc' | 'desc';

export const DEFAULT_WAREHOUSE_ALLOCATION_SORT_KEY: WarehouseAllocationSortKey = 'createdAt';
export const DEFAULT_WAREHOUSE_ALLOCATION_SORT_DIRECTION: WarehouseAllocationSortDirection = 'desc';

function getBrandSortLabel(group: WarehouseAllocationGroup): string {
  return group.brandName ?? '';
}

export function sortWarehouseAllocationGroups(
  groups: WarehouseAllocationGroup[],
  sortKey: WarehouseAllocationSortKey,
  sortDirection: WarehouseAllocationSortDirection
): WarehouseAllocationGroup[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'createdAt':
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'locationName':
        result = a.locationName.localeCompare(b.locationName);
        break;
      case 'brandName':
        result = getBrandSortLabel(a).localeCompare(getBrandSortLabel(b));
        break;
      case 'performedByName':
        result = a.performedByName.localeCompare(b.performedByName);
        break;
      case 'lineCount':
        result = a.lineCount - b.lineCount;
        break;
      case 'totalQuantity':
        result = a.totalQuantity - b.totalQuantity;
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
