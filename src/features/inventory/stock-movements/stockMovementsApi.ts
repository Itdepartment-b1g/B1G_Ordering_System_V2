import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import {
  buildStockMovementDisplayNotes,
  collectUuidsFromText,
  formatLocationLabel,
  formatStockMovementNotes,
  formatStockMovementProductName,
  friendlyTechnicalLocationLabel,
  getLocationPartyTag,
  getSignedQuantity,
  getStockMovementCategory,
  getStockMovementDirection,
  getStockMovementRoleTag,
  getStockMovementTypeDescription,
  getStockMovementTypeLabel,
  locationTouchesAgentId,
  locationTouchesWarehouseId,
  parseInventoryLocation,
  type StockMovementCategory,
  type StockMovementDirection,
} from './stockMovementTypes';

/** Bump when display mapping changes so React Query does not keep stale labels. */
export const STOCK_MOVEMENTS_QUERY_KEY = 'stock-movements-v14';

type RawVariant = {
  id: string;
  name: string;
  variant_type: string | null;
  brand: { id: string; name: string } | { id: string; name: string }[] | null;
};

type RawTx = {
  id: string;
  company_id: string;
  transaction_type: string;
  quantity: number;
  from_location: string | null;
  to_location: string | null;
  from_qty_before: number | null;
  from_qty_after: number | null;
  to_qty_before: number | null;
  to_qty_after: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  variant_id: string;
  performed_by: string;
  variant: RawVariant | RawVariant[] | null;
  performed_by_user:
    | { full_name: string; role: string | null }
    | { full_name: string; role: string | null }[]
    | null;
};

export type StockMovementRow = {
  id: string;
  createdAt: string;
  transactionType: string;
  typeLabel: string;
  /** Short explanation under the type title. */
  typeDescription: string;
  category: StockMovementCategory;
  direction: StockMovementDirection;
  quantity: number;
  signedQuantity: number;
  fromQtyBefore: number | null;
  fromQtyAfter: number | null;
  toQtyBefore: number | null;
  toQtyAfter: number | null;
  fromLocationRaw: string | null;
  toLocationRaw: string | null;
  fromLabel: string;
  toLabel: string;
  /** Short party tag: Client, TL, Mobile Sales, Super Admin, … */
  fromPartyTag: string | null;
  toPartyTag: string | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  brandId: string | null;
  brandName: string;
  variantId: string;
  variantName: string;
  /** Single-line "Brand Variant" for table display. */
  productName: string;
  variantType: string | null;
  performedBy: string;
  performedByName: string;
  performedByRoleTag: string | null;
};

export type StockMovementLocationOption = {
  id: string;
  name: string;
  is_main: boolean;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function collectAgentIds(rows: RawTx[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const raw of [row.from_location, row.to_location]) {
      const parsed = parseInventoryLocation(raw);
      if (parsed?.kind === 'agent' && parsed.id) ids.add(parsed.id);
    }
  }
  return Array.from(ids);
}

type ProfileLookup = {
  nameById: Map<string, string>;
  roleById: Map<string, string>;
};

async function fetchProfiles(ids: string[]): Promise<ProfileLookup> {
  const nameById = new Map<string, string>();
  const roleById = new Map<string, string>();
  if (ids.length === 0) return { nameById, roleById };

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      nameById.set(row.id as string, (row.full_name as string) || 'Unknown');
      if (row.role) roleById.set(row.id as string, String(row.role));
    }
  }
  return { nameById, roleById };
}

function collectProfileIdsForMovements(rows: RawTx[]): string[] {
  const ids = new Set<string>(collectAgentIds(rows));
  for (const row of rows) {
    if (row.performed_by) ids.add(row.performed_by);
    for (const raw of [row.from_location, row.to_location]) {
      const parsed = parseInventoryLocation(raw);
      if (parsed?.kind === 'return_hold' && parsed.id) ids.add(parsed.id);
    }
    for (const uuid of collectUuidsFromText(row.notes)) {
      ids.add(uuid);
    }
  }
  return Array.from(ids);
}

function locationIsClientParty(raw: string | null | undefined): boolean {
  return raw === 'client_exchange' || raw === 'client_sale';
}

function collectClientOrderReturnIds(rows: RawTx[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.reference_type === 'client_order_return' && row.reference_id) {
      ids.add(row.reference_id);
    }
  }
  return Array.from(ids);
}

type ClientReturnLookup = {
  clientName: string;
  returnNumber: string | null;
  orderNumber: string | null;
};

function collectClientOrderIds(rows: RawTx[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (
      (locationIsClientParty(row.from_location) || locationIsClientParty(row.to_location)) &&
      row.reference_type === 'client_order' &&
      row.reference_id
    ) {
      ids.add(row.reference_id);
    }
  }
  return Array.from(ids);
}

