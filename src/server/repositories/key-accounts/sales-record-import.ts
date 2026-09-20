import { fetchAllPaginated } from '../../../lib/supabasePaginate';
import { HttpError } from '../../http/errors';
import { getSupabaseAdmin, getSupabaseUser } from '../../db/supabaseAdmin';
import { insertPaymentAllocations } from './payment-allocations';
import type { UserContext } from './purchase-order';
import { createKAAddress, createKAClient, createKAShop } from './client-hierarchy';

export const SALES_RECORD_IMPORT_ROLES = ['sales_admin', 'sales_head'] as const;
export const SALES_RECORD_IMPORT_PO_CHUNK = 20;

export type KASalesRecordLineInput = {
  excel_row?: number;
  sheet_name?: string;
  source_row_key?: string;
  external_po_ref?: string;
  order_date?: string;
  expected_delivery_date?: string;
  client_name?: string;
  shop_name?: string;
  address_label?: string;
  client_category?: string;
  contact_phone?: string;
  province?: string;
  city?: string;
  brand_name?: string;
  variant_name?: string;
  sku?: string;
  quantity?: number | string;
  unit_price?: number | string;
  line_total?: number | string;
  agent_name?: string;
  kam_email?: string;
  warehouse_location_name?: string;
  discount?: number | string;
  rfpf_number?: string;
  notes?: string;
  inventory_kind?: string;
  excel_status?: string;
  payment_amount?: number | string;
  payment_date?: string;
  payment_method?: string;
  bank_type?: string | null;
  remaining_balance?: number | string;
  comm_released?: boolean;
};

export type KASalesRecordPreviewItem = {
  excel_row?: number;
  sheet_name?: string;
  excel_brand: string;
  excel_variant: string;
  brand: string;
  variant: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  lookup_ok: boolean;
};

export type KASalesRecordPoPreview = {
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
  payment_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  po_order_kind: 'standard' | 'consignment';
  commissioned: boolean;
  will_create_client: boolean;
  will_create_shop: boolean;
  will_create_address: boolean;
  items: KASalesRecordPreviewItem[];
  issues: string[];
};

export type KASalesRecordPendingMaster = {
  client_name: string;
  shop_name: string;
  address_label: string;
  full_address: string;
  category: string;
  create_client: boolean;
  create_shop: boolean;
  create_address: boolean;
};

export type KASalesRecordImportOptions = {
  createMissing?: boolean;
};

