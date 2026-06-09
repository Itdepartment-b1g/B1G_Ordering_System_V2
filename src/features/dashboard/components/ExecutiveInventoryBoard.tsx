import { useMemo, useState } from 'react';
import { Loader2, Package, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { Brand, Variant } from '@/features/inventory/InventoryContext';
import {
  getExecutiveDisplayedStock,
  getExecutiveStockStatus,
  type ExecutiveMainStockMode,
  type ExecutiveStockLayer,
  type ExecutiveTeamLeader,
} from '../executiveInventoryHooks';

const TYPE_SORT_ORDER: string[] = ['flavor', 'battery', 'POSM', 'posm'];

function getVariantsByTypeEntries(brand: Brand): [string, Variant[]][] {
  const v = brand.variantsByType;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.entries());
  return Object.entries(v as Record<string, Variant[]>);
}

function sortTypeEntries(entries: [string, Variant[]][]): [string, Variant[]][] {
  return entries
    .filter(([, variants]) => variants.length > 0)
    .sort(([a], [b]) => {
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      const ia = TYPE_SORT_ORDER.findIndex((t) => t.toLowerCase() === la);
      const ib = TYPE_SORT_ORDER.findIndex((t) => t.toLowerCase() === lb);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
}

function stockBadgeClass(status: Variant['status']): string {
  switch (status) {
    case 'out-of-stock':
      return 'bg-destructive text-destructive-foreground';
    case 'low-stock':
      return 'bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950';
    default:
      return 'bg-emerald-600 text-white';
  }
}

function totalLabelForType(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'TOTAL PODS';
  if (t === 'battery') return 'TOTAL DEVICE';
  return `TOTAL ${typeKey.toUpperCase()}`;
}

function totalStock(
  variants: Variant[],
  layer: ExecutiveStockLayer,
  mainMode: ExecutiveMainStockMode
): number {
  return variants.reduce(
    (sum, v) => sum + getExecutiveDisplayedStock(v, layer, mainMode),
    0
  );
}

function VariantRows({
  variants,
  layer,
  mainMode,
}: {
  variants: Variant[];
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
}) {
  return (
    <div className="flex flex-col min-h-0 bg-background">
      {variants.map((v) => {
        const displayed = getExecutiveDisplayedStock(v, layer, mainMode);
        const status = getExecutiveStockStatus(v, layer, mainMode);
        return (
          <div
            key={v.id}
            className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs leading-snug min-h-[2.25rem]"
          >
            <span className="flex-1 min-w-0 text-left font-medium text-foreground break-words">
              {v.name}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[2.75rem] text-center',
                stockBadgeClass(status)
              )}
            >
              {displayed}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TypeColumn({
  typeKey,
  variants,
  layer,
  mainMode,
  className,
}: {
  typeKey: string;
  variants: Variant[];
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
  className?: string;
}) {
  const sum = totalStock(variants, layer, mainMode);
  const label = totalLabelForType(typeKey);

  return (
    <div className={cn('flex min-h-0 min-w-[7.5rem] flex-1 flex-col', className)}>
      <div
        className="max-h-[min(55vh,520px)] min-h-[120px] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ scrollbarGutter: 'stable' }}
      >
        <VariantRows variants={variants} layer={layer} mainMode={mainMode} />
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-primary/20 bg-primary px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
        <span className="min-w-0 leading-tight">{label}:</span>
        <span className="shrink-0 tabular-nums">{sum}</span>
      </div>
    </div>
  );
}

function brandCardWidthClass(columnCount: number): string {
  if (columnCount <= 1) return 'w-[min(100%,280px)]';
  if (columnCount === 2) return 'w-[min(100%,460px)]';
  if (columnCount === 3) return 'w-[min(100%,620px)]';
  return 'w-[min(100%,780px)]';
}

function BrandColumn({
  brand,
  layer,
  mainMode,
}: {
  brand: Brand;
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
}) {
  const typeEntries = sortTypeEntries(getVariantsByTypeEntries(brand));

  if (typeEntries.length === 0) {
    return (
      <div
        className={cn(
          'flex shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm',
          brandCardWidthClass(1)
        )}
        role="region"
        aria-label={`${brand.name} stock`}
      >
        <div className="bg-primary px-2 py-2.5 text-center text-xs font-bold uppercase leading-snug text-primary-foreground">
          {brand.name}
        </div>
        <div className="px-6 py-8 text-center text-xs text-muted-foreground">No SKUs in inventory</div>
      </div>
    );
  }

  const colCount = typeEntries.length;

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden',
        brandCardWidthClass(colCount)
      )}
      role="region"
      aria-label={`${brand.name} stock`}
    >
      <div className="shrink-0 bg-primary px-2 py-2.5 text-center text-xs font-bold uppercase leading-snug text-primary-foreground">
        {brand.name}
      </div>

      <div
        className={cn(
          'flex min-h-[180px] flex-1 divide-x divide-border bg-muted/20',
          colCount > 1 ? 'flex-row' : 'flex-col'
        )}
      >
        {typeEntries.map(([typeKey, variants]) => (
          <TypeColumn
            key={typeKey}
            typeKey={typeKey}
            variants={variants}
            layer={layer}
            mainMode={mainMode}
          />
        ))}
      </div>
    </div>
  );
}

export interface ExecutiveInventoryBoardProps {
  companyName: string;
  brands: Brand[];
  loading: boolean;
  stockLayer: ExecutiveStockLayer;
  onStockLayerChange: (layer: ExecutiveStockLayer) => void;
  mainMode: ExecutiveMainStockMode;
  onMainModeChange: (mode: ExecutiveMainStockMode) => void;
  teamLeaders: ExecutiveTeamLeader[];
  loadingTeamLeaders: boolean;
  selectedLeaderId: string | null;
  onLeaderChange: (leaderId: string | null) => void;
}

export function ExecutiveInventoryBoard({
  companyName,
  brands,
  loading,
  stockLayer,
  onStockLayerChange,
  mainMode,
  onMainModeChange,
  teamLeaders,
  loadingTeamLeaders,
  selectedLeaderId,
  onLeaderChange,
}: ExecutiveInventoryBoardProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      return b.allVariants.some((v) => v.name.toLowerCase().includes(q));
    });
  }, [brands, search]);

  const selectedLeader = teamLeaders.find((l) => l.id === selectedLeaderId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Inventory for <span className="text-primary">{companyName}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Read-only stock board — main pool (super admin) or team leader hub.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stock layer</Label>
            <ToggleGroup
              type="single"
              value={stockLayer}
              onValueChange={(v) => v && onStockLayerChange(v as ExecutiveStockLayer)}
              className="justify-start"
            >
              <ToggleGroupItem value="main" aria-label="Main stock" className="gap-1.5 px-3 text-xs">
                <Package className="h-3.5 w-3.5" />
                Main Stock
              </ToggleGroupItem>
              <ToggleGroupItem value="team_leader" aria-label="Team leader hub" className="gap-1.5 px-3 text-xs">
                <Users className="h-3.5 w-3.5" />
                Team Leader Hub
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {stockLayer === 'main' ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Main view</Label>
              <ToggleGroup
                type="single"
                value={mainMode}
                onValueChange={(v) => v && onMainModeChange(v as ExecutiveMainStockMode)}
                className="justify-start"
              >
                <ToggleGroupItem value="available" className="px-3 text-xs">
                  Available
                </ToggleGroupItem>
                <ToggleGroupItem value="overall" className="px-3 text-xs">
                  Overall
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          ) : (
            <div className="space-y-1.5 min-w-[220px]">
              <Label className="text-xs text-muted-foreground">Team leader</Label>
              <Select
                value={selectedLeaderId ?? ''}
                onValueChange={(v) => onLeaderChange(v || null)}
                disabled={loadingTeamLeaders || teamLeaders.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingTeamLeaders ? 'Loading…' : 'Select team leader'} />
                </SelectTrigger>
                <SelectContent>
                  {teamLeaders.map((leader) => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.full_name}
                      {leader.hub_names.length > 0
                        ? ` (${leader.hub_names.join(', ')})`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {stockLayer === 'main' && (
        <p className="text-xs text-muted-foreground">
          {mainMode === 'available'
            ? 'Available = total stock minus allocated (what super admin can still allocate to team leaders).'
            : 'Overall = full main inventory stock including allocated units.'}
        </p>
      )}

      {stockLayer === 'team_leader' && selectedLeader && (
        <p className="text-xs text-muted-foreground">
          Showing hub stock held by {selectedLeader.full_name}
          {selectedLeader.hub_names.length > 0
            ? ` — ${selectedLeader.hub_names.join(', ')}`
            : ''}
          .
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter brands or SKUs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {stockLayer === 'team_leader' && !loadingTeamLeaders && teamLeaders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          No active team leaders for this company.
        </div>
      ) : stockLayer === 'team_leader' && !selectedLeaderId ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          Select a team leader to view their hub stock.
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mb-3 h-10 w-10 animate-spin opacity-40" />
          <p>Loading inventory…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          {search.trim() ? 'No brands match your filter.' : 'No inventory to display yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex flex-row items-stretch gap-4">
            {filtered.map((brand) => (
              <BrandColumn
                key={brand.id}
                brand={brand}
                layer={stockLayer}
                mainMode={mainMode}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
