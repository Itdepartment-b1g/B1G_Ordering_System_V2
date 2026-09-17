import { useState, type ReactNode } from 'react';
import { Filter, FilterX, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  conditionFilterOperatorLabel,
  createConditionFilterCondition,
  isDuplicateCondition,
  operatorsForConditionField,
  type ConditionFilterCondition,
  type ConditionFilterFieldConfig,
  type ConditionFilterOperator,
  type ConditionFilterOption,
} from '@/features/shared/utils/conditionFilters';

function CompactSelect({
  value,
  onChange,
  placeholder,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: ConditionFilterOption[];
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

type ConditionFilterSheetProps<TField extends string> = {
  fields: ConditionFilterFieldConfig<TField>[];
  conditions: ConditionFilterCondition<TField>[];
  onAddCondition: (condition: ConditionFilterCondition<TField>) => void;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
  title?: string;
  description?: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

export function ConditionFilterSheet<TField extends string>({
  fields,
  conditions,
  onAddCondition,
  onRemoveCondition,
  onClear,
  title = 'Conditioned Filter',
  description = 'Same-field values use OR. Different fields use AND.',
  triggerLabel = 'Conditioned Filter',
  triggerClassName,
}: ConditionFilterSheetProps<TField>) {
  const [open, setOpen] = useState(false);
  const [fieldKey, setFieldKey] = useState<TField | ''>('');
  const [operator, setOperator] = useState<ConditionFilterOperator | ''>('');
  const [value, setValue] = useState('');
  const [basis, setBasis] = useState('');

  const selectedField = fields.find((field) => field.key === fieldKey);
  const operatorOptions = selectedField ? operatorsForConditionField(selectedField) : [];
  const valueOptions = selectedField?.getOptions?.() ?? [];
  const panelCount = conditions.length;

  const resetDraft = () => {
    setFieldKey('');
    setOperator('');
    setValue('');
    setBasis('');
  };

  const applyField = (nextKey: TField) => {
    const nextField = fields.find((field) => field.key === nextKey);
    setFieldKey(nextKey);
    setOperator('');
    setValue('');
    setBasis(nextField?.defaultBasis || nextField?.bases?.[0]?.value || '');
  };

  const canAdd = Boolean(fieldKey && operator && value.trim());

  const handleAdd = () => {
    if (!fieldKey || !operator || !value.trim() || !selectedField) return;
    const next = createConditionFilterCondition(
      fieldKey,
      operator,
      value,
      selectedField.bases?.length ? basis || selectedField.defaultBasis : undefined
    );
    if (!isDuplicateCondition(conditions, next)) onAddCondition(next);
    resetDraft();
  };

  const fieldLabel = (key: TField) => fields.find((field) => field.key === key)?.label ?? key;

  const conditionValueLabel = (condition: ConditionFilterCondition<TField>) => {
    const field = fields.find((item) => item.key === condition.field);
    if (field?.formatValue) return field.formatValue(condition.value, condition.basis);
    if (field?.valueKind === 'select') {
      return field.getOptions?.().find((option) => option.value === condition.value)?.label ?? condition.value;
    }
    return condition.value;
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetDraft();
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={panelCount > 0 ? 'default' : 'outline'}
          size="sm"
          className={triggerClassName ?? 'h-9 gap-1.5 shrink-0 flex-1 sm:flex-none'}
        >
          <Filter className="h-4 w-4" />
          {triggerLabel}
          {panelCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/20 px-1.5 text-[11px] font-semibold tabular-nums">
              {panelCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-4 py-3 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <SheetTitle className="text-base">{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </div>
            {panelCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
                <FilterX className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            ) : null}
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          {conditions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {conditions.map((condition) => (
                <span
                  key={condition.id}
                  className="inline-flex h-8 max-w-full items-center overflow-hidden rounded-full border bg-background text-xs"
                >
                  <span className="min-w-0 truncate px-2.5">
                    <span className="text-muted-foreground">{fieldLabel(condition.field)}</span>{' '}
                    <span className="font-medium">
                      {conditionFilterOperatorLabel(condition.operator)} {conditionValueLabel(condition)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="h-8 shrink-0 border-l px-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    aria-label={`Remove ${fieldLabel(condition.field)} filter`}
                    onClick={() => onRemoveCondition(condition.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <FilterSection title="1. Field">
            <CompactSelect
              value={fieldKey}
              onChange={(next) => applyField(next as TField)}
              placeholder="Select field"
              items={fields.map((field) => ({ value: field.key, label: field.label }))}
            />
          </FilterSection>
          {selectedField ? (
            <FilterSection title="2. Operator">
              <CompactSelect
                value={operator}
                onChange={(next) => {
                  setOperator(next as ConditionFilterOperator);
                  setValue('');
                }}
                placeholder="Select operator"
                items={operatorOptions}
              />
            </FilterSection>
          ) : null}
          {selectedField?.bases?.length && operator ? (
            <FilterSection title="Date field">
              <CompactSelect
                value={basis}
                onChange={setBasis}
                placeholder="Select date field"
                items={selectedField.bases}
              />
            </FilterSection>
          ) : null}
          {selectedField && operator ? (
            <FilterSection title="3. Value">
              {selectedField.valueKind === 'date' ? (
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  className="h-9"
                />
              ) : selectedField.valueKind === 'text' ? (
                <div className="space-y-2">
                  <Input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={selectedField.placeholder ?? 'Enter value'}
                    className="h-9"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAdd();
                      }
                    }}
                  />
                  {valueOptions.length > 0 ? (
                    <>
                      <p className="text-[11px] text-muted-foreground">or pick from list</p>
                      <CompactSelect
                        value={valueOptions.some((option) => option.value === value) ? value : ''}
                        onChange={setValue}
                        placeholder="Select code number"
                        items={valueOptions}
                      />
                    </>
                  ) : null}
                </div>
              ) : (
                <CompactSelect
                  value={value}
                  onChange={setValue}
                  placeholder="Select value"
                  items={valueOptions}
                />
              )}
            </FilterSection>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
          <Button type="button" size="sm" className="h-8" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
