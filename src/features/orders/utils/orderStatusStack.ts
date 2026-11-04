import type { Order } from '../OrderContext';

export type OrderStatusBadge = {
  text: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
  className?: string;
};

export function isZeroValueOrder(order: Order) {
  return Math.abs(Number(order.total) || 0) < 0.01;
}

export function hasCashOrChequeComponent(order: Order) {
  if (isZeroValueOrder(order)) return false;
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits)) {
    return order.paymentSplits.some((s) => s.method === 'CASH' || s.method === 'CHEQUE');
  }
  return order.paymentMethod === 'CASH' || order.paymentMethod === 'CHEQUE';
}

/**
 * Stacked Status badges for agent order list.
 */
export function getOrderStatusStack(
  order: Order
): { primary: OrderStatusBadge; secondary: OrderStatusBadge | null } {
  if (order.stage === 'needs_revision') {
    return { primary: { text: 'Needs Revision', variant: 'outline' }, secondary: null };
  }
  if (order.stage === 'admin_approved' || order.status === 'approved') {
    return { primary: { text: 'Approved', variant: 'default' }, secondary: null };
  }
  if (
    order.stage === 'admin_rejected' ||
    order.stage === 'leader_rejected' ||
    order.status === 'rejected'
  ) {
    return { primary: { text: 'Rejected', variant: 'destructive' }, secondary: null };
  }

  const stillPending =
    order.status === 'pending' ||
    order.stage === 'agent_pending' ||
    order.stage === 'leader_approved' ||
    order.stage === 'finance_pending';

  if (stillPending && hasCashOrChequeComponent(order)) {
    const depositFullyRecorded = !!(order.depositId && order.depositBankAccount);

    if (!order.remitted && !order.depositId) {
      return {
        primary: { text: 'Pending Mobile Sales', variant: 'secondary' },
        secondary: {
          text: 'Awaiting Remittance',
          variant: 'outline',
          className: 'bg-amber-50 text-amber-700 border-amber-200',
        },
      };
    }

    if (!depositFullyRecorded) {
      return {
        primary: { text: 'Pending Team Leader', variant: 'secondary' },
        secondary: {
          text: 'Pending Cash Deposit',
          variant: 'outline',
          className: 'bg-orange-50 text-orange-700 border-orange-200',
        },
      };
    }

    return {
      primary: { text: 'Pending Finance Review', variant: 'secondary' },
      secondary: {
        text: 'Deposit Recorded',
        variant: 'outline',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      },
    };
  }

  if (order.stage === 'finance_pending' || order.status === 'pending') {
    const isElectronic =
      !isZeroValueOrder(order) &&
      (order.paymentMethod === 'BANK_TRANSFER' ||
        order.paymentMethod === 'GCASH' ||
        (order.paymentMode === 'SPLIT' &&
          Array.isArray(order.paymentSplits) &&
          order.paymentSplits.some(
            (s) => s.method === 'BANK_TRANSFER' || s.method === 'GCASH'
          )));

    return {
      primary: { text: 'Pending Finance Review', variant: 'secondary' },
      secondary: isElectronic
        ? {
            text: 'Payment Proof Submitted',
            variant: 'outline',
            className: 'bg-sky-50 text-sky-700 border-sky-200',
          }
        : null,
    };
  }
  if (order.stage === 'leader_approved') {
    return { primary: { text: 'Approved by Leader', variant: 'default' }, secondary: null };
  }
  if (order.stage === 'agent_pending') {
    return { primary: { text: 'Pending Team Leader', variant: 'secondary' }, secondary: null };
  }

  return {
    primary: { text: order.status || 'Pending', variant: 'secondary' },
    secondary: null,
  };
}
