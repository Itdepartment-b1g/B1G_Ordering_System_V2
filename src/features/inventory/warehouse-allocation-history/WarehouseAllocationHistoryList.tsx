import { useEffect, useMemo, useState } from 'react';
import { FileDown, History, Loader2, Package, RefreshCw, Warehouse } from 'lucide-react';

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

import { WarehouseAllocationHistoryFilter } from './filter/Filter';
import { useWarehouseAllocationHistory } from './hooks/useWarehouseAllocationHistory';
import { useWarehouseAllocationHistoryOptions } from './hooks/useWarehouseAllocationHistoryOptions';
import { WarehouseAllocationHistoryTable } from './table/WarehouseAllocationHistoryTable';
import { exportWarehouseAllocationHistoryExcel } from './utils/exportWarehouseAllocationHistoryExcel';
import {
  getNextTableSortCycleState,
  createInitialTableSortCycle,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_WAREHOUSE_ALLOCATION_SORT_DIRECTION,
  DEFAULT_WAREHOUSE_ALLOCATION_SORT_KEY,
  sortWarehouseAllocationGroups,
  type WarehouseAllocationSortKey,
} from './utils/warehouseAllocationHistorySorting';
import {
  filterWarehouseAllocationGroups,
  getWarehouseAllocationHistoryDateBounds,
  hasWarehouseAllocationHistoryDateFilter,
  MULTIBRAND_FILTER_VALUE,
  type WarehouseAllocationFilterKey,
} from './utils/warehouseAllocationHistoryFilters';

export default function WarehouseAllocationHistoryList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });
  const { data: groups = [], isLoading, isError, error, refetch, isFetching } =
    useWarehouseAllocationHistory();
  const { data: companyBrands = [], isLoading: isLoadingBrands } = useCompanyBrands();
  const [selectedFilter, setSelectedFilter] = useState<WarehouseAllocationFilterKey>('all');
  const [filterValue, setFilterValue] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [isExportingFiltered, setIsExportingFiltered] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [sortState, setSortState] =
    useState<TableSortCycleState<WarehouseAllocationSortKey>>(createInitialTableSortCycle);

  const showLocationFilter = membership.isMain;

  useEffect(() => {
    if (isError && error) {
      toast({
        title: 'Failed to load allocation history',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [isError, error, toast]);

  const { locationOptions, performedByOptions, brandOptions } =
    useWarehouseAllocationHistoryOptions(groups, companyBrands);

  const { fromDate, toDate } = useMemo(
    () => getWarehouseAllocationHistoryDateBounds(dateRangeFilter),
    [dateRangeFilter]
  );

  const filteredGroups = useMemo(
    () =>
      filterWarehouseAllocationGroups(groups, selectedFilter, filterValue, fromDate, toDate),
    [groups, selectedFilter, filterValue, fromDate, toDate]
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_WAREHOUSE_ALLOCATION_SORT_KEY,
        DEFAULT_WAREHOUSE_ALLOCATION_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedGroups = useMemo(
    () => sortWarehouseAllocationGroups(filteredGroups, resolvedSortKey, resolvedSortDirection),
    [filteredGroups, resolvedSortKey, resolvedSortDirection]
  );

  const mainBrandFilterName = useMemo(() => {
    if (selectedFilter !== 'brand' || !filterValue.trim()) return null;
    if (filterValue === MULTIBRAND_FILTER_VALUE) return null;
    return companyBrands.find((b) => b.id === filterValue)?.name ?? null;
  }, [selectedFilter, filterValue, companyBrands]);

  useEffect(() => {
    setPage(0);
  }, [selectedFilter, filterValue, dateRangeFilter, sortState]);

  const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
    sortedGroups,
    page,
    pageSize
  );

  const handleSort = (key: WarehouseAllocationSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const summary = useMemo(() => {
    const sessionCount = filteredGroups.length;
    const skuCount = filteredGroups.reduce((sum, g) => sum + g.lineCount, 0);
    const totalUnits = filteredGroups.reduce((sum, g) => sum + g.totalQuantity, 0);
    return { sessionCount, skuCount, totalUnits };
  }, [filteredGroups]);

  const clearFilters = () => {
    setSelectedFilter('all');
    setFilterValue('');
    setDateRangeFilter({ preset: 'all' });
  };

  const hasActiveFilters =
    hasWarehouseAllocationHistoryDateFilter(dateRangeFilter) ||
    (selectedFilter !== 'all' && filterValue.trim().length > 0);

  const canExportFiltered = hasActiveFilters && filteredGroups.length > 0 && !isExportingFiltered;
  const canExportAll = groups.length > 0 && !isExportingAll;

  const onExportFiltered = async () => {
    try {
      setIsExportingFiltered(true);
      await exportWarehouseAllocationHistoryExcel(
        sortedGroups,
        'warehouse_allocation_history_filtered'
      );
      toast({ title: 'Export complete', description: 'Filtered allocation history exported.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export filtered history.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingFiltered(false);
    }
  };

  const onExportAll = async () => {
    try {
      setIsExportingAll(true);
      await exportWarehouseAllocationHistoryExcel(groups, 'warehouse_allocation_history_all');
      toast({ title: 'Export complete', description: 'All allocation history exported.' });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not export all history.',
        variant: 'destructive',
      });
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
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
            <CardDescription>Sessions</CardDescription>
            <CardTitle className="text-2xl">{summary.sessionCount}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            Filtered allocation sessions
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>SKUs</CardDescription>
            <CardTitle className="text-2xl">{summary.skuCount.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            Total variant lines
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Units</CardDescription>
            <CardTitle className="text-2xl">{summary.totalUnits.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
            <Warehouse className="h-3.5 w-3.5" />
            Units allocated in filtered rows
          </CardContent>
        </Card>
      </div>

      {!user?.company_id && (
        <Alert>
          <AlertTitle>No company linked to your profile</AlertTitle>
          <AlertDescription>
            Your account does not have a company_id, so allocation history cannot be loaded.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Allocation History</CardTitle>
          <CardDescription>
            Track stock allocations from main warehouse to sub-warehouses, including batch lot
            breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WarehouseAllocationHistoryFilter
            selectedFilter={selectedFilter}
            filterValue={filterValue}
            dateRangeFilter={dateRangeFilter}
            locationOptions={locationOptions}
            performedByOptions={performedByOptions}
            brandOptions={brandOptions}
            isLoadingBrands={isLoadingBrands}
            showLocationFilter={showLocationFilter}
            onSelectedFilterChange={setSelectedFilter}
            onFilterValueChange={setFilterValue}
            onDateRangeFilterChange={setDateRangeFilter}
            onClearFilters={clearFilters}
          />

          <WarehouseAllocationHistoryTable
            isLoading={isLoading}
            pagedGroups={pagedGroups}
            mainBrandFilterName={mainBrandFilterName}
            sortState={sortState}
            onSort={handleSort}
          />

          <ListPagination
            pageSize={pageSize}
            safePage={safePage}
            pageCount={pageCount}
            onPageSizeChange={setPageSize}
            onPrevious={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
