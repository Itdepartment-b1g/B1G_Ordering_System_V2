export type ClientOrderListSortKey =
  | 'orderNumber'
  | 'clientName'
  | 'agentName'
  | 'date'
  | 'items'
  | 'total'
  | 'status';

export type ClientOrderListSortDirection = 'asc' | 'desc';

export const DEFAULT_CLIENT_ORDER_LIST_SORT_KEY: ClientOrderListSortKey = 'date';
export const DEFAULT_CLIENT_ORDER_LIST_SORT_DIRECTION: ClientOrderListSortDirection = 'desc';

export type ClientOrderListSortable = {
  orderNumber: string;
  clientName: string;
  agentName: string;
  date: string;
  items: { quantity?: number }[];
  total: number;
  status: 'pending' | 'approved' | 'rejected';
  stage?:
    | 'agent_pending'
    | 'leader_approved'
    | 'admin_approved'
    | 'leader_rejected'
    | 'admin_rejected'
    | 'finance_pending'
    | 'needs_revision';
};

export function getClientOrderStatusLabel(order: ClientOrderListSortable): string {
  if (order.stage === 'needs_revision') return 'Needs Revision';
  if (order.status === 'pending' || order.stage === 'finance_pending') return 'Pending Finance Review';
  if (order.status === 'approved' || order.stage === 'admin_approved') return 'Approved';
  if (order.status === 'rejected' || order.stage === 'admin_rejected') return 'Rejected';
  return order.status;
}

function getItemCount(order: ClientOrderListSortable): number {
  return order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

export function sortClientOrderList<T extends ClientOrderListSortable>(
  orders: T[],
  sortKey: ClientOrderListSortKey,
  sortDirection: ClientOrderListSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...orders].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'orderNumber':
        result = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
        break;
      case 'clientName':
        result = a.clientName.localeCompare(b.clientName);
        break;
      case 'agentName':
        result = a.agentName.localeCompare(b.agentName);
        break;
      case 'date':
        result = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'items':
        result = getItemCount(a) - getItemCount(b);
        break;
      case 'total':
        result = a.total - b.total;
        break;
      case 'status':
        result = getClientOrderStatusLabel(a).localeCompare(getClientOrderStatusLabel(b));
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
  });
}
