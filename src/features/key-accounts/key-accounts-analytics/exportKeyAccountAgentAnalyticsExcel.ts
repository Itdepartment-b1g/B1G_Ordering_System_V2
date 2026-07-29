import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface KeyAccountAgentAnalyticsExportRow {
  name: string;
  email: string;
  paidRevenue: number;
  partialRevenue: number;
  unpaidRevenue: number;
  consignmentRevenue: number;
  settlementDiscountRevenue: number;
  totalOrders: number;
  paidOrders: number;
  partialOrders: number;
  unpaidOrders: number;
  consignmentOrders: number;
  totalRevenue: number;
  uniqueClients: number;
  avgOrderValue: number;
}

export interface KeyAccountAgentAnalyticsExportMeta {
  dateRangeLabel: string;
  periodStart: string;
  periodEnd: string;
  roleLabel: string;
  personLabel: string;
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

export async function exportKeyAccountAgentAnalyticsExcel(
  rows: KeyAccountAgentAnalyticsExportRow[],
  meta: KeyAccountAgentAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Key Account Agents');

  worksheet.columns = [
    { width: 24 },
    { width: 28 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 16 },
    { width: 24 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:M1');
  titleRow.getCell(1).value = 'Key Account Agent Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'Agent Performance');
  cursor = addMetaRow(worksheet, cursor, 'Date range', meta.dateRangeLabel);
  cursor = addMetaRow(worksheet, cursor, 'Role filter', meta.roleLabel);
  cursor = addMetaRow(worksheet, cursor, 'Person filter', meta.personLabel);
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Revenue',
    'PO payment buckets by agent: paid, partial, unpaid, consignment, and settlement discount (based on created POs)'
  );
  cursor = addMetaRow(worksheet, cursor, 'Agents exported', rows.length);
  cursor += 1;

  const paidRevenue = rows.reduce((sum, r) => sum + r.paidRevenue, 0);
  const partialRevenue = rows.reduce((sum, r) => sum + r.partialRevenue, 0);
  const unpaidRevenue = rows.reduce((sum, r) => sum + r.unpaidRevenue, 0);
  const consignmentRevenue = rows.reduce((sum, r) => sum + r.consignmentRevenue, 0);
  const settlementDiscountRevenue = rows.reduce((sum, r) => sum + r.settlementDiscountRevenue, 0);
  const totalRevenue = rows.reduce((sum, r) => sum + r.totalRevenue, 0);
  const totalOrders = rows.reduce((sum, r) => sum + r.totalOrders, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Paid revenue', formatPeso(paidRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Partial revenue', formatPeso(partialRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Unpaid revenue', formatPeso(unpaidRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Consignment revenue', formatPeso(consignmentRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Settlement discount', formatPeso(settlementDiscountRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Total revenue', formatPeso(totalRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Total POs', totalOrders);
  cursor += 1;

  const tableHeaders = [
    'Person',
    'Email',
    'Paid',
    'Partial',
    'Unpaid',
    'Consignment',
    'Settlement disc.',
    'Total',
    'Total POs',
    'Clients',
    'Avg PO',
    'PO Mix',
  ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((agent) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = agent.name;
    dataRow.getCell(2).value = agent.email;
    dataRow.getCell(3).value = formatPeso(agent.paidRevenue);
    dataRow.getCell(4).value = formatPeso(agent.partialRevenue);
    dataRow.getCell(5).value = formatPeso(agent.unpaidRevenue);
    dataRow.getCell(6).value = formatPeso(agent.consignmentRevenue);
    dataRow.getCell(7).value = formatPeso(agent.settlementDiscountRevenue);
    dataRow.getCell(8).value = formatPeso(agent.totalRevenue);
    dataRow.getCell(9).value = agent.totalOrders;
    dataRow.getCell(10).value = agent.uniqueClients;
    dataRow.getCell(11).value = formatPeso(agent.avgOrderValue);
    dataRow.getCell(12).value = `${agent.paidOrders} / ${agent.partialOrders} / ${agent.unpaidOrders} / ${agent.consignmentOrders}`;
    [3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((col) => {
      dataRow.getCell(col).alignment = { horizontal: 'right' };
    });
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(3).value = formatPeso(paidRevenue);
  totalRow.getCell(4).value = formatPeso(partialRevenue);
  totalRow.getCell(5).value = formatPeso(unpaidRevenue);
  totalRow.getCell(6).value = formatPeso(consignmentRevenue);
  totalRow.getCell(7).value = formatPeso(settlementDiscountRevenue);
  totalRow.getCell(8).value = formatPeso(totalRevenue);
  totalRow.getCell(9).value = totalOrders;
  totalRow.getCell(10).value = rows.reduce((sum, r) => sum + r.uniqueClients, 0);
  totalRow.getCell(12).value = `${rows.reduce((sum, r) => sum + r.paidOrders, 0)} / ${rows.reduce((sum, r) => sum + r.partialOrders, 0)} / ${rows.reduce((sum, r) => sum + r.unpaidOrders, 0)} / ${rows.reduce((sum, r) => sum + r.consignmentOrders, 0)}`;
  totalRow.font = { bold: true };
  [3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((col) => {
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
  anchor.download = `key_account_agent_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
