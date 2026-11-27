import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterX, Loader2, Package, Plus, Search } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ALL_TIME_DATE_RANGE,
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  QuickFilterSheet,
  countActiveQuickFilterAndClauses,
  createQuickFilterAndClause,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/features/shared/components/QuickFilterSheet';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import { getDateRangeFromPreset } from '@/lib/dateRangePresets';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { CreateTLStockTransferDialog } from './tl-stock-transfer/CreateTLStockTransferDialog';
import { TLStockReceiveDialog } from './tl-stock-transfer/TLStockReceiveDialog';
import { TLTransferDetailsDialog } from './tl-stock-transfer/TLTransferDetailsDialog';
import { TLTransferHistoryDialog } from './tl-stock-transfer/TLTransferHistoryDialog';
import { TlTransferAccordionList } from './tl-stock-transfer/TlTransferAccordionList';
import IncomingTLRequestsSection from './components/IncomingTLRequestsSection';
import {
  groupTlRequests,
  tlRemainingToReceive,
  type TLRequestGroup,
} from './tl-stock-transfer/tlStockTransferShared';
import { useTlTransferRealtime } from './tl-stock-transfer/useTlTransferRealtime';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  fetchDispatchedTlTransfers,
  fetchIncomingTlTransfers,
  fetchMyTlTransfers,
  fetchTlTransferTdrDetails,
} from '@/store/slices/motosales/tl-stock-transfers';
import { TLTransferLostItemsPanel } from './tl-stock-transfer/TLTransferLostItemsPanel';
import { useTlLostItemTabCount } from './tl-stock-transfer/tlTransferLostItems';
import { printTlStockTransferRequest } from './tl-stock-transfer/exportTlTransferPdfs';
import { printTlTransferGroupTdrs } from './tl-stock-transfer/tlTransferTdrReceipts';
import {
  DEFAULT_TL_TRANSFER_SORT_DIRECTION,
  DEFAULT_TL_TRANSFER_SORT_KEY,
  TL_TRANSFER_QUICK_STATUS_OPTIONS,
  filterTlTransferGroups,
  sortTlTransferGroups,
  tlTransferMatchesQuickStatus,
  uniqueTlTransferQuickOptions,
  type TlTransferListSortKey,
  type TlTransferQuickColumn,
  type TlTransferQuickStatus,
} from './tl-stock-transfer/tlStockTransferListHelpers';

const TransferQuickFilterSheet = QuickFilterSheet<TlTransferQuickColumn, TlTransferQuickStatus>;

type TransferTab = 'incoming' | 'dispatched' | 'mine' | 'lost';

