import * as XLSX from 'xlsx';

import type { KASalesRecordExcelRow, KASalesRecordOrderKind } from './clientSalesRecordTypes';
import { displayHeader, normalizeSalesHeader } from './unpivotClientSalesRecord';

export type SalesOrderParseResult = {
  rows: KASalesRecordExcelRow[];
  sheets: { name: string; brand: string; orders: number; lines: number }[];
  agents: string[];
  skipped_tracker: string[];
  tracker_rfpf_matched: number;
  tracker_rfpf_total: number;
};

const IDENTITY: Record<string, string> = {
  date: 'order_date',
  dateoforder: 'order_date',
  dateordered: 'order_date',
  datedelivered: 'delivery_date',
  agent: 'agent',
  shopowner: 'client_name',
  clientname: 'client_name',
  vapeshop: 'shop_name',
  shopname: 'shop_name',
  tradename: 'shop_name',
  address: 'address_label',
  deliveryaddress: 'address_label',
  contact: 'contact_phone',
  contactnumber: 'contact_phone',
  category: 'client_category',
  province: 'province',
  city: 'city',
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
};

const MARKER: Record<string, 'total_qty' | 'price' | 'amount'> = {
  totalqty: 'total_qty',
  totalpods: 'total_qty',
  totaldevice: 'total_qty',
  price: 'price',
  amount: 'amount',
  amt: 'amount',
  totalamt: 'amount',
};

