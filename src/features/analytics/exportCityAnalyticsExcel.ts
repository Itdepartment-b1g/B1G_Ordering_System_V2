import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

export interface CityAnalyticsExportRow {
  city: string;
  agents: string[];
  orders: number;
  brandQty: number;
  approvedRevenue: number;
  pendingRevenue: number;
  rejectedRevenue: number;
  /** Approved + Pending (performance total) */
  revenue: number;
  /** Approved + Pending + Rejected */
  totalAmount: number;
  clients: number;
  visits: number;
  growth: number;
}

export interface CityAnalyticsExportMeta {
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

export async function exportCityAnalyticsExcel(
  rows: CityAnalyticsExportRow[],
  meta: CityAnalyticsExportMeta
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('City Analytics');

  worksheet.columns = [
    { width: 22 },
    { width: 36 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ];

  const titleRow = worksheet.getRow(1);
  worksheet.mergeCells('A1:L1');
  titleRow.getCell(1).value = 'City Analytics Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  let cursor = 3;
  cursor = addMetaRow(worksheet, cursor, 'Generated at', formatExportGeneratedAt());
  cursor = addMetaRow(worksheet, cursor, 'Export', 'Filtered (date range)');
  cursor = addMetaRow(worksheet, cursor, 'Section', 'City Performance');
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Date range',
    meta.periodStart === 'all' && meta.periodEnd === 'all'
      ? 'All time'
      : `${meta.periodStart} to ${meta.periodEnd}`
  );
  cursor = addMetaRow(worksheet, cursor, 'Cities exported', rows.length);
  cursor += 1;

  const approvedRevenue = rows.reduce((sum, r) => sum + r.approvedRevenue, 0);
  const pendingRevenue = rows.reduce((sum, r) => sum + r.pendingRevenue, 0);
  const rejectedRevenue = rows.reduce((sum, r) => sum + r.rejectedRevenue, 0);
  const approvedAndPending = approvedRevenue + pendingRevenue;
  const totalAmount = approvedAndPending + rejectedRevenue;
  const totalOrders = rows.reduce((sum, r) => sum + r.orders, 0);
  const totalBrandQty = rows.reduce((sum, r) => sum + r.brandQty, 0);
  const totalClients = rows.reduce((sum, r) => sum + r.clients, 0);
  const totalVisits = rows.reduce((sum, r) => sum + r.visits, 0);

  const summaryTitle = worksheet.getRow(cursor);
  worksheet.mergeCells(`A${cursor}:B${cursor}`);
  summaryTitle.getCell(1).value = 'Amount summary (exported rows)';
  summaryTitle.getCell(1).font = { bold: true, size: 12 };
  cursor += 1;

  cursor = addMetaRow(worksheet, cursor, 'Approved revenue', formatPeso(approvedRevenue));
  cursor = addMetaRow(worksheet, cursor, 'Pending revenue', formatPeso(pendingRevenue));
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Approved + Pending revenue',
    formatPeso(approvedAndPending)
  );
  cursor = addMetaRow(worksheet, cursor, 'Rejected revenue', formatPeso(rejectedRevenue));
  cursor = addMetaRow(
    worksheet,
    cursor,
    'Total amount (Approved + Pending + Rejected)',
    formatPeso(totalAmount)
  );
  cursor = addMetaRow(worksheet, cursor, 'Total orders', totalOrders);
  cursor = addMetaRow(worksheet, cursor, 'Total brand qty', totalBrandQty);
  cursor = addMetaRow(worksheet, cursor, 'Total clients', totalClients);
  cursor = addMetaRow(worksheet, cursor, 'Total visits', totalVisits);
  cursor += 1;

  const tableHeaders = [
    'City',
    'Agent(s)',
    'Orders',
    'Total Brand Qty',
    'Approved Revenue',
    'Pending Revenue',
    'Approved + Pending',
    'Rejected Revenue',
    'Total Amount',
    'Clients',
    'Visits',
    'Growth %',
  ];

  const headerRow = worksheet.getRow(cursor);
  tableHeaders.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);
  cursor += 1;

  rows.forEach((city) => {
    const dataRow = worksheet.getRow(cursor);
    dataRow.getCell(1).value = city.city;
    dataRow.getCell(2).value = city.agents.length ? city.agents.join(', ') : '—';
    dataRow.getCell(3).value = city.orders;
    dataRow.getCell(4).value = city.brandQty;
    dataRow.getCell(5).value = formatPeso(city.approvedRevenue);
    dataRow.getCell(6).value = formatPeso(city.pendingRevenue);
    dataRow.getCell(7).value = formatPeso(city.revenue);
    dataRow.getCell(8).value = formatPeso(city.rejectedRevenue);
    dataRow.getCell(9).value = formatPeso(city.totalAmount);
    dataRow.getCell(10).value = city.clients;
    dataRow.getCell(11).value = city.visits;
    dataRow.getCell(12).value = Number(city.growth.toFixed(1));
    [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((col) => {
      dataRow.getCell(col).alignment = { horizontal: 'right' };
    });
    cursor += 1;
  });

  const totalRow = worksheet.getRow(cursor);
  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = 'TOTAL';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = totalOrders;
  totalRow.getCell(4).value = totalBrandQty;
  totalRow.getCell(5).value = formatPeso(approvedRevenue);
  totalRow.getCell(6).value = formatPeso(pendingRevenue);
  totalRow.getCell(7).value = formatPeso(approvedAndPending);
  totalRow.getCell(8).value = formatPeso(rejectedRevenue);
  totalRow.getCell(9).value = formatPeso(totalAmount);
  totalRow.getCell(10).value = totalClients;
  totalRow.getCell(11).value = totalVisits;
  totalRow.getCell(12).value = '';
  totalRow.font = { bold: true };
  [3, 4, 5, 6, 7, 8, 9, 10, 11].forEach((col) => {
    totalRow.getCell(col).alignment = { horizontal: 'right' };
  });

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
  anchor.download = `city_analytics_${slug}_${date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
