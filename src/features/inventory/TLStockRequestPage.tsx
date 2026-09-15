import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, History, Loader2, Package, Plus, Printer, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { TLRequestStatus, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { CreateTLStockTransferDialog } from './tl-stock-transfer/CreateTLStockTransferDialog';
import { TLStockReceiveDialog } from './tl-stock-transfer/TLStockReceiveDialog';
import { TLTransferDetailsDialog } from './tl-stock-transfer/TLTransferDetailsDialog';
import { TLTransferHistoryDialog } from './tl-stock-transfer/TLTransferHistoryDialog';
import IncomingTLRequestsSection from './components/IncomingTLRequestsSection';
import {
  TL_REQUEST_SELECT,
  groupTlRequests,
  mapTlTransferRows,
  tlDispatchShortfallSummary,
  tlRemainingToReceive,
  tlStatusLabel,
  type TLRequestGroup,
} from './tl-stock-transfer/tlStockTransferShared';
import { fetchIncomingTlTransfers, useTlTransferRealtime } from './tl-stock-transfer/useTlTransferRealtime';
import { TLTransferLostItemsPanel } from './tl-stock-transfer/TLTransferLostItemsPanel';
import { useTlLostItemTabCount } from './tl-stock-transfer/tlTransferLostItems';
import { printTlStockTransferRequest } from './tl-stock-transfer/exportTlTransferPdfs';
import {
  DEFAULT_TL_TRANSFER_SORT_DIRECTION,
  DEFAULT_TL_TRANSFER_SORT_KEY,
  filterTlTransferGroups,
  sortTlTransferGroups,
  type TlTransferCounterpartField,
  type TlTransferListSortKey,
} from './tl-stock-transfer/tlStockTransferListHelpers';

function statusBadgeClass(status: TLRequestStatus | string) {
  switch (status) {
    case 'pending_admin':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'pending_source_tl':
    case 'admin_approved':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    case 'pending_receipt':
      return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'completed':
      return 'bg-green-50 text-green-800 border-green-200';
    case 'incomplete':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'admin_rejected':
    case 'source_tl_rejected':
    case 'cancelled':
      return 'bg-red-50 text-red-800 border-red-200';
    default:
      return '';
  }
}

type TransferTab = 'incoming' | 'dispatched' | 'mine' | 'lost';

function TransferGroupsTable({
  groups,
  counterpartLabel,
  counterpartField,
  sortState,
  onSort,
  onPrint,
  onView,
  onHistory,
  onReceive,
}: {
  groups: TLRequestGroup[];
  counterpartLabel: string;
  counterpartField: TlTransferCounterpartField;
  sortState: TableSortCycleState<TlTransferListSortKey>;
  onSort: (key: TlTransferListSortKey) => void;
  onPrint: (group: TLRequestGroup) => void;
  onView: (group: TLRequestGroup) => void;
  onHistory: (group: TLRequestGroup) => void;
  onReceive?: (group: TLRequestGroup) => void;
}) {
  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Transfer #"
              sortKey="request_number"
              sortDirection={getTableSortDisplayDirection(sortState, 'request_number')}
              onSort={onSort}
            />
            <SortableTableHead
              label="TDR"
              sortKey="tdr_number"
              sortDirection={getTableSortDisplayDirection(sortState, 'tdr_number')}
              onSort={onSort}
            />
            <SortableTableHead
              label={counterpartLabel}
              sortKey="counterpart"
              sortDirection={getTableSortDisplayDirection(sortState, 'counterpart')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Item"
              sortKey="item"
              sortDirection={getTableSortDisplayDirection(sortState, 'item')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Requested"
              sortKey="requested_quantity"
              sortDirection={getTableSortDisplayDirection(sortState, 'requested_quantity')}
              onSort={onSort}
              className="text-right"
            />
            <SortableTableHead
              label="Dispatched"
              sortKey="dispatched_quantity"
              sortDirection={getTableSortDisplayDirection(sortState, 'dispatched_quantity')}
              onSort={onSort}
              className="text-right"
            />
            <SortableTableHead
              label="Received"
              sortKey="received_quantity"
              sortDirection={getTableSortDisplayDirection(sortState, 'received_quantity')}
              onSort={onSort}
              className="text-right"
            />
            <SortableTableHead
              label="Status"
              sortKey="status"
              sortDirection={getTableSortDisplayDirection(sortState, 'status')}
              onSort={onSort}
            />
            <SortableTableHead
              label="Date"
              sortKey="created_at"
              sortDirection={getTableSortDisplayDirection(sortState, 'created_at')}
              onSort={onSort}
            />
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const first = group.items[0];
            const canReceive =
              !!onReceive &&
              group.items.some(
                (item) => item.status === 'pending_receipt' && tlRemainingToReceive(item) > 0
              );
            const dispatchShort = group.items
              .map((item) => tlDispatchShortfallSummary(item))
              .find((summary) => summary?.reasonLabel);
            const hasDispatched = group.items.some((item) => item.dispatched_quantity != null);
            const hasReceived = group.items.some((item) => item.received_quantity != null);
            const counterpart =
              counterpartField === 'requester'
                ? group.requester.full_name
                : group.source.full_name;
            return (
              <TableRow key={group.request_number}>
                <TableCell className="font-medium">{group.request_number}</TableCell>
                <TableCell className="font-mono text-sm">{group.tdr_number || '—'}</TableCell>
                <TableCell>{counterpart}</TableCell>
                <TableCell>
                  <p className="font-medium">
                    {first?.variant.brand_name} · {first?.variant.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {group.items.length === 1
                      ? first?.variant.type
                      : `${group.items.length} items`}
                  </p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{group.totalRequested}</TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums">{hasDispatched ? group.totalDispatched : '—'}</span>
                  {dispatchShort?.reasonLabel ? (
                    <p className="text-xs font-normal text-amber-800">
                      {dispatchShort.reasonLabel}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {hasReceived ? group.totalReceived : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusBadgeClass(group.status)}>
                    {tlStatusLabel(group.status)}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Print transfer"
                      onClick={() => onPrint(group)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="History"
                      onClick={() => onHistory(group)}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" title="Transfer details" onClick={() => onView(group)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canReceive ? (
                      <Button size="sm" onClick={() => onReceive?.(group)}>
                        Receive
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TLStockRequestPage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selected, setSelected] = useState<TLRequestWithDetails | null>(null);
  const [historyLines, setHistoryLines] = useState<TLRequestWithDetails[]>([]);
  const [tab, setTab] = useState<TransferTab>();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<TlTransferListSortKey>>(createInitialTableSortCycle);

  const { data: myRequests = [], isLoading, error: myRequestsError } = useQuery({
    queryKey: ['my-tl-requests', user?.id],
    enabled: !!user?.id && hasWarehouseHubLink,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('requester_leader_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return mapTlTransferRows(data || []);
    },
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ['incoming-tl-requests', user?.id],
    enabled: !!user?.id && hasWarehouseHubLink && user?.role === 'team_leader',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => fetchIncomingTlTransfers(user!.id),
  });

  const { data: dispatchedRequests = [], isLoading: dispatchedLoading } = useQuery({
    queryKey: ['dispatched-tl-requests', user?.id],
    enabled: !!user?.id && hasWarehouseHubLink && user?.role === 'team_leader',
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('source_leader_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return mapTlTransferRows(data || []).filter((row) => {
        if (
          row.status === 'pending_source_tl' ||
          row.status === 'admin_approved' ||
          row.status === 'pending_admin'
        ) {
          return false;
        }
        return (
          row.status === 'pending_receipt' ||
          row.status === 'completed' ||
          row.status === 'incomplete' ||
          row.status === 'source_tl_rejected' ||
          Number(row.dispatched_quantity || 0) > 0
        );
      });
    },
  });

  useTlTransferRealtime({
    enabled: !!user?.company_id && hasWarehouseHubLink,
    companyId: user?.company_id,
    channelKey: 'tl-page',
  });

  const myGroups = useMemo(() => groupTlRequests(myRequests), [myRequests]);
  const dispatchedGroups = useMemo(
    () => groupTlRequests(dispatchedRequests),
    [dispatchedRequests]
  );

  const stats = useMemo(
    () => ({
      total: myGroups.length,
      pending: myGroups.filter(
        (r) => r.status === 'pending_admin' || r.status === 'pending_source_tl'
      ).length,
      inTransit: myGroups.filter((r) => r.status === 'pending_receipt').length,
      incomplete: myGroups.filter((r) => r.status === 'incomplete').length,
      completed: myGroups.filter((r) => r.status === 'completed').length,
    }),
    [myGroups]
  );

  const incomingCount = useMemo(
    () => groupTlRequests(incomingRequests).length,
    [incomingRequests]
  );
  const lostItemCount = useTlLostItemTabCount();
  const dispatchedInTransit = useMemo(
    () => dispatchedGroups.filter((row) => row.status === 'pending_receipt').length,
    [dispatchedGroups]
  );
  const inTransitCount = stats.inTransit;
  const activeTab = tab ?? 'mine';

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_TL_TRANSFER_SORT_KEY,
        DEFAULT_TL_TRANSFER_SORT_DIRECTION
      ),
    [sortState]
  );

  const dispatchedFiltered = useMemo(
    () => filterTlTransferGroups(dispatchedGroups, searchQuery, dateRange),
    [dispatchedGroups, searchQuery, dateRange]
  );
  const dispatchedSorted = useMemo(
    () =>
      sortTlTransferGroups(
        dispatchedFiltered,
        resolvedSortKey,
        resolvedSortDirection,
        'requester'
      ),
    [dispatchedFiltered, resolvedSortKey, resolvedSortDirection]
  );
  const dispatchedPagination = useMemo(
    () => getListPaginationSlice(dispatchedSorted, page, pageSize),
    [dispatchedSorted, page, pageSize]
  );

  const myFiltered = useMemo(
    () => filterTlTransferGroups(myGroups, searchQuery, dateRange),
    [myGroups, searchQuery, dateRange]
  );
  const mySorted = useMemo(
    () => sortTlTransferGroups(myFiltered, resolvedSortKey, resolvedSortDirection, 'source'),
    [myFiltered, resolvedSortKey, resolvedSortDirection]
  );
  const myPagination = useMemo(
    () => getListPaginationSlice(mySorted, page, pageSize),
    [mySorted, page, pageSize]
  );

  const incomingListControls = useMemo(
    () => ({
      searchQuery,
      dateRange,
      page,
      pageSize,
      sortState,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      onSort: (key: TlTransferListSortKey) => {
        setSortState((current) => getNextTableSortCycleState(current, key));
      },
    }),
    [searchQuery, dateRange, page, pageSize, sortState]
  );

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchQuery, dateRangeFilter, pageSize, sortState]);

  const handleSort = (key: TlTransferListSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  const handleTabChange = (value: string) => {
    setTab(value as TransferTab);
    setSortState(createInitialTableSortCycle());
  };

  const printGroup = (group: TLRequestGroup) => {
    void printTlStockTransferRequest(group.items).catch((error: any) => {
      toast({
        title: 'Could not print transfer',
        description: error?.message || 'Failed to open the print view.',
        variant: 'destructive',
      });
    });
  };

  const openGroup = (group: TLRequestGroup) => {
    setSelected(group.items[0] ?? null);
    setViewOpen(true);
  };

  const openHistory = (group: TLRequestGroup) => {
    setHistoryLines(group.items);
    setHistoryOpen(true);
  };

  const receiveGroup = (group: TLRequestGroup) => {
    const receivable =
      group.items.find(
        (item) => item.status === 'pending_receipt' && tlRemainingToReceive(item) > 0
      ) ?? group.items[0];
    setSelected(receivable ?? null);
    setReceiveOpen(true);
  };

  if (user?.role !== 'team_leader') {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only team leaders can create stock transfers.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!hasWarehouseHubLink) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Stock transfers unavailable</CardTitle>
            <CardDescription>
              TL-to-TL stock transfers are only available when your company is linked to a warehouse.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock transfers</h1>
          <p className="text-muted-foreground">
            Request stock from another team leader. Super Admin approves, they dispatch, then you
            receive.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New transfer
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Total', stats.total],
          ['Pending', stats.pending],
          ['In transit', stats.inTransit],
          ['Incomplete', stats.incomplete],
          ['Completed', stats.completed],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-5">
              <div className="text-2xl font-bold tabular-nums">{value}</div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Transfers</CardTitle>
              <CardDescription>
                Incoming is stock Super Admin approved for you to dispatch. Dispatched is stock you
                already sent. My transfers are requests you created — receive them when they are in
                transit. Lost groups SKUs that arrived short or were written off; click an item to
                see the transfer numbers.{' '}
                <Link
                  to="/inventory/tl-transfer-shortages"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open investigation queue
                </Link>{' '}
                if you dispatched stock that arrived short.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-[240px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    activeTab === 'lost'
                      ? 'Search SKU, transfer #…'
                      : 'Search transfer #, TDR, name…'
                  }
                  className="h-9 pl-8"
                />
              </div>
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="w-full sm:w-[220px] justify-between h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="mb-4 grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
              <TabsTrigger value="incoming" className="gap-2">
                Incoming
                {incomingCount > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {incomingCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="dispatched" className="gap-2">
                Dispatched
                {dispatchedInTransit > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {dispatchedInTransit} in transit
                  </Badge>
                ) : dispatchedGroups.length > 0 ? (
                  <Badge variant="outline" className="h-5 min-w-5 px-1.5">
                    {dispatchedGroups.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="mine" className="gap-2">
                My transfers
                {inTransitCount > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {inTransitCount} in transit
                  </Badge>
                ) : myGroups.length > 0 ? (
                  <Badge variant="outline" className="h-5 min-w-5 px-1.5">
                    {myGroups.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="lost" className="gap-2">
                Lost
                {lostItemCount > 0 ? (
                  <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                    {lostItemCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="incoming" className="mt-0">
              <p className="mb-3 text-sm text-muted-foreground">
                Dispatch from your stock. You can send less than approved if you give a reason.
              </p>
              <IncomingTLRequestsSection embedded listControls={incomingListControls} />
            </TabsContent>

            <TabsContent value="dispatched" className="mt-0">
              <p className="mb-3 text-sm text-muted-foreground">
                Transfers other TLs requested from you that you already sent. Track in transit,
                received, and shortages.
              </p>
              {dispatchedLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading dispatched transfers...
                </div>
              ) : dispatchedGroups.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>Nothing dispatched yet</p>
                </div>
              ) : dispatchedSorted.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No dispatched transfers match this search or date range.
                </p>
              ) : (
                <div className="space-y-4">
                  <TransferGroupsTable
                    groups={dispatchedPagination.pagedItems}
                    counterpartLabel="To"
                    counterpartField="requester"
                    sortState={sortState}
                    onSort={handleSort}
                    onPrint={printGroup}
                    onView={openGroup}
                    onHistory={openHistory}
                  />
                  <ListPagination
                    pageSize={pageSize}
                    safePage={dispatchedPagination.safePage}
                    pageCount={dispatchedPagination.pageCount}
                    onPageSizeChange={setPageSize}
                    onPrevious={() =>
                      setPage((current) => Math.max(0, dispatchedPagination.safePage - 1))
                    }
                    onNext={() =>
                      setPage((current) =>
                        Math.min(dispatchedPagination.pageCount - 1, dispatchedPagination.safePage + 1)
                      )
                    }
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="mine" className="mt-0">
              <p className="mb-3 text-sm text-muted-foreground">
                Transfers you requested. Receive when status is in transit.
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading transfers...
                </div>
              ) : myRequestsError ? (
                <p className="py-10 text-center text-sm text-destructive">
                  {(myRequestsError as Error).message || 'Could not load your transfers.'}
                </p>
              ) : myGroups.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>No transfers yet</p>
                </div>
              ) : mySorted.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No transfers match this search or date range.
                </p>
              ) : (
                <div className="space-y-4">
                  <TransferGroupsTable
                    groups={myPagination.pagedItems}
                    counterpartLabel="From"
                    counterpartField="source"
                    sortState={sortState}
                    onSort={handleSort}
                    onPrint={printGroup}
                    onView={openGroup}
                    onHistory={openHistory}
                    onReceive={receiveGroup}
                  />
                  <ListPagination
                    pageSize={pageSize}
                    safePage={myPagination.safePage}
                    pageCount={myPagination.pageCount}
                    onPageSizeChange={setPageSize}
                    onPrevious={() => setPage((current) => Math.max(0, myPagination.safePage - 1))}
                    onNext={() =>
                      setPage((current) =>
                        Math.min(myPagination.pageCount - 1, myPagination.safePage + 1)
                      )
                    }
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="lost" className="mt-0">
              <p className="mb-3 text-sm text-muted-foreground">
                SKUs that went missing in transit or were written off. Click an item to see which
                transfer numbers they came from.
              </p>
              <TLTransferLostItemsPanel
                searchQuery={searchQuery}
                dateRange={dateRange}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <CreateTLStockTransferDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmitted={() => setTab('mine')}
      />
      <TLStockReceiveDialog
        open={receiveOpen}
        request={selected}
        allRequests={myRequests}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setSelected(null);
        }}
      />
      <TLTransferDetailsDialog
        open={viewOpen}
        request={selected}
        allRequests={[...myRequests, ...dispatchedRequests]}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open && !receiveOpen) setSelected(null);
        }}
      />
      <TLTransferHistoryDialog
        open={historyOpen}
        lines={historyLines}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryLines([]);
        }}
      />
    </div>
  );
}
