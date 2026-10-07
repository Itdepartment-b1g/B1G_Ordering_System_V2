import * as XLSX from 'xlsx';

import type { KASalesRecordExcelRow, KASalesRecordOrderKind } from './clientSalesRecordTypes';
import { displayHeader, normalizeRfpf, normalizeSalesHeader } from './unpivotClientSalesRecord';

export type SalesOrderAmountMismatch = {
  external_po_ref: string;
  rfpf_number: string;
  order_date: string;
  client: string;
  shop: string;
  brand: string;
  sheet_name: string;
  sheet_total_amount: number;
  tracker_total_amt: number;
  difference: number;
};

/** Tracker RFPF with no matching brand / variant sheet breakdown. */
export type SalesOrderNoBrandSheet = {
  rfpf_number: string;
  order_date: string;
  client: string;
  shop: string;
  product: string;
  tracker_total_amt: number | null;
};

export type SalesOrderParseResult = {
  rows: KASalesRecordExcelRow[];
  sheets: { name: string; brand: string; orders: number; lines: number }[];
  agents: string[];
  skipped_tracker: string[];
  tracker_rfpf_matched: number;
  tracker_rfpf_total: number;
  /** Tracker TOTAL AMT vs brand-sheet TOTAL AMOUNT (hard-block on Soft Check). */
  amount_mismatches: SalesOrderAmountMismatch[];
  /** Tracker rows with no flavor breakdown on any brand sheet. */
  no_brand_sheet: SalesOrderNoBrandSheet[];
};

const AMOUNT_TOLERANCE = 0.01;

/** Optional aliases when sheet name / tracker PRODUCT wording differs. Unknown sheets use cleaned sheet name. */
const BRAND_ALIAS: Record<string, string> = {
  amz: 'AMZ',
  xslimbar: 'XSLIMBAR',
  xslimbar1: 'XSLIMBAR',
  slimbar: 'XSLIMBAR',
  slimbar1: 'XSLIMBAR',
  ultralite: 'ULTRALITE',
  ultralitebatteries: 'ULTRALITE',
  ultra: 'ULTRALITE',
  onebar: 'ONE BAR',
  relxgo: 'RELX GO',
  xforge: 'FORGE',
  forge: 'FORGE',
};

const IDENTITY: Record<string, string> = {
  rfpf: 'rfpf',
  rfpfno: 'rfpf',
  rfpfnumber: 'rfpf',
  date: 'order_date',
  dateoforder: 'order_date',
  dateordered: 'order_date',
  datedelivered: 'delivery_date',
  agent: 'agent',
  shopowner: 'client_name',
  clientname: 'client_name',
  vapeshop: 'shop_name',
  shopname: 'shop_name',
  shop: 'shop_name',
  tradename: 'shop_name',
  tradenamevapeshop: 'shop_name',
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
  /** Brand-sheet order total — compared to tracker TOTAL AMT. */
  totalamount: 'sheet_total_amount',
  totalamt: 'sheet_total_amount',
};

const MARKER: Record<string, 'total_qty' | 'price' | 'amount' | 'total'> = {
  totalqty: 'total_qty',
  totalpods: 'total_qty',
  totaldevice: 'total_qty',
  totalquantity: 'total_qty',
  price: 'price',
  amount: 'amount',
  amt: 'amount',
  total: 'total',
};

const IGNORE = new Set([
  'product',
  'pods',
  'warehouse',
  'wh',
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
  'incentivesreplacementrewards',
  'incentives',
  'crarno',
  'crnoarno',
  'modeofpayment',
  'dateofpayment',
  'paymentdate',
]);

type Col = {
  index: number;
  header: string;
  role: 'identity' | 'flavor' | 'marker' | 'ignore';
  field?: string;
  marker?: 'total_qty' | 'price' | 'amount' | 'total';
};

type QtyGroup = {
  flavors: { index: number; name: string }[];
  priceCol?: number;
  amountCol?: number;
  totalQtyCol?: number;
};

