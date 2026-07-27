import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Package,
  Search,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { PurchaseOrderHistoryDialog } from '@/features/orders/components/PurchaseOrderHistoryDialog';
import { fetchPurchaseOrderHistory } from '@/features/orders/purchaseOrderEventsApi';
import {
  TL_PO_STATUS_LABELS,
  type TlReceiveListItem,
  type TlReceiveProof,
  type TlPoReceiveStatus,
} from '../types/tlPoReceiveTypes';

type ListViewMode = 'cards' | 'rows';
type StatusFilter = 'all' | TlPoReceiveStatus;

const STATUS_FILTERS: TlPoReceiveStatus[] = [
  'pending_receive',
  'fully_received',
  'shortfall_investigation',
];

function formatPoDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function canReceivePo(order: TlReceiveListItem): boolean {
  return order.status === 'pending_receive' && !!order.pendingReceive;
}

function hasReceiptSummary(status: TlPoReceiveStatus): boolean {
  return (
    status === 'pending_receive' ||
    status === 'fully_received' ||
    status === 'shortfall_investigation'
  );
}

function getOverallQty(order: TlReceiveListItem): number {
  return order.items.reduce((sum, item) => sum + Math.max(0, item.orderedQuantity || 0), 0);
}

function getDeliveryTotals(order: TlReceiveListItem) {
  const delivered = order.items.reduce((s, i) => s + Math.max(0, i.dispatchedQuantity || 0), 0);
  const received = order.items.reduce((s, i) => s + Math.max(0, i.receivedQuantity || 0), 0);
  const short = Math.max(0, delivered - received);
  return { delivered, received, short };
}

function StatusBadge({ status }: { status: TlPoReceiveStatus }) {
  if (status === 'pending_receive') {
    return (
      <Badge variant="default" className="gap-1">
        <Truck className="h-3 w-3" />
        {TL_PO_STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'shortfall_investigation') {
    return (
      <Badge variant="secondary" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-3 w-3" />
        {TL_PO_STATUS_LABELS[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      {TL_PO_STATUS_LABELS[status]}
    </Badge>
  );
}

function PoTotals({ order }: { order: TlReceiveListItem }) {
  const { delivered, received, short } = getDeliveryTotals(order);

  if (order.status === 'pending_receive') {
    return (
      <p className="text-xs text-muted-foreground tabular-nums">
        Delivered from warehouse {delivered} · awaiting confirm
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs tabular-nums">
        Delivered {delivered} · Received {received}
        {short > 0 ? (
          <span className="text-amber-700 font-medium"> · Short {short}</span>
        ) : null}
      </p>
      {short > 0 && order.status === 'shortfall_investigation' ? (
        <p className="text-xs text-amber-800">
          Waiting for warehouse to finish shortage investigation.
        </p>
      ) : null}
    </div>
  );
}

function ItemChips({
  order,
  initialVisible = 2,
}: {
  order: TlReceiveListItem;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = order.items;
  const hasMore = items.length > initialVisible;
  const visibleItems = expanded || !hasMore ? items : items.slice(0, initialVisible);
  const hiddenCount = items.length - initialVisible;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visibleItems.map((item) => {
          const short = Math.max(0, (item.dispatchedQuantity || 0) - (item.receivedQuantity || 0));
          const label =
            order.status === 'pending_receive'
              ? `${item.variantName} · x${item.dispatchedQuantity}`
              : short > 0 && order.status === 'shortfall_investigation'
                ? `${item.variantName} · x${item.dispatchedQuantity}`
                : `${item.variantName} · x${item.receivedQuantity || item.dispatchedQuantity}`;

          return (
            <Badge
              key={`${order.id}-${item.variantId}`}
              variant="outline"
              className={`font-normal ${
                short > 0 && order.status === 'shortfall_investigation'
                  ? 'border-amber-300 text-amber-900'
                  : ''
              }`}
            >
              {label}
            </Badge>
          );
        })}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'See less' : `See more (${hiddenCount})`}
        </button>
      ) : null}
    </div>
  );
}

function resolveReceiptProofs(order: TlReceiveListItem): TlReceiveProof[] {
  if (order.receiveProofs && order.receiveProofs.length > 0) {
    return order.receiveProofs;
  }
  return (order.history ?? [])
    .filter((e) => e.type === 'receive_confirmed')
    .map((e) => ({
      at: e.at,
      notes: e.note || order.receiveNotes || undefined,
      proofImageDataUrl: e.proofImageDataUrl || '',
      signatureDataUrl: e.signatureDataUrl || '',
    }));
}

function ReceiptCell({
  order,
  onViewReceipt,
}: {
  order: TlReceiveListItem;
  onViewReceipt: (order: TlReceiveListItem) => void;
}) {
  if (!hasReceiptSummary(order.status)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="space-y-2 min-w-[11rem]">
      <PoTotals order={order} />
      {(order.status === 'fully_received' || order.status === 'shortfall_investigation') && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => onViewReceipt(order)}
        >
          View receipt
        </Button>
      )}
    </div>
  );
}

