import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

function toManilaYmd(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Map preset/custom date filter to Manila YYYY-MM-DD bounds for `business_date`. */
export function getAttendanceOverviewDateBounds(value: DateRangeFilterValue): {
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

export function hasAttendanceOverviewDateFilter(value: DateRangeFilterValue): boolean {
  return value.preset !== 'all';
}

export function hasAttendanceOverviewDateRangeComplete(value: DateRangeFilterValue): boolean {
  const { fromDate, toDate } = getAttendanceOverviewDateBounds(value);
  return fromDate.length > 0 && toDate.length > 0;
}
