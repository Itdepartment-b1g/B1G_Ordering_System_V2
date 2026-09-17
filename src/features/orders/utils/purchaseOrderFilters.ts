import { format, isValid } from 'date-fns';
import { getDateRangeFromPreset, isDateInRange, parseDateFromInput } from '@/lib/dateRangePresets';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import { matchesQuickFilterAndClauses, type QuickFilterAndClause } from '@/features/shared/components/QuickFilterSheet';
import {
  groupedConditionsPass,
  type ConditionFilterCondition,
  type ConditionFilterFieldConfig,
} from '@/features/shared/utils/conditionFilters';
import type { PurchaseOrder } from '../types';
import { getPoCreatedByName, getPoFromLabel } from './purchaseOrderSorting';

export type PurchaseOrderStatusFilter =
  | 'all'
  | 'draft'
  | 'pending'
  | 'approved'
  | 'approved_for_fulfillment'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'rejected'
  | 'cancelled'
  | 'delivered';

export const PO_STATUS_FILTER_LABELS: Record<PurchaseOrderStatusFilter, string> = {
  all: 'All statuses',
  draft: 'Awaiting approval',
  pending: 'Pending',
  approved: 'Approved',
  approved_for_fulfillment: 'Approved for fulfillment',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  delivered: 'Delivered',
};

export const PO_STATUS_FILTER_OPTIONS: PurchaseOrderStatusFilter[] = [
  'all',
  'draft',
  'pending',
  'approved',
  'approved_for_fulfillment',
  'partially_fulfilled',
  'fulfilled',
  'rejected',
  'cancelled',
  'delivered',
];

export function purchaseOrderMatchesStatusFilter(
  order: Pick<PurchaseOrder, 'status'>,
  filter: PurchaseOrderStatusFilter
): boolean {
  if (filter === 'all') return true;
  return order.status === filter;
}

export type PurchaseOrderListField =
  | 'poNumber'
  | 'type'
  | 'from'
  | 'createdBy'
  | 'seller'
  | 'status'
  | 'date';
export type PurchaseOrderQuickColumn = 'poNumber' | 'type' | 'from' | 'createdBy' | 'seller';
export type PurchaseOrderListCondition = ConditionFilterCondition<PurchaseOrderListField>;
export type PurchaseOrderDateBasis = 'orderDate' | 'expectedDeliveryDate' | 'createdAt';

export type PurchaseOrderExtraFilters = {
  conditions: PurchaseOrderListCondition[];
  dateRange?: DateRangeFilterValue;
  columnClauses?: QuickFilterAndClause<PurchaseOrderQuickColumn>[];
  status?: PurchaseOrderStatusFilter;
};

const PO_TYPE_OPTIONS = [
  { value: 'warehouse_transfer', label: 'Internal' },
  { value: 'supplier', label: 'Supplier' },
] as const;

function uniqueSortedNames(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value) && value !== '—')
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nameEquals(value: string | null | undefined, name: string): boolean {
  return (value || '').trim().toLowerCase() === name.trim().toLowerCase();
}

export function uniquePoNumbers(orders: PurchaseOrder[]): string[] {
  return uniqueSortedNames(orders.map((order) => order.po_number));
}

export function uniquePoFromNames(orders: PurchaseOrder[]): string[] {
  return uniqueSortedNames(orders.map((order) => getPoFromLabel(order).primary));
}

export function uniquePoCreatedByNames(orders: PurchaseOrder[]): string[] {
  return uniqueSortedNames(orders.map((order) => getPoCreatedByName(order)));
}

export function uniquePoSellerNames(orders: PurchaseOrder[]): string[] {
  return uniqueSortedNames(orders.map((order) => order.supplier?.company_name));
}

function getPoTypeValue(order: PurchaseOrder): string {
  return order.fulfillment_type === 'warehouse_transfer' ? 'warehouse_transfer' : 'supplier';
}

function getPoAuditDate(order: PurchaseOrder, basis: PurchaseOrderDateBasis): string | null {
  if (basis === 'expectedDeliveryDate') return order.expected_delivery_date || null;
  if (basis === 'createdAt') return order.created_at || order.order_date || null;
  return order.order_date || order.created_at || null;
}

