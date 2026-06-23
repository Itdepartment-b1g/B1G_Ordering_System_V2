export type WarehouseStockReturnSortKey =
  | 'returnNumber'
  | 'fromLocation'
  | 'status'
  | 'progress'
  | 'createdAt'
  | 'lastInspectedAt';

export type WarehouseStockReturnSortDirection = 'asc' | 'desc';

export const DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_KEY: WarehouseStockReturnSortKey = 'createdAt';
export const DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_DIRECTION: WarehouseStockReturnSortDirection =
  'desc';

export type WarehouseStockReturnSortable = {
  request_number: string;
  status: string;
  created_at: string;
  from_location: { name: string } | null;
  items: Array<{
    return_quantity: number;
    inspected_quantity: number;
  }>;
  receipts: Array<{ received_at: string }>;
};

function getFromLocationLabel(req: WarehouseStockReturnSortable): string {
  return req.from_location?.name ?? '';
}

function getLastInspectedAt(req: WarehouseStockReturnSortable): number | null {
  if (req.receipts.length === 0) return null;
  return req.receipts.reduce((latest, receipt) => {
    const t = new Date(receipt.received_at).getTime();
    return t > latest ? t : latest;
  }, 0);
}

function getReturnProgress(req: WarehouseStockReturnSortable): {
  inspected: number;
  total: number;
} {
  const total = req.items.reduce((sum, item) => sum + item.return_quantity, 0);
  const inspected = req.items.reduce((sum, item) => sum + item.inspected_quantity, 0);
  return { inspected, total };
}

export function sortWarehouseStockReturns<T extends WarehouseStockReturnSortable>(
  returns: T[],
  sortKey: WarehouseStockReturnSortKey,
  sortDirection: WarehouseStockReturnSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...returns].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'returnNumber':
        result = a.request_number.localeCompare(b.request_number, undefined, { numeric: true });
        break;
      case 'fromLocation':
        result = getFromLocationLabel(a).localeCompare(getFromLocationLabel(b));
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'progress': {
        const progressA = getReturnProgress(a);
        const progressB = getReturnProgress(b);
        const ratioA = progressA.total > 0 ? progressA.inspected / progressA.total : 0;
        const ratioB = progressB.total > 0 ? progressB.inspected / progressB.total : 0;
        result = ratioA - ratioB;
        if (result === 0) result = progressA.inspected - progressB.inspected;
        break;
      }
      case 'createdAt':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'lastInspectedAt': {
        const lastA = getLastInspectedAt(a);
        const lastB = getLastInspectedAt(b);
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
