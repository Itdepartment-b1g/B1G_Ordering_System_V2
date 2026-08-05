import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountCityAnalyticsExportRow {
  location: string;
  region: string;
  province: string;
  orders: number;
  shops: number;
  clients: number;
  grossRevenue: number;
  rebatedRevenue: number;
  netRevenue: number;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
}

export interface KeyAccountCityAnalyticsExportMeta {
  dateRangeLabel: string;
  groupByLabel: string;
  metricLabel: string;
  clientLabel: string;
  regionLabel: string;
  locationCount: number;
  totalOrders: number;
  totalNetRevenue: number;
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

export async function exportKeyAccountCityAnalyticsExcel(
  rows: KeyAccountCityAnalyticsExportRow[],
  meta: KeyAccountCityAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('KA City Analytics');

  worksheet.columns = [
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:M1');
  titleRow.getCell(1).value = 'Key Account City Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Section', 'City / Shop Location Performance');
  cursor = addMetaRow(worksheet, cursor, 'Date range', meta.dateRangeLabel);
  cursor = addMetaRow(worksheet, cursor, 'Group by', meta.groupByLabel);
  cursor = addMetaRow(worksheet, cursor, 'Sort metric', meta.metricLabel);
  cursor = addMetaRow(worksheet, cursor, 'Client filter', meta.clientLabel);
  cursor = addMetaRow(worksheet, cursor, 'Region filter', meta.regionLabel);
  cursor = addMetaRow(worksheet, cursor, 'Locations', meta.locationCount);
  cursor = addMetaRow(worksheet, cursor, 'Total POs', meta.totalOrders);
  cursor = addMetaRow(worksheet, cursor, 'Net revenue', formatPeso(meta.totalNetRevenue));
  cursor += 1;

  const headerRow = worksheet.getRow(cursor);
  [
    'Location',
    'Region',
    'Province',
    'POs',
    'Shops',
    'Clients',
    'Gross Revenue',
    'Rebated',
    'Net Revenue',
    'Paid',
    'Partial',
    'Unpaid',
    'Consignment',
  ].forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((row) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = row.location;
    dataRow.getCell(2).value = row.region;
    dataRow.getCell(3).value = row.province;
    dataRow.getCell(4).value = row.orders;
    dataRow.getCell(5).value = row.shops;
    dataRow.getCell(6).value = row.clients;
    dataRow.getCell(7).value = formatPeso(row.grossRevenue);
    dataRow.getCell(8).value = formatPeso(row.rebatedRevenue);
    dataRow.getCell(9).value = formatPeso(row.netRevenue);
    dataRow.getCell(10).value = formatPeso(row.paidRevenue);
    dataRow.getCell(11).value = formatPeso(row.partialRevenue);
    dataRow.getCell(12).value = formatPeso(row.unpaidRevenue);
    dataRow.getCell(13).value = formatPeso(row.consignmentRevenue);
    cursor += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const slug = meta.dateRangeLabel.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `ka_city_analytics_${slug}_${date}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
