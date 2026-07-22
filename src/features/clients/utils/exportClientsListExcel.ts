import ExcelJS from 'exceljs';

import { formatExportGeneratedAt } from '@/lib/excel.helpers';

import { formatDateForInput } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';

export type ClientListExportInput = {
  photo_url?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  agentLabel: string;
  city?: string;
  account_type: string;
  category: string;
  total_orders: number;
  total_spent: number;
  visit_count: number;
  approvalLabel: string;
  location_latitude?: number;
  location_longitude?: number;
};

export type ClientListExportRow = {
  photo: string;
  tradeName: string;
  shopName: string;
  email: string;
  phone: string;
  agent: string;
  city: string;
  accountType: string;
  category: string;
  orders: number;
  totalSpent: number;
  visits: number;
  approval: string;
  latitude: number | '';
  longitude: number | '';
};

export type ClientListExportSummary = {
  totalSpent: number;
  approvedSpent: number;
  pendingSpent: number;
  approvedAndPendingSpent: number;
  pendingMinusApprovedSpent: number;
};

export type ClientForSpentSummary = {
  total_spent: number;
  approval_status: 'pending' | 'approved' | 'rejected';
};

export type ClientListExportMeta = {
  exportType: 'filtered' | 'all';
  dateLabel: string;
  cityLabel: string;
  searchLabel: string | null;
  clientCount: number;
  totalOrders: number;
  summary: ClientListExportSummary;
};

const TOTAL_SPENT_COLUMN = 11;

const HEADERS = [
  'Photo',
  'Trade Name',
  'Shop Name',
  'Email',
  'Phone',
  'Agent',
  'City',
  'Account Type',
  'Category',
  'Orders',
  'Total Spent',
  'Visits',
  'Approval',
  'Latitude',
  'Longitude',
] as const;

const PHP_CURRENCY_FMT = '"₱"#,##0.00';
const COLUMN_COUNT = HEADERS.length;

function getApprovalLabel(status: 'pending' | 'approved' | 'rejected'): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Pending Approval';
  }
}

export function mapClientToListExportRow(client: ClientListExportInput): ClientListExportRow {
  return {
    photo: client.photo_url ? 'Yes' : 'No',
    tradeName: client.name,
    shopName: client.company || '',
    email: client.email || '',
    phone: client.phone || '',
    agent: client.agentLabel,
    city: client.city || '',
    accountType: client.account_type,
    category: client.category,
    orders: client.total_orders || 0,
    totalSpent: client.total_spent || 0,
    visits: client.visit_count ?? 0,
    approval: client.approvalLabel,
    latitude: client.location_latitude != null ? Number(client.location_latitude) : '',
    longitude: client.location_longitude != null ? Number(client.location_longitude) : '',
  };
}

export function buildClientApprovalLabel(
  status: 'pending' | 'approved' | 'rejected'
): string {
  return getApprovalLabel(status);
}

export function computeClientListExportSummary(
  clients: ClientForSpentSummary[]
): ClientListExportSummary {
  let totalSpent = 0;
  let approvedSpent = 0;
  let pendingSpent = 0;

  for (const client of clients) {
    const spent = Number(client.total_spent) || 0;
    totalSpent += spent;
    if (client.approval_status === 'approved') {
      approvedSpent += spent;
    } else if (client.approval_status === 'pending') {
      pendingSpent += spent;
    }
  }

  return {
    totalSpent,
    approvedSpent,
    pendingSpent,
    approvedAndPendingSpent: approvedSpent + pendingSpent,
    pendingMinusApprovedSpent: pendingSpent - approvedSpent,
  };
}

export function buildClientsListExportFilename(
  dateRangeFilter: DateRangeFilterValue,
  citySlug: string,
  exportType: 'filtered' | 'all'
): string {
  const today = new Date().toISOString().split('T')[0];
  const scopeSlug = exportType === 'all' ? 'all_unfiltered' : 'filtered';
  const cityPart = citySlug === 'all' ? 'all_cities' : citySlug.replace(/\s+/g, '_').toLowerCase();

  if (
    dateRangeFilter.preset === 'custom' &&
    dateRangeFilter.customStart &&
    dateRangeFilter.customEnd
  ) {
    return `clients_list_${scopeSlug}_${cityPart}_${formatDateForInput(dateRangeFilter.customStart)}_to_${formatDateForInput(dateRangeFilter.customEnd)}_${today}`;
  }

  const presetSlug = exportType === 'all' ? 'all_time' : dateRangeFilter.preset;
  return `clients_list_${scopeSlug}_${cityPart}_${presetSlug}_${today}`;
}

function styleColumnHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
  });
}

