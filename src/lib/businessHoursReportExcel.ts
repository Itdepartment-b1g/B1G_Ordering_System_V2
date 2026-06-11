import * as XLSX from 'xlsx';

import { resolveAttendanceTotalHours } from '@/lib/agentAttendanceTotalHours';

export type BusinessHoursExportRow = {
  business_date: string;
  status: string;
  time_in: string | null;
  time_out: string | null;
  total_hours: number | null;
  agent: { full_name: string; email: string } | null;
};

export type BusinessHoursReportMeta = {
  businessDateFrom: string;
  businessDateTo: string;
};

function computedHoursForExportRow(row: BusinessHoursExportRow): number {
  if (row.status === 'absent') return 0;
  const hours = resolveAttendanceTotalHours({
    business_date: row.business_date,
    time_in: row.time_in,
    time_out: row.time_out,
    total_hours: row.total_hours,
  });
  return hours ?? 0;
}

/** Build rows for the Business Hours Report sheet (single table, fixed columns). */
export function buildBusinessHoursReportRows(
  rows: BusinessHoursExportRow[],
  meta: BusinessHoursReportMeta
): Record<string, string | number>[] {
  return rows.map(row => ({
    'Business Date From': meta.businessDateFrom,
    'Business Date To': meta.businessDateTo,
    Name: row.agent?.full_name ?? '',
    Email: row.agent?.email ?? '',
    'Computed Hours': computedHoursForExportRow(row),
  }));
}

export function downloadBusinessHoursReportExcel(
  rows: BusinessHoursExportRow[],
  meta: BusinessHoursReportMeta,
  fileNameDate = new Date().toISOString().split('T')[0]
): void {
  const exportData = buildBusinessHoursReportRows(rows, meta);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, 'Business Hours');
  XLSX.writeFile(wb, `Business_Hours_Report_${fileNameDate}.xlsx`);
}
