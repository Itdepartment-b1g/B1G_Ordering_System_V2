import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import {
  fetchStockMovements,
  fetchWarehouseLocationsForMovements,
  STOCK_MOVEMENTS_QUERY_KEY,
  summarizeStockMovements,
  type StockMovementRow,
} from './stock-movements/stockMovementsApi';
import {
  friendlyTechnicalLocationLabel,
  STOCK_MOVEMENT_CATEGORY_FILTER_OPTIONS,
  STOCK_MOVEMENT_CATEGORY_LABELS,
  type StockMovementCategory,
} from './stock-movements/stockMovementTypes';

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

type SortKey =
  | 'createdAt'
  | 'typeLabel'
  | 'productName'
  | 'quantity'
  | 'fromLabel'
  | 'toLabel'
  | 'performedByName';

const DEFAULT_SORT_KEY: SortKey = 'createdAt';
const DEFAULT_SORT_DIRECTION = 'desc' as const;

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function sortMovements(
  rows: StockMovementRow[],
  key: SortKey,
  direction: 'asc' | 'desc'
): StockMovementRow[] {
  const sorted = [...rows].sort((a, b) => {
    switch (key) {
      case 'createdAt':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'quantity':
        return a.quantity - b.quantity;
      case 'typeLabel':
        return compareText(a.typeLabel, b.typeLabel);
      case 'productName':
        return compareText(a.productName, b.productName);
      case 'fromLabel':
        return compareText(a.fromLabel, b.fromLabel);
      case 'toLabel':
        return compareText(a.toLabel, b.toLabel);
      case 'performedByName':
        return compareText(a.performedByName, b.performedByName);
      default:
        return 0;
    }
  });
  return direction === 'asc' ? sorted : sorted.reverse();
}

function directionBadge(row: StockMovementRow) {
  if (row.direction === 'in') {
    return (
      <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
        <ArrowDownLeft className="h-3 w-3" />
        In
      </Badge>
    );
  }
  if (row.direction === 'out') {
    return (
      <Badge className="gap-1 border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50">
        <ArrowUpRight className="h-3 w-3" />
        Out
      </Badge>
    );
  }
  if (row.direction === 'transfer') {
    return (
      <Badge className="gap-1 border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50">
        <ArrowLeftRight className="h-3 w-3" />
        Transfer
      </Badge>
    );
  }
  return <Badge variant="secondary">—</Badge>;
}

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  client_order: 'Client order',
  client_order_return: 'Client return',
  tl_stock_request: 'TL stock transfer',
  allocation_history: 'Allocation',
  warehouse_allocation_history: 'Warehouse allocation',
  warehouse_stock_request: 'Warehouse stock request',
  warehouse_stock_return: 'Warehouse stock return',
  warehouse_stock_adjustment: 'Stock adjustment',
  internal_stock_requests: 'Sub-stock request',
  purchase_order: 'Purchase order',
  standard_account_stock_return: 'Standard Account return',
  rebate_return: 'Rebate return',
  rebate_return_receipt: 'Rebate return receipt',
};

function formatReference(row: StockMovementRow): string {
  if (!row.referenceType) return '—';
  return (
    REFERENCE_TYPE_LABELS[row.referenceType] ??
    row.referenceType.replace(/_/g, ' ')
  );
}

function LocationPartyCell({
  label,
  partyTag,
}: {
  label: string;
  partyTag: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span>{friendlyTechnicalLocationLabel(label)}</span>
      {partyTag ? (
        <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
          {partyTag}
        </Badge>
      ) : null}
    </div>
  );
}

