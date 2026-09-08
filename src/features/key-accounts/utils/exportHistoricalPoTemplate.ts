import ExcelJS from 'exceljs';
import { downloadExcelWorkbook } from '@/lib/excel.helpers';

const HEADERS = [
  'external_po_ref',
  'order_date',
  'client_name',
  'shop_name',
  'address_label',
  'brand_name',
  'variant_name',
  'quantity',
  'unit_price',
  'line_total',
  'kam_email',
  'warehouse_location_name',
  'discount',
  'rfpf_number',
  'notes',
] as const;

const SAMPLE = [
  [
    'LEGACY-2024-001',
    '2024-06-10',
    'ABC Trading Inc.',
    'Main Branch',
    'Main Receiving',
    'Brand A',
    '500ml',
    10,
    100,
    1000,
    'kam@example.com',
    '',
    0,
    'RFPF-2024-001',
    'First line of the PO — fill header + first brand',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    '',
    '1L',
    4,
    100,
    400,
    '',
    '',
    '',
    '',
    'Same PO and Brand A — leave ref / brand / RFPF blank',
  ],
  [
    '',
    '',
    '',
    '',
    '',
    'Brand B',
    '500ml',
    5,
    100,
    500,
    '',
    '',
    '',
    '',
    'Same PO, new brand — write brand_name again',
  ],
  [
    'LEGACY-2024-002',
    '2024-07-01',
    'ABC Trading Inc.',
    'Main Branch',
    'Main Receiving',
    'Brand A',
    '250ml',
    8,
    80,
    640,
    'kam@example.com',
    '',
    0,
    'RFPF-2024-002',
    'New PO — fill external_po_ref and RFPF again',
  ],
];

export async function downloadKAHistoricalPoTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PO_Lines');
  sheet.columns = HEADERS.map((header) => ({ header, width: Math.max(16, header.length + 4) }));
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
  SAMPLE.forEach((values) => sheet.addRow(values));
  await downloadExcelWorkbook(workbook, `KA_Historical_PO_Fill_Template.xlsx`);
}
