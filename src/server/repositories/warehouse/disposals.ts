import { HttpError } from '../../http/errors';
import type { WarehouseContext } from '../../auth/requireWarehouseContext';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import { listWarehouseLocations } from './locations';

export type DisposalSaReceiptLine = {
  qty_good: number;
  qty_damaged: number;
  warehouse_variant: {
    name: string;
    brand: { name: string } | null;
  } | null;
};

export type DisposalSaReceipt = {
  id: string;
  received_at: string;
  notes: string | null;
  received_by_user: { full_name: string } | null;
  lines: DisposalSaReceiptLine[];
};

export type DisposalSaReturn = {
  id: string;
  request_number: string;
  return_type: string | null;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  source_agent_id: string | null;
  client_company: { company_name: string } | null;
  created_by_user: { full_name: string } | null;
  source_agent: { full_name: string } | null;
  approved_by_user: { full_name: string } | null;
  cancelled_by_user: { full_name: string } | null;
  destination_location: { name: string; is_main: boolean } | null;
  receipts: DisposalSaReceipt[];
};

export type DisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  sa_stock_return_request_id: string | null;
  warehouse_location: { name: string; is_main: boolean } | null;
  variant: {
    name: string;
    variant_type: string;
    brand: { name: string } | null;
  } | null;
  disposed_by_user: { full_name: string } | null;
  fulfillment_po: { po_number: string } | null;
  rebate: { rebate_number: string } | null;
  sa_return: DisposalSaReturn | null;
  stock_return: { request_number: string } | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type RawDisposalSaReturn = {
  id: string;
  request_number: string;
  return_type: string | null;
  status: string | null;
  created_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  source_agent_id: string | null;
  client_company: { company_name: string } | { company_name: string }[] | null;
  created_by_user: { full_name: string } | { full_name: string }[] | null;
  source_agent: { full_name: string } | { full_name: string }[] | null;
  approved_by_user: { full_name: string } | { full_name: string }[] | null;
  cancelled_by_user: { full_name: string } | { full_name: string }[] | null;
  destination_location:
    | { name: string; is_main: boolean }
    | { name: string; is_main: boolean }[]
    | null;
  receipts:
    | Array<{
        id: string;
        received_at: string;
        notes: string | null;
        received_by_user: { full_name: string } | { full_name: string }[] | null;
        lines:
          | Array<{
              qty_good: number;
              qty_damaged: number;
              warehouse_variant:
                | {
                    name: string;
                    brand: { name: string } | { name: string }[] | null;
                  }
                | {
                    name: string;
                    brand: { name: string } | { name: string }[] | null;
                  }[]
                | null;
            }>
          | null;
      }>
    | null;
};

type RawDisposalRow = {
  id: string;
  quantity: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  standard_account_stock_return_request_id: string | null;
  warehouse_location:
    | { name: string; is_main: boolean }
    | { name: string; is_main: boolean }[]
    | null;
  variant:
    | {
        name: string;
        variant_type: string;
        brand: { name: string } | { name: string }[] | null;
      }
    | {
        name: string;
        variant_type: string;
        brand: { name: string } | { name: string }[] | null;
      }[]
    | null;
  disposed_by_user: { full_name: string } | { full_name: string }[] | null;
  fulfillment_po: { po_number: string } | { po_number: string }[] | null;
  rebate: { rebate_number: string } | { rebate_number: string }[] | null;
  sa_return: RawDisposalSaReturn | RawDisposalSaReturn[] | null;
  stock_return: { request_number: string } | { request_number: string }[] | null;
};

function mapSaReturn(raw: RawDisposalSaReturn | null): DisposalSaReturn | null {
  if (!raw) return null;
  return {
    id: raw.id,
    request_number: raw.request_number,
    return_type: raw.return_type,
    status: raw.status,
    created_at: raw.created_at,
    approved_at: raw.approved_at,
    cancelled_at: raw.cancelled_at,
    source_agent_id: raw.source_agent_id,
    client_company: firstRelation(raw.client_company),
    created_by_user: firstRelation(raw.created_by_user),
    source_agent: firstRelation(raw.source_agent),
    approved_by_user: firstRelation(raw.approved_by_user),
    cancelled_by_user: firstRelation(raw.cancelled_by_user),
    destination_location: firstRelation(raw.destination_location),
    receipts: (raw.receipts ?? []).map((receipt) => ({
      id: receipt.id,
      received_at: receipt.received_at,
      notes: receipt.notes,
      received_by_user: firstRelation(receipt.received_by_user),
      lines: (receipt.lines ?? []).map((line) => {
        const variant = firstRelation(line.warehouse_variant);
        return {
          qty_good: line.qty_good,
          qty_damaged: line.qty_damaged,
          warehouse_variant: variant
            ? {
                name: variant.name,
                brand: firstRelation(variant.brand),
              }
            : null,
        };
      }),
    })),
  };
}

