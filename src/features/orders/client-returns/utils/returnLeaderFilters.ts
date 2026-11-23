import { format, isValid } from 'date-fns';
import { getDateRangeFromPreset, isDateInRange, parseDateFromInput } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import { matchesQuickFilterAndClauses, type QuickFilterAndClause } from '@/features/shared/components/QuickFilterSheet';
import {
  groupedConditionsPass,
  type ConditionFilterCondition,
  type ConditionFilterFieldConfig,
} from '@/features/shared/utils/conditionFilters';
import {
  returnLeaderStatusLabel,
  type ReturnLeaderHandover,
  type ReturnLeaderStatus,
} from '../returnLeaderApi';

export type ReturnLeaderFilterField = 'returnNumber' | 'status' | 'submittedBy' | 'date';
export type ReturnLeaderQuickColumn = 'returnNumber' | 'submittedBy';
export type ReturnLeaderFilterCondition = ConditionFilterCondition<ReturnLeaderFilterField>;

export type ReturnLeaderFilterState = {
  conditions: ReturnLeaderFilterCondition[];
  search: string;
  status?: 'all' | ReturnLeaderStatus;
  dateRange?: DateRangeFilterValue;
  columnClauses?: QuickFilterAndClause<ReturnLeaderQuickColumn>[];
};

const STATUS_OPTIONS: ReturnLeaderStatus[] = [
  'pending_leader',
  'pending_super_admin',
  'received',
  'rejected',
  'cancelled',
];

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function uniqueSubmittedByNames(rows: ReturnLeaderHandover[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.submittedByName));
}

export function uniqueReturnNumbers(rows: ReturnLeaderHandover[]): string[] {
  return uniqueSortedNames(rows.map((row) => row.returnNumber));
}

export function buildReturnLeaderFilterFields(args: {
  counts: Record<ReturnLeaderStatus, number>;
  submittedByOptions: string[];
  returnNumberOptions: string[];
}): ConditionFilterFieldConfig<ReturnLeaderFilterField>[] {
  const { counts, submittedByOptions, returnNumberOptions } = args;
  return [
    {
      key: 'returnNumber',
      label: 'RL Number',
      valueKind: 'text',
      placeholder: 'e.g. RL-0001',
      getOptions: () => returnNumberOptions.map((code) => ({ value: code, label: code })),
    },
    {
      key: 'status',
      label: 'Status',
      valueKind: 'select',
      getOptions: () =>
        STATUS_OPTIONS.map((status) => ({
          value: status,
          label: `${returnLeaderStatusLabel(status)} (${counts[status]})`,
        })),
      formatValue: (value) => returnLeaderStatusLabel(value as ReturnLeaderStatus),
    },
    {
      key: 'submittedBy',
      label: 'Submitted by',
      valueKind: 'select',
      getOptions: () => submittedByOptions.map((name) => ({ value: name, label: name })),
    },
    {
      key: 'date',
      label: 'Submitted',
      valueKind: 'date',
      formatValue: (value) => {
        const parsed = parseDateFromInput(value);
        return parsed && isValid(parsed) ? format(parsed, 'MMM d, yyyy') : value;
      },
    },
  ];
}

function matchesEqualityField(row: ReturnLeaderHandover, condition: ReturnLeaderFilterCondition): boolean {
  if (condition.field === 'returnNumber') {
    return row.returnNumber.trim().toLowerCase() === condition.value.trim().toLowerCase();
  }
  if (condition.field === 'status') return row.status === condition.value;
  if (condition.field === 'submittedBy') return row.submittedByName.trim() === condition.value;
  return true;
}

function matchesDateCondition(row: ReturnLeaderHandover, condition: ReturnLeaderFilterCondition): boolean {
  if (!row.createdAt) return false;
  const day = parseDateFromInput(condition.value);
  if (!day) return false;
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  if (condition.operator === 'lt') return isDateInRange(row.createdAt, undefined, new Date(start.getTime() - 1));
  if (condition.operator === 'gt') return isDateInRange(row.createdAt, new Date(end.getTime() + 1), undefined);
  return isDateInRange(row.createdAt, start, end);
}

function matchesSearch(row: ReturnLeaderHandover, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    row.returnNumber,
    row.submittedByName,
    row.notes || '',
    row.approvedByName || '',
    row.rejectedByName || '',
    row.rejectionNote || '',
    returnLeaderStatusLabel(row.status),
    ...row.lines.map((line) => `${line.brandName} ${line.variantName}`),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function matchesReturnLeaderFilters(
  row: ReturnLeaderHandover,
  filters: ReturnLeaderFilterState,
  skip?: { status?: boolean }
): boolean {
  const conditionsPass = groupedConditionsPass(filters.conditions, {
    skip: (condition) => Boolean(skip?.status && condition.field === 'status'),
    isDateField: (field) => field === 'date',
    matchDate: (condition) => matchesDateCondition(row, condition),
    matchEquality: (condition) => matchesEqualityField(row, condition),
  });
  if (!conditionsPass) return false;
  if (!skip?.status && filters.status && filters.status !== 'all' && row.status !== filters.status) {
    return false;
  }
  if (filters.dateRange && filters.dateRange.preset !== 'all') {
    const { start, end } = getDateRangeFromPreset(
      filters.dateRange.preset,
      filters.dateRange.customStart,
      filters.dateRange.customEnd
    );
    if ((start || end) && (!row.createdAt || !isDateInRange(row.createdAt, start, end))) {
      return false;
    }
  }
  if (
    !matchesQuickFilterAndClauses(filters.columnClauses, (field, value) =>
      matchesEqualityField(row, {
        id: 'quick',
        field,
        operator: 'eq',
        value,
      })
    )
  ) {
    return false;
  }
  return matchesSearch(row, filters.search);
}
