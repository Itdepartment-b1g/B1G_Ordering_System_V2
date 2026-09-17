import { format, isValid } from 'date-fns';
import { isDateInRange, parseDateFromInput } from '@/lib/dateRangePresets';
import {
  createConditionFilterCondition,
  groupedConditionsPass,
  type ConditionFilterCondition,
  type ConditionFilterFieldConfig,
  type ConditionFilterOperator,
} from '@/features/shared/utils/conditionFilters';
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
export type ClientReturnHistoryField =
  | 'returnNumber'
  | 'orderNumber'
  | 'status'
  | 'type'
  | 'reason'
  | 'returnedBy'
  | 'tlApproved'
  | 'saApproved'
  | 'financePosted'
  | 'rejectedBy'
  | 'date';
export type ClientReturnHistoryOperator = ConditionFilterOperator;
export type ClientReturnHistoryCondition = ConditionFilterCondition<ClientReturnHistoryField>;

export type ClientReturnHistoryFilterState = {
  conditions: ClientReturnHistoryCondition[];
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

function nameEquals(value: string | null | undefined, name: string): boolean {
  return (value || '').trim().toLowerCase() === name.trim().toLowerCase();
}

function matchesTlApproved(row: PreviewClientReturn, name: string): boolean {
  if (row.returnType === 'refund') return false;
  return nameEquals(row.approvedByName, name);
}

function matchesSaApproved(row: PreviewClientReturn, name: string): boolean {
  if (row.returnType !== 'refund') return false;
  return nameEquals(row.saApprovedByName, name);
}

function matchesFinancePosted(row: PreviewClientReturn, name: string): boolean {
  if (row.returnType !== 'refund') return false;
  return nameEquals(row.approvedByName, name);
}

function matchesRejectedBy(row: PreviewClientReturn, name: string): boolean {
  return nameEquals(row.rejectedByName, name);
}

export function createHistoryFilterCondition(
  field: ClientReturnHistoryField,
  operator: ClientReturnHistoryOperator,
  value: string,
  dateBasis?: ClientReturnDateBasis
): ClientReturnHistoryCondition {
  return createConditionFilterCondition(
    field,
    operator,
    value,
    field === 'date' ? dateBasis || 'returnDate' : undefined
  );
}

function dateBasisLabel(basis?: string): string {
  if (basis === 'createdAt') return 'Filed date';
  if (basis === 'decisionAt') return 'Decision date';
  return 'Returned date';
}

export function buildClientReturnHistoryFilterFields(args: {
  counts: Record<ClientReturnHistoryStatusFilter, number>;
  typeCounts: Record<ClientReturnHistoryTypeFilter, number>;
  returnNumberOptions: string[];
  orderNumberOptions: string[];
  returnedByOptions: string[];
  tlApprovedOptions: string[];
  saApprovedOptions: string[];
  financePostedOptions: string[];
  rejectedByOptions: string[];
}): ConditionFilterFieldConfig<ClientReturnHistoryField>[] {
  const {
    counts,
    typeCounts,
    returnNumberOptions,
    orderNumberOptions,
    returnedByOptions,
    tlApprovedOptions,
    saApprovedOptions,
    financePostedOptions,
    rejectedByOptions,
  } = args;
  return [
    {
      key: 'returnNumber',
      label: 'Return Number',
      valueKind: 'text',
      placeholder: 'e.g. CR-0001',
      getOptions: () => returnNumberOptions.map((code) => ({ value: code, label: code })),
    },
    {
      key: 'orderNumber',
      label: 'Order Number',
      valueKind: 'text',
      placeholder: 'e.g. ORD-0001',
      getOptions: () => orderNumberOptions.map((code) => ({ value: code, label: code })),
    },
    {
      key: 'status',
      label: 'Status',
      valueKind: 'select',
      getOptions: () =>
        (
          [
            'open',
            'needs_action',
            'pending_leader',
            'pending_super_admin',
            'pending_finance',
            'posted',
            'rejected',
          ] as ClientReturnHistoryStatusFilter[]
        ).map((status) => ({
          value: status,
          label: `${clientReturnHistoryStatusLabel(status)} (${counts[status]})`,
        })),
      formatValue: (value) => clientReturnHistoryStatusLabel(value as ClientReturnHistoryStatusFilter),
    },
    {
      key: 'type',
      label: 'Type',
      valueKind: 'select',
      getOptions: () => [
        { value: 'change_item', label: `Change item (${typeCounts.change_item})` },
        { value: 'refund', label: `Refund (${typeCounts.refund})` },
      ],
      formatValue: (value) => formatClientReturnType(value as ClientReturnKind),
    },
    {
      key: 'reason',
      label: 'Reason',
      valueKind: 'select',
      getOptions: () => CLIENT_RETURN_REASON_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      formatValue: (value) => formatClientReturnReason(value),
    },
    {
      key: 'returnedBy',
      label: 'Returned by',
      valueKind: 'select',
      getOptions: () => returnedByOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'tlApproved',
      label: 'TL approved',
      valueKind: 'select',
      getOptions: () => tlApprovedOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'saApproved',
      label: 'SA approved',
      valueKind: 'select',
      getOptions: () => saApprovedOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'financePosted',
      label: 'Finance posted',
      valueKind: 'select',
      getOptions: () => financePostedOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'rejectedBy',
      label: 'Rejected by',
      valueKind: 'select',
      getOptions: () => rejectedByOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'date',
      label: 'Date',
      valueKind: 'date',
      defaultBasis: 'returnDate',
      bases: [
        { value: 'returnDate', label: 'Returned date' },
        { value: 'createdAt', label: 'Filed date' },
        { value: 'decisionAt', label: 'Decision date' },
      ],
      formatValue: (value, basis) => {
        const parsed = parseDateFromInput(value);
        const dateText = parsed && isValid(parsed) ? format(parsed, 'MMM d, yyyy') : value;
        return `${dateBasisLabel(basis)} · ${dateText}`;
      },
    },
  ];
}

function codeEquals(value: string | null | undefined, code: string): boolean {
  return (value || '').trim().toLowerCase() === code.trim().toLowerCase();
}

function matchesEqualityField(
  row: PreviewClientReturn,
  condition: ClientReturnHistoryCondition,
  role?: string | null
): boolean {
  if (condition.field === 'returnNumber') return codeEquals(row.returnNumber, condition.value);
  if (condition.field === 'orderNumber') return codeEquals(row.orderNumber, condition.value);
  if (condition.field === 'status') {
    return matchesClientReturnHistoryStatus(
      row,
      condition.value as ClientReturnHistoryStatusFilter,
      role
    );
  }
  if (condition.field === 'type') return row.returnType === condition.value;
  if (condition.field === 'reason') return matchesReason(row, condition.value);
  if (condition.field === 'returnedBy') return row.returnedByName.trim() === condition.value;
  if (condition.field === 'tlApproved') return matchesTlApproved(row, condition.value);
  if (condition.field === 'saApproved') return matchesSaApproved(row, condition.value);
  if (condition.field === 'financePosted') return matchesFinancePosted(row, condition.value);
  if (condition.field === 'rejectedBy') return matchesRejectedBy(row, condition.value);
  return true;
}

function matchesDateCondition(row: PreviewClientReturn, condition: ClientReturnHistoryCondition): boolean {
  const auditDate = getClientReturnAuditDate(row, (condition.basis as ClientReturnDateBasis) || 'returnDate');
  if (!auditDate) return false;
  const day = parseDateFromInput(condition.value);
  if (!day) return false;
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  if (condition.operator === 'lt') return isDateInRange(auditDate, undefined, new Date(start.getTime() - 1));
  if (condition.operator === 'gt') return isDateInRange(auditDate, new Date(end.getTime() + 1), undefined);
  return isDateInRange(auditDate, start, end);
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
  const conditionsPass = groupedConditionsPass(filters.conditions, {
    skip: (condition) =>
      Boolean((skip?.status && condition.field === 'status') || (skip?.type && condition.field === 'type')),
    isDateField: (field) => field === 'date',
    matchDate: (condition) => matchesDateCondition(row, condition),
    matchEquality: (condition) => matchesEqualityField(row, condition, filters.role),
  });
  return conditionsPass && matchesSearch(row, filters.search);
}

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function uniqueReturnNumbers(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.returnNumber));
}

export function uniqueOrderNumbers(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.orderNumber));
}

export function uniqueReturnedByNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.returnedByName));
}

export function uniqueTlApprovedNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(
    rows.filter((row) => row.returnType !== 'refund').map((row) => row.approvedByName)
  );
}

export function uniqueSaApprovedNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.saApprovedByName));
}

export function uniqueFinancePostedNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(
    rows.filter((row) => row.returnType === 'refund').map((row) => row.approvedByName)
  );
}

export function uniqueRejectedByNames(rows: PreviewClientReturn[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.rejectedByName));
}

export function clientReturnHistoryStatusLabel(status: ClientReturnHistoryStatusFilter): string {
  if (status === 'all') return 'All';
  if (status === 'open') return 'Open';
  if (status === 'needs_action') return 'Needs action';
  if (status === 'posted') return 'Posted';
  if (status === 'rejected') return 'Rejected';
  return formatClientReturnStatus(status);
}
