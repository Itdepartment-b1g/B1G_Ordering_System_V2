// Transform Orders V1 sheet into Orders V2 import template
//
// Usage (from project root):
//   1) Ensure you have `xlsx` installed (it already exists in dependencies for the app).
//      If needed: npm install xlsx
//   2) Place / update Order_v1_and_template.xlsx in the project root (as you already did).
//   3) Run:
//        node scripts/transform_orders_v1_to_v2.js
//   4) The script will generate:
//        orders_v2_from_v1.csv
//      in the project root, matching the OrdersPage v2 template.
//
// This script:
// - Reads sheet "Orders V1"
// - Splits the "Items (Summary)" cell into individual item rows
// - Builds one CSV row per order item with:
//   order_number, order_item_index, agent_id (blank), agent_name, client_id (blank),
//   client_name, order_date, subtotal, tax, discount, total_amount, status, stage,
//   payment_method, bank_type, deposit_id (blank), notes (blank),
//   item_brand_name, item_variant_name, item_variant_type, item_quantity,
//   item_unit_price (blank), item_pricing_strategy ("rsp")
//
// IMPORTANT ASSUMPTIONS (based on your description & screenshots):
// - Source workbook: Order_v1_and_template.xlsx
// - Source sheet: "Orders V1"
// - Source columns in that sheet (header names):
//     "Order #"          -> original order number (e.g. ORD-2026-1046)
//     "Date"             -> order date
//     "Client"           -> client name
//     "Sales Agent"      -> agent name
//     "Status"           -> original status (ignored; v2 forces "approved")
//     "Stage"            -> original stage (ignored; v2 forces "admin_approved")
//     "Items (Summary)"  -> multi-line text, 1 item per line like "1x SOME ITEM (BRAND)"
//     "Subtotal"
//     "Tax"
//     "Discount"
//     "Total"
//     "Payment Method"
//
// If your header labels differ slightly, adjust SOURCE_COLUMN_* constants below.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// --- CONFIG -----------------------------------------------------------------

const WORKBOOK_PATH = path.join(process.cwd(), 'Order_v1_and_template.xlsx');
const SOURCE_SHEET_NAME = 'Orders V1';

// Column names in the "Orders V1" sheet
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

// Output CSV path
const OUTPUT_CSV_PATH = path.join(process.cwd(), 'orders_v2_from_v1.csv');

// ---------------------------------------------------------------------------

function ensureWorkbook() {
  if (!fs.existsSync(WORKBOOK_PATH)) {
    console.error(`❌ Workbook not found at: ${WORKBOOK_PATH}`);
    console.error('   Make sure Order_v1_and_template.xlsx is in the project root.');
    process.exit(1);
  }
}

function normalizeDate(value) {
  if (!value) return '';
  // XLSX may give dates as JS Date, numbers (Excel serial), or strings
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  // Try to detect Excel serial number
  if (typeof value === 'number') {
    // XLSX utils will usually handle this before, but as a fallback:
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const jsDate = new Date(Date.UTC(date.y, date.m - 1, date.d));
      return jsDate.toISOString().split('T')[0];
    }
  }

  // String: attempt to parse
  const str = String(value).trim();
  if (!str) return '';
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  // Fallback: return original
  return str;
}

// Convert V1 order number + date into v2 format: ORD-YYYYMMDD-{number}
function buildV2OrderNumber(originalOrderNumber, dateStr) {
  const normalizedDate = normalizeDate(dateStr); // YYYY-MM-DD or original
  let yyyymmdd = normalizedDate.replace(/-/g, '');
  if (!/^\d{8}$/.test(yyyymmdd)) {
    // If date cannot be normalized, just strip non-digits and fallback
    const digits = normalizedDate.replace(/\D/g, '');
    if (digits.length >= 8) {
      yyyymmdd = digits.slice(0, 8);
    } else {
      // Last resort: 00000000
      yyyymmdd = '00000000';
    }
  }

  // Extract numeric suffix from original order number, e.g. ORD-2026-1046 -> 1046
  let suffix = '';
  if (originalOrderNumber) {
    const match = String(originalOrderNumber).match(/(\d+)(?!.*\d)/);
    if (match) {
      suffix = match[1];
    }
  }
  if (!suffix) {
    suffix = '1';
  }

  return `ORD-${yyyymmdd}-${suffix}`;
}

