import * as XLSX from 'xlsx';

import type { KASalesRecordExcelRow, KASalesRecordOrderKind } from './clientSalesRecordTypes';
import { displayHeader, normalizeSalesHeader } from './unpivotClientSalesRecord';
import { displayRfpfCode } from './parseKeyAccountSalesOrderExcel';

export type SalesTrackerParseResult = {
  rows: KASalesRecordExcelRow[];
  sheets: { name: string; brand: string; orders: number; lines: number }[];
  agents: string[];
  tracker_rfpf_total: number;
  matched_rfpf: number;
  tracker_only: { rfpf: string; client_name: string; shop_name: string; product: string }[];
  brand_only_rfpf: string[];
  skipped_sheets: string[];
};

const SKIP_SHEET = /vizmin|grind|inventory\s*count/i;

const IDENTITY: Record<string, string> = {
  rfpf: 'rfpf_number',
  rfpfno: 'rfpf_number',
  rfpfnumber: 'rfpf_number',
  date: 'order_date',
  dateoforder: 'order_date',
  dateordered: 'order_date',
  datedelivered: 'delivery_date',
  agent: 'agent',
  shopowner: 'client_name',
  clientname: 'client_name',
  shop: 'shop_name',
  shopname: 'shop_name',
  tradename: 'shop_name',
  tradenamevapeshop: 'shop_name',
  vapeshop: 'shop_name',
  vapeshopname: 'shop_name',
  address: 'address_label',
  deliveryaddress: 'address_label',
  contact: 'contact_phone',
  contactnumber: 'contact_phone',
  category: 'client_category',
  province: 'province',
  city: 'city',
  wh: 'warehouse_location_name',
  warehouse: 'warehouse_location_name',
  amountpaid: 'payment_amount',
  paidamount: 'payment_amount',
  totalpaid: 'payment_amount',
  remainingbalance: 'remaining_balance',
  rembalance: 'remaining_balance',
  balance: 'remaining_balance',
  proofofpayment: 'proof_url',
  payment: 'excel_status',
  status: 'excel_status',
  remarks: 'notes',
  remarkss: 'notes',
  sinumber: 'si',
  sino: 'si',
  batchno: 'batch',
  inventoryconsignment: 'inventory_kind',
  paymentdate: 'payment_date',
  dateofpayment: 'payment_date',
  modeofpayment: 'payment_method',
  product: 'product',
};

const MARKER: Record<string, 'total_qty' | 'price' | 'amount'> = {
  totalqty: 'total_qty',
  totalpods: 'total_qty',
  totaldevice: 'total_qty',
  price: 'price',
  amount: 'amount',
  amt: 'amount',
  totalamt: 'amount',
  total: 'amount',
  totalamount: 'amount',
};

const IGNORE = new Set([
  'pods',
  'device',
  'year',
  'month',
  'week',
  'weekofmonth',
  'weeklychecking',
  'totaldue',
  'paid',
  'delivered',
  'commi',
  'commreleased',
  'commamount',
  'commtotal',
  'releaseddate',
  'discount',
  'incentivesreplacementrewards',
  'crnoarno',
]);

type Col = {
  index: number;
  header: string;
  role: 'identity' | 'flavor' | 'marker' | 'ignore';
  field?: string;
  marker?: 'total_qty' | 'price' | 'amount';
};

type QtyGroup = {
  flavors: { index: number; name: string }[];
  priceCol?: number;
  amountCol?: number;
  totalQtyCol?: number;
};

type TrackerHeader = {
  excel_row: number;
  rfpf_raw: string;
  rfpf_display: string;
  rfpf_key: string;
  order_date: string;
  agent: string;
  client_name: string;
  shop_name: string;
  product: string;
  product_key: string;
  client_category: string;
  province: string;
  inventory_kind?: KASalesRecordOrderKind;
  payment_amount: number;
  remaining_balance?: number;
  excel_status: string;
  payment_date: string;
  notes: string;
  discount: number;
};

type BrandLine = KASalesRecordExcelRow & { _rfpf_key: string; _brand_key: string };

