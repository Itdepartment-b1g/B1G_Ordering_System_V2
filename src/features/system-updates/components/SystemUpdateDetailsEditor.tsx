import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  emptySystemUpdateDetail,
  type SystemUpdateDetailItem,
} from '../systemUpdatesApi';

type SystemUpdateDetailsEditorProps = {
  value: SystemUpdateDetailItem[];
  onChange: (next: SystemUpdateDetailItem[]) => void;
};

export function SystemUpdateDetailsEditor({ value, onChange }: SystemUpdateDetailsEditorProps) {
  const rows = value.length > 0 ? value : [emptySystemUpdateDetail()];

  const updateAt = (index: number, patch: Partial<SystemUpdateDetailItem>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addRow = () => onChange([...rows, emptySystemUpdateDetail()]);

  const removeAt = (index: number) => {
    if (rows.length <= 1) {
      onChange([emptySystemUpdateDetail()]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Update details</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add bullet point
        </Button>
      </div>
      <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-2">
        {rows.map((row, index) => (
          <div key={index} className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex items-start gap-1.5">
              <span className="mt-2.5 w-5 shrink-0 text-center text-xs text-muted-foreground">
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={row.title}
                  placeholder="What's new…"
                  onChange={(e) => updateAt(index, { title: e.target.value })}
                />
                <Textarea
                  value={row.description}
                  placeholder="More details (optional)…"
                  rows={2}
                  onChange={(e) => updateAt(index, { description: e.target.value })}
                />
              </div>
              <div className="flex shrink-0 flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeAt(index)}
                  aria-label="Remove bullet"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        At least one titled bullet is required before publishing. Order here is the order users see.
      </p>
    </div>
  );
}