function mapDisposalRow(raw: RawDisposalRow): DisposalRow {
  const variant = firstRelation(raw.variant);
  const brand = variant ? firstRelation(variant.brand) : null;
  const saReturn = mapSaReturn(firstRelation(raw.sa_return));

  return {
    id: raw.id,
    quantity: raw.quantity,
    source_type: raw.source_type,
    notes: raw.notes,
    created_at: raw.created_at,
    sa_stock_return_request_id:
      raw.standard_account_stock_return_request_id ?? saReturn?.id ?? null,
    warehouse_location: firstRelation(raw.warehouse_location),
    variant: variant
      ? {
          name: variant.name,
          variant_type: variant.variant_type,
          brand,
        }
      : null,
    disposed_by_user: firstRelation(raw.disposed_by_user),
    fulfillment_po: firstRelation(raw.fulfillment_po),
    rebate: firstRelation(raw.rebate),
    sa_return: saReturn,
    stock_return: firstRelation(raw.stock_return),
  };
}

export async function listWarehouseDisposalLocations(ctx: WarehouseContext) {
  if (!ctx.isMain) throw new HttpError(403, 'Only main warehouse can list all locations');
  return listWarehouseLocations(ctx);
}

export async function listWarehouseDisposals(
  ctx: WarehouseContext,
  locationId?: string | null
): Promise<{ disposals: DisposalRow[] }> {
  const sb = getSupabaseAdmin();
  let query = sb
    .from('warehouse_inventory_disposals')
    .select(
      `
      id,
      quantity,
      source_type,
      notes,
      created_at,
      standard_account_stock_return_request_id,
      warehouse_location:warehouse_locations!warehouse_inventory_disposals_warehouse_location_id_fkey (
        name,
        is_main
      ),
      variant:variants!warehouse_inventory_disposals_variant_id_fkey (
        name,
        variant_type,
        brand:brands ( name )
      ),
      disposed_by_user:profiles!warehouse_inventory_disposals_disposed_by_fkey ( full_name ),
      fulfillment_po:purchase_orders!warehouse_inventory_disposals_fulfillment_po_id_fkey ( po_number ),
      rebate:key_account_po_rebates!warehouse_inventory_disposals_rebate_id_fkey ( rebate_number ),
      sa_return:standard_account_stock_return_requests!warehouse_inventory_disposals_sa_stock_return_request_id_fkey (
        id,
        request_number,
        return_type
      ),
      stock_return:warehouse_stock_return_requests!warehouse_inventory_disposals_stock_return_request_id_fkey (
        request_number
      )
    `
    )
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false });

  if (!ctx.isMain && ctx.locationId) {
    query = query.eq('warehouse_location_id', ctx.locationId);
  } else if (locationId && locationId !== 'all') {
    query = query.eq('warehouse_location_id', locationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return {
    disposals: (data ?? []).map((row) => mapDisposalRow(row as RawDisposalRow)),
  };
}

export async function listWarehouseDisposalSaReturnDetails(
  ctx: WarehouseContext,
  requestIds: string[]
): Promise<{ returns: DisposalSaReturn[] }> {
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (ids.length === 0) return { returns: [] };

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('standard_account_stock_return_requests')
    .select(
      `
      id,
      request_number,
      return_type,
      status,
      created_at,
      approved_at,
      cancelled_at,
      source_agent_id,
      client_company:companies!client_company_id ( company_name ),
      created_by_user:profiles!created_by ( full_name ),
      source_agent:profiles!source_agent_id ( full_name ),
      approved_by_user:profiles!approved_by ( full_name ),
      cancelled_by_user:profiles!cancelled_by ( full_name ),
      destination_location:warehouse_locations!destination_location_id (
        name,
        is_main
      ),
      receipts:standard_account_stock_return_receipts (
        id,
        received_at,
        notes,
        received_by_user:profiles!received_by ( full_name ),
        lines:standard_account_stock_return_receipt_lines (
          qty_good,
          qty_damaged,
          warehouse_variant:variants!warehouse_variant_id (
            name,
            brand:brands ( name )
          )
        )
      )
    `
    )
    .eq('warehouse_company_id', ctx.companyId)
    .in('id', ids);
  if (error) throw error;

  return {
    returns: (data ?? [])
      .map((row) => mapSaReturn(row as RawDisposalSaReturn))
      .filter((row): row is DisposalSaReturn => !!row),
  };
}
