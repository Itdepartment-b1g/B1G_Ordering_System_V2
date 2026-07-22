import { supabase } from '@/lib/supabase';
import type { PurchaseOrder, PurchaseOrderItem } from '@/features/orders/types';
import {
  generateAndOpenCofPdf,
  type CofFieldOverrides,
} from '@/features/orders/cof/generateCofPdf';
import { isRebateDerivedPurchaseOrder } from '@/features/key-accounts/rebates/keyAccountRebateShared';

type KeyAccountClientEmbed = {
  client_name?: string;
  client_code?: string;
  contact_phone?: string | null;
  tin_number?: string | null;
};

type KeyAccountShopEmbed = {
  shop_name?: string;
  city?: string | null;
  province?: string | null;
  region?: string | null;
};

type KeyAccountAddressEmbed = {
  full_address?: string;
  city?: string | null;
  province?: string | null;
  zip_code?: string | null;
  contact_phone?: string | null;
};

type KeyAccountKamEmbed = {
  full_name?: string | null;
};

type KeyAccountPoItemEmbed = {
  id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  variants?: {
    name?: string;
    variant_type?: string;
    brands?: { name?: string } | { name?: string }[] | null;
  } | null;
};

export type KeyAccountPoForCof = {
  id: string;
  po_number: string;
  company_account_type?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  order_date: string;
  expected_delivery_date?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  status: string;
  notes?: string;
  created_by: string;
  created_at?: string;
  key_account_payment_terms?: string | null;
  key_account_payment_mode?: 'full' | 'split' | null;
  key_account_payment_status?: string | null;
  client?: KeyAccountClientEmbed | KeyAccountClientEmbed[] | null;
  shop?: KeyAccountShopEmbed | KeyAccountShopEmbed[] | null;
  address?: KeyAccountAddressEmbed | KeyAccountAddressEmbed[] | null;
  kam?: KeyAccountKamEmbed | KeyAccountKamEmbed[] | null;
  items?: KeyAccountPoItemEmbed[];
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatTin(tin: string | null | undefined): string {
  const trimmed = (tin || '').trim();
  return trimmed || 'N/A';
}

function formatShopAddress(shop: KeyAccountShopEmbed | null): string {
  if (!shop) return '';
  return [shop.city, shop.province, shop.region].filter(Boolean).join(', ');
}

function formatDeliveryAddress(address: KeyAccountAddressEmbed | null): string {
  if (!address) return '';
  return [address.full_address, address.city, address.province, address.zip_code]
    .filter(Boolean)
    .join(', ');
}

export function mapKeyAccountItemsForCof(items: KeyAccountPoItemEmbed[] = []): PurchaseOrderItem[] {
  return items.map((item) => {
    const variant = item.variants;
    const brand = variant?.brands;
    const brandName = Array.isArray(brand) ? brand[0]?.name : brand?.name;
    return {
      id: item.id,
      variant_id: item.variant_id,
      brand_name: brandName || 'Unknown',
      variant_name: variant?.name || 'Unknown',
      variant_type: variant?.variant_type || 'other',
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      total_price: Number(item.total_price || 0),
    };
  });
}

/** Accepts warehouse-formatted items (brand_name) or nested variant embeds. */
export function normalizeCofItems(
  items?: KeyAccountPoItemEmbed[] | PurchaseOrderItem[]
): PurchaseOrderItem[] {
  if (!items?.length) return [];
  const first = items[0] as PurchaseOrderItem & KeyAccountPoItemEmbed;
  if ('brand_name' in first && first.brand_name) {
    return items as PurchaseOrderItem[];
  }
  return mapKeyAccountItemsForCof(items as KeyAccountPoItemEmbed[]);
}

function needsCofEnrichment(po: KeyAccountPoForCof): boolean {
  return !('key_account_payment_mode' in po);
}

async function fetchKeyAccountPoCofDetails(poId: string): Promise<Partial<KeyAccountPoForCof>> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(
      `
      notes,
      created_at,
      po_order_kind,
      source_rebate_id,
      subtotal,
      tax_rate,
      tax_amount,
      discount,
      total_amount,
      key_account_payment_terms,
      key_account_payment_mode,
      key_account_payment_status,
      client:key_account_clients(client_name, client_code, contact_phone),
      shop:key_account_shops(shop_name, city, province, region),
      address:key_account_delivery_addresses(full_address, city, province, zip_code, contact_phone),
      kam:profiles!purchase_orders_kam_id_fkey(full_name)
    `
    )
    .eq('id', poId)
    .single();
  if (error) throw error;
  return (data ?? {}) as Partial<KeyAccountPoForCof>;
}

