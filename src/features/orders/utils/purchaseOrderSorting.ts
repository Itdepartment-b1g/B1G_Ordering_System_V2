import type { PurchaseOrder } from '../types';

export type PurchaseOrderSortKey =
  | 'poNumber'
  | 'type'
  | 'seller'
  | 'orderDate'
  | 'expectedDeliveryDate'
  | 'itemCount'
  | 'totalAmount'
  | 'status';

export type PurchaseOrderSortDirection = 'asc' | 'desc';

export const DEFAULT_PO_SORT_KEY: PurchaseOrderSortKey = 'orderDate';
export const DEFAULT_PO_SORT_DIRECTION: PurchaseOrderSortDirection = 'desc';

function getTypeLabel(order: PurchaseOrder): string {
  return order.fulfillment_type === 'warehouse_transfer' ? 'Internal' : 'Supplier';
}

function getSellerLabel(order: PurchaseOrder): string {
  return order.supplier?.company_name ?? '';
}

export function sortPurchaseOrders(
  orders: PurchaseOrder[],
  sortKey: PurchaseOrderSortKey,
  sortDirection: PurchaseOrderSortDirection
): PurchaseOrder[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...orders].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'poNumber':
        result = a.po_number.localeCompare(b.po_number, undefined, { numeric: true });
        break;
      case 'type':
        result = getTypeLabel(a).localeCompare(getTypeLabel(b));
        break;
      case 'seller':
        result = getSellerLabel(a).localeCompare(getSellerLabel(b));
        break;
      case 'orderDate':
        result = new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
        break;
      case 'expectedDeliveryDate':
        result =
          new Date(a.expected_delivery_date).getTime() -
          new Date(b.expected_delivery_date).getTime();
        break;
      case 'itemCount':
        result = a.items.length - b.items.length;
        break;
      case 'totalAmount':
        result = a.total_amount - b.total_amount;
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.po_number.localeCompare(b.po_number, undefined, { numeric: true }) * direction;
  });
}
