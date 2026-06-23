import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Loader2, Package, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  usePendingMobileSalesAllocations,
  type PendingMobileSalesAllocation,
} from '@/features/inventory/requestHooks';
import {
  getExecutiveDisplayedStock,
  getExecutiveStockStatus,
  type ExecutiveMainStockMode,
  type ExecutiveStockLayer,
  type ExecutiveTeamLeader,
  type ExecutiveTeamLeaderMode,
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

function getOrderStageLabel(stage: string) {
  switch (stage) {
    case 'finance_pending':
      return 'Pending Finance';
    case 'agent_pending':
      return 'Pending Team Leader';
    case 'leader_approved':
      return 'Leader Approved';
    case 'needs_revision':
      return 'Needs Revision';
    default:
      return stage.replace(/_/g, ' ');
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

function totalGrossAllocated(variants: Variant[]): number {
  return variants.reduce((sum, v) => sum + (v.allocatedStock || 0), 0);
}

function totalRemainingAllocated(
  variants: Variant[],
  getRemaining: (variant: Variant) => number
): number {
  return variants.reduce((sum, v) => sum + getRemaining(v), 0);
}

interface MainAllocHelpers {
  getGrossAllocated: (variant: Variant) => number;
  getRemainingAllocated: (variant: Variant) => number;
  getPendingQty: (variantId: string) => number;
  onOpenPendingDialog: (brandName: string, variant: Variant) => void;
}

function VariantRows({
  brandName,
  variants,
  layer,
  mainMode,
  mainAlloc,
}: {
  brandName: string;
  variants: Variant[];
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
  mainAlloc?: MainAllocHelpers;
}) {
  const showMainAlloc = layer === 'main' && !!mainAlloc;

  return (
    <div className="flex flex-col min-h-0 bg-background">
      {showMainAlloc && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="flex-1 min-w-0">SKU</span>
          <span className="shrink-0 w-[2.5rem] text-center">Stock</span>
          <span className="shrink-0 w-[2.5rem] text-center">Alloc</span>
          <span className="shrink-0 w-[2.5rem] text-center">Rem</span>
        </div>
      )}
      {variants.map((v) => {
        const displayed = getExecutiveDisplayedStock(v, layer, mainMode);
        const status = getExecutiveStockStatus(v, layer, mainMode);
        const gross = mainAlloc?.getGrossAllocated(v) ?? 0;
        const remaining = mainAlloc?.getRemainingAllocated(v) ?? 0;
        const pendingQty = mainAlloc?.getPendingQty(v.id) ?? 0;
        const canOpenPending = showMainAlloc && pendingQty > 0;

        return (
          <div
            key={v.id}
            className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-xs leading-snug min-h-[2.25rem]"
          >
            <span className="flex-1 min-w-0 text-left font-medium text-foreground break-words">
              {v.name}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums w-[2.5rem] text-center',
                stockBadgeClass(status)
              )}
            >
              {displayed}
            </span>
            {showMainAlloc && (
              <>
                <span className="shrink-0 w-[2.5rem] text-center text-[11px] font-semibold tabular-nums text-orange-600">
                  {gross}
                </span>
                {canOpenPending ? (
                  <button
                    type="button"
                    className="shrink-0 w-[2.5rem] text-center text-[11px] font-semibold tabular-nums text-amber-700 hover:underline rounded hover:bg-amber-50/50"
                    title={`Allocated ${gross} − ${pendingQty} pending — click to view orders`}
                    onClick={() => mainAlloc!.onOpenPendingDialog(brandName, v)}
                  >
                    {remaining}
                  </button>
                ) : (
                  <span className="shrink-0 w-[2.5rem] text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {pendingQty > 0 ? remaining : '—'}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TypeColumn({
  brandName,
  typeKey,
  variants,
  layer,
  mainMode,
  mainAlloc,
  className,
}: {
  brandName: string;
  typeKey: string;
  variants: Variant[];
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
  mainAlloc?: MainAllocHelpers;
  className?: string;
}) {
  const sum = totalStock(variants, layer, mainMode);
  const allocSum = layer === 'main' ? totalGrossAllocated(variants) : 0;
  const remSum =
    layer === 'main' && mainAlloc
      ? totalRemainingAllocated(variants, mainAlloc.getRemainingAllocated)
      : 0;
  const label = totalLabelForType(typeKey);
  const minWidth = layer === 'main' ? 'min-w-[11rem]' : 'min-w-[7.5rem]';

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', minWidth, className)}>
      <div
        className="max-h-[min(55vh,520px)] min-h-[120px] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ scrollbarGutter: 'stable' }}
      >
        <VariantRows
          brandName={brandName}
          variants={variants}
          layer={layer}
          mainMode={mainMode}
          mainAlloc={mainAlloc}
        />
      </div>
      <div className="mt-auto flex shrink-0 flex-col gap-0.5 border-t border-primary/20 bg-primary px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 leading-tight">{label}:</span>
          <span className="shrink-0 tabular-nums">{sum}</span>
        </div>
        {layer === 'main' && allocSum > 0 && (
          <div className="flex items-center justify-between gap-2 text-[9px] font-semibold normal-case opacity-90">
            <span>Allocated / Rem</span>
            <span className="tabular-nums">
              {allocSum} / {remSum}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function brandCardWidthClass(columnCount: number, layer: ExecutiveStockLayer): string {
  const base = columnCount <= 1 ? 280 : columnCount === 2 ? 460 : columnCount === 3 ? 620 : 780;
  const width = layer === 'main' ? base + 180 : base;
  return `w-[min(100%,${width}px)]`;
}

function BrandColumn({
  brand,
  layer,
  mainMode,
  mainAlloc,
}: {
  brand: Brand;
  layer: ExecutiveStockLayer;
  mainMode: ExecutiveMainStockMode;
  mainAlloc?: MainAllocHelpers;
}) {
  const typeEntries = sortTypeEntries(getVariantsByTypeEntries(brand));

  if (typeEntries.length === 0) {
    return (
      <div
        className={cn(
          'flex shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm',
          brandCardWidthClass(1, layer)
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
        brandCardWidthClass(colCount, layer)
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
            brandName={brand.name}
            typeKey={typeKey}
            variants={variants}
            layer={layer}
            mainMode={mainMode}
            mainAlloc={mainAlloc}
          />
        ))}
      </div>
    </div>
  );
}

export interface ExecutiveInventoryBoardProps {
  companyId: string | null;
  companyName: string;
  brands: Brand[];
  loading: boolean;
  stockLayer: ExecutiveStockLayer;
  onStockLayerChange: (layer: ExecutiveStockLayer) => void;
  mainMode: ExecutiveMainStockMode;
  onMainModeChange: (mode: ExecutiveMainStockMode) => void;
  teamLeaderMode: ExecutiveTeamLeaderMode;
  onTeamLeaderModeChange: (mode: ExecutiveTeamLeaderMode) => void;
  teamLeaders: ExecutiveTeamLeader[];
  loadingTeamLeaders: boolean;
  selectedLeaderId: string | null;
  onLeaderChange: (leaderId: string | null) => void;
}

export function ExecutiveInventoryBoard({
  companyId,
  companyName,
  brands,
  loading,
  stockLayer,
  onStockLayerChange,
  mainMode,
  onMainModeChange,
  teamLeaderMode,
  onTeamLeaderModeChange,
  teamLeaders,
  loadingTeamLeaders,
  selectedLeaderId,
  onLeaderChange,
}: ExecutiveInventoryBoardProps) {
  const [search, setSearch] = useState('');
  const [pendingAllocDialog, setPendingAllocDialog] = useState<{
    brandName: string;
    variantName: string;
    grossAllocated: number;
    items: PendingMobileSalesAllocation[];
  } | null>(null);

  const showPendingAllocations = stockLayer === 'main' && !!companyId;
  const { data: pendingMobileSalesAllocations = [] } = usePendingMobileSalesAllocations(
    showPendingAllocations,
    companyId
  );

  const pendingByVariantId = useMemo(() => {
    const map = new Map<string, PendingMobileSalesAllocation[]>();
    for (const row of pendingMobileSalesAllocations) {
      const list = map.get(row.variant_id) ?? [];
      list.push(row);
      map.set(row.variant_id, list);
    }
    return map;
  }, [pendingMobileSalesAllocations]);

  const getPendingAllocQuantity = (variantId: string) =>
    (pendingByVariantId.get(variantId) ?? []).reduce((sum, r) => sum + r.quantity, 0);

  const getGrossAllocated = (variant: Variant) => variant.allocatedStock || 0;

  const getRemainingAllocated = (variant: Variant) => {
    const gross = getGrossAllocated(variant);
    if (!showPendingAllocations) return gross;
    return Math.max(0, gross - getPendingAllocQuantity(variant.id));
  };

  const openPendingAllocDialog = (brandName: string, variant: Variant) => {
    const items = pendingByVariantId.get(variant.id) ?? [];
    if (items.length === 0) return;
    setPendingAllocDialog({
      brandName,
      variantName: variant.name,
      grossAllocated: getGrossAllocated(variant),
      items,
    });
  };

  const mainAlloc: MainAllocHelpers | undefined =
    stockLayer === 'main'
      ? {
          getGrossAllocated,
          getRemainingAllocated,
          getPendingQty: getPendingAllocQuantity,
          onOpenPendingDialog: openPendingAllocDialog,
        }
      : undefined;

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
            <>
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
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Hub view</Label>
                <ToggleGroup
                  type="single"
                  value={teamLeaderMode}
                  onValueChange={(v) => v && onTeamLeaderModeChange(v as ExecutiveTeamLeaderMode)}
                  className="justify-start"
                >
                  <ToggleGroupItem value="leader_only" className="px-3 text-xs">
                    Leader only
                  </ToggleGroupItem>
                  <ToggleGroupItem value="team_total" className="px-3 text-xs">
                    Team total
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </>
          )}
        </div>
      </div>

      {stockLayer === 'main' && (
        <p className="text-xs text-muted-foreground">
          {mainMode === 'available'
            ? 'Available = total stock minus allocated. Alloc = gross allocated to team leaders; Rem = allocated minus pending mobile-sales orders (click Rem to view orders).'
            : 'Overall = full main inventory stock. Alloc / Rem columns show allocation breakdown.'}
        </p>
      )}

      {stockLayer === 'team_leader' && selectedLeader && (
        <p className="text-xs text-muted-foreground">
          {teamLeaderMode === 'team_total'
            ? `Showing combined stock for ${selectedLeader.full_name} and their mobile sales agents.`
            : `Showing hub stock held by ${selectedLeader.full_name}${
                selectedLeader.hub_names.length > 0
                  ? ` — ${selectedLeader.hub_names.join(', ')}`
                  : ''
              }.`}
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
                mainAlloc={mainAlloc}
              />
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!pendingAllocDialog} onOpenChange={(open) => !open && setPendingAllocDialog(null)}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-full max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Allocated Pending — Mobile Sales
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {pendingAllocDialog && (() => {
                const pendingUnits = pendingAllocDialog.items.reduce((sum, r) => sum + r.quantity, 0);
                const columnValue = Math.max(0, pendingAllocDialog.grossAllocated - pendingUnits);
                return (
                  <>
                    <span className="font-medium text-foreground">{pendingAllocDialog.brandName}</span>
                    {' — '}
                    {pendingAllocDialog.variantName}
                    {' · '}
                    Allocated {pendingAllocDialog.grossAllocated} − {pendingUnits} pending = {columnValue} in table
                    {' · '}
                    <span className="text-sm font-semibold italic">
                      {pendingUnits} unit{pendingUnits === 1 ? '' : 's'} below (not yet finance-approved)
                    </span>
                  </>
                );
              })()}
            </p>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {pendingAllocDialog && pendingAllocDialog.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Mobile sales</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingAllocDialog.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {item.order_number || item.order_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{item.agent?.full_name || '—'}</TableCell>
                      <TableCell>{item.client?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-xs">
                          {getOrderStageLabel(item.stage)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-700">{item.quantity}</TableCell>
                      <TableCell className="text-sm">{item.payment_method || 'N/A'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground max-w-[180px] truncate"
                        title={item.order_notes || undefined}
                      >
                        {item.order_notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No pending mobile sales orders for this variant.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