/** Map a warehouse / purchase-orders list row into Key Account COF input. */
export function orderToKeyAccountPoForCof(order: {
  id: string;
  po_number: string;
  company_account_type?: string | null;
  po_order_kind?: string | null;
  source_rebate_id?: string | null;
  order_date: string;
  expected_delivery_date?: string | null;
  created_at?: string | null;
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  discount?: number | null;
  total_amount?: number | null;
  status?: string;
  notes?: string | null;
  created_by?: string | null;
  client?: KeyAccountPoForCof['client'];
  shop?: KeyAccountPoForCof['shop'];
  address?: KeyAccountPoForCof['address'];
  kam?: KeyAccountPoForCof['kam'];
  items?: KeyAccountPoItemEmbed[] | PurchaseOrderItem[];
}): KeyAccountPoForCof {
  return {
    id: order.id,
    po_number: order.po_number,
    company_account_type: order.company_account_type || 'Key Accounts',
    po_order_kind: order.po_order_kind,
    source_rebate_id: order.source_rebate_id,
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date || order.order_date,
    created_at: order.created_at || order.order_date,
    subtotal: Number(order.subtotal || 0),
    tax_rate: Number(order.tax_rate || 0),
    tax_amount: Number(order.tax_amount || 0),
    discount: Number(order.discount || 0),
    total_amount: Number(order.total_amount || 0),
    status: order.status || 'pending',
    notes: order.notes || '',
    created_by: order.created_by || '',
    client: order.client,
    shop: order.shop,
    address: order.address,
    kam: order.kam,
    items: order.items as KeyAccountPoItemEmbed[] | undefined,
  };
}

function buildPaymentOverrides(
  po: KeyAccountPoForCof,
  paymentAmounts: number[]
): Pick<CofFieldOverrides, 'downPayment' | 'remainingBalance'> {
  const total = Number(po.total_amount || 0);
  const mode = po.key_account_payment_mode;
  const payStatus = String(po.key_account_payment_status || 'unpaid');
  const paidTotal = paymentAmounts.reduce((sum, amount) => sum + amount, 0);

  if (mode !== 'split') {
    return { downPayment: 0, remainingBalance: 0 };
  }

  const downPayment = paymentAmounts.length > 0 ? paymentAmounts[0] : 0;
  const remaining =
    payStatus === 'paid' ? 0 : Math.max(0, Math.round((total - paidTotal) * 100) / 100);

  return { downPayment, remainingBalance: remaining };
}

export function buildKeyAccountCofOverrides(
  po: KeyAccountPoForCof,
  paymentAmounts: number[] = []
): CofFieldOverrides {
  const client = unwrapRelation(po.client);
  const shop = unwrapRelation(po.shop);
  const address = unwrapRelation(po.address);
  const kam = unwrapRelation(po.kam);

  const contactNumber =
    (client?.contact_phone || '').trim() ||
    (address?.contact_phone || '').trim() ||
    '';

  return {
    clientName: client?.client_name || '',
    tradeName: client?.client_code || '',
    vapeShop: shop?.shop_name || '',
    tinNumber: formatTin(client?.tin_number),
    contactNumber,
    address: formatShopAddress(shop),
    deliveryAddress: formatDeliveryAddress(address),
    salesAccount: kam?.full_name || '',
    paymentTerms: po.key_account_payment_terms || '',
    ...buildPaymentOverrides(po, paymentAmounts),
  };
}

async function fetchPaymentAmounts(poId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('purchase_order_key_account_payments')
    .select('amount')
    .eq('purchase_order_id', poId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => Number(row.amount || 0));
}

