import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../docs/KA_Historical_PO_Fill_Template.xlsx');

const thin = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const FILL = {
  required: 'FFFDE68A',
  recommended: 'FFBFDBFE',
  optional: 'FFE5E7EB',
  auto: 'FFD1FAE5',
  example: 'FFF3F4F6',
};

const columns = [
  { key: 'external_po_ref', header: 'external_po_ref', width: 22, group: 'required', note: 'Old PO number. Repeat on every line of the same PO.' },
  { key: 'order_date', header: 'order_date', width: 14, group: 'required', note: 'Real 2024 date. YYYY-MM-DD. Not the day you type it.' },
  { key: 'client_name', header: 'client_name', width: 28, group: 'required', note: 'Client name as in OMS (or close). Agent matches to client_code.' },
  { key: 'shop_name', header: 'shop_name', width: 22, group: 'recommended', note: 'Required if the client has more than one shop.' },
  { key: 'address_label', header: 'address_label', width: 20, group: 'recommended', note: 'Required if the shop has more than one delivery address.' },
  { key: 'brand_name', header: 'brand_name', width: 20, group: 'required', note: 'Hub warehouse brand. Same variant name can exist on another brand — always fill both.' },
  { key: 'variant_name', header: 'variant_name', width: 22, group: 'required', note: 'Hub warehouse variant name. Matched with brand_name, never variant name alone.' },
  { key: 'quantity', header: 'quantity', width: 12, group: 'required', note: 'Units on this line.' },
  { key: 'unit_price', header: 'unit_price', width: 14, group: 'required', note: 'Price per unit.' },
  { key: 'line_total', header: 'line_total', width: 14, group: 'optional', note: 'Optional. Leave blank to use quantity × unit_price.' },
  { key: 'kam_email', header: 'kam_email', width: 26, group: 'recommended', note: 'KAM / owner email in OMS. Recommended.' },
  { key: 'warehouse_location_name', header: 'warehouse_location_name', width: 26, group: 'optional', note: 'Leave blank to use linked main warehouse.' },
  { key: 'discount', header: 'discount', width: 12, group: 'optional', note: 'PO header discount. Default 0. Repeat same value on every line of the PO.' },
  { key: 'rfpf_number', header: 'rfpf_number', width: 18, group: 'recommended', note: 'PO header RFPF. Repeat the same value on every line of the PO. Leave blank if none.' },
  { key: 'notes', header: 'notes', width: 28, group: 'optional', note: 'Optional. Legacy ref is added automatically.' },
  { key: 'sku', header: 'sku', width: 18, group: 'auto', note: 'LEAVE BLANK. Agent fills from hub brand + variant.' },
  { key: 'client_code', header: 'client_code', width: 14, group: 'auto', note: 'LEAVE BLANK. Agent fills from client_name.' },
  { key: 'shop_code', header: 'shop_code', width: 14, group: 'auto', note: 'LEAVE BLANK. Agent fills from shop_name.' },
  { key: 'payment_amount', header: 'payment_amount', width: 16, group: 'auto', note: 'LEAVE BLANK. Importer sets full PO total (treat as paid).' },
  { key: 'payment_method', header: 'payment_method', width: 16, group: 'auto', note: 'LEAVE BLANK. Defaults to CASH.' },
  { key: 'payment_date', header: 'payment_date', width: 14, group: 'auto', note: 'LEAVE BLANK. Defaults to order_date.' },
];

const examples = [
  {
    external_po_ref: 'LEGACY-2024-001',
    order_date: '2024-06-10',
    client_name: 'ABC Trading Inc.',
    shop_name: 'Main Branch',
    address_label: 'Main Receiving',
    brand_name: 'Brand A',
    variant_name: '500ml',
    quantity: 10,
    unit_price: 100,
    line_total: 1000,
    kam_email: 'kam@example.com',
    warehouse_location_name: '',
    discount: 0,
    rfpf_number: 'RFPF-2024-001',
    notes: 'DELETE this sample row',
    sku: '',
    client_code: '',
    shop_code: '',
    payment_amount: '',
    payment_method: '',
    payment_date: '',
  },
  {
    external_po_ref: 'LEGACY-2024-001',
    order_date: '2024-06-10',
    client_name: 'ABC Trading Inc.',
    shop_name: 'Main Branch',
    address_label: 'Main Receiving',
    brand_name: 'Brand B',
    variant_name: '500ml',
    quantity: 5,
    unit_price: 100,
    line_total: 500,
    kam_email: 'kam@example.com',
    warehouse_location_name: '',
    discount: 0,
    rfpf_number: 'RFPF-2024-001',
    notes: 'Same PO, different brand — keep brand_name',
    sku: '',
    client_code: '',
    shop_code: '',
    payment_amount: '',
    payment_method: '',
    payment_date: '',
  },
];

