import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarIcon,
  Eye,
  FileSignature,
  Loader2,
  Package,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  clearMyRemittanceDetail,
  fetchMyRemittanceDetail,
  fetchMyRemittances,
  type AgentRemittanceSummary,
} from '@/store/slices/moto-sales/remittances';
import { cn } from '@/lib/utils';

function formatMoney(amount: number) {
  return `₱${amount.toLocaleString()}`;
}

/** Fallback if an older API response has no remittanceNumber yet. */
function remittanceNumberOf(row: { id: string; remittanceNumber?: string; remittanceDate?: string }) {
  if (row.remittanceNumber) return row.remittanceNumber;
  const datePart = String(row.remittanceDate || '')
    .slice(0, 10)
    .replace(/-/g, '');
  const shortId = String(row.id || '')
    .replace(/-/g, '')
    .slice(0, 8)
    .toUpperCase();
  return `REMIT-${datePart || '--------'}-${shortId || '--------'}`;
}

function RemittanceDetailBody({
  compact,
}: {
  compact?: boolean;
}) {
  const detail = useAppSelector((s) => s.motoRemittances.selectedDetail);
  const detailStatus = useAppSelector((s) => s.motoRemittances.detailStatus);
  const detailError = useAppSelector((s) => s.motoRemittances.detailError);

  if (detailStatus === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading remittance details…</p>
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-destructive">
        <AlertCircle className="h-6 w-6" />
        <p className="text-sm text-center">{detailError}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">No remittance selected</div>
    );
  }

  const textXs = compact ? 'text-[10px]' : 'text-xs';
  const titleSm = compact ? 'text-xs' : 'text-sm';

  return (
    <div className="space-y-4">
      <div className={cn('grid grid-cols-2 gap-2 rounded-lg bg-muted p-3', textXs)}>
        <div className="col-span-2">
          <p className="text-muted-foreground">Remittance #</p>
          <p className={cn('font-semibold font-mono tracking-tight break-all', titleSm)}>
            {remittanceNumberOf(detail)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Date</p>
          <p className={cn('font-semibold', titleSm)}>
            {format(new Date(detail.remittedAt), 'MMM dd, yyyy')}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Time</p>
          <p className={cn('font-semibold', titleSm)}>
            {format(new Date(detail.remittedAt), 'hh:mm a')}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Orders</p>
          <p className={cn('font-semibold', titleSm)}>{detail.ordersCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Cash + Cheque</p>
          <p className={cn('font-semibold text-green-700', titleSm)}>
            {formatMoney(detail.remittedAmount)}
          </p>
        </div>
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="orders" className={cn(compact && 'text-[10px] py-2')}>
            Orders ({detail.ordersCount})
          </TabsTrigger>
          <TabsTrigger value="signature" className={cn(compact && 'text-[10px] py-2')}>
            Signature
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3">
          {detail.orders.length === 0 ? (
            <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
              No orders in this remittance
            </div>
          ) : (
            detail.orders.map((order) => (
              <div key={order.orderId} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn('font-medium truncate', titleSm)}>{order.orderNumber}</p>
                    <p className={cn('text-muted-foreground truncate', textXs)}>{order.clientName}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('font-semibold', titleSm)}>{formatMoney(order.remittedAmount)}</p>
                    <p className={cn('text-muted-foreground', textXs)}>
                      {order.paymentMethod || '—'}
                      {order.paymentMode === 'SPLIT' ? ' · Split' : ''}
                    </p>
                  </div>
                </div>
                <div className={cn('flex flex-wrap gap-2', textXs)}>
                  {order.cashPortion > 0 && (
                    <Badge variant="secondary">Cash {formatMoney(order.cashPortion)}</Badge>
                  )}
                  {order.chequePortion > 0 && (
                    <Badge variant="secondary">Cheque {formatMoney(order.chequePortion)}</Badge>
                  )}
                  {order.nonCashPortion != null && order.nonCashPortion > 0 && (
                    <Badge variant="outline">
                      {order.nonCashLabel || 'Non-cash'} {formatMoney(order.nonCashPortion)}
                    </Badge>
                  )}
                </div>
                {order.items.length > 0 && (
                  <ul className={cn('space-y-1 text-muted-foreground border-t pt-2', textXs)}>
                    {order.items.map((item, idx) => (
                      <li key={`${order.orderId}-${idx}`} className="flex justify-between gap-2">
                        <span className="truncate">
                          {item.brandName} — {item.variantName}
                        </span>
                        <span className="tabular-nums shrink-0">×{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="signature">
          {detail.signatureUrl ? (
            <div className="rounded-lg border bg-muted/30 p-4">
              <img
                src={detail.signatureUrl}
                alt="Remittance signature"
                className="mx-auto max-h-48 object-contain"
              />
            </div>
          ) : (
            <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
              <FileSignature className="mx-auto mb-2 h-8 w-8 opacity-30" />
              No signature on file
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MyRemittancesPage() {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.motoRemittances.items);
  const listStatus = useAppSelector((s) => s.motoRemittances.listStatus);
  const listError = useAppSelector((s) => s.motoRemittances.listError);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [viewOpen, setViewOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const date = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined;
    void dispatch(fetchMyRemittances({ date }));
    setPage(0);
  }, [dispatch, selectedDate]);

  const { pagedItems, safePage, pageCount } = useMemo(
    () => getListPaginationSlice(items, page, pageSize),
    [items, page, pageSize]
  );

  const openDetail = (row: AgentRemittanceSummary) => {
    setViewOpen(true);
    void dispatch(fetchMyRemittanceDetail(row.id));
  };

  const closeDetail = (open: boolean) => {
    setViewOpen(open);
    if (!open) dispatch(clearMyRemittanceDetail());
  };

  const loading = listStatus === 'loading' || listStatus === 'idle';

  return (
    <div className="w-full space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Remittances</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            History of cash and cheque remittances you submitted to your team leader
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-initial" asChild>
            <Link to="/my-inventory">Back to inventory</Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'flex-1 justify-start text-left font-normal sm:flex-initial sm:w-[200px]',
                  !selectedDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'All dates'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
              {selectedDate && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Orders remitted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {items.reduce((sum, r) => sum + r.ordersCount, 0)}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cash + cheque total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {formatMoney(items.reduce((sum, r) => sum + r.remittedAmount, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-5 w-5" />
            Remittance history
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading remittances…</p>
            </div>
          ) : listError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">{listError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void dispatch(
                    fetchMyRemittances({
                      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined,
                    })
                  )
                }
              >
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Package className="h-10 w-10 opacity-20" />
              <p className="font-medium">No remittances yet</p>
              <p className="text-sm">Submit a remittance from My Inventory to see it here.</p>
              <Button asChild className="mt-2">
                <Link to="/my-inventory">Go to My Inventory</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Remittance #</TableHead>
                      <TableHead>Date & time</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Remitted</TableHead>
                      <TableHead>Signature</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-mono text-sm font-medium tracking-tight">
                            {remittanceNumberOf(row)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {format(new Date(row.remittedAt), 'MMM dd, yyyy')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(row.remittedAt), 'hh:mm a')}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="text-sm font-semibold">{row.itemsRemitted} items</div>
                          <div className="text-xs text-muted-foreground">{row.totalUnits} units</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{row.ordersCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatMoney(row.remittedAmount)}
                        </TableCell>
                        <TableCell>
                          {row.hasSignature ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="outline">None</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(row)}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 p-3 md:hidden">
                {pagedItems.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openDetail(row)}
                    className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium tracking-tight truncate">
                          {remittanceNumberOf(row)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(row.remittedAt), 'MMM dd, yyyy')} ·{' '}
                          {format(new Date(row.remittedAt), 'hh:mm a')} · {row.ordersCount} orders
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-700">
                          {formatMoney(row.remittedAmount)}
                        </p>
                        {row.hasSignature && (
                          <p className="text-[10px] text-muted-foreground">Signed</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t px-3 py-2">
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(0);
                  }}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {isMobile ? (
        <Sheet open={viewOpen} onOpenChange={closeDetail}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Remittance details</SheetTitle>
                  <SheetDescription className="text-xs">
                    Cash and cheque orders in this batch
                  </SheetDescription>
                </SheetHeader>
                <RemittanceDetailBody compact />
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={viewOpen} onOpenChange={closeDetail}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Remittance details
              </DialogTitle>
              <DialogDescription>Cash and cheque orders in this batch</DialogDescription>
            </DialogHeader>
            <RemittanceDetailBody />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
