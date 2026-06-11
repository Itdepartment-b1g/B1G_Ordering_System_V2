import { useEffect, useMemo, useState } from 'react';
import { FileDown, History, Loader2, Package, RefreshCw, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { SuperAdminAllocationHistoryFilter } from '@/features/sales-agents/components/super-admin-allocation-history/filter/Filter';
import { useAllocationHistoryOptions } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useAllocationHistoryOptions';
import { useCompanyBrands } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyBrands';
import {
  useCompanyTeamLeaders,
  type CompanyRecipientOption,
  type RecipientRole,
} from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useCompanyTeamLeaders';
import { useSuperAdminAllocationHistory } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useSuperAdminAllocationHistory';
import { useTeamLeaderAgentIds } from '@/features/team-leader/hooks/useTeamLeaderAgentIds';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SuperAdminAllocationHistoryTable } from '@/features/sales-agents/components/super-admin-allocation-history/table/TableHeader';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
import {
  filterAllocationHistoryGroups,
  getAllocationHistoryDateBounds,
  hasAllocationHistoryDateFilter,
  type AllocationFilterKey,
} from '@/features/sales-agents/components/super-admin-allocation-history/utils/allocationHistoryFilters';
import { exportAllocationHistoryExcel } from '@/features/sales-agents/components/super-admin-allocation-history/utils/exportAllocationHistoryExcel';

export default function LeaderAllocationHistoryList() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: allGroups = [], isLoading, isError, error, refetch, isFetching } =
    useSuperAdminAllocationHistory();
  const { data: companyBrands = [], isLoading: isLoadingBrands } = useCompanyBrands();
  const { data: companyRecipients = [] } = useCompanyTeamLeaders();
  const { data: teamAgentIds = [], isLoading: isLoadingTeamAgents } = useTeamLeaderAgentIds();
  const [selectedFilter, setSelectedFilter] = useState<AllocationFilterKey>('all');
  const [filterValue, setFilterValue] = useState('');
  const [allocatedToRole, setAllocatedToRole] = useState<RecipientRole | ''>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
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

  const teamAgentIdSet = useMemo(() => new Set(teamAgentIds), [teamAgentIds]);

  // Main → leader (received by this leader) and leader → agent (to agents on their team only).
  const leaderGroups = useMemo(() => {
    if (!user?.id) return [];
    return allGroups.filter((group) => {
      if (group.allocationType === 'main_to_leader' && group.allocatedToId === user.id) {
        return true;
      }
      return (
        group.allocationType === 'leader_to_agent' &&
        group.allocatedById === user.id &&
        teamAgentIdSet.has(group.allocatedToId)
      );
    });
  }, [allGroups, user?.id, teamAgentIdSet]);

  const teamRecipients = useMemo((): CompanyRecipientOption[] => {
    const agents = companyRecipients.filter(
      (recipient) =>
        recipient.role === 'mobile_sales' && teamAgentIdSet.has(recipient.id)
    );
    if (!user?.id) return agents;
    return [
      {
        id: user.id,
        name: user.full_name?.trim() || 'You',
        role: 'team_leader',
      },
      ...agents,
    ];
  }, [companyRecipients, teamAgentIdSet, user?.id, user?.full_name]);

  const {
    allocatedToTeamLeaderOptions,
    allocatedToMobileSalesOptions,
    allocatedByOptions,
    brandOptions,
  } = useAllocationHistoryOptions(leaderGroups, companyBrands, teamRecipients);

  const { fromDate, toDate } = useMemo(
    () => getAllocationHistoryDateBounds(dateRangeFilter),
    [dateRangeFilter]
  );

  const filteredGroups = useMemo(
    () =>
      filterAllocationHistoryGroups(leaderGroups, selectedFilter, filterValue, fromDate, toDate),
    [leaderGroups, selectedFilter, filterValue, fromDate, toDate]
  );

  useEffect(() => {
    setPage(0);
  }, [selectedFilter, filterValue, allocatedToRole, dateRangeFilter]);

  const { pageCount, safePage, pagedItems: pagedGroups } = getListPaginationSlice(
    filteredGroups,
    page,
    pageSize,
  );

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

  const canExportFiltered = hasActiveFilters && filteredGroups.length > 0 && !isExportingFiltered;
  const canExportAll = leaderGroups.length > 0 && !isExportingAll;

  const onExportFiltered = async () => {
    try {
      setIsExportingFiltered(true);
      await exportAllocationHistoryExcel(filteredGroups, 'leader_allocation_history_filtered');
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
      await exportAllocationHistoryExcel(leaderGroups, 'leader_allocation_history_all');
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
            Main to leader and leader to agent sessions
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
          <CardTitle>Leader Allocation History</CardTitle>
          <CardDescription>
            Stock received from main inventory and allocations from your inventory to your agents.
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
            isLoading={isLoading || isLoadingTeamAgents}
            pagedGroups={pagedGroups}
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