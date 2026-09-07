import { fetchAllPaginated } from '../../../lib/supabasePaginate';
import { HttpError } from '../../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';
import { insertPaymentAllocations } from './payment-allocations';
import type { UserContext } from './purchase-order';

export const HISTORICAL_IMPORT_ROLES = ['sales_admin', 'sales_head'] as const;
export const HISTORICAL_IMPORT_PO_CHUNK = 20;

export type KAHistoricalLineInput = {
  excel_row?: number;
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
  quantity?: number | string;
  unit_price?: number | string;
  line_total?: number | string;
  kam_email?: string;
  warehouse_location_name?: string;
  discount?: number | string;
  rfpf_number?: string;
  notes?: string;
};

export type KAHistoricalPoPreviewItem = {
  excel_row?: number;
  brand: string;
  variant: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  lookup_ok: boolean;
};

export type KAHistoricalPoPreview = {
  external_po_ref: string;
  would_insert: boolean;
  order_date: string;
  client: string;
  shop: string;
  address: string;
  kam: string;
  rfpf_number: string | null;
  warehouse: string;
  line_count: number;
  subtotal: number;
  discount: number;
  total_amount: number;
  items: KAHistoricalPoPreviewItem[];
  issues: string[];
};

export type KAHistoricalImportPoResult = {
  external_po_ref: string;
  ok: boolean;
  po_number?: string;
  total_amount?: number;
  line_count?: number;
  order_date?: string;
  rfpf_number?: string | null;
  issues?: string[];
};

type CatalogClient = {
  id: string;
  company_id: string;
  client_name: string;
  client_code: string;
  status: string;
  payment_terms: string | null;
};
type CatalogShop = { id: string; client_id: string; shop_name: string; shop_code: string; is_active: boolean };
type CatalogAddr = { id: string; shop_id: string; address_label: string; is_default: boolean; is_active: boolean };
type CatalogKam = { id: string; email: string; role: string; status: string };
type CatalogBrand = { id: string; name: string; is_active: boolean };
type CatalogVariant = { id: string; name: string; sku: string | null; brand_id: string; is_active: boolean };
type CatalogLoc = { id: string; name: string; is_main: boolean };

type Catalog = {
  hubId: string | null;
  clients: CatalogClient[];
  shops: CatalogShop[];
  addresses: CatalogAddr[];
  kams: CatalogKam[];
  brands: CatalogBrand[];
  variants: CatalogVariant[];
  locations: CatalogLoc[];
};

const n = (s: unknown) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const money = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

function uniqueOr<T>(hits: T[], noneMsg: string, manyMsg: string): { ok: true; row: T } | { ok: false; error: string } {
  if (hits.length === 1) return { ok: true, row: hits[0] };
  if (hits.length === 0) return { ok: false, error: noneMsg };
  return { ok: false, error: manyMsg };
}

function paymentCreatedAt(orderDate: string) {
  return `${orderDate.slice(0, 10)}T04:00:00.000Z`;
}

async function resolveHubCompanyId(companyId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data: assign, error } = await sb
    .from('warehouse_company_assignments')
    .select('warehouse_user_id')
    .eq('client_company_id', companyId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!assign?.warehouse_user_id) return null;
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('company_id')
    .eq('id', assign.warehouse_user_id)
    .maybeSingle();
  if (pErr) throw pErr;
  return profile?.company_id ?? null;
}

