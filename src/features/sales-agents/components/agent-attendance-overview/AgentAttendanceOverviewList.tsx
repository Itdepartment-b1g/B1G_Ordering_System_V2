import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileDown, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import type { AgentAttendance } from '@/types/database.types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { fetchComputedHoursForFilteredAgent } from '@/lib/fetchComputedAttendanceHours';
import {
  formatAttendanceTotalHours,
  formatTotalHoursDisplay,
} from '@/lib/agentAttendanceTotalHours';
import { exportFilteredAttendanceOverviewExcel } from '@/features/sales-agents/components/agent-attendance-overview/exportAttendanceOverview';

const PAGE_SIZES = [5, 10, 15, 25, 50, 100] as const;
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
  const isTenantAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const canAccess = isTeamLeader || (isTenantAdmin && !!companyId);

  const [businessDateFrom, setBusinessDateFrom] = useState('');
  const [businessDateTo, setBusinessDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [agentSearch, setAgentSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteDialogRow, setNoteDialogRow] = useState<AttendanceAgentRow | null>(null);

  useEffect(() => {
    setPage(0);
  }, [businessDateFrom, businessDateTo, statusFilter, pageSize, agentSearch]);

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
      statusFilter,
      page,
      pageSize,
    ],
    enabled: canAccess,
    queryFn: async (): Promise<{ rows: AttendanceAgentRow[]; total: number }> => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const dateFrom = businessDateFrom.trim();
      const dateTo = businessDateTo.trim();

      let countQuery = supabase.from('agent_attendances').select('*', { count: 'exact', head: true });
      let dataQuery = supabase
        .from('agent_attendances')
        .select(
          `
          *,
          agent:profiles!agent_attendances_user_id_fkey(id, full_name, email, role, company_id),
          hub:hubs!agent_attendances_hub_id_fkey(id, hub_name)
        `
        )
        .order('business_date', { ascending: false })
        .order('created_at', { ascending: false });

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

  const searchNorm = agentSearch.trim().toLowerCase();
  const displayRows = useMemo(() => {
    const rows = pageData?.rows ?? [];
    if (!searchNorm) return rows;
    return rows.filter(r => {
      const name = r.agent?.full_name?.toLowerCase() ?? '';
      const email = r.agent?.email?.toLowerCase() ?? '';
      return name.includes(searchNorm) || email.includes(searchNorm);
    });
  }, [pageData?.rows, searchNorm]);

  const total = pageData?.total ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  const filtersActive =
    businessDateFrom.trim().length > 0 ||
    businessDateTo.trim().length > 0 ||
    statusFilter !== 'all' ||
    agentSearch.trim().length > 0;

  const clearFilters = () => {
    setBusinessDateFrom('');
    setBusinessDateTo('');
    setStatusFilter('all');
    setAgentSearch('');
  };

  const computedHoursFiltersComplete =
    businessDateFrom.trim().length > 0 &&
    businessDateTo.trim().length > 0 &&
    searchNorm.length > 0;

  const dateFromForComputed = businessDateFrom.trim();
  const dateToForComputed = businessDateTo.trim();

  const { data: computedHoursResult, isLoading: isLoadingComputedHours } = useQuery({
    queryKey: [
      'agent_attendance_computed_hours',
      companyId,
      user?.id,
      dateFromForComputed,
      dateToForComputed,
      searchNorm,
    ],
    enabled: canAccess && computedHoursFiltersComplete,
    queryFn: () =>
      fetchComputedHoursForFilteredAgent({
        dateFrom: dateFromForComputed,
        dateTo: dateToForComputed,
        searchNorm,
      }),
  });

  useEffect(() => {
    if (isLoading || !pageData) return;
    if (total === 0) return;
    const tp = Math.ceil(total / pageSize);
    if (page >= tp) setPage(Math.max(0, tp - 1));
  }, [isLoading, pageData, page, pageSize, total]);

  const handleExportExcel = async () => {
    const dateFrom = businessDateFrom.trim();
    const dateTo = businessDateTo.trim();
    if (!dateFrom || !dateTo) {
      toast.error('Set both business date from and to before exporting the Business Hours Report.');
      return;
    }

    setIsExporting(true);
    try {
      const count = await exportFilteredAttendanceOverviewExcel({
        businessDateFrom: dateFrom,
        businessDateTo: dateTo,
        statusFilter,
        agentSearch,
      });

      if (count === 0) {
        toast.error('No records to export for the current filters.');
        return;
      }

      toast.success(`Exported ${count} row${count === 1 ? '' : 's'} to Business Hours Report.`);
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
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="att-from">Business date from</Label>
            <Input
              id="att-from"
              type="date"
              value={businessDateFrom}
              onChange={e => setBusinessDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="att-to">Business date to</Label>
            <Input
              id="att-to"
              type="date"
              value={businessDateTo}
              onChange={e => setBusinessDateTo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={statusFilter}
              onValueChange={v => {
                if (v === 'all' || v === 'present' || v === 'absent') {
                  setStatusFilter(v);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="att-search">Agent search</Label>
            <Input
              id="att-search"
              placeholder="Name or email"
              value={agentSearch}
              onChange={e => setAgentSearch(e.target.value)}
            />
          </div>
        </CardContent>
        <CardContent className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Optional <span className="font-medium text-foreground">business date</span> range (Manila calendar
            days). Leave blank to show all dates you can access. Only{' '}
            <span className="font-medium text-foreground">present</span> and{' '}
            <span className="font-medium text-foreground">absent</span> rows are shown.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!filtersActive}
            onClick={clearFilters}
          >
            Clear filters
          </Button>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExportExcel()}
              disabled={isExporting || isLoading}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Export to Excel</span>
            </Button>
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
                      <TableHead>Business date</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Role</TableHead>
                      {/* <TableHead>Hub</TableHead> */}
                      <TableHead>Time in</TableHead>
                      <TableHead>Time out</TableHead>
                      <TableHead className="text-right tabular-nums">Total hours</TableHead>
                      {/* <TableHead className="w-[1%] whitespace-nowrap">Note</TableHead> */}
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          No rows match your filters
                          {searchNorm ? ' (including agent search on this page)' : ''}.
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

                          <TableCell>
                            {row.note?.trim() ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => {
                                  setNoteDialogRow(row);
                                  setNoteDialogOpen(true);
                                }}
                              >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                <span>View note</span>
                              </Button>
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

              {agentSearch.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Agent search only hides rows on the current page. Clear the search to see every row in the
                  date range, or narrow the date range. Export to Excel uses the same filters for all matching rows.
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

      <Dialog
        open={noteDialogOpen}
        onOpenChange={open => {
          setNoteDialogOpen(open);
          if (!open) setNoteDialogRow(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attendance note</DialogTitle>
            <DialogDescription>
              {noteDialogRow
                ? `${noteDialogRow.agent?.full_name ?? 'Unknown agent'} · ${formatManilaBusinessDateLabel(noteDialogRow.business_date)}`
                : '\u00a0'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(50vh,20rem)] overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-foreground">
            {noteDialogRow?.note ?? ''}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
