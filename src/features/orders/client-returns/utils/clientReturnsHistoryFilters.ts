import { isDateInRange } from '@/lib/dateRangePresets';
import {
  CLIENT_RETURN_REASON_OPTIONS,
  canReviewClientReturn,
  formatClientReturnReason,
  formatClientReturnStatus,
  formatClientReturnType,
  type ClientReturnKind,
  type PreviewClientReturn,
} from '../clientReturnPreview';

export type ClientReturnHistoryStatusFilter =
  | 'all'
  | 'open'
  | 'needs_action'
  | 'pending_leader'
  | 'pending_super_admin'
  | 'pending_finance'
  | 'posted'
  | 'rejected';

export type ClientReturnHistoryTypeFilter = 'all' | ClientReturnKind;
export type ClientReturnDateBasis = 'returnDate' | 'createdAt' | 'decisionAt';

export type ClientReturnHistoryFilterState = {
  status: ClientReturnHistoryStatusFilter;
  type: ClientReturnHistoryTypeFilter;
  reason: string;
  returnedBy: string;
  decisionBy: string;
  dateStart?: Date;
  dateEnd?: Date;
  dateBasis: ClientReturnDateBasis;
  search: string;
  role?: string | null;
};

const PENDING_STATUSES = new Set(['pending_leader', 'pending_super_admin', 'pending_finance']);
const KNOWN_REASONS = new Set<string>(CLIENT_RETURN_REASON_OPTIONS.map((option) => option.value));

export function getClientReturnDecisionAt(row: PreviewClientReturn): string | null {
  return row.approvedAt || row.rejectedAt || row.saApprovedAt || null;
}

export function getClientReturnAuditDate(
  row: PreviewClientReturn,
  basis: ClientReturnDateBasis
): string | null {
  if (basis === 'createdAt') return row.createdAt || null;
  if (basis === 'decisionAt') return getClientReturnDecisionAt(row);
  return row.returnDate || row.createdAt || null;
}

export function matchesClientReturnHistoryStatus(
  row: PreviewClientReturn,
  status: ClientReturnHistoryStatusFilter,
  role?: string | null
): boolean {
  if (status === 'all') return true;
  if (status === 'open') return PENDING_STATUSES.has(row.status);
  if (status === 'needs_action') return canReviewClientReturn(role, row);
  return row.status === status;
}

function matchesReason(row: PreviewClientReturn, reason: string): boolean {
  if (reason === 'all') return true;
  const raw = String(row.reason || '').trim().toLowerCase();
  if (reason === 'other') {
    return raw === 'other' || !KNOWN_REASONS.has(raw);
  }
  return raw === reason;
}

function matchesDecisionBy(row: PreviewClientReturn, name: string): boolean {
  if (name === 'all') return true;
  const needle = name.trim().toLowerCase();
  return [row.approvedByName, row.rejectedByName, row.saApprovedByName].some(
    (value) => (value || '').trim().toLowerCase() === needle
  );
}

function matchesSearch(row: PreviewClientReturn, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    row.returnNumber,
    row.orderNumber,
    row.clientName,
    row.returnedByName,
    row.reason,
    formatClientReturnReason(row.reason),
    formatClientReturnStatus(row.status),
    formatClientReturnType(row.returnType),
    row.notes || '',
    row.rejectionNote || '',
    row.approvedByName || '',
    row.rejectedByName || '',
    row.saApprovedByName || '',
    ...row.lines.map((line) => `${line.brandName} ${line.variantName}`),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function matchesClientReturnHistory(
  row: PreviewClientReturn,
  filters: ClientReturnHistoryFilterState,
  skip?: { status?: boolean; type?: boolean }
): boolean {
  if (!skip?.status && !matchesClientReturnHistoryStatus(row, filters.status, filters.role)) {
    return false;
  }
  if (!skip?.type && filters.type !== 'all' && row.returnType !== filters.type) {
    return false;
  }
  if (!matchesReason(row, filters.reason)) return false;
  if (filters.returnedBy !== 'all' && row.returnedByName.trim() !== filters.returnedBy) {
    return false;
  }
  if (!matchesDecisionBy(row, filters.decisionBy)) return false;
  const auditDate = getClientReturnAuditDate(row, filters.dateBasis);
  if (filters.dateStart || filters.dateEnd) {
    if (!auditDate || !isDateInRange(auditDate, filters.dateStart, filters.dateEnd)) return false;
  }
  return matchesSearch(row, filters.search);
}

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function uniqueReturnedByNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.returnedByName));
}

export function uniqueDecisionByNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(
    rows.flatMap((row) => [row.approvedByName, row.rejectedByName, row.saApprovedByName])
  );
}

export function clientReturnHistoryStatusLabel(status: ClientReturnHistoryStatusFilter): string {
  if (status === 'all') return 'All';
  if (status === 'open') return 'Open';
  if (status === 'needs_action') return 'Needs action';
  if (status === 'posted') return 'Posted';
  if (status === 'rejected') return 'Rejected';
  return formatClientReturnStatus(status);
}
