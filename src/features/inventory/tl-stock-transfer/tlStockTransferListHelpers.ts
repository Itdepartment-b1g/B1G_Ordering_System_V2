import { isDateInRange } from '@/lib/dateRangePresets';
import type { SortDirection } from '@/features/shared/components/SortableTableHead';
import {
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
} from '@/features/shared/components/QuickFilterSheet';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  tlRemainingToDispatch,
  tlStatusLabel,
  type TLRequestGroup,
} from './tlStockTransferShared';

export type TlTransferQuickColumn =
  | 'request_number'
  | 'tdr_number'
  | 'from'
  | 'to'
  | 'brand'
  | 'region';

export type TlTransferQuickStatus =
  | 'all'
  | 'pending_admin'
  | 'pending_source_tl'
  | 'pending_receipt'
  | 'incomplete'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export const TL_TRANSFER_QUICK_STATUS_OPTIONS: Array<{
  value: TlTransferQuickStatus;
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'pending_admin', label: 'Pending Super Admin' },
  { value: 'pending_source_tl', label: 'Awaiting dispatch' },
  { value: 'pending_receipt', label: 'In transit' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function tlTransferMatchesQuickStatus(
  status: string,
  filter: TlTransferQuickStatus
): boolean {
  if (filter === 'all') return true;
  if (filter === 'rejected') {
    return status === 'admin_rejected' || status === 'source_tl_rejected';
  }
  if (filter === 'pending_source_tl') {
    return status === 'pending_source_tl' || status === 'admin_approved';
  }
  if (filter === 'pending_receipt') {
    return status === 'pending_receipt' || status === 'source_tl_approved';
  }
  return status === filter;
}

export function uniqueTlTransferQuickOptions(
  groups: TLRequestGroup[],
  field: TlTransferQuickColumn
): string[] {
  const values = new Set<string>();
  for (const group of groups) {
    switch (field) {
      case 'request_number':
        if (group.request_number) values.add(group.request_number);
        break;
      case 'tdr_number':
        if (group.tdr_number) values.add(group.tdr_number);
        break;
      case 'from':
        if (group.source?.full_name) values.add(group.source.full_name);
        break;
      case 'to':
        if (group.requester?.full_name) values.add(group.requester.full_name);
        break;
      case 'brand':
        for (const item of group.items) {
          const brand = item.variant?.brand_name?.trim();
          if (brand) values.add(brand);
        }
        break;
      case 'region': {
        const sourceRegion = group.source?.region?.trim();
        const requesterRegion = group.requester?.region?.trim();
        if (sourceRegion) values.add(sourceRegion);
        if (requesterRegion) values.add(requesterRegion);
        break;
      }
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function groupMatchesQuickColumns(
  group: TLRequestGroup,
  columnClauses?: QuickFilterAndClause<TlTransferQuickColumn>[]
): boolean {
  return matchesQuickFilterAndClauses(columnClauses, (field, value) => {
    switch (field) {
      case 'request_number':
        return group.request_number === value;
      case 'tdr_number':
        return (group.tdr_number || '') === value;
      case 'from':
        return (group.source?.full_name || '') === value;
      case 'to':
        return (group.requester?.full_name || '') === value;
      case 'brand':
        return group.items.some((item) => (item.variant?.brand_name || '') === value);
      case 'region':
        return (
          (group.source?.region || '') === value || (group.requester?.region || '') === value
        );
      default:
        return false;
    }
  });
}

export type TlTransferListSortKey =
  | 'request_number'
  | 'tdr_number'
  | 'counterpart'
  | 'source'
  | 'item'
  | 'requested_quantity'
  | 'dispatched_quantity'
  | 'received_quantity'
  | 'to_dispatch'
  | 'status'
  | 'created_at';

export const DEFAULT_TL_TRANSFER_SORT_KEY: TlTransferListSortKey = 'created_at';
export const DEFAULT_TL_TRANSFER_SORT_DIRECTION: SortDirection = 'desc';

export type TlTransferDateRange = {
  start?: Date;
  end?: Date;
};

export type TlTransferCounterpartField = 'requester' | 'source';

function itemLabel(row: Pick<TLRequestWithDetails, 'variant'>): string {
  return [row.variant?.brand_name, row.variant?.name, row.variant?.type]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function counterpartName(
  row: Pick<TLRequestWithDetails, 'requester' | 'source'>,
  field: TlTransferCounterpartField
): string {
  return (field === 'requester' ? row.requester?.full_name : row.source?.full_name) || '';
}

function rowSearchHaystack(row: TLRequestWithDetails): string {
  return [
    row.request_number,
    row.tdr_number ?? '',
    row.requester?.full_name ?? '',
    row.requester?.region ?? '',
    row.source?.full_name ?? '',
    row.source?.region ?? '',
    itemLabel(row),
    tlStatusLabel(row.status),
    row.status,
  ]
    .join(' ')
    .toLowerCase();
}

function groupSearchHaystack(group: TLRequestGroup): string {
  const itemText = group.items.map((item) => rowSearchHaystack(item)).join(' ');
  return [
    group.request_number,
    group.tdr_number ?? '',
    group.requester?.full_name ?? '',
    group.requester?.region ?? '',
    group.source?.full_name ?? '',
    tlStatusLabel(group.status),
    group.status,
    itemText,
  ]
    .join(' ')
    .toLowerCase();
}

export function filterTlTransferRows(
  rows: TLRequestWithDetails[],
  searchQuery: string,
  dateRange: TlTransferDateRange
): TLRequestWithDetails[] {
  const q = searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    if (!isDateInRange(row.created_at, dateRange.start, dateRange.end)) return false;
    if (q && !rowSearchHaystack(row).includes(q)) return false;
    return true;
  });
}

export type FilterTlTransferGroupsOptions = {
  status?: TlTransferQuickStatus;
  columnClauses?: QuickFilterAndClause<TlTransferQuickColumn>[];
};

export function filterTlTransferGroups(
  groups: TLRequestGroup[],
  searchQuery: string,
  dateRange: TlTransferDateRange,
  options?: FilterTlTransferGroupsOptions
): TLRequestGroup[] {
  const q = searchQuery.trim().toLowerCase();
  const status = options?.status ?? 'all';
  return groups.filter((group) => {
    if (!isDateInRange(group.created_at, dateRange.start, dateRange.end)) return false;
    if (!tlTransferMatchesQuickStatus(String(group.status), status)) return false;
    if (!groupMatchesQuickColumns(group, options?.columnClauses)) return false;
    if (q && !groupSearchHaystack(group).includes(q)) return false;
    return true;
  });
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function qty(value: number | null | undefined): number {
  return Number(value || 0);
}

export function sortTlTransferRows(
  rows: TLRequestWithDetails[],
  sortKey: TlTransferListSortKey,
  sortDirection: SortDirection,
  counterpartField: TlTransferCounterpartField
): TLRequestWithDetails[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'request_number':
        result = compareText(a.request_number || '', b.request_number || '');
        break;
      case 'tdr_number':
        result = compareText(a.tdr_number || '', b.tdr_number || '');
        break;
      case 'counterpart':
        result = compareText(counterpartName(a, counterpartField), counterpartName(b, counterpartField));
        break;
      case 'source':
        result = compareText(a.source?.full_name || '', b.source?.full_name || '');
        break;
      case 'item':
        result = compareText(itemLabel(a), itemLabel(b));
        break;
      case 'requested_quantity':
        result = qty(a.requested_quantity) - qty(b.requested_quantity);
        break;
      case 'dispatched_quantity':
        result = qty(a.dispatched_quantity) - qty(b.dispatched_quantity);
        break;
      case 'received_quantity':
        result = qty(a.received_quantity) - qty(b.received_quantity);
        break;
      case 'to_dispatch':
        result = tlRemainingToDispatch(a) - tlRemainingToDispatch(b);
        break;
      case 'status':
        result = compareText(tlStatusLabel(a.status), tlStatusLabel(b.status));
        break;
      case 'created_at':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function sortTlTransferGroups(
  groups: TLRequestGroup[],
  sortKey: TlTransferListSortKey,
  sortDirection: SortDirection,
  counterpartField: TlTransferCounterpartField = 'requester'
): TLRequestGroup[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...groups].sort((a, b) => {
    let result = 0;
    const aItem = a.items[0];
    const bItem = b.items[0];
    const aToDispatch = a.items.reduce((sum, item) => sum + tlRemainingToDispatch(item), 0);
    const bToDispatch = b.items.reduce((sum, item) => sum + tlRemainingToDispatch(item), 0);

    switch (sortKey) {
      case 'request_number':
        result = compareText(a.request_number || '', b.request_number || '');
        break;
      case 'tdr_number':
        result = compareText(a.tdr_number || '', b.tdr_number || '');
        break;
      case 'counterpart':
        result = compareText(counterpartName(a, counterpartField), counterpartName(b, counterpartField));
        break;
      case 'source':
        result = compareText(a.source?.full_name || '', b.source?.full_name || '');
        break;
      case 'item':
        result = compareText(aItem ? itemLabel(aItem) : '', bItem ? itemLabel(bItem) : '');
        break;
      case 'requested_quantity':
        result = a.totalRequested - b.totalRequested;
        break;
      case 'dispatched_quantity':
        result = a.totalDispatched - b.totalDispatched;
        break;
      case 'received_quantity':
        result = a.totalReceived - b.totalReceived;
        break;
      case 'to_dispatch':
        result = aToDispatch - bToDispatch;
        break;
      case 'status':
        result = compareText(tlStatusLabel(a.status), tlStatusLabel(b.status));
        break;
      case 'created_at':
        result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
