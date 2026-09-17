export type ConditionFilterOperator = 'eq' | 'neq' | 'lt' | 'gt' | 'or';
export type ConditionFilterValueKind = 'select' | 'date' | 'text';

export type ConditionFilterCondition<TField extends string = string> = {
  id: string;
  field: TField;
  operator: ConditionFilterOperator;
  value: string;
  /** Extra qualifier, e.g. which date column to compare. */
  basis?: string;
};

export type ConditionFilterOption = {
  value: string;
  label: string;
};

export type ConditionFilterFieldConfig<TField extends string = string> = {
  key: TField;
  label: string;
  valueKind: ConditionFilterValueKind;
  operators?: Array<{ value: ConditionFilterOperator; label: string }>;
  bases?: ConditionFilterOption[];
  defaultBasis?: string;
  getOptions?: () => ConditionFilterOption[];
  formatValue?: (value: string, basis?: string) => string;
  placeholder?: string;
};

export const SELECT_CONDITION_OPERATORS: Array<{ value: ConditionFilterOperator; label: string }> = [
  { value: 'eq', label: '= (is equal)' },
  { value: 'neq', label: '≠ (is not equal)' },
  { value: 'or', label: '|| (or)' },
];

export const DATE_CONDITION_OPERATORS: Array<{ value: ConditionFilterOperator; label: string }> = [
  { value: 'eq', label: '= (is equal)' },
  { value: 'lt', label: '< (is less than)' },
  { value: 'gt', label: '> (is greater than)' },
];

export function conditionFilterOperatorLabel(operator: ConditionFilterOperator): string {
  if (operator === 'eq') return 'is equal';
  if (operator === 'neq') return 'is not equal';
  if (operator === 'lt') return 'is less than';
  if (operator === 'gt') return 'is greater than';
  return 'or';
}

export function operatorsForConditionField<TField extends string>(
  field: ConditionFilterFieldConfig<TField>
): Array<{ value: ConditionFilterOperator; label: string }> {
  if (field.operators?.length) return field.operators;
  return field.valueKind === 'date' ? DATE_CONDITION_OPERATORS : SELECT_CONDITION_OPERATORS;
}

export function createConditionFilterCondition<TField extends string>(
  field: TField,
  operator: ConditionFilterOperator,
  value: string,
  basis?: string
): ConditionFilterCondition<TField> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${field}-${operator}-${value}-${Date.now()}`;
  return { id, field, operator, value: value.trim(), basis };
}

export function isDuplicateCondition<TField extends string>(
  conditions: ConditionFilterCondition<TField>[],
  next: ConditionFilterCondition<TField>
): boolean {
  return conditions.some(
    (condition) =>
      condition.field === next.field &&
      condition.operator === next.operator &&
      condition.value === next.value &&
      (condition.basis ?? '') === (next.basis ?? '')
  );
}

export function groupedConditionsPass<TField extends string>(
  conditions: ConditionFilterCondition<TField>[],
  handlers: {
    skip?: (condition: ConditionFilterCondition<TField>) => boolean;
    isDateField: (field: TField) => boolean;
    matchDate: (condition: ConditionFilterCondition<TField>) => boolean;
    matchEquality: (condition: ConditionFilterCondition<TField>) => boolean;
  }
): boolean {
  const grouped = new Map<TField, ConditionFilterCondition<TField>[]>();
  for (const condition of conditions) {
    if (handlers.skip?.(condition)) continue;
    const list = grouped.get(condition.field) || [];
    list.push(condition);
    grouped.set(condition.field, list);
  }

  for (const [field, fieldConditions] of grouped) {
    if (handlers.isDateField(field)) {
      if (!fieldConditions.every((condition) => handlers.matchDate(condition))) return false;
      continue;
    }
    const positive = fieldConditions.filter((condition) => condition.operator === 'eq' || condition.operator === 'or');
    const negative = fieldConditions.filter((condition) => condition.operator === 'neq');
    if (positive.length > 0 && !positive.some((condition) => handlers.matchEquality(condition))) {
      return false;
    }
    if (negative.length > 0 && !negative.every((condition) => !handlers.matchEquality(condition))) {
      return false;
    }
  }

  return true;
}
