import { MULTIPLE_BRANDS_LABEL, type AllocationHistoryGroup } from './allocationHistoryMappers';

export type SuperAdminAllocationSortKey =
  | 'createdAt'
  | 'allocatedToName'
  | 'flow'
  | 'brandName'
  | 'allocatedByName'
  | 'lineCount'
  | 'totalQuantity';

export type SuperAdminAllocationSortDirection = 'asc' | 'desc';

export const DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_KEY: SuperAdminAllocationSortKey = 'createdAt';
export const DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_DIRECTION: SuperAdminAllocationSortDirection =
  'desc';

function getFlowLabel(type: AllocationHistoryGroup['allocationType']): string {
  return type === 'leader_to_agent' ? 'Leader to Agent' : 'Main to Leader';
}

function getBrandSortLabel(group: AllocationHistoryGroup): string {
  return group.brandName ?? MULTIPLE_BRANDS_LABEL;
}

export function sortSuperAdminAllocationGroups(
  groups: AllocationHistoryGroup[],
  sortKey: SuperAdminAllocationSortKey,
  sortDirection: SuperAdminAllocationSortDirection
): AllocationHistoryGroup[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'createdAt':
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'allocatedToName':
        result = a.allocatedToName.localeCompare(b.allocatedToName);
        break;
      case 'flow':
        result = getFlowLabel(a.allocationType).localeCompare(getFlowLabel(b.allocationType));
        break;
      case 'brandName':
        result = getBrandSortLabel(a).localeCompare(getBrandSortLabel(b));
        break;
      case 'allocatedByName':
        result = a.allocatedByName.localeCompare(b.allocatedByName);
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