export default function TLStockRequestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [selected, setSelected] = useState<TLRequestWithDetails | null>(null);
  const [historyLines, setHistoryLines] = useState<TLRequestWithDetails[]>([]);
  const [tab, setTab] = useState<TransferTab>();
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q')?.trim() || searchParams.get('search')?.trim() || ''
  );
  const [dateRangeFilter, setDateRangeFilter] =
    useState<DateRangeFilterValue>(ALL_TIME_DATE_RANGE);
  const [statusFilter, setStatusFilter] = useState<TlTransferQuickStatus>('all');
  const [columnClauses, setColumnClauses] = useState<
    QuickFilterAndClause<TlTransferQuickColumn>[]
  >([createQuickFilterAndClause<TlTransferQuickColumn>()]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<TlTransferListSortKey>>(createInitialTableSortCycle);

  useEffect(() => {
    const fromUrl =
      searchParams.get('q')?.trim() || searchParams.get('search')?.trim() || '';
    if (!fromUrl) return;
    setSearchQuery(fromUrl);
    setStatusFilter('all');
    setDateRangeFilter(ALL_TIME_DATE_RANGE);
  }, [searchParams]);

  const dispatch = useAppDispatch();
  const myRequests = useAppSelector((state) => state.motoSalesTlTransfers.myRequests);
  const incomingRequests = useAppSelector((state) => state.motoSalesTlTransfers.incomingRequests);
  const dispatchedRequests = useAppSelector((state) => state.motoSalesTlTransfers.dispatchedRequests);
  const myStatus = useAppSelector((state) => state.motoSalesTlTransfers.myStatus);
  const dispatchedStatus = useAppSelector((state) => state.motoSalesTlTransfers.dispatchedStatus);
  const myRequestsError = useAppSelector((state) => state.motoSalesTlTransfers.myError);
  const isLoading = myStatus === 'idle' || myStatus === 'loading';
  const dispatchedLoading = dispatchedStatus === 'idle' || dispatchedStatus === 'loading';

  useEffect(() => {
    if (!user?.id) return;
    void dispatch(fetchMyTlTransfers());
    if (user.role === 'team_leader') {
      void dispatch(fetchIncomingTlTransfers());
      void dispatch(fetchDispatchedTlTransfers());
    }
  }, [dispatch, user?.id, user?.role]);

  useTlTransferRealtime({
    enabled: !!user?.company_id,
    companyId: user?.company_id,
    channelKey: 'tl-page',
  });

  const myGroups = useMemo(() => groupTlRequests(myRequests), [myRequests]);
  const dispatchedGroups = useMemo(
    () => groupTlRequests(dispatchedRequests),
    [dispatchedRequests]
  );
  const incomingGroups = useMemo(
    () => groupTlRequests(incomingRequests),
    [incomingRequests]
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

  const incomingCount = incomingGroups.length;
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

  const filterOptions = useMemo(
    () => ({
      status: activeTab === 'lost' ? ('all' as const) : statusFilter,
      columnClauses,
    }),
    [activeTab, statusFilter, columnClauses]
  );

  const quickFilterSourceGroups = useMemo(() => {
    if (activeTab === 'dispatched') return dispatchedGroups;
    if (activeTab === 'incoming') return incomingGroups;
    return myGroups;
  }, [activeTab, dispatchedGroups, incomingGroups, myGroups]);

  const statusCounts = useMemo(() => {
    const scoped = filterTlTransferGroups(quickFilterSourceGroups, searchQuery, dateRange, {
      columnClauses,
    });
    const counts = Object.fromEntries(
      TL_TRANSFER_QUICK_STATUS_OPTIONS.map((option) => [option.value, 0])
    ) as Record<TlTransferQuickStatus, number>;
    counts.all = scoped.length;
    for (const group of scoped) {
      for (const option of TL_TRANSFER_QUICK_STATUS_OPTIONS) {
        if (option.value === 'all') continue;
        if (tlTransferMatchesQuickStatus(String(group.status), option.value)) {
          counts[option.value] += 1;
        }
      }
    }
    return counts;
  }, [quickFilterSourceGroups, searchQuery, dateRange, columnClauses]);

  const quickColumns = useMemo((): QuickFilterColumn<TlTransferQuickColumn>[] => {
    const option = (field: TlTransferQuickColumn) =>
      uniqueTlTransferQuickOptions(quickFilterSourceGroups, field).map((value) => ({
        value,
        label: value,
      }));
    return [
      {
        key: 'request_number',
        label: 'Transfer #',
        options: option('request_number'),
        searchPlaceholder: 'Search transfer #...',
      },
      {
        key: 'tdr_number',
        label: 'TDR',
        options: option('tdr_number'),
        searchPlaceholder: 'Search TDR...',
      },
      {
        key: 'from',
        label: 'Requested from',
        options: option('from'),
        searchPlaceholder: 'Search source TL...',
      },
      {
        key: 'to',
        label: 'Requested by',
        options: option('to'),
        searchPlaceholder: 'Search requester...',
      },
      {
        key: 'brand',
        label: 'Brand',
        options: option('brand'),
        searchPlaceholder: 'Search brand...',
      },
      {
        key: 'region',
        label: 'Region',
        options: option('region'),
        searchPlaceholder: 'Search region...',
      },
    ];
  }, [quickFilterSourceGroups]);

  const statusOptions = useMemo(
    () =>
      TL_TRANSFER_QUICK_STATUS_OPTIONS.map((option) => ({
        ...option,
        count: statusCounts[option.value],
      })),
    [statusCounts]
  );

  const dispatchedFiltered = useMemo(
    () => filterTlTransferGroups(dispatchedGroups, searchQuery, dateRange, filterOptions),
    [dispatchedGroups, searchQuery, dateRange, filterOptions]
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
    () => filterTlTransferGroups(myGroups, searchQuery, dateRange, filterOptions),
    [myGroups, searchQuery, dateRange, filterOptions]
  );
  const mySorted = useMemo(
    () => sortTlTransferGroups(myFiltered, resolvedSortKey, resolvedSortDirection, 'requester'),
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
      status: statusFilter,
      columnClauses,
      page,
      pageSize,
      sortState,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
      onSort: (key: TlTransferListSortKey) => {
        setSortState((current) => getNextTableSortCycleState(current, key));
      },
    }),
    [searchQuery, dateRange, statusFilter, columnClauses, page, pageSize, sortState]
  );

  const hasActiveQuickFilters =
    statusFilter !== 'all' ||
    dateRangeFilter.preset !== 'all' ||
    countActiveQuickFilterAndClauses(columnClauses) > 0;

  const hasActiveFilters = searchQuery.trim().length > 0 || hasActiveQuickFilters;

  const clearQuickFilters = () => {
    setStatusFilter('all');
    setDateRangeFilter(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<TlTransferQuickColumn>()]);
  };

  const clearFilters = () => {
    setSearchQuery('');
    clearQuickFilters();
  };

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchQuery, dateRangeFilter, pageSize, sortState, statusFilter, columnClauses]);

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

  const printDeliveryReceipt = (group: TLRequestGroup) => {
    void printTlTransferGroupTdrs(group.items, (requestId) =>
      dispatch(fetchTlTransferTdrDetails(requestId)).unwrap()
    ).catch((error: any) => {
      toast({
        title: 'Could not print delivery receipt',
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
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
          <h1 className="text-2xl font-bold">TL Stock Transfer</h1>
          <p className="text-muted-foreground">
            Request stock from another team leader. Super Admin approves, they dispatch, then you
            receive. Works without a warehouse link.
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
        <CardHeader>
          <CardTitle>Transfers</CardTitle>
          <CardDescription>
            Incoming is stock Super Admin approved for you to dispatch. Dispatched is stock you
            already sent. My transfer request lists the requests you created — receive them when they are in
            transit. Lost lists SKUs that arrived short or were written off. The dispatcher can
            investigate that transfer on the shortage page.{' '}
            <Link
              to="/inventory/tl-transfer-shortages"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open investigation queue
            </Link>{' '}
            if you dispatched stock that arrived short.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 sm:w-auto sm:inline-flex">
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
                My transfer request
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
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
              <div className="flex w-full gap-2 sm:w-auto shrink-0">
                <DateRangeFilterPopover
                  value={dateRangeFilter}
                  onChange={setDateRangeFilter}
                  triggerClassName="h-9 w-full sm:w-[220px] justify-between"
                />
                <TransferQuickFilterSheet
                  showDate={false}
                  dateRange={dateRangeFilter}
                  onDateRangeChange={setDateRangeFilter}
                  columns={quickColumns}
                  columnClauses={columnClauses}
                  onColumnClausesChange={setColumnClauses}
                  status={statusFilter}
                  statusOptions={statusOptions}
                  onStatusChange={setStatusFilter}
                  onClear={clearQuickFilters}
                  showStatus={activeTab !== 'lost'}
                />
                {hasActiveFilters ? (
                              <Button
                    type="button"
                      variant="ghost"
                      size="sm"
                    className="h-9 px-2 text-xs shrink-0"
                    onClick={clearFilters}
                    >
                    <FilterX className="h-3.5 w-3.5 mr-1" />
                    Clear
                    </Button>
                ) : null}
                  </div>
              </div>
              
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
                  <TlTransferAccordionList
                    groups={dispatchedPagination.pagedItems}
                    sortState={sortState}
                    onSort={(key) =>
                      setSortState((current) => getNextTableSortCycleState(current, key))
                    }
                    onPrint={printGroup}
                    onPrintTdr={printDeliveryReceipt}
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
                  {myRequestsError || 'Could not load your transfers.'}
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
                  <TlTransferAccordionList
                    groups={myPagination.pagedItems}
                    sortState={sortState}
                    onSort={(key) =>
                      setSortState((current) => getNextTableSortCycleState(current, key))
                    }
                    onPrint={printGroup}
                    onPrintTdr={printDeliveryReceipt}
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
                SKUs that went missing in transit or were written off. Investigate is only for the
                team leader who dispatched that transfer.
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