export default function StockMovementsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });
  const isBagScopedRole =
    user?.role === 'team_leader' ||
    user?.role === 'mobile_sales' ||
    user?.role === 'sales_agent';
  // Admin / super_admin see company-wide data; only sub-warehouse users are location-scoped.
  const canFilterAllLocations = !isBagScopedRole && (!isWarehouse || membership.isMain);

  const brandFilter = searchParams.get('brandId') || 'all';
  const variantFilter = searchParams.get('variantId') || 'all';
  const agentFilter = searchParams.get('agentId') || 'all';

  const patchSearchParams = useCallback(
    (patch: {
      brandId?: string;
      variantId?: string | null;
      agentId?: string | null;
    }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (patch.brandId !== undefined) {
            if (!patch.brandId || patch.brandId === 'all') next.delete('brandId');
            else next.set('brandId', patch.brandId);
          }
          if (patch.variantId !== undefined) {
            if (!patch.variantId || patch.variantId === 'all') next.delete('variantId');
            else next.set('variantId', patch.variantId);
          }
          if (patch.agentId !== undefined) {
            if (!patch.agentId || patch.agentId === 'all') next.delete('agentId');
            else next.set('agentId', patch.agentId);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<StockMovementCategory | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [sortState, setSortState] = useState<TableSortCycleState<SortKey>>(createInitialTableSortCycle);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const scopeLocationId =
    isWarehouse && !membership.isMain ? membership.locationId : null;
  const scopeAgentId = isBagScopedRole ? user?.id ?? null : null;

  const { data: locations = [] } = useQuery({
    queryKey: [STOCK_MOVEMENTS_QUERY_KEY, 'locations', user?.company_id],
    enabled: !!user?.company_id && canFilterAllLocations,
    queryFn: () => fetchWarehouseLocationsForMovements(user!.company_id!),
  });

  const {
    data: movements = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      STOCK_MOVEMENTS_QUERY_KEY,
      user?.company_id,
      user?.id,
      user?.role,
      scopeLocationId,
      scopeAgentId,
    ],
    enabled: !!user?.company_id,
    queryFn: () =>
      fetchStockMovements({
        companyId: user!.company_id!,
        scopeWarehouseLocationId: scopeLocationId,
        scopeAgentId,
      }),
  });

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of movements) {
      if (row.brandId) map.set(row.brandId, row.brandName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => compareText(a.name, b.name));
  }, [movements]);

  const variantOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; brandId: string | null }>();
    for (const row of movements) {
      if (brandFilter !== 'all' && row.brandId !== brandFilter) continue;
      if (!map.has(row.variantId)) {
        map.set(row.variantId, {
          id: row.variantId,
          name: row.variantName,
          brandId: row.brandId,
        });
      }
    }
    // Keep deep-linked variant selectable even when it has no ledger rows yet.
    if (variantFilter !== 'all' && !map.has(variantFilter)) {
      map.set(variantFilter, {
        id: variantFilter,
        name: 'Selected variant',
        brandId: brandFilter === 'all' ? null : brandFilter,
      });
    }
    return Array.from(map.values()).sort((a, b) => compareText(a.name, b.name));
  }, [brandFilter, movements, variantFilter]);

  const focusedProductLabel = useMemo(() => {
    if (variantFilter !== 'all') {
      const match = movements.find((row) => row.variantId === variantFilter);
      if (match) return match.productName;
      const option = variantOptions.find((v) => v.id === variantFilter);
      if (option) {
        const brandName =
          brandOptions.find((b) => b.id === option.brandId)?.name ??
          (brandFilter !== 'all'
            ? brandOptions.find((b) => b.id === brandFilter)?.name
            : null);
        return brandName ? `${brandName} ${option.name}` : option.name;
      }
    }
    if (brandFilter !== 'all') {
      return brandOptions.find((b) => b.id === brandFilter)?.name ?? null;
    }
    return null;
  }, [brandFilter, brandOptions, movements, variantFilter, variantOptions]);

  const focusedAgentLabel = useMemo(() => {
    if (agentFilter === 'all') return null;
    const needle = `agent_inventory:${agentFilter}`;
    const match = movements.find(
      (row) => row.fromLocationRaw === needle || row.toLocationRaw === needle
    );
    if (!match) return 'Selected holder';
    if (match.fromLocationRaw === needle) return match.fromLabel;
    if (match.toLocationRaw === needle) return match.toLabel;
    return 'Selected holder';
  }, [agentFilter, movements]);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const mainLocationId = useMemo(
    () => locations.find((l) => l.is_main)?.id ?? null,
    [locations]
  );

  const filteredMovements = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const locationNeedle =
      canFilterAllLocations && locationFilter !== 'all'
        ? `warehouse_location:${locationFilter}`
        : null;
    const includeMainInventoryText =
      !!locationNeedle && !!mainLocationId && locationFilter === mainLocationId;

    return movements.filter((row) => {
      if (!isDateInRange(new Date(row.createdAt), dateRange.start, dateRange.end)) {
        return false;
      }
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (brandFilter !== 'all' && row.brandId !== brandFilter) return false;
      if (variantFilter !== 'all' && row.variantId !== variantFilter) return false;
      if (agentFilter !== 'all') {
        const agentNeedle = `agent_inventory:${agentFilter}`;
        if (row.fromLocationRaw !== agentNeedle && row.toLocationRaw !== agentNeedle) {
          return false;
        }
      }
      if (locationNeedle) {
        const touchesWarehouseKey =
          row.fromLocationRaw === locationNeedle || row.toLocationRaw === locationNeedle;
        const touchesMainText =
          includeMainInventoryText &&
          (row.fromLocationRaw === 'main_inventory' || row.toLocationRaw === 'main_inventory');
        if (!touchesWarehouseKey && !touchesMainText) return false;
      }
      if (!term) return true;

      return (
        row.productName.toLowerCase().includes(term) ||
        row.brandName.toLowerCase().includes(term) ||
        row.variantName.toLowerCase().includes(term) ||
        row.typeLabel.toLowerCase().includes(term) ||
        row.fromLabel.toLowerCase().includes(term) ||
        row.toLabel.toLowerCase().includes(term) ||
        row.performedByName.toLowerCase().includes(term) ||
        (row.notes ?? '').toLowerCase().includes(term) ||
        (row.referenceType ?? '').toLowerCase().includes(term) ||
        (row.referenceId ?? '').toLowerCase().includes(term)
      );
    });
  }, [
    agentFilter,
    brandFilter,
    categoryFilter,
    dateRange.end,
    dateRange.start,
    canFilterAllLocations,
    locationFilter,
    mainLocationId,
    movements,
    searchQuery,
    variantFilter,
  ]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () => resolveTableSortDirection(sortState, DEFAULT_SORT_KEY, DEFAULT_SORT_DIRECTION),
    [sortState]
  );

  const sortedMovements = useMemo(
    () => sortMovements(filteredMovements, resolvedSortKey, resolvedSortDirection),
    [filteredMovements, resolvedSortDirection, resolvedSortKey]
  );

  const summary = useMemo(() => summarizeStockMovements(filteredMovements), [filteredMovements]);

  const totalPages = Math.max(1, Math.ceil(sortedMovements.length / pageSize));
  const paginatedMovements = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedMovements.slice(start, start + pageSize);
  }, [page, pageSize, sortedMovements]);

  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    categoryFilter,
    brandFilter,
    variantFilter,
    agentFilter,
    locationFilter,
    dateRangeFilter,
    pageSize,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // If deep-linked variant belongs to another brand, drop the stale brand filter.
  useEffect(() => {
    if (variantFilter === 'all' || brandFilter === 'all' || movements.length === 0) return;
    const match = movements.find((row) => row.variantId === variantFilter);
    if (match?.brandId && match.brandId !== brandFilter) {
      patchSearchParams({ brandId: match.brandId, variantId: variantFilter });
    }
  }, [brandFilter, movements, patchSearchParams, variantFilter]);

  const paginationStart = sortedMovements.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, sortedMovements.length);

  const handleSort = (key: SortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const clearProductFilters = () => {
    patchSearchParams({ brandId: 'all', variantId: 'all', agentId: 'all' });
  };

  const pageTitle = isBagScopedRole
    ? 'Stock movements (your bag)'
    : canFilterAllLocations
      ? 'Stock movements'
      : 'Stock movements (your location)';
  const pageDescription = isBagScopedRole
    ? 'Recorded inventory transactions that touch your assigned stock.'
    : canFilterAllLocations
      ? 'Recorded inventory transactions across warehouse and agent locations.'
      : 'Recorded inventory transactions that touch your assigned sub-warehouse.';

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div>
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-7 w-7 text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        </div>
        <p className="text-muted-foreground">{pageDescription}</p>
        {focusedProductLabel || focusedAgentLabel ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {focusedProductLabel ? (
              <Badge variant="secondary" className="text-sm font-normal whitespace-normal">
                Product: {focusedProductLabel}
              </Badge>
            ) : null}
            {focusedAgentLabel ? (
              <Badge variant="secondary" className="text-sm font-normal whitespace-normal">
                Holder: {focusedAgentLabel}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2"
              onClick={clearProductFilters}
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Movements</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{summary.movementCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Units in</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-emerald-700">
              +{summary.unitsIn}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Units out</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-rose-700">
              −{summary.unitsOut}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net / transfers</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {summary.netUnits > 0 ? '+' : ''}
              {summary.netUnits}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {summary.transferCount} transfer
              {summary.transferCount === 1 ? '' : 's'} ({summary.transferUnits} units)
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>
            Sourced from existing inventory transaction records. Sales that never wrote a ledger
            row will not appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search product, type, location, user, reference…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="w-full lg:w-[220px] justify-between h-10 shrink-0"
              align="end"
            />
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as StockMovementCategory | 'all')}
            >
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MOVEMENT_CATEGORY_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={brandFilter}
              onValueChange={(value) => {
                patchSearchParams({
                  brandId: value,
                  variantId: 'all',
                });
              }}
            >
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {brandOptions.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={variantFilter}
              onValueChange={(value) => {
                if (value === 'all') {
                  patchSearchParams({ variantId: 'all' });
                  return;
                }
                const option = variantOptions.find((v) => v.id === value);
                patchSearchParams({
                  brandId: option?.brandId || brandFilter,
                  variantId: value,
                });
              }}
            >
              <SelectTrigger className="w-full lg:w-[200px]">
                <SelectValue placeholder="Variant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All variants</SelectItem>
                {variantOptions.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canFilterAllLocations && locations.length > 0 && (
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full lg:w-[220px]">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.is_main ? `Main: ${loc.name}` : loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading stock movements…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Could not load stock movements. Please try again.
            </div>
          ) : filteredMovements.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {movements.length === 0
                ? 'No inventory transactions recorded yet.'
                : 'No movements match the selected filters.'}
            </p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Date"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Type"
                      sortKey="typeLabel"
                      sortDirection={getTableSortDisplayDirection(sortState, 'typeLabel')}
                      onSort={handleSort}
                    />
                    <TableHead>Direction</TableHead>
                    <SortableTableHead
                      label="Product"
                      sortKey="productName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'productName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Qty"
                      sortKey="quantity"
                      sortDirection={getTableSortDisplayDirection(sortState, 'quantity')}
                      onSort={handleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="From location"
                      sortKey="fromLabel"
                      sortDirection={getTableSortDisplayDirection(sortState, 'fromLabel')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="To location"
                      sortKey="toLabel"
                      sortDirection={getTableSortDisplayDirection(sortState, 'toLabel')}
                      onSort={handleSort}
                    />
                    <TableHead>Linked to</TableHead>
                    <SortableTableHead
                      label="Done by"
                      sortKey="performedByName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'performedByName')}
                      onSort={handleSort}
                    />
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMovements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(row.createdAt), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="font-medium">{row.typeLabel}</div>
                          <Badge variant="outline" className="text-[10px]">
                            {STOCK_MOVEMENT_CATEGORY_LABELS[row.category]}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{directionBadge(row)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{row.productName}</span>
                          {row.variantType ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] font-normal"
                            >
                              {row.variantType}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                        {row.direction === 'in' ? '+' : row.direction === 'out' ? '−' : ''}
                        {row.quantity}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <LocationPartyCell label={row.fromLabel} partyTag={row.fromPartyTag} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <LocationPartyCell label={row.toLabel} partyTag={row.toPartyTag} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatReference(row)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{row.performedByName}</span>
                          {row.performedByRoleTag ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px] font-normal"
                            >
                              {row.performedByRoleTag}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[12rem] whitespace-normal text-muted-foreground">
                        {row.notes?.trim() || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {paginationStart}–{paginationEnd} of {sortedMovements.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stock-movements-page-size" className="whitespace-nowrap text-xs">
                      Rows per page
                    </Label>
                    <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                      <SelectTrigger id="stock-movements-page-size" className="h-8 w-[72px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="min-w-[100px] text-center tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