function matchesDateRange(order: PurchaseOrder, dateRange?: DateRangeFilterValue): boolean {
  if (!dateRange || dateRange.preset === 'all') return true;
  const { start, end } = getDateRangeFromPreset(dateRange.preset, dateRange.customStart, dateRange.customEnd);
  if (!start && !end) return true;
  const auditDate = getPoAuditDate(order, 'orderDate');
  if (!auditDate) return false;
  return isDateInRange(auditDate, start, end);
}

function matchesEqualityField(order: PurchaseOrder, condition: PurchaseOrderListCondition): boolean {
  if (condition.field === 'poNumber') return nameEquals(order.po_number, condition.value);
  if (condition.field === 'type') return getPoTypeValue(order) === condition.value;
  if (condition.field === 'from') return nameEquals(getPoFromLabel(order).primary, condition.value);
  if (condition.field === 'createdBy') return nameEquals(getPoCreatedByName(order), condition.value);
  if (condition.field === 'seller') return nameEquals(order.supplier?.company_name, condition.value);
  if (condition.field === 'status') {
    return purchaseOrderMatchesStatusFilter(order, condition.value as PurchaseOrderStatusFilter);
  }
  return true;
}

function matchesQuickColumn(
  order: PurchaseOrder,
  field?: PurchaseOrderQuickColumn | 'all',
  value?: string
): boolean {
  const selected = (value || '').trim();
  if (!field || field === 'all' || !selected) return true;
  return matchesEqualityField(order, { id: 'quick', field, operator: 'eq', value: selected });
}

function matchesDateCondition(order: PurchaseOrder, condition: PurchaseOrderListCondition): boolean {
  const auditDate = getPoAuditDate(order, (condition.basis as PurchaseOrderDateBasis) || 'orderDate');
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

export function matchesPurchaseOrderExtraFilters(
  order: PurchaseOrder,
  filters: PurchaseOrderExtraFilters
): boolean {
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
  return purchaseOrderMatchesStatusFilter(order, filters.status || 'all');
}

function dateBasisLabel(basis?: string): string {
  if (basis === 'expectedDeliveryDate') return 'Expected delivery';
  if (basis === 'createdAt') return 'Created date';
  return 'Order date';
}

export function buildPurchaseOrderFilterFields(args: {
  poNumbers: string[];
  fromNames: string[];
  createdByNames: string[];
  sellerNames: string[];
  includeFrom?: boolean;
  includeCreatedBy?: boolean;
}): ConditionFilterFieldConfig<PurchaseOrderListField>[] {
  const {
    poNumbers,
    fromNames,
    createdByNames,
    sellerNames,
    includeFrom = true,
    includeCreatedBy = true,
  } = args;
  const fields: ConditionFilterFieldConfig<PurchaseOrderListField>[] = [
    {
      key: 'poNumber',
      label: 'PO Number',
      valueKind: 'text',
      placeholder: 'e.g. PO-0001',
      getOptions: () => poNumbers.map((value) => ({ value, label: value })),
    },
    {
      key: 'type',
      label: 'Type',
      valueKind: 'select',
      getOptions: () => PO_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    },
  ];
  if (includeFrom) {
    fields.push({
      key: 'from',
      label: 'From',
      valueKind: 'select',
      getOptions: () => fromNames.map((value) => ({ value, label: value })),
    });
  }
  if (includeCreatedBy) {
    fields.push({
      key: 'createdBy',
      label: 'Created by',
      valueKind: 'select',
      getOptions: () => createdByNames.map((value) => ({ value, label: value })),
    });
  }
  fields.push(
    {
      key: 'seller',
      label: 'Seller',
      valueKind: 'select',
      getOptions: () => sellerNames.map((value) => ({ value, label: value })),
    },
    {
      key: 'status',
      label: 'Status',
      valueKind: 'select',
      getOptions: () =>
        PO_STATUS_FILTER_OPTIONS.filter((status) => status !== 'all').map((status) => ({
          value: status,
          label: PO_STATUS_FILTER_LABELS[status],
        })),
    },
    {
      key: 'date',
      label: 'Date',
      valueKind: 'date',
      defaultBasis: 'orderDate',
      bases: [
        { value: 'orderDate', label: 'Order date' },
        { value: 'expectedDeliveryDate', label: 'Expected delivery' },
        { value: 'createdAt', label: 'Created date' },
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
