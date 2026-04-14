import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, List, RefreshCw, Search } from 'lucide-react';
import { useInventory, type Brand, type Variant } from './InventoryContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';

/** Order variant-type columns: known types first, then alphabetical. */
const TYPE_SORT_ORDER: string[] = ['flavor', 'battery', 'POSM', 'posm'];

type DashboardViewMode = 'available' | 'overall' | 'sub';

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

function getDisplayedStock(v: Variant, opts: { mode: DashboardViewMode; isMainWarehouseUser: boolean }): number {
  // Sub-warehouse view uses location stock directly.
  if (opts.mode === 'sub') return v.stock;
  // Non-main warehouse users shouldn't be able to see "overall/available" main inventory anyway,
  // but if they do, treat displayed stock as their current stock value.
  if (!opts.isMainWarehouseUser) return v.stock;
  if (opts.mode === 'overall') return v.stock;
  // available
  return Math.max(0, v.stock - (v.allocatedStock || 0));
}

function totalStock(variants: Variant[], opts: { mode: DashboardViewMode; isMainWarehouseUser: boolean }): number {
  return variants.reduce((s, v) => s + getDisplayedStock(v, opts), 0);
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

/** Footer label per `variant_type` (matches common warehouse wording). */
function totalLabelForType(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'TOTAL PODS';
  if (t === 'battery') return 'TOTAL DEVICE';
  return `TOTAL ${typeKey.toUpperCase()}`;
}

function VariantRows({
  variants,
  mode,
  isMainWarehouseUser,
}: {
  variants: Variant[];
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
}) {
  return (
    <div className="flex flex-col min-h-0 bg-background">
      {variants.map((v) => (
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
              stockBadgeClass(v.status)
            )}
          >
            {getDisplayedStock(v, { mode, isMainWarehouseUser })}
          </span>
        </div>
      ))}
    </div>
  );
}

function TypeColumn({
  typeKey,
  variants,
  mode,
  isMainWarehouseUser,
  className,
}: {
  typeKey: string;
  variants: Variant[];
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
  className?: string;
}) {
  const sum = totalStock(variants, { mode, isMainWarehouseUser });
  const label = totalLabelForType(typeKey);

  return (
    <div className={cn('flex min-h-0 min-w-[7.5rem] flex-1 flex-col', className)}>
      <div
        className="max-h-[min(55vh,520px)] min-h-[120px] flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ scrollbarGutter: 'stable' }}
      >
        <VariantRows variants={variants} mode={mode} isMainWarehouseUser={isMainWarehouseUser} />
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-primary/20 bg-primary px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
        <span className="min-w-0 leading-tight">{label}:</span>
        <span className="shrink-0 tabular-nums">{sum}</span>
      </div>
    </div>
  );
}

/** Card width scales with how many variant-type columns the brand has. */
function brandCardWidthClass(columnCount: number): string {
  if (columnCount <= 1) return 'w-[min(100%,280px)]';
  if (columnCount === 2) return 'w-[min(100%,460px)]';
  if (columnCount === 3) return 'w-[min(100%,620px)]';
  return 'w-[min(100%,780px)]';
}

function BrandColumn({
  brand,
  mode,
  isMainWarehouseUser,
}: {
  brand: Brand;
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
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
        <div className="px-6 py-8 text-center text-xs text-muted-foreground">No SKUs in main inventory</div>
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
            mode={mode}
            isMainWarehouseUser={isMainWarehouseUser}
          />
        ))}
      </div>
    </div>
  );
}

