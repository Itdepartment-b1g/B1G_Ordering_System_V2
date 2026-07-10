export type MyOrderListSortKey =
  | 'orderNumber'
  | 'clientName'
  | 'date'
  | 'qty'
  | 'amount'
  | 'payment'
  | 'status';

export type MyOrderListSortDirection = 'asc' | 'desc';

export const DEFAULT_MY_ORDER_LIST_SORT_KEY: MyOrderListSortKey = 'date';
export const DEFAULT_MY_ORDER_LIST_SORT_DIRECTION: MyOrderListSortDirection = 'desc';

type PaymentSplit = {
  method?: string;
  bank?: string;
};

export type MyOrderListSortable = {
  orderNumber: string;
  clientName: string;
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
  paymentMode?: 'FULL' | 'SPLIT';
  paymentSplits?: PaymentSplit[];
  paymentMethod?: string;
  bankType?: string;
};

function getItemQty(order: MyOrderListSortable): number {
  return order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function getMyOrderDisplayStatusLabel(order: MyOrderListSortable): string {
  const stage = order.stage || order.status;
  switch (stage) {
    case 'agent_pending':
      return 'Pending';
    case 'leader_approved':
      return 'Approved by Leader';
    case 'admin_approved':
      return 'Approved';
    case 'leader_rejected':
    case 'admin_rejected':
      return 'Rejected';
    case 'needs_revision':
      return 'Needs Revision';
    default:
      return order.status || 'Pending';
  }
}

function getMyOrderPaymentLabel(order: MyOrderListSortable): string {
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
    const parts = order.paymentSplits.map((split) => {
      if (split.method === 'BANK_TRANSFER') {
        return split.bank ? `Bank Transfer (${split.bank})` : 'Bank Transfer';
      }
      if (split.method === 'GCASH') return 'GCash';
      if (split.method === 'CASH') return 'Cash';
      if (split.method === 'CHEQUE') return 'Cheque';
      return split.method ?? '';
    });
    return `Split Payment: ${parts.join(' + ')}`;
  }

  const method = order.paymentMethod;
  const bankType = order.bankType;
  if (!method) return 'N/A';
  switch (method) {
    case 'GCASH':
      return 'GCash';
    case 'BANK_TRANSFER':
      return bankType ? `Bank Transfer (${bankType})` : 'Bank Transfer';
    case 'CASH':
      return 'Cash';
    case 'CHEQUE':
      return 'Cheque';
    default:
      return method;
  }
}

export function sortMyOrderList<T extends MyOrderListSortable>(
  orders: T[],
  sortKey: MyOrderListSortKey,
  sortDirection: MyOrderListSortDirection
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
      case 'date':
        result = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case 'qty':
        result = getItemQty(a) - getItemQty(b);
        break;
      case 'amount':
        result = a.total - b.total;
        break;
      case 'payment':
        result = getMyOrderPaymentLabel(a).localeCompare(getMyOrderPaymentLabel(b));
        break;
      case 'status':
        result = getMyOrderDisplayStatusLabel(a).localeCompare(getMyOrderDisplayStatusLabel(b));
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
  });
}
