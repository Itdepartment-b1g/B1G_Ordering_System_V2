import { format, subDays } from 'date-fns';
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

export function brandsFromFsnCatalog(
  rows: Array<{
    id: string;
    name: string;
    allVariants: Array<{
      id: string;
      name: string;
      variantType: string;
      stock: number;
      allocatedStock: number;
      price: number;
      status: 'in-stock' | 'out-of-stock';
    }>;
  }>
): Brand[] {
  return rows
    .map((brand) => {
      const allVariants: Variant[] = brand.allVariants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        variantType: variant.variantType,
        stock: variant.stock,
        allocatedStock: variant.allocatedStock,
        price: variant.price,
        status: variant.status,
      }));
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