function chunkIds(ids: string[], size = 200) {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

async function loadCatalog(companyId: string): Promise<Catalog> {
  const sb = getSupabaseAdmin();
  const hubId = await resolveHubCompanyId(companyId);

  const clients = await fetchAllPaginated<CatalogClient>(async (from, to) => {
    const { data, error } = await sb
      .from('key_account_clients')
      .select('id, company_id, client_name, client_code, status, payment_terms')
      .eq('company_id', companyId)
      .range(from, to);
    return { data: (data as CatalogClient[] | null) ?? null, error };
  });

  const shops: CatalogShop[] = [];
  for (const ids of chunkIds(clients.map((c) => c.id))) {
    const rows = await fetchAllPaginated<CatalogShop>(async (from, to) => {
      const { data, error } = await sb
        .from('key_account_shops')
        .select('id, client_id, shop_name, shop_code, is_active')
        .in('client_id', ids)
        .range(from, to);
      return { data: (data as CatalogShop[] | null) ?? null, error };
    });
    shops.push(...rows);
  }

  const addresses: CatalogAddr[] = [];
  for (const ids of chunkIds(shops.map((s) => s.id))) {
    const rows = await fetchAllPaginated<CatalogAddr>(async (from, to) => {
      const { data, error } = await sb
        .from('key_account_delivery_addresses')
        .select('id, shop_id, address_label, is_default, is_active')
        .in('shop_id', ids)
        .range(from, to);
      return { data: (data as CatalogAddr[] | null) ?? null, error };
    });
    addresses.push(...rows);
  }

  const { data: kams, error: kamErr } = await sb
    .from('profiles')
    .select('id, email, role, status')
    .eq('company_id', companyId)
    .in('role', ['sales_head', 'sales_director', 'key_account_manager', 'sales_admin']);
  if (kamErr) throw kamErr;

  let brands: CatalogBrand[] = [];
  let variants: CatalogVariant[] = [];
  let locations: CatalogLoc[] = [];
  if (hubId) {
    const { data: brandRows, error: bErr } = await sb
      .from('brands')
      .select('id, name, is_active')
      .eq('company_id', hubId);
    if (bErr) throw bErr;
    brands = (brandRows || []) as CatalogBrand[];

    variants = await fetchAllPaginated<CatalogVariant>(async (from, to) => {
      const { data, error } = await sb
        .from('variants')
        .select('id, name, sku, brand_id, is_active')
        .eq('company_id', hubId)
        .range(from, to);
      return { data: (data as CatalogVariant[] | null) ?? null, error };
    });

    const { data: locRows, error: lErr } = await sb
      .from('warehouse_locations')
      .select('id, name, is_main')
      .eq('company_id', hubId)
      .order('is_main', { ascending: false });
    if (lErr) throw lErr;
    locations = (locRows || []) as CatalogLoc[];
  }

  return {
    hubId,
    clients,
    shops,
    addresses,
    kams: (kams || []) as CatalogKam[],
    brands,
    variants,
    locations,
  };
}

function pickByName<T>(
  rows: T[],
  getName: (row: T) => string,
  wanted: string,
  noneMsg: string,
  manyMsg: (hits: T[]) => string
) {
  const want = n(wanted);
  if (!want) return uniqueOr(rows.length === 1 ? rows : [], noneMsg, manyMsg(rows));
  const exact = rows.filter((row) => n(getName(row)) === want);
  if (exact.length) return uniqueOr(exact, noneMsg, manyMsg(exact));
  const fuzzy = rows.filter((row) => n(getName(row)).includes(want) || want.includes(n(getName(row))));
  return uniqueOr(fuzzy, noneMsg, manyMsg(fuzzy));
}

type ResolvedLine = {
  excel_row?: number;
  errors: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
  source: KAHistoricalLineInput;
  client?: CatalogClient;
  shop?: CatalogShop;
  address?: CatalogAddr;
  kam?: CatalogKam;
  brand?: CatalogBrand;
  variant?: CatalogVariant;
  location?: CatalogLoc;
};

function resolveLine(row: KAHistoricalLineInput, catalog: Catalog): ResolvedLine {
  const errors: string[] = [];
  const qty = Number(row.quantity);
  const unitPrice = Number(row.unit_price);
  const lineTotal =
    row.line_total != null && String(row.line_total).trim() !== ''
      ? money(row.line_total)
      : money(qty * unitPrice);

  if (!String(row.external_po_ref || '').trim()) errors.push('missing external_po_ref');
  if (!String(row.order_date || '').trim()) errors.push('missing order_date');
  if (!String(row.client_name || '').trim() && !String(row.client_code || '').trim()) {
    errors.push('missing client_name');
  }
  if (!String(row.brand_name || '').trim() && !String(row.sku || '').trim()) errors.push('missing brand_name');
  if (!String(row.variant_name || '').trim() && !String(row.sku || '').trim()) errors.push('missing variant_name');
  if (!(qty > 0)) errors.push('quantity must be > 0');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.push('unit_price missing');

  let client: CatalogClient | undefined;
  const clientCode = String(row.client_code || '').trim();
  if (clientCode) {
    const hits = catalog.clients.filter((c) => n(c.client_code) === n(clientCode));
    const pick = uniqueOr(hits, `client_code not found: ${clientCode}`, `client_code ambiguous: ${clientCode}`);
    if (pick.ok) client = pick.row;
    else errors.push(pick.error);
  } else {
    const pick = pickByName(
      catalog.clients,
      (c) => c.client_name,
      String(row.client_name || ''),
      `client not found: ${row.client_name}`,
      (hits) => `client ambiguous: ${hits.map((c) => c.client_name).join(', ')}`
    );
    if (pick.ok) client = pick.row;
    else errors.push(pick.error);
  }

  let shop: CatalogShop | undefined;
  if (client) {
    const clientShops = catalog.shops.filter((s) => s.client_id === client!.id);
    const shopCode = String(row.shop_code || '').trim();
    const shopName = String(row.shop_name || '').trim();
    if (shopCode) {
      const hits = clientShops.filter((s) => n(s.shop_code) === n(shopCode));
      const pick = uniqueOr(hits, `shop_code not found: ${shopCode}`, `shop_code ambiguous: ${shopCode}`);
      if (pick.ok) shop = pick.row;
      else errors.push(pick.error);
    } else {
      const pick = pickByName(
        clientShops,
        (s) => s.shop_name,
        shopName,
        shopName ? `shop not found under client: ${shopName}` : 'shop_name required (client has multiple shops)',
        (hits) => `shop ambiguous: ${hits.map((s) => s.shop_name).join(', ')}`
      );
      if (pick.ok) shop = pick.row;
      else errors.push(pick.error);
    }
  }

  let address: CatalogAddr | undefined;
  if (shop) {
    const shopAddrs = catalog.addresses.filter((a) => a.shop_id === shop!.id && a.is_active !== false);
    const label = String(row.address_label || '').trim();
    if (!label) {
      const defaults = shopAddrs.filter((a) => a.is_default);
      const pick = uniqueOr(
        defaults.length === 1 ? defaults : shopAddrs,
        'address_label required (shop has multiple addresses)',
        `address ambiguous: ${shopAddrs.map((a) => a.address_label).join(', ')}`
      );
      if (pick.ok) address = pick.row;
      else errors.push(pick.error);
    } else {
      const pick = pickByName(
        shopAddrs,
        (a) => a.address_label,
        label,
        `address not found: ${label}`,
        (hits) => `address ambiguous: ${hits.map((a) => a.address_label).join(', ')}`
      );
      if (pick.ok) address = pick.row;
      else errors.push(pick.error);
    }
  }

  const kamEmail = String(row.kam_email || '').trim();
  const kamPick = uniqueOr(
    catalog.kams.filter((k) => n(k.email) === n(kamEmail)),
    `KAM not found: ${kamEmail || '(blank)'}`,
    `KAM ambiguous: ${kamEmail}`
  );
  if (!kamPick.ok) errors.push(kamPick.error);

  if (!catalog.hubId) errors.push('no linked warehouse hub for this Key Account company');

  let location = catalog.locations.find((l) => l.is_main) || catalog.locations[0];
  const locName = String(row.warehouse_location_name || '').trim();
  if (locName) {
    const pick = pickByName(
      catalog.locations,
      (l) => l.name,
      locName,
      `warehouse location not found: ${locName}`,
      () => 'warehouse location ambiguous'
    );
    if (pick.ok) location = pick.row;
    else errors.push(pick.error);
  } else if (!location) {
    errors.push('linked main warehouse location not found');
  }

  let brand: CatalogBrand | undefined;
  let variant: CatalogVariant | undefined;
  const sku = String(row.sku || '').trim();
  if (sku) {
    const hits = catalog.variants.filter((v) => n(v.sku || '') === n(sku) && v.is_active !== false);
    const pick = uniqueOr(hits, `sku not found in hub catalog: ${sku}`, `sku ambiguous: ${sku}`);
    if (pick.ok) {
      variant = pick.row;
      brand = catalog.brands.find((b) => b.id === variant!.brand_id);
    } else errors.push(pick.error);
  } else {
    const brandName = String(row.brand_name || '').trim();
    const variantName = String(row.variant_name || '').trim();
    const brandPick = pickByName(
      catalog.brands.filter((b) => b.is_active !== false),
      (b) => b.name,
      brandName,
      `hub brand not found: ${brandName}`,
      (hits) => `hub brand ambiguous: ${hits.map((b) => b.name).join(', ')}`
    );
    if (!brandPick.ok) errors.push(brandPick.error);
    else {
      brand = brandPick.row;
      const brandVars = catalog.variants.filter((v) => v.brand_id === brand!.id && v.is_active !== false);
      const varPick = pickByName(
        brandVars,
        (v) => v.name,
        variantName,
        `hub variant not found under ${brand.name}: ${variantName}`,
        (hits) => `hub variant ambiguous: ${hits.map((v) => v.name).join(', ')}`
      );
      if (varPick.ok) variant = varPick.row;
      else errors.push(varPick.error);
    }
  }

  return {
    excel_row: row.excel_row,
    errors,
    qty,
    unitPrice,
    lineTotal,
    source: row,
    client,
    shop,
    address,
    kam: kamPick.ok ? kamPick.row : undefined,
    brand,
    variant,
    location,
  };
}

async function alreadyImported(companyId: string, ref: string) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('purchase_orders')
    .select('id, po_number, notes')
    .eq('company_id', companyId)
    .ilike('notes', `%Legacy: ${ref}%`)
    .limit(5);
  if (error) throw error;
  return data || [];
}