export type KASalesRecordImportPoResult = {
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

function normalizeRfpf(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

type CatalogPick<T> = { ok: true; row: T } | { ok: false; error: string };

function uniqueOr<T>(hits: T[], noneMsg: string, manyMsg: string): CatalogPick<T> {
  if (hits.length === 1) return { ok: true, row: hits[0] };
  if (hits.length === 0) return { ok: false, error: noneMsg };
  return { ok: false, error: manyMsg };
}

function pickError<T>(pick: CatalogPick<T>): string {
  return 'error' in pick ? pick.error : '';
}

function paymentCreatedAt(date: string) {
  const day = String(date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `${day}T04:00:00.000Z`;
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
): CatalogPick<T> {
  const want = n(wanted);
  if (!want) return uniqueOr(rows.length === 1 ? rows : [], noneMsg, manyMsg(rows));
  const exact = rows.filter((row) => n(getName(row)) === want);
  if (exact.length) return uniqueOr(exact, noneMsg, manyMsg(exact));
  const fuzzy = rows.filter((row) => n(getName(row)).includes(want) || want.includes(n(getName(row))));
  return uniqueOr(fuzzy, noneMsg, manyMsg(fuzzy));
}

const MASTER_NOTE = 'Created from sales record import';

function shopNameOf(row: KASalesRecordLineInput) {
  return String(row.shop_name || '').trim() || String(row.client_name || '').trim();
}

function mapClientCategory(raw: unknown) {
  const t = n(raw);
  if (t.includes('reseller')) return 'reseller';
  if (t.includes('distributor') || t.includes('distri')) {
    if (t.includes('multi') && t.includes('retail')) return 'distri w/ multi retail';
    if (t.includes('retail')) return 'distri w/ retail';
    return 'distributor';
  }
  if (t.includes('multi')) return 'multi retail';
  return 'retail';
}

function addressFields(row: KASalesRecordLineInput, shopName: string) {
  const raw = String(row.address_label || '').trim();
  if (!raw) return { label: 'Main', full: shopName || 'Main', raw: '' };
  const looksFull = raw.length >= 12 || raw.includes(',') || /\d/.test(raw);
  if (looksFull) return { label: 'Main', full: raw, raw };
  return { label: raw, full: shopName || raw, raw };
}

function isMissingPick(error: string, prefix: string) {
  return error.startsWith(prefix);
}

type ResolvedLine = {
  excel_row?: number;
  errors: string[];
  qty: number;
  unitPrice: number;
  lineTotal: number;
  source: KASalesRecordLineInput;
  client?: CatalogClient;
  shop?: CatalogShop;
  address?: CatalogAddr;
  kam?: CatalogKam;
  brand?: CatalogBrand;
  variant?: CatalogVariant;
  location?: CatalogLoc;
  wouldCreateClient: boolean;
  wouldCreateShop: boolean;
  wouldCreateAddress: boolean;
};

function resolveLine(
  row: KASalesRecordLineInput,
  catalog: Catalog,
  options: { createMissing: boolean }
): ResolvedLine {
  const errors: string[] = [];
  const qty = Number(row.quantity);
  const unitPrice = Number(row.unit_price);
  const lineTotal =
    row.line_total != null && String(row.line_total).trim() !== ''
      ? money(row.line_total)
      : money(qty * unitPrice);
  let wouldCreateClient = false;
  let wouldCreateShop = false;
  let wouldCreateAddress = false;

  if (!String(row.external_po_ref || '').trim()) errors.push('missing RFPF');
  if (!String(row.order_date || '').trim()) errors.push('missing order_date');
  if (!String(row.client_name || '').trim()) errors.push('missing client_name');
  if (!String(row.brand_name || '').trim() && !String(row.sku || '').trim()) errors.push('missing brand_name');
  if (!String(row.variant_name || '').trim() && !String(row.sku || '').trim()) errors.push('missing variant_name');
  if (!(qty > 0)) errors.push('quantity must be > 0');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.push('unit_price missing');

  let client: CatalogClient | undefined;
  const pickClient = pickByName(
    catalog.clients,
    (c) => c.client_name,
    String(row.client_name || ''),
    `client not found: ${row.client_name}`,
    (hits) => `client ambiguous: ${hits.map((c) => c.client_name).join(', ')}`
  );
  if (pickClient.ok) client = pickClient.row;
  else if (
    options.createMissing &&
    String(row.client_name || '').trim() &&
    isMissingPick(pickError(pickClient), 'client not found:')
  ) {
    wouldCreateClient = true;
  } else errors.push(pickError(pickClient));

  const shopName = shopNameOf(row);
  let shop: CatalogShop | undefined;
  if (wouldCreateClient) {
    wouldCreateShop = true;
    wouldCreateAddress = true;
  } else if (client) {
    const clientShops = catalog.shops.filter((s) => s.client_id === client!.id);
    const pickShop = pickByName(
      clientShops,
      (s) => s.shop_name,
      shopName,
      shopName ? `shop not found under client: ${shopName}` : 'shop_name required (client has multiple shops)',
      (hits) => `shop ambiguous: ${hits.map((s) => s.shop_name).join(', ')}`
    );
    if (pickShop.ok) shop = pickShop.row;
    else if (options.createMissing && isMissingPick(pickError(pickShop), 'shop not found')) {
      wouldCreateShop = true;
      wouldCreateAddress = true;
    } else errors.push(pickError(pickShop));
  }

  let address: CatalogAddr | undefined;
  if (wouldCreateShop) {
    wouldCreateAddress = true;
  } else if (shop) {
    const shopAddrs = catalog.addresses.filter((a) => a.shop_id === shop!.id && a.is_active !== false);
    const label = String(row.address_label || '').trim();
    if (!label) {
      const defaults = shopAddrs.filter((a) => a.is_default);
      const pick = uniqueOr(
        defaults.length === 1 ? defaults : shopAddrs,
        'no address for shop',
        `address ambiguous: ${shopAddrs.map((a) => a.address_label).join(', ')}`
      );
      if (pick.ok) address = pick.row;
      else if (options.createMissing && pickError(pick) === 'no address for shop') wouldCreateAddress = true;
      else errors.push(pickError(pick));
    } else {
      const pick = pickByName(
        shopAddrs,
        (a) => a.address_label,
        label,
        `address not found: ${label}`,
        (hits) => `address ambiguous: ${hits.map((a) => a.address_label).join(', ')}`
      );
      if (pick.ok) address = pick.row;
      else if (options.createMissing && isMissingPick(pickError(pick), 'address not found:')) wouldCreateAddress = true;
      else errors.push(pickError(pick));
    }
  }

  const kamEmail = String(row.kam_email || '').trim();
  const kamPick = uniqueOr(
    catalog.kams.filter((k) => n(k.email) === n(kamEmail)),
    kamEmail
      ? `KAM not found: ${kamEmail}`
      : `map agent to KAM email: ${row.agent_name || '(blank)'}`,
    `KAM ambiguous: ${kamEmail}`
  );
  if (!kamPick.ok) errors.push(pickError(kamPick));

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
    else errors.push(pickError(pick));
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
    } else errors.push(pickError(pick));
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
    if (!brandPick.ok) errors.push(pickError(brandPick));
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
      else errors.push(pickError(varPick));
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
    wouldCreateClient,
    wouldCreateShop,
    wouldCreateAddress,
  };
}

function groupRows(rows: KASalesRecordLineInput[]) {
  const grouped = new Map<string, KASalesRecordLineInput[]>();
  rows.forEach((row, index) => {
    const ref = String(row.external_po_ref || row.rfpf_number || '').trim();
    const key = normalizeRfpf(ref) || `BLANK-${index}`;
    const withRow = { ...row, excel_row: row.excel_row || index + 3, external_po_ref: ref };
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(withRow);
  });
  return grouped;
}

function summarizePayment(lines: KASalesRecordLineInput[]) {
  const seen = new Set<string>();
  let paid = 0;
  let paymentDate = '';
  let method = 'CASH';
  let bank: string | null = null;
  let comm = false;
  let kind: 'standard' | 'consignment' = 'standard';
  let excelStatus = '';
  for (const line of lines) {
    const key = String(line.source_row_key || `${line.sheet_name}|${line.excel_row}`);
    if (!seen.has(key)) {
      seen.add(key);
      paid += Number(line.payment_amount) || 0;
      const date = String(line.payment_date || '').slice(0, 10);
      if (date && date > paymentDate) paymentDate = date;
      const m = String(line.payment_method || '').toUpperCase();
      if (m === 'GCASH' || m === 'BANK_TRANSFER' || m === 'CASH' || m === 'CHEQUE') method = m;
      if (line.bank_type) bank = String(line.bank_type);
    }
    if (line.comm_released) comm = true;
    if (String(line.inventory_kind || '').toLowerCase() === 'consignment') kind = 'consignment';
    if (line.excel_status) excelStatus = String(line.excel_status);
  }
  return { paid: money(paid), paymentDate, method, bank, comm, kind, excelStatus };
}

function paymentStatus(total: number, paid: number, excelStatus: string): 'unpaid' | 'partial' | 'paid' {
  const status = excelStatus.trim().toLowerCase().replace(/\s+/g, '');
  if (status === 'paid') return paid + 0.05 >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  if (status === 'unpaid') return paid > 0.05 ? (paid + 0.05 >= total ? 'paid' : 'partial') : 'unpaid';
  if (status.includes('balance')) return paid > 0.05 ? 'partial' : 'unpaid';
  if (paid <= 0.05) return 'unpaid';
  if (paid + 0.05 >= total) return 'paid';
  return 'partial';
}

async function alreadyImported(companyId: string, ref: string) {
  const sb = getSupabaseAdmin();
  const [{ data: byNote, error: noteErr }, { data: byRfpf, error: rfpfErr }] = await Promise.all([
    sb
      .from('purchase_orders')
      .select('id, po_number, notes, rfpf_number')
      .eq('company_id', companyId)
      .ilike('notes', `%SalesRecord: ${ref}%`)
      .limit(5),
    sb
      .from('purchase_orders')
      .select('id, po_number, notes, rfpf_number')
      .eq('company_id', companyId)
      .eq('rfpf_number', ref)
      .limit(5),
  ]);
  if (noteErr) throw noteErr;
  if (rfpfErr) throw rfpfErr;
  const merged = [...(byNote || []), ...(byRfpf || [])];
  return merged.filter((row, index) => merged.findIndex((item) => item.id === row.id) === index);
}

function assertRole(ctx: UserContext) {
  if (!SALES_RECORD_IMPORT_ROLES.includes(ctx.role as (typeof SALES_RECORD_IMPORT_ROLES)[number])) {
    throw new HttpError(403, 'Only Sales Admin or Sales Head can import client sales records');
  }
}

function previewFromGroup(
  ref: string,
  lines: KASalesRecordLineInput[],
  resolved: ResolvedLine[],
  issues: string[],
  pay: ReturnType<typeof summarizePayment>
): KASalesRecordPoPreview {
  const first = resolved.find((r) => r.client) || resolved[0];
  const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
  const discount = money(lines[0]?.discount || 0);
  const total = money(subtotal - discount);
  const status = paymentStatus(total, pay.paid, pay.excelStatus);
  const commissioned = status === 'paid' && pay.comm;
  const willCreateClient = resolved.some((r) => r.wouldCreateClient);
  const willCreateShop = resolved.some((r) => r.wouldCreateShop);
  const willCreateAddress = resolved.some((r) => r.wouldCreateAddress);
  const excelClient = String(lines[0]?.client_name || '');
  const excelShop = shopNameOf(lines[0] || {});
  return {
    external_po_ref: String(lines[0]?.external_po_ref || ref),
    would_insert: issues.length === 0,
    order_date: String(lines[0]?.order_date || '').slice(0, 10),
    client: first?.client
      ? `${first.client.client_name} (${first.client.client_code})`
      : `${excelClient}${willCreateClient ? ' (new)' : ''}`,
    shop: first?.shop
      ? `${first.shop.shop_name} (${first.shop.shop_code})`
      : `${excelShop}${willCreateShop ? ' (new)' : ''}`,
    address: first?.address?.address_label
      || `${addressFields(lines[0] || {}, excelShop).label}${willCreateAddress ? ' (new)' : ''}`,
    kam: first?.kam?.email || String(lines[0]?.kam_email || lines[0]?.agent_name || ''),
    rfpf_number: String(lines[0]?.rfpf_number || lines[0]?.external_po_ref || '').trim() || null,
    warehouse: first?.location?.name || '(linked main)',
    line_count: lines.length,
    subtotal,
    discount,
    total_amount: total,
    payment_amount: pay.paid,
    payment_status: status,
    po_order_kind: pay.kind,
    commissioned,
    will_create_client: willCreateClient,
    will_create_shop: willCreateShop,
    will_create_address: willCreateAddress,
    items: resolved.map((r) => ({
      excel_row: r.excel_row,
      sheet_name: r.source.sheet_name,
      excel_brand: String(r.source.brand_name || ''),
      excel_variant: String(r.source.variant_name || ''),
      brand: r.brand?.name || String(r.source.brand_name || ''),
      variant: r.variant?.name || String(r.source.variant_name || ''),
      sku: r.variant?.sku || r.source.sku || null,
      quantity: r.qty,
      unit_price: r.unitPrice,
      line_total: r.lineTotal,
      lookup_ok: r.errors.length === 0,
    })),
    issues,
  };
}

type PendingMaster = {
  clientName: string;
  shopName: string;
  addressLabel: string;
  fullAddress: string;
  category: string;
  contactPhone?: string;
  province?: string;
  city?: string;
  createClient: boolean;
  createShop: boolean;
  createAddress: boolean;
  kamId?: string;
};

function pendingFromLine(r: ResolvedLine): PendingMaster | null {
  if (!r.wouldCreateClient && !r.wouldCreateShop && !r.wouldCreateAddress) return null;
  const clientName = String(r.source.client_name || '').trim();
  if (!clientName) return null;
  const shopName = shopNameOf(r.source);
  const addr = addressFields(r.source, shopName);
  return {
    clientName,
    shopName,
    addressLabel: addr.label,
    fullAddress: addr.full,
    category: mapClientCategory(r.source.client_category),
    contactPhone: String(r.source.contact_phone || '').trim() || undefined,
    province: String(r.source.province || '').trim() || undefined,
    city: String(r.source.city || '').trim() || undefined,
    createClient: Boolean(r.wouldCreateClient),
    createShop: Boolean(r.wouldCreateShop || r.wouldCreateClient),
    createAddress: Boolean(r.wouldCreateAddress || r.wouldCreateShop || r.wouldCreateClient),
    kamId: r.kam?.id,
  };
}

function collectPendingMaster(resolved: ResolvedLine[]): KASalesRecordPendingMaster[] {
  const map = new Map<string, PendingMaster>();
  for (const line of resolved) {
    const pending = pendingFromLine(line);
    if (!pending) continue;
    const key = `${n(pending.clientName)}|${n(pending.shopName)}|${n(pending.addressLabel)}`;
    const prev = map.get(key);
    if (!prev) map.set(key, pending);
    else {
      prev.createClient = prev.createClient || pending.createClient;
      prev.createShop = prev.createShop || pending.createShop;
      prev.createAddress = prev.createAddress || pending.createAddress;
      prev.kamId = prev.kamId || pending.kamId;
      prev.contactPhone = prev.contactPhone || pending.contactPhone;
      prev.province = prev.province || pending.province;
      prev.city = prev.city || pending.city;
    }
  }
  return [...map.values()].map((p) => ({
    client_name: p.clientName,
    shop_name: p.shopName,
    address_label: p.addressLabel,
    full_address: p.fullAddress,
    category: p.category,
    create_client: p.createClient,
    create_shop: p.createShop,
    create_address: p.createAddress,
  }));
}

async function assignKamIfNeeded(ctx: UserContext, clientId: string, kamId?: string) {
  if (!kamId) return;
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('kam_client_assignments').insert({
    kam_id: kamId,
    client_id: clientId,
    company_id: ctx.companyId,
    assigned_by: ctx.userId,
    notes: 'Assigned from sales record import',
  });
  if (error && error.code !== '23505') throw error;
}

async function ensureMissingMaster(
  ctx: UserContext,
  catalog: Catalog,
  rows: KASalesRecordLineInput[]
) {
  const pendingMap = new Map<string, PendingMaster>();
  for (const row of rows) {
    const pending = pendingFromLine(resolveLine(row, catalog, { createMissing: true }));
    if (!pending) continue;
    const key = `${n(pending.clientName)}|${n(pending.shopName)}|${n(pending.addressLabel)}`;
    const prev = pendingMap.get(key);
    if (!prev) pendingMap.set(key, pending);
    else {
      prev.createClient = prev.createClient || pending.createClient;
      prev.createShop = prev.createShop || pending.createShop;
      prev.createAddress = prev.createAddress || pending.createAddress;
      prev.kamId = prev.kamId || pending.kamId;
      prev.contactPhone = prev.contactPhone || pending.contactPhone;
      prev.province = prev.province || pending.province;
      prev.city = prev.city || pending.city;
    }
  }

  const createdClients = new Set<string>();
  for (const pending of pendingMap.values()) {
    if (!pending.createClient) continue;
    const key = n(pending.clientName);
    if (createdClients.has(key) || catalog.clients.some((c) => n(c.client_name) === key)) {
      createdClients.add(key);
      continue;
    }
    const { client } = await createKAClient(ctx, {
      client_name: pending.clientName,
      client_category: pending.category,
      contact_phone: pending.contactPhone || null,
      notes: MASTER_NOTE,
    });
    catalog.clients.push({
      id: client.id,
      company_id: client.company_id,
      client_name: client.client_name,
      client_code: client.client_code,
      status: client.status,
      payment_terms: client.payment_terms ?? null,
    });
    await assignKamIfNeeded(ctx, client.id, pending.kamId);
    createdClients.add(key);
  }

  for (const pending of pendingMap.values()) {
    if (!pending.createShop) continue;
    const client = catalog.clients.find((c) => n(c.client_name) === n(pending.clientName));
    if (!client) continue;
    if (catalog.shops.some((s) => s.client_id === client.id && n(s.shop_name) === n(pending.shopName))) continue;
    const { shop } = await createKAShop(ctx, client.id, {
      shop_name: pending.shopName,
      city: pending.city || null,
      province: pending.province || null,
      contact_phone: pending.contactPhone || null,
      notes: MASTER_NOTE,
    });
    catalog.shops.push({
      id: shop.id,
      client_id: shop.client_id,
      shop_name: shop.shop_name,
      shop_code: shop.shop_code,
      is_active: shop.is_active,
    });
  }

  for (const pending of pendingMap.values()) {
    if (!pending.createAddress) continue;
    const client = catalog.clients.find((c) => n(c.client_name) === n(pending.clientName));
    const shop =
      client &&
      catalog.shops.find((s) => s.client_id === client.id && n(s.shop_name) === n(pending.shopName));
    if (!shop) continue;
    if (
      catalog.addresses.some(
        (a) => a.shop_id === shop.id && n(a.address_label) === n(pending.addressLabel) && a.is_active !== false
      )
    ) {
      continue;
    }
    const { address } = await createKAAddress(ctx, shop.id, {
      address_label: pending.addressLabel,
      full_address: pending.fullAddress,
      city: pending.city || null,
      province: pending.province || null,
      contact_phone: pending.contactPhone || null,
      is_default: true,
    });
    catalog.addresses.push({
      id: address.id,
      shop_id: address.shop_id,
      address_label: address.address_label,
      is_default: address.is_default,
      is_active: address.is_active,
    });
  }
}

export async function dryRunKASalesRecordImport(
  ctx: UserContext,
  rows: KASalesRecordLineInput[],
  options: KASalesRecordImportOptions = {}
) {
  assertRole(ctx);
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
  if (rows.length > 20000) throw new HttpError(400, 'Too many rows (max 20,000)');
  const createMissing = options.createMissing !== false;

  const catalog = await loadCatalog(ctx.companyId);
  const grouped = groupRows(rows);
  const purchase_orders: KASalesRecordPoPreview[] = [];
  const pendingResolved: ResolvedLine[] = [];
  let blocking = 0;

  for (const [ref, lines] of grouped) {
    const issues: string[] = [];
    const displayRef = String(lines[0]?.external_po_ref || ref);
    const resolved = lines.map((line) => resolveLine(line, catalog, { createMissing }));
    pendingResolved.push(...resolved);
    resolved.forEach((r) => issues.push(...r.errors.map((e) => `row ${r.excel_row}: ${e}`)));
    const pay = summarizePayment(lines);
    if (displayRef) {
      const dupes = await alreadyImported(ctx.companyId, displayRef);
      if (dupes.length) issues.push(`already in OMS: ${dupes.map((d) => d.po_number).join(', ')}`);
    }
    if (issues.length) blocking += 1;
    purchase_orders.push(previewFromGroup(ref, lines, resolved, issues, pay));
  }

  return {
    dry_run: true as const,
    inserted: 0,
    po_count: purchase_orders.length,
    line_count: rows.length,
    ready_to_import: blocking === 0,
    blocking_pos: blocking,
    create_missing: createMissing,
    pending_master: collectPendingMaster(pendingResolved),
    purchase_orders,
  };
}

function spreadPay(items: { id: string; total_price: number }[], cash: number) {
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
  lines: KASalesRecordLineInput[]
): Promise<KASalesRecordImportPoResult> {
  const displayRef = String(lines[0]?.external_po_ref || ref);
  const previewIssues: string[] = [];
  const resolved = lines.map((line) => resolveLine(line, catalog, { createMissing: false }));
  resolved.forEach((r) => previewIssues.push(...r.errors.map((e) => `row ${r.excel_row}: ${e}`)));
  const first = resolved.find((r) => r.client && r.shop && r.address && r.kam && r.variant && r.location);
  if (!first) previewIssues.push('could not resolve header lookups');
  if (displayRef) {
    const dupes = await alreadyImported(ctx.companyId, displayRef);
    if (dupes.length) previewIssues.push(`already imported: ${dupes.map((d) => d.po_number).join(', ')}`);
  }
  if (previewIssues.length || !first) {
    return { ok: false, external_po_ref: displayRef, issues: previewIssues };
  }

  const pay = summarizePayment(lines);
  const orderDate = String(lines[0].order_date || '').slice(0, 10);
  const deliveryDate = String(lines[0].expected_delivery_date || orderDate).slice(0, 10);
  const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
  const discount = money(lines[0]?.discount || 0);
  const total = money(subtotal - discount);
  const status = paymentStatus(total, pay.paid, pay.excelStatus);
  const commissioned = status === 'paid' && pay.comm;
  const rfpfNumber = String(lines[0].rfpf_number || displayRef).trim() || null;
  const extraNote = String(lines[0].notes || '').trim();
  const notes = [extraNote, `SalesRecord: ${displayRef}`, 'Imported client sales record (pre-system)']
    .filter(Boolean)
    .join(' | ');

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
        expected_delivery_date: deliveryDate || orderDate,
        notes,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        discount,
        total_amount: total,
        po_order_kind: pay.kind,
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

    if (pay.paid > 0.05) {
      if (!ctx.accessToken) throw new HttpError(401, 'Missing access token');
      const userSb = getSupabaseUser(ctx.accessToken);
      const payMethod = pay.method === 'BANK_TRANSFER' || pay.method === 'GCASH' || pay.method === 'CHEQUE' || pay.method === 'CASH'
        ? pay.method
        : 'CASH';
      const { data: payment, error: payErr } = await userSb
        .from('purchase_order_key_account_payments')
        .insert({
          purchase_order_id: poId,
          company_id: ctx.companyId,
          amount: pay.paid,
          settlement_discount: 0,
          payment_method: payMethod,
          bank_type: payMethod === 'BANK_TRANSFER' ? pay.bank : null,
          proof_storage_path: null,
          created_at: paymentCreatedAt(pay.paymentDate || orderDate),
        })
        .select('id')
        .single();
      if (payErr) throw payErr;
      const splits = spreadPay((insertedItems || []) as { id: string; total_price: number }[], pay.paid);
      if (payment?.id && splits.length) {
        await insertPaymentAllocations(ctx.companyId, payment.id, splits, { includeDiscount: true });
      }
    }

    const update: Record<string, unknown> = {
      status: 'fulfilled',
      workflow_status: 'delivered',
      key_account_payment_status: status,
    };
    if (commissioned) {
      update.commissioned_at = paymentCreatedAt(pay.paymentDate || orderDate);
      update.commissioned_by = ctx.userId;
    }
    const { error: updErr } = await sb.from('purchase_orders').update(update).eq('id', poId);
    if (updErr) throw updErr;

    await sb.rpc('log_purchase_order_event', {
      p_purchase_order_id: poId,
      p_event_type: 'created',
      p_note: `Imported client sales record. SalesRecord: ${displayRef}. ${status}, delivered${commissioned ? ', commissioned' : ''}. No warehouse stock cut.`,
      p_created_by: ctx.userId,
    });

    return {
      ok: true,
      external_po_ref: displayRef,
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
      external_po_ref: displayRef,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function importKASalesRecordPos(
  ctx: UserContext,
  rows: KASalesRecordLineInput[],
  options: KASalesRecordImportOptions = {}
) {
  assertRole(ctx);
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
  const grouped = groupRows(rows);
  if (grouped.size > SALES_RECORD_IMPORT_PO_CHUNK) {
    throw new HttpError(
      400,
      `Import at most ${SALES_RECORD_IMPORT_PO_CHUNK} purchase orders per request. The page sends batches automatically.`
    );
  }
  const catalog = await loadCatalog(ctx.companyId);
  if (options.createMissing !== false) {
    await ensureMissingMaster(ctx, catalog, rows);
  }
  const results: KASalesRecordImportPoResult[] = [];
  for (const [ref, lines] of grouped) {
    results.push(await importOne(ctx, catalog, ref, lines));
  }
  return {
    dry_run: false as const,
    imported: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
