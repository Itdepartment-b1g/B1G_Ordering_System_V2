export type WarehouseStockAdjustmentSortKey =
  | 'createdAt'
  | 'locationName'
  | 'productName'
  | 'direction'
  | 'quantity'
  | 'reason'
  | 'batchNumber'
  | 'performedBy';

export type WarehouseStockAdjustmentSortDirection = 'asc' | 'desc';

export const DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_KEY: WarehouseStockAdjustmentSortKey =
  'createdAt';
export const DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_DIRECTION: WarehouseStockAdjustmentSortDirection =
  'desc';

export type WarehouseStockAdjustmentSortable = {
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  created_at: string;
  warehouse_location: { name: string } | null;
  variant: {
    name: string;
    brand: { name: string } | null;
  } | null;
  batch: { batch_number: string } | null;
  performed_by_user: { full_name: string } | null;
};

function getLocationLabel(row: WarehouseStockAdjustmentSortable): string {
  return row.warehouse_location?.name ?? '';
}

function getProductLabel(row: WarehouseStockAdjustmentSortable): string {
  const variant = row.variant?.name ?? '';
  const brand = row.variant?.brand?.name ?? '';
  return brand ? `${brand} ${variant}` : variant;
}

function getBatchLabel(row: WarehouseStockAdjustmentSortable): string {
  return row.batch?.batch_number ?? '';
}

function getPerformedByLabel(row: WarehouseStockAdjustmentSortable): string {
  return row.performed_by_user?.full_name ?? '';
}

export function sortWarehouseStockAdjustments<T extends WarehouseStockAdjustmentSortable>(
  adjustments: T[],
  sortKey: WarehouseStockAdjustmentSortKey,
  sortDirection: WarehouseStockAdjustmentSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...adjustments].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'createdAt':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'locationName':
        result = getLocationLabel(a).localeCompare(getLocationLabel(b));
        break;
      case 'productName':
        result = getProductLabel(a).localeCompare(getProductLabel(b));
        break;
      case 'direction':
        result = a.direction.localeCompare(b.direction);
        break;
      case 'quantity':
        result = a.quantity - b.quantity;
        break;
      case 'reason':
        result = a.reason.localeCompare(b.reason);
        break;
      case 'batchNumber':
        result = getBatchLabel(a).localeCompare(getBatchLabel(b), undefined, { numeric: true });
        break;
      case 'performedBy':
        result = getPerformedByLabel(a).localeCompare(getPerformedByLabel(b));
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
