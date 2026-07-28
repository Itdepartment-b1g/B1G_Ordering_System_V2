import type { SubWarehouseStockRequest } from '../components/SubWarehouseStockRequestDialog';

export type MainSubStockRequestSortKey =
  | 'requestNumber'
  | 'subWarehouse'
  | 'createdAt'
  | 'qty'
  | 'status';

export type MainSubStockRequestSortDirection = 'asc' | 'desc';

export const DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_KEY: MainSubStockRequestSortKey = 'createdAt';
export const DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_DIRECTION: MainSubStockRequestSortDirection =
  'desc';

const STATUS_SORT_LABELS: Record<SubWarehouseStockRequest['status'], string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  pending_receive: 'Pending receive',
  partially_received: 'Partially received',
  fully_received: 'Fully received',
  rejected: 'Rejected',
};

function requestedQty(request: SubWarehouseStockRequest): number {
  return request.items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity || 0), 0);
}

export function sortMainSubStockRequests(
  requests: SubWarehouseStockRequest[],
  sortKey: MainSubStockRequestSortKey,
  sortDirection: MainSubStockRequestSortDirection
): SubWarehouseStockRequest[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...requests].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'requestNumber':
        result = a.requestNumber.localeCompare(b.requestNumber);
        break;
      case 'subWarehouse':
        result = a.fromLocationName.localeCompare(b.fromLocationName);
        break;
      case 'createdAt':
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'qty':
        result = requestedQty(a) - requestedQty(b);
        break;
      case 'status':
        result = STATUS_SORT_LABELS[a.status].localeCompare(STATUS_SORT_LABELS[b.status]);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