function writeSpentSummaryRow(
  worksheet: ExcelJS.Worksheet,
  rowIndex: number,
  label: string,
  amount: number,
  options?: { emphasis?: boolean }
): number {
  const row = worksheet.getRow(rowIndex);
  worksheet.mergeCells(rowIndex, 1, rowIndex, TOTAL_SPENT_COLUMN - 1);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true, size: options?.emphasis ? 11 : 10 };
  row.getCell(1).alignment = { vertical: 'middle' };

  const amountCell = row.getCell(TOTAL_SPENT_COLUMN);
  amountCell.value = amount;
  amountCell.numFmt = PHP_CURRENCY_FMT;
  amountCell.font = { bold: true, size: options?.emphasis ? 11 : 10 };
  amountCell.alignment = { horizontal: 'right', vertical: 'middle' };

  return rowIndex + 1;
}

function writeMetaRows(worksheet: ExcelJS.Worksheet, meta: ClientListExportMeta): number {
  let rowIndex = 1;

  const titleRow = worksheet.getRow(rowIndex++);
  worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, COLUMN_COUNT);
  titleRow.getCell(1).value = 'Clients Database Export';
  titleRow.getCell(1).font = { bold: true, size: 14 };

  const addMetaRow = (label: string, value: string) => {
    const row = worksheet.getRow(rowIndex++);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    worksheet.mergeCells(rowIndex - 1, 2, rowIndex - 1, COLUMN_COUNT);
    row.getCell(2).value = value;
  };

  addMetaRow('Generated at', formatExportGeneratedAt());
  addMetaRow(
    'Export',
    meta.exportType === 'filtered' ? 'Filtered (current filters)' : 'All clients (no filters)'
  );
  addMetaRow(
    'Date range',
    meta.exportType === 'all' ? 'All time' : meta.dateLabel
  );
  addMetaRow(
    'City',
    meta.exportType === 'all' ? 'All cities' : meta.cityLabel
  );
  if (meta.searchLabel) {
    addMetaRow('Search', meta.searchLabel);
  }
  addMetaRow('Clients exported', String(meta.clientCount));
  addMetaRow('Total orders (exported)', String(meta.totalOrders));

  rowIndex += 1;

  const summaryHeader = worksheet.getRow(rowIndex++);
  worksheet.mergeCells(rowIndex - 1, 1, rowIndex - 1, COLUMN_COUNT);
  summaryHeader.getCell(1).value = 'Total spent summary (exported rows)';
  summaryHeader.getCell(1).font = { bold: true, size: 11 };
  summaryHeader.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' },
  };

  const { summary } = meta;
  rowIndex = writeSpentSummaryRow(worksheet, rowIndex, 'Total spent', summary.totalSpent);
  rowIndex = writeSpentSummaryRow(worksheet, rowIndex, 'Approved spent', summary.approvedSpent);
  rowIndex = writeSpentSummaryRow(worksheet, rowIndex, 'Pending spent', summary.pendingSpent);
  rowIndex = writeSpentSummaryRow(
    worksheet,
    rowIndex,
    'Pending + Approved spent total',
    summary.approvedAndPendingSpent,
    { emphasis: true }
  );
  rowIndex = writeSpentSummaryRow(
    worksheet,
    rowIndex,
    'Pending − Approved spent total',
    summary.pendingMinusApprovedSpent,
    { emphasis: true }
  );

  rowIndex += 1;
  return rowIndex;
}

export async function exportClientsListExcel(
  rows: ClientListExportRow[],
  filenamePrefix: string,
  meta: ClientListExportMeta
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Clients');
  worksheet.columns = [
    { width: 10 },
    { width: 24 },
    { width: 24 },
    { width: 28 },
    { width: 18 },
    { width: 20 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 10 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ];

  const dataStartRow = writeMetaRows(worksheet, meta);

  const headerRow = worksheet.getRow(dataStartRow);
  HEADERS.forEach((label, i) => {
    headerRow.getCell(i + 1).value = label;
  });
  styleColumnHeader(headerRow);

  rows.forEach((row, index) => {
    const excelRow = worksheet.getRow(dataStartRow + 1 + index);
    excelRow.getCell(1).value = row.photo;
    excelRow.getCell(2).value = row.tradeName;
    excelRow.getCell(3).value = row.shopName;
    excelRow.getCell(4).value = row.email;
    excelRow.getCell(5).value = row.phone;
    excelRow.getCell(6).value = row.agent;
    excelRow.getCell(7).value = row.city;
    excelRow.getCell(8).value = row.accountType;
    excelRow.getCell(9).value = row.category;
    excelRow.getCell(10).value = row.orders;
    excelRow.getCell(10).alignment = { horizontal: 'right' };
    const spentCell = excelRow.getCell(11);
    spentCell.value = row.totalSpent;
    spentCell.numFmt = PHP_CURRENCY_FMT;
    spentCell.alignment = { horizontal: 'right' };
    excelRow.getCell(12).value = row.visits;
    excelRow.getCell(12).alignment = { horizontal: 'right' };
    excelRow.getCell(13).value = row.approval;
    excelRow.getCell(14).value = row.latitude;
    excelRow.getCell(14).numFmt = '0.000000';
    excelRow.getCell(15).value = row.longitude;
    excelRow.getCell(15).numFmt = '0.000000';
  });

  const fileBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${filenamePrefix}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}