// Split "Items (Summary)" into individual lines
function splitItemsSummary(summary) {
  if (!summary) return [];
  const raw = String(summary);
  // Split on newlines or explicit separators
  const parts = raw.split(/\r?\n/);
  return parts
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Parse a single item line into quantity, variant/brand, etc.
// Example lines (from your screenshot):
//   "1x TWILIGHT WILLOW (BLACKCURRANT) (CHILLAX INFINITE)"
//   "10x ONE BAR V1 FRESH YAKULT (ONE BAR V1)"
function parseItemLine(line) {
  let quantity = 1;
  let text = line.trim();

  // 1) Extract quantity at the start: "10x ..." or "10 ..."
  const qtyMatch = text.match(/^(\d+)\s*x?\s*(.+)$/i);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10) || 1;
    text = qtyMatch[2].trim();
  }

  // 2) Extract brand as the LAST (...) group, variant name is what remains before it
  let item_brand_name = '';
  let item_variant_name = text;

  const lastParenOpen = text.lastIndexOf('(');
  const lastParenClose = text.lastIndexOf(')');
  if (lastParenOpen !== -1 && lastParenClose !== -1 && lastParenClose > lastParenOpen) {
    item_brand_name = text.slice(lastParenOpen + 1, lastParenClose).trim();
    item_variant_name = text.slice(0, lastParenOpen).trim();
  }

  // 3) Variant type: default to 'flavor' (you can adjust if you have better mapping)
  const item_variant_type = 'flavor';

  return {
    item_quantity: quantity,
    item_brand_name,
    item_variant_name,
    item_variant_type,
  };
}

// Map payment method from V1 to V2 fields
function mapPaymentFields(paymentMethodRaw) {
  const raw = String(paymentMethodRaw || '').trim().toLowerCase();
  if (!raw) {
    return {
      payment_method: '',
      bank_type: '',
    };
  }

  if (raw === 'cash') {
    return {
      payment_method: 'CASH',
      bank_type: '',
    };
  }

  // Anything not equal to "cash"
  return {
    payment_method: 'BANK_TRANSFER',
    bank_type: 'Unionbank',
  };
}

function toCsvRow(values) {
  // Escape values for CSV
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
    console.error(`❌ Sheet "${SOURCE_SHEET_NAME}" not found in workbook.`);
    console.error('   Available sheets:', wb.SheetNames.join(', '));
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

    if (!originalOrderNumber && !clientName && !itemsSummary) {
      // Skip completely empty rows
      continue;
    }

    const v2OrderNumber = buildV2OrderNumber(originalOrderNumber, orderDateRaw);
    const order_date = normalizeDate(orderDateRaw);

    const { payment_method, bank_type } = mapPaymentFields(paymentMethodRaw);

    const itemLines = splitItemsSummary(itemsSummary);
    if (itemLines.length === 0) {
      // No items; you may choose to log a warning
      console.warn(`⚠️  Order "${originalOrderNumber}" has no parsed items; skipping.`);
      continue;
    }

    let orderItemIndex = 0;
    for (const line of itemLines) {
      orderItemIndex += 1;
      const parsedItem = parseItemLine(line);

      // Build v2 row (per OrdersPage template)
      const v2Row = {
        order_number: v2OrderNumber,
        order_item_index: orderItemIndex,
        agent_id: '', // left blank as requested
        agent_name: agentName || '',
        client_id: '', // left blank as requested
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
        item_unit_price: '', // no unit price in V1 summary; left blank for now
        item_pricing_strategy: 'rsp',
      };

      outputRows.push(v2Row);
    }
  }

  if (outputRows.length === 0) {
    console.error('❌ No output rows generated. Check your sheet and column mappings.');
    process.exit(1);
  }

  console.log(`✅ Generated ${outputRows.length} order item row(s) for v2.`);

  // Write CSV with header matching OrdersPage template
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

