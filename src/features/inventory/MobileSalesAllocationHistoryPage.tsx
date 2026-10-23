import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, History, Loader2, Package, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import { SuperAdminAllocationHistoryFilter } from '@/features/sales-agents/components/super-admin-allocation-history/filter/Filter';
import { useAllocationHistoryOptions } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useAllocationHistoryOptions';
import { useCompanyBrands } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyBrands';
import type { CompanyRecipientOption } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyTeamLeaders';
import { SuperAdminAllocationHistoryTable } from '@/features/sales-agents/components/super-admin-allocation-history/table/TableHeader';
import {
  mapAllocationHistoryRows,
  type AllocationHistoryGroup,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryMappers';
import {
  filterAllocationHistoryGroups,
  getAllocationHistoryDateBounds,
  hasAllocationHistoryDateFilter,
  type AllocationFilterKey,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryFilters';
import { exportAllocationHistoryExcel } from '@/features/sales-agents/components/super-admin-allocation-history/utils/exportAllocationHistoryExcel';
import {
  DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_DIRECTION,
  DEFAULT_SUPER_ADMIN_ALLOCATION_SORT_KEY,
  sortSuperAdminAllocationGroups,
  type SuperAdminAllocationSortKey,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/superAdminAllocationHistorySorting';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
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

async function fetchMyLeaderAllocations(userId: string, companyId?: string | null): Promise<AllocationHistoryGroup[]> {
  const sessions = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('allocation_history')
      .select('id, created_at, allocated_to, allocated_by, brand_id, allocation_type')
      .eq('allocated_to', userId)
      .eq('allocation_type', 'leader_to_agent')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    return { data, error };
  });

  if (!sessions.length) return [];

  const brandIds = [...new Set(sessions.map((row) => row.brand_id).filter((id): id is string => Boolean(id)))];
  const brandNameById = new Map<string, string>();
  if (brandIds.length > 0) {
    const { data: brands, error } = await supabase.from('brands').select('id, name').in('id', brandIds);
    if (error) throw error;
    brands?.forEach((brand) => brandNameById.set(brand.id, brand.name));
  }

  const profileIds = [...new Set(sessions.flatMap((row) => [row.allocated_to, row.allocated_by].filter(Boolean)))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', profileIds);
  if (profilesError) throw profilesError;

  const profileNameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name?.trim() || 'Unknown']));
  const sessionsWithNames = sessions.map((row) => ({
    ...row,
    brand: row.brand_id ? { name: brandNameById.get(row.brand_id) ?? null } : null,
    allocated_to_profile: { full_name: profileNameById.get(row.allocated_to) ?? 'Unknown' },
    allocated_by_profile: { full_name: profileNameById.get(row.allocated_by) ?? 'Unknown' },
  }));

  const sessionIds = sessions.map((row) => row.id);
  const transactions = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from('inventory_transactions')
      .select(`
        id,
        quantity,
        reference_id,
        variant:variants!inventory_transactions_variant_id_fkey (
          id,
          name,
          variant_type,
          brand:brands!variants_brand_id_fkey ( name )
        )
      `)
      .eq('reference_type', 'allocation_history')
      .eq('transaction_type', 'allocated_to_agent')
      .in('reference_id', sessionIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    return { data, error };
  });

  return mapAllocationHistoryRows(sessionsWithNames, transactions);
}

export default function MobileSalesAllocationHistoryPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: groups = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['mobile-sales-allocation-history', user?.id, user?.company_id],
    enabled: !!user?.id,
    queryFn: () => fetchMyLeaderAllocations(user!.id, user?.company_id),
  });
  const { data: companyBrands = [], isLoading: isLoadingBrands } = useCompanyBrands();
  const [selectedFilter, setSelectedFilter] = useState<AllocationFilterKey>('all');
  const [filterValue, setFilterValue] = useState('');
  const [allocatedToRole, setAllocatedToRole] = useState<'team_leader' | 'mobile_sales' | ''>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<SuperAdminAllocationSortKey>>(createInitialTableSortCycle);
  const [isExportingFiltered, setIsExportingFiltered] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  useEffect(() => {
    if (isError && error) {
      toast({
        title: 'Failed to load allocation history',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [isError, error, toast]);

  const recipients = useMemo((): CompanyRecipientOption[] => {
    const leaders = new Map<string, CompanyRecipientOption>();
    groups.forEach((group) => {
      if (!group.allocatedById) return;
      leaders.set(group.allocatedById, {
        id: group.allocatedById,
        name: group.allocatedByName,
        role: 'team_leader',
        status: 'active',
        teamLeaderId: null,
        teamLeaderName: null,
      });
    });
    const self: CompanyRecipientOption | null = user?.id
      ? {
          id: user.id,
          name: user.full_name?.trim() || 'You',
          role: 'mobile_sales',
          status: 'active',
          teamLeaderId: null,
          teamLeaderName: null,
        }
      : null;
    return self ? [self, ...leaders.values()] : [...leaders.values()];
  }, [groups, user?.id, user?.full_name]);

  const {
    allocatedToTeamLeaderOptions,
    allocatedToMobileSalesOptions,
    allocatedByOptions,
    brandOptions,
  } = useAllocationHistoryOptions(groups, companyBrands, recipients);

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
  }, [selectedFilter, filterValue, allocatedToRole, dateRangeFilter, sortState, pageSize]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(sortedGroups, page, pageSize);

  const summary = useMemo(() => {
    const sessionCount = filteredGroups.length;
    const skuCount = filteredGroups.reduce((sum, group) => sum + group.lineCount, 0);
    const totalUnits = filteredGroups.reduce((sum, group) => sum + group.totalQuantity, 0);
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

  const exportRows = async (rows: AllocationHistoryGroup[], filename: string, filtered: boolean) => {
    const setBusy = filtered ? setIsExportingFiltered : setIsExportingAll;
    try {
      setBusy(true);
      await exportAllocationHistoryExcel(rows, filename);
      toast({ title: 'Export complete', description: 'Allocation history exported.' });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export history.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Allocation History</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stock your team leader allocated to you</p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
        <Button
          variant="outline"
          onClick={() => void exportRows(filteredGroups, 'mobile_sales_allocation_history_filtered', true)}
          disabled={!hasActiveFilters || filteredGroups.length === 0 || isExportingFiltered}
        >
          <FileDown className="mr-2 h-4 w-4" />
          Export filtered
        </Button>
        <Button
          variant="outline"
          onClick={() => void exportRows(groups, 'mobile_sales_allocation_history_all', false)}
          disabled={groups.length === 0 || isExportingAll}
        >
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
            Allocations from your team leader
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Your allocations</CardTitle>
          <CardDescription>Each session is stock your team leader sent from their inventory to you.</CardDescription>
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
            pagedGroups={pagedItems}
            sortState={sortState}
            onSort={(key) => setSortState((current) => getNextTableSortCycleState(current, key))}
            emptyMessage="No stock has been allocated to you yet."
          />

          <ListPagination
            pageSize={pageSize}
            safePage={safePage}
            pageCount={pageCount}
            onPageSizeChange={setPageSize}
            onPrevious={() => setPage((value) => Math.max(0, value - 1))}
            onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
