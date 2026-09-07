import { useMemo, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type TargetMonthPreset =
  | 'this_month'
  | 'next_month'
  | 'next_2_months'
  | 'next_3_months'
  | 'custom';

type TargetMonthPickerProps = {
  /** YYYY-MM */
  value: string;
  onChange: (month: string) => void;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
};

const QUICK_PRESETS: { key: Exclude<TargetMonthPreset, 'custom'>; label: string; offset: number }[] =
  [
    { key: 'this_month', label: 'This Month', offset: 0 },
    { key: 'next_month', label: 'Next Month', offset: 1 },
    { key: 'next_2_months', label: 'In 2 Months', offset: 2 },
    { key: 'next_3_months', label: 'In 3 Months', offset: 3 },
  ];

function toMonthValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(base: Date, offset: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + offset, 1);
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month || 'Select month';
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
}

function inferPreset(month: string): TargetMonthPreset {
  const now = new Date();
  for (const preset of QUICK_PRESETS) {
    if (month === toMonthValue(addMonths(now, preset.offset))) return preset.key;
  }
  return 'custom';
}

/**
 * Single-month picker for assigning a sales target.
 * Same popover pattern as DateRangeFilterPopover.
 * Quick picks jump to that calendar month (offset from today); Custom for any month.
 */
export function TargetMonthPicker({
  value,
  onChange,
  className,
  triggerClassName,
  align = 'start',
}: TargetMonthPickerProps) {
  const [open, setOpen] = useState(false);
  const [draftCustom, setDraftCustom] = useState(value);

  const preset = useMemo(() => inferPreset(value), [value]);

  const applyOffset = (offset: number) => {
    onChange(toMonthValue(addMonths(new Date(), offset)));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraftCustom(value || toMonthValue(new Date()));
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={triggerClassName ?? 'w-full justify-between h-10'}
        >
          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">{formatMonthLabel(value)}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={className ?? 'w-[320px] p-0'} align={align}>
        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Filters
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_PRESETS.map(({ key, label, offset }) => (
                <Button
                  key={key}
                  type="button"
                  variant={preset === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => applyOffset(offset)}
                  className="justify-center h-9"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Custom
            </Label>
            <div className="space-y-1.5">
              <Label htmlFor="target-month-custom" className="text-xs text-muted-foreground">
                Month
              </Label>
              <Input
                id="target-month-custom"
                type="month"
                value={draftCustom}
                onChange={(e) => setDraftCustom(e.target.value)}
                className="h-9"
              />
            </div>
            {draftCustom && (
              <Button
                type="button"
                variant={preset === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onChange(draftCustom);
                  setOpen(false);
                }}
                className="w-full h-9"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Apply Month
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
