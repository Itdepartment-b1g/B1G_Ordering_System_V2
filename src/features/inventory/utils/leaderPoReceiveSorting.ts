import {
  TL_PO_STATUS_LABELS,
  type TlReceiveListItem,
} from '../types/tlPoReceiveTypes';

export type LeaderPoReceiveSortKey =
  | 'poNumber'
  | 'warehouse'
  | 'allocatedBy'
  | 'orderDate'
  | 'qty'
  | 'status';

export type LeaderPoReceiveSortDirection = 'asc' | 'desc';

export const DEFAULT_LEADER_PO_RECEIVE_SORT_KEY: LeaderPoReceiveSortKey = 'orderDate';
export const DEFAULT_LEADER_PO_RECEIVE_SORT_DIRECTION: LeaderPoReceiveSortDirection = 'desc';

function getOrderedQty(order: TlReceiveListItem): number {
  return order.items.reduce((sum, item) => sum + Math.max(0, item.orderedQuantity || 0), 0);
}

function warehouseLabel(order: TlReceiveListItem): string {
  return [order.warehouseCompanyName, order.warehouseLocationName].filter(Boolean).join(' ').trim();
}

function allocatedByLabel(order: TlReceiveListItem): string {
  return [order.allocatedByName, order.allocatedByCompanyName].filter(Boolean).join(' ').trim();
}

export function sortLeaderPoReceives(
  orders: TlReceiveListItem[],
  sortKey: LeaderPoReceiveSortKey,
  sortDirection: LeaderPoReceiveSortDirection
): TlReceiveListItem[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...orders].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'poNumber':
        result = a.po_number.localeCompare(b.po_number);
        break;
      case 'warehouse':
        result = warehouseLabel(a).localeCompare(warehouseLabel(b));
        break;
      case 'allocatedBy':
        result = allocatedByLabel(a).localeCompare(allocatedByLabel(b));
        break;
      case 'orderDate':
        result = new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
        break;
      case 'qty':
        result = getOrderedQty(a) - getOrderedQty(b);
        break;
      case 'status':
        result = TL_PO_STATUS_LABELS[a.status].localeCompare(TL_PO_STATUS_LABELS[b.status]);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.order_date).getTime() - new Date(a.order_date).getTime();
  });
}
