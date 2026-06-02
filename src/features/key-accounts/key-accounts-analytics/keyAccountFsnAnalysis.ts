import { format, subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { Brand, Variant } from '@/features/inventory/InventoryContext';
import {
  buildFsnVariantRows,
  type FsnMovementAggregate,
  type FsnPeriodDays,
  type FsnVariantRow,
} from '@/features/inventory/warehouseFsnAnalysis';
import { isDeliveredKeyAccountOrder } from './keyAccountAnalyticsShared';

export type KeyAccountFsnOrder = {
  id: string;
  order_date: string;
  status: string | null;
  workflow_status: string | null;
  warehouse_location_id?: string | null;
  fulfillment_type?: string | null;
};

export type KeyAccountFsnItem = {
  purchase_order_id: string;
  variant_id: string;
  warehouse_location_id?: string | null;
  quantity: number | null;
};

export type LinkedWarehouseLocation = {
  id: string;
  name: string;
  is_main: boolean;
};

export function resolveItemWarehouseLocationId(
  item: KeyAccountFsnItem,
  order: KeyAccountFsnOrder
): string | null {
  return item.warehouse_location_id ?? order.warehouse_location_id ?? null;
}

export function computeKeyAccountFsnFromDelivered({
  orders,
  items,
  catalogBrands,
  warehouseLocationId,
  periodDays,
}: {
  orders: KeyAccountFsnOrder[];
  items: KeyAccountFsnItem[];
  catalogBrands: Brand[];
  warehouseLocationId: string;
  periodDays: FsnPeriodDays;
}): FsnVariantRow[] {
  const sinceStr = format(subDays(new Date(), periodDays), 'yyyy-MM-dd');

  const deliveredOrderById = new Map<string, KeyAccountFsnOrder>();
  for (const order of orders) {
    if (!isDeliveredKeyAccountOrder(order)) continue;
    if (order.order_date < sinceStr) continue;
    if (order.fulfillment_type === 'supplier') continue;
    deliveredOrderById.set(order.id, order);
  }

  const movementByVariant = new Map<string, FsnMovementAggregate>();

  for (const item of items) {
    const order = deliveredOrderById.get(item.purchase_order_id);
    if (!order) continue;

    const locId = resolveItemWarehouseLocationId(item, order);
    if (locId !== warehouseLocationId) continue;

    const variantId = item.variant_id;
    if (!variantId) continue;

    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;

    const existing = movementByVariant.get(variantId) ?? { unitsMoved: 0, fulfillEvents: 0 };
    existing.unitsMoved += qty;
    existing.fulfillEvents += 1;
    movementByVariant.set(variantId, existing);
  }

  return buildFsnVariantRows(catalogBrands, movementByVariant);
}

export async function fetchLinkedWarehouseLocations(): Promise<{
  hubCompanyId: string | null;
  locations: LinkedWarehouseLocation[];
}> {
  const { data: hubCompanyId, error: hubErr } = await supabase.rpc('get_linked_warehouse_company_id', {});
  if (hubErr) throw hubErr;
  const hubId = (hubCompanyId as string | null) ?? null;
  if (!hubId) return { hubCompanyId: null, locations: [] };

  const { data: locations, error: locErr } = await supabase.rpc('get_linked_warehouse_locations', {});
  if (locErr) throw locErr;

  const rows = ((locations as { id: string; name: string; is_main: boolean }[]) || []).map((loc) => ({
    id: loc.id,
    name: loc.name,
    is_main: !!loc.is_main,
  }));

  return { hubCompanyId: hubId, locations: rows };
}

/** Matches Key Account create PO: main = available (stock − allocated), sub = location stock. */
async function fetchStockByVariantForLocation(
  hubCompanyId: string,
  locationId: string,
  isMain: boolean,
  variantIds: string[]
): Promise<Map<string, number>> {
  const stockByVariant = new Map<string, number>();
  if (variantIds.length === 0) return stockByVariant;

  if (isMain) {
    const { data, error } = await supabase
      .from('main_inventory')
      .select('variant_id, stock, allocated_stock')
      .eq('company_id', hubCompanyId)
      .in('variant_id', variantIds);
    if (error) throw error;
    for (const row of data ?? []) {
      const stock = Number(row.stock) || 0;
      const allocated = Number(row.allocated_stock) || 0;
      stockByVariant.set(row.variant_id, Math.max(0, stock - allocated));
    }
    return stockByVariant;
  }

  const { data, error } = await supabase
    .from('warehouse_location_inventory')
    .select('variant_id, stock')
    .eq('company_id', hubCompanyId)
    .eq('location_id', locationId)
    .in('variant_id', variantIds);
  if (error) throw error;
  for (const row of data ?? []) {
    stockByVariant.set(row.variant_id, Number(row.stock) || 0);
  }
  return stockByVariant;
}

function mapBrandsFromCatalogData(
  brandsData: unknown[],
  stockByVariant: Map<string, number>
): Brand[] {
  return (brandsData || [])
    .map((brand: any) => {
      const allVariants: Variant[] = (brand.variants || [])
        .filter((v: any) => v.is_active !== false)
        .sort(
          (a: any, b: any) =>
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )
        .map((v: any) => {
          const stock = stockByVariant.get(v.id) ?? 0;
          return {
            id: v.id,
            name: v.name,
            variantType: v.variant_type,
            stock,
            allocatedStock: 0,
            price: 0,
            status: stock === 0 ? ('out-of-stock' as const) : ('in-stock' as const),
          } satisfies Variant;
        });

      const variantsByType = new Map<string, Variant[]>();
      for (const variant of allVariants) {
        if (!variantsByType.has(variant.variantType)) variantsByType.set(variant.variantType, []);
        variantsByType.get(variant.variantType)!.push(variant);
      }

      return {
        id: brand.id,
        name: brand.name,
        flavors: allVariants.filter((v) => v.variantType === 'flavor'),
        batteries: allVariants.filter((v) => v.variantType === 'battery'),
        posms: allVariants.filter((v) => v.variantType === 'POSM' || v.variantType === 'posm'),
        variantsByType,
        allVariants,
      } satisfies Brand;
    })
    .filter((b) => b.allVariants.length > 0);
}

export async function fetchHubCatalogBrandsWithStock(
  hubCompanyId: string,
  locationId: string,
  isMain: boolean
): Promise<Brand[]> {
  const { data: brandsData, error } = await supabase
    .from('brands')
    .select(
      `
      id,
      name,
      is_active,
      variants (
        id,
        name,
        variant_type,
        created_at,
        is_active
      )
    `
    )
    .eq('company_id', hubCompanyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');

  if (error) throw error;

  const variantIds = (brandsData || []).flatMap((b: any) =>
    (b.variants || []).filter((v: any) => v.is_active !== false).map((v: any) => v.id as string)
  );

  const stockByVariant = await fetchStockByVariantForLocation(
    hubCompanyId,
    locationId,
    isMain,
    variantIds
  );

  return mapBrandsFromCatalogData(brandsData || [], stockByVariant);
}
