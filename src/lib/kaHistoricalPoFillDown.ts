/** Header fields copied down until a new value (or a blank row) appears.
 * Keep scripts/ka-historical-po-fill-down.mjs in sync with this file. */
export const KA_HISTORICAL_PO_CARRY_FIELDS = [
  'external_po_ref',
  'order_date',
  'client_name',
  'client_code',
  'shop_name',
  'shop_code',
  'address_label',
  'kam_email',
  'warehouse_location_name',
  'discount',
  'rfpf_number',
] as const;

type CarryField = (typeof KA_HISTORICAL_PO_CARRY_FIELDS)[number] | 'brand_name';

export type KAHistoricalFillDownRow = {
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

function hasVal(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'number') return true;
  return String(value).trim() !== '';
}

export function isHistoricalProductLine(row: KAHistoricalFillDownRow): boolean {
  const qty = Number(row.quantity);
  return hasVal(row.variant_name) || hasVal(row.sku) || (Number.isFinite(qty) && qty > 0);
}

function isBlankSpreadsheetRow(row: KAHistoricalFillDownRow): boolean {
  return (
    !hasVal(row.external_po_ref) &&
    !hasVal(row.order_date) &&
    !hasVal(row.client_name) &&
    !hasVal(row.shop_name) &&
    !hasVal(row.brand_name) &&
    !hasVal(row.variant_name) &&
    !hasVal(row.sku) &&
    !hasVal(row.kam_email) &&
    !hasVal(row.rfpf_number) &&
    row.quantity == null &&
    row.unit_price == null &&
    row.line_total == null
  );
}

/**
 * Sparse Excel: first line of a PO has header fields; later lines may leave them blank.
 * `brand_name` carries until a new brand is written. A new `external_po_ref` starts a PO
 * and does not inherit the previous PO's brand. A fully blank row clears carry.
 */
export function fillDownHistoricalPoRows<T extends KAHistoricalFillDownRow>(rows: T[]): T[] {
  const carry: Partial<Record<CarryField, unknown>> = {};
  const out: T[] = [];

  for (const row of rows) {
    if (isBlankSpreadsheetRow(row)) {
      for (const key of Object.keys(carry)) delete carry[key as CarryField];
      continue;
    }

    const merged = { ...row };
    const newPoRef = hasVal(row.external_po_ref);
    if (newPoRef) {
      const nextRef = String(row.external_po_ref).trim();
      const prevRef = carry.external_po_ref != null ? String(carry.external_po_ref).trim() : '';
      if (nextRef !== prevRef) {
        delete carry.brand_name;
      }
    }

    for (const field of KA_HISTORICAL_PO_CARRY_FIELDS) {
      if (hasVal(merged[field])) carry[field] = merged[field];
      else if (carry[field] != null) (merged as Record<string, unknown>)[field] = carry[field];
    }

    if (hasVal(merged.brand_name)) carry.brand_name = merged.brand_name;
    else if (carry.brand_name != null) merged.brand_name = String(carry.brand_name);

    if (isHistoricalProductLine(merged)) out.push(merged);
  }

  return out;
}
