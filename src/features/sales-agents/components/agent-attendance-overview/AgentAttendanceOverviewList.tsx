import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Eye, FileDown, Loader2, MoreHorizontal, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import type { AgentAttendance } from '@/types/database.types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AttendanceViewDialog,
  canViewAttendanceDetails,
} from '@/features/agent-attendance/component/AttendanceViewDialog';
import { AttendanceOverviewFilters } from '@/features/agent-attendance/component/AttendanceOverviewFilters';
import {
  getAttendanceOverviewDateBounds,
  hasAttendanceOverviewDateFilter,
  hasAttendanceOverviewDateRangeComplete,
} from '@/features/agent-attendance/lib/attendanceOverviewDateFilters';
import type { DateRangeFilterValue } from '@/features/shared/components/DateRangeFilterPopover';
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
import { fetchComputedHoursForFilteredAgent } from '@/lib/fetchComputedAttendanceHours';
import {
  formatAttendanceTotalHours,
  formatTotalHoursDisplay,
} from '@/lib/agentAttendanceTotalHours';
import {
  AdminAttendanceEditDialog,
  canSuperAdminEditAttendance,
} from '@/features/sales-agents/components/agent-attendance-overview/AdminAttendanceEditDialog';
import { exportFilteredAttendanceComputedHoursExcel, exportFilteredAttendanceTimeInOutExcel } from '@/features/sales-agents/components/agent-attendance-overview/exportAttendanceOverview';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  applyAgentAttendanceOverviewSort,
  DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_DIRECTION,
  DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_KEY,
  isClientSideAgentAttendanceSortKey,
  sortAttendanceOverviewRowsClient,
  type AgentAttendanceOverviewSortKey,
} from '@/features/sales-agents/components/agent-attendance-overview/agentAttendanceOverviewSorting';

const PAGE_SIZES = [5, 10, 15, 25, 50, 100] as const;
type AttendanceExportMode = 'computed-hours' | 'time-in-out';
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

type OverviewAttendanceStatus = 'present' | 'absent';
type StatusFilter = 'all' | OverviewAttendanceStatus;

const OVERVIEW_STATUSES: OverviewAttendanceStatus[] = ['present', 'absent'];

type AttendanceAgentRow = AgentAttendance & {
  agent: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    company_id: string | null;
  } | null;
  hub: { id: string; hub_name: string } | null;
};

function formatManilaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatManilaBusinessDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function attendanceBadgeVariant(status: OverviewAttendanceStatus): 'destructive' | 'secondary' {
  return status === 'absent' ? 'destructive' : 'secondary';
}

function attendanceStatusLabel(status: OverviewAttendanceStatus): string {
  return status === 'absent' ? 'Absent' : 'Present';
}