function groupRows(rows: KAHistoricalLineInput[]) {
  const grouped = new Map<string, KAHistoricalLineInput[]>();
  rows.forEach((row, index) => {
    const ref = String(row.external_po_ref || '').trim();
    const withRow = { ...row, excel_row: row.excel_row || index + 3 };
    if (!grouped.has(ref)) grouped.set(ref, []);
    grouped.get(ref)!.push(withRow);
  });
  return grouped;
}

export async function dryRunKAHistoricalImport(
  ctx: UserContext,
  rows: KAHistoricalLineInput[]
): Promise<{
  dry_run: true;
  inserted: 0;
  po_count: number;
  line_count: number;
  ready_to_import: boolean;
  blocking_pos: number;
  purchase_orders: KAHistoricalPoPreview[];
}> {
  if (!HISTORICAL_IMPORT_ROLES.includes(ctx.role as (typeof HISTORICAL_IMPORT_ROLES)[number])) {
    throw new HttpError(403, 'Only Sales Admin or Sales Head can import historical purchase orders');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(400, 'No rows to import');
  }
  if (rows.length > 20000) throw new HttpError(400, 'Too many rows (max 20,000)');

  const catalog = await loadCatalog(ctx.companyId);
  const grouped = groupRows(rows);
  const purchase_orders: KAHistoricalPoPreview[] = [];
  let blocking = 0;

  for (const [ref, lines] of grouped) {
    const issues: string[] = [];
    const headerKeys = [
      'order_date',
      'client_name',
      'shop_name',
      'address_label',
      'kam_email',
      'discount',
      'rfpf_number',
    ] as const;
    for (const key of headerKeys) {
      const vals = [...new Set(lines.map((l) => String(l[key] ?? '').trim()))];
      if (vals.length > 1) issues.push(`header ${key} differs across lines: ${vals.join(' | ')}`);
    }

    const resolved = lines.map((line) => resolveLine(line, catalog));
    resolved.forEach((r) => issues.push(...r.errors.map((e) => `row ${r.excel_row}: ${e}`)));

    const first = resolved.find((r) => r.client);
    if (first?.client && ref) {
      const dupes = await alreadyImported(ctx.companyId, ref);
      if (dupes.length) {
        issues.push(`already in OMS: ${dupes.map((d) => d.po_number).join(', ')}`);
      }
    }

    const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
    const discount = money(lines[0]?.discount || 0);
    const total = money(subtotal - discount);
    const ok = issues.length === 0;
    if (!ok) blocking += 1;

    purchase_orders.push({
      external_po_ref: ref || '(blank)',
      would_insert: ok,
      order_date: String(lines[0].order_date || '').slice(0, 10),
      client: first?.client
        ? `${first.client.client_name} (${first.client.client_code})`
        : String(lines[0].client_name || ''),
      shop: first?.shop ? `${first.shop.shop_name} (${first.shop.shop_code})` : String(lines[0].shop_name || ''),
      address: first?.address?.address_label || String(lines[0].address_label || ''),
      kam: first?.kam?.email || String(lines[0].kam_email || ''),
      rfpf_number: String(lines[0].rfpf_number || '').trim() || null,
      warehouse: first?.location?.name || '(linked main)',
      line_count: lines.length,
      subtotal,
      discount,
      total_amount: total,
      items: resolved.map((r) => ({
        excel_row: r.excel_row,
        brand: r.brand?.name || String(r.source.brand_name || ''),
        variant: r.variant?.name || String(r.source.variant_name || ''),
        sku: r.variant?.sku || null,
        quantity: r.qty,
        unit_price: r.unitPrice,
        line_total: r.lineTotal,
        lookup_ok: r.errors.length === 0,
      })),
      issues,
    });
  }

  return {
    dry_run: true,
    inserted: 0,
    po_count: purchase_orders.length,
    line_count: rows.length,
    ready_to_import: blocking === 0,
    blocking_pos: blocking,
    purchase_orders,
  };
}

