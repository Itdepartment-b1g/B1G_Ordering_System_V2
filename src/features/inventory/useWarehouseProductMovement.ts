import { useQuery } from '@tanstack/react-query';
import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { isDateInRange } from '@/lib/dateRangePresets';
import { warehouseTransferReservationKey } from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';
import type { Brand } from './InventoryContext';
import {
  accumulateMovement,
  buildWarehouseProductMovementRows,
  createEmptyMovementAggregate,
  type WarehouseProductMovementRow,
} from './warehouseProductMovement';
import {
  isWarehouseVisibleTransferOrder,
  lineItemMatchesWarehouseLocation,
  resolveTransferReleaseTimestamp,
  splitWarehouseTransferLineItem,
  warehouseTransferPoLocationKey,
  type WarehouseTransferOrderRef,
  type WarehouseTransferReservationSnapshot,
} from './warehouseProductMovementShared';

type PoLineRow = {
  purchase_order_id: string;
  variant_id: string;
  quantity: number;
  warehouse_location_id: string | null;
  purchase_orders: (WarehouseTransferOrderRef & { order_date?: string | null }) | (WarehouseTransferOrderRef & { order_date?: string | null })[] | null;
};

type GroupedPoLine = {
  purchaseOrderId: string;
  variantId: string;
  quantity: number;
  warehouseLocationId: string | null;
  order: WarehouseTransferOrderRef & { order_date?: string | null };
};

type ReservationRow = {
  purchase_order_id: string;
  variant_id: string;
  quantity_reserved: number;
  quantity_fulfilled: number;
  updated_at: string;
};

type LocationStatusRow = {
  purchase_order_id: string;
  warehouse_location_id: string;
  status: string;
};

type DeliveryRow = {
  purchase_order_id: string;
  warehouse_location_id: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
};

type RebateReturnLineRow = {
  variant_id: string;
  qty_good: number;
  key_account_po_rebate_return_receipts: { received_at: string } | { received_at: string }[] | null;
};

type DisposalRow = {
  variant_id: string;
  quantity: number;
};

const EXCLUDED_PO_STATUSES = ['rejected', 'cancelled', 'draft'];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isTimestampInRange(timestamp: string | null | undefined, start?: Date, end?: Date): boolean {
  if (!timestamp) return false;
  return isDateInRange(new Date(timestamp), start, end);
}

function trackLatestTimestamp(map: Map<string, string>, key: string, timestamp: string | null | undefined) {
  if (!timestamp) return;
  const existing = map.get(key);
  if (!existing || new Date(timestamp) > new Date(existing)) {
    map.set(key, timestamp);
  }
}

