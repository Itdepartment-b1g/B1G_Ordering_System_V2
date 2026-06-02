import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

import { MULTIPLE_BRANDS_LABEL, type AllocationHistoryGroup } from './allocationHistoryMappers';

export type AllocationFilterKey = 'all' | 'allocated_to' | 'flow' | 'brand' | 'allocated_by';

function toManilaYmd(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Map preset/custom date filter to YYYY-MM-DD bounds used by allocation history filtering. */
export function getAllocationHistoryDateBounds(value: DateRangeFilterValue): {
  fromDate: string;
  toDate: string;
} {
  if (value.preset === 'all') {
    return { fromDate: '', toDate: '' };
  }

  const { start, end } = getDateRangeFromPreset(
    value.preset,
    value.customStart,
    value.customEnd
  );

  return {
    fromDate: start ? toManilaYmd(start) : '',
    toDate: end ? toManilaYmd(end) : '',
  };
}

export function hasAllocationHistoryDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

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
