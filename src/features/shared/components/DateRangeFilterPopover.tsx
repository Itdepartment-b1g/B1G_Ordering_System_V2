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
  parseDateFromInput,
} from '@/lib/dateRangePresets';

export type DateRangeFilterValue = {
  preset: DatePreset;
  customStart?: Date;
  customEnd?: Date;
};

type DateRangeFilterPopoverProps = {
  value: DateRangeFilterValue;
  onChange: (value: DateRangeFilterValue) => void;
  className?: string;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
};

export function DateRangeFilterPopover({
  value,
  onChange,
  className,
  triggerClassName,
  align = 'start',
}: DateRangeFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const { preset, customStart, customEnd } = value;

  const handlePresetChange = (next: DatePreset) => {
    if (next === 'custom') {
      onChange({ preset: 'custom', customStart, customEnd });
      return;
    }
    onChange({ preset: next, customStart: undefined, customEnd: undefined });
    setOpen(false);
  };

  const label = getDatePresetLabel(preset, customStart, customEnd);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={triggerClassName ?? 'w-full md:w-[220px] justify-between h-10'}
        >
          <div className="flex items-center gap-2 truncate min-w-0 flex-1">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="text-sm truncate">{label}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={className ?? 'w-[360px] p-0'} align={align}>
        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Quick Filters
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['this_month', 'This Month'],
                  ['last_month', 'Last Month'],
                  ['last_3_months', 'Last 3 Months'],
                  ['last_6_months', 'Last 6 Months'],
                  ['this_year', 'This Year'],
                  ['last_year', 'Last Year'],
                ] as const
              ).map(([key, text]) => (
                <Button
                  key={key}
                  variant={preset === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetChange(key)}
                  className="justify-center h-9"
                >
                  {text}
                </Button>
              ))}
              <Button
                variant={preset === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handlePresetChange('all')}
                className="justify-center col-span-2 h-9"
              >
                All Time
              </Button>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Custom Range
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="orders-date-from" className="text-xs text-muted-foreground">
                  From
                </Label>
                <Input
                  id="orders-date-from"
                  type="date"
                  value={formatDateForInput(customStart)}
                  onChange={(e) => {
                    const date = parseDateFromInput(e.target.value);
                    onChange({
                      preset: date && customEnd ? 'custom' : preset,
                      customStart: date,
                      customEnd,
                    });
                  }}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-date-to" className="text-xs text-muted-foreground">
                  To
                </Label>
                <Input
                  id="orders-date-to"
                  type="date"
                  value={formatDateForInput(customEnd)}
                  onChange={(e) => {
                    const date = parseDateFromInput(e.target.value);
                    onChange({
                      preset: customStart && date ? 'custom' : preset,
                      customStart,
                      customEnd: date,
                    });
                  }}
                  className="h-9"
                />
              </div>
            </div>
            {customStart && customEnd && (
              <Button
                variant={preset === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  onChange({ preset: 'custom', customStart, customEnd });
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
