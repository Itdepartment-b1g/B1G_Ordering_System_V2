import { format, isValid } from 'date-fns';
import { getDateRangeFromPreset, isDateInRange, parseDateFromInput } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import { matchesQuickFilterAndClauses, type QuickFilterAndClause } from '@/features/shared/components/QuickFilterSheet';
import {
  groupedConditionsPass,
  type ConditionFilterCondition,
  type ConditionFilterFieldConfig,
} from '@/features/shared/utils/conditionFilters';
import type { Order } from '../OrderContext';

export type OrderListField = 'orderNumber' | 'client' | 'agent' | 'paymentMethod' | 'status' | 'date';
export type OrderListQuickColumn = 'orderNumber' | 'client' | 'agent' | 'paymentMethod';
export type OrderListQuickStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'needs_revision';
export type OrderListDateBasis = 'date' | 'createdAt' | 'approvedAt';
export type OrderListCondition = ConditionFilterCondition<OrderListField>;

export const ORDER_PAYMENT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'GCASH', label: 'GCash' },
] as const;

export const ORDER_LIST_STATUS_LABELS: Record<OrderListQuickStatus, string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  needs_revision: 'Needs revision',
};

export type OrderListExtraFilters = {
  conditions: OrderListCondition[];
  dateRange?: DateRangeFilterValue;
  columnClauses?: QuickFilterAndClause<OrderListQuickColumn>[];
  status?: OrderListQuickStatus;
};

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nameEquals(value: string | null | undefined, name: string): boolean {
  return (value || '').trim().toLowerCase() === name.trim().toLowerCase();
}

export function uniqueOrderNumbers(orders: Order[]): string[] {
  return uniqueSortedNames(orders.map((order) => order.orderNumber));
}

export function uniqueOrderClientNames(orders: Order[]): string[] {
  return uniqueSortedNames(orders.map((order) => order.clientName));
}

export function uniqueOrderAgentNames(orders: Order[]): string[] {
  return uniqueSortedNames(orders.map((order) => order.agentName));
}

export function orderMatchesPaymentMethodValue(order: Order, method: string): boolean {
  if (!method || method === 'all') return true;
  if (order.paymentMode !== 'SPLIT') return order.paymentMethod === method;
  if (Array.isArray(order.paymentSplits)) {
    return order.paymentSplits.some((split) => split.method === method);
  }
  return false;
}

export function orderMatchesQuickStatus(order: Order, status?: OrderListQuickStatus): boolean {
  if (!status || status === 'all') return true;
  if (status === 'needs_revision') return order.stage === 'needs_revision';
  if (status === 'pending') {
    return (
      (order.status === 'pending' && order.stage !== 'needs_revision') ||
      order.stage === 'finance_pending'
    );
  }
  if (status === 'approved') {
    return order.status === 'approved' || order.stage === 'admin_approved';
  }
  if (status === 'rejected') {
    return (
      order.status === 'rejected' ||
      order.stage === 'leader_rejected' ||
      order.stage === 'admin_rejected'
    );
  }
  return true;
}

function getOrderAuditDate(order: Order, basis: OrderListDateBasis): string | null {
  if (basis === 'createdAt') return order.createdAt || order.date || null;
  if (basis === 'approvedAt') return order.approvedAt || null;
  return order.date || order.createdAt || null;
}

function matchesDateRange(order: Order, dateRange?: DateRangeFilterValue): boolean {
  if (!dateRange || dateRange.preset === 'all') return true;
  const { start, end } = getDateRangeFromPreset(dateRange.preset, dateRange.customStart, dateRange.customEnd);
  if (!start && !end) return true;
  const auditDate = getOrderAuditDate(order, 'date');
  if (!auditDate) return false;
  return isDateInRange(auditDate, start, end);
}

