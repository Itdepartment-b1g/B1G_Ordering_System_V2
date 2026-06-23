export type WarehouseStockRequestSortKey =
  | 'requestNumber'
  | 'brandName'
  | 'status'
  | 'progress'
  | 'createdAt'
  | 'lastReceivedAt';

export type WarehouseStockRequestSortDirection = 'asc' | 'desc';

export const DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_KEY: WarehouseStockRequestSortKey = 'createdAt';
export const DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_DIRECTION: WarehouseStockRequestSortDirection =
  'desc';

export type WarehouseStockRequestSortable = {
  request_number: string;
  status: string;
  created_at: string;
  brand: { name: string } | null;
  items: Array<{
    ordered_quantity: number;
    received_quantity: number;
    variant: { brand: { name: string } | null } | null;
  }>;
  receives: Array<{ received_at: string }>;
};

function getRequestBrandLabel(req: WarehouseStockRequestSortable): string {
  if (req.brand?.name) return req.brand.name;
  const names = [
    ...new Set(
      req.items
        .map((i) => i.variant?.brand?.name)
        .filter((n): n is string => !!n)
    ),
  ];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.length} brands`;
}

function getLastReceivedAt(req: WarehouseStockRequestSortable): number | null {
  if (req.receives.length === 0) return null;
  return req.receives.reduce((latest, recv) => {
    const t = new Date(recv.received_at).getTime();
    return t > latest ? t : latest;
  }, 0);
}

function getRequestProgress(req: WarehouseStockRequestSortable): {
  received: number;
  ordered: number;
} {
  const ordered = req.items.reduce((sum, item) => sum + item.ordered_quantity, 0);
  const received = req.items.reduce((sum, item) => sum + item.received_quantity, 0);
  return { received, ordered };
}

export function sortWarehouseStockRequests<T extends WarehouseStockRequestSortable>(
  requests: T[],
  sortKey: WarehouseStockRequestSortKey,
  sortDirection: WarehouseStockRequestSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...requests].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'requestNumber':
        result = a.request_number.localeCompare(b.request_number, undefined, { numeric: true });
        break;
      case 'brandName':
        result = getRequestBrandLabel(a).localeCompare(getRequestBrandLabel(b));
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'progress': {
        const progressA = getRequestProgress(a);
        const progressB = getRequestProgress(b);
        const ratioA =
          progressA.ordered > 0 ? progressA.received / progressA.ordered : 0;
        const ratioB =
          progressB.ordered > 0 ? progressB.received / progressB.ordered : 0;
        result = ratioA - ratioB;
        if (result === 0) result = progressA.received - progressB.received;
        break;
      }
      case 'createdAt':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'lastReceivedAt': {
        const lastA = getLastReceivedAt(a);
        const lastB = getLastReceivedAt(b);
        if (lastA === null && lastB === null) result = 0;
        else if (lastA === null) result = 1;
        else if (lastB === null) result = -1;
        else result = lastA - lastB;
        break;
      }
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