async function fetchClientReturnsById(ids: string[]): Promise<Map<string, ClientReturnLookup>> {
  const map = new Map<string, ClientReturnLookup>();
  if (ids.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('client_order_returns')
      .select('id, client_name, return_number, order_number')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const name = String((row as { client_name?: string | null }).client_name || '').trim();
      const returnNumber = String(
        (row as { return_number?: string | null }).return_number || ''
      ).trim();
      const orderNumber = String(
        (row as { order_number?: string | null }).order_number || ''
      ).trim();
      map.set(row.id as string, {
        clientName: name || 'Client',
        returnNumber: returnNumber || null,
        orderNumber: orderNumber || null,
      });
    }
  }
  return map;
}

type ClientOrderLookup = {
  clientName: string;
  orderNumber: string | null;
};

function collectClientOrderReferenceIds(rows: RawTx[]): string[] {
  const ids = new Set<string>(collectClientOrderIds(rows));
  for (const row of rows) {
    if (row.reference_type === 'client_order' && row.reference_id) {
      ids.add(row.reference_id);
    }
  }
  return Array.from(ids);
}

async function fetchClientOrdersById(ids: string[]): Promise<Map<string, ClientOrderLookup>> {
  const map = new Map<string, ClientOrderLookup>();
  if (ids.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('client_orders')
      .select('id, order_number, client:clients!client_orders_client_id_fkey ( name )')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const client = firstRelation(
        (row as { client?: { name: string } | { name: string }[] | null }).client
      );
      const name = String(client?.name || '').trim();
      const orderNumber = String(
        (row as { order_number?: string | null }).order_number || ''
      ).trim();
      map.set(row.id as string, {
        clientName: name || 'Client',
        orderNumber: orderNumber || null,
      });
    }
  }
  return map;
}

function collectTlStockRequestIds(rows: RawTx[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.reference_type === 'tl_stock_request' && row.reference_id) {
      ids.add(row.reference_id);
    }
  }
  return Array.from(ids);
}

async function fetchTlRequestNumbersById(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('tl_stock_requests')
      .select('id, request_number')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const requestNumber = String(
        (row as { request_number?: string | null }).request_number || ''
      ).trim();
      if (requestNumber) map.set(row.id as string, requestNumber);
    }
  }
  return map;
}

function collectStandardAccountReturnIds(rows: RawTx[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.reference_type === 'standard_account_stock_return' && row.reference_id) {
      ids.add(row.reference_id);
    }
  }
  return Array.from(ids);
}

async function fetchStandardAccountReturnNumbersById(
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('standard_account_stock_return_requests')
      .select('id, request_number')
      .in('id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const requestNumber = String(
        (row as { request_number?: string | null }).request_number || ''
      ).trim();
      if (requestNumber) map.set(row.id as string, requestNumber);
    }
  }
  return map;
}

export async function fetchWarehouseLocationsForMovements(
  companyId: string
): Promise<StockMovementLocationOption[]> {
  const { data, error } = await supabase
    .from('warehouse_locations')
    .select('id, name, is_main')
    .eq('company_id', companyId)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) throw error;
  return (data ?? []) as StockMovementLocationOption[];
}