function matchesEqualityField(order: Order, condition: OrderListCondition): boolean {
  if (condition.field === 'orderNumber') return nameEquals(order.orderNumber, condition.value);
  if (condition.field === 'client') return nameEquals(order.clientName, condition.value);
  if (condition.field === 'agent') return nameEquals(order.agentName, condition.value);
  if (condition.field === 'paymentMethod') return orderMatchesPaymentMethodValue(order, condition.value);
  if (condition.field === 'status') {
    return orderMatchesQuickStatus(order, condition.value as OrderListQuickStatus);
  }
  return true;
}

function matchesQuickColumn(
  order: Order,
  field?: OrderListQuickColumn | 'all',
  value?: string
): boolean {
  const selected = (value || '').trim();
  if (!field || field === 'all' || !selected) return true;
  return matchesEqualityField(order, { id: 'quick', field, operator: 'eq', value: selected });
}

function matchesDateCondition(order: Order, condition: OrderListCondition): boolean {
  const auditDate = getOrderAuditDate(order, (condition.basis as OrderListDateBasis) || 'date');
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

export function matchesOrderListExtraFilters(order: Order, filters: OrderListExtraFilters): boolean {
  const conditionsPass = groupedConditionsPass(filters.conditions, {
    isDateField: (field) => field === 'date',
    matchDate: (condition) => matchesDateCondition(order, condition),
    matchEquality: (condition) => matchesEqualityField(order, condition),
  });
  if (!conditionsPass) return false;
  if (!matchesDateRange(order, filters.dateRange)) return false;
  if (
    !matchesQuickFilterAndClauses(filters.columnClauses, (field, value) =>
      matchesQuickColumn(order, field, value)
    )
  ) {
    return false;
  }
  return orderMatchesQuickStatus(order, filters.status);
}

function dateBasisLabel(basis?: string): string {
  if (basis === 'createdAt') return 'Created date';
  if (basis === 'approvedAt') return 'Approved date';
  return 'Order date';
}

export function buildOrderListFilterFields(args: {
  orderNumbers: string[];
  clientNames: string[];
  agentNames?: string[];
  includeAgent?: boolean;
}): ConditionFilterFieldConfig<OrderListField>[] {
  const { orderNumbers, clientNames, agentNames = [], includeAgent = true } = args;
  const fields: ConditionFilterFieldConfig<OrderListField>[] = [
    {
      key: 'orderNumber',
      label: 'Order Number',
      valueKind: 'text',
      placeholder: 'e.g. ORD-0001',
      getOptions: () => orderNumbers.map((value) => ({ value, label: value })),
    },
    {
      key: 'client',
      label: 'Client',
      valueKind: 'select',
      getOptions: () => clientNames.map((value) => ({ value, label: value })),
    },
  ];
  if (includeAgent) {
    fields.push({
      key: 'agent',
      label: 'Sales Agent',
      valueKind: 'select',
      getOptions: () => agentNames.map((value) => ({ value, label: value })),
    });
  }
  fields.push(
    {
      key: 'paymentMethod',
      label: 'Payment',
      valueKind: 'select',
      getOptions: () => ORDER_PAYMENT_METHOD_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    },
    {
      key: 'status',
      label: 'Status',
      valueKind: 'select',
      getOptions: () =>
        (['pending', 'approved', 'rejected', 'needs_revision'] as const).map((status) => ({
          value: status,
          label: ORDER_LIST_STATUS_LABELS[status],
        })),
    },
    {
      key: 'date',
      label: 'Date',
      valueKind: 'date',
      defaultBasis: 'date',
      bases: [
        { value: 'date', label: 'Order date' },
        { value: 'createdAt', label: 'Created date' },
        { value: 'approvedAt', label: 'Approved date' },
      ],
      formatValue: (value, basis) => {
        const parsed = parseDateFromInput(value);
        const dateText = parsed && isValid(parsed) ? format(parsed, 'MMM d, yyyy') : value;
        return `${dateBasisLabel(basis)} · ${dateText}`;
      },
    }
  );
  return fields;
}
