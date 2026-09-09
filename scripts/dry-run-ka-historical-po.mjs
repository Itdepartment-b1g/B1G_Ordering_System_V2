/**
 * Dry-run historical KA PO import.
 * Reads docs/KA_Historical_PO_Fill_Template.xlsx, resolves OMS lookups, prints a preview.
 * INSERTS NOTHING. Does not call generate_key_account_po_number (that would consume a number).
 */
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fillDownHistoricalPoRows } from './ka-historical-po-fill-down.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.join(__dirname, '../docs/KA_Historical_PO_Fill_Template.xlsx');

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const n = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

function cellVal(cell) {
  let v = cell?.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v.text) v = v.text;
  if (typeof v === 'object' && v.result != null) v = v.result;
  if (typeof v === 'object' && v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === 'number' ? v : String(v).trim();
}

async function readExcelRows() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const sheet = wb.getWorksheet('PO_Lines');
  if (!sheet) throw new Error('Sheet PO_Lines not found');
  const headers = [];
  sheet.getRow(2).eachCell((c, i) => {
    headers[i] = String(c.value || '').trim();
  });
  const rows = [];
  sheet.eachRow((row, num) => {
    if (num <= 2) return;
    const obj = { excel_row: num };
    headers.forEach((h, i) => {
      if (!h) return;
      const v = cellVal(row.getCell(i));
      if (v !== '' && v != null) obj[h] = v;
    });
    rows.push(obj);
  });
  return fillDownHistoricalPoRows(rows);
}

function uniqueOr(hits, noneMsg, manyMsg) {
  if (hits.length === 1) return { ok: true, row: hits[0] };
  if (hits.length === 0) return { ok: false, error: noneMsg };
  return { ok: false, error: manyMsg };
}

