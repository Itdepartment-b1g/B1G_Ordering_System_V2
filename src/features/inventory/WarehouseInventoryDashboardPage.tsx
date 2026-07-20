import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, LayoutGrid, List, Package, RefreshCw, Search } from 'lucide-react';
import { type Brand, type Variant } from './InventoryContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { WarehouseBatchAgingPanel } from './components/WarehouseBatchAgingPanel';
import { WarehouseFsnPanel } from './components/WarehouseFsnPanel';
import { WarehouseProductMovementPanel } from './components/WarehouseProductMovementPanel';
import { WarehouseStockBoardSettingsButton } from './components/WarehouseStockBoardSettingsDialog';
import {
  getDisplayedStock,
  getStockBoardBadgeStyle,
  DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS,
  type StockBoardViewMode,
  type WarehouseStockBoardSettings,
} from './warehouseStockBoard';
import {
  invalidateWarehouseStockBoard,
  useWarehouseStockBoard,
  useWarehouseStockBoardSettings,
  type WarehouseStockBoardScope,
} from './useWarehouseStockBoard';
import { useWarehouseBatchAging } from './useWarehouseBatchAging';
import { useWarehouseFsnAnalysis } from './useWarehouseFsnAnalysis';
import { useWarehouseProductMovement } from './useWarehouseProductMovement';
import { type FsnPeriodDays } from './warehouseFsnAnalysis';
import { type DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import {
  formatDateForInput,
  getDatePresetLabel,
  getDateRangeFromPreset,
} from '@/lib/dateRangePresets';
import GettingStartedDialog from '@/features/inventory/warehouse-manual/components/GettingStartedDialog';
import { isGettingStartedDismissed } from '@/features/inventory/warehouse-manual/utils/warehouseGettingStartedDismiss';

/** Order variant-type columns: known types first, then alphabetical. */
const TYPE_SORT_ORDER: string[] = ['flavor', 'battery', 'POSM', 'posm'];

type DashboardViewMode = StockBoardViewMode;
type DashboardSection = 'stock' | 'movement' | 'fsn' | 'aging';

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

function getDisplayedStockForBoard(
  v: Variant,
  opts: { mode: DashboardViewMode; isMainWarehouseUser: boolean }
): number {
  return getDisplayedStock(v, opts);
}

function totalStock(variants: Variant[], opts: { mode: DashboardViewMode; isMainWarehouseUser: boolean }): number {
  return variants.reduce((s, v) => s + getDisplayedStockForBoard(v, opts), 0);
}

function VariantRows({
  variants,
  mode,
  isMainWarehouseUser,
  settings,
}: {
  variants: Variant[];
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
  settings: WarehouseStockBoardSettings;
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
            className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[2.75rem] text-center"
            style={getStockBoardBadgeStyle(v.status, settings.colors)}
          >
            {getDisplayedStockForBoard(v, { mode, isMainWarehouseUser })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Footer label per `variant_type` (matches common warehouse wording). */
function totalLabelForType(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'TOTAL PODS';
  if (t === 'battery') return 'TOTAL DEVICE';
  return `TOTAL ${typeKey.toUpperCase()}`;
}

function TypeColumn({
  typeKey,
  variants,
  mode,
  isMainWarehouseUser,
  settings,
  className,
}: {
  typeKey: string;
  variants: Variant[];
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
  settings: WarehouseStockBoardSettings;
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
        <VariantRows
          variants={variants}
          mode={mode}
          isMainWarehouseUser={isMainWarehouseUser}
          settings={settings}
        />
      </div>
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-primary/20 bg-primary px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
        <span className="min-w-0 leading-tight">{label}:</span>
        <span className="shrink-0 tabular-nums">{sum}</span>
      </div>
    </div>
  );
}

/** Brand cards fill their grid cell (2 columns on md+). */
function brandCardWidthClass(_columnCount: number): string {
  return 'w-full min-w-0';
}

function BrandColumn({
  brand,
  mode,
  isMainWarehouseUser,
  settings,
}: {
  brand: Brand;
  mode: DashboardViewMode;
  isMainWarehouseUser: boolean;
  settings: WarehouseStockBoardSettings;
}) {
  const typeEntries = sortTypeEntries(getVariantsByTypeEntries(brand));

  if (typeEntries.length === 0) {
    return (
      <div
        className={cn(
          'flex w-full min-w-0 flex-col rounded-lg border border-border bg-card shadow-sm',
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
        'flex w-full min-w-0 flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden',
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
            settings={settings}
          />
        ))}
      </div>
    </div>
  );
}

export default function WarehouseInventoryDashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardViewMode>('available');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('stock');
  const [fsnPeriodDays, setFsnPeriodDays] = useState<FsnPeriodDays>(90);
  const [movementDateRangeFilter, setMovementDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'this_year',
  });
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || !user?.company_id) return;
    if (!isGettingStartedDismissed(user.id, user.company_id)) {
      setGettingStartedOpen(true);
    }
  }, [user?.id, user?.company_id]);

  const isWarehouse = user?.role === 'warehouse';
  const canEditStockBoardSettings =
    user?.role === 'warehouse' || user?.role === 'admin' || user?.role === 'super_admin';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;
  const isUnlinkedWarehouseUser = isWarehouse && membership.status === 'unlinked';

  const { data: stockBoardSettings = DEFAULT_WAREHOUSE_STOCK_BOARD_SETTINGS } =
    useWarehouseStockBoardSettings({
      companyId: user?.company_id,
      enabled: !!user?.company_id,
    });

  type LocationRow = { id: string; name: string; is_main: boolean };

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
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

  const stockBoardScope = useMemo((): WarehouseStockBoardScope | null => {
    if (!user?.company_id) return null;
    if (membership.status === 'sub') {
      return { kind: 'sub', locationId: membership.locationId ?? user.id ?? 'sub-user' };
    }
    if (viewMode === 'sub') {
      if (!selectedLocationId) return null;
      return { kind: 'sub', locationId: selectedLocationId };
    }
    return { kind: 'main', mode: viewMode };
  }, [user?.company_id, user?.id, membership.status, membership.locationId, viewMode, selectedLocationId]);

  const stockBoardCatalogEnabled =
    !!user?.company_id &&
    !!stockBoardScope &&
    (dashboardSection === 'stock' ||
      dashboardSection === 'movement' ||
      dashboardSection === 'fsn' ||
      dashboardSection === 'aging');

  const {
    brands: stockBoardBrands,
    isLoading: loadingStockBoard,
    isFetching: fetchingStockBoard,
    refetch: refetchStockBoard,
  } = useWarehouseStockBoard({
    companyId: user?.company_id,
    userId: user?.id,
    membershipStatus: membership.status,
    scope: stockBoardScope,
    settings: stockBoardSettings,
    enabled: stockBoardCatalogEnabled,
  });

  const subLocations = useMemo(() => locations.filter((l) => !l.is_main), [locations]);
  const mainLocation = useMemo(() => locations.find((l) => l.is_main) ?? null, [locations]);

  /** FSN uses the same location scope as the stock board (main vs selected sub). */
  const fsnLocationId = useMemo(() => {
    if (!isWarehouse) return null;
    if (!isMainWarehouseUser) return membership.locationId;
    if (viewMode === 'sub' && selectedLocationId) return selectedLocationId;
    if (viewMode === 'available' || viewMode === 'overall') return mainLocation?.id ?? null;
    return null;
  }, [
    isWarehouse,
    isMainWarehouseUser,
    membership.locationId,
    viewMode,
    selectedLocationId,
    mainLocation?.id,
  ]);

  const fsnLocationLabel = useMemo(() => {
    if (!isMainWarehouseUser) {
      return membership.status === 'sub' ? 'This sub-warehouse' : 'Your warehouse location';
    }
    if (viewMode === 'sub' && selectedLocationId) {
      const loc = locations.find((l) => l.id === selectedLocationId);
      return loc ? `Sub: ${loc.name}` : 'Selected sub-warehouse';
    }
    return mainLocation?.name ? `Main: ${mainLocation.name}` : 'Main warehouse';
  }, [
    isMainWarehouseUser,
    membership.status,
    viewMode,
    selectedLocationId,
    locations,
    mainLocation?.name,
  ]);

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

  const displayedBrands = stockBoardBrands;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return displayedBrands;
    return displayedBrands.filter((b) => {
      if (b.name.toLowerCase().includes(q)) return true;
      return b.allVariants.some((v) => v.name.toLowerCase().includes(q));
    });
  }, [displayedBrands, search]);

  const fsnCatalogBrands = displayedBrands;

  const movementDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        movementDateRangeFilter.preset,
        movementDateRangeFilter.customStart,
        movementDateRangeFilter.customEnd
      ),
    [movementDateRangeFilter]
  );

  const movementDateRangeLabel = useMemo(
    () =>
      getDatePresetLabel(
        movementDateRangeFilter.preset,
        movementDateRangeFilter.customStart,
        movementDateRangeFilter.customEnd
      ),
    [movementDateRangeFilter]
  );

  const movementDateRangeKey = useMemo(() => {
    const { start, end } = movementDateRange;
    return [
      movementDateRangeFilter.preset,
      start ? formatDateForInput(start) : '',
      end ? formatDateForInput(end) : '',
    ].join('|');
  }, [movementDateRange, movementDateRangeFilter.preset]);

  const reportQueryEnabled =
    (dashboardSection === 'movement' || dashboardSection === 'fsn' || dashboardSection === 'aging') &&
    !!user?.company_id &&
    !!fsnLocationId &&
    !(isMainWarehouseUser && viewMode === 'sub' && !selectedLocationId);

  const {
    data: movementRows = [],
    isLoading: loadingMovement,
    error: movementError,
  } = useWarehouseProductMovement({
    companyId: user?.company_id,
    locationId: fsnLocationId,
    rangeStart: movementDateRange.start,
    rangeEnd: movementDateRange.end,
    rangeKey: movementDateRangeKey,
    brands: fsnCatalogBrands,
    enabled: reportQueryEnabled && dashboardSection === 'movement',
  });

  const {
    data: fsnRows = [],
    isLoading: loadingFsn,
    error: fsnError,
  } = useWarehouseFsnAnalysis({
    companyId: user?.company_id,
    locationId: fsnLocationId,
    periodDays: fsnPeriodDays,
    brands: fsnCatalogBrands,
    enabled: reportQueryEnabled && dashboardSection === 'fsn',
  });

  const {
    data: agingRows = [],
    isLoading: loadingAging,
    error: agingError,
  } = useWarehouseBatchAging({
    companyId: user?.company_id,
    locationId: fsnLocationId,
    enabled: reportQueryEnabled && dashboardSection === 'aging',
  });

  const stockScopeHint = useMemo(() => {
    if (isWarehouse && membership.status === 'sub') return 'Showing this sub-warehouse stock.';
    if (isMainWarehouseUser) {
      if (viewMode === 'available') return 'Showing available stock (main stock minus allocated).';
      if (viewMode === 'overall') return 'Showing overall stock (main stock, including allocated).';
      return 'Showing selected sub-warehouse stock.';
    }
    return 'Showing available stock.';
  }, [isWarehouse, membership.status, isMainWarehouseUser, viewMode]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (dashboardSection === 'stock') {
        await refetchStockBoard();
      } else {
        await invalidateWarehouseStockBoard(qc, user?.company_id);
      }

      if (fsnLocationId) {
        await qc.invalidateQueries({
          queryKey: ['warehouse-product-movement', user?.company_id, fsnLocationId],
        });
        await qc.invalidateQueries({
          queryKey: ['warehouse-fsn-movement', user?.company_id, fsnLocationId],
        });
        await qc.invalidateQueries({
          queryKey: ['warehouse-batch-aging', user?.company_id, fsnLocationId],
        });
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-full">
      <GettingStartedDialog open={gettingStartedOpen} onOpenChange={setGettingStartedOpen} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {dashboardSection === 'movement'
              ? `Product movement by SKU — ${movementDateRangeLabel}. ${fsnLocationLabel}.`
              : dashboardSection === 'fsn'
                ? `FSN analysis (transfer PO fulfillments). ${fsnLocationLabel}.`
                : dashboardSection === 'aging'
                  ? `Batch aging (days in warehouse). ${fsnLocationLabel}.`
                  : stockScopeHint}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMainWarehouseUser && dashboardSection === 'stock' && (
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
          {isMainWarehouseUser &&
            (dashboardSection === 'movement' || dashboardSection === 'fsn' || dashboardSection === 'aging') && (
            <>
              <div className="w-full sm:hidden">
                <Label className="sr-only">Location for FSN</Label>
                <Select value={activeViewKey} onValueChange={handleQuickViewChange}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Main warehouse</SelectItem>
                    {subLocations.map((loc) => (
                      <SelectItem key={loc.id} value={`sub:${loc.id}`}>
                        Sub: {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:block">
                <div className="max-w-[min(720px,70vw)] rounded-md border bg-muted/20 p-1">
                  <div className="overflow-x-auto">
                    <ToggleGroup
                      type="single"
                      value={activeViewKey === 'overall' ? 'available' : activeViewKey}
                      onValueChange={handleQuickViewChange}
                      className="w-max justify-start gap-1"
                      aria-label="FSN location scope"
                    >
                      <ToggleGroupItem value="available" size="sm" aria-label="Main warehouse FSN">
                        Main
                      </ToggleGroupItem>
                      {subLocations.map((loc) => (
                        <ToggleGroupItem
                          key={loc.id}
                          value={`sub:${loc.id}`}
                          size="sm"
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={(dashboardSection === 'stock' ? loadingStockBoard : false) || refreshing || fetchingStockBoard}
          >
            <RefreshCw
              className={cn(
                'mr-2 h-4 w-4',
                (refreshing || fetchingStockBoard || loadingStockBoard) && 'animate-spin'
              )}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>

      {isUnlinkedWarehouseUser && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          This warehouse account isn’t linked to a warehouse location yet. Showing main stock by default.
        </div>
      )}

      <Tabs
        value={dashboardSection}
        onValueChange={(v) => setDashboardSection(v as DashboardSection)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="stock" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Stock board
          </TabsTrigger>
          <TabsTrigger value="movement" className="gap-1.5">
            <Package className="h-4 w-4" aria-hidden />
            Product movement
          </TabsTrigger>
          <TabsTrigger value="fsn" className="gap-1.5">
            <BarChart3 className="h-4 w-4" aria-hidden />
            FSN analysis
          </TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5">
            <Clock className="h-4 w-4" aria-hidden />
            Batch aging
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder={
                dashboardSection === 'aging'
                  ? 'Filter batch #, brand, or variant…'
                  : 'Filter brands or variant names…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Filter dashboard"
            />
          </div>
          {dashboardSection === 'stock' ? (
            <div className="flex flex-wrap items-center gap-3">
              {canEditStockBoardSettings ? (
                <WarehouseStockBoardSettingsButton
                  companyId={user?.company_id}
                  settings={stockBoardSettings}
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: stockBoardSettings.colors.outOfStock }}
                    aria-hidden
                  />
                  Out of stock
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: stockBoardSettings.colors.lowStock }}
                    aria-hidden
                  />
                  Low stock (≤
                  {stockBoardSettings.usePerSkuReorderLevel ? ' SKU or ' : ' '}
                  {stockBoardSettings.lowStockThreshold})
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: stockBoardSettings.colors.inStock }}
                    aria-hidden
                  />
                  In stock
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <TabsContent value="stock" className="mt-0 space-y-0">
      {loadingStockBoard && displayedBrands.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <LayoutGrid className="mb-3 h-10 w-10 opacity-40" aria-hidden />
          <p>Loading inventory…</p>
        </div>
      ) : isMainWarehouseUser && viewMode === 'sub' && !selectedLocationId ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          Select a sub-warehouse to view its stock.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
          {search.trim() ? 'No brands match your filter.' : 'No main inventory to display yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2">
            {filtered.map((brand) => (
              <BrandColumn
                key={brand.id}
                brand={brand}
                mode={isMainWarehouseUser ? viewMode : 'sub'}
                isMainWarehouseUser={isMainWarehouseUser}
                settings={stockBoardSettings}
              />
            ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="movement" className="mt-0">
          {!fsnLocationId ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
              {isMainWarehouseUser && loadingLocations
                ? 'Loading warehouse locations…'
                : isMainWarehouseUser && viewMode === 'sub' && !selectedLocationId
                  ? 'Select a sub-warehouse to view product movement for that location.'
                  : 'Warehouse location is not configured yet. Link this account to a location to view product movement.'}
            </div>
          ) : (
            <WarehouseProductMovementPanel
              rows={movementRows}
              loading={loadingMovement}
              error={movementError}
              dateRangeFilter={movementDateRangeFilter}
              onDateRangeFilterChange={setMovementDateRangeFilter}
              dateRangeLabel={movementDateRangeLabel}
              locationLabel={fsnLocationLabel}
              search={search}
            />
          )}
        </TabsContent>

        <TabsContent value="fsn" className="mt-0">
          {!fsnLocationId ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
              {isMainWarehouseUser && loadingLocations
                ? 'Loading warehouse locations…'
                : isMainWarehouseUser && viewMode === 'sub' && !selectedLocationId
                  ? 'Select a sub-warehouse to view FSN for that location.'
                  : 'Warehouse location is not configured yet. Link this account to a location to run FSN analysis.'}
            </div>
          ) : (
            <WarehouseFsnPanel
              rows={fsnRows}
              loading={loadingFsn}
              error={fsnError}
              periodDays={fsnPeriodDays}
              onPeriodDaysChange={setFsnPeriodDays}
              locationLabel={fsnLocationLabel}
              search={search}
            />
          )}
        </TabsContent>

        <TabsContent value="aging" className="mt-0">
          {!fsnLocationId ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 py-16 text-center text-muted-foreground">
              {isMainWarehouseUser && loadingLocations
                ? 'Loading warehouse locations…'
                : isMainWarehouseUser && viewMode === 'sub' && !selectedLocationId
                  ? 'Select a sub-warehouse to view batch aging for that location.'
                  : 'Warehouse location is not configured yet. Link this account to a location to view batch aging.'}
            </div>
          ) : (
            <WarehouseBatchAgingPanel
              rows={agingRows}
              loading={loadingAging}
              error={agingError}
              locationLabel={fsnLocationLabel}
              search={search}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
