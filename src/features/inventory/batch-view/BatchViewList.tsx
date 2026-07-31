import { useEffect, useMemo, useState } from 'react';
import { FileDown, Layers, Loader2, Package, RefreshCw, Warehouse } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { useWarehouseLocationMembership } from '@/features/inventory/useWarehouseLocationMembership';
import { useCompanyBrands } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyBrands';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';

import { BatchViewFilter } from './filter/Filter';
import { useWarehouseBatchInventory } from './hooks/useWarehouseBatchInventory';
import { useWarehouseLocations } from './hooks/useWarehouseLocations';
import { BatchViewTable } from './table/BatchViewTable';
import {
  ALL_WAREHOUSES_FILTER_VALUE,
  filterBatchInventoryGroups,
  getBatchInventoryDateBounds,
  hasBatchInventoryDateFilter,
  summarizeBatchInventory,
} from './utils/batchInventoryFilters';
import {
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  createInitialTableSortCycle,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { exportBatchInventoryExcel } from './utils/exportBatchInventoryExcel';
import {
  DEFAULT_BATCH_VIEW_SORT_DIRECTION,
  DEFAULT_BATCH_VIEW_SORT_KEY,
  sortBatchInventoryGroups,
  type BatchViewSortKey,
} from './utils/batchInventorySorting';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import BatchViewManual from '@/features/inventory/warehouse-manual/components/BatchViewManual';

export default function BatchViewList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });

  const isMainWarehouseUser = membership.isMain;
  const { data: locations = [], isLoading: isLoadingLocations } = useWarehouseLocations(
    user?.company_id,
    isWarehouse && isMainWarehouseUser
  );

  const [selectedLocationId, setSelectedLocationId] = useState(
    isMainWarehouseUser ? ALL_WAREHOUSES_FILTER_VALUE : ''
  );
  const [search, setSearch] = useState('');
  const [brandId, setBrandId] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [isExportingFiltered, setIsExportingFiltered] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [sortState, setSortState] =
    useState<TableSortCycleState<BatchViewSortKey>>(createInitialTableSortCycle);

  useEffect(() => {
    if (!isMainWarehouseUser && membership.locationId) {
      setSelectedLocationId(membership.locationId);
      return;
    }
    if (isMainWarehouseUser && !selectedLocationId) {
      setSelectedLocationId(ALL_WAREHOUSES_FILTER_VALUE);
    }
  }, [isMainWarehouseUser, membership.locationId, selectedLocationId]);

  const activeLocationId = isMainWarehouseUser
    ? selectedLocationId || ALL_WAREHOUSES_FILTER_VALUE
    : membership.locationId;

  const locationLabel = useMemo(() => {
    if (isMainWarehouseUser && activeLocationId === ALL_WAREHOUSES_FILTER_VALUE) {
      return 'all warehouses';
    }
    if (!activeLocationId) return 'selected location';
    const loc = locations.find((l) => l.id === activeLocationId);
    if (loc) return loc.name;
    if (!isMainWarehouseUser) return 'your sub-warehouse';
    return 'selected location';
  }, [activeLocationId, locations, isMainWarehouseUser]);

  const locationOptions = useMemo(
    () => locations.map((l) => ({ id: l.id, name: l.is_main ? `${l.name} (main)` : l.name })),
    [locations]
  );

  const {
    data: groups = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useWarehouseBatchInventory({
    companyId: user?.company_id,
    locationId: activeLocationId,
    enabled: isWarehouse && !!user?.company_id && !!activeLocationId,
  });

  const { data: companyBrands = [], isLoading: isLoadingBrands } = useCompanyBrands();

  useEffect(() => {
    if (isError && error) {
      toast({
        title: 'Failed to load batch inventory',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [isError, error, toast]);

  const { fromDate, toDate } = useMemo(
    () => getBatchInventoryDateBounds(dateRangeFilter),
    [dateRangeFilter]
  );

  const filteredGroups = useMemo(
    () => filterBatchInventoryGroups(groups, search, brandId, fromDate, toDate),
    [groups, search, brandId, fromDate, toDate]
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_BATCH_VIEW_SORT_KEY,
        DEFAULT_BATCH_VIEW_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedGroups = useMemo(
    () => sortBatchInventoryGroups(filteredGroups, resolvedSortKey, resolvedSortDirection),
    [filteredGroups, resolvedSortKey, resolvedSortDirection]
  );

  useEffect(() => {
    setPage(0);
  }, [search, brandId, dateRangeFilter, activeLocationId, sortState]);

  const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
    sortedGroups,
    page,
    pageSize
  );

  const summary = useMemo(() => summarizeBatchInventory(filteredGroups), [filteredGroups]);

  const handleSort = (key: BatchViewSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const hasActiveFilters =
    hasBatchInventoryDateFilter(dateRangeFilter) ||
    search.trim().length > 0 ||
    brandId.length > 0 ||
    (isMainWarehouseUser && activeLocationId !== ALL_WAREHOUSES_FILTER_VALUE);

  const clearFilters = () => {
    setSearch('');
    setBrandId('');
    setDateRangeFilter({ preset: 'all' });
    if (isMainWarehouseUser) {
      setSelectedLocationId(ALL_WAREHOUSES_FILTER_VALUE);
    }
  };

  const showLocationPicker = isMainWarehouseUser;

  const canExportFiltered = hasActiveFilters && filteredGroups.length > 0 && !isExportingFiltered;
  const canExportAll = groups.length > 0 && !isExportingAll;

  const onExportFiltered = async () => {
    try {
      setIsExportingFiltered(true);
      await exportBatchInventoryExcel(sortedGroups, 'batch_view_filtered');
      toast({ title: 'Export complete', description: 'Filtered batch inventory exported.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export filtered batch inventory.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingFiltered(false);
    }
  };

  const onExportAll = async () => {
    try {
      setIsExportingAll(true);
      await exportBatchInventoryExcel(groups, 'batch_view_all');
      toast({ title: 'Export complete', description: 'All batch inventory exported.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export all batch inventory.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <PageManualDialog
          title="Batch View Manual"
          fullManualHref="/warehouse-manual#batch-view"
        >
          <BatchViewManual embedded />
        </PageManualDialog>
        <Button
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching || !user?.company_id || !activeLocationId}
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
        <Button variant="outline" onClick={onExportFiltered} disabled={!canExportFiltered}>
          <FileDown className="mr-2 h-4 w-4" />
          Export filtered
        </Button>
        <Button variant="outline" onClick={onExportAll} disabled={!canExportAll}>
          <FileDown className="mr-2 h-4 w-4" />
          Export all
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Batches</CardDescription>
            <CardTitle className="text-2xl">{summary.batchCount}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            Active batches with stock
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>SKUs</CardDescription>
            <CardTitle className="text-2xl">{summary.skuCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            Total SKU lines in filtered batches
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total units</CardDescription>
            <CardTitle className="text-2xl">{summary.totalUnits.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <Warehouse className="h-3.5 w-3.5" />
            Units on hand in filtered batches
          </CardContent>
        </Card>
      </div>

      {!user?.company_id && (
        <Alert>
          <AlertTitle>No company linked to your profile</AlertTitle>
          <AlertDescription>
            Your account does not have a company_id, so batch inventory cannot be loaded.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Batch View</CardTitle>
          <CardDescription>
            Browse on-hand stock grouped by batch. Expand a batch to see brands and variants.
            {activeLocationId ? ` Showing: ${locationLabel}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <BatchViewFilter
            search={search}
            brandId={brandId}
            dateRangeFilter={dateRangeFilter}
            brandOptions={companyBrands}
            locationOptions={locationOptions}
            selectedLocationId={selectedLocationId}
            showLocationPicker={showLocationPicker}
            isLoadingBrands={isLoadingBrands}
            onSearchChange={setSearch}
            onBrandIdChange={setBrandId}
            onDateRangeFilterChange={setDateRangeFilter}
            onLocationChange={setSelectedLocationId}
            onClearFilters={clearFilters}
          />

          {hasActiveFilters && filteredGroups.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">No batches match the current filters.</p>
          )}

          <BatchViewTable
            isLoading={isLoading || (showLocationPicker && isLoadingLocations && !activeLocationId)}
            pagedGroups={pagedGroups}
            locationLabel={locationLabel}
            companyId={user?.company_id}
            sortState={sortState}
            onSort={handleSort}
          />

          <ListPagination
            pageSize={pageSize}
            safePage={safePage}
            pageCount={pageCount}
            rowsPerPageLabel="Batches per page"
            onPageSizeChange={setPageSize}
            onPrevious={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
