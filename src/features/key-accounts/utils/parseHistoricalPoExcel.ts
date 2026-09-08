import * as XLSX from 'xlsx';
import { fillDownHistoricalPoRows } from '@/lib/kaHistoricalPoFillDown';

export type KAHistoricalExcelRow = {
  excel_row: number;
  external_po_ref?: string;
  order_date?: string;
  client_name?: string;
  client_code?: string;
  shop_name?: string;
  shop_code?: string;
  address_label?: string;
  brand_name?: string;
  variant_name?: string;
  sku?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  kam_email?: string;
  warehouse_location_name?: string;
  discount?: number;
  rfpf_number?: string;
  notes?: string;
};

const FIELD_BY_HEADER: Record<string, keyof KAHistoricalExcelRow> = {
  externalporef: 'external_po_ref',
  orderdate: 'order_date',
  clientname: 'client_name',
  clientcode: 'client_code',
  shopname: 'shop_name',
  shopcode: 'shop_code',
  addresslabel: 'address_label',
  brandname: 'brand_name',
  variantname: 'variant_name',
  sku: 'sku',
  quantity: 'quantity',
  unitprice: 'unit_price',
  linetotal: 'line_total',
  kamemail: 'kam_email',
  warehouselocationname: 'warehouse_location_name',
  discount: 'discount',
  rfpfnumber: 'rfpf_number',
  rfpf: 'rfpf_number',
  notes: 'notes',
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function excelDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime()) && text.length >= 8) return asDate.toISOString().slice(0, 10);
  return text;
}

function cellEmail(value: unknown): string {
  if (value && typeof value === 'object' && 'text' in (value as { text?: string })) {
    return String((value as { text?: string }).text || '').trim();
  }
  return String(value ?? '').trim();
}

function cellNum(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function parseHistoricalPoExcel(file: File): Promise<KAHistoricalExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find((name) => name.toLowerCase().replace(/[^a-z0-9]/g, '') === 'polines')
    || wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel has no sheets');
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });
  if (matrix.length < 2) throw new Error('Excel has no data rows');

  const headerRowIndex = matrix.findIndex((row) =>
    (row || []).some((cell) => normalizeHeader(String(cell || '')) === 'externalporef')
  );
  if (headerRowIndex < 0) throw new Error('Could not find external_po_ref column. Use the historical PO template.');

  const headers = (matrix[headerRowIndex] || []).map((cell) => FIELD_BY_HEADER[normalizeHeader(String(cell || ''))]);
  const rows: KAHistoricalExcelRow[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    const row: KAHistoricalExcelRow = { excel_row: i + 1 };
    headers.forEach((field, col) => {
      if (!field) return;
      const value = raw[col];
      if (value == null || value === '') return;
      if (field === 'order_date') row.order_date = excelDate(value);
      else if (field === 'kam_email') row.kam_email = cellEmail(value);
      else if (field === 'quantity' || field === 'unit_price' || field === 'line_total' || field === 'discount') {
        row[field] = cellNum(value);
      } else {
        (row as Record<string, unknown>)[field] = String(value).trim();
      }
    });
    rows.push(row);
  }

  const filled = fillDownHistoricalPoRows(rows);
  if (!filled.length) throw new Error('No purchase order lines found. Fill PO_Lines and keep the header row.');
  return filled;
}
