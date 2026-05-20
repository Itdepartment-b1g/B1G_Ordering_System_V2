/** Capped billable / payable hours per attendance day. */
export const MAX_ATTENDANCE_TOTAL_HOURS = 8;

/** Official payable segments on `business_date` (Asia/Manila): 10:00–12:00 and 13:00–19:00. */
const MANILA_PAYABLE_SEGMENTS: ReadonlyArray<{ start: string; end: string }> = [
  { start: '10:00:00', end: '12:00:00' },
  { start: '13:00:00', end: '19:00:00' },
];

function manilaSegmentWindowMs(
  businessDate: string,
  startTime: string,
  endTime: string
): { startMs: number; endMs: number } | null {
  const d = businessDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const startMs = new Date(`${d}T${startTime}+08:00`).getTime();
  const endMs = new Date(`${d}T${endTime}+08:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

function overlapDurationMs(
  attendanceStartMs: number,
  attendanceEndMs: number,
  segmentStartMs: number,
  segmentEndMs: number
): number {
  const effectiveStart = Math.max(attendanceStartMs, segmentStartMs);
  const effectiveEnd = Math.min(attendanceEndMs, segmentEndMs);
  if (effectiveEnd <= effectiveStart) return 0;
  return effectiveEnd - effectiveStart;
}

/**
 * Payable hours inside the official schedule (10–12 and 13–19 Manila), clamped to time in/out.
 * Excludes the 12:00–13:00 unpaid break. Not capped at {@link MAX_ATTENDANCE_TOTAL_HOURS}.
 */
export function computeOfficeDurationHours(
  businessDate: string,
  timeIn: string | null,
  timeOut: string | null
): number | null {
  if (!timeIn || !timeOut) return null;

  const inMs = new Date(timeIn).getTime();
  const outMs = new Date(timeOut).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return null;

  let totalMs = 0;
  for (const segment of MANILA_PAYABLE_SEGMENTS) {
    const window = manilaSegmentWindowMs(businessDate, segment.start, segment.end);
    if (!window) return null;
    totalMs += overlapDurationMs(inMs, outMs, window.startMs, window.endMs);
  }

  return Math.round((totalMs / 3_600_000) * 100) / 100;
}

/** Schedule-based hours capped at {@link MAX_ATTENDANCE_TOTAL_HOURS}. */
export function computeTotalHours(
  businessDate: string,
  timeIn: string | null,
  timeOut: string | null
): number | null {
  const raw = computeOfficeDurationHours(businessDate, timeIn, timeOut);
  if (raw === null) return null;
  return Math.min(raw, MAX_ATTENDANCE_TOTAL_HOURS);
}

export function formatTotalHoursDisplay(hours: number | null | undefined): string {
  if (hours == null) return '—';
  return hours.toFixed(2);
}

type TotalHoursRow = {
  business_date: string;
  time_in: string | null;
  time_out: string | null;
  total_hours?: number | null;
};

/** Prefer live computation from timestamps; fall back to stored `total_hours`. */
export function resolveAttendanceTotalHours(row: TotalHoursRow): number | null {
  const computed = computeTotalHours(row.business_date, row.time_in, row.time_out);
  if (computed !== null) return computed;
  if (row.total_hours != null) return row.total_hours;
  return null;
}

export function formatAttendanceTotalHours(row: TotalHoursRow): string {
  return formatTotalHoursDisplay(resolveAttendanceTotalHours(row));
}

/** Sum capped daily hours across multiple attendance rows (e.g. a filtered date range). */
export function sumResolvedAttendanceHours(rows: TotalHoursRow[]): number {
  let sum = 0;
  for (const row of rows) {
    const hours = resolveAttendanceTotalHours(row);
    if (hours != null) sum += hours;
  }
  return Math.round(sum * 100) / 100;
}
