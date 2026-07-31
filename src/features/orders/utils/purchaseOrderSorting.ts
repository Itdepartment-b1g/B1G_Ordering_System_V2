import type { PurchaseOrder } from '../types';

export type PurchaseOrderSortKey =
  | 'poNumber'
  | 'type'
  | 'from'
  | 'seller'
  | 'orderDate'
  | 'expectedDeliveryDate'
  | 'itemCount'
  | 'totalAmount'
  | 'status';

export type PurchaseOrderSortDirection = 'asc' | 'desc';

export const DEFAULT_PO_SORT_KEY: PurchaseOrderSortKey = 'orderDate';
export const DEFAULT_PO_SORT_DIRECTION: PurchaseOrderSortDirection = 'desc';

export type PoFromLabel = {
  primary: string;
  secondary: string;
};

function getPoCreatorName(order: PurchaseOrder): string | null {
  const acct = String(order.company_account_type || 'Standard Accounts');
  if (acct === 'Key Accounts') {
    const kamName = order.kam?.full_name?.trim();
    if (kamName) return kamName;
    const createdByName = order.created_by_user?.full_name?.trim();
    if (createdByName) return createdByName;
    return null;
  }
  // Standard Accounts: same "Placed by" source as PO View (get_po_requestor_info)
  const placedBy = order.requestor_profile?.full_name?.trim();
  if (placedBy) return placedBy;
  const createdByName = order.created_by_user?.full_name?.trim();
  if (createdByName) return createdByName;
  return null;
}

/** Warehouse From column: who (primary) + account type (secondary). */
export function getPoFromLabel(order: PurchaseOrder): PoFromLabel {
  const acct = String(order.company_account_type || 'Standard Accounts');
  return {
    primary: getPoCreatorName(order) || '—',
    secondary: acct === 'Key Accounts' ? 'Key Accounts' : 'Standard Accounts',
  };
}

function getTypeLabel(order: PurchaseOrder): string {
  return order.fulfillment_type === 'warehouse_transfer' ? 'Internal' : 'Supplier';
}

function getSellerLabel(order: PurchaseOrder): string {
  return order.supplier?.company_name ?? '';
}

function getFromSortLabel(order: PurchaseOrder): string {
  const label = getPoFromLabel(order);
  return `${label.secondary} ${label.primary}`;
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
      case 'from':
        result = getFromSortLabel(a).localeCompare(getFromSortLabel(b));
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
