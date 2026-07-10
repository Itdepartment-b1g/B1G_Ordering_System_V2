export type TeamGroupedRequestSortKey =
  | 'agentName'
  | 'products'
  | 'totalQuantity'
  | 'requestedDate';

export type ReadyRequestSortKey =
  | 'agentName'
  | 'product'
  | 'agentQty'
  | 'leaderQty'
  | 'total'
  | 'date';

export type ForwardedRequestSortKey =
  | 'product'
  | 'quantity'
  | 'status'
  | 'forwardedDate'
  | 'adminResponse';

export type PendingRequestSortDirection = 'asc' | 'desc';

export const DEFAULT_TEAM_GROUPED_SORT_KEY: TeamGroupedRequestSortKey = 'requestedDate';
export const DEFAULT_TEAM_GROUPED_SORT_DIRECTION: PendingRequestSortDirection = 'desc';

export const DEFAULT_READY_REQUEST_SORT_KEY: ReadyRequestSortKey = 'date';
export const DEFAULT_READY_REQUEST_SORT_DIRECTION: PendingRequestSortDirection = 'desc';

export const DEFAULT_FORWARDED_REQUEST_SORT_KEY: ForwardedRequestSortKey = 'forwardedDate';
export const DEFAULT_FORWARDED_REQUEST_SORT_DIRECTION: PendingRequestSortDirection = 'desc';

export type TeamGroupedRequestSortable = {
  agentName: string;
  requested_at: string;
  productCount: number;
  totalQuantity: number;
  requests: { variant?: { name: string; brand?: { name: string } } }[];
};

export type ReadyRequestSortable = {
  requested_at: string;
  requested_quantity: number;
  leader_additional_quantity?: number;
  requester?: { full_name?: string };
  variant?: { name: string; brand?: { name: string } };
};

export type ForwardedRequestSortable = {
  requested_at: string;
  requested_quantity: number;
  status: string;
  approver_notes: string | null;
  denial_reason: string | null;
  variant?: { name: string; brand?: { name: string } };
};

function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

function formatProductNameForSort(variant?: {
  name: string;
  brand?: { name: string };
}): string {
  if (variant?.brand) return `${variant.brand.name} - ${variant.name}`;
  return variant?.name ?? '';
}

function getReadyTotalQty(req: ReadyRequestSortable): number {
  return req.requested_quantity + (req.leader_additional_quantity || 0);
}

function getAdminResponseLabel(req: ForwardedRequestSortable): string {
  return req.approver_notes || req.denial_reason || '';
}

export function sortTeamGroupedRequests<T extends TeamGroupedRequestSortable>(
  groups: T[],
  sortKey: TeamGroupedRequestSortKey,
  sortDirection: PendingRequestSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'agentName':
        result = a.agentName.localeCompare(b.agentName);
        break;
      case 'products':
        result = a.productCount - b.productCount;
        break;
      case 'totalQuantity':
        result = a.totalQuantity - b.totalQuantity;
        break;
      case 'requestedDate':
        result = compareDates(a.requested_at, b.requested_at);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(b.requested_at, a.requested_at);
  });
}

export function sortReadyRequests<T extends ReadyRequestSortable>(
  requests: T[],
  sortKey: ReadyRequestSortKey,
  sortDirection: PendingRequestSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...requests].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'agentName':
        result = (a.requester?.full_name ?? '').localeCompare(b.requester?.full_name ?? '');
        break;
      case 'product':
        result = formatProductNameForSort(a.variant).localeCompare(formatProductNameForSort(b.variant));
        break;
      case 'agentQty':
        result = a.requested_quantity - b.requested_quantity;
        break;
      case 'leaderQty':
        result = (a.leader_additional_quantity || 0) - (b.leader_additional_quantity || 0);
        break;
      case 'total':
        result = getReadyTotalQty(a) - getReadyTotalQty(b);
        break;
      case 'date':
        result = compareDates(a.requested_at, b.requested_at);
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(b.requested_at, a.requested_at);
  });
}

export function sortForwardedRequests<T extends ForwardedRequestSortable>(
  requests: T[],
  sortKey: ForwardedRequestSortKey,
  sortDirection: PendingRequestSortDirection
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...requests].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'product':
        result = formatProductNameForSort(a.variant).localeCompare(formatProductNameForSort(b.variant));
        break;
      case 'quantity':
        result = a.requested_quantity - b.requested_quantity;
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      case 'forwardedDate':
        result = compareDates(a.requested_at, b.requested_at);
        break;
      case 'adminResponse':
        result = getAdminResponseLabel(a).localeCompare(getAdminResponseLabel(b));
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return compareDates(b.requested_at, a.requested_at);
  });
}