type TrackerRow = {
  rfpf_raw: string;
  rfpf_display: string;
  rfpf_key: string;
  /** Digits-only doc id so Batch 1 SI-0037 matches #0037 / SI 0037. */
  doc_digits: string;
  date: string;
  agent: string;
  client: string;
  shop: string;
  product: string;
  total_amt: number | null;
};

type SheetOrderTotals = {
  external_po_ref: string;
  sheet_name: string;
  brand: string;
  order_date: string;
  agent: string;
  client: string;
  shop: string;
  rfpf_number: string;
  doc_digits: string;
  sheet_total_amount: number;
};

type MatchProbe = {
  rfpf_number?: string;
  order_date?: string;
  agent_name?: string;
  client_name?: string;
  brand_name?: string;
};

function brandFromSheet(name: string) {
  const stripped = String(name || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b(batteries|battery|disposable|devices?|pods?)\b/gi, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const key = normalizeSalesHeader(stripped || name);
  if (BRAND_ALIAS[key]) return BRAND_ALIAS[key];
  for (const [aliasKey, brand] of Object.entries(BRAND_ALIAS)) {
    if (key.includes(aliasKey)) return brand;
  }
  return displayHeader(stripped || name) || displayHeader(name);
}

function isTrackerSheet(name: string, headers: string[]) {
  if (/sales\s*tracker/i.test(name)) return true;
  const keys = headers.map((header) => normalizeSalesHeader(header));
  return keys.includes('rfpfnumber') && keys.includes('product') && keys.includes('pods');
}

/**
 * Read the Excel RFPF NUMBER / SI column for Soft check.
 * Handles RFPF-0000193, RFPF0000193, Batch 1 SI-0037, #0037, SI 0037.
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
        .replace(/₱?\s*\d{1,3}(,\d{3})+(\.\d+)?/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean);

  if (!lines.length) return '';

  const rfpf = text.match(/RFPF\s*[-–—]?\s*(\d+)/i);
  const si = text.match(/\bS\.?I\.?\s*#?\s*[-–—]?\s*(\d+)\b/i);
  const hashSi = text.match(/#\s*(\d+)\b/);
  const batch = text.match(/\bBatch\s*\d+(\s*\([^)]*\))?/i);

  if (rfpf || si) {
    const parts: string[] = [];
    if (batch && si && !rfpf) {
      parts.push(`${batch[0].replace(/\s+/g, ' ').trim()} SI ${si[1]}`);
    } else {
      if (si) parts.push(`SI ${si[1]}`);
      if (rfpf) parts.push(`RFPF-${rfpf[1]}`);
    }
    return parts.join(' ');
  }

  // Brand sheets often store only "#0037" in S.I. NUMBER.
  if (hashSi) {
    if (batch) return `${batch[0].replace(/\s+/g, ' ').trim()} SI ${hashSi[1]}`;
    return `SI ${hashSi[1]}`;
  }

  return lines.join(' ');
}

/**
 * Digits-only document id for matching.
 * Batch 1 SI-0037, #0037, SI 0037, RFPF-0000193 → comparable number strings.
 */
export function extractDocDigits(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  const rfpf = text.match(/RFPF\s*[-–—]?\s*(\d+)/i);
  if (rfpf) return String(Number(rfpf[1]));
  const si = text.match(/\bS\.?I\.?\s*#?\s*[-–—]?\s*(\d+)\b/i);
  if (si) return String(Number(si[1]));
  const hash = text.match(/#\s*(\d+)\b/);
  if (hash) return String(Number(hash[1]));
  // Bare numeric cell
  if (/^\d+$/.test(text.replace(/^0+/, '') || '0') || /^\d+$/.test(text)) {
    return String(Number(text));
  }
  return '';
}

function normParty(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normProduct(value: string) {
  const stripped = String(value || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\b(batteries|battery|disposable|devices?|pods?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const key = normalizeSalesHeader(stripped || value);
  if (BRAND_ALIAS[key]) return normalizeSalesHeader(BRAND_ALIAS[key]);
  for (const [aliasKey, brand] of Object.entries(BRAND_ALIAS)) {
    if (key.includes(aliasKey)) return normalizeSalesHeader(brand);
  }
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
    const hasDate =
      keys.includes('date') ||
      keys.includes('dateoforder') ||
      keys.includes('dateordered');
    const hasRfpf =
      keys.includes('rfpf') ||
      keys.includes('rfpfno') ||
      keys.includes('rfpfnumber');
    const hasAgent = keys.includes('agent');
    const hasParty =
      keys.includes('shopowner') ||
      keys.includes('clientname') ||
      keys.includes('vapeshop') ||
      keys.includes('tradename') ||
      keys.includes('tradenamevapeshop') ||
      keys.includes('shop') ||
      keys.includes('shopname');
    return (hasDate || hasRfpf) && hasAgent && hasParty;
  });
}

function findTrackerHeaderRow(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const keys = (row || []).map((cell) => normalizeSalesHeader(String(cell || '')));
    return keys.includes('rfpfnumber') || keys.includes('rfpf') || keys.includes('rfpfno');
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
      } else if (col.marker === 'total') {
        // "TOTAL" after flavors: qty summary if none yet, otherwise amount (AMZ 2026 style).
        if (current.priceCol == null && current.totalQtyCol == null && current.amountCol == null) {
          current.totalQtyCol = col.index;
        } else {
          current.amountCol = col.index;
          close();
        }
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

function parseTrackerRows(matrix: unknown[][]): TrackerRow[] {
  const headerRow = findTrackerHeaderRow(matrix);
  if (headerRow < 0) return [];
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  const keys = headers.map((header) => normalizeSalesHeader(header));
  const idx = {
    rfpf: keys.findIndex((key) => key === 'rfpfnumber' || key === 'rfpf' || key === 'rfpfno'),
    date: keys.findIndex((key) => key === 'date' || key === 'dateoforder' || key === 'dateordered'),
    agent: keys.findIndex((key) => key === 'agent'),
    client: keys.findIndex((key) => key === 'clientname'),
    shop: keys.findIndex((key) => key === 'tradename' || key === 'vapeshop' || key === 'shopname' || key === 'shop'),
    product: keys.findIndex((key) => key === 'product'),
    totalAmt: keys.findIndex((key) => key === 'totalamt' || key === 'totalamount'),
  };
  if (idx.rfpf < 0) return [];

  const out: TrackerRow[] = [];
  for (let i = headerRow + 1; i < matrix.length; i++) {
    const cells = matrix[i] || [];
    const raw = String(cells[idx.rfpf] ?? '').trim();
    if (!raw) continue;
    const display = displayRfpfCode(raw);
    if (!display) continue;
    const totalAmt = idx.totalAmt >= 0 ? parseNumber(cells[idx.totalAmt]) : undefined;
    out.push({
      rfpf_raw: raw,
      rfpf_display: display,
      rfpf_key: normalizeRfpf(display) || normalizeRfpf(raw),
      doc_digits: extractDocDigits(raw) || extractDocDigits(display),
      date: idx.date >= 0 ? parseDate(cells[idx.date]) : '',
      agent: idx.agent >= 0 ? String(cells[idx.agent] ?? '').trim() : '',
      client: idx.client >= 0 ? String(cells[idx.client] ?? '').trim() : '',
      shop: idx.shop >= 0 ? String(cells[idx.shop] ?? '').trim() : '',
      product: idx.product >= 0 ? String(cells[idx.product] ?? '').trim() : '',
      total_amt: totalAmt != null && Number.isFinite(totalAmt) ? totalAmt : null,
    });
  }
  return out;
}

function productsCompatible(brand: string, product: string) {
  const a = normProduct(brand);
  const b = normProduct(product);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function partiesMatch(a: string, b: string) {
  const left = normParty(a);
  const right = normParty(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Soft-check match: RFPF/SI digits + date + agent + client + brand.
 * Returns 0 when any present field disagrees. Higher = better.
 */
function scoreBusinessMatch(probe: MatchProbe, item: TrackerRow): number {
  if (!productsCompatible(String(probe.brand_name || ''), item.product)) return 0;

  const sheetDigits =
    extractDocDigits(String(probe.rfpf_number || '')) || '';
  const trackDigits = item.doc_digits || extractDocDigits(item.rfpf_raw) || extractDocDigits(item.rfpf_display);
  const date = String(probe.order_date || '').slice(0, 10);
  const agent = String(probe.agent_name || '').trim();
  const client = String(probe.client_name || '').trim();

  // When both sides have a doc number, digits must match (Batch 1 SI-0037 == #0037).
  if (sheetDigits && trackDigits && sheetDigits !== trackDigits) return 0;
  // Date must match when both have it.
  if (date && item.date && date !== item.date) return 0;
  // Agent must match when both have it.
  if (agent && item.agent && !partiesMatch(agent, item.agent)) return 0;
  // Client must match when both have it.
  if (client && item.client && !partiesMatch(client, item.client)) return 0;

  let score = 10; // brand ok
  if (sheetDigits && trackDigits && sheetDigits === trackDigits) score += 20;
  if (date && item.date && date === item.date) score += 10;
  if (agent && item.agent && partiesMatch(agent, item.agent)) score += 10;
  if (client && item.client && partiesMatch(client, item.client)) score += 10;

  // Require a meaningful link: brand + at least (doc digits OR date+client OR date+agent).
  const hasDoc = !!(sheetDigits && trackDigits);
  const hasDateClient = !!(date && item.date && client && item.client);
  const hasDateAgent = !!(date && item.date && agent && item.agent);
  if (!hasDoc && !hasDateClient && !hasDateAgent) return 0;

  return score;
}

/** True when tracker row is covered by a brand-sheet order under business rules. */
function isBusinessMatch(probe: MatchProbe, item: TrackerRow): boolean {
  return scoreBusinessMatch(probe, item) > 0;
}

function matchTrackerRow(
  row: Pick<
    KASalesRecordExcelRow,
    'order_date' | 'client_name' | 'shop_name' | 'brand_name' | 'rfpf_number' | 'agent_name'
  >,
  tracker: TrackerRow[]
): TrackerRow | null {
  if (!tracker.length) return null;
  const probe: MatchProbe = {
    rfpf_number: row.rfpf_number,
    order_date: row.order_date,
    agent_name: row.agent_name,
    client_name: row.client_name,
    brand_name: row.brand_name,
  };
  const scored = tracker
    .map((item) => ({ item, score: scoreBusinessMatch(probe, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item || null;
}

function applyTrackerLink(rows: KASalesRecordExcelRow[], tracker: TrackerRow[]) {
  let matched = 0;
  const next = rows.map((row) => {
    const fromSheet = displayRfpfCode(String(row.rfpf_number || ''));
    const hit = matchTrackerRow(row, tracker);
    // Prefer sheet text; else fill from matched tracker (same business rule).
    const rfpf = fromSheet || hit?.rfpf_display || '';
    if (rfpf) matched += 1;
    return { ...row, rfpf_number: rfpf };
  });
  return { rows: next, matched };
}

function sheetRows(name: string, matrix: unknown[][]): {
  rows: KASalesRecordExcelRow[];
  orderTotals: SheetOrderTotals[];
} {
  const headerRow = findHeaderRow(matrix);
  if (headerRow < 0) return { rows: [], orderTotals: [] };
  const headers = (matrix[headerRow] || []).map((cell) => String(cell ?? ''));
  if (isTrackerSheet(name, headers)) return { rows: [], orderTotals: [] };
  const columns: Col[] = headers.map((header, index) => ({ index, header, ...classify(header) }));
  const groups = buildGroups(columns);
  const brand = brandFromSheet(name);
  const rows: KASalesRecordExcelRow[] = [];
  const orderTotals: SheetOrderTotals[] = [];

  // Optional subtitle row (flavor descriptions under headers) — skip if no identity values.
  const subRow = matrix[headerRow + 1] || [];
  const subLooksLikeLabels =
    !parseDate(cellAt(subRow, columns, 'order_date')) &&
    !String(cellAt(subRow, columns, 'client_name') || '').trim() &&
    !String(cellAt(subRow, columns, 'agent') || '').trim() &&
    !String(cellAt(subRow, columns, 'rfpf') || cellAt(subRow, columns, 'si') || '').trim();

  for (let i = headerRow + 1; i < matrix.length; i++) {
    if (i === headerRow + 1 && subLooksLikeLabels) continue;
    const cells = matrix[i] || [];
    const client = String(cellAt(cells, columns, 'client_name') || '').trim();
    const shop = String(cellAt(cells, columns, 'shop_name') || '').trim();
    const agent = String(cellAt(cells, columns, 'agent') || '').trim();
    const orderDate = parseDate(cellAt(cells, columns, 'order_date'));
    const rfpfRaw = String(cellAt(cells, columns, 'rfpf') || cellAt(cells, columns, 'si') || '').trim();
    if (!client && !shop && !orderDate && !rfpfRaw) continue;

    const si = displayRfpfCode(rfpfRaw);
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
    let groupAmountSum = 0;

    for (const group of groups) {
      const listed = group.priceCol != null ? parseNumber(cells[group.priceCol]) : undefined;
      const amount = group.amountCol != null ? parseNumber(cells[group.amountCol]) : undefined;
      const totalQty = group.totalQtyCol != null ? parseNumber(cells[group.totalQtyCol]) : undefined;
      if (amount != null && amount > 0) groupAmountSum += amount;
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

    const listedSheetTotal = parseNumber(cellAt(cells, columns, 'sheet_total_amount'));
    const lineSum = rows
      .filter((row) => row.external_po_ref === ref)
      .reduce((sum, row) => sum + (Number(row.line_total) || 0), 0);
    const sheetTotal =
      listedSheetTotal != null && listedSheetTotal > 0
        ? listedSheetTotal
        : groupAmountSum > 0
          ? groupAmountSum
          : Math.round(lineSum * 100) / 100;

    if (pushed || client || shop || si) {
      orderTotals.push({
        external_po_ref: ref,
        sheet_name: name,
        brand,
        order_date: orderDate,
        agent,
        client,
        shop,
        rfpf_number: si || rfpfRaw,
        doc_digits: extractDocDigits(rfpfRaw) || extractDocDigits(si),
        sheet_total_amount: sheetTotal,
      });
    }

    if (!pushed && (client || shop || si)) {
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

  return { rows, orderTotals };
}

/**
 * Amount mismatch + No brand sheet only.
 * Can push / Cannot push stay on dry-run would_insert.
 * Match: RFPF/SI digits + date + agent + client + brand.
 */
function matchTrackerForAmount(probe: MatchProbe, tracker: TrackerRow[]): TrackerRow | null {
  if (!tracker.length) return null;
  const scored = tracker
    .map((item) => ({ item, score: scoreBusinessMatch(probe, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item || null;
}

function buildAmountMismatches(
  orderTotals: SheetOrderTotals[],
  linkedRows: KASalesRecordExcelRow[],
  tracker: TrackerRow[]
): SalesOrderAmountMismatch[] {
  const byRef = new Map<string, KASalesRecordExcelRow>();
  for (const row of linkedRows) {
    if (!byRef.has(row.external_po_ref)) byRef.set(row.external_po_ref, row);
  }

  const out: SalesOrderAmountMismatch[] = [];
  for (const order of orderTotals) {
    const linked = byRef.get(order.external_po_ref);
    const probe: MatchProbe = {
      order_date: linked?.order_date || order.order_date,
      agent_name: linked?.agent_name || order.agent,
      client_name: linked?.client_name || order.client,
      brand_name: linked?.brand_name || order.brand,
      rfpf_number: order.rfpf_number || linked?.rfpf_number || '',
    };

    const hit = matchTrackerForAmount(probe, tracker);
    if (!hit || hit.total_amt == null) continue;
    const sheetAmt = Number(order.sheet_total_amount) || 0;
    const trackerAmt = Number(hit.total_amt) || 0;
    const difference = Math.round((trackerAmt - sheetAmt) * 100) / 100;
    if (Math.abs(difference) <= AMOUNT_TOLERANCE) continue;
    out.push({
      external_po_ref: order.external_po_ref,
      rfpf_number: probe.rfpf_number || hit.rfpf_display,
      order_date: probe.order_date || '',
      client: probe.client_name || '',
      shop: order.shop || linked?.shop_name || '',
      brand: probe.brand_name || order.brand,
      sheet_name: order.sheet_name,
      sheet_total_amount: sheetAmt,
      tracker_total_amt: trackerAmt,
      difference,
    });
  }
  return out;
}

function buildNoBrandSheet(
  orderTotals: SheetOrderTotals[],
  linkedRows: KASalesRecordExcelRow[],
  tracker: TrackerRow[]
): SalesOrderNoBrandSheet[] {
  const probes: MatchProbe[] = [];
  for (const order of orderTotals) {
    probes.push({
      rfpf_number: order.rfpf_number,
      order_date: order.order_date,
      agent_name: order.agent,
      client_name: order.client,
      brand_name: order.brand,
    });
  }
  for (const row of linkedRows) {
    probes.push({
      rfpf_number: row.rfpf_number,
      order_date: row.order_date,
      agent_name: row.agent_name,
      client_name: row.client_name,
      brand_name: row.brand_name,
    });
  }

  const seen = new Set<string>();
  const out: SalesOrderNoBrandSheet[] = [];
  for (const item of tracker) {
    if (!item.rfpf_key && !item.doc_digits) continue;
    if (probes.some((probe) => isBusinessMatch(probe, item))) continue;
    const dedupe = `${item.doc_digits || item.rfpf_key}|${normProduct(item.product)}|${item.date}|${normParty(item.client)}|${normParty(item.agent)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      rfpf_number: item.rfpf_display || item.rfpf_raw,
      order_date: item.date,
      client: item.client,
      shop: item.shop,
      product: item.product,
      tracker_total_amt: item.total_amt,
    });
  }
  return out;
}

export function parseKeyAccountSalesOrderBuffer(buffer: ArrayBuffer): SalesOrderParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Excel has no sheets');
  const rows: KASalesRecordExcelRow[] = [];
  const sheets: SalesOrderParseResult['sheets'] = [];
  const skipped: string[] = [];
  const trackerRows: TrackerRow[] = [];
  const orderTotals: SheetOrderTotals[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
    const headerRow = findHeaderRow(matrix);
    const headers = headerRow >= 0 ? (matrix[headerRow] || []).map((cell) => String(cell ?? '')) : [];
    if (headerRow >= 0 && isTrackerSheet(name, headers)) {
      skipped.push(name);
      trackerRows.push(...parseTrackerRows(matrix));
      continue;
    }
    // Tracker-named sheets with no standard product header still parse as tracker when possible.
    if (/sales\s*tracker/i.test(name)) {
      skipped.push(name);
      trackerRows.push(...parseTrackerRows(matrix));
      continue;
    }
    const parsed = sheetRows(name, matrix);
    if (!parsed.rows.length && headerRow < 0) continue;
    rows.push(...parsed.rows);
    orderTotals.push(...parsed.orderTotals);
    const orders = new Set(parsed.rows.map((row) => row.external_po_ref)).size;
    sheets.push({ name, brand: brandFromSheet(name), orders, lines: parsed.rows.length });
  }

  if (!rows.length) {
    throw new Error('No sales-order rows found. Use the Key Account Sales Order workbook (product sheets, not the tracker).');
  }

  const linked = applyTrackerLink(rows, trackerRows);
  const amount_mismatches = buildAmountMismatches(orderTotals, linked.rows, trackerRows);
  const no_brand_sheet = buildNoBrandSheet(orderTotals, linked.rows, trackerRows);
  const agents = [...new Set(linked.rows.map((row) => String(row.agent_name || '').trim()).filter(Boolean))];
  return {
    rows: linked.rows,
    sheets,
    agents,
    skipped_tracker: skipped,
    tracker_rfpf_matched: linked.matched,
    tracker_rfpf_total: trackerRows.length,
    amount_mismatches,
    no_brand_sheet,
  };
}

export async function parseKeyAccountSalesOrderExcel(file: File): Promise<SalesOrderParseResult> {
  const buffer = await file.arrayBuffer();
  return parseKeyAccountSalesOrderBuffer(buffer);
}
