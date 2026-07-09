import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export type AgentAnalyticsMetric = 'revenue' | 'orders' | 'clients';

export interface AgentAnalyticsExportRow {
  period: string;
  agentName: string;
  approved: number;
  pending: number;
  total: number;
}

export interface AgentAnalyticsExportMeta {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
  roleLabel: string;
  personLabel: string;
  metric: AgentAnalyticsMetric;
}

function styleHeaderRow(row: ExcelJS.Row, fillArgb = 'FFFDE68A') {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addMetaRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  value: string | number
) {
  const row = worksheet.getRow(rowIndex);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true };
  row.getCell(2).value = value;
  return rowIndex + 1;
}

function formatMetricValue(metric: AgentAnalyticsMetric, value: number): string | number {
  if (metric === 'revenue') return formatPeso(value);
  return value;
}

function getMetricLabel(metric: AgentAnalyticsMetric): string {
  if (metric === 'revenue') return 'Revenue';
  if (metric === 'orders') return 'Orders';
  return 'New Clients';
}

export async function exportAgentAnalyticsExcel(
  rows: AgentAnalyticsExportRow[],
  meta: AgentAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Agent Analytics');
  const isClientsMetric = meta.metric === 'clients';
  const lastCol = isClientsMetric ? 'D' : 'E';

  worksheet.columns = [
    { width: 22 },
    { width: 28 },
    ...(isClientsMetric ? [{ width: 16 }] : [{ width: 18 }, { width: 18 }, { width: 18 }]),
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells(`A1:${lastCol}1`);
  titleRow.getCell(1).value = 'Agent Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Agent Performance');
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Date range',
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : `${meta.periodStart} to ${meta.periodEnd}`
  );
  cursor = addMetaRow(worksheet, cursor, 'Role filter', meta.roleLabel);
  cursor = addMetaRow(worksheet, cursor, 'Person filter', meta.personLabel);
  cursor = addMetaRow(worksheet, cursor, 'Metric', getMetricLabel(meta.metric));
  cursor = addMetaRow(worksheet, cursor, 'Rows exported', rows.length);
  cursor += 1;

  const totalApproved = rows.reduce((sum, r) => sum + r.approved, 0);
  const totalPending = rows.reduce((sum, r) => sum + r.pending, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  if (isClientsMetric) {
    cursor = addMetaRow(
      worksheet,
      cursor,
      `Total ${getMetricLabel(meta.metric).toLowerCase()}`,
      grandTotal
    );
  } else {
    cursor = addMetaRow(
      worksheet,
      cursor,
      `Total approved ${meta.metric}`,
      formatMetricValue(meta.metric, totalApproved)
    );
    cursor = addMetaRow(
      worksheet,
      cursor,
      `Total pending ${meta.metric}`,
      formatMetricValue(meta.metric, totalPending)
    );
    cursor = addMetaRow(
      worksheet,
      cursor,
      `Total ${meta.metric}`,
      formatMetricValue(meta.metric, grandTotal)
    );
    cursor = addMetaRow(
      worksheet,
      cursor,
      `Approved + Pending ${meta.metric}`,
      formatMetricValue(meta.metric, totalApproved + totalPending)
    );
  }
  cursor += 1;

  const tableHeaders = isClientsMetric
    ? ['Period', 'Agent', getMetricLabel(meta.metric)]
    : [
        'Period',
        'Agent',
        `Approved ${getMetricLabel(meta.metric)}`,
        `Pending ${getMetricLabel(meta.metric)}`,
        `Total ${getMetricLabel(meta.metric)}`,
      ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((row) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = row.period;
    dataRow.getCell(2).value = row.agentName;
    if (isClientsMetric) {
      dataRow.getCell(3).value = row.total;
      dataRow.getCell(3).alignment = { horizontal: 'right' };
    } else {
      dataRow.getCell(3).value = formatMetricValue(meta.metric, row.approved);
      dataRow.getCell(4).value = formatMetricValue(meta.metric, row.pending);
      dataRow.getCell(5).value = formatMetricValue(meta.metric, row.total);
      dataRow.getCell(3).alignment = { horizontal: 'right' };
      dataRow.getCell(4).alignment = { horizontal: 'right' };
      dataRow.getCell(5).alignment = { horizontal: 'right' };
    }
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = 'TOTAL';
  totalRow.getCell(2).font = { bold: true };
  if (isClientsMetric) {
    totalRow.getCell(3).value = grandTotal;
    totalRow.getCell(3).alignment = { horizontal: 'right' };
  } else {
    totalRow.getCell(3).value = formatMetricValue(meta.metric, totalApproved);
    totalRow.getCell(4).value = formatMetricValue(meta.metric, totalPending);
    totalRow.getCell(5).value = formatMetricValue(meta.metric, grandTotal);
    [3, 4, 5].forEach((col) => {
      totalRow.getCell(col).alignment = { horizontal: 'right' };
    });
  }
  totalRow.font = { bold: true };

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const slug =
    meta.periodStart === 'all' ? 'all_time' : `${meta.periodStart}_to_${meta.periodEnd}`;
  const date = new Date().toISOString().split('T')[0];
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `agent_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