async function resolveHub(companyId) {
  const { data: assign } = await sb
    .from('warehouse_company_assignments')
    .select('warehouse_user_id')
    .eq('client_company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (!assign?.warehouse_user_id) return { hubId: null, location: null };
  const { data: wp } = await sb
    .from('profiles')
    .select('company_id')
    .eq('id', assign.warehouse_user_id)
    .maybeSingle();
  const hubId = wp?.company_id || null;
  if (!hubId) return { hubId: null, location: null };
  const { data: locations } = await sb
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', hubId)
    .order('is_main', { ascending: false });
  const named = null;
  const main = (locations || []).find((l) => l.is_main) || (locations || [])[0] || null;
  return { hubId, location: main, locations: locations || [] };
}

async function resolveLine(row) {
  const errors = [];
  const clientName = String(row.client_name || '').trim();
  const shopName = String(row.shop_name || '').trim();
  const addrLabel = String(row.address_label || '').trim();
  const brandName = String(row.brand_name || '').trim();
  const variantName = String(row.variant_name || '').trim();
  const kamEmail = String(row.kam_email || '').trim();
  const qty = Number(row.quantity);
  const unitPrice = Number(row.unit_price);
  const lineTotal =
    row.line_total != null && row.line_total !== '' ? money(row.line_total) : money(qty * unitPrice);

  if (!row.external_po_ref) errors.push('missing external_po_ref');
  if (!row.order_date) errors.push('missing order_date');
  if (!clientName) errors.push('missing client_name');
  if (!brandName) errors.push('missing brand_name');
  if (!variantName) errors.push('missing variant_name');
  if (!(qty > 0)) errors.push('quantity must be > 0');
  if (!(unitPrice >= 0)) errors.push('unit_price missing');

  const { data: clients, error: cErr } = await sb
    .from('key_account_clients')
    .select('id, company_id, client_name, client_code, status, payment_terms')
    .ilike('client_name', `%${clientName.replace(/[%_,]/g, '')}%`);
  if (cErr) throw cErr;
  const clientExact = (clients || []).filter((c) => n(c.client_name) === n(clientName));
  const clientPick = uniqueOr(
    clientExact.length ? clientExact : clients || [],
    `client not found: ${clientName}`,
    `client ambiguous: ${(clients || []).map((c) => c.client_name).join(', ')}`
  );
  if (!clientPick.ok) {
    errors.push(clientPick.error);
    return { errors, lineTotal, qty, unitPrice };
  }
  const client = clientPick.row;

  const { data: shops } = await sb
    .from('key_account_shops')
    .select('id, shop_name, shop_code, is_active')
    .eq('client_id', client.id);
  let shopHits = (shops || []).filter((s) => n(s.shop_name) === n(shopName));
  if (!shopName && (shops || []).length === 1) shopHits = shops;
  const shopPick = uniqueOr(
    shopHits,
    shopName ? `shop not found under client: ${shopName}` : 'shop_name required (client has multiple shops)',
    `shop ambiguous: ${shopHits.map((s) => s.shop_name).join(', ')}`
  );
  if (!shopPick.ok) errors.push(shopPick.error);
  const shop = shopPick.ok ? shopPick.row : null;

  let address = null;
  if (shop) {
    const { data: addrs } = await sb
      .from('key_account_delivery_addresses')
      .select('id, address_label, is_default, is_active')
      .eq('shop_id', shop.id);
    let addrHits = (addrs || []).filter((a) => n(a.address_label) === n(addrLabel));
    if (!addrLabel) {
      const defaults = (addrs || []).filter((a) => a.is_default);
      if (defaults.length === 1) addrHits = defaults;
      else if ((addrs || []).length === 1) addrHits = addrs;
    }
    const addrPick = uniqueOr(
      addrHits,
      addrLabel ? `address not found: ${addrLabel}` : 'address_label required (shop has multiple addresses)',
      `address ambiguous: ${addrHits.map((a) => a.address_label).join(', ')}`
    );
    if (!addrPick.ok) errors.push(addrPick.error);
    else address = addrPick.row;
  }

  const { data: kams } = await sb
    .from('profiles')
    .select('id, email, role, status, company_id')
    .eq('company_id', client.company_id)
    .ilike('email', kamEmail || '___none___');
  const kamPick = uniqueOr(
    kams || [],
    `KAM not found: ${kamEmail || '(blank)'}`,
    `KAM ambiguous: ${kamEmail}`
  );
  if (!kamPick.ok) errors.push(kamPick.error);

  const hub = await resolveHub(client.company_id);
  if (!hub.hubId) errors.push('no linked warehouse hub for this Key Account company');

  let brand = null;
  let variant = null;
  let location = hub.location;
  if (row.warehouse_location_name && hub.locations?.length) {
    const locHits = hub.locations.filter(
      (l) => n(l.name) === n(row.warehouse_location_name)
    );
    const locPick = uniqueOr(
      locHits,
      `warehouse location not found: ${row.warehouse_location_name}`,
      'warehouse location ambiguous'
    );
    if (!locPick.ok) errors.push(locPick.error);
    else location = locPick.row;
  }

  if (hub.hubId) {
    const { data: brands } = await sb
      .from('brands')
      .select('id, name, is_active')
      .eq('company_id', hub.hubId)
      .ilike('name', `%${brandName.replace(/[%_,]/g, '')}%`);
    const brandExact = (brands || []).filter((b) => n(b.name) === n(brandName));
    const brandPick = uniqueOr(
      brandExact.length ? brandExact : brands || [],
      `hub brand not found: ${brandName}`,
      `hub brand ambiguous: ${(brands || []).map((b) => b.name).join(', ')}`
    );
    if (!brandPick.ok) errors.push(brandPick.error);
    else {
      brand = brandPick.row;
      const { data: variants } = await sb
        .from('variants')
        .select('id, name, sku, is_active, brand_id')
        .eq('company_id', hub.hubId)
        .eq('brand_id', brand.id)
        .ilike('name', `%${variantName.replace(/[%_,]/g, '')}%`);
      const varExact = (variants || []).filter((v) => n(v.name) === n(variantName));
      const varPick = uniqueOr(
        varExact.length ? varExact : variants || [],
        `hub variant not found under ${brand.name}: ${variantName}`,
        `hub variant ambiguous: ${(variants || []).map((v) => v.name).join(', ')}`
      );
      if (!varPick.ok) errors.push(varPick.error);
      else variant = varPick.row;
    }
  }

  return {
    errors,
    qty,
    unitPrice,
    lineTotal,
    client,
    shop,
    address,
    kam: kamPick.ok ? kamPick.row : null,
    hubId: hub.hubId,
    location,
    brand,
    variant,
  };
}

async function alreadyImported(companyId, ref) {
  const { data, error } = await sb
    .from('purchase_orders')
    .select('id, po_number, notes')
    .eq('company_id', companyId)
    .ilike('notes', `%Legacy: ${ref}%`)
    .limit(5);
  if (error) throw error;
  return data || [];
}

export { sb, money, readExcelRows, resolveLine, alreadyImported };

async function main() {
  const rows = await readExcelRows();
  if (!rows.length) {
    console.log(JSON.stringify({ dry_run: true, inserted: 0, error: 'No data rows in PO_Lines' }, null, 2));
    return;
  }

  const grouped = new Map();
  for (const row of rows) {
    const ref = String(row.external_po_ref || '').trim();
    if (!grouped.has(ref)) grouped.set(ref, []);
    grouped.get(ref).push(row);
  }

  const pos = [];
  let blocking = 0;

  for (const [ref, lines] of grouped) {
    const issues = [];
    const headerKeys = ['order_date', 'client_name', 'shop_name', 'address_label', 'kam_email', 'discount', 'rfpf_number'];
    for (const key of headerKeys) {
      const vals = [...new Set(lines.map((l) => String(l[key] ?? '').trim()))];
      if (vals.length > 1) issues.push(`header ${key} differs across lines: ${vals.join(' | ')}`);
    }

    const resolved = [];
    for (const line of lines) {
      const r = await resolveLine(line);
      resolved.push({ excel_row: line.excel_row, ...r, source: line });
      issues.push(...r.errors.map((e) => `row ${line.excel_row}: ${e}`));
    }

    const firstOk = resolved.find((r) => r.client);
    const companyId = firstOk?.client?.company_id || null;
    if (companyId && ref) {
      const dupes = await alreadyImported(companyId, ref);
      if (dupes.length) {
        issues.push(
          `already in OMS (notes contain Legacy: ${ref}): ${dupes.map((d) => d.po_number).join(', ')}`
        );
      }
    }

    const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
    const discount = money(lines[0]?.discount || 0);
    const total = money(subtotal - discount);
    const paymentAmount = total;

    const previewItems = resolved.map((r) => ({
      excel_row: r.excel_row,
      brand: r.brand?.name || r.source.brand_name,
      variant: r.variant?.name || r.source.variant_name,
      sku: r.variant?.sku || null,
      quantity: r.qty,
      unit_price: r.unitPrice,
      line_total: r.lineTotal,
      lookup_ok: r.errors.length === 0,
    }));

    const ok = issues.length === 0;
    if (!ok) blocking += 1;

    pos.push({
      external_po_ref: ref || '(blank)',
      would_insert: ok,
      order_date: String(lines[0].order_date || ''),
      expected_delivery_date: String(lines[0].order_date || ''),
      client: firstOk?.client
        ? `${firstOk.client.client_name} (${firstOk.client.client_code})`
        : lines[0].client_name,
      shop: firstOk?.shop ? `${firstOk.shop.shop_name} (${firstOk.shop.shop_code})` : lines[0].shop_name,
      address: firstOk?.address?.address_label || lines[0].address_label,
      kam: firstOk?.kam?.email || lines[0].kam_email,
      rfpf_number: String(lines[0].rfpf_number || '').trim() || null,
      warehouse: firstOk?.location?.name || '(linked main)',
      status_if_imported: 'fulfilled',
      workflow_if_imported: 'delivered',
      commissioned_if_imported: true,
      payment_if_imported: {
        amount: paymentAmount,
        method: 'CASH',
        proof: null,
        payment_date: String(lines[0].order_date || ''),
        key_account_payment_status: 'paid',
      },
      po_number: '(would call generate_key_account_po_number — not called in dry-run)',
      line_count: lines.length,
      subtotal,
      discount,
      total_amount: total,
      items: previewItems,
      issues,
    });
  }

  console.log(
    JSON.stringify(
      {
        dry_run: true,
        inserted: 0,
        file: 'docs/KA_Historical_PO_Fill_Template.xlsx',
        po_count: pos.length,
        line_count: rows.length,
        ready_to_import: blocking === 0,
        blocking_pos: blocking,
        purchase_orders: pos,
      },
      null,
      2
    )
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
