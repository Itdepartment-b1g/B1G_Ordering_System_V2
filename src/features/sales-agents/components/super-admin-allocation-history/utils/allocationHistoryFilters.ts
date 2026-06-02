import { MULTIPLE_BRANDS_LABEL, type AllocationHistoryGroup } from './allocationHistoryMappers';

export type AllocationFilterKey = 'all' | 'allocated_to' | 'flow' | 'brand' | 'allocated_by';

/** Sentinel value for the brand filter dropdown — allocations spanning more than one brand. */
export const MULTIBRAND_FILTER_VALUE = '__multibrand__';

export function filterAllocationHistoryGroups(
  groups: AllocationHistoryGroup[],
  selectedFilter: AllocationFilterKey,
  filterValue: string,
  fromDate: string,
  toDate: string
): AllocationHistoryGroup[] {
  const value = filterValue.trim();

  return groups.filter((group) => {
    const manilaDate = new Date(group.createdAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Manila',
    });

    if (fromDate && manilaDate < fromDate) return false;
    if (toDate && manilaDate > toDate) return false;

    if (selectedFilter !== 'all' && value) {
      if (selectedFilter === 'flow' && group.allocationType !== value) return false;
      if (selectedFilter === 'brand') {
        if (value === MULTIBRAND_FILTER_VALUE) {
          if (group.brandName !== MULTIPLE_BRANDS_LABEL) return false;
        } else if (group.brandId !== value) {
          return false;
        }
      }
      if (selectedFilter === 'allocated_to' && group.allocatedToId !== value) return false;
      if (selectedFilter === 'allocated_by' && group.allocatedById !== value) return false;
    }

    return true;
  });
}