export function normalizeRfpfKey(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function brandFromSheet(name: string) {
  const key = normalizeSalesHeader(name);
  if (key.includes('amz')) return 'AMZ';
  if (key.includes('xslim') || key.includes('slimbar')) return 'XSLIMBAR';
  if (key.includes('ultralite') || (key.includes('ultra') && key.includes('lite'))) return 'ULTRALITE';
  if (key.includes('xforge') || key === 'forge') return 'X-FORGE';
  if (key.includes('relx') && key.includes('go')) return 'RELX GO';
  if (key.includes('relx') && key.includes('ultra') && key.includes('pro')) return 'RELX ULTRA PRO';
  return displayHeader(name);
}

function brandKey(value: string) {
  const key = normalizeSalesHeader(value);
  if (!key) return '';
  if (key.includes('amz')) return 'amz';
  if (key.includes('xslim') || key.includes('slimbar')) return 'xslimbar';
  if (key.includes('ultralite') || (key.includes('ultra') && key.includes('lite'))) return 'ultralite';
  if (key.includes('xforge') || key === 'forge') return 'xforge';
  if (key.includes('chillax')) return 'chillax';
  if (key.includes('onebar') || key === 'one bar') return 'onebar';
  if (key === 'ultra') return 'ultra';
  if (key.includes('aero')) return 'aero';
  if (key.includes('relx') && key.includes('go')) return 'relxgo';
  if (key.includes('relx') && key.includes('ultra') && key.includes('pro')) return 'relxultrapro';
  if (key.includes('relx') && key.includes('pod')) return 'relxpodpro';
  return key;
}

function isTrackerSheet(name: string, headers: string[]) {
  if (/sales\s*tracker/i.test(name)) return true;
  const keys = headers.map((header) => normalizeSalesHeader(header));
  return keys.includes('rfpfnumber') && keys.includes('product') && keys.includes('pods');
}

function shouldSkipSheet(name: string) {
  return SKIP_SHEET.test(name);
}

function classify(header: string): Pick<Col, 'role' | 'field' | 'marker'> {
  const key = normalizeSalesHeader(header);
  if (!key || IGNORE.has(key)) return { role: 'ignore' };
  if (key === 'product') return { role: 'ignore' };
  const field = IDENTITY[key];
  if (field) return { role: 'identity', field };
  const marker = MARKER[key];
  if (marker) return { role: 'marker', marker };
  // Keep TOTAL QTY / TOTAL AMOUNT as markers above; ignore other TOTAL* summary cols.
  if (key.startsWith('total')) return { role: 'ignore' };
  return { role: 'flavor' };
}

function findHeaderRow(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const keys = (row || []).map((cell) => normalizeSalesHeader(String(cell || '')));
    const hasDate = keys.includes('date') || keys.includes('dateoforder') || keys.includes('dateordered');
    const hasAgent = keys.includes('agent');
    const hasParty =
      keys.includes('shopowner') ||
      keys.includes('clientname') ||
      keys.includes('vapeshop') ||
      keys.includes('tradename') ||
      keys.includes('tradenamevapeshop') ||
      keys.includes('shop') ||
      keys.includes('shopname');
    return hasDate && hasAgent && hasParty;
  });
}

function findTrackerHeaderRow(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const keys = (row || []).map((cell) => normalizeSalesHeader(String(cell || '')));
    return keys.includes('rfpfnumber') || keys.includes('rfpf');
  });
}

function cellAt(row: unknown[], columns: Col[], field: string) {
  const col = columns.find((item) => item.role === 'identity' && item.field === field);
  if (!col) return undefined;
  return row[col.index];
}

function parseNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value).replace(/₱/g, '').replace(/,/g, '').replace(/\s+/g, '').trim();
  if (!text || text === '-' || text === '—') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

function ymdLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return ymdLocal(value);
  if (typeof value === 'number' && value > 20000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = String(value).trim().replace(/Apirl/i, 'April').replace(/Sept/i, 'Sep');
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime()) && text.length >= 6) return ymdLocal(asDate);
  return '';
}

function parseKind(value: unknown): KASalesRecordOrderKind | undefined {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (text.includes('consign')) return 'consignment';
  if (text.includes('invent')) return 'standard';
  return undefined;
}

function excelStatus(value: unknown): string {
  const text = String(value || '').trim();
  const n = text.toLowerCase();
  if (!n) return '';
  if (n.includes('fully') || n === 'paid') return 'PAID';
  if (n.includes('partial') || n.includes('balance')) return 'w/BALANCE';
  if (n.includes('unpaid')) return 'UNPAID';
  if (n.includes('offset')) return 'OFFSET';
  return text;
}

