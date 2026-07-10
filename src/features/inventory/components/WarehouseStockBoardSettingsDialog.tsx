import { useEffect, useState } from 'react';
import { Loader2, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS,
  type WarehouseStockBoardSettings,
} from '../warehouseStockBoard';
import { useUpdateWarehouseStockBoardSettings } from '../useWarehouseStockBoard';

type ColorField =
  | 'outOfStock'
  | 'outOfStockText'
  | 'lowStock'
  | 'lowStockText'
  | 'inStock'
  | 'inStockText';

const COLOR_FIELDS: Array<{
  key: ColorField;
  label: string;
  hint: string;
}> = [
  { key: 'outOfStock', label: 'Out of stock', hint: 'Background' },
  { key: 'outOfStockText', label: 'Out of stock text', hint: 'Text' },
  { key: 'lowStock', label: 'Low stock', hint: 'Background' },
  { key: 'lowStockText', label: 'Low stock text', hint: 'Text' },
  { key: 'inStock', label: 'In stock', hint: 'Background' },
  { key: 'inStockText', label: 'In stock text', hint: 'Text' },
];

function ColorInput({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        <span className="ml-1 font-normal text-muted-foreground">({hint})</span>
      </Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 font-mono text-xs"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

export function WarehouseStockBoardSettingsDialog({
  open,
  onOpenChange,
  companyId,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  settings: WarehouseStockBoardSettings;
}) {
  const { toast } = useToast();
  const updateSettings = useUpdateWarehouseStockBoardSettings();
  const [draft, setDraft] = useState<WarehouseStockBoardSettings>(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const setColor = (key: ColorField, value: string) => {
    setDraft((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  };

  const onSave = async () => {
    if (!companyId) return;
    if (draft.lowStockThreshold < 0 || Number.isNaN(draft.lowStockThreshold)) {
      toast({
        title: 'Invalid threshold',
        description: 'Low stock threshold must be zero or greater.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateSettings.mutateAsync({ companyId, settings: draft });
      toast({ title: 'Saved', description: 'Stock board settings updated.' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save settings.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" aria-hidden />
            Stock board settings
          </DialogTitle>
          <DialogDescription>
            Set when items show as low stock and choose badge colors. Out of stock is always zero
            quantity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="low-stock-threshold">Company low stock threshold</Label>
            <Input
              id="low-stock-threshold"
              type="number"
              min={0}
              step={1}
              value={draft.lowStockThreshold}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  lowStockThreshold: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Items with stock from 1 up to this number are shown as low stock (unless per-SKU
              reorder level applies).
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="use-per-sku-reorder"
              checked={draft.usePerSkuReorderLevel}
              onCheckedChange={(checked) =>
                setDraft((prev) => ({
                  ...prev,
                  usePerSkuReorderLevel: checked === true,
                }))
              }
            />
            <div className="space-y-1">
              <Label htmlFor="use-per-sku-reorder" className="leading-snug">
                Use per-SKU reorder level from main inventory
              </Label>
              <p className="text-xs text-muted-foreground">
                When enabled, each SKU uses its own reorder level when set; otherwise the company
                threshold above applies to all items.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {COLOR_FIELDS.map((field) => (
              <ColorInput
                key={field.key}
                id={`stock-board-color-${field.key}`}
                label={field.label}
                hint={field.hint}
                value={draft.colors[field.key]}
                onChange={(value) => setColor(field.key, value)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-xs">
            <span className="font-medium text-foreground">Preview</span>
            {(['out-of-stock', 'low-stock', 'in-stock'] as const).map((status) => {
              const style =
                status === 'out-of-stock'
                  ? {
                      backgroundColor: draft.colors.outOfStock,
                      color: draft.colors.outOfStockText,
                    }
                  : status === 'low-stock'
                    ? {
                        backgroundColor: draft.colors.lowStock,
                        color: draft.colors.lowStockText,
                      }
                    : {
                        backgroundColor: draft.colors.inStock,
                        color: draft.colors.inStockText,
                      };
              const label =
                status === 'out-of-stock'
                  ? '0'
                  : status === 'low-stock'
                    ? String(Math.min(draft.lowStockThreshold, 9) || 1)
                    : String(draft.lowStockThreshold + 5);
              return (
                <span
                  key={status}
                  className="rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums"
                  style={style}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS)}
            disabled={updateSettings.isPending}
          >
            Reset defaults
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              'Save settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WarehouseStockBoardSettingsButton({
  companyId,
  settings,
}: {
  companyId?: string;
  settings: WarehouseStockBoardSettings;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setOpen(true)}
        aria-label="Stock board settings"
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden />
        Thresholds
      </Button>
      <WarehouseStockBoardSettingsDialog
        open={open}
        onOpenChange={setOpen}
        companyId={companyId}
        settings={settings}
      />
    </>
  );
}
