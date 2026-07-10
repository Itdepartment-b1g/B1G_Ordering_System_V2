import { buildClientApprovalLabel } from './exportClientsListExcel';

export type PendingClientSortKey =
  | 'name'
  | 'shopName'
  | 'email'
  | 'phone'
  | 'city'
  | 'agent'
  | 'status'
  | 'requested'
  | 'notes';

export type PendingClientSortDirection = 'asc' | 'desc';

export const DEFAULT_PENDING_CLIENT_SORT_KEY: PendingClientSortKey = 'requested';
export const DEFAULT_PENDING_CLIENT_SORT_DIRECTION: PendingClientSortDirection = 'asc';

export type PendingClientSortable = {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  agent_name?: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_requested_at?: string;
  approval_notes?: string | null;
};

function compareStrings(a: string | undefined | null, b: string | undefined | null): number {
  return (a ?? '').localeCompare(b ?? '');
}

function compareDates(a: string | undefined, b: string | undefined): number {
  const aTime = a ? new Date(a).getTime() : 0;
  const bTime = b ? new Date(b).getTime() : 0;
  return aTime - bTime;
}

export function sortPendingClients<T extends PendingClientSortable>(
  clients: T[],
  sortKey: PendingClientSortKey,
  sortDirection: PendingClientSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...clients].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'name':
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
      case 'city':
        result = compareStrings(a.city, b.city);
        break;
      case 'agent':
        result = compareStrings(a.agent_name || 'Unassigned', b.agent_name || 'Unassigned');
        break;
      case 'status':
        result = buildClientApprovalLabel(a.approval_status).localeCompare(
          buildClientApprovalLabel(b.approval_status)
        );
        break;
      case 'requested':
        result = compareDates(a.approval_requested_at, b.approval_requested_at);
        break;
      case 'notes':
        result = compareStrings(a.approval_notes, b.approval_notes);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(a.approval_requested_at, b.approval_requested_at);
  });
}
