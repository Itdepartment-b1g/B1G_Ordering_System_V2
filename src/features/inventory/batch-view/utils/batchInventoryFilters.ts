import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

import type { BatchInventoryGroup } from '../types';

export const ALL_WAREHOUSES_FILTER_VALUE = 'all';

function toManilaYmd(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function getBatchInventoryDateBounds(value: DateRangeFilterValue): {
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

export function hasBatchInventoryDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

export function filterBatchInventoryGroups(
  groups: BatchInventoryGroup[],
  search: string,
  brandId: string,
  fromDate: string,
  toDate: string
): BatchInventoryGroup[] {
  const q = search.trim().toLowerCase();

  return groups.filter((group) => {
    const manilaDate = new Date(group.receivedAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Manila',
    });

    if (fromDate && manilaDate < fromDate) return false;
    if (toDate && manilaDate > toDate) return false;

    if (brandId) {
      const hasBrand = group.brands.some((b) => b.brandId === brandId);
      if (!hasBrand) return false;
    }

    if (!q) return true;

    if (group.batchNumber.toLowerCase().includes(q)) return true;

    return group.brands.some(
      (brand) =>
        brand.brandName.toLowerCase().includes(q) ||
        brand.lots.some((lot) => lot.variantName.toLowerCase().includes(q))
    );
  });
}

export function summarizeBatchInventory(groups: BatchInventoryGroup[]) {
  const batchCount = groups.length;
  let skuCount = 0;
  let totalUnits = 0;

  for (const group of groups) {
    totalUnits += group.totalUnits;
    skuCount += group.skuCount;
  }

  return { batchCount, skuCount, totalUnits };
}
