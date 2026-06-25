import {
  warehouseTransferLocationStatusKey,
  warehouseTransferReservationKey,
} from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';

/** Key Account PO workflow statuses visible to warehouse (matches RLS gate). */
export const KEY_ACCOUNT_WAREHOUSE_VISIBLE_WORKFLOW_STATUSES = [
  'warehouse_reserved',
  'partial_delivered',
  'fulfilled',
  'delivered',
] as const;

/** Key Account workflow statuses counted as in-flight / pending release at warehouse. */
export const KEY_ACCOUNT_WAREHOUSE_PENDING_WORKFLOW_STATUSES = [
  'warehouse_reserved',
  'partial_delivered',
] as const;

/** Standard Account PO statuses visible to warehouse before completion. */
export const STANDARD_ACCOUNT_WAREHOUSE_PENDING_PO_STATUSES = [
  'pending',
  'approved_for_fulfillment',
] as const;

export type WarehouseTransferLineSplit = {
  releasedQuantity: number;
  pendingQuantity: number;
};

export type WarehouseTransferReservationSnapshot = {
  quantity_fulfilled: number;
  quantity_reserved: number;
  updated_at: string;
};

export type WarehouseTransferOrderRef = {
  company_account_type?: string | null;
  status?: string | null;
  workflow_status?: string | null;
  po_order_kind?: string | null;
  warehouse_location_id?: string | null;
  updated_at?: string | null;
  order_date?: string | null;
};

export type WarehouseTransferLineInput = {
  purchaseOrderId: string;
  variantId: string;
  itemQuantity: number;
  warehouseLocationId?: string | null;
};

export function isKeyAccountTransferOrder(order: WarehouseTransferOrderRef): boolean {
  return String(order.company_account_type || '') === 'Key Accounts';
}

export function isKeyAccountWarehouseVisibleOrder(order: WarehouseTransferOrderRef): boolean {
  if (!isKeyAccountTransferOrder(order)) return false;
  const ws = String(order.workflow_status || '');
  return (KEY_ACCOUNT_WAREHOUSE_VISIBLE_WORKFLOW_STATUSES as readonly string[]).includes(ws);
}

/** Key Account: fully delivered to client — only state that counts as released. */
export function isKeyAccountWarehouseReleasedOrder(order: WarehouseTransferOrderRef): boolean {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}

export function isKeyAccountWarehousePendingWorkflow(order: WarehouseTransferOrderRef): boolean {
  const ws = String(order.workflow_status || '');
  return (KEY_ACCOUNT_WAREHOUSE_PENDING_WORKFLOW_STATUSES as readonly string[]).includes(ws);
}

export function isStandardAccountWarehouseVisibleOrder(order: WarehouseTransferOrderRef): boolean {
  if (isKeyAccountTransferOrder(order)) return false;
  const status = String(order.status || '');
  return (
    (STANDARD_ACCOUNT_WAREHOUSE_PENDING_PO_STATUSES as readonly string[]).includes(status) ||
    status === 'partially_fulfilled' ||
    status === 'fulfilled'
  );
}

/** Standard Account: released when the transfer PO is fully fulfilled. */
export function isStandardAccountWarehouseReleasedOrder(order: WarehouseTransferOrderRef): boolean {
  return order.status === 'fulfilled';
}

function pendingFromReservationOrLine(
  input: {
    itemQuantity: number;
    variantId: string;
    warehouseLocationId?: string | null;
    orderWarehouseLocationId?: string | null;
    purchaseOrderId: string;
    reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
  },
  fallbackQuantity: number
): number {
  const locationId = input.warehouseLocationId || input.orderWarehouseLocationId || '';
  const reservationKey = warehouseTransferReservationKey(
    input.purchaseOrderId,
    locationId,
    input.variantId
  );
  const reservation = input.reservationByKey.get(reservationKey);
  if (reservation) {
    const reservedPending = Math.max(
      0,
      Number(reservation.quantity_reserved) - Number(reservation.quantity_fulfilled)
    );
    return Math.min(fallbackQuantity, reservedPending);
  }
  return fallbackQuantity;
}

function unfulfilledQuantityAtLocation(input: {
  itemQuantity: number;
  variantId: string;
  warehouseLocationId?: string | null;
  orderWarehouseLocationId?: string | null;
  purchaseOrderId: string;
  reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
  locationStatusByKey: Map<string, string>;
}): number {
  const quantity = Math.max(0, input.itemQuantity);
  const locationId = input.warehouseLocationId || input.orderWarehouseLocationId || '';
  const reservationKey = warehouseTransferReservationKey(
    input.purchaseOrderId,
    locationId,
    input.variantId
  );
  const reservation = input.reservationByKey.get(reservationKey);

  if (reservation) {
    const fulfilled = Math.max(0, Number(reservation.quantity_fulfilled) || 0);
    return Math.max(0, quantity - Math.min(quantity, fulfilled));
  }

  const locationKey = warehouseTransferLocationStatusKey(input.purchaseOrderId, locationId);
  const locationStatus = String(input.locationStatusByKey.get(locationKey) || '').toLowerCase();
  if (locationStatus === 'fulfilled') {
    return 0;
  }

  return quantity;
}

