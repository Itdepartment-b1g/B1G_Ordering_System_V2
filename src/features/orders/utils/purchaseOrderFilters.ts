import type { PurchaseOrder } from '../types';

export type PurchaseOrderStatusFilter =
  | 'all'
  | 'pending'
  | 'approved'
  | 'approved_for_fulfillment'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'rejected'
  | 'cancelled'
  | 'delivered';

export const PO_STATUS_FILTER_LABELS: Record<PurchaseOrderStatusFilter, string> = {
  all: 'All statuses',
  pending: 'Pending',
  approved: 'Approved',
  approved_for_fulfillment: 'Approved for fulfillment',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  delivered: 'Delivered',
};

export const PO_STATUS_FILTER_OPTIONS: PurchaseOrderStatusFilter[] = [
  'all',
  'pending',
  'approved',
  'approved_for_fulfillment',
  'partially_fulfilled',
  'fulfilled',
  'rejected',
  'cancelled',
  'delivered',
];

export function purchaseOrderMatchesStatusFilter(
  order: Pick<PurchaseOrder, 'status'>,
  filter: PurchaseOrderStatusFilter
): boolean {
  if (filter === 'all') return true;
  return order.status === filter;
}
