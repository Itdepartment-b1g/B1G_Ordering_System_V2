import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Loader2, MoreVertical, Printer, RotateCcw, Search, Users } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { MobileSalesReturnDetailsPanel } from './components/MobileSalesReturnDetailsPanel';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';
import {
  fetchMyReturns,
  MOBILE_SALES_RETURN_HISTORY_QUERY_KEY,
  type MyReturn,
  type ReturnStatus,
} from './utils/mobileSalesReturnHistory';

function statusBadge(status: ReturnStatus) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

const returnColumns =
  'grid grid-cols-[1.25rem_minmax(8rem,1.1fr)_minmax(8rem,1.1fr)_11rem_6.5rem_7.5rem_minmax(8rem,1.2fr)_2.75rem] items-center gap-x-3 px-3';

export default function MobileSalesReturnHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'approved'>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [detailRow, setDetailRow] = useState<MyReturn | null>(null);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: [MOBILE_SALES_RETURN_HISTORY_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        return await fetchMyReturns(user!.id);
      } catch (error) {
        toast({ title: 'Error', description: 'Failed to load return history', variant: 'destructive' });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`mobile-sales-return-history-${user.id}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'inventory_returns',
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [MOBILE_SALES_RETURN_HISTORY_QUERY_KEY, user.id],
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return returns.filter((row) => {
      if (statusTab === 'pending' && row.status !== 'pending') return false;
      if (statusTab === 'approved' && row.status !== 'approved') return false;
      if (!isDateInRange(row.returnedAt, dateRange.start, dateRange.end)) return false;
      if (!query) return true;
      return (
        row.returnedTo.toLowerCase().includes(query) ||
        row.reason.toLowerCase().includes(query) ||
        row.status.includes(query) ||
        row.lines.some(
          (line) =>
            line.brandName.toLowerCase().includes(query) ||
            line.variantName.toLowerCase().includes(query)
        )
      );
    });
  }, [returns, searchQuery, dateRange.start, dateRange.end, statusTab]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, dateRange.start, dateRange.end, pageSize, statusTab]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(visible, page, pageSize);

  const returnedByName = user?.full_name?.trim() || 'You';
  const detailHref = (row: MyReturn) => `/inventory/my-returns/${row.id}`;

  const openDetails = (row: MyReturn) => {
    if (isMobile) {
      navigate(detailHref(row));
      return;
    }
    setDetailRow(row);
  };

  const printReturn = (row: MyReturn) => {
    exportMainInventoryReturnPdf({
      returnedBy: user?.full_name || 'Mobile Sales',
      returnedTo: row.returnedTo,
      returnedAt: row.returnedAt,
      status: row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending',
      reason: row.reason,
      lines: row.lines.map((line) => ({
        brandName: line.brandName,
        variantName: line.variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      })),
    });
  };

  const renderActions = (row: MyReturn) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Return actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => openDetails(row)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        {row.status === 'approved' && (
          <DropdownMenuItem onSelect={() => printReturn(row)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const emptyLabel =
    statusTab === 'pending'
      ? 'No pending returns'
      : statusTab === 'approved'
        ? 'No approved returns'
        : 'No returns found';

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Returns to Team Leader</h1>
          <p className="mt-1 text-sm text-muted-foreground">Stock you returned to your team leader</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/my-inventory">Back to My Inventory</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search team leader, brand, or variant…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <DateRangeFilterPopover
          value={dateRangeFilter}
          onChange={setDateRangeFilter}
          triggerClassName="h-10 w-full shrink-0 justify-between sm:w-[220px]"
          align="end"
        />
      </div>

      <Tabs
        value={statusTab}
        onValueChange={(value) => setStatusTab(value as 'all' | 'pending' | 'approved')}
      >
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Return history
          </CardTitle>
          <CardDescription>Each return you sent to your team leader.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pagedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RotateCcw className="mb-3 h-10 w-10 opacity-40" />
              <p className="font-medium text-foreground">{emptyLabel}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {pagedItems.map((row) => (
                  <div
                    key={`mobile-${row.id}`}
                    className="cursor-pointer rounded-lg border bg-card p-3 active:bg-muted/40"
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetails(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetails(row);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">
                          <Users className="h-3 w-3 shrink-0 text-green-500" />
                          {row.returnedTo}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.variantCount === 1
                            ? row.lines[0]?.variantName || '1 product'
                            : `${row.variantCount} products`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.totalQuantity.toLocaleString()} units ·{' '}
                          {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {statusBadge(row.status)}
                        {renderActions(row)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[78rem] overflow-hidden rounded-lg border bg-card">
                  <div
                    className={`${returnColumns} border-b py-2 text-xs font-medium text-muted-foreground`}
                  >
                    <span aria-hidden />
                    <span>Returned by</span>
                    <span>Returned to</span>
                    <span>Date</span>
                    <span className="text-right">Total qty</span>
                    <span>Status</span>
                    <span>Notes</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <Accordion type="multiple">
                    {pagedItems.map((row) => (
                      <AccordionItem key={row.id} value={row.id} className="border-b last:border-b-0">
                        <div className={returnColumns}>
                          <AccordionTrigger className="h-10 w-5 justify-center p-0 hover:no-underline" />
                          <span className="truncate font-medium">{returnedByName}</span>
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <Users className="h-3 w-3 shrink-0 text-green-500" />
                            {row.returnedTo}
                          </span>
                          <span className="whitespace-nowrap text-sm text-muted-foreground">
                            {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                          </span>
                          <span className="text-right text-sm font-semibold tabular-nums">
                            {row.totalQuantity.toLocaleString()}
                          </span>
                          <span>{statusBadge(row.status)}</span>
                          <span
                            className="truncate text-sm text-muted-foreground"
                            title={row.reason || undefined}
                          >
                            {row.reason.trim() || '—'}
                          </span>
                          <div className="flex justify-end">{renderActions(row)}</div>
                        </div>
                        <AccordionContent className="px-3 pb-3">
                          <MobileSalesReturnDetailsPanel
                            row={row}
                            returnedByName={returnedByName}
                            showPrint={false}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </div>
              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={setPageSize}
                onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!detailRow}
        onOpenChange={(open) => {
          if (!open) setDetailRow(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return details</DialogTitle>
            <DialogDescription>
              {detailRow
                ? `${detailRow.returnedTo} · ${format(new Date(detailRow.returnedAt), 'MMM d, yyyy h:mm a')}`
                : 'Return items'}
            </DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <MobileSalesReturnDetailsPanel row={detailRow} returnedByName={returnedByName} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