function resolveKeyAccountCofFinancials(po: KeyAccountPoForCof): {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
} {
  // Rebate fulfillment/top-up POs store catalog line value in subtotal but only
  // charge the client the amount due (total_amount). COF totals must match amount due.
  if (isRebateDerivedPurchaseOrder(po)) {
    const amountDue = Math.max(0, Number(po.total_amount) || 0);
    return {
      subtotal: amountDue,
      tax_rate: 0,
      tax_amount: 0,
      discount: 0,
      total_amount: amountDue,
    };
  }

  return {
    subtotal: Number(po.subtotal || 0),
    tax_rate: Number(po.tax_rate || 0),
    tax_amount: Number(po.tax_amount || 0),
    discount: Number(po.discount || 0),
    total_amount: Number(po.total_amount || 0),
  };
}

function toPurchaseOrder(po: KeyAccountPoForCof, items: PurchaseOrderItem[]): PurchaseOrder {
  const financials = resolveKeyAccountCofFinancials(po);
  return {
    id: po.id,
    po_number: po.po_number,
    company_account_type: po.company_account_type,
    supplier_id: null,
    supplier: null,
    order_date: po.order_date,
    expected_delivery_date: po.expected_delivery_date || po.order_date,
    subtotal: financials.subtotal,
    tax_rate: financials.tax_rate,
    tax_amount: financials.tax_amount,
    discount: financials.discount,
    total_amount: financials.total_amount,
    status: po.status as PurchaseOrder['status'],
    notes: po.notes || '',
    created_by: po.created_by,
    created_at: po.created_at || po.order_date,
    items,
  };
}

function applyRebateCofItemPricing(
  po: KeyAccountPoForCof,
  items: PurchaseOrderItem[]
): PurchaseOrderItem[] {
  if (!isRebateDerivedPurchaseOrder(po)) return items;
  const amountDue = Math.max(0, Number(po.total_amount) || 0);
  if (amountDue > 0) return items;
  return items.map((item) => ({
    ...item,
    unit_price: 0,
    total_price: 0,
  }));
}

export async function generateAndOpenKeyAccountCofPdf(po: KeyAccountPoForCof) {
  if (po.company_account_type !== 'Key Accounts') {
    throw new Error('COF is only available for Key Account purchase orders');
  }

  let enriched = po;
  if (needsCofEnrichment(po)) {
    const details = await fetchKeyAccountPoCofDetails(po.id);
    enriched = {
      ...po,
      ...details,
      notes: details.notes ?? po.notes,
      created_at: details.created_at ?? po.created_at,
      po_order_kind: details.po_order_kind ?? po.po_order_kind,
      source_rebate_id: details.source_rebate_id ?? po.source_rebate_id,
      subtotal: details.subtotal ?? po.subtotal,
      tax_rate: details.tax_rate ?? po.tax_rate,
      tax_amount: details.tax_amount ?? po.tax_amount,
      discount: details.discount ?? po.discount,
      total_amount: details.total_amount ?? po.total_amount,
      client: details.client ?? po.client,
      shop: details.shop ?? po.shop,
      address: details.address ?? po.address,
      kam: details.kam ?? po.kam,
    };
  }

  let items = normalizeCofItems(enriched.items);
  if (items.length === 0) {
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(
        `
        id,
        variant_id,
        quantity,
        unit_price,
        total_price,
        variants:variant_id (
          name,
          variant_type,
          brands:brand_id ( name )
        )
      `
      )
      .eq('purchase_order_id', enriched.id);
    if (error) throw error;
    items = mapKeyAccountItemsForCof((data as KeyAccountPoItemEmbed[]) ?? []);
  }

  items = applyRebateCofItemPricing(enriched, items);

  const paymentAmounts =
    enriched.key_account_payment_mode ? await fetchPaymentAmounts(enriched.id) : [];
  const overrides = buildKeyAccountCofOverrides(enriched, paymentAmounts);

  await generateAndOpenCofPdf(toPurchaseOrder(enriched, items), overrides);
}
