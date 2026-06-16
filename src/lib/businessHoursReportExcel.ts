import ExcelJS from 'exceljs';

import { resolveAttendanceTotalHours } from '@/lib/agentAttendanceTotalHours';
import { downloadExcelWorkbook } from '@/lib/excel.helpers';

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

const HEADER_FILL = 'FFFDE68A';
const ABSENT_HOURS_COLOR = 'FFEF4444';

const COLUMN_HEADERS = [
  'Business Date From',
  'Business Date To',
  'Name',
  'Email',
  'Computed Hours',
] as const;

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

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
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

export async function downloadBusinessHoursReportExcel(
  rows: BusinessHoursExportRow[],
  meta: BusinessHoursReportMeta,
  fileNameDate = new Date().toISOString().split('T')[0]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Business Hours');
  worksheet.columns = [
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 28 },
    { width: 16 },
  ];

  const headerRow = worksheet.addRow([...COLUMN_HEADERS]);
  styleHeaderRow(headerRow);

  rows.forEach(row => {
    const hours = computedHoursForExportRow(row);
    const dataRow = worksheet.addRow([
      meta.businessDateFrom,
      meta.businessDateTo,
      row.agent?.full_name ?? '',
      row.agent?.email ?? '',
      hours,
    ]);

    const hoursCell = dataRow.getCell(5);
    hoursCell.alignment = { horizontal: 'right' };
    if (row.status === 'absent') {
      hoursCell.font = { color: { argb: ABSENT_HOURS_COLOR } };
    }
  });

  await downloadExcelWorkbook(workbook, `Business_Hours_Report_${fileNameDate}.xlsx`);
}