const IGNORE = new Set([
  'product',
  'pods',
  'warehouse',
  'year',
  'month',
  'week',
  'weekofmonth',
  'weeklychecking',
  'totalquantity',
  'totalamount',
  'totaldue',
  'paid',
  'delivered',
  'commi',
  'commreleased',
  'commamount',
  'commtotal',
  'releaseddate',
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

type TrackerRfpfRow = {
  rfpf_raw: string;
  rfpf_display: string;
  date: string;
  client: string;
  shop: string;
  product: string;
};

function brandFromSheet(name: string) {
  const key = normalizeSalesHeader(name);
  if (key.includes('amz')) return 'AMZ';
  if (key.includes('xslim') || key.includes('slimbar')) return 'XSLIMBAR';
  if (key.includes('ultralite')) return 'ULTRALITE';
  return displayHeader(name);
}

function isTrackerSheet(name: string, headers: string[]) {
  if (/sales\s*tracker/i.test(name)) return true;
  const keys = headers.map((header) => normalizeSalesHeader(header));
  return keys.includes('rfpfnumber') && keys.includes('product') && keys.includes('pods');
}

/**
 * Read the Excel RFPF NUMBER column as-is for Soft check.
 * Any non-empty cell text counts (SI, RFPF-, Batch 1 SI …). Empty → "".
 * Multi-line cells are joined with a space; money amounts are dropped.
 */
export function displayRfpfCode(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const lines = text
    .split(/[\n\r]+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) =>
      line
        // Drop trailing/embedded money amounts like "1,150,720" or "₱49,000"
        .replace(/₱?\s*\d{1,3}(,\d{3})+(\.\d+)?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  if (!lines.length) return '';

  const rfpf = text.match(/RFPF\s*[-–—]?\s*(\d+)/i);
  const si = text.match(/\bS\.?I\.?\s*#?\s*[-–—]?\s*(\d+)\b/i);
  const batch = text.match(/\bBatch\s*\d+(\s*\([^)]*\))?/i);

  // Prefer structured rebuild when we recognize SI / RFPF tokens.
  if (rfpf || si) {
    const parts: string[] = [];
    if (batch && si && !rfpf) {
      // Keep "Batch 1 SI 0039" when that is what Excel has.
      parts.push(`${batch[0].replace(/\s+/g, ' ').trim()} SI ${si[1]}`);
    } else {
      if (si) parts.push(`SI ${si[1]}`);
      if (rfpf) parts.push(`RFPF-${rfpf[1]}`);
    }
    return parts.join(' ');
  }

  // Fallback: cleaned cell text (still from the RFPF column).
  return lines.join(' ');
}

function normParty(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normProduct(value: string) {
  const key = normalizeSalesHeader(value);
  if (key.includes('amz')) return 'amz';
  if (key.includes('xslim') || key.includes('slimbar')) return 'xslimbar';
  if (key.includes('ultralite') || (key.includes('ultra') && key.includes('lite'))) return 'ultralite';
  return key;
}

function classify(header: string): Pick<Col, 'role' | 'field' | 'marker'> {
  const key = normalizeSalesHeader(header);
  if (!key || IGNORE.has(key)) return { role: 'ignore' };
  const field = IDENTITY[key];
  if (field) return { role: 'identity', field };
  const marker = MARKER[key];
  if (marker) return { role: 'marker', marker };
  return { role: 'flavor' };
}

function findHeaderRow(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const keys = (row || []).map((cell) => normalizeSalesHeader(String(cell || '')));
    const hasDate = keys.includes('date') || keys.includes('dateoforder');
    const hasAgent = keys.includes('agent');
    const hasParty =
      keys.includes('shopowner') ||
      keys.includes('clientname') ||
      keys.includes('vapeshop') ||
      keys.includes('tradename');
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

function orderRef(parts: {
  date: string;
  agent: string;
  client: string;
  shop: string;
  brand: string;
  si: string;
  batch: string;
  excelRow: number;
}) {
  return [
    parts.date || 'NO-DATE',
    parts.agent || 'NO-AGENT',
    parts.client || 'NO-CLIENT',
    parts.shop || 'NO-SHOP',
    parts.brand,
    parts.si,
    parts.batch,
    `r${parts.excelRow}`,
  ]
    .map((part) => String(part || '').replace(/\|/g, ' ').trim())
    .filter(Boolean)
    .join('|');
}

function parseTrackerRfpfRows(matrix: unknown[][]): TrackerRfpfRow[] {
  const headerRow = findTrackerHeaderRow(matrix);
  if (headerRow < 0) return [];
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  const keys = headers.map((header) => normalizeSalesHeader(header));
  const idx = {
    rfpf: keys.findIndex((key) => key === 'rfpfnumber' || key === 'rfpf'),
    date: keys.findIndex((key) => key === 'date' || key === 'dateoforder'),
    client: keys.findIndex((key) => key === 'clientname'),
    shop: keys.findIndex((key) => key === 'tradename' || key === 'vapeshop' || key === 'shopname'),
    product: keys.findIndex((key) => key === 'product'),
  };
  if (idx.rfpf < 0) return [];

  const out: TrackerRfpfRow[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const raw = String(cells[idx.rfpf] ?? '').trim();
    if (!raw) continue;
    const display = displayRfpfCode(raw);
    if (!display) continue;
    out.push({
      rfpf_raw: raw,
      rfpf_display: display,
      date: idx.date >= 0 ? parseDate(cells[idx.date]) : '',
      client: idx.client >= 0 ? String(cells[idx.client] ?? '').trim() : '',
      shop: idx.shop >= 0 ? String(cells[idx.shop] ?? '').trim() : '',
      product: idx.product >= 0 ? String(cells[idx.product] ?? '').trim() : '',
    });
  }
  return out;
}

function matchTrackerRfpf(
  row: Pick<KASalesRecordExcelRow, 'order_date' | 'client_name' | 'shop_name' | 'brand_name' | 'rfpf_number'>,
  tracker: TrackerRfpfRow[]
): string {
  const fromSheet = displayRfpfCode(String(row.rfpf_number || ''));
  const date = String(row.order_date || '').slice(0, 10);
  const client = normParty(String(row.client_name || ''));
  const shop = normParty(String(row.shop_name || ''));
  const brand = normProduct(String(row.brand_name || ''));

  let fromTracker = '';
  let fromTrackerRaw = '';
  if (tracker.length) {
    const sameBrand = tracker.filter((item) => {
      const product = normProduct(item.product);
      if (!brand) return true;
      if (!product) return true;
      return product === brand || product.includes(brand) || brand.includes(product);
    });

    const scored = sameBrand
      .map((item) => {
        let score = 0;
        if (date && item.date === date) score += 4;
        if (client && normParty(item.client) === client) score += 3;
        if (shop && normParty(item.shop) === shop) score += 3;
        if (client && shop && normParty(item.client) === client && normParty(item.shop) === shop) score += 2;
        if (client && normParty(item.client).includes(client)) score += 1;
        if (shop && normParty(item.shop).includes(shop)) score += 1;
        if (/RFPF\s*[-–—]?\s*\d+/i.test(item.rfpf_raw)) score += 3;
        if (String(item.rfpf_raw || '').trim()) score += 1;
        return { item, score };
      })
      .filter((entry) => entry.score >= 7)
      .sort((a, b) => b.score - a.score);

    if (scored[0]) {
      fromTrackerRaw = scored[0].item.rfpf_raw;
      fromTracker = displayRfpfCode(fromTrackerRaw);
    }
  }

  // Prefer tracker RFPF NUMBER column whenever it has text; else product-sheet SI cell.
  if (fromTracker) return fromTracker;
  if (fromSheet) return fromSheet;
  return '';
}

function applyTrackerRfpf(rows: KASalesRecordExcelRow[], tracker: TrackerRfpfRow[]) {
  let matched = 0;
  const next = rows.map((row) => {
    const rfpf = matchTrackerRfpf(row, tracker);
    if (rfpf) matched += 1;
    return { ...row, rfpf_number: rfpf };
  });
  return { rows: next, matched };
}

function sheetRows(name: string, matrix: unknown[][]): KASalesRecordExcelRow[] {
  const headerRow = findHeaderRow(matrix);
  if (headerRow < 0) return [];
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  if (isTrackerSheet(name, headers)) return [];
  const columns: Col[] = headers.map((header, index) => ({ index, header, ...classify(header) }));
  const groups = buildGroups(columns);
  const brand = brandFromSheet(name);
  const rows: KASalesRecordExcelRow[] = [];

  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const client = String(cellAt(cells, columns, 'client_name') || '').trim();
    const shop = String(cellAt(cells, columns, 'shop_name') || '').trim();
    const agent = String(cellAt(cells, columns, 'agent') || '').trim();
    const orderDate = parseDate(cellAt(cells, columns, 'order_date'));
    if (!client && !shop && !orderDate) continue;

    const si = displayRfpfCode(String(cellAt(cells, columns, 'si') || '').trim());
    const batch = String(cellAt(cells, columns, 'batch') || '').trim();
    const blankHeaderNote = headers[0]?.trim() ? '' : String(cells[0] || '').trim();
    const notes = [blankHeaderNote, String(cellAt(cells, columns, 'notes') || '').trim()].filter(Boolean).join('\n');
    const status = excelStatus(cellAt(cells, columns, 'excel_status'));
    const paid = parseNumber(cellAt(cells, columns, 'payment_amount')) || 0;
    const remaining = parseNumber(cellAt(cells, columns, 'remaining_balance'));
    const address = String(cellAt(cells, columns, 'address_label') || '').trim();
    const contact = String(cellAt(cells, columns, 'contact_phone') || '').trim();
    const delivery = parseDate(cellAt(cells, columns, 'delivery_date')) || orderDate;
    const ref = orderRef({ date: orderDate, agent, client, shop, brand, si, batch, excelRow: i + 1 });
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
          external_po_ref: ref,
          rfpf_number: si,
          order_date: orderDate || undefined,
          expected_delivery_date: delivery || undefined,
          client_name: client || undefined,
          shop_name: shop || undefined,
          address_label: address || undefined,
          contact_phone: contact || undefined,
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
          remaining_balance: remaining,
          proof_url: proofText(cellAt(cells, columns, 'proof_url')) || undefined,
        });
        pushed += 1;
      }
    }

    if (!pushed && (client || shop)) {
      rows.push({
        excel_row: i + 1,
        sheet_name: name,
        source_row_key: sourceKey,
        external_po_ref: ref,
        rfpf_number: si,
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

export function parseKeyAccountSalesOrderBuffer(buffer: ArrayBuffer): SalesOrderParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Excel has no sheets');
  const rows: KASalesRecordExcelRow[] = [];
  const sheets: SalesOrderParseResult['sheets'] = [];
  const skipped: string[] = [];
  const trackerRows: TrackerRfpfRow[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    const headerRow = findHeaderRow(matrix);
    const headers = headerRow >= 0 ? (matrix[headerRow] || []).map((cell) => String(cell ?? '')) : [];
    if (headerRow >= 0 && isTrackerSheet(name, headers)) {
      skipped.push(name);
      trackerRows.push(...parseTrackerRfpfRows(matrix));
      continue;
    }
    const parsed = sheetRows(name, matrix);
    if (!parsed.length && headerRow < 0) continue;
    rows.push(...parsed);
    const orders = new Set(parsed.map((row) => row.external_po_ref)).size;
    sheets.push({ name, brand: brandFromSheet(name), orders, lines: parsed.length });
  }

  if (!rows.length) {
    throw new Error('No sales-order rows found. Use the Key Account Sales Order workbook (product sheets, not the tracker).');
  }

  const linked = applyTrackerRfpf(rows, trackerRows);
  const agents = [...new Set(linked.rows.map((row) => String(row.agent_name || '').trim()).filter(Boolean))];
  return {
    rows: linked.rows,
    sheets,
    agents,
    skipped_tracker: skipped,
    tracker_rfpf_matched: linked.matched,
    tracker_rfpf_total: trackerRows.length,
  };
}

export async function parseKeyAccountSalesOrderExcel(file: File): Promise<SalesOrderParseResult> {
  const buffer = await file.arrayBuffer();
  return parseKeyAccountSalesOrderBuffer(buffer);
}