/** Warehouse movement split for Key Account transfer lines. */
export function splitKeyAccountWarehouseTransferLineItem(input: {
  status?: string | null;
  workflowStatus?: string | null;
  itemQuantity: number;
  variantId: string;
  warehouseLocationId?: string | null;
  orderWarehouseLocationId?: string | null;
  purchaseOrderId: string;
  reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
  locationStatusByKey: Map<string, string>;
}): WarehouseTransferLineSplit | null {
  const order: WarehouseTransferOrderRef = {
    company_account_type: 'Key Accounts',
    status: input.status,
    workflow_status: input.workflowStatus,
  };

  if (!isKeyAccountWarehouseVisibleOrder(order)) return null;

  const quantity = Math.max(0, input.itemQuantity);
  if (quantity <= 0) {
    return { releasedQuantity: 0, pendingQuantity: 0 };
  }

  if (isKeyAccountWarehouseReleasedOrder(order)) {
    return { releasedQuantity: quantity, pendingQuantity: 0 };
  }

  if (String(input.workflowStatus || '') === 'warehouse_reserved') {
    const pendingQuantity = pendingFromReservationOrLine(input, quantity);
    return { releasedQuantity: 0, pendingQuantity };
  }

  if (
    String(input.workflowStatus || '') === 'partial_delivered' ||
    (String(input.workflowStatus || '') === 'fulfilled' &&
      !isKeyAccountWarehouseReleasedOrder(order))
  ) {
    const pendingQuantity = unfulfilledQuantityAtLocation(input);
    return { releasedQuantity: 0, pendingQuantity };
  }

  return null;
}

/** Warehouse movement split for Standard Account transfer lines. */
export function splitStandardAccountWarehouseTransferLineItem(input: {
  status?: string | null;
  itemQuantity: number;
  variantId: string;
  warehouseLocationId?: string | null;
  orderWarehouseLocationId?: string | null;
  purchaseOrderId: string;
  reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
  locationStatusByKey: Map<string, string>;
}): WarehouseTransferLineSplit | null {
  const order: WarehouseTransferOrderRef = {
    company_account_type: 'Standard Accounts',
    status: input.status,
  };

  if (!isStandardAccountWarehouseVisibleOrder(order)) return null;

  const quantity = Math.max(0, input.itemQuantity);
  if (quantity <= 0) {
    return { releasedQuantity: 0, pendingQuantity: 0 };
  }

  if (isStandardAccountWarehouseReleasedOrder(order)) {
    return { releasedQuantity: quantity, pendingQuantity: 0 };
  }

  if (
    (STANDARD_ACCOUNT_WAREHOUSE_PENDING_PO_STATUSES as readonly string[]).includes(
      String(input.status || '')
    )
  ) {
    const pendingQuantity =
      String(input.status || '') === 'approved_for_fulfillment'
        ? pendingFromReservationOrLine(input, quantity)
        : quantity;
    return { releasedQuantity: 0, pendingQuantity };
  }

  if (String(input.status || '') === 'partially_fulfilled') {
    const pendingQuantity = unfulfilledQuantityAtLocation(input);
    return { releasedQuantity: 0, pendingQuantity };
  }

  return null;
}

export function splitWarehouseTransferLineItem(
  order: WarehouseTransferOrderRef,
  line: WarehouseTransferLineInput,
  context: {
    reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
    locationStatusByKey: Map<string, string>;
  }
): WarehouseTransferLineSplit | null {
  const base = {
    itemQuantity: line.itemQuantity,
    variantId: line.variantId,
    warehouseLocationId: line.warehouseLocationId,
    orderWarehouseLocationId: order.warehouse_location_id,
    purchaseOrderId: line.purchaseOrderId,
    reservationByKey: context.reservationByKey,
    locationStatusByKey: context.locationStatusByKey,
  };

  if (isKeyAccountTransferOrder(order)) {
    return splitKeyAccountWarehouseTransferLineItem({
      ...base,
      status: order.status,
      workflowStatus: order.workflow_status,
    });
  }

  return splitStandardAccountWarehouseTransferLineItem({
    ...base,
    status: order.status,
  });
}

export function warehouseTransferPoLocationKey(purchaseOrderId: string, locationId: string): string {
  return `${purchaseOrderId}|${locationId}`;
}

/** Timestamp for date-range filtering on released qty. */
export function resolveTransferReleaseTimestamp(input: {
  order: WarehouseTransferOrderRef;
  purchaseOrderId: string;
  locationId: string;
  variantId: string;
  reservationByKey: Map<string, WarehouseTransferReservationSnapshot>;
  dispatchAtByPoLocation: Map<string, string>;
  latestDeliveredAtByPo: Map<string, string>;
}): string | null {
  if (isKeyAccountTransferOrder(input.order)) {
    if (!isKeyAccountWarehouseReleasedOrder(input.order)) return null;
    return (
      input.latestDeliveredAtByPo.get(input.purchaseOrderId) ||
      input.dispatchAtByPoLocation.get(
        warehouseTransferPoLocationKey(input.purchaseOrderId, input.locationId)
      ) ||
      input.order.updated_at ||
      null
    );
  }

  if (!isStandardAccountWarehouseReleasedOrder(input.order)) return null;

  const reservationKey = warehouseTransferReservationKey(
    input.purchaseOrderId,
    input.locationId,
    input.variantId
  );
  const reservation = input.reservationByKey.get(reservationKey);
  if (reservation && reservation.quantity_fulfilled > 0) {
    return reservation.updated_at;
  }

  return (
    input.dispatchAtByPoLocation.get(
      warehouseTransferPoLocationKey(input.purchaseOrderId, input.locationId)
    ) ||
    input.order.updated_at ||
    null
  );
}

export function lineItemMatchesWarehouseLocation(
  itemLocationId: string | null | undefined,
  orderLocationId: string | null | undefined,
  targetLocationId: string
): boolean {
  const effective = itemLocationId || orderLocationId || '';
  return effective === targetLocationId;
}

export function isWarehouseVisibleTransferOrder(order: WarehouseTransferOrderRef): boolean {
  return isKeyAccountWarehouseVisibleOrder(order) || isStandardAccountWarehouseVisibleOrder(order);
}