export async function fetchStockMovements(params: {
  companyId: string;
  /** When set, only rows that touch this warehouse location key. */
  scopeWarehouseLocationId?: string | null;
  /** When set, only rows that touch this agent inventory (`agent_inventory:<id>`). */
  scopeAgentId?: string | null;
}): Promise<StockMovementRow[]> {
  const { companyId, scopeWarehouseLocationId, scopeAgentId } = params;

  const locations = await fetchWarehouseLocationsForMovements(companyId);
  const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
  const mainLocationId = locations.find((l) => l.is_main)?.id ?? null;

  const rawRows = await fetchAllPaginated<RawTx>(async (from, to) => {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select(
        `
        id,
        company_id,
        transaction_type,
        quantity,
        from_location,
        to_location,
        from_qty_before,
        from_qty_after,
        to_qty_before,
        to_qty_after,
        reference_type,
        reference_id,
        notes,
        created_at,
        variant_id,
        performed_by,
        variant:variants!inventory_transactions_variant_id_fkey (
          id,
          name,
          variant_type,
          brand:brands!variants_brand_id_fkey ( id, name )
        ),
        performed_by_user:profiles!inventory_transactions_performed_by_fkey ( full_name, role )
      `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    return { data: (data as RawTx[] | null) ?? null, error };
  });

  let scoped = rawRows;
  if (scopeWarehouseLocationId) {
    scoped = scoped.filter((row) =>
      locationTouchesWarehouseId(row.from_location, row.to_location, scopeWarehouseLocationId)
    );
  }
  if (scopeAgentId) {
    scoped = scoped.filter((row) =>
      locationTouchesAgentId(row.from_location, row.to_location, scopeAgentId)
    );
  }

  const [profiles, clientReturnById, clientOrderById, tlRequestNumberById, saReturnNumberById] =
    await Promise.all([
      fetchProfiles(collectProfileIdsForMovements(scoped)),
      fetchClientReturnsById(collectClientOrderReturnIds(scoped)),
      fetchClientOrdersById(collectClientOrderReferenceIds(scoped)),
      fetchTlRequestNumbersById(collectTlStockRequestIds(scoped)),
      fetchStandardAccountReturnNumbersById(collectStandardAccountReturnIds(scoped)),
    ]);

  const labelOpts = {
    locationNameById,
    profileNameById: profiles.nameById,
    mainLocationId,
  };
  const partyTagOpts = {
    profileRoleById: profiles.roleById,
    mainLocationId,
  };

  return scoped.map((row) => {
    const variant = firstRelation(row.variant);
    const brand = variant ? firstRelation(variant.brand) : null;
    const performer = firstRelation(row.performed_by_user);
    const fromParsed = parseInventoryLocation(row.from_location);
    const toParsed = parseInventoryLocation(row.to_location);
    const category = getStockMovementCategory(row.transaction_type);
    const direction = getStockMovementDirection(row.transaction_type, row.notes);
    const brandName = brand?.name ?? '—';
    const variantName = variant?.name ?? '—';
    const clientReturn =
      row.reference_type === 'client_order_return' && row.reference_id
        ? clientReturnById.get(row.reference_id) ?? null
        : null;
    const clientOrder =
      row.reference_type === 'client_order' && row.reference_id
        ? clientOrderById.get(row.reference_id) ?? null
        : null;
    const tlRequestNumber =
      row.reference_type === 'tl_stock_request' && row.reference_id
        ? tlRequestNumberById.get(row.reference_id) ?? null
        : null;
    const standardReturnNumber =
      row.reference_type === 'standard_account_stock_return' && row.reference_id
        ? saReturnNumberById.get(row.reference_id) ?? null
        : null;
    const clientName = clientReturn?.clientName ?? clientOrder?.clientName ?? null;
    const locationOpts = { ...labelOpts, clientName };
    const performerRole =
      performer?.role ?? profiles.roleById.get(row.performed_by) ?? null;
    const resolvedNotes = formatStockMovementNotes(row.notes, profiles.nameById);
    const fromLabel = friendlyTechnicalLocationLabel(
      formatLocationLabel(fromParsed, locationOpts)
    );
    const toLabel = friendlyTechnicalLocationLabel(
      formatLocationLabel(toParsed, locationOpts)
    );
    const displayNotes = buildStockMovementDisplayNotes({
      transactionType: row.transaction_type,
      quantity: row.quantity,
      fromLabel,
      toLabel,
      fromLocationRaw: row.from_location,
      toLocationRaw: row.to_location,
      referenceType: row.reference_type,
      orderNumber: clientReturn?.orderNumber ?? clientOrder?.orderNumber ?? null,
      returnNumber: clientReturn?.returnNumber ?? null,
      requestNumber: tlRequestNumber,
      standardReturnNumber,
      clientName,
      rawNotes: resolvedNotes,
      createdAt: row.created_at,
    });

    return {
      id: row.id,
      createdAt: row.created_at,
      transactionType: row.transaction_type,
      typeLabel: getStockMovementTypeLabel(row.transaction_type, {
        fromLocation: row.from_location,
        toLocation: row.to_location,
        notes: row.notes,
      }),
      typeDescription: getStockMovementTypeDescription(row.transaction_type, {
        fromLocation: row.from_location,
        toLocation: row.to_location,
        notes: resolvedNotes,
      }),
      category,
      direction,
      quantity: row.quantity,
      signedQuantity: getSignedQuantity(row.transaction_type, row.quantity, row.notes),
      fromQtyBefore: toNullableNumber(row.from_qty_before),
      fromQtyAfter: toNullableNumber(row.from_qty_after),
      toQtyBefore: toNullableNumber(row.to_qty_before),
      toQtyAfter: toNullableNumber(row.to_qty_after),
      fromLocationRaw: row.from_location,
      toLocationRaw: row.to_location,
      fromLabel,
      toLabel,
      fromPartyTag: getLocationPartyTag(fromParsed, partyTagOpts),
      toPartyTag: getLocationPartyTag(toParsed, partyTagOpts),
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      notes: displayNotes,
      brandId: brand?.id ?? null,
      brandName,
      variantId: row.variant_id,
      variantName,
      productName: formatStockMovementProductName(brandName, variantName),
      variantType: variant?.variant_type ?? null,
      performedBy: row.performed_by,
      performedByName: performer?.full_name ?? '—',
      performedByRoleTag: getStockMovementRoleTag(performerRole),
    } satisfies StockMovementRow;
  });
}

export function summarizeStockMovements(rows: StockMovementRow[]) {
  let unitsIn = 0;
  let unitsOut = 0;
  let transferCount = 0;
  let transferUnits = 0;

  for (const row of rows) {
    if (row.direction === 'in') unitsIn += row.quantity;
    else if (row.direction === 'out') unitsOut += row.quantity;
    else if (row.direction === 'transfer') {
      transferCount += 1;
      transferUnits += row.quantity;
    }
  }

  return {
    movementCount: rows.length,
    unitsIn,
    unitsOut,
    netUnits: unitsIn - unitsOut,
    transferCount,
    transferUnits,
  };
}
