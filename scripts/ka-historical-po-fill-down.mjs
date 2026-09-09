/** Sparse Excel fill-down. Keep in sync with src/lib/kaHistoricalPoFillDown.ts */

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
];

function hasVal(value) {
  if (value == null) return false;
  if (typeof value === 'number') return true;
  return String(value).trim() !== '';
}

export function isHistoricalProductLine(row) {
  const qty = Number(row.quantity);
  return hasVal(row.variant_name) || hasVal(row.sku) || (Number.isFinite(qty) && qty > 0);
}

function isBlankSpreadsheetRow(row) {
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

export function fillDownHistoricalPoRows(rows) {
  const carry = {};
  const out = [];

  for (const row of rows) {
    if (isBlankSpreadsheetRow(row)) {
      for (const key of Object.keys(carry)) delete carry[key];
      continue;
    }

    const merged = { ...row };
    const newPoRef = hasVal(row.external_po_ref);
    if (newPoRef) {
      const nextRef = String(row.external_po_ref).trim();
      const prevRef = carry.external_po_ref != null ? String(carry.external_po_ref).trim() : '';
      if (nextRef !== prevRef) delete carry.brand_name;
    }

    for (const field of KA_HISTORICAL_PO_CARRY_FIELDS) {
      if (hasVal(merged[field])) carry[field] = merged[field];
      else if (carry[field] != null) merged[field] = carry[field];
    }

    if (hasVal(merged.brand_name)) carry.brand_name = merged.brand_name;
    else if (carry.brand_name != null) merged.brand_name = String(carry.brand_name);

    if (isHistoricalProductLine(merged)) out.push(merged);
  }

  return out;
}
