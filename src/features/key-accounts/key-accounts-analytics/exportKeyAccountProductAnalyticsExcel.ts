import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountProductAnalyticsExportRow {
  brand: string;
  totalUnits: number;
  consignmentUnits: number;
  consignmentPoCount: number;
  poCount: number;
  clientCount: number;
  billed: number;
  paidCash: number;
  paidDiscount: number;
  paidRemaining: number;
  status: string;
}

export interface KeyAccountProductAnalyticsExportMeta {
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

export async function exportKeyAccountProductAnalyticsExcel(
  rows: KeyAccountProductAnalyticsExportRow[],
  meta: KeyAccountProductAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Key Account Brands');

  worksheet.columns = [
    { width: 22 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 12 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:K1');
  titleRow.getCell(1).value = 'Key Account Brand Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Brand collections');
  cursor = addMetaRow(worksheet, cursor, 'Date range', meta.dateRangeLabel);
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Units',
    'Total quantity ordered on product POs (includes consignment)'
  );
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Consignment',
    'Float stock POs (pay later); subset of total units / PO count'
  );
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Collections',
    'Billed / paid / discount / remaining from brand payment allocations: standard by order date; consignment cash by payment date.'
  );
  cursor = addMetaRow(worksheet, cursor, 'Brands exported', rows.length);
  cursor += 1;

  const billed = rows.reduce((sum, r) => sum + r.billed, 0);
  const paidCash = rows.reduce((sum, r) => sum + r.paidCash, 0);
  const paidDiscount = rows.reduce((sum, r) => sum + r.paidDiscount, 0);
  const paidRemaining = rows.reduce((sum, r) => sum + r.paidRemaining, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Billed', formatPeso(billed));
  cursor = addMetaRow(worksheet, cursor, 'Paid (allocated)', formatPeso(paidCash));
  cursor = addMetaRow(worksheet, cursor, 'Settlement discount', formatPeso(paidDiscount));
  cursor = addMetaRow(worksheet, cursor, 'Remaining', formatPeso(paidRemaining));
  cursor += 1;

  const tableHeaders = [
    'Brand',
    'Total Units',
    'Consignment Units',
    'Consignment POs',
    'POs',
    'Clients',
    'Billed',
    'Paid',
    'Discount',
    'Remaining',
    'Status',
  ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((brand) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = brand.brand;
    dataRow.getCell(2).value = brand.totalUnits;
    dataRow.getCell(3).value = brand.consignmentUnits;
    dataRow.getCell(4).value = brand.consignmentPoCount;
    dataRow.getCell(5).value = brand.poCount;
    dataRow.getCell(6).value = brand.clientCount;
    dataRow.getCell(7).value = formatPeso(brand.billed);
    dataRow.getCell(8).value = formatPeso(brand.paidCash);
    dataRow.getCell(9).value = formatPeso(brand.paidDiscount);
    dataRow.getCell(10).value = formatPeso(brand.paidRemaining);
    dataRow.getCell(11).value = brand.status;
    [2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((col) => {
      dataRow.getCell(col).alignment = { horizontal: 'right' };
    });
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(2).value = rows.reduce((sum, r) => sum + r.totalUnits, 0);
  totalRow.getCell(3).value = rows.reduce((sum, r) => sum + r.consignmentUnits, 0);
  totalRow.getCell(4).value = rows.reduce((sum, r) => sum + r.consignmentPoCount, 0);
  totalRow.getCell(5).value = rows.reduce((sum, r) => sum + r.poCount, 0);
  totalRow.getCell(7).value = formatPeso(billed);
  totalRow.getCell(8).value = formatPeso(paidCash);
  totalRow.getCell(9).value = formatPeso(paidDiscount);
  totalRow.getCell(10).value = formatPeso(paidRemaining);
  totalRow.font = { bold: true };
  [2, 3, 4, 5, 7, 8, 9, 10].forEach((col) => {
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
  anchor.download = `key_account_brand_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
