import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type TeamLeaderOption = {
  id: string;
  full_name: string;
};

type TeamLeaderCheckboxPickerProps = {
  leaders: TeamLeaderOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
  /** Shown above the list */
  label?: string;
};

/**
 * Searchable multi-select of Team Leaders via checkboxes.
 * Default / all selected = company-wide (Main + everyone confirms).
 * Subset selected = bags-only for those teams (Main unchanged).
 */
export function TeamLeaderCheckboxPicker({
  leaders,
  selectedIds,
  onChange,
  disabled = false,
  className,
  label = 'Who must confirm',
}: TeamLeaderCheckboxPickerProps) {
  const allSelected =
    leaders.length > 0 && leaders.every((tl) => selectedIds.includes(tl.id));
  const noneSelected = selectedIds.length === 0;
  const isCompanyWide = allSelected || noneSelected;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leaders;
    return leaders.filter((tl) => tl.full_name.toLowerCase().includes(q));
  }, [leaders, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((tl) => selectedIds.includes(tl.id));

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (selectedIds.includes(id)) return;
      onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.filter((x) => x !== id));
  };

  const toggleAllFiltered = (checked: boolean) => {
    if (checked) {
      const next = new Set(selectedIds);
      for (const tl of filtered) next.add(tl.id);
      onChange([...next]);
      return;
    }
    const remove = new Set(filtered.map((tl) => tl.id));
    onChange(selectedIds.filter((id) => !remove.has(id)));
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2 shrink-0">
          {!allSelected && leaders.length > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={() => onChange(leaders.map((tl) => tl.id))}
            >
              Select all
            </button>
          )}
          {selectedIds.length > 0 && !allSelected && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              disabled={disabled}
              onClick={() => onChange([])}
            >
              Clear ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search team leaders…"
        disabled={disabled || leaders.length === 0}
        className="h-9"
      />

      <div className="rounded-md border max-h-48 overflow-y-auto">
        {leaders.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">No active Team Leaders found.</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">No matches for “{search.trim()}”.</p>
        ) : (
          <div className="p-2 space-y-1">
            <div className="flex items-center gap-2 px-1 py-1 border-b mb-1">
              <Checkbox
                id="tl-picker-select-all"
                checked={allFilteredSelected}
                disabled={disabled}
                onCheckedChange={(v) => toggleAllFiltered(v === true)}
              />
              <Label
                htmlFor="tl-picker-select-all"
                className="text-xs font-normal text-muted-foreground cursor-pointer"
              >
                Select all{search.trim() ? ' matching' : ''} ({filtered.length})
              </Label>
            </div>
            {filtered.map((tl) => {
              const checked = selectedIds.includes(tl.id);
              const inputId = `tl-picker-${tl.id}`;
              return (
                <div
                  key={tl.id}
                  className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-muted/40"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => toggle(tl.id, v === true)}
                  />
                  <Label htmlFor={inputId} className="text-sm font-normal cursor-pointer flex-1 truncate">
                    {tl.full_name}
                  </Label>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {isCompanyWide
          ? 'All Team Leaders selected (default): company-wide — Main updates now; all TL and Mobile Sales confirm before bags.'
          : 'Not all selected: bags only for these leaders and their Mobile Sales. Main stays unchanged.'}
      </p>
    </div>
  );
}