function PoRowActionsMenu({
  order,
  onHistory,
  onReceive,
}: {
  order: TlReceiveListItem;
  onHistory: (order: TlReceiveListItem) => void;
  onReceive: (order: TlReceiveListItem) => void;
}) {
  const canReceive = canReceivePo(order);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onHistory(order)}>
          <History className="mr-2 h-4 w-4" />
          View history
        </DropdownMenuItem>
        {canReceive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReceive(order)}>
              <Truck className="mr-2 h-4 w-4" />
              Receive
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type LeaderPoReceiveListProps = {
  orders: TlReceiveListItem[];
  onReceive: (order: TlReceiveListItem) => void;
};

export function LeaderPoReceiveList({ orders, onReceive }: LeaderPoReceiveListProps) {
  const [viewMode, setViewMode] = useState<ListViewMode>('rows');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [historyOrder, setHistoryOrder] = useState<TlReceiveListItem | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<TlReceiveListItem | null>(null);
  const [receiptProofs, setReceiptProofs] = useState<TlReceiveProof[]>([]);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!isDateInRange(o.order_date, dateRange.start, dateRange.end)) return false;
      if (q) {
        const haystack = [
          o.po_number,
          o.drNumber ?? '',
          o.warehouseCompanyName ?? '',
          o.warehouseLocationName ?? '',
          o.allocatedByCompanyName ?? '',
          o.allocatedByName ?? '',
          ...o.items.map((i) => `${i.brandName ?? ''} ${i.variantName}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery, dateRange]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, viewMode]);

  useEffect(() => {
    if (!receiptOrder) {
      setReceiptProofs([]);
      setReceiptError(null);
      setReceiptLoading(false);
      return;
    }

    const local = resolveReceiptProofs(receiptOrder);
    if (local.some((p) => p.proofImageDataUrl || p.signatureDataUrl)) {
      setReceiptProofs(local);
      setReceiptLoading(false);
      setReceiptError(null);
      return;
    }

    let cancelled = false;
    setReceiptLoading(true);
    setReceiptError(null);

    void (async () => {
      try {
        const payload = await fetchPurchaseOrderHistory(receiptOrder.id);
        if (cancelled) return;
        const proofs = (payload.history || [])
          .filter((e) => e.type === 'receive_confirmed')
          .map((e) => ({
            at: e.at,
            notes: e.note || receiptOrder.receiveNotes || undefined,
            proofImageDataUrl: e.proofImageDataUrl || '',
            signatureDataUrl: e.signatureDataUrl || '',
          }));
        setReceiptProofs(proofs);
      } catch (e: unknown) {
        if (!cancelled) {
          setReceiptProofs([]);
          setReceiptError(e instanceof Error ? e.message : 'Failed to load receipt');
        }
      } finally {
        if (!cancelled) setReceiptLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receiptOrder]);

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(filtered, page, pageSize),
    [filtered, page, pageSize]
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              PO Receiving
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Confirm receive when status is pending receive. Shortages stay under investigation
              until warehouse resolves them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO / DR…"
                className="h-9 pl-8"
              />
            </div>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="w-full sm:w-[220px] justify-between h-9"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TL_PO_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'rows' ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => setViewMode('rows')}
            >
              <List className="h-4 w-4" />
              Rows
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              className="gap-2"
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No purchase orders assigned to you yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No items match this filter.
          </p>
        ) : viewMode === 'cards' ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedItems.map((order) => (
              <li key={order.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium tabular-nums">{order.po_number}</p>
                      {order.drNumber ? (
                        <Badge variant="outline" className="font-normal text-[10px] h-5">
                          {order.drNumber}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatPoDate(order.order_date)}</p>
                    {order.warehouseCompanyName || order.warehouseLocationName ? (
                      <div className="mt-0.5 min-w-0">
                        {order.warehouseCompanyName ? (
                          <p className="text-xs font-medium truncate">
                            {order.warehouseCompanyName}
                          </p>
                        ) : null}
                        {order.warehouseLocationName ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {order.warehouseLocationName}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {order.allocatedByCompanyName || order.allocatedByName ? (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Allocated by{' '}
                        {order.allocatedByName || '—'}
                        {order.allocatedByCompanyName
                          ? ` · ${order.allocatedByCompanyName}`
                          : ''}
                      </p>
                    ) : null}
                    <p className="text-xs tabular-nums mt-1">
                      Qty {getOverallQty(order).toLocaleString()}
                    </p>
                  </div>
                  <PoRowActionsMenu
                    order={order}
                    onHistory={setHistoryOrder}
                    onReceive={onReceive}
                  />
                </div>

                <StatusBadge status={order.status} />

                <ItemChips order={order} />
                <PoTotals order={order} />

                <div className="flex flex-col gap-2">
                  {canReceivePo(order) ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 w-full"
                      onClick={() => onReceive(order)}
                    >
                      <Truck className="mr-1.5 h-3.5 w-3.5" />
                      Receive
                    </Button>
                  ) : null}
                  {order.status === 'fully_received' ||
                  order.status === 'shortfall_investigation' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-full"
                      onClick={() => setReceiptOrder(order)}
                    >
                      View receipt
                    </Button>
                  ) : null}
                </div>

                {order.receiveNotes ? (
                  <p className="text-xs text-muted-foreground">
                    Receive notes: {order.receiveNotes}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO#</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Allocated By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium tabular-nums whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span>{order.po_number}</span>
                        {order.drNumber ? (
                          <Badge variant="outline" className="font-normal text-[10px] h-5 w-fit">
                            {order.drNumber}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs font-normal">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap max-w-[14rem]">
                      {order.warehouseCompanyName || order.warehouseLocationName ? (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium truncate">
                            {order.warehouseCompanyName || '—'}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {order.warehouseLocationName || '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap max-w-[14rem]">
                      {order.allocatedByCompanyName || order.allocatedByName ? (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium truncate">
                            {order.allocatedByCompanyName || '—'}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {order.allocatedByName || '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatPoDate(order.order_date)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5 min-w-[14rem]">
                        <ItemChips order={order} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      {getOverallQty(order).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="min-w-[10rem]">
                      <ReceiptCell order={order} onViewReceipt={setReceiptOrder} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-2">
                        {canReceivePo(order) ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8"
                            onClick={() => onReceive(order)}
                          >
                            <Truck className="mr-1.5 h-3.5 w-3.5" />
                            Receive
                          </Button>
                        ) : null}
                        <PoRowActionsMenu
                          order={order}
                          onHistory={setHistoryOrder}
                          onReceive={onReceive}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {filtered.length > 0 ? (
          <div className="pt-4">
            <ListPagination
              pageSize={pageSize}
              safePage={safePage}
              pageCount={pageCount}
              onPageSizeChange={setPageSize}
              onPrevious={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            />
          </div>
        ) : null}
      </CardContent>

      <PurchaseOrderHistoryDialog
        purchaseOrderId={historyOrder?.id ?? null}
        poNumber={historyOrder?.po_number}
        open={!!historyOrder}
        onOpenChange={(open) => {
          if (!open) setHistoryOrder(null);
        }}
      />

      <Dialog open={!!receiptOrder} onOpenChange={(open) => !open && setReceiptOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Receipt{receiptOrder ? ` — ${receiptOrder.po_number}` : ''}
            </DialogTitle>
          </DialogHeader>
          {receiptOrder ? (
            <div className="space-y-4">
              <StatusBadge status={receiptOrder.status} />
              <PoTotals order={receiptOrder} />
              {receiptOrder.receiveNotes ? (
                <p className="text-sm text-muted-foreground">
                  Notes: {receiptOrder.receiveNotes}
                </p>
              ) : null}
              {receiptLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading receipt attachments…
                </div>
              ) : receiptError ? (
                <p className="text-sm text-destructive">{receiptError}</p>
              ) : receiptProofs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No receive attachments yet. Confirm receive to capture proof photo and signature.
                </p>
              ) : (
                <div className="space-y-4">
                  {receiptProofs.map((proof, index) => (
                    <div
                      key={`${receiptOrder.id}-receipt-${index}`}
                      className="rounded-md border p-3 space-y-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        Receive #{index + 1}
                        {proof.at ? ` · ${formatPoDate(proof.at)}` : ''}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Proof photo
                          </p>
                          {proof.proofImageDataUrl ? (
                            <img
                              src={proof.proofImageDataUrl}
                              alt={`Proof ${index + 1}`}
                              className="w-full max-h-56 rounded-md object-contain border bg-muted/20"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No proof photo</p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Signature
                          </p>
                          {proof.signatureDataUrl ? (
                            <img
                              src={proof.signatureDataUrl}
                              alt={`Signature ${index + 1}`}
                              className="w-full max-h-40 rounded-md object-contain border bg-white"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No signature</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Summary stats helpers used by the page header cards. */
export function getTlPoReceiveStats(orders: TlReceiveListItem[]) {
  return {
    awaiting: orders.filter((o) => o.status === 'pending_receive').length,
    delivered: orders.filter((o) => o.status === 'fully_received').length,
    shortfall: orders.filter((o) => o.status === 'shortfall_investigation').length,
    total: orders.length,
  };
}
