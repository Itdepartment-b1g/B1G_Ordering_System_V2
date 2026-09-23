import { isDateInRange } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import {
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
} from '@/features/shared/components/QuickFilterSheet';

import type { PhysicalCountHistoryRow } from '../types';
import { getPhysicalCountPerformerId } from './physicalCountPerformer';

export type PhysicalCountHistoryQuickColumn = 'batch' | 'location' | 'performed_by';

export type PhysicalCountHistoryFilterOption = { id: string; name: string };

export function hasPhysicalCountHistoryDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

export function filterPhysicalCountHistory(
  rows: PhysicalCountHistoryRow[],
  columnClauses: QuickFilterAndClause<PhysicalCountHistoryQuickColumn>[] | undefined,
  start?: Date,
  end?: Date
): PhysicalCountHistoryRow[] {
  return rows.filter((row) => {
    if (!isDateInRange(new Date(row.counted_at), start, end)) return false;

    return matchesQuickFilterAndClauses(columnClauses, (field, value) => {
      if (field === 'batch') return row.batch?.id === value;
      if (field === 'location') return row.warehouse_location?.id === value;
      if (field === 'performed_by') return getPhysicalCountPerformerId(row) === value;
      return true;
    });
  });
}

/** @deprecated Prefer PhysicalCountHistoryQuickColumn + QuickFilterSheet */
export type PhysicalCountHistoryFilterKey = 'all' | 'batch' | 'location' | 'performed_by';