function proofText(value: unknown): string {
  return String(value || '')
    .split(/\s+/)
    .filter((part) => /^https?:\/\//i.test(part))
    .join('\n');
}

function buildGroups(columns: Col[]): QtyGroup[] {
  const groups: QtyGroup[] = [];
  let current: QtyGroup = { flavors: [] };
  const close = () => {
    if (current.flavors.length) groups.push(current);
    current = { flavors: [] };
  };
  for (const col of columns) {
    if (col.role === 'flavor') {
      current.flavors.push({ index: col.index, name: displayHeader(col.header) });
      continue;
    }
    if (col.role === 'marker') {
      if (col.marker === 'price') current.priceCol = col.index;
      else if (col.marker === 'total_qty') current.totalQtyCol = col.index;
      else if (col.marker === 'amount') {
        current.amountCol = col.index;
        close();
      }
      continue;
    }
    if (current.flavors.length) close();
  }
  close();
  return groups;
}

function parseTrackerHeaders(matrix: unknown[][]): TrackerHeader[] {
  const headerRow = findTrackerHeaderRow(matrix);
  if (headerRow < 0) return [];
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  const keys = headers.map((header) => normalizeSalesHeader(header));
  const idx = {
    rfpf: keys.findIndex((key) => key === 'rfpfnumber' || key === 'rfpf' || key === 'rfpfno'),
    date: keys.findIndex((key) => key === 'date' || key === 'dateoforder'),
    agent: keys.findIndex((key) => key === 'agent'),
    client: keys.findIndex((key) => key === 'clientname'),
    shop: keys.findIndex((key) => key === 'tradename' || key === 'vapeshop' || key === 'shopname'),
    product: keys.findIndex((key) => key === 'product'),
    category: keys.findIndex((key) => key === 'category' || key === 'clientcategory'),
    province: keys.findIndex((key) => key === 'province'),
    kind: keys.findIndex((key) => key === 'inventoryconsignment'),
    paid: keys.findIndex((key) => key === 'totalpaid' || key === 'amountpaid' || key === 'paidamount'),
    rem: keys.findIndex((key) => key === 'rembalance' || key === 'remainingbalance' || key === 'balance'),
    status: keys.findIndex((key) => key === 'status' || key === 'payment'),
    payDate: keys.findIndex((key) => key === 'paymentdate' || key === 'dateofpayment'),
    notes: keys.findIndex((key) => key === 'remarks' || key === 'remarkss'),
    discount: keys.findIndex((key) => key === 'discount'),
  };
  if (idx.rfpf < 0) return [];

  const out: TrackerHeader[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const raw = String(cells[idx.rfpf] ?? '').trim();
    if (!raw) continue;
    const display = displayRfpfCode(raw);
    const key = normalizeRfpfKey(display || raw);
    if (!key) continue;
    const product = idx.product >= 0 ? String(cells[idx.product] ?? '').trim() : '';
    out.push({
      excel_row: i + 1,
      rfpf_raw: raw,
      rfpf_display: display || raw,
      rfpf_key: key,
      order_date: idx.date >= 0 ? parseDate(cells[idx.date]) : '',
      agent: idx.agent >= 0 ? String(cells[idx.agent] ?? '').trim() : '',
      client_name: idx.client >= 0 ? String(cells[idx.client] ?? '').trim() : '',
      shop_name: idx.shop >= 0 ? String(cells[idx.shop] ?? '').trim() : '',
      product,
      product_key: brandKey(product),
      client_category: idx.category >= 0 ? String(cells[idx.category] ?? '').trim() : '',
      province: idx.province >= 0 ? String(cells[idx.province] ?? '').trim() : '',
      inventory_kind: idx.kind >= 0 ? parseKind(cells[idx.kind]) : undefined,
      payment_amount: idx.paid >= 0 ? parseNumber(cells[idx.paid]) || 0 : 0,
      remaining_balance: idx.rem >= 0 ? parseNumber(cells[idx.rem]) : undefined,
      excel_status: idx.status >= 0 ? excelStatus(cells[idx.status]) : '',
      payment_date: idx.payDate >= 0 ? parseDate(cells[idx.payDate]) : '',
      notes: idx.notes >= 0 ? String(cells[idx.notes] ?? '').trim() : '',
      discount: idx.discount >= 0 ? parseNumber(cells[idx.discount]) || 0 : 0,
    });
  }
  return out;
}

function fillDownRfpf(matrix: unknown[][], headerRow: number, rfpfCol: number) {
  let last = '';
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const raw = String(cells[rfpfCol] ?? '').trim();
    if (raw) {
      last = raw;
      continue;
    }
    if (!last) continue;
    const hasParty =
      String(cells[0] ?? '').trim() ||
      // keep fill-down only when the row looks like an order line
      (cells.length > 4 && cells.slice(4, 8).some((cell) => String(cell ?? '').trim()));
    if (hasParty) cells[rfpfCol] = last;
  }
}

