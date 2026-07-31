import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountProductAnalyticsExportRow {
  brand: string;
  variant: string;
  totalUnits: number;
  consignmentUnits: number;
  consignmentPoCount: number;
  poCount: number;
  clientCount: number;
  grossRevenue: number;
  rebatedRevenue: number;
  revenue: number;
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
  const worksheet = workbook.addWorksheet('Key Account Products');

  worksheet.columns = [
    { width: 22 },
    { width: 28 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:J1');
  titleRow.getCell(1).value = 'Key Account Product Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Product Performance');
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
    'Rebated',
    'Money/credit rebates on source PO lines. Change-item rebates swap the disputed SKU for the replacement SKU.'
  );
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Net revenue',
    'Gross line revenue minus rebated credits (product demand; payment is PO-level)'
  );
  cursor = addMetaRow(worksheet, cursor, 'Products exported', rows.length);
  cursor += 1;

  const grossRevenue = rows.reduce((sum, r) => sum + r.grossRevenue, 0);
  const rebatedRevenue = rows.reduce((sum, r) => sum + r.rebatedRevenue, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Gross revenue', formatPeso(grossRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Rebated (credit)', formatPeso(rebatedRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Net revenue', formatPeso(totalRevenue));
  cursor += 1;

  const tableHeaders = [
    'Brand',
    'Product',
    'Total Units',
    'Consignment Units',
    'Consignment POs',
    'POs',
    'Clients',
    'Gross Revenue',
    'Rebated',
    'Net Revenue',
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
    dataRow.getCell(3).value = product.totalUnits;
    dataRow.getCell(4).value = product.consignmentUnits;
    dataRow.getCell(5).value = product.consignmentPoCount;
    dataRow.getCell(6).value = product.poCount;
    dataRow.getCell(7).value = product.clientCount;
    dataRow.getCell(8).value = formatPeso(product.grossRevenue);
    dataRow.getCell(9).value = formatPeso(product.rebatedRevenue);
    dataRow.getCell(10).value = formatPeso(product.revenue);
    [3, 4, 5, 6, 7, 8, 9, 10].forEach((col) => {
      dataRow.getCell(col).alignment = { horizontal: 'right' };
    });
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(2).value = 'TOTAL';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = rows.reduce((sum, r) => sum + r.totalUnits, 0);
  totalRow.getCell(4).value = rows.reduce((sum, r) => sum + r.consignmentUnits, 0);
  totalRow.getCell(5).value = rows.reduce((sum, r) => sum + r.consignmentPoCount, 0);
  totalRow.getCell(6).value = rows.reduce((sum, r) => sum + r.poCount, 0);
  totalRow.getCell(8).value = formatPeso(grossRevenue);
  totalRow.getCell(9).value = formatPeso(rebatedRevenue);
  totalRow.getCell(10).value = formatPeso(totalRevenue);
  totalRow.font = { bold: true };
  [3, 4, 5, 6, 8, 9, 10].forEach((col) => {
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
  anchor.download = `key_account_product_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