function fillColor(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function styleHeader(cell, group) {
  cell.font = { bold: true, name: 'Calibri', size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = thin;
  cell.fill = fillColor(FILL[group]);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'B1G OMS';
  wb.created = new Date();

  const readme = wb.addWorksheet('Read_Me', { views: [{ showGridLines: false }] });
  readme.getColumn(1).width = 22;
  readme.getColumn(2).width = 92;

  const readmeRows = [
    ['KA historical PO — fill-in template', ''],
    ['', ''],
    ['What this is', 'One Excel you fill with 2024 POs. One row per product line. No UUIDs.'],
    ['Products', 'SKUs come from the linked MAIN WAREHOUSE catalog. Always fill brand_name AND variant_name (same variant name can exist on another brand).'],
    ['Payment', 'Leave payment columns blank. Every imported PO is treated as fully paid. Method CASH. Payment date = order_date.'],
    ['IDs', 'Do not copy UUIDs. The agent matches names to OMS (client, shop, address, brand+variant) then the importer inserts.'],
    ['', ''],
    ['Your steps', ''],
    ['1', 'Create clients / shops / addresses / products in OMS first (hub warehouse catalog).'],
    ['2', 'Fill sheet PO_Lines. Delete the two sample rows before a real import.'],
    ['3', 'Repeat external_po_ref, order_date, client, shop, address, and rfpf_number on every line of the same old PO.'],
    ['4', 'Give this file to the agent in Cursor (Agent mode) to match names against the database.'],
    ['5', 'Fix Unmatched rows, then import (dry-run → pilot 5–10 POs → rest).'],
    ['', ''],
    ['Color', 'Meaning'],
    ['Yellow', 'Required — you must fill'],
    ['Blue', 'Recommended if the client has more than one shop / address, and for rfpf_number'],
    ['Gray', 'Optional'],
    ['Green', 'Leave blank — agent / importer fills'],
  ];

  readmeRows.forEach((pair, i) => {
    const row = readme.getRow(i + 1);
    row.getCell(1).value = pair[0];
    row.getCell(2).value = pair[1];
    row.getCell(1).font = { bold: true, name: 'Calibri', size: i === 0 ? 16 : 11 };
    row.getCell(2).font = { name: 'Calibri', size: 11 };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = i === 0 ? 24 : 18;
  });
  readme.getRow(16).getCell(1).fill = fillColor(FILL.required);
  readme.getRow(17).getCell(1).fill = fillColor(FILL.recommended);
  readme.getRow(18).getCell(1).fill = fillColor(FILL.optional);
  readme.getRow(19).getCell(1).fill = fillColor(FILL.auto);

  const sheet = wb.addWorksheet('PO_Lines', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 0 }],
  });

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  const groupRow = sheet.getRow(1);
  groupRow.height = 22;
  const groupLabels = {
    required: 'YOU FILL (required)',
    recommended: 'YOU FILL (if more than one shop/address)',
    optional: 'Optional',
    auto: 'LEAVE BLANK — agent matches / importer pays',
  };
  columns.forEach((c, i) => {
    const cell = groupRow.getCell(i + 1);
    cell.value = groupLabels[c.group];
    cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: 'FF111827' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = fillColor(FILL[c.group]);
    cell.border = thin;
  });

  const headerRow = sheet.getRow(2);
  headerRow.height = 32;
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    styleHeader(cell, c.group);
    cell.note = c.note;
  });

  examples.forEach((ex, idx) => {
    const row = sheet.getRow(3 + idx);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = ex[c.key];
      cell.border = thin;
      cell.fill = fillColor(FILL.example);
      cell.alignment = { vertical: 'middle' };
      if (c.key === 'order_date') cell.numFmt = 'yyyy-mm-dd';
      if (['quantity', 'unit_price', 'line_total', 'discount'].includes(c.key)) cell.numFmt = '#,##0.00';
    });
  });

  for (let r = 5; r <= 54; r++) {
    const row = sheet.getRow(r);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.border = thin;
      cell.fill = fillColor(FILL[c.group]);
      if (c.key === 'order_date') cell.numFmt = 'yyyy-mm-dd';
      if (['quantity', 'unit_price', 'line_total', 'discount'].includes(c.key)) cell.numFmt = '#,##0.00';
    });
  }

  const guide = wb.addWorksheet('Column_Guide');
  guide.columns = [
    { width: 28 },
    { width: 14 },
    { width: 18 },
    { width: 72 },
  ];
  const guideHeaders = ['Column', 'Fill?', 'Who', 'Rule'];
  guideHeaders.forEach((h, i) => {
    const cell = guide.getRow(1).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = fillColor('FFFDE68A');
    cell.border = thin;
  });
  const guideBody = [
    ['external_po_ref', 'Required', 'You', 'Same value on every line of one old PO. Not the system PO-YYYYMMDD number.'],
    ['order_date', 'Required', 'You', 'Business date YYYY-MM-DD. Analytics use this, not created_at.'],
    ['client_name', 'Required', 'You', 'Agent matches to key_account_clients. Must already exist in OMS.'],
    ['shop_name', 'If >1 shop', 'You', 'Must belong to that client. Agent matches shop_code.'],
    ['address_label', 'If >1 address', 'You', 'Must belong to that shop.'],
    ['brand_name', 'Required', 'You', 'Linked hub warehouse brand. Do not match variant name alone.'],
    ['variant_name', 'Required', 'You', 'Hub variant. Pair with brand_name → variant_id / sku.'],
    ['quantity', 'Required', 'You', 'Line quantity.'],
    ['unit_price', 'Required', 'You', 'Line unit price.'],
    ['line_total', 'Optional', 'You', 'Blank = quantity × unit_price.'],
    ['kam_email', 'Recommended', 'You', 'Must exist as KAM / owner profile email.'],
    ['warehouse_location_name', 'Optional', 'You', 'Blank = linked main warehouse.'],
    ['discount', 'Optional', 'You', 'Header discount for the whole PO. Default 0.'],
    ['rfpf_number', 'Recommended', 'You', 'PO header RFPF. Same value on every line of the PO. Blank if the old PO had none.'],
    ['notes', 'Optional', 'You', 'Any remark. Legacy ref is added on import.'],
    ['sku', 'Leave blank', 'Agent', 'Filled from hub brand + variant unique match.'],
    ['client_code', 'Leave blank', 'Agent', 'Filled from client_name unique match.'],
    ['shop_code', 'Leave blank', 'Agent', 'Filled from shop_name unique match.'],
    ['payment_amount', 'Leave blank', 'Importer', 'Full PO total. Historical = already paid. No when/how tracking.'],
    ['payment_method', 'Leave blank', 'Importer', 'CASH.'],
    ['payment_date', 'Leave blank', 'Importer', 'Equals order_date so cash sits in the PO month, not today.'],
  ];
  guideBody.forEach((vals, idx) => {
    const row = guide.getRow(idx + 2);
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = thin;
      cell.alignment = { wrapText: true, vertical: 'top' };
    });
    const name = vals[0];
    const group = ['sku', 'client_code', 'shop_code', 'payment_amount', 'payment_method', 'payment_date'].includes(
      name
    )
      ? 'auto'
      : ['shop_name', 'address_label', 'kam_email', 'rfpf_number'].includes(name)
        ? 'recommended'
        : [
            'external_po_ref',
            'order_date',
            'client_name',
            'brand_name',
            'variant_name',
            'quantity',
            'unit_price',
          ].includes(name)
          ? 'required'
          : 'optional';
    row.getCell(2).fill = fillColor(FILL[group]);
  });

  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