function brandSheetLines(name: string, matrix: unknown[][]): BrandLine[] {
  const headerRow = findHeaderRow(matrix);
  if (headerRow < 0) return [];
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  if (isTrackerSheet(name, headers)) return [];

  const columns: Col[] = headers.map((header, index) => ({ index, header, ...classify(header) }));
  const rfpfCol = columns.find((col) => col.role === 'identity' && col.field === 'rfpf_number');
  if (rfpfCol) fillDownRfpf(matrix, headerRow, rfpfCol.index);

  const groups = buildGroups(columns);
  const brand = brandFromSheet(name);
  const _brand_key = brandKey(brand);
  const rows: BrandLine[] = [];

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const client = String(cellAt(cells, columns, 'client_name') || '').trim();
    const shop = String(cellAt(cells, columns, 'shop_name') || '').trim();
    const agent = String(cellAt(cells, columns, 'agent') || '').trim();
    const orderDate = parseDate(cellAt(cells, columns, 'order_date'));
    const rfpfRaw = String(cellAt(cells, columns, 'rfpf_number') || '').trim();
    const rfpfDisplay = displayRfpfCode(rfpfRaw);
    const rfpf_key = normalizeRfpfKey(rfpfDisplay || rfpfRaw);
    if (!client && !shop && !orderDate && !rfpf_key) continue;
    if (!rfpf_key) continue;

    const si = displayRfpfCode(String(cellAt(cells, columns, 'si') || '').trim());
    const notes = [si, String(cellAt(cells, columns, 'notes') || '').trim()].filter(Boolean).join('\n');
    const status = excelStatus(cellAt(cells, columns, 'excel_status'));
    const paid = parseNumber(cellAt(cells, columns, 'payment_amount')) || 0;
    const remaining = parseNumber(cellAt(cells, columns, 'remaining_balance'));
    const address = String(cellAt(cells, columns, 'address_label') || '').trim();
    const contact = String(cellAt(cells, columns, 'contact_phone') || '').trim();
    const delivery = parseDate(cellAt(cells, columns, 'delivery_date')) || orderDate;
    const warehouse = String(cellAt(cells, columns, 'warehouse_location_name') || '').trim();
    const paymentDate = parseDate(cellAt(cells, columns, 'payment_date'));
    const sourceKey = `${name}|${i + 1}`;
    let pushed = 0;

    for (const group of groups) {
      const listed = group.priceCol != null ? parseNumber(cells[group.priceCol]) : undefined;
      const amount = group.amountCol != null ? parseNumber(cells[group.amountCol]) : undefined;
      const totalQty = group.totalQtyCol != null ? parseNumber(cells[group.totalQtyCol]) : undefined;
      const flavorQty = group.flavors.map((flavor) => ({
        flavor,
        qty: parseNumber(cells[flavor.index]) || 0,
      }));
      const flavorSum = flavorQty.reduce((sum, item) => sum + (item.qty > 0 ? item.qty : 0), 0);
      const unit =
        listed != null && listed > 0
          ? listed
          : amount != null && flavorSum > 0
            ? amount / flavorSum
            : amount != null && totalQty && totalQty > 0
              ? amount / totalQty
              : 0;

      for (const item of flavorQty) {
        if (!(item.qty > 0)) continue;
        rows.push({
          excel_row: i + 1,
          sheet_name: name,
          source_row_key: sourceKey,
          external_po_ref: rfpfDisplay || rfpfRaw,
          rfpf_number: rfpfDisplay || rfpfRaw,
          _rfpf_key: rfpf_key,
          _brand_key,
          order_date: orderDate || undefined,
          expected_delivery_date: delivery || undefined,
          client_name: client || undefined,
          shop_name: shop || undefined,
          address_label: address || undefined,
          contact_phone: contact || undefined,
          warehouse_location_name: warehouse || undefined,
          brand_name: brand,
          variant_name: item.flavor.name,
          quantity: item.qty,
          unit_price: Math.round(unit * 100) / 100,
          line_total: Math.round(item.qty * unit * 100) / 100,
          agent_name: agent || undefined,
          notes: notes || undefined,
          inventory_kind: parseKind(cellAt(cells, columns, 'inventory_kind')),
          excel_status: status || undefined,
          payment_amount: paid,
          payment_date: paymentDate || undefined,
          remaining_balance: remaining,
          proof_url: proofText(cellAt(cells, columns, 'proof_url')) || undefined,
        });
        pushed += 1;
      }
    }

    if (!pushed) {
      // keep RFPF visible for Soft Check even when flavors are blank
      rows.push({
        excel_row: i + 1,
        sheet_name: name,
        source_row_key: sourceKey,
        external_po_ref: rfpfDisplay || rfpfRaw,
        rfpf_number: rfpfDisplay || rfpfRaw,
        _rfpf_key: rfpf_key,
        _brand_key,
        order_date: orderDate || undefined,
        client_name: client || undefined,
        shop_name: shop || undefined,
        brand_name: brand,
        variant_name: '',
        quantity: 0,
        unit_price: 0,
        agent_name: agent || undefined,
        notes: notes || undefined,
        excel_status: status || undefined,
        payment_amount: paid,
      });
    }
  }

  return rows;
}

