import { useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, FilterX, ListFilter, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { cn } from '@/lib/utils';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';

export type QuickFilterOption = {
  value: string;
  label: string;
};

export type QuickFilterColumn<T extends string> = {
  key: T;
  label: string;
  options: QuickFilterOption[];
  searchPlaceholder?: string;
};

export type QuickFilterAndClause<T extends string = string> = {
  id: string;
  field: T | 'all';
  value: string;
};

export function createQuickFilterAndClause<T extends string>(
  field: T | 'all' = 'all',
  value = ''
): QuickFilterAndClause<T> {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${String(field)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, field, value };
}

export function isQuickFilterAndClauseActive<T extends string>(clause: QuickFilterAndClause<T>): boolean {
  return clause.field !== 'all' && Boolean(clause.value.trim());
}

function quickFilterClauseJoiner<T extends string>(
  previous: QuickFilterAndClause<T> | undefined,
  next: QuickFilterAndClause<T>
): 'AND' | 'OR' {
  if (!previous) return 'AND';
  if (previous.field === 'all' || next.field === 'all') return 'AND';
  return previous.field === next.field ? 'OR' : 'AND';
}

export function matchesQuickFilterAndClauses<T extends string>(
  clauses: QuickFilterAndClause<T>[] | undefined,
  match: (field: T, value: string) => boolean
): boolean {
  if (!clauses?.length) return true;
  const grouped = new Map<T, string[]>();
  for (const clause of clauses) {
    if (!isQuickFilterAndClauseActive(clause)) continue;
    const field = clause.field as T;
    const values = grouped.get(field) || [];
    values.push(clause.value.trim());
    grouped.set(field, values);
  }
  if (grouped.size === 0) return true;
  for (const [field, values] of grouped) {
    if (!values.some((value) => match(field, value))) return false;
  }
  return true;
}

export function countActiveQuickFilterAndClauses<T extends string>(
  clauses: QuickFilterAndClause<T>[] | undefined
): number {
  return (clauses || []).filter(isQuickFilterAndClauseActive).length;
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel = 'Any',
}: {
  value: string;
  options: QuickFilterOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[80]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={emptyLabel}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                {emptyLabel}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type QuickFilterSheetProps<TColumn extends string, TStatus extends string> = {
  dateRange: DateRangeFilterValue;
  onDateRangeChange: (value: DateRangeFilterValue) => void;
  columns: QuickFilterColumn<TColumn>[];
  columnClauses: QuickFilterAndClause<TColumn>[];
  onColumnClausesChange: (clauses: QuickFilterAndClause<NoInfer<TColumn>>[]) => void;
  status: TStatus;
  statusOptions: Array<{ value: TStatus; label: string; count?: number }>;
  onStatusChange: (value: NoInfer<TStatus>) => void;
  onClear: () => void;
  title?: string;
  description?: string;
  triggerLabel?: string;
  triggerClassName?: string;
};

export function QuickFilterSheet<TColumn extends string, TStatus extends string>({
  dateRange,
  onDateRangeChange,
  columns,
  columnClauses,
  onColumnClausesChange,
  status,
  statusOptions,
  onStatusChange,
  onClear,
  title = 'Quick Filter',
  description = 'Same-column values use OR. Different columns use AND.',
  triggerLabel = 'Quick Filter',
  triggerClassName,
}: QuickFilterSheetProps<TColumn, TStatus>) {
  const [open, setOpen] = useState(false);
  const rows = columnClauses.length > 0 ? columnClauses : [createQuickFilterAndClause<TColumn>()];
  const dateActive = dateRange.preset !== 'all';
  const columnActiveCount = countActiveQuickFilterAndClauses(rows);
  const idleStatus = statusOptions[0]?.value;
  const statusActive = Boolean(idleStatus && status !== idleStatus);
  const activeCount = Number(dateActive) + columnActiveCount + Number(statusActive);
  const canAddAnd = isQuickFilterAndClauseActive(rows[rows.length - 1]);

  const updateClause = (id: string, patch: Partial<QuickFilterAndClause<TColumn>>) => {
    const next = rows.map((clause) => (clause.id === id ? { ...clause, ...patch } : clause));
    onColumnClausesChange(next);
  };

  const addAndClause = () => {
    if (!canAddAnd) return;
    const last = rows[rows.length - 1];
    onColumnClausesChange([...rows, createQuickFilterAndClause<TColumn>(last?.field ?? 'all')]);
  };

  const removeClause = (id: string) => {
    const next = rows.filter((clause) => clause.id !== id);
    onColumnClausesChange(next.length > 0 ? next : [createQuickFilterAndClause<TColumn>()]);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={activeCount > 0 ? 'default' : 'outline'}
          size="sm"
          className={triggerClassName ?? 'h-9 gap-1.5 shrink-0 flex-1 sm:flex-none'}
        >
          <ListFilter className="h-4 w-4" />
          {triggerLabel}
          {activeCount > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/20 px-1.5 text-[11px] font-semibold tabular-nums">
              {activeCount}
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
            {activeCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
                <FilterX className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            ) : null}
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          <FilterSection title="Date">
            <DateRangeFilterPopover
              value={dateRange}
              onChange={onDateRangeChange}
              className="w-[360px] p-0 z-[80]"
              triggerClassName="h-9 w-full justify-between"
              align="start"
              modal
            />
          </FilterSection>
          <FilterSection title="Column">
            <div className="space-y-2">
              {rows.map((clause, index) => {
                const selectedColumn = columns.find((column) => column.key === clause.field);
                const joiner = quickFilterClauseJoiner(rows[index - 1], clause);
                return (
                  <div key={clause.id} className="space-y-2">
                    {index > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {joiner}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Select
                          value={clause.field}
                          onValueChange={(next) =>
                            updateClause(clause.id, { field: next as TColumn | 'all', value: '' })
                          }
                        >
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent className="z-[80]">
                            <SelectItem value="all">All columns</SelectItem>
                            {columns.map((column) => (
                              <SelectItem key={column.key} value={column.key}>
                                {column.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedColumn ? (
                          <SearchableSelect
                            value={clause.value}
                            options={selectedColumn.options}
                            onChange={(value) => updateClause(clause.id, { value })}
                            placeholder={`Select ${selectedColumn.label.toLowerCase()}`}
                            searchPlaceholder={
                              selectedColumn.searchPlaceholder ?? `Search ${selectedColumn.label.toLowerCase()}...`
                            }
                          />
                        ) : null}
                      </div>
                      {rows.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground"
                          aria-label="Remove condition"
                          onClick={() => removeClause(clause.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={!canAddAnd}
                onClick={addAndClause}
              >
                <Plus className="h-3.5 w-3.5" />
                AND
              </Button>
            </div>
          </FilterSection>
          <FilterSection title="Status">
            <Select value={status} onValueChange={(next) => onStatusChange(next as TStatus)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.count != null ? ` (${option.count})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button type="button" size="sm" className="h-8" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
