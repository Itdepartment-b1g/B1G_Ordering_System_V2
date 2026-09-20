import type {
  KASalesRecordExcelRow,
  KASalesRecordOrderKind,
  KASalesRecordPaymentMethod,
  SalesRecordColumnOverride,
  SalesRecordIdentityField,
  SalesRecordParseResult,
  SalesRecordSheetColumn,
  SalesRecordSheetModel,
  SalesRecordSheetProfile,
  SalesRecordTrackerOnly,
  SalesRecordWorkbookModel,
} from './clientSalesRecordTypes';

const IDENTITY_BY_HEADER: Record<string, SalesRecordIdentityField> = {
  rfpf: 'rfpf',
  rfpfno: 'rfpf',
  rfpfnumber: 'rfpf',
  date: 'order_date',
  dateoforder: 'order_date',
  dateordered: 'order_date',
  datereleased: 'delivery_date',
  datedelivered: 'delivery_date',
  agent: 'agent',
  clientname: 'client_name',
  shop: 'shop_name',
  shopname: 'shop_name',
  tradename: 'shop_name',
  tradenamevapeshop: 'shop_name',
  vapeshopname: 'shop_name',
  vapeshop: 'shop_name',
  deliveryaddress: 'address_label',
  address: 'address_label',
  category: 'client_category',
  clientcategory: 'client_category',
  contact: 'contact_phone',
  contactnumber: 'contact_phone',
  province: 'province',
  city: 'city',
  warehouse: 'warehouse_location_name',
  discount: 'discount',
  remarks: 'notes',
  remarkss: 'notes',
  inventoryconsignment: 'inventory_kind',
  inventoryconsigned: 'inventory_kind',
  status: 'excel_status',
  amountpaid: 'payment_amount',
  totalpaid: 'payment_amount',
  dateofpayment: 'payment_date',
  paymentdate: 'payment_date',
  modeofpayment: 'payment_method',
  remainingbalance: 'remaining_balance',
  rembalance: 'remaining_balance',
  commreleased: 'comm_released',
  proofofpayment: 'proof_url',
  device: 'device_qty',
};

const MARKER_BY_HEADER: Record<string, SalesRecordSheetColumn['marker']> = {
  totalqty: 'total_qty',
  totalqtydevice: 'total_qty',
  price: 'price',
  totalamt: 'amount',
  totalamount: 'amount',
  amount: 'amount',
  total: 'total',
};

const IGNORE_HEADERS = new Set([
  'batchno',
  'product',
  'pods',
  'year',
  'month',
  'week',
  'weekofmonth',
  'weeklychecking',
  'releaseddate',
  'commamount',
  'commtotal',
  'totaldue',
  'sinumber',
  'sino',
  'incentivesreplacementrewards',
  'incentives',
  'crarno',
  'crnoarno',
  'crarno',
]);

const SHEET_BRAND: Record<string, string> = {
  'podpro2': 'POD PRO 2',
  'pocketbai1device15mg': 'POCKET BAI',
  'infinity2plusdevice': 'INFINITY 2 PLUS',
  'nova18mg': 'NOVA 18mg',
  'nova15mg': 'NOVA 15mg',
  'powercase': 'POWER CASE',
  'vibeg01bcdevice15mg': 'VIBE',
  'relxgo': 'RELX GO',
  'relxultrapro': 'RELX ULTRA PRO',
  'xforge': 'X-FORGE',
  'onebar': 'ONE BAR',
  'amz': 'AMZ',
};

