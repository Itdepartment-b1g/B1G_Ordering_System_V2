import { isDateInRange } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

import type { PhysicalCountHistoryRow } from '../types';

export type PhysicalCountHistoryFilterKey = 'all' | 'batch' | 'location' | 'performed_by';

export type PhysicalCountHistoryFilterOption = { id: string; name: string };

export function hasPhysicalCountHistoryDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

export function filterPhysicalCountHistory(
  rows: PhysicalCountHistoryRow[],
  selectedFilter: PhysicalCountHistoryFilterKey,
  filterValue: string,
  start?: Date,
  end?: Date
): PhysicalCountHistoryRow[] {
  const value = filterValue.trim();

  return rows.filter((row) => {
    if (!isDateInRange(new Date(row.counted_at), start, end)) return false;

    if (selectedFilter === 'all' || !value) return true;

    if (selectedFilter === 'batch') {
      return row.batch?.id === value;
    }
    if (selectedFilter === 'location') {
      return row.warehouse_location?.id === value;
    }
    if (selectedFilter === 'performed_by') {
      return row.performed_by_user?.id === value;
    }

    return true;
  });
}