export default function AgentAttendanceOverviewList() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  /** Team leaders already have SELECT on `agent_attendances` via RLS (`leader_teams`); UI must not block them. */
  const isTeamLeader = user?.role === 'team_leader';
  const isSuperAdmin = user?.role === 'super_admin';
  const isTenantAdmin = isSuperAdmin || user?.role === 'admin';
  const canAccess = isTeamLeader || (isTenantAdmin && !!companyId);

  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agentNameSearch, setAgentNameSearch] = useState('');
  const [agentEmailSearch, setAgentEmailSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewDialogRow, setViewDialogRow] = useState<AttendanceAgentRow | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogRow, setEditDialogRow] = useState<AttendanceAgentRow | null>(null);
  const [sortState, setSortState] = useState<TableSortCycleState<AgentAttendanceOverviewSortKey>>(
    createInitialTableSortCycle
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_KEY,
        DEFAULT_AGENT_ATTENDANCE_OVERVIEW_SORT_DIRECTION
      ),
    [sortState]
  );

  const handleSort = (key: AgentAttendanceOverviewSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const { fromDate: businessDateFrom, toDate: businessDateTo } = useMemo(
    () => getAttendanceOverviewDateBounds(dateRangeFilter),
    [dateRangeFilter]
  );

  useEffect(() => {
    setPage(0);
  }, [
    businessDateFrom,
    businessDateTo,
    statusFilter,
    pageSize,
    agentNameSearch,
    agentEmailSearch,
    dateRangeFilter,
    sortState,
  ]);

  const { data: companyRow } = useQuery({
    queryKey: ['attendance_overview_company', companyId],
    enabled: !!companyId && canAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; company_name: string } | null;
    },
  });

  const { data: pageData, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      'agent_attendance_overview',
      companyId,
      businessDateFrom,
      businessDateTo,
      dateRangeFilter.preset,
      statusFilter,
      page,
      pageSize,
      resolvedSortKey,
      resolvedSortDirection,
    ],
    enabled: canAccess,
    queryFn: async (): Promise<{ rows: AttendanceAgentRow[]; total: number }> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const dateFrom = businessDateFrom;
      const dateTo = businessDateTo;

      let countQuery = supabase.from('agent_attendances').select('*', { count: 'exact', head: true });
      let dataQuery = applyAgentAttendanceOverviewSort(
        supabase
          .from('agent_attendances')
          .select(
            `
          *,
          agent:profiles!agent_attendances_user_id_fkey(id, full_name, email, role, company_id),
          hub:hubs!agent_attendances_hub_id_fkey(id, hub_name)
        `
          ),
        resolvedSortKey,
        resolvedSortDirection
      );

      if (dateFrom) {
        countQuery = countQuery.gte('business_date', dateFrom);
        dataQuery = dataQuery.gte('business_date', dateFrom);
      }
      if (dateTo) {
        countQuery = countQuery.lte('business_date', dateTo);
        dataQuery = dataQuery.lte('business_date', dateTo);
      }

      if (statusFilter === 'all') {
        countQuery = countQuery.in('status', OVERVIEW_STATUSES);
        dataQuery = dataQuery.in('status', OVERVIEW_STATUSES);
      } else {
        countQuery = countQuery.eq('status', statusFilter);
        dataQuery = dataQuery.eq('status', statusFilter);
      }

      const [countRes, dataRes] = await Promise.all([
        countQuery,
        dataQuery.range(from, to),
      ]);

      if (countRes.error) throw countRes.error;
      if (dataRes.error) throw dataRes.error;

      return {
        rows: (dataRes.data ?? []) as AttendanceAgentRow[],
        total: countRes.count ?? 0,
      };
    },
  });

  const agentNameNorm = agentNameSearch.trim().toLowerCase();
  const agentEmailNorm = agentEmailSearch.trim().toLowerCase();

  const displayRows = useMemo(() => {
    let rows = pageData?.rows ?? [];
    if (agentNameNorm || agentEmailNorm) {
      rows = rows.filter(r => {
        const name = r.agent?.full_name?.toLowerCase() ?? '';
        const email = r.agent?.email?.toLowerCase() ?? '';
        if (agentNameNorm && !name.includes(agentNameNorm)) return false;
        if (agentEmailNorm && !email.includes(agentEmailNorm)) return false;
        return true;
      });
    }
    if (isClientSideAgentAttendanceSortKey(resolvedSortKey)) {
      rows = sortAttendanceOverviewRowsClient(rows, resolvedSortKey, resolvedSortDirection);
    }
    return rows;
  }, [pageData?.rows, agentNameNorm, agentEmailNorm, resolvedSortKey, resolvedSortDirection]);

  const total = pageData?.total ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  const filtersActive =
    hasAttendanceOverviewDateFilter(dateRangeFilter) ||
    statusFilter !== 'all' ||
    agentNameSearch.trim().length > 0 ||
    agentEmailSearch.trim().length > 0;

  const clearFilters = () => {
    setDateRangeFilter({ preset: 'all' });
    setStatusFilter('all');
    setAgentNameSearch('');
    setAgentEmailSearch('');
  };

  const computedHoursFiltersComplete =
    hasAttendanceOverviewDateRangeComplete(dateRangeFilter) &&
    (agentNameNorm.length > 0 || agentEmailNorm.length > 0);

  const dateFromForComputed = businessDateFrom;
  const dateToForComputed = businessDateTo;

  const { data: computedHoursResult, isLoading: isLoadingComputedHours } = useQuery({
    queryKey: [
      'agent_attendance_computed_hours',
      companyId,
      user?.id,
      dateFromForComputed,
      dateToForComputed,
      agentNameNorm,
      agentEmailNorm,
    ],
    enabled: canAccess && computedHoursFiltersComplete,
    queryFn: () =>
      fetchComputedHoursForFilteredAgent({
        dateFrom: dateFromForComputed,
        dateTo: dateToForComputed,
        agentNameSearch: agentNameNorm,
        agentEmailSearch: agentEmailNorm,
      }),
  });

  useEffect(() => {
    if (isLoading || !pageData) return;
    if (total === 0) return;
    const tp = Math.ceil(total / pageSize);
    if (page >= tp) setPage(Math.max(0, tp - 1));
  }, [isLoading, pageData, page, pageSize, total]);

  const handleExport = async (mode: AttendanceExportMode) => {
    if (!hasAttendanceOverviewDateRangeComplete(dateRangeFilter)) {
      toast.error('Choose a date range (preset or custom) before exporting.');
      return;
    }
    const dateFrom = businessDateFrom;
    const dateTo = businessDateTo;
    const filters = {
      businessDateFrom: dateFrom,
      businessDateTo: dateTo,
      statusFilter,
      agentNameSearch,
      agentEmailSearch,
    };

    setIsExporting(true);
    try {
      const count =
        mode === 'computed-hours'
          ? await exportFilteredAttendanceComputedHoursExcel(filters)
          : await exportFilteredAttendanceTimeInOutExcel(filters);

      if (count === 0) {
        toast.error('No records to export for the current filters.');
        return;
      }

      const reportLabel =
        mode === 'computed-hours' ? 'computed hours report' : 'time in & time out report';
      toast.success(`Exported ${count} row${count === 1 ? '' : 's'} to ${reportLabel}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      toast.error(msg);
    } finally {
      setIsExporting(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="w-full min-w-0 space-y-6 p-4 md:p-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription>
            Open this page as a team leader, or as a super admin / admin with a company assigned to your
            profile.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 p-4 md:p-8">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Agent attendance</CardTitle>
          <CardDescription>
            {isTeamLeader
              ? 'Attendance for mobile sales agents on your team (same visibility as RLS on this table).'
              : (
                  <>
                    Attendance for agents in{' '}
                    <span className="font-medium text-foreground">
                      {companyRow?.company_name ?? 'your company'}
                    </span>
                    .
                  </>
                )}{' '}
            Filters use the Manila <span className="font-medium">business_date</span> on each row.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceOverviewFilters
            dateRangeFilter={dateRangeFilter}
            onDateRangeFilterChange={setDateRangeFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            agentNameSearch={agentNameSearch}
            onAgentNameSearchChange={setAgentNameSearch}
            agentEmailSearch={agentEmailSearch}
            onAgentEmailSearchChange={setAgentEmailSearch}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
          />
        </CardContent>
      </Card>

      {computedHoursFiltersComplete ? (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Computed hours</span>
          {computedHoursResult?.agentLabel ? (
            <span className="text-muted-foreground">
              {' '}
              for <span className="font-medium text-foreground">{computedHoursResult.agentLabel}</span>
            </span>
          ) : null}
          <span className="text-muted-foreground"> ({formatManilaBusinessDateLabel(dateFromForComputed)}</span>
          <span className="text-muted-foreground"> – </span>
          <span className="text-muted-foreground">{formatManilaBusinessDateLabel(dateToForComputed)})</span>
          <span className="ml-2 font-semibold tabular-nums text-foreground">
            {isLoadingComputedHours
              ? '…'
              : `${formatTotalHoursDisplay(computedHoursResult?.totalHours ?? 0)} hours`}
          </span>
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load attendance</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">Records</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isExporting || isLoading}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  disabled={isExporting || isLoading}
                  onSelect={() => void handleExport('computed-hours')}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export computed hours
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isExporting || isLoading}
                  onSelect={() => void handleExport('time-in-out')}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export time in & time out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        label="Business date"
                        sortKey="businessDate"
                        sortDirection={getTableSortDisplayDirection(sortState, 'businessDate')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Agent"
                        sortKey="agent"
                        sortDirection={getTableSortDisplayDirection(sortState, 'agent')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Role"
                        sortKey="role"
                        sortDirection={getTableSortDisplayDirection(sortState, 'role')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Time in"
                        sortKey="timeIn"
                        sortDirection={getTableSortDisplayDirection(sortState, 'timeIn')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Time out"
                        sortKey="timeOut"
                        sortDirection={getTableSortDisplayDirection(sortState, 'timeOut')}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Total hours"
                        sortKey="totalHours"
                        sortDirection={getTableSortDisplayDirection(sortState, 'totalHours')}
                        onSort={handleSort}
                        className="text-right tabular-nums"
                      />
                      <SortableTableHead
                        label="Status"
                        sortKey="status"
                        sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                        onSort={handleSort}
                        className="text-right"
                      />
                      <TableHead className="w-[1%] whitespace-nowrap text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          No rows match your filters
                          {agentNameNorm || agentEmailNorm
                            ? ' (including name/email filters on this page)'
                            : ''}
                          .
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayRows.map(row => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatManilaBusinessDateLabel(row.business_date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{row.agent?.full_name ?? '—'}</span>
                              <span className="text-xs text-muted-foreground">{row.agent?.email ?? ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.agent?.role ?? '—'}
                          </TableCell>
                          {/* <TableCell className="max-w-[160px] truncate text-muted-foreground">
                            {row.hub?.hub_name ?? '—'}
                          </TableCell> */}
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.status === 'present' ? formatManilaDateTime(row.time_in) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {row.status === 'present' ? formatManilaDateTime(row.time_out) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {row.status === 'present' && row.time_out
                              ? formatAttendanceTotalHours(row)
                              : '—'}
                          </TableCell>
                          
                          <TableCell className="text-right">
                            <Badge
                              variant={attendanceBadgeVariant(
                                row.status as OverviewAttendanceStatus
                              )}
                            >
                              {attendanceStatusLabel(row.status as OverviewAttendanceStatus)}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            {canSuperAdminEditAttendance(isSuperAdmin, row) ||
                            canViewAttendanceDetails(row) ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  {canViewAttendanceDetails(row) ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setViewDialogRow(row);
                                        setViewDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="mr-2 h-4 w-4" />
                                      View
                                    </DropdownMenuItem>
                                  ) : null}
                                  {canSuperAdminEditAttendance(isSuperAdmin, row) ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditDialogRow(row);
                                        setEditDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                  ) : null}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {agentNameSearch.trim() || agentEmailSearch.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Name and email filters only hide rows on the current page. Clear them to see every row in the
                  date range, or narrow the date range. Exports use the same filters for all matching rows.
                </p>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-muted-foreground">
                  {total === 0
                    ? 'No records'
                    : `Showing ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total}`}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="att-overview-page-size" className="whitespace-nowrap text-xs text-muted-foreground">
                      Rows per page
                    </Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={v => {
                        const n = Number(v);
                        if ((PAGE_SIZES as readonly number[]).includes(n)) {
                          setPageSize(n as PageSize);
                          setPage(0);
                        }
                      }}
                    >
                      <SelectTrigger id="att-overview-page-size" className="h-8 w-[4.5rem] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map(s => (
                          <SelectItem key={s} value={String(s)}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 0}
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {totalPages === 0 ? 0 : page + 1} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={totalPages === 0 || page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AttendanceViewDialog
        open={viewDialogOpen}
        onOpenChange={open => {
          setViewDialogOpen(open);
          if (!open) setViewDialogRow(null);
        }}
        agentLabel={viewDialogRow?.agent?.full_name ?? 'Unknown agent'}
        businessDateLabel={
          viewDialogRow ? formatManilaBusinessDateLabel(viewDialogRow.business_date) : ''
        }
        photoPath={viewDialogRow?.photo}
        note={viewDialogRow?.note}
      />

      <AdminAttendanceEditDialog
        open={editDialogOpen}
        onOpenChange={open => {
          setEditDialogOpen(open);
          if (!open) setEditDialogRow(null);
        }}
        row={editDialogRow}
        companyId={companyId}
      />
    </div>
  );
}
