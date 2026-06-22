import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

import type { WarehouseAllocationGroup } from '../types';
import { MULTIPLE_BRANDS_LABEL } from './warehouseAllocationMappers';

export type WarehouseAllocationFilterKey = 'all' | 'location' | 'brand' | 'performed_by';

export const MULTIBRAND_FILTER_VALUE = '__multibrand__';

function toManilaYmd(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function getWarehouseAllocationHistoryDateBounds(value: DateRangeFilterValue): {
  fromDate: string;
  toDate: string;
} {
  if (value.preset === 'all') {
    return { fromDate: '', toDate: '' };
  }

  const { start, end } = getDateRangeFromPreset(value.preset, value.customStart, value.customEnd);

  return {
    fromDate: start ? toManilaYmd(start) : '',
    toDate: end ? toManilaYmd(end) : '',
  };
}

export function hasWarehouseAllocationHistoryDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

export function filterWarehouseAllocationGroups(
  groups: WarehouseAllocationGroup[],
  selectedFilter: WarehouseAllocationFilterKey,
  filterValue: string,
  fromDate: string,
  toDate: string
): WarehouseAllocationGroup[] {
  const value = filterValue.trim();

  return groups.filter((group) => {
    const manilaDate = new Date(group.createdAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Manila',
    });

    if (fromDate && manilaDate < fromDate) return false;
    if (toDate && manilaDate > toDate) return false;

    if (selectedFilter !== 'all' && value) {
      if (selectedFilter === 'brand') {
        if (value === MULTIBRAND_FILTER_VALUE) {
          if (group.brandName !== MULTIPLE_BRANDS_LABEL) return false;
        } else {
          const hasBrand =
            group.brandId === value || group.lines.some((line) => line.brandId === value);
          if (!hasBrand) return false;
        }
      }
      if (selectedFilter === 'location' && group.locationId !== value) return false;
      if (selectedFilter === 'performed_by' && group.performedById !== value) return false;
    }

    return true;
  });
}
