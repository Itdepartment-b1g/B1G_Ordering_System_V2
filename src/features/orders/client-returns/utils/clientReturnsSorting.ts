import type { MockClientReturn } from '../clientReturnMock';
import { formatClientReturnType, getMockReturnLineQty } from '../clientReturnMock';
import type { SortDirection } from '@/features/shared/components/SortableTableHead';

export type ClientReturnHistorySortKey =
  | 'returnNumber'
  | 'clientName'
  | 'returnedByName'
  | 'returnDate'
  | 'returnType'
  | 'status'
  | 'approvedByName'
  | 'rejectedByName'
  | 'qty';

export const DEFAULT_CLIENT_RETURN_HISTORY_SORT_KEY: ClientReturnHistorySortKey = 'returnDate';
export const DEFAULT_CLIENT_RETURN_HISTORY_SORT_DIRECTION: SortDirection = 'desc';

export function sortClientReturnHistory(
  rows: MockClientReturn[],
  sortKey: ClientReturnHistorySortKey,
  sortDirection: SortDirection
): MockClientReturn[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case 'returnNumber':
        result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
        break;
      case 'clientName':
        result = a.clientName.localeCompare(b.clientName);
        break;
      case 'returnedByName':
        result = a.returnedByName.localeCompare(b.returnedByName);
        break;
      case 'returnDate':
        result = new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
        break;
      case 'returnType':
        result = formatClientReturnType(a.returnType).localeCompare(formatClientReturnType(b.returnType));
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'approvedByName':
        result = (a.approvedByName || '').localeCompare(b.approvedByName || '');
        break;
      case 'rejectedByName':
        result = (a.rejectedByName || '').localeCompare(b.rejectedByName || '');
        break;
      case 'qty':
        result = getMockReturnLineQty(a) - getMockReturnLineQty(b);
        break;
      default:
        result = 0;
    }
    if (result === 0) {
      result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
    }
    return result * direction;
  });
}

export type ReturnedStockDetailSortKey =
  | 'returnNumber'
  | 'orderNumber'
  | 'clientName'
  | 'returnDate'
  | 'createdAt'
  | 'reason'
  | 'qty';

export const DEFAULT_RETURNED_STOCK_DETAIL_SORT_KEY: ReturnedStockDetailSortKey = 'createdAt';
export const DEFAULT_RETURNED_STOCK_DETAIL_SORT_DIRECTION: SortDirection = 'desc';

export function sortReturnedStockDetailRows(
  rows: MockClientReturn[],
  sortKey: ReturnedStockDetailSortKey,
  sortDirection: SortDirection,
  qtyForRow: (row: MockClientReturn) => number
): MockClientReturn[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case 'returnNumber':
        result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
        break;
      case 'orderNumber':
        result = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true });
        break;
      case 'clientName':
        result = a.clientName.localeCompare(b.clientName);
        break;
      case 'returnDate':
        result = new Date(a.returnDate).getTime() - new Date(b.returnDate).getTime();
        break;
      case 'createdAt':
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'reason':
        result = a.reason.localeCompare(b.reason);
        break;
      case 'qty':
        result = qtyForRow(a) - qtyForRow(b);
        break;
      default:
        result = 0;
    }
    if (result === 0) {
      result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
    }
    return result * direction;
  });
}

export type BrandVariantSortKey = 'variantName' | 'variantType' | 'quantity';

export const DEFAULT_BRAND_VARIANT_SORT_KEY: BrandVariantSortKey = 'variantName';
export const DEFAULT_BRAND_VARIANT_SORT_DIRECTION: SortDirection = 'asc';

export function sortBrandVariants<T extends { variantName: string; variantType: string; quantity: number }>(
  variants: T[],
  sortKey: BrandVariantSortKey,
  sortDirection: SortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...variants].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case 'variantName':
        result = a.variantName.localeCompare(b.variantName);
        break;
      case 'variantType':
        result = a.variantType.localeCompare(b.variantType);
        break;
      case 'quantity':
        result = a.quantity - b.quantity;
        break;
      default:
        result = 0;
    }
    if (result === 0) result = a.variantName.localeCompare(b.variantName);
    return result * direction;
  });
}

export type ReturnLeaderSortKey =
  | 'returnNumber'
  | 'submittedByName'
  | 'createdAt'
  | 'status'
  | 'qty';

export const DEFAULT_RETURN_LEADER_SORT_KEY: ReturnLeaderSortKey = 'createdAt';
export const DEFAULT_RETURN_LEADER_SORT_DIRECTION: SortDirection = 'desc';

export function sortReturnLeaderHandovers<
  T extends {
    returnNumber: string;
    submittedByName: string;
    createdAt: string;
    status: string;
    lines: Array<{ quantity: number }>;
  },
>(rows: T[], sortKey: ReturnLeaderSortKey, sortDirection: SortDirection): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case 'returnNumber':
        result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
        break;
      case 'submittedByName':
        result = a.submittedByName.localeCompare(b.submittedByName);
        break;
      case 'createdAt':
        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'qty': {
        const qtyA = a.lines.reduce((sum, line) => sum + line.quantity, 0);
        const qtyB = b.lines.reduce((sum, line) => sum + line.quantity, 0);
        result = qtyA - qtyB;
        break;
      }
      default:
        result = 0;
    }
    if (result === 0) {
      result = a.returnNumber.localeCompare(b.returnNumber, undefined, { numeric: true });
    }
    return result * direction;
  });
}