function spreadFullPay(items: { id: string; total_price: number }[], cash: number) {
  let left = money(cash);
  const out: { purchaseOrderItemId: string; amount: number; discount: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const take = isLast ? left : money(Math.min(left, Number(item.total_price) || 0));
    if (take > 0) {
      out.push({ purchaseOrderItemId: item.id, amount: take, discount: 0 });
      left = money(left - take);
    }
  }
  return out;
}

async function rollbackPo(poId: string) {
  const sb = getSupabaseAdmin();
  await sb.from('purchase_order_key_account_payments').delete().eq('purchase_order_id', poId);
  await sb.from('purchase_order_items').delete().eq('purchase_order_id', poId);
  await sb.from('purchase_orders').delete().eq('id', poId);
}

async function importOne(
  ctx: UserContext,
  catalog: Catalog,
  ref: string,
  lines: KAHistoricalLineInput[]
): Promise<KAHistoricalImportPoResult> {
  const previewIssues: string[] = [];
  const headerKeys = [
    'order_date',
    'client_name',
    'shop_name',
    'address_label',
    'kam_email',
    'discount',
    'rfpf_number',
  ] as const;
  for (const key of headerKeys) {
    const vals = [...new Set(lines.map((l) => String(l[key] ?? '').trim()))];
    if (vals.length > 1) previewIssues.push(`header ${key} differs across lines: ${vals.join(' | ')}`);
  }
  const resolved = lines.map((line) => resolveLine(line, catalog));
  resolved.forEach((r) => previewIssues.push(...r.errors.map((e) => `row ${r.excel_row}: ${e}`)));
  const first = resolved.find((r) => r.client && r.shop && r.address && r.kam && r.variant && r.location);
  if (!first) previewIssues.push('could not resolve header lookups');
  if (ref) {
    const dupes = await alreadyImported(ctx.companyId, ref);
    if (dupes.length) previewIssues.push(`already imported: ${dupes.map((d) => d.po_number).join(', ')}`);
  }
  if (previewIssues.length || !first) {
    return { ok: false, external_po_ref: ref, issues: previewIssues };
  }

  const orderDate = String(lines[0].order_date || '').slice(0, 10);
  const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
  const discount = money(lines[0]?.discount || 0);
  const total = money(subtotal - discount);
  const rfpfNumber = String(lines[0].rfpf_number || '').trim() || null;
  const extraNote = String(lines[0].notes || '').trim();
  const notes = [extraNote, `Legacy: ${ref}`, 'Imported historical PO (pre-system)'].filter(Boolean).join(' | ');

  const sb = getSupabaseAdmin();
  const { data: poNumber, error: numErr } = await sb.rpc('generate_key_account_po_number', {
    p_company_id: ctx.companyId,
  });
  if (numErr) throw numErr;
  if (!poNumber || typeof poNumber !== 'string') throw new HttpError(500, 'Failed to generate PO number');

  let poId: string | null = null;
  try {
    const { data: po, error: poErr } = await sb
      .from('purchase_orders')
      .insert({
        company_id: ctx.companyId,
        po_number: poNumber,
        supplier_id: null,
        fulfillment_type: 'warehouse_transfer',
        warehouse_company_id: catalog.hubId,
        warehouse_location_id: first.location!.id,
        key_account_client_id: first.client!.id,
        key_account_shop_id: first.shop!.id,
        key_account_address_id: first.address!.id,
        kam_id: first.kam!.id,
        order_date: orderDate,
        expected_delivery_date: orderDate,
        notes,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        discount,
        total_amount: total,
        po_order_kind: 'standard',
        rfpf_number: rfpfNumber,
        key_account_payment_terms: first.client!.payment_terms || null,
        key_account_payment_mode: 'full',
        company_account_type: 'Key Accounts',
        workflow_status: 'kam_pending',
        status: 'pending',
        created_by: ctx.userId,
        custom_pricing_confirmed: true,
        key_account_payment_status: 'unpaid',
      })
      .select('id')
      .single();
    if (poErr) throw poErr;
    poId = po.id as string;

    const { data: insertedItems, error: itemsErr } = await sb
      .from('purchase_order_items')
      .insert(
        resolved.map((r) => ({
          company_id: ctx.companyId,
          purchase_order_id: poId,
          variant_id: r.variant!.id,
          warehouse_location_id: r.location!.id,
          quantity: r.qty,
          unit_price: r.unitPrice,
          total_price: r.lineTotal,
        }))
      )
      .select('id, total_price');
    if (itemsErr) throw itemsErr;

    if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
    const userSb = getSupabaseUser(ctx.accessToken);
    const { data: pay, error: payErr } = await userSb
      .from('purchase_order_key_account_payments')
      .insert({
        purchase_order_id: poId,
        company_id: ctx.companyId,
        amount: total,
        settlement_discount: 0,
        payment_method: 'CASH',
        bank_type: null,
        proof_storage_path: null,
        created_at: paymentCreatedAt(orderDate),
      })
      .select('id')
      .single();
    if (payErr) throw payErr;

    const splits = spreadFullPay((insertedItems || []) as { id: string; total_price: number }[], total);
    if (pay?.id && splits.length) {
      await insertPaymentAllocations(ctx.companyId, pay.id, splits, { includeDiscount: true });
    }

    const { error: updErr } = await sb
      .from('purchase_orders')
      .update({
        status: 'fulfilled',
        workflow_status: 'delivered',
        key_account_payment_status: 'paid',
      })
      .eq('id', poId);
    if (updErr) throw updErr;

    await sb.rpc('log_purchase_order_event', {
      p_purchase_order_id: poId,
      p_event_type: 'created',
      p_note: `Imported historical PO (pre-system). Legacy: ${ref}`,
      p_created_by: ctx.userId,
    });

    return {
      ok: true,
      external_po_ref: ref,
      po_number: poNumber,
      total_amount: total,
      line_count: resolved.length,
      order_date: orderDate,
      rfpf_number: rfpfNumber,
    };
  } catch (error) {
    if (poId) await rollbackPo(poId);
    return {
      ok: false,
      external_po_ref: ref,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function importKAHistoricalPos(
  ctx: UserContext,
  rows: KAHistoricalLineInput[]
): Promise<{
  dry_run: false;
  imported: number;
  failed: number;
  results: KAHistoricalImportPoResult[];
}> {
  if (!HISTORICAL_IMPORT_ROLES.includes(ctx.role as (typeof HISTORICAL_IMPORT_ROLES)[number])) {
    throw new HttpError(403, 'Only Sales Admin or Sales Head can import historical purchase orders');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new HttpError(400, 'No rows to import');
  }

  const grouped = groupRows(rows);
  if (grouped.size > HISTORICAL_IMPORT_PO_CHUNK) {
    throw new HttpError(
      400,
      `Import at most ${HISTORICAL_IMPORT_PO_CHUNK} purchase orders per request. The page sends batches automatically.`
    );
  }

  const catalog = await loadCatalog(ctx.companyId);
  const results: KAHistoricalImportPoResult[] = [];
  for (const [ref, lines] of grouped) {
    results.push(await importOne(ctx, catalog, ref, lines));
  }

  return {
    dry_run: false,
    imported: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
