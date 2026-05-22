export type DatePreset =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'last_year'
  | 'custom';

export function getDateRangeFromPreset(
  preset: DatePreset,
  customStart?: Date,
  customEnd?: Date
): { start?: Date; end?: Date } {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  switch (preset) {
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'last_month':
      start.setMonth(now.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth());
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'last_3_months':
      start.setMonth(now.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'last_6_months':
      start.setMonth(now.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'this_year':
      start.setMonth(0);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'last_year':
      start.setFullYear(now.getFullYear() - 1);
      start.setMonth(0);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(now.getFullYear() - 1);
      end.setMonth(11);
      end.setDate(31);
      end.setHours(23, 59, 59, 999);
      return { start, end };

    case 'custom':
      if (customStart) {
        const s = new Date(customStart);
        s.setHours(0, 0, 0, 0);
        const e = customEnd ? new Date(customEnd) : new Date(customStart);
        e.setHours(23, 59, 59, 999);
        return { start: s, end: e };
      }
      return { start: undefined, end: undefined };

    case 'all':
    default:
      return { start: undefined, end: undefined };
  }
}

export function getDatePresetLabel(
  preset: DatePreset,
  customStart?: Date,
  customEnd?: Date
): string {
  if (preset === 'custom' && customStart && customEnd) {
    return `${formatDateForInput(customStart)} to ${formatDateForInput(customEnd)}`;
  }
  if (preset === 'custom') return 'Select dates...';

  const labels: Record<Exclude<DatePreset, 'custom'>, string> = {
    all: 'All Time',
    this_month: 'This Month',
    last_month: 'Last Month',
    last_3_months: 'Last 3 Months',
    last_6_months: 'Last 6 Months',
    this_year: 'This Year',
    last_year: 'Last Year',
  };
  return labels[preset as Exclude<DatePreset, 'custom'>] ?? 'All Time';
}

export function formatDateForInput(date?: Date): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateFromInput(dateString: string): Date | undefined {
  if (!dateString) return undefined;
  const date = new Date(dateString + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

/** Returns true if orderDate falls within [start, end] (inclusive, by calendar day). */
export function isDateInRange(
  orderDate: string | Date,
  start?: Date,
  end?: Date
): boolean {
  if (!start && !end) return true;
  const d =
    typeof orderDate === 'string'
      ? parseDateFromInput(orderDate)
      : orderDate instanceof Date
        ? new Date(orderDate)
        : undefined;
  if (!d || Number.isNaN(d.getTime())) return false;
  d.setHours(12, 0, 0, 0);
  if (start) {
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    if (d < s) return false;
  }
  if (end) {
    const e = new Date(end);
    e.setHours(23, 59, 59, 999);
    if (d > e) return false;
  }
  return true;
}
