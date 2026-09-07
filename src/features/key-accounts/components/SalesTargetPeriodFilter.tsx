import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  type DatePreset,
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
  parseDateFromInput,
} from '@/lib/dateRangePresets';
import { cn } from '@/lib/utils';

/** Period filter value for Key Account sales targets planning. */
export type SalesTargetPeriodValue = {
  preset: DatePreset;
  customStart?: Date;
  customEnd?: Date;
};

const PLAN_PRESETS: { key: Exclude<DatePreset, 'custom'>; label: string }[] = [
  { key: 'this_month', label: 'This Month' },
  { key: 'next_month', label: 'Next Month' },
  { key: 'next_3_months', label: 'In 3 Months' },
];

type SalesTargetPlanFilterProps = {
  value: SalesTargetPeriodValue;
  onChange: (value: SalesTargetPeriodValue) => void;
  /** When true, this filter drives the table view */
  active?: boolean;
  onActivate?: () => void;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
};

/**
 * Plan-only period filter for Sales Targets (upcoming months).
 * Review uses shared DateRangeFilterPopover — do not change that component.
 */
export function SalesTargetPeriodFilter({
  value,
  onChange,
  active = false,
  onActivate,
  className,
  triggerClassName,
  align = 'end',
}: SalesTargetPlanFilterProps) {
  const [open, setOpen] = useState(false);
  const { preset, customStart, customEnd } = value;

  const handlePresetChange = (next: DatePreset) => {
    onChange({ preset: next, customStart: undefined, customEnd: undefined });
    onActivate?.();
    setOpen(false);
  };

  const periodLabel = getDatePresetLabel(preset, customStart, customEnd);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onActivate?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={active ? 'default' : 'outline'}
          className={cn('w-full justify-between h-10 shrink-0', triggerClassName)}
          onClick={() => onActivate?.()}
        >
          <div className="flex items-center gap-2 truncate min-w-0 flex-1 text-left">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">{periodLabel}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={className ?? 'w-[320px] p-0'} align={align}>
        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Plan
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PLAN_PRESETS.map(({ key, label: text }) => (
                <Button
                  key={key}
                  type="button"
                  variant={preset === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetChange(key)}
                  className={`justify-center h-9${key === 'next_3_months' ? ' col-span-2' : ''}`}
                >
                  {text}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Range
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sales-target-plan-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="sales-target-plan-from"
                  type="date"
                  value={formatDateForInput(customStart)}
                  onChange={(e) => {
                    const date = parseDateFromInput(e.target.value);
                    onChange({
                      preset: date && customEnd ? 'custom' : preset,
                      customStart: date,
                      customEnd,
                    });
                    onActivate?.();
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sales-target-plan-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="sales-target-plan-to"
                  type="date"
                  value={formatDateForInput(customEnd)}
                  onChange={(e) => {
                    const date = parseDateFromInput(e.target.value);
                    onChange({
                      preset: customStart && date ? 'custom' : preset,
                      customStart,
                      customEnd: date,
                    });
                    onActivate?.();
                  }}
                  className="h-9"
                />
              </div>
            </div>
            {customStart && customEnd && (
              <Button
                type="button"
                variant={preset === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onChange({ preset: 'custom', customStart, customEnd });
                  onActivate?.();
                  setOpen(false);
                }}
                className="w-full h-9"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Apply Custom Range
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Calendar months (YYYY-MM) covered by a period filter value. */
export function monthsInSalesTargetPeriod(
  filter: SalesTargetPeriodValue,
  toMonthValue: (d?: Date) => string
): string[] {
  const { start, end } = getDateRangeFromPreset(
    filter.preset,
    filter.customStart,
    filter.customEnd
  );
  if (!start) return [toMonthValue()];

  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = end
    ? new Date(end.getFullYear(), end.getMonth(), 1)
    : new Date(start.getFullYear(), start.getMonth(), 1);

  // Cap very wide ranges (e.g. All Time / full year) for UI mock performance
  const MAX_MONTHS = 24;
  while (cursor <= last && months.length < MAX_MONTHS) {
    months.push(toMonthValue(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length ? months : [toMonthValue()];
}
