// CommonJS version of the Orders V1 -> V2 transformer
// Use this in projects with `"type": "module"` in package.json.
//
// Usage from project root:
//   node scripts/transform_orders_v1_to_v2.cjs
//
// It reads:
//   Order_v1_and_template.xlsx  (sheet: "Orders V1")
// And writes:
//   orders_v2_from_v1.csv
//
// The mapping logic is identical to transform_orders_v1_to_v2.js.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const WORKBOOK_PATH = path.join(process.cwd(), 'Order_v1_and_template.xlsx');
const SOURCE_SHEET_NAME = 'Orders V1';

const SOURCE_COLUMN_ORDER_NUMBER = 'Order #';
const SOURCE_COLUMN_DATE = 'Date';
const SOURCE_COLUMN_CLIENT = 'Client';
const SOURCE_COLUMN_AGENT = 'Sales Agent';
const SOURCE_COLUMN_STATUS = 'Status';
const SOURCE_COLUMN_STAGE = 'Stage';
const SOURCE_COLUMN_ITEMS_SUMMARY = 'Items (Summary)';
const SOURCE_COLUMN_SUBTOTAL = 'Subtotal';
const SOURCE_COLUMN_TAX = 'Tax';
const SOURCE_COLUMN_DISCOUNT = 'Discount';
const SOURCE_COLUMN_TOTAL = 'Total';
const SOURCE_COLUMN_PAYMENT_METHOD = 'Payment Method';

const OUTPUT_CSV_PATH = path.join(process.cwd(), 'orders_v2_from_v1.csv');

function ensureWorkbook() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    console.error(`❌ Workbook not found at: ${WORKBOOK_PATH}`);
    process.exit(1);
  }
}

function normalizeDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const jsDate = new Date(Date.UTC(date.y, date.m - 1, date.d));
      return jsDate.toISOString().split('T')[0];
    }
  }
  const str = String(value).trim();
  if (!str) return '';
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return str;
}

function buildV2OrderNumber(originalOrderNumber, dateStr) {
  const normalizedDate = normalizeDate(dateStr);
  let yyyymmdd = normalizedDate.replace(/-/g, '');
  if (!/^\d{8}$/.test(yyyymmdd)) {
    const digits = normalizedDate.replace(/\D/g, '');
    if (digits.length >= 8) {
      yyyymmdd = digits.slice(0, 8);
    } else {
      yyyymmdd = '00000000';
    }
  }

  let suffix = '';
  if (originalOrderNumber) {
    const match = String(originalOrderNumber).match(/(\d+)(?!.*\d)/);
    if (match) suffix = match[1];
  }
  if (!suffix) suffix = '1';

  return `ORD-${yyyymmdd}-${suffix}`;
}

function splitItemsSummary(summary) {
  if (!summary) return [];
  const raw = String(summary);
  const parts = raw.split(/\r?\n/);
  return parts.map((line) => line.trim()).filter((line) => line.length > 0);
}

function parseItemLine(line) {
  let quantity = 1;
  let text = line.trim();
  const qtyMatch = text.match(/^(\d+)\s*x?\s*(.+)$/i);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    text = qtyMatch[2].trim();
  }

  let item_brand_name = '';
  let item_variant_name = text;

  const lastParenOpen = text.lastIndexOf('(');
  const lastParenClose = text.lastIndexOf(')');
  if (lastParenOpen !== -1 && lastParenClose !== -1 && lastParenClose > lastParenOpen) {
    item_brand_name = text.slice(lastParenOpen + 1, lastParenClose).trim();
    item_variant_name = text.slice(0, lastParenOpen).trim();
  }

  const item_variant_type = 'flavor';

  return {
    item_quantity: quantity,
    item_brand_name,
    item_variant_name,
    item_variant_type,
  };
}

function mapPaymentFields(paymentMethodRaw) {
  const raw = String(paymentMethodRaw || '').trim().toLowerCase();
  if (!raw) {
    return { payment_method: '', bank_type: '' };
  }
  if (raw === 'cash') {
    return { payment_method: 'CASH', bank_type: '' };
  }
  return { payment_method: 'BANK_TRANSFER', bank_type: 'Unionbank' };
}

function toCsvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

function main() {
  ensureWorkbook();

  console.log('📖 Reading workbook:', WORKBOOK_PATH);
  const wb = XLSX.readFile(WORKBOOK_PATH);

  const sheet = wb.Sheets[SOURCE_SHEET_NAME];
  if (!sheet) {
    console.error(`❌ Sheet "${SOURCE_SHEET_NAME}" not found.`);
    console.error('Available sheets:', wb.SheetNames.join(', '));
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`✅ Loaded ${rows.length} row(s) from "${SOURCE_SHEET_NAME}".`);

  const outputRows = [];

  for (const row of rows) {
    const originalOrderNumber = row[SOURCE_COLUMN_ORDER_NUMBER];
    const orderDateRaw = row[SOURCE_COLUMN_DATE];
    const clientName = row[SOURCE_COLUMN_CLIENT];
    const agentName = row[SOURCE_COLUMN_AGENT];
    const itemsSummary = row[SOURCE_COLUMN_ITEMS_SUMMARY];
    const subtotal = row[SOURCE_COLUMN_SUBTOTAL];
    const tax = row[SOURCE_COLUMN_TAX];
    const discount = row[SOURCE_COLUMN_DISCOUNT];
    const total = row[SOURCE_COLUMN_TOTAL];
    const paymentMethodRaw = row[SOURCE_COLUMN_PAYMENT_METHOD];

    if (!originalOrderNumber && !clientName && !itemsSummary) continue;

    const v2OrderNumber = buildV2OrderNumber(originalOrderNumber, orderDateRaw);
    const order_date = normalizeDate(orderDateRaw);
    const { payment_method, bank_type } = mapPaymentFields(paymentMethodRaw);

    const itemLines = splitItemsSummary(itemsSummary);
    if (itemLines.length === 0) {
      console.warn(`⚠️  Order "${originalOrderNumber}" has no parsed items; skipping.`);
      continue;
    }

    let orderItemIndex = 0;
    for (const line of itemLines) {
      orderItemIndex += 1;
      const parsedItem = parseItemLine(line);

      const v2Row = {
        order_number: v2OrderNumber,
        order_item_index: orderItemIndex,
        agent_id: '',
        agent_name: agentName || '',
        client_id: '',
        client_name: clientName || '',
        order_date,
        subtotal,
        tax,
        discount,
        total_amount: total,
        status: 'approved',
        stage: 'admin_approved',
        payment_method,
        bank_type,
        deposit_id: '',
        notes: '',
        item_brand_name: parsedItem.item_brand_name,
        item_variant_name: parsedItem.item_variant_name,
        item_variant_type: parsedItem.item_variant_type,
        item_quantity: parsedItem.item_quantity,
        item_unit_price: '',
        item_pricing_strategy: 'rsp',
      };

      outputRows.push(v2Row);
    }
  }

  if (!outputRows.length) {
    console.error('❌ No output rows generated.');
    process.exit(1);
  }

  console.log(`✅ Generated ${outputRows.length} order item row(s) for v2.`);

  const header = [
    'order_number',
    'order_item_index',
    'agent_id',
    'agent_name',
    'client_id',
    'client_name',
    'order_date',
    'subtotal',
    'tax',
    'discount',
    'total_amount',
    'status',
    'stage',
    'payment_method',
    'bank_type',
    'deposit_id',
    'notes',
    'item_brand_name',
    'item_variant_name',
    'item_variant_type',
    'item_quantity',
    'item_unit_price',
    'item_pricing_strategy',
  ];

  const lines = [];
  lines.push(toCsvRow(header));
  for (const row of outputRows) {
    const values = header.map((key) => row[key]);
    lines.push(toCsvRow(values));
  }

  fs.writeFileSync(OUTPUT_CSV_PATH, lines.join('\n'), 'utf8');
  console.log(`💾 Wrote output CSV: ${OUTPUT_CSV_PATH}`);
}

main();

