import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountClientAnalyticsExportRow {
  poNumber: string;
  orderDate: string;
  clientName: string;
  clientCode: string;
  grossAmount: number;
  rebatedAmount: number;
  netAmount: number;
  paymentStatus: string;
  workflowStatus: string;
  poKind: string;
}

export interface KeyAccountClientAnalyticsExportMeta {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
  clientLabel: string;
  brandLabel: string;
  totalPos: number;
  deliveredPos: number;
  grossDeliveredRevenue: number;
  rebatedDeliveredRevenue: number;
  deliveredRevenue: number;
  paidCount: number;
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

export async function exportKeyAccountClientAnalyticsExcel(
  rows: KeyAccountClientAnalyticsExportRow[],
  meta: KeyAccountClientAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Key Account Clients');

  worksheet.columns = [
    { width: 18 },
    { width: 14 },
    { width: 28 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 22 },
    { width: 18 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:K1');
  titleRow.getCell(1).value = 'Key Account Client Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Client PO History');
  cursor = addMetaRow(worksheet, cursor, 'Date range', meta.dateRangeLabel);
  cursor = addMetaRow(worksheet, cursor, 'Client filter', meta.clientLabel);
  cursor = addMetaRow(worksheet, cursor, 'Brand filter', meta.brandLabel);
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Revenue',
    'Net after money/credit rebates on source POs'
  );
  cursor = addMetaRow(worksheet, cursor, 'POs exported', rows.length);
  cursor += 1;

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (filtered)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Total POs', meta.totalPos);
  cursor = addMetaRow(worksheet, cursor, 'Delivered POs', meta.deliveredPos);
  cursor = addMetaRow(worksheet, cursor, 'Paid POs', meta.paidCount);
  cursor = addMetaRow(worksheet, cursor, 'Gross delivered revenue', formatPeso(meta.grossDeliveredRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Rebated (credit)', formatPeso(meta.rebatedDeliveredRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Net delivered revenue', formatPeso(meta.deliveredRevenue));
  cursor += 1;

  const tableHeaders = [
    'PO #',
    'Order date',
    'Client',
    'Client code',
    'Gross',
    'Rebated',
    'Net',
    'Payment status',
    'Workflow',
    'PO kind',
  ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((row) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = row.poNumber;
    dataRow.getCell(2).value = row.orderDate;
    dataRow.getCell(3).value = row.clientName;
    dataRow.getCell(4).value = row.clientCode;
    dataRow.getCell(5).value = formatPeso(row.grossAmount);
    dataRow.getCell(6).value = formatPeso(row.rebatedAmount);
    dataRow.getCell(7).value = formatPeso(row.netAmount);
    dataRow.getCell(8).value = row.paymentStatus;
    dataRow.getCell(9).value = row.workflowStatus;
    dataRow.getCell(10).value = row.poKind;
    [5, 6, 7].forEach((col) => {
      dataRow.getCell(col).alignment = { horizontal: 'right' };
    });
    cursor += 1;
  });

  const grossTotal = rows.reduce((sum, r) => sum + r.grossAmount, 0);
  const rebatedTotal = rows.reduce((sum, r) => sum + r.rebatedAmount, 0);
  const netTotal = rows.reduce((sum, r) => sum + r.netAmount, 0);

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(5).value = formatPeso(grossTotal);
  totalRow.getCell(6).value = formatPeso(rebatedTotal);
  totalRow.getCell(7).value = formatPeso(netTotal);
  totalRow.font = { bold: true };
  [5, 6, 7].forEach((col) => {
    totalRow.getCell(col).alignment = { horizontal: 'right' };
  });

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const slug = meta.periodStart === 'all' ? 'all_time' : `${meta.periodStart}_to_${meta.periodEnd}`;
  const date = new Date().toISOString().split('T')[0];
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = `key_account_client_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
