import ExcelJS from 'exceljs';

import { downloadExcelWorkbook } from '@/lib/excel.helpers';

export type ClientHierarchyExportFormat = 'csv' | 'xlsx';
export type ClientHierarchyExportTab = 'clients' | 'shops' | 'addresses';

const CLIENT_HEADERS = [
  'Client',
  'Code',
  'Category',
  'Contact',
  'Email',
  'Phone',
  'Payment Terms',
  'Notes',
] as const;

const SHOP_HEADERS = [
  'Shop',
  'Code',
  'Location',
  'Region',
  'Contact',
  'Phone',
  'Email',
  'Operating Hours',
  'Notes',
  'COR',
] as const;

const ADDRESS_HEADERS = [
  'Label',
  'Address',
  'Location',
  'Contact',
  'Phone',
  'Instructions',
] as const;

const CLIENT_SAMPLE_FIELDS = [
  'ABC Trading Inc.',
  'KA-001',
  'distributor',
  'Juan Dela Cruz',
  'juan@example.com',
  '09171234567',
  'Net 30',
  'Sample client for reference only',
] as const;

const SHOP_SAMPLE_FIELDS = [
  'Main Branch',
  'SH-001',
  'Quezon City, Metro Manila',
  'NCR',
  'Maria Santos',
  '09181234567',
  'maria@example.com',
  '8:00 AM - 6:00 PM',
  'Sample shop for reference only',
  'Yes',
] as const;

const ADDRESS_SAMPLE_FIELDS = [
  'Main Delivery',
  '123 Example Street, Brgy. Sample',
  'Quezon City, Metro Manila, NCR, 1100',
  'Pedro Reyes',
  '09191234567',
  'Leave at receiving area',
] as const;

const EXPORT_TABLES: Record<
  ClientHierarchyExportTab,
  {
    sheetName: string;
    filenamePrefix: string;
    headers: readonly string[];
    sampleFields: readonly string[];
    columnWidths: number[];
  }
> = {
  clients: {
    sheetName: 'Clients',
    filenamePrefix: 'ka_clients_columns',
    headers: CLIENT_HEADERS,
    sampleFields: CLIENT_SAMPLE_FIELDS,
    columnWidths: [28, 14, 18, 20, 28, 16, 20, 36],
  },
  shops: {
    sheetName: 'Shops',
    filenamePrefix: 'ka_shops_columns',
    headers: SHOP_HEADERS,
    sampleFields: SHOP_SAMPLE_FIELDS,
    columnWidths: [24, 14, 24, 16, 20, 16, 28, 18, 36, 10],
  },
  addresses: {
    sheetName: 'Addresses',
    filenamePrefix: 'ka_addresses_columns',
    headers: ADDRESS_HEADERS,
    sampleFields: ADDRESS_SAMPLE_FIELDS,
    columnWidths: [18, 40, 28, 20, 16, 36],
  },
};

function buildFilename(prefix: string, format: ClientHierarchyExportFormat): string {
  const today = new Date().toISOString().split('T')[0];
  return `${prefix}_${today}.${format === 'csv' ? 'csv' : 'xlsx'}`;
}

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: readonly string[], sampleRow: readonly string[]) {
  const csv = [headers.map(escapeCsvValue).join(','), sampleRow.map(escapeCsvValue).join(',')].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

async function downloadXlsx(
  sheetName: string,
  filenamePrefix: string,
  headers: readonly string[],
  sampleRow: readonly string[],
  columnWidths: number[]
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columnWidths.map((width) => ({ width }));

  const headerRow = worksheet.getRow(1);
  headers.forEach((label, index) => {
    headerRow.getCell(index + 1).value = label;
  });
  styleHeaderRow(headerRow);

  const exampleRow = worksheet.getRow(2);
  sampleRow.forEach((value, index) => {
    exampleRow.getCell(index + 1).value = value;
    exampleRow.getCell(index + 1).alignment = { vertical: 'top', wrapText: true };
  });

  await downloadExcelWorkbook(workbook, buildFilename(filenamePrefix, 'xlsx'));
}

export async function exportClientHierarchyColumns(
  tab: ClientHierarchyExportTab,
  format: ClientHierarchyExportFormat
): Promise<void> {
  const table = EXPORT_TABLES[tab];
  if (format === 'csv') {
    downloadCsv(buildFilename(table.filenamePrefix, 'csv'), table.headers, table.sampleFields);
    return;
  }
  await downloadXlsx(
    table.sheetName,
    table.filenamePrefix,
    table.headers,
    table.sampleFields,
    table.columnWidths
  );
}
