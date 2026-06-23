import { buildClientApprovalLabel } from './exportClientsListExcel';

export type MyClientListSortKey =
  | 'tradeName'
  | 'shopName'
  | 'email'
  | 'phone'
  | 'orders'
  | 'visits'
  | 'lastOrder'
  | 'approval';

export type MyClientListSortDirection = 'asc' | 'desc';

export const DEFAULT_MY_CLIENT_LIST_SORT_KEY: MyClientListSortKey = 'tradeName';
export const DEFAULT_MY_CLIENT_LIST_SORT_DIRECTION: MyClientListSortDirection = 'asc';

export type MyClientListSortable = {
  name: string;
  company: string;
  email: string;
  phone: string;
  totalOrders: number;
  visitCount: number;
  lastOrder: string | null;
  approvalStatus: 'pending' | 'approved' | 'rejected';
};

function compareStrings(a: string | undefined | null, b: string | undefined | null): number {
  return (a ?? '').localeCompare(b ?? '');
}

function compareDates(a: string | null | undefined, b: string | null | undefined): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return aTime - bTime;
}

export function sortMyClientsList<T extends MyClientListSortable>(
  clients: T[],
  sortKey: MyClientListSortKey,
  sortDirection: MyClientListSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...clients].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'tradeName':
        result = a.name.localeCompare(b.name);
        break;
      case 'shopName':
        result = compareStrings(a.company, b.company);
        break;
      case 'email':
        result = compareStrings(a.email, b.email);
        break;
      case 'phone':
        result = compareStrings(a.phone, b.phone);
        break;
      case 'orders':
        result = a.totalOrders - b.totalOrders;
        break;
      case 'visits':
        result = a.visitCount - b.visitCount;
        break;
      case 'lastOrder':
        result = compareDates(a.lastOrder, b.lastOrder);
        break;
      case 'approval':
        result = buildClientApprovalLabel(a.approvalStatus).localeCompare(
          buildClientApprovalLabel(b.approvalStatus)
        );
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.name.localeCompare(b.name);
  });
}