export function useWarehouseProductMovement({
  companyId,
  locationId,
  rangeStart,
  rangeEnd,
  rangeKey,
  brands,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  rangeStart?: Date;
  rangeEnd?: Date;
  /** Stable cache key segment for the active date filter. */
  rangeKey: string;
  brands: Brand[];
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['warehouse-product-movement', companyId, locationId, rangeKey],
    enabled: enabled && !!companyId && !!locationId && brands.length >= 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<WarehouseProductMovementRow[]> => {
      let disposalsQuery = supabase
        .from('warehouse_inventory_disposals')
        .select('variant_id, quantity')
        .eq('company_id', companyId!)
        .eq('warehouse_location_id', locationId!);

      if (rangeStart) {
        disposalsQuery = disposalsQuery.gte('created_at', startOfDay(rangeStart).toISOString());
      }
      if (rangeEnd) {
        disposalsQuery = disposalsQuery.lte('created_at', endOfDay(rangeEnd).toISOString());
      }

      const [lineItemsResult, returnLinesResult, disposalsResult] = await Promise.all([
        supabase
          .from('purchase_order_items')
          .select(
            `
            purchase_order_id,
            variant_id,
            quantity,
            warehouse_location_id,
            purchase_orders!inner (
              status,
              workflow_status,
              company_account_type,
              po_order_kind,
              fulfillment_type,
              warehouse_company_id,
              warehouse_location_id,
              updated_at,
              order_date
            )
          `
          )
          .eq('purchase_orders.fulfillment_type', 'warehouse_transfer')
          .eq('purchase_orders.warehouse_company_id', companyId!),
        supabase
          .from('key_account_po_rebate_return_receipt_lines')
          .select(
            `
            variant_id,
            qty_good,
            key_account_po_rebate_return_receipts!inner (
              received_at
            )
          `
          )
          .eq('warehouse_location_id', locationId!),
        disposalsQuery,
      ]);

      if (lineItemsResult.error) throw lineItemsResult.error;
      if (returnLinesResult.error) throw returnLinesResult.error;
      if (disposalsResult.error) throw disposalsResult.error;

      const scopedLines = ((lineItemsResult.data ?? []) as PoLineRow[]).filter((row) => {
        const order = firstRelation(row.purchase_orders);
        if (!order) return false;
        if (EXCLUDED_PO_STATUSES.includes(String(order.status || ''))) return false;
        if (!isWarehouseVisibleTransferOrder(order)) return false;
        return lineItemMatchesWarehouseLocation(
          row.warehouse_location_id,
          order.warehouse_location_id,
          locationId!
        );
      });

      const poIds = [...new Set(scopedLines.map((row) => row.purchase_order_id))];

      let reservations: ReservationRow[] = [];
      let locationStatuses: LocationStatusRow[] = [];
      let deliveries: DeliveryRow[] = [];

      if (poIds.length > 0) {
        const [reservationsResult, locationStatusResult, deliveriesResult] = await Promise.all([
          supabase
            .from('warehouse_transfer_reservations')
            .select(
              'purchase_order_id, variant_id, quantity_reserved, quantity_fulfilled, updated_at'
            )
            .eq('warehouse_company_id', companyId!)
            .eq('warehouse_location_id', locationId!)
            .in('purchase_order_id', poIds),
          supabase
            .from('warehouse_transfer_location_status')
            .select('purchase_order_id, warehouse_location_id, status')
            .eq('warehouse_location_id', locationId!)
            .in('purchase_order_id', poIds),
          supabase
            .from('purchase_order_deliveries')
            .select('purchase_order_id, warehouse_location_id, dispatched_at, delivered_at')
            .in('purchase_order_id', poIds),
        ]);

        if (reservationsResult.error) throw reservationsResult.error;
        if (locationStatusResult.error) throw locationStatusResult.error;
        if (deliveriesResult.error) throw deliveriesResult.error;

        reservations = (reservationsResult.data ?? []) as ReservationRow[];
        locationStatuses = (locationStatusResult.data ?? []) as LocationStatusRow[];
        deliveries = (deliveriesResult.data ?? []) as DeliveryRow[];
      }

      const reservationByKey = new Map<string, WarehouseTransferReservationSnapshot>();
      for (const row of reservations) {
        reservationByKey.set(
          warehouseTransferReservationKey(row.purchase_order_id, locationId, row.variant_id),
          {
            quantity_reserved: Number(row.quantity_reserved) || 0,
            quantity_fulfilled: Number(row.quantity_fulfilled) || 0,
            updated_at: row.updated_at,
          }
        );
      }

      const locationStatusByKey = new Map<string, string>();
      for (const row of locationStatuses) {
        locationStatusByKey.set(
          `${row.purchase_order_id}|${row.warehouse_location_id}`,
          row.status
        );
      }

      const dispatchAtByPoLocation = new Map<string, string>();
      const latestDeliveredAtByPo = new Map<string, string>();
      for (const row of deliveries) {
        const locId = row.warehouse_location_id || locationId!;
        trackLatestTimestamp(
          dispatchAtByPoLocation,
          warehouseTransferPoLocationKey(row.purchase_order_id, locId),
          row.dispatched_at
        );
        trackLatestTimestamp(
          latestDeliveredAtByPo,
          row.purchase_order_id,
          row.delivered_at || row.dispatched_at
        );
      }

      const movementByVariant = new Map<string, ReturnType<typeof createEmptyMovementAggregate>>();
      const splitContext = { reservationByKey, locationStatusByKey };

      const groupedLines = new Map<string, GroupedPoLine>();
      for (const row of scopedLines) {
        const order = firstRelation(row.purchase_orders);
        const variantId = row.variant_id;
        if (!order || !variantId) continue;

        const key = `${row.purchase_order_id}|${variantId}`;
        const lineQty = Math.max(0, Number(row.quantity) || 0);
        const existing = groupedLines.get(key);
        if (existing) {
          existing.quantity += lineQty;
        } else {
          groupedLines.set(key, {
            purchaseOrderId: row.purchase_order_id,
            variantId,
            quantity: lineQty,
            warehouseLocationId: row.warehouse_location_id,
            order,
          });
        }
      }

      for (const group of groupedLines.values()) {
        const { order, purchaseOrderId, variantId, quantity, warehouseLocationId } = group;

        const split = splitWarehouseTransferLineItem(
          order,
          {
            purchaseOrderId,
            variantId,
            itemQuantity: quantity,
            warehouseLocationId,
          },
          splitContext
        );
        if (!split) continue;

        const orderInDateRange =
          !order.order_date ||
          isDateInRange(new Date(order.order_date), rangeStart, rangeEnd);

        if (split.pendingQuantity > 0 && orderInDateRange) {
          accumulateMovement(movementByVariant, variantId, {
            pendingRelease: split.pendingQuantity,
          });
        }

        if (split.releasedQuantity > 0) {
          const releaseAt = resolveTransferReleaseTimestamp({
            order,
            purchaseOrderId,
            locationId: locationId!,
            variantId,
            reservationByKey,
            dispatchAtByPoLocation,
            latestDeliveredAtByPo,
          });

          if (!isTimestampInRange(releaseAt, rangeStart, rangeEnd)) continue;

          const poKind = String(order.po_order_kind || '');
          const patch: Partial<ReturnType<typeof createEmptyMovementAggregate>> = {
            released: split.releasedQuantity,
          };
          if (poKind === 'rebate_fulfillment') {
            patch.rebateReplacementReleased = split.releasedQuantity;
          }
          accumulateMovement(movementByVariant, variantId, patch);
        }
      }

      for (const row of (returnLinesResult.data ?? []) as RebateReturnLineRow[]) {
        const variantId = row.variant_id;
        const qty = Math.max(0, Number(row.qty_good) || 0);
        if (!variantId || qty <= 0) continue;

        const receipt = Array.isArray(row.key_account_po_rebate_return_receipts)
          ? row.key_account_po_rebate_return_receipts[0]
          : row.key_account_po_rebate_return_receipts;
        const receivedAt = receipt?.received_at;
        if (!isTimestampInRange(receivedAt, rangeStart, rangeEnd)) continue;

        accumulateMovement(movementByVariant, variantId, { returnedIn: qty });
      }

      for (const row of (disposalsResult.data ?? []) as DisposalRow[]) {
        const variantId = row.variant_id;
        const qty = Math.max(0, Number(row.quantity) || 0);
        if (!variantId || qty <= 0) continue;
        accumulateMovement(movementByVariant, variantId, { disposed: qty });
      }

      return buildWarehouseProductMovementRows(brands, movementByVariant);
    },
  });
}
