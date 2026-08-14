import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountComboAnalyticsExportRow {
  entity: string;
  orders: number;
  clients: number;
  shops: number;
  paidRevenue: number;
  remainingRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalRevenue: number;
}

export interface KeyAccountComboAnalyticsExportMeta {
  dateRangeLabel: string;
  groupByLabel: string;
  clientLabel: string;
  regionLabel: string;
  agentLabel: string;
  brandLabel: string;
  entityCount: number;
  totalOrders: number;
  totalRevenue: number;
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

export async function exportKeyAccountComboAnalyticsExcel(
  rows: KeyAccountComboAnalyticsExportRow[],
  meta: KeyAccountComboAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('KA Overview');

  worksheet.columns = [
    { width: 28 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:I1');
  titleRow.getCell(1).value = 'Key Account Overview Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Overview — payment mix by base');
  cursor = addMetaRow(worksheet, cursor, 'Date range', meta.dateRangeLabel);
  cursor = addMetaRow(worksheet, cursor, 'Group by', meta.groupByLabel);
  cursor = addMetaRow(worksheet, cursor, 'Client filter', meta.clientLabel);
  cursor = addMetaRow(worksheet, cursor, 'Region filter', meta.regionLabel);
  cursor = addMetaRow(worksheet, cursor, 'Agent filter', meta.agentLabel);
  cursor = addMetaRow(worksheet, cursor, 'Brand filter', meta.brandLabel);
  cursor = addMetaRow(worksheet, cursor, 'Entities', meta.entityCount);
  cursor = addMetaRow(worksheet, cursor, 'Total POs', meta.totalOrders);
  cursor = addMetaRow(worksheet, cursor, 'Total payment revenue', formatPeso(meta.totalRevenue));
  cursor += 1;

  const headerRow = worksheet.getRow(cursor);
  [
    'Entity',
    'POs',
    'Clients',
    'Shops',
    'Paid',
    'Remaining balance',
    'Consignment',
    'Settlement disc.',
    'Total',
  ].forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((row) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = row.entity;
    dataRow.getCell(2).value = row.orders;
    dataRow.getCell(3).value = row.clients;
    dataRow.getCell(4).value = row.shops;
    dataRow.getCell(5).value = formatPeso(row.paidRevenue);
    dataRow.getCell(6).value = formatPeso(row.remainingRevenue);
    dataRow.getCell(7).value = formatPeso(row.consignmentRevenue);
    dataRow.getCell(8).value = formatPeso(row.settlementDiscountRevenue);
    dataRow.getCell(9).value = formatPeso(row.totalRevenue);
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
  anchor.download = `ka_overview_analytics_${slug}_${date}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
