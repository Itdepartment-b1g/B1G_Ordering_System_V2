import ExcelJS from 'exceljs';

import { downloadExcelWorkbook } from '@/lib/excel.helpers';

export type AttendanceTimeInOutExportRow = {
  business_date: string;
  status: string;
  time_in: string | null;
  time_out: string | null;
  agent: {
    full_name: string;
    email: string;
    role: string;
  } | null;
};

const HEADER_FILL = 'FFFDE68A';
const PRESENT_STATUS_COLOR = 'FF1A0F2E';
const ABSENT_STATUS_COLOR = 'FFEF4444';

const COLUMN_HEADERS = [
  'Business Date',
  'Name',
  'Email',
  'Role',
  'Status',
  'Time In',
  'Time Out',
] as const;

function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatManilaBusinessDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function attendanceStatusLabel(status: string): string {
  return status === 'absent' ? 'Absent' : 'Present';
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
}

function applyStatusCellStyle(cell: ExcelJS.Cell, status: string): void {
  const isAbsent = status === 'absent';
  cell.value = attendanceStatusLabel(status);
  cell.font = {
    bold: true,
    color: { argb: isAbsent ? ABSENT_STATUS_COLOR : PRESENT_STATUS_COLOR },
  };
  cell.alignment = { horizontal: 'center' };
}

/** Build rows for the Time In / Time Out sheet (one row per attendance record). */
export function buildAttendanceTimeInOutReportRows(
  rows: AttendanceTimeInOutExportRow[]
): Record<string, string>[] {
  return rows.map(row => {
    const isPresent = row.status === 'present';
    return {
      'Business Date': formatManilaBusinessDateLabel(row.business_date),
      Name: row.agent?.full_name ?? '',
      Email: row.agent?.email ?? '',
      Role: row.agent?.role ?? '',
      Status: attendanceStatusLabel(row.status),
      'Time In': isPresent ? formatManilaDateTime(row.time_in) : '',
      'Time Out': isPresent ? formatManilaDateTime(row.time_out) : '',
    };
  });
}

export async function downloadAttendanceTimeInOutExcel(
  rows: AttendanceTimeInOutExportRow[],
  fileNameDate = new Date().toISOString().split('T')[0]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Time In Out');
  worksheet.columns = [
    { width: 22 },
    { width: 24 },
    { width: 28 },
    { width: 16 },
    { width: 12 },
    { width: 22 },
    { width: 22 },
  ];

  const headerRow = worksheet.addRow([...COLUMN_HEADERS]);
  styleHeaderRow(headerRow);

  rows.forEach(row => {
    const isPresent = row.status === 'present';
    const dataRow = worksheet.addRow([
      formatManilaBusinessDateLabel(row.business_date),
      row.agent?.full_name ?? '',
      row.agent?.email ?? '',
      row.agent?.role ?? '',
      attendanceStatusLabel(row.status),
      isPresent ? formatManilaDateTime(row.time_in) : '',
      isPresent ? formatManilaDateTime(row.time_out) : '',
    ]);

    applyStatusCellStyle(dataRow.getCell(5), row.status);
  });

  await downloadExcelWorkbook(workbook, `Attendance_Time_In_Out_${fileNameDate}.xlsx`);
}
