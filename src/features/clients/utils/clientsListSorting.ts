import { buildClientApprovalLabel } from './exportClientsListExcel';

export type ClientListSortKey =
  | 'tradeName'
  | 'shopName'
  | 'email'
  | 'phone'
  | 'agent'
  | 'city'
  | 'accountType'
  | 'category'
  | 'orders'
  | 'totalSpent'
  | 'visits'
  | 'approval';

export type ClientListSortDirection = 'asc' | 'desc';

export const DEFAULT_CLIENT_LIST_SORT_KEY: ClientListSortKey = 'tradeName';
export const DEFAULT_CLIENT_LIST_SORT_DIRECTION: ClientListSortDirection = 'asc';

export type ClientListSortable = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  agent_id?: string;
  agent_name?: string;
  city?: string;
  account_type: string;
  category: string;
  total_orders: number;
  total_spent: number;
  visit_count: number;
  approval_status: 'pending' | 'approved' | 'rejected';
};

export type ClientListSortContext = {
  getAgentLabel: (client: ClientListSortable) => string;
};

function compareStrings(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '');
}

export function sortClientsList<T extends ClientListSortable>(
  clients: T[],
  sortKey: ClientListSortKey,
  sortDirection: ClientListSortDirection,
  ctx: ClientListSortContext
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
      case 'agent':
        result = ctx.getAgentLabel(a).localeCompare(ctx.getAgentLabel(b));
        break;
      case 'city':
        result = compareStrings(a.city, b.city);
        break;
      case 'accountType':
        result = a.account_type.localeCompare(b.account_type);
        break;
      case 'category':
        result = a.category.localeCompare(b.category);
        break;
      case 'orders':
        result = a.total_orders - b.total_orders;
        break;
      case 'totalSpent':
        result = a.total_spent - b.total_spent;
        break;
      case 'visits':
        result = a.visit_count - b.visit_count;
        break;
      case 'approval':
        result = buildClientApprovalLabel(a.approval_status).localeCompare(
          buildClientApprovalLabel(b.approval_status)
        );
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.name.localeCompare(b.name);
  });
}