export default function WarehouseInventoryDashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { brands, loading, refreshInventory } = useInventory();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardViewMode>('available');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');

  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;
  const isUnlinkedWarehouseUser = isWarehouse && membership.status === 'unlinked';

  type LocationRow = { id: string; name: string; is_main: boolean };

  const { data: locations = [] } = useQuery({
    queryKey: ['warehouse-locations', user?.company_id],
    enabled: !!user?.company_id && isWarehouse && isMainWarehouseUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id,name,is_main')
        .eq('company_id', user!.company_id)
        .order('is_main', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data || []) as LocationRow[];
    },
  });

  const { data: subWarehouseBrands = [], isLoading: loadingSubWarehouseBrands } = useQuery({
    queryKey: ['warehouse-location-inventory-brands', user?.company_id, selectedLocationId],
    enabled: !!user?.company_id && isWarehouse && isMainWarehouseUser && viewMode === 'sub' && !!selectedLocationId,
    // Override global cache defaults so Ctrl+R and tab revisit always fetch fresh
    // sub-warehouse stock instead of restoring a still-"fresh" persisted snapshot.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async () => {
      const companyId = user!.company_id!;
      const { data: rows, error } = await supabase
        .from('warehouse_location_inventory')
        .select(
          `
          stock,
          variant_id,
          variants:variant_id (
            id,
            name,
            variant_type,
            created_at,
            is_active,
            brands:brand_id (
              id,
              name,
              is_active
            )
          )
        `
        )
        .eq('company_id', companyId)
        .eq('location_id', selectedLocationId);
      if (error) throw error;

      const byBrand = new Map<string, any>();
      for (const r of rows ?? []) {
        const v = (r as any).variants;
        if (!v || v.is_active === false) continue;
        const b = v.brands;
        if (!b || b.is_active === false) continue;
        const brandId = b.id as string;
        const brandName = b.name as string;
        const variantId = v.id as string;

        const inv = {
          id: `loc:${selectedLocationId}:${variantId}`,
          stock: (r as any).stock ?? 0,
          allocated_stock: 0,
          unit_price: 0,
          selling_price: 0,
          dsp_price: 0,
          rsp_price: 0,
          reorder_level: 10,
        };

        const variantRow = {
          id: variantId,
          name: v.name,
          variant_type: v.variant_type,
          created_at: v.created_at,
          is_active: v.is_active,
          main_inventory: inv,
        };

        const existing = byBrand.get(brandId) ?? { id: brandId, name: brandName, variants: [] as any[] };
        existing.variants.push(variantRow);
        byBrand.set(brandId, existing);
      }

      const brandsData = Array.from(byBrand.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      for (const b of brandsData) {
        b.variants.sort((a: any, b2: any) => new Date(a.created_at).getTime() - new Date(b2.created_at).getTime());
      }

      // Convert to the Brand[] shape used by the board (same logic as InventoryContext grouping).
      const calculateStatus = (stock: number, reorderLevel: number = 10): 'in-stock' | 'low-stock' | 'out-of-stock' => {
        if (stock === 0) return 'out-of-stock';
        if (stock <= reorderLevel) return 'low-stock';
        return 'in-stock';
      };

      const transformed: Brand[] = brandsData.map((brand: any) => {
        const allVariants: Variant[] = (brand.variants || []).map((v: any) => {
          const inventory = v.main_inventory;
          return {
            id: v.id,
            name: v.name,
            variantType: v.variant_type,
            stock: inventory.stock,
            allocatedStock: 0,
            price: 0,
            sellingPrice: 0,
            dspPrice: 0,
            rspPrice: 0,
            status: calculateStatus(inventory.stock, inventory.reorder_level ?? 10),
            mainInventoryId: inventory.id,
          } as Variant;
        });

        const variantsByType = new Map<string, Variant[]>();
        for (const variant of allVariants) {
          const type = variant.variantType;
          if (!variantsByType.has(type)) variantsByType.set(type, []);
          variantsByType.get(type)!.push(variant);
        }

        return {
          id: brand.id,
          name: brand.name,
          flavors: allVariants.filter((v) => v.variantType === 'flavor'),
          batteries: allVariants.filter((v) => v.variantType === 'battery'),
          posms: allVariants.filter((v) => v.variantType === 'POSM' || v.variantType === 'posm'),
          variantsByType,
          allVariants,
        };
      });

      return transformed.filter((b) => b.allVariants.length > 0);
    },
  });

  const subLocations = useMemo(() => locations.filter((l) => !l.is_main), [locations]);

  const activeViewKey = useMemo(() => {
    if (viewMode === 'sub' && selectedLocationId) return `sub:${selectedLocationId}`;
    return viewMode;
  }, [viewMode, selectedLocationId]);

  const handleQuickViewChange = (value: string) => {
    if (!value) return;
    if (value === 'available' || value === 'overall') {
      setViewMode(value);
      setSelectedLocationId('');
      return;
    }
    if (value === 'sub') {
      // Keep compatibility: if somehow passed, require a concrete sub selection next.
      setViewMode('sub');
      return;
    }
    if (value.startsWith('sub:')) {
      const locationId = value.slice(4);
      if (!locationId) return;
      setViewMode('sub');
      setSelectedLocationId(locationId);
    }
  };

  const displayedBrands = useMemo(() => {
    if (isMainWarehouseUser && viewMode === 'sub') return subWarehouseBrands;
    return brands;
  }, [brands, isMainWarehouseUser, subWarehouseBrands, viewMode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayedBrands;
    return displayedBrands.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      return b.allVariants.some((v) => v.name.toLowerCase().includes(q));
    });
  }, [displayedBrands, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Always refresh main inventory cache.
      await refreshInventory();

      // If we're currently looking at a specific sub-warehouse, also refresh its dashboard cache.
      if (isMainWarehouseUser && viewMode === 'sub' && selectedLocationId) {
        await qc.invalidateQueries({
          queryKey: ['warehouse-location-inventory-brands', user?.company_id, selectedLocationId],
        });
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-full">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {isWarehouse && membership.status === 'sub'
              ? 'Showing this sub-warehouse stock.'
              : isMainWarehouseUser
              ? viewMode === 'available'
                ? 'Showing available stock (main stock minus allocated).'
                : viewMode === 'overall'
                  ? 'Showing overall stock (main stock, including allocated).'
                  : 'Showing selected sub-warehouse stock.'
              : 'Showing available stock.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMainWarehouseUser && (
            <>
              {/* Mobile: one compact dropdown (direct selection, no second step) */}
              <div className="w-full sm:hidden">
                <Label className="sr-only">View</Label>
                <Select value={activeViewKey} onValueChange={handleQuickViewChange}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select view" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Main warehouse (available)</SelectItem>
                    <SelectItem value="overall">Main warehouse (overall)</SelectItem>
                    {subLocations.map((loc) => (
                      <SelectItem key={loc.id} value={`sub:${loc.id}`}>
                        Sub: {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Desktop/tablet: one-click toggle chips (scrolls if many) */}
              <div className="hidden sm:block">
                <div className="max-w-[min(720px,70vw)] rounded-md border bg-muted/20 p-1">
                  <div className="overflow-x-auto">
                    <ToggleGroup
                      type="single"
                      value={activeViewKey}
                      onValueChange={handleQuickViewChange}
                      className="w-max justify-start gap-1"
                      aria-label="Dashboard stock view"
                    >
                      <ToggleGroupItem value="available" size="sm" aria-label="Main warehouse available stock">
                        Main (available)
                      </ToggleGroupItem>
                      <ToggleGroupItem value="overall" size="sm" aria-label="Main warehouse overall stock">
                        Main (overall)
                      </ToggleGroupItem>
                      {subLocations.map((loc) => (
                        <ToggleGroupItem
                          key={loc.id}
                          value={`sub:${loc.id}`}
                          size="sm"
                          aria-label={`Sub-warehouse ${loc.name}`}
                          className="max-w-[220px] truncate"
                          title={loc.name}
                        >
                          {loc.name}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>
              </div>
            </>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to="/inventory/main">
              <List className="mr-2 h-4 w-4" aria-hidden />
              Main inventory
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onRefresh()} disabled={loading || refreshing}>
            <RefreshCw className={cn('mr-2 h-4 w-4', (loading || refreshing) && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
        </div>
      </div>

      {isUnlinkedWarehouseUser && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          This warehouse account isn’t linked to a warehouse location yet. Showing main stock by default.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Filter brands or variant names…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter inventory board"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-destructive" aria-hidden />
            Out of stock
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-amber-400" aria-hidden />
            Low stock
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-emerald-600" aria-hidden />
            In stock
          </span>
        </div>
      </div>

      {loading && brands.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <LayoutGrid className="mb-3 h-10 w-10 opacity-40" aria-hidden />
          <p>Loading inventory…</p>
        </div>
      ) : (viewMode === 'sub' && isMainWarehouseUser && !selectedLocationId) ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          Select a sub-warehouse to view its stock.
        </div>
      ) : (isMainWarehouseUser && viewMode === 'sub' && loadingSubWarehouseBrands) ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <LayoutGrid className="mb-3 h-10 w-10 opacity-40" aria-hidden />
          <p>Loading sub-warehouse stock…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          {search.trim() ? 'No brands match your filter.' : 'No main inventory to display yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex flex-row items-stretch gap-4">
            {filtered.map((brand) => (
              <BrandColumn
                key={brand.id}
                brand={brand}
                mode={isMainWarehouseUser ? viewMode : 'sub'}
                isMainWarehouseUser={isMainWarehouseUser}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