function pickBrandLines(header: TrackerHeader, byRfpf: Map<string, BrandLine[]>): BrandLine[] {
  // Same RFPF on any brand sheet = all brand/variant lines for that PO.
  const all = byRfpf.get(header.rfpf_key) || [];
  return all.filter((line) => (Number(line.quantity) || 0) > 0);
}

export function parseKeyAccountSalesTrackerBuffer(buffer: ArrayBuffer): SalesTrackerParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Excel has no sheets');

  const trackerHeaders: TrackerHeader[] = [];
  const brandLines: BrandLine[] = [];
  const sheets: SalesTrackerParseResult['sheets'] = [];
  const skipped_sheets: string[] = [];

  for (const name of workbook.SheetNames) {
    if (shouldSkipSheet(name)) {
      skipped_sheets.push(name);
      continue;
    }
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    const headerRow = findHeaderRow(matrix);
    const headers = headerRow >= 0 ? (matrix[headerRow] || []).map((cell) => String(cell ?? '')) : [];

    if (headerRow >= 0 && isTrackerSheet(name, headers)) {
      trackerHeaders.push(...parseTrackerHeaders(matrix));
      continue;
    }

    // tracker may not match findHeaderRow (no agent+party in same shape) — still detect by name/columns
    if (/sales\s*tracker/i.test(name)) {
      trackerHeaders.push(...parseTrackerHeaders(matrix));
      continue;
    }

    const parsed = brandSheetLines(name, matrix);
    if (!parsed.length && headerRow < 0) continue;
    brandLines.push(...parsed);
    const orders = new Set(parsed.map((row) => row.rfpf_key)).size;
    sheets.push({ name, brand: brandFromSheet(name), orders, lines: parsed.filter((r) => (Number(r.quantity) || 0) > 0).length });
  }

  if (!trackerHeaders.length) {
    throw new Error('No B1G Sales Tracker sheet found. Upload the Key Account Sales 2026 workbook.');
  }

  // One PO per RFPF — keep first tracker row when Excel repeats the same RFPF.
  const uniqueHeaders: TrackerHeader[] = [];
  const seenRfpf = new Set<string>();
  for (const header of trackerHeaders) {
    if (seenRfpf.has(header.rfpf_key)) continue;
    seenRfpf.add(header.rfpf_key);
    uniqueHeaders.push(header);
  }

  const byRfpf = new Map<string, BrandLine[]>();
  for (const line of brandLines) {
    if (!byRfpf.has(line._rfpf_key)) byRfpf.set(line._rfpf_key, []);
    byRfpf.get(line._rfpf_key)!.push(line);
  }

  const usedBrandKeys = new Set<string>();
  const rows: KASalesRecordExcelRow[] = [];
  const tracker_only: SalesTrackerParseResult['tracker_only'] = [];
  let matched_rfpf = 0;

  for (const header of uniqueHeaders) {
    const lines = pickBrandLines(header, byRfpf);
    const qtyLines = lines.filter((line) => (Number(line.quantity) || 0) > 0);

    if (!qtyLines.length) {
      tracker_only.push({
        rfpf: header.rfpf_display,
        client_name: header.client_name,
        shop_name: header.shop_name,
        product: header.product,
      });
      rows.push({
        excel_row: header.excel_row,
        sheet_name: 'B1G Sales Tracker',
        source_row_key: `tracker|${header.excel_row}`,
        external_po_ref: header.rfpf_display,
        rfpf_number: header.rfpf_display,
        order_date: header.order_date || undefined,
        client_name: header.client_name || undefined,
        shop_name: header.shop_name || undefined,
        client_category: header.client_category || undefined,
        province: header.province || undefined,
        brand_name: header.product || undefined,
        variant_name: '',
        quantity: 0,
        unit_price: 0,
        agent_name: header.agent || undefined,
        notes: header.notes
          ? `${header.notes}\nNo brand-sheet flavor lines for ${header.product || 'product'}`
          : `No brand-sheet flavor lines for ${header.product || 'product'}`,
        inventory_kind: header.inventory_kind,
        excel_status: header.excel_status || undefined,
        payment_amount: header.payment_amount,
        payment_date: header.payment_date || undefined,
        remaining_balance: header.remaining_balance,
        discount: header.discount || undefined,
      });
      continue;
    }

    matched_rfpf += 1;
    const proofUrls = [
      ...new Set(qtyLines.map((line) => String(line.proof_url || '').trim()).filter(Boolean)),
    ].join('\n');

    qtyLines.forEach((line, index) => {
      usedBrandKeys.add(`${line._rfpf_key}|${line.source_row_key}`);
      const { _rfpf_key: _rk, _brand_key: _bk, ...rest } = line;
      rows.push({
        ...rest,
        excel_row: line.excel_row,
        sheet_name: line.sheet_name,
        source_row_key: line.source_row_key,
        external_po_ref: header.rfpf_display,
        rfpf_number: header.rfpf_display,
        order_date: header.order_date || line.order_date,
        expected_delivery_date: line.expected_delivery_date || header.order_date || undefined,
        client_name: header.client_name || line.client_name,
        shop_name: header.shop_name || line.shop_name,
        client_category: header.client_category || line.client_category,
        province: header.province || line.province,
        agent_name: header.agent || line.agent_name,
        inventory_kind: header.inventory_kind || line.inventory_kind,
        excel_status: header.excel_status || line.excel_status,
        // payment once per tracker RFPF (first line only) so dry-run does not multiply paid
        payment_amount: index === 0 ? header.payment_amount || line.payment_amount || 0 : 0,
        payment_date: header.payment_date || line.payment_date,
        remaining_balance: header.remaining_balance ?? line.remaining_balance,
        discount: index === 0 ? header.discount || undefined : undefined,
        notes: [header.notes, line.notes].filter(Boolean).join('\n') || undefined,
        proof_url: index === 0 ? proofUrls || line.proof_url : undefined,
      });
    });
  }

  const brand_only_rfpf = [...byRfpf.keys()]
    .filter((key) => {
      const lines = byRfpf.get(key) || [];
      return lines.some((line) => (Number(line.quantity) || 0) > 0 && !usedBrandKeys.has(`${line._rfpf_key}|${line.source_row_key}`));
    })
    .map((key) => {
      const sample = (byRfpf.get(key) || [])[0];
      return displayRfpfCode(String(sample?.rfpf_number || key)) || key;
    });

  if (!rows.length) {
    throw new Error('No sales-tracker rows found to import.');
  }

  const agents = [...new Set(rows.map((row) => String(row.agent_name || '').trim()).filter(Boolean))];
  return {
    rows,
    sheets,
    agents,
    tracker_rfpf_total: uniqueHeaders.length,
    matched_rfpf,
    tracker_only,
    brand_only_rfpf,
    skipped_sheets,
  };
}

export async function parseKeyAccountSalesTrackerExcel(file: File): Promise<SalesTrackerParseResult> {
  const buffer = await file.arrayBuffer();
  return parseKeyAccountSalesTrackerBuffer(buffer);
}
