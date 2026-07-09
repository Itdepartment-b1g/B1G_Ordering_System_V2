import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface ProductAnalyticsExportRow {
  brand: string;
  variant: string;
  orders: number;
  quantity: number;
  pendingOrders: number;
  pendingQuantity: number;
  approvedRevenue: number;
  pendingRevenue: number;
  revenue: number;
}

export interface ProductAnalyticsExportMeta {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
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

export function writeProductAnalyticsSection(
  worksheet: ExcelJS.Worksheet,
  rows: ProductAnalyticsExportRow[],
  meta: ProductAnalyticsExportMeta,
  startRow = 1
): number {
  const titleRow = worksheet.getRow(startRow);
  worksheet.mergeCells(startRow, 1, startRow, 9);
  titleRow.getCell(1).value = 'Product Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = startRow + 2;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Product Performance');
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Date range',
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : `${meta.periodStart} to ${meta.periodEnd}`
  );
  cursor = addMetaRow(worksheet, cursor, 'Products exported', rows.length);
  cursor += 1;

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const approvedRevenue = rows.reduce((sum, r) => sum + r.approvedRevenue, 0);
  const pendingRevenue = rows.reduce((sum, r) => sum + r.pendingRevenue, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Total revenue', formatPeso(totalRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Approved revenue', formatPeso(approvedRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Pending revenue', formatPeso(pendingRevenue));
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Approved + Pending revenue',
    formatPeso(approvedRevenue + pendingRevenue)
  );
  cursor += 1;

  const tableHeaders = [
    'Brand',
    'Product',
    'Orders',
    'Units Sold',
    'Pending Orders',
    'Pending Sold',
    'Approved Revenue',
    'Pending Revenue',
    'Total Revenue',
  ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((product) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = product.brand;
    dataRow.getCell(2).value = product.variant;
    dataRow.getCell(3).value = product.orders;
    dataRow.getCell(4).value = product.quantity;
    dataRow.getCell(5).value = product.pendingOrders;
    dataRow.getCell(6).value = product.pendingQuantity;
    dataRow.getCell(7).value = formatPeso(product.approvedRevenue);
    dataRow.getCell(8).value = formatPeso(product.pendingRevenue);
    dataRow.getCell(9).value = formatPeso(product.revenue);
    dataRow.getCell(3).alignment = { horizontal: 'right' };
    dataRow.getCell(4).alignment = { horizontal: 'right' };
    dataRow.getCell(5).alignment = { horizontal: 'right' };
    dataRow.getCell(6).alignment = { horizontal: 'right' };
    dataRow.getCell(7).alignment = { horizontal: 'right' };
    dataRow.getCell(8).alignment = { horizontal: 'right' };
    dataRow.getCell(9).alignment = { horizontal: 'right' };
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = 'TOTAL';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = rows.reduce((sum, r) => sum + r.orders, 0);
  totalRow.getCell(4).value = rows.reduce((sum, r) => sum + r.quantity, 0);
  totalRow.getCell(5).value = rows.reduce((sum, r) => sum + r.pendingOrders, 0);
  totalRow.getCell(6).value = rows.reduce((sum, r) => sum + r.pendingQuantity, 0);
  totalRow.getCell(7).value = formatPeso(approvedRevenue);
  totalRow.getCell(8).value = formatPeso(pendingRevenue);
  totalRow.getCell(9).value = formatPeso(totalRevenue);
  totalRow.font = { bold: true };
  [3, 4, 5, 6, 7, 8, 9].forEach((col) => {
    totalRow.getCell(col).alignment = { horizontal: 'right' };
  });

  return cursor + 1;
}

export async function exportProductAnalyticsExcel(
  rows: ProductAnalyticsExportRow[],
  meta: ProductAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Product Analytics');

  worksheet.columns = [
    { width: 22 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  writeProductAnalyticsSection(worksheet, rows, meta);

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
  anchor.download = `product_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