export function normalizeSalesHeader(header: string) {
  return String(header || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeRfpf(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function productAliasKey(brand: string, variant: string) {
  return `${normalizeSalesHeader(brand)}||${normalizeSalesHeader(variant)}`;
}

export function displayHeader(header: string) {
  return String(header || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parseNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value)
    .replace(/₱/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymdLocal(value);
  }
  if (typeof value === 'number' && value > 20000) {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(parsed.getTime())) return ymdLocal(parsed);
  }
  const chunks = String(value)
    .split(/[\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed = chunks
    .map((chunk) => {
      const iso = chunk.match(/^(\d{4}-\d{2}-\d{2})/);
      if (iso) return iso[1];
      const normalized = chunk.replace(/Sept/i, 'Sep').replace(/,/g, ' ');
      const asDate = new Date(normalized);
      if (!Number.isNaN(asDate.getTime()) && normalized.length >= 6) {
        return ymdLocal(asDate);
      }
      return '';
    })
    .filter(Boolean)
    .sort();
  return parsed[parsed.length - 1] || '';
}

function parseBool(value: unknown): boolean | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(text)) return true;
  if (['false', 'no', 'n', '0'].includes(text)) return false;
  return undefined;
}

function parseKind(value: unknown): KASalesRecordOrderKind | undefined {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (text.includes('consign')) return 'consignment';
  if (text.includes('invent')) return 'standard';
  return undefined;
}

function parsePaymentMethod(value: unknown): {
  method?: KASalesRecordPaymentMethod;
  bank?: string | null;
} {
  const text = String(value || '').trim();
  if (!text) return {};
  const n = text.toLowerCase();
  if (n.includes('gcash')) return { method: 'GCASH', bank: null };
  if (n.includes('cheque') || n.includes('check') || n.includes('pdc')) {
    return { method: 'CHEQUE', bank: null };
  }
  if (n === 'cash' || n.includes('cash')) return { method: 'CASH', bank: null };
  if (n.includes('bank') || n.includes('bdo') || n.includes('bpi') || n.includes('union') || n.includes('pbcom')) {
    const bank = text.replace(/bank\s*transfer/i, '').trim() || text.trim();
    return { method: 'BANK_TRANSFER', bank };
  }
  return { method: 'BANK_TRANSFER', bank: text };
}

function brandFromSheetName(name: string) {
  const key = normalizeSalesHeader(name);
  if (SHEET_BRAND[key]) return SHEET_BRAND[key];
  return displayHeader(name.replace(/device.*$/i, '').trim() || name);
}

function classifyHeader(header: string): Pick<SalesRecordSheetColumn, 'role' | 'field' | 'marker'> {
  const key = normalizeSalesHeader(header);
  if (!key) return { role: 'ignore' };
  if (IGNORE_HEADERS.has(key)) return { role: 'ignore' };
  const field = IDENTITY_BY_HEADER[key];
  if (field) return { role: 'identity', field };
  const marker = MARKER_BY_HEADER[key];
  if (marker) return { role: 'marker', marker };
  return { role: 'flavor' };
}

function isTrackerSheet(name: string, headers: string[]) {
  if (/sales\s*tracker/i.test(name)) return true;
  const keys = headers.map(normalizeSalesHeader);
  return keys.includes('product') && keys.includes('pods') && keys.includes('device');
}

function findHeaderRow(matrix: unknown[][]) {
  return matrix.findIndex((row) => {
    const keys = (row || []).map((cell) => normalizeSalesHeader(String(cell || '')));
    const hasRfpf = keys.some((key) => key === 'rfpf' || key === 'rfpfno' || key === 'rfpfnumber');
    const hasClient = keys.includes('clientname');
    const hasAgent = keys.includes('agent');
    return hasRfpf || (hasClient && hasAgent);
  });
}

function isSubtitleRow(row: unknown[], rfpfIndex: number) {
  const rfpf = String(row?.[rfpfIndex] ?? '').trim();
  if (rfpf && normalizeRfpf(rfpf).startsWith('RFPF')) return false;
  const nonempty = (row || []).filter((cell) => String(cell ?? '').trim()).length;
  return nonempty > 3;
}

type QtyGroup = {
  flavors: { index: number; name: string }[];
  priceCol?: number;
  amountCol?: number;
  totalQtyCol?: number;
};

function buildQtyGroups(columns: SalesRecordSheetColumn[]): QtyGroup[] {
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
    if (col.role === 'identity' && col.field === 'device_qty') {
      current.flavors.push({ index: col.index, name: 'Device' });
      continue;
    }
    if (col.role === 'marker') {
      if (col.marker === 'price') current.priceCol = col.index;
      else if (col.marker === 'total_qty') current.totalQtyCol = col.index;
      else if (col.marker === 'amount') {
        current.amountCol = col.index;
        close();
      } else if (col.marker === 'total') {
        if (current.priceCol == null && current.totalQtyCol == null) current.totalQtyCol = col.index;
        else {
          current.amountCol = col.index;
          close();
        }
      }
      continue;
    }
    if ((col.role === 'identity' || col.role === 'ignore') && current.flavors.length) {
      close();
    }
  }
  close();
  return groups;
}

function identityValue(row: unknown[], columns: SalesRecordSheetColumn[], field: SalesRecordIdentityField) {
  const col = columns.find((c) => c.role === 'identity' && c.field === field);
  if (!col) return undefined;
  return row[col.index];
}

function buildColumns(
  headers: string[],
  overrides?: Record<number, SalesRecordColumnOverride>
): SalesRecordSheetColumn[] {
  return headers.map((header, index) => {
    const override = overrides?.[index];
    if (override) {
      return {
        index,
        header,
        role: override.role,
        field: override.field,
      };
    }
    return { index, header, ...classifyHeader(header) };
  });
}

function missingRequired(columns: SalesRecordSheetColumn[]) {
  const fields = new Set(
    columns.filter((c) => c.role === 'identity' && c.field).map((c) => c.field)
  );
  const missing: string[] = [];
  if (!fields.has('rfpf')) missing.push('rfpf_number');
  if (!fields.has('client_name')) missing.push('client_name');
  if (!fields.has('order_date')) missing.push('order_date');
  const hasFlavor = columns.some((c) => c.role === 'flavor' || c.field === 'device_qty');
  if (!hasFlavor) missing.push('flavor_or_variant_columns');
  return missing;
}

type TrackerHint = {
  comm_released?: boolean;
  discount?: number;
  status?: string;
  category?: string;
  province?: string;
  city?: string;
};

function parseTracker(model: SalesRecordSheetModel): {
  byRfpf: Map<string, TrackerHint>;
  only: SalesRecordTrackerOnly[];
} {
  const columns = buildColumns(model.headers);
  const byRfpf = new Map<string, TrackerHint>();
  const only: SalesRecordTrackerOnly[] = [];
  for (const row of model.rows) {
    const rfpf = String(identityValue(row.cells, columns, 'rfpf') || '').trim();
    if (!normalizeRfpf(rfpf)) continue;
    const key = normalizeRfpf(rfpf);
    const prev = byRfpf.get(key) || {};
    const comm = parseBool(identityValue(row.cells, columns, 'comm_released'));
    const discount = parseNumber(identityValue(row.cells, columns, 'discount'));
    const status = String(identityValue(row.cells, columns, 'excel_status') || '').trim();
    const category = String(identityValue(row.cells, columns, 'client_category') || '').trim();
    const province = String(identityValue(row.cells, columns, 'province') || '').trim();
    const city = String(identityValue(row.cells, columns, 'city') || '').trim();
    byRfpf.set(key, {
      comm_released: Boolean(prev.comm_released || comm),
      discount: discount ?? prev.discount,
      status: status || prev.status,
      category: category || prev.category,
      province: province || prev.province,
      city: city || prev.city,
    });
    only.push({
      rfpf,
      client_name: String(identityValue(row.cells, columns, 'client_name') || '').trim(),
      shop_name: String(identityValue(row.cells, columns, 'shop_name') || '').trim(),
      product: displayHeader(String(row.cells[columns.find((c) => normalizeSalesHeader(c.header) === 'product')?.index || -1] || '')),
    });
  }
  return { byRfpf, only };
}

function unpivotSheet(
  sheet: SalesRecordSheetModel,
  overrides: Record<number, SalesRecordColumnOverride> | undefined,
  tracker: Map<string, TrackerHint>
): { rows: KASalesRecordExcelRow[]; profile: SalesRecordSheetProfile } {
  const columns = buildColumns(sheet.headers, overrides);
  const groups = buildQtyGroups(columns);
  const missing = missingRequired(columns);
  const brand = brandFromSheetName(sheet.name);
  const rows: KASalesRecordExcelRow[] = [];

  for (const row of sheet.rows) {
    const rfpf = String(identityValue(row.cells, columns, 'rfpf') || '').trim();
    if (!normalizeRfpf(rfpf)) continue;
    const client = String(identityValue(row.cells, columns, 'client_name') || '').trim();
    const agent = String(identityValue(row.cells, columns, 'agent') || '').trim();
    const shop = String(identityValue(row.cells, columns, 'shop_name') || '').trim();
    const orderDate = parseDate(identityValue(row.cells, columns, 'order_date'));
    const deliveryDate = parseDate(identityValue(row.cells, columns, 'delivery_date')) || orderDate;
    const payment = parsePaymentMethod(identityValue(row.cells, columns, 'payment_method'));
    const paid = parseNumber(identityValue(row.cells, columns, 'payment_amount')) || 0;
    const remaining = parseNumber(identityValue(row.cells, columns, 'remaining_balance'));
    const proof = String(identityValue(row.cells, columns, 'proof_url') || '').trim();
    const notes = String(identityValue(row.cells, columns, 'notes') || '').trim();
    const kind = parseKind(identityValue(row.cells, columns, 'inventory_kind'));
    const status = String(identityValue(row.cells, columns, 'excel_status') || '').trim();
    const comm = parseBool(identityValue(row.cells, columns, 'comm_released'));
    const discount = parseNumber(identityValue(row.cells, columns, 'discount'));
    const warehouse = String(identityValue(row.cells, columns, 'warehouse_location_name') || '').trim();
    const address = String(identityValue(row.cells, columns, 'address_label') || '').trim();
    const category = String(identityValue(row.cells, columns, 'client_category') || '').trim();
    const contact = String(identityValue(row.cells, columns, 'contact_phone') || '').trim();
    const province = String(identityValue(row.cells, columns, 'province') || '').trim();
    const city = String(identityValue(row.cells, columns, 'city') || '').trim();
    const track = tracker.get(normalizeRfpf(rfpf));
    const sourceKey = `${sheet.name}|${row.excel_row}`;

    for (const group of groups) {
      const totalQty = group.totalQtyCol != null ? parseNumber(row.cells[group.totalQtyCol]) : undefined;
      const amount = group.amountCol != null ? parseNumber(row.cells[group.amountCol]) : undefined;
      const listedPrice = group.priceCol != null ? parseNumber(row.cells[group.priceCol]) : undefined;
      const fallbackPrice =
        listedPrice != null && listedPrice > 0
          ? listedPrice
          : amount != null && totalQty && totalQty > 0
            ? amount / totalQty
            : undefined;

      for (const flavor of group.flavors) {
        const qty = parseNumber(row.cells[flavor.index]) || 0;
        if (!(qty > 0)) continue;
        const subtitle = displayHeader(String(sheet.sub_headers[flavor.index] || ''));
        const variant = subtitle && subtitle.toLowerCase() !== flavor.name.toLowerCase()
          ? `${flavor.name} (${subtitle})`
          : flavor.name;
        const unit = fallbackPrice ?? 0;
        rows.push({
          excel_row: row.excel_row,
          sheet_name: sheet.name,
          source_row_key: sourceKey,
          external_po_ref: rfpf,
          rfpf_number: rfpf,
          order_date: orderDate,
          expected_delivery_date: deliveryDate,
          client_name: client,
          shop_name: shop,
          address_label: address || undefined,
          client_category: category || track?.category || undefined,
          contact_phone: contact || undefined,
          province: province || track?.province || undefined,
          city: city || track?.city || undefined,
          brand_name: brand,
          variant_name: variant,
          quantity: qty,
          unit_price: unit,
          line_total: Math.round(qty * unit * 100) / 100,
          agent_name: agent || undefined,
          kam_email: agent && isEmail(agent) ? agent.trim() : undefined,
          warehouse_location_name: warehouse || undefined,
          discount: discount ?? track?.discount,
          notes: [notes, proof ? `Proof: ${proof}` : ''].filter(Boolean).join('\n') || undefined,
          inventory_kind: kind,
          excel_status: status || track?.status,
          payment_amount: paid,
          payment_date: parseDate(identityValue(row.cells, columns, 'payment_date')) || undefined,
          payment_method: payment.method,
          bank_type: payment.bank ?? null,
          remaining_balance: remaining,
          comm_released: comm ?? track?.comm_released,
          proof_url: proof || undefined,
        });
      }
    }
  }

  return {
    rows,
    profile: {
      name: sheet.name,
      header_row: sheet.header_row,
      columns,
      data_rows: sheet.rows.length,
      missing_required: missing,
    },
  };
}

export function buildSalesRecordModel(
  sheets: { name: string; matrix: unknown[][] }[]
): SalesRecordWorkbookModel {
  const model: SalesRecordWorkbookModel = { sheets: [], tracker_only: [] };
  for (const sheet of sheets) {
    const headerRow = findHeaderRow(sheet.matrix);
    if (headerRow < 0) continue;
    const headers = (sheet.matrix[headerRow] || []).map((cell) => String(cell ?? ''));
    let dataStart = headerRow + 1;
    let sub: string[] = [];
    const rfpfIndex = headers.findIndex((h) => {
      const key = normalizeSalesHeader(h);
      return key === 'rfpf' || key === 'rfpfno' || key === 'rfpfnumber';
    });
    const maybeSub = sheet.matrix[dataStart] || [];
    if (rfpfIndex >= 0 && isSubtitleRow(maybeSub, rfpfIndex) && !normalizeRfpf(String(maybeSub[rfpfIndex] || ''))) {
      sub = maybeSub.map((cell) => String(cell ?? ''));
      dataStart += 1;
    }
    const rows = [];
    for (let i = dataStart; i < sheet.matrix.length; i++) {
      const cells = sheet.matrix[i] || [];
      if (!cells.some((cell) => String(cell ?? '').trim())) continue;
      rows.push({ excel_row: i + 1, cells });
    }
    const built: SalesRecordSheetModel = {
      name: sheet.name,
      header_row: headerRow + 1,
      headers,
      sub_headers: sub,
      rows,
    };
    if (isTrackerSheet(sheet.name, headers)) {
      model.tracker_only = parseTracker(built).only;
      model.sheets.push(built);
      continue;
    }
    model.sheets.push(built);
  }
  return model;
}

export function unpivotSalesRecordModel(
  model: SalesRecordWorkbookModel,
  overrides?: Record<string, Record<number, SalesRecordColumnOverride>>
): SalesRecordParseResult {
  const trackerSheet = model.sheets.find((sheet) => isTrackerSheet(sheet.name, sheet.headers));
  const tracker = trackerSheet ? parseTracker(trackerSheet).byRfpf : new Map();
  const productSheets = model.sheets.filter((sheet) => !isTrackerSheet(sheet.name, sheet.headers));
  const rows: KASalesRecordExcelRow[] = [];
  const profiles: SalesRecordSheetProfile[] = [];

  for (const sheet of productSheets) {
    const parsed = unpivotSheet(sheet, overrides?.[sheet.name], tracker);
    rows.push(...parsed.rows);
    profiles.push(parsed.profile);
  }

  const productRfpf = new Set(rows.map((row) => normalizeRfpf(row.external_po_ref)));
  const trackerOnly = (model.tracker_only || []).filter(
    (item) => !productRfpf.has(normalizeRfpf(item.rfpf))
  );
  const uniqueTracker = new Map<string, SalesRecordTrackerOnly>();
  for (const item of trackerOnly) {
    const key = normalizeRfpf(item.rfpf);
    if (!uniqueTracker.has(key)) uniqueTracker.set(key, item);
  }

  const agents = [...new Set(rows.map((row) => String(row.agent_name || '').trim()).filter(Boolean))];
  const productMap = new Map<string, { brand: string; variant: string }>();
  for (const row of rows) {
    const key = productAliasKey(row.brand_name || '', row.variant_name || '');
    if (!productMap.has(key)) {
      productMap.set(key, { brand: row.brand_name || '', variant: row.variant_name || '' });
    }
  }

  return {
    rows,
    sheets: profiles,
    agents,
    products: [...productMap.values()],
    tracker_only: [...uniqueTracker.values()],
    needs_column_map: profiles.some((sheet) => sheet.missing_required.length > 0),
    model,
  };
}

export function applySalesRecordAliases(
  rows: KASalesRecordExcelRow[],
  aliases: { agents?: Record<string, string>; products?: Record<string, { brand_name: string; variant_name: string; sku?: string }> }
): KASalesRecordExcelRow[] {
  return rows.map((row) => {
    const next = { ...row };
    const agentKey = String(row.agent_name || '').trim().toLowerCase();
    const mappedEmail = aliases.agents?.[agentKey] || aliases.agents?.[row.agent_name || ''];
    if (mappedEmail) next.kam_email = mappedEmail.trim();
    const pKey = productAliasKey(row.brand_name || '', row.variant_name || '');
    const mappedProduct = aliases.products?.[pKey];
    if (mappedProduct) {
      next.brand_name = mappedProduct.brand_name || next.brand_name;
      next.variant_name = mappedProduct.variant_name || next.variant_name;
      if (mappedProduct.sku) next.sku = mappedProduct.sku;
    }
    return next;
  });
}
