import { useEffect, useMemo, useState } from 'react';
import { FileDown, History, Loader2, Package, RefreshCw, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';

import { exportAllocationHistoryExcel } from './utils/exportAllocationHistoryExcel';
import { SuperAdminAllocationHistoryFilter } from './filter/Filter';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import {
  filterAllocationHistoryGroups,
  getAllocationHistoryDateBounds,
  hasAllocationHistoryDateFilter,
  type AllocationFilterKey,
} from './utils/allocationHistoryFilters';
import { useCompanyBrands } from './hooks/useCompanyBrands';
import { useCompanyTeamLeaders, type RecipientRole } from './hooks/useCompanyTeamLeaders';
import { useAllocationHistoryOptions } from './hooks/useAllocationHistoryOptions';
import { useSuperAdminAllocationHistory } from './hooks/useSuperAdminAllocationHistory';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_DIRECTION,
  DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_KEY,
  sortSuperAdminAllocationGroups,
  type SuperAdminAllocationSortKey,
} from './utils/superAdminAllocationHistorySorting';
import { SuperAdminAllocationHistoryTable } from './table/TableHeader';

export default function SuperAdminAllocationHistoryList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: groups = [], isLoading, isError, error, refetch, isFetching } =
    useSuperAdminAllocationHistory();
  const { data: companyBrands = [], isLoading: isLoadingBrands } = useCompanyBrands();
  const { data: companyRecipients = [] } = useCompanyTeamLeaders();
  const [selectedFilter, setSelectedFilter] = useState<AllocationFilterKey>('all');
  const [filterValue, setFilterValue] = useState('');
  const [allocatedToRole, setAllocatedToRole] = useState<RecipientRole | ''>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<SuperAdminAllocationSortKey>>(createInitialTableSortCycle);
  const [isExportingFiltered, setIsExportingFiltered] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  const missingCompanyOnProfile =
    Boolean(user?.id) && !user?.company_id && user?.role === 'super_admin';

  useEffect(() => {
    if (isError && error) {
      toast({
        title: 'Failed to load allocation history',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [isError, error, toast]);

  const {
    allocatedToTeamLeaderOptions,
    allocatedToMobileSalesOptions,
    allocatedByOptions,
    brandOptions,
  } = useAllocationHistoryOptions(groups, companyBrands, companyRecipients);

  const { fromDate, toDate } = useMemo(
    () => getAllocationHistoryDateBounds(dateRangeFilter),
    [dateRangeFilter]
  );

  const filteredGroups = useMemo(
    () => filterAllocationHistoryGroups(groups, selectedFilter, filterValue, fromDate, toDate),
    [groups, selectedFilter, filterValue, fromDate, toDate]
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_KEY,
        DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedGroups = useMemo(
    () => sortSuperAdminAllocationGroups(filteredGroups, resolvedSortKey, resolvedSortDirection),
    [filteredGroups, resolvedSortKey, resolvedSortDirection]
  );

  useEffect(() => {
    setPage(0);
  }, [selectedFilter, filterValue, allocatedToRole, dateRangeFilter, sortState]);

  const handleSort = (key: SuperAdminAllocationSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
    sortedGroups,
    page,
    pageSize,
  );

  const summary = useMemo(() => {
    const sessionCount = filteredGroups.length;
    const skuCount = filteredGroups.reduce((sum, g) => sum + g.lineCount, 0);
    const totalUnits = filteredGroups.reduce((sum, g) => sum + g.totalQuantity, 0);
    return { sessionCount, skuCount, totalUnits };
  }, [filteredGroups]);

  const clearFilters = () => {
    setSelectedFilter('all');
    setFilterValue('');
    setAllocatedToRole('');
    setDateRangeFilter({ preset: 'all' });
  };

  const hasActiveFilters =
    hasAllocationHistoryDateFilter(dateRangeFilter) ||
    (selectedFilter !== 'all' && filterValue.trim().length > 0);

  const canExportFiltered = hasActiveFilters && filteredGroups.length > 0 && !isExportingFiltered;
  const canExportAll = groups.length > 0 && !isExportingAll;

  const onExportFiltered = async () => {
    try {
      setIsExportingFiltered(true);
      await exportAllocationHistoryExcel(filteredGroups, 'allocation_history_filtered');
      toast({ title: 'Export complete', description: 'Filtered allocation history exported.' });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export filtered history.', variant: 'destructive' });
    } finally {
      setIsExportingFiltered(false);
    }
  };

  const onExportAll = async () => {
    try {
      setIsExportingAll(true);
      await exportAllocationHistoryExcel(groups, 'allocation_history_all');
      toast({ title: 'Export complete', description: 'All allocation history exported.' });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export all history.', variant: 'destructive' });
    } finally {
      setIsExportingAll(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
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
            <Users className="h-3.5 w-3.5" />
            Units allocated in filtered rows
          </CardContent>
        </Card>
      </div>

      {missingCompanyOnProfile && (
        <Alert>
          <AlertTitle>No company linked to your profile</AlertTitle>
          <AlertDescription>
            Your account does not have a `company_id`, so allocation history cannot be scoped.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Allocation History</CardTitle>
          <CardDescription>
            Track stock allocations from main inventory to team leaders and agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
        

          <SuperAdminAllocationHistoryFilter
            selectedFilter={selectedFilter}
            filterValue={filterValue}
            allocatedToRole={allocatedToRole}
            dateRangeFilter={dateRangeFilter}
            allocatedToTeamLeaderOptions={allocatedToTeamLeaderOptions}
            allocatedToMobileSalesOptions={allocatedToMobileSalesOptions}
            allocatedByOptions={allocatedByOptions}
            brandOptions={brandOptions}
            isLoadingBrands={isLoadingBrands}
            onSelectedFilterChange={setSelectedFilter}
            onFilterValueChange={setFilterValue}
            onAllocatedToRoleChange={setAllocatedToRole}
            onDateRangeFilterChange={setDateRangeFilter}
            onClearFilters={clearFilters}
          />

          <SuperAdminAllocationHistoryTable
            isLoading={isLoading}
            pagedGroups={pagedGroups}
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
