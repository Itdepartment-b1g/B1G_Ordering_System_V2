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
import { PurchaseOrderHistoryDialog } from '@/features/orders/components/PurchaseOrderHistoryDialog';
import { fetchPurchaseOrderHistory } from '@/features/orders/purchaseOrderEventsApi';
import type { PurchaseOrder } from '@/features/orders/types';
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
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';

import {
  TL_PO_STATUS_LABELS,
  type TlReceiveListItem,
  type TlReceiveProof,
  type TlPoReceiveStatus,
} from '../../utils/tlPoReceiveTypes';
import {
  DEFAULT_LEADER_PO_RECEIVE_SORT_DIRECTION,
  DEFAULT_LEADER_PO_RECEIVE_SORT_KEY,
  sortLeaderPoReceives,
  type LeaderPoReceiveSortKey,
} from '../../utils/leaderPoReceiveSorting';

type ListViewMode = 'cards' | 'rows';
type StatusFilter = 'all' | TlPoReceiveStatus;

const STATUS_FILTERS: TlPoReceiveStatus[] = [
  'awaiting_warehouse_fulfillment',
  'pending_receive',
  'fully_received',
  'shortfall_investigation',
];

function toPurchaseOrder(order: TlReceiveListItem): PurchaseOrder {
  const snap = order.poSnapshot;
  return {
    id: order.id,
    po_number: order.po_number,
    company_id: order.companyId,
    supplier_id: null,
    fulfillment_type: 'warehouse_transfer',
    order_date: order.order_date,
    expected_delivery_date: order.expected_delivery_date,
    subtotal: snap?.subtotal ?? order.total_amount,
    tax_rate: snap?.tax_rate ?? 0,
    tax_amount: snap?.tax_amount ?? 0,
    discount: snap?.discount ?? 0,
    total_amount: order.total_amount,
    status: (snap?.status as PurchaseOrder['status']) || 'fulfilled',
    notes: snap?.notes || order.receiveNotes || '',
    created_by: snap?.created_by || '',
    created_at: snap?.created_at || order.order_date,
    supplier: null,
    items: order.items.map((item, index) => ({
      id: `${order.id}-item-${index}`,
      variant_id: item.variantId,
      brand_name: item.brandName || 'Unknown',
      variant_name: item.variantName,
      variant_type: 'flavor',
      quantity: item.orderedQuantity,
      unit_price: 0,
      total_price: 0,
    })),
  };
}

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
  if (status === 'awaiting_warehouse_fulfillment') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Package className="h-3 w-3" />
        {TL_PO_STATUS_LABELS[status]}
      </Badge>
    );
  }
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
  const showActiveShort = short > 0 && order.status === 'shortfall_investigation';
  const ordered = getOverallQty(order);

  if (order.status === 'awaiting_warehouse_fulfillment') {
    return (
      <p className="text-xs text-muted-foreground tabular-nums">
        Ordered {ordered.toLocaleString()} · awaiting warehouse fulfillment
      </p>
    );
  }

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
        {showActiveShort ? (
          <span className="font-medium text-amber-700"> · Short {short}</span>
        ) : null}
      </p>
      {showActiveShort ? (
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
            order.status === 'awaiting_warehouse_fulfillment'
              ? `${item.variantName} · x${item.orderedQuantity}`
              : order.status === 'pending_receive'
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
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  return (
    <div className="min-w-[11rem] space-y-2">
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
  const [sortState, setSortState] =
    useState<TableSortCycleState<LeaderPoReceiveSortKey>>(createInitialTableSortCycle);
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

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_LEADER_PO_RECEIVE_SORT_KEY,
        DEFAULT_LEADER_PO_RECEIVE_SORT_DIRECTION
      ),
    [sortState]
  );

  const sorted = useMemo(
    () => sortLeaderPoReceives(filtered, resolvedSortKey, resolvedSortDirection),
    [filtered, resolvedSortKey, resolvedSortDirection]
  );

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, viewMode, sortState]);

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
    () => getListPaginationSlice(sorted, page, pageSize),
    [sorted, page, pageSize]
  );

  const handleSort = (key: LeaderPoReceiveSortKey) => {
    setSortState((prev) => getNextTableSortCycleState(prev, key));
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              PO Receiving
            </CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              Receive when status is pending receive. Awaiting warehouse fulfillment means approval
              or dispatch is still in progress.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO / DR..."
                className="h-9 pl-8"
              />
            </div>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="h-9 w-full justify-between sm:w-[220px]"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_FILTERS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {TL_PO_STATUS_LABELS[status]}
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
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pagedItems.map((order) => (
              <li key={order.id} className="space-y-3 rounded-md border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium tabular-nums">{order.po_number}</p>
                      {order.drNumber ? (
                        <Badge variant="outline" className="h-5 text-[10px] font-normal">
                          {order.drNumber}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatPoDate(order.order_date)}</p>
                    {order.warehouseCompanyName || order.warehouseLocationName ? (
                      <div className="mt-0.5 min-w-0">
                        {order.warehouseCompanyName ? (
                          <p className="truncate text-xs font-medium">{order.warehouseCompanyName}</p>
                        ) : null}
                        {order.warehouseLocationName ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {order.warehouseLocationName}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {order.allocatedByCompanyName || order.allocatedByName ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Allocated by {order.allocatedByName || '-'}
                        {order.allocatedByCompanyName ? ` · ${order.allocatedByCompanyName}` : ''}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs tabular-nums">
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
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="PO#"
                    sortKey="poNumber"
                    sortDirection={getTableSortDisplayDirection(sortState, 'poNumber')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Warehouse"
                    sortKey="warehouse"
                    sortDirection={getTableSortDisplayDirection(sortState, 'warehouse')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Allocated By"
                    sortKey="allocatedBy"
                    sortDirection={getTableSortDisplayDirection(sortState, 'allocatedBy')}
                    onSort={handleSort}
                  />
                  <SortableTableHead
                    label="Date"
                    sortKey="orderDate"
                    sortDirection={getTableSortDisplayDirection(sortState, 'orderDate')}
                    onSort={handleSort}
                  />
                  <TableHead>Items</TableHead>
                  <SortableTableHead
                    label="Qty"
                    sortKey="qty"
                    sortDirection={getTableSortDisplayDirection(sortState, 'qty')}
                    onSort={handleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Status"
                    sortKey="status"
                    sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                    onSort={handleSort}
                  />
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">
                      <div className="flex flex-col items-start gap-1">
                        <span>{order.po_number}</span>
                        {order.drNumber ? (
                          <Badge variant="outline" className="h-5 w-fit text-[10px] font-normal">
                            {order.drNumber}
                          </Badge>
                        ) : (
                          <span className="text-xs font-normal text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[14rem] whitespace-nowrap">
                      {order.warehouseCompanyName || order.warehouseLocationName ? (
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {order.warehouseCompanyName || '-'}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {order.warehouseLocationName || '-'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[14rem] whitespace-nowrap">
                      {order.allocatedByCompanyName || order.allocatedByName ? (
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {order.allocatedByCompanyName || '-'}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {order.allocatedByName || '-'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatPoDate(order.order_date)}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[14rem] space-y-1.5">
                        <ItemChips order={order} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                      {getOverallQty(order).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="min-w-[10rem]">
                      <ReceiptCell order={order} onViewReceipt={setReceiptOrder} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
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
              onPrevious={() => setPage((prev) => Math.max(0, prev - 1))}
              onNext={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
            />
          </div>
        ) : null}
      </CardContent>

      <PurchaseOrderHistoryDialog
        purchaseOrderId={historyOrder?.id ?? null}
        poNumber={historyOrder?.po_number}
        purchaseOrder={historyOrder ? toPurchaseOrder(historyOrder) : null}
        open={!!historyOrder}
        onOpenChange={(open) => {
          if (!open) setHistoryOrder(null);
        }}
      />

      <Dialog open={!!receiptOrder} onOpenChange={(open) => !open && setReceiptOrder(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Receipt{receiptOrder ? ` - ${receiptOrder.po_number}` : ''}
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
                  Loading receipt attachments...
                </div>
              ) : receiptError ? (
                <p className="text-sm text-destructive">{receiptError}</p>
              ) : receiptProofs.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No receive attachments yet. Confirm receive to capture proof photo and signature.
                </p>
              ) : (
                <div className="space-y-4">
                  {receiptProofs.map((proof, index) => (
                    <div
                      key={`${receiptOrder.id}-receipt-${index}`}
                      className="space-y-3 rounded-md border p-3"
                    >
                      <p className="text-xs text-muted-foreground">
                        Receive #{index + 1}
                        {proof.at ? ` · ${formatPoDate(proof.at)}` : ''}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Proof photo
                          </p>
                          {proof.proofImageDataUrl ? (
                            <img
                              src={proof.proofImageDataUrl}
                              alt={`Proof ${index + 1}`}
                              className="max-h-56 w-full rounded-md border bg-muted/20 object-contain"
                            />
                          ) : (
                            <p className="text-xs italic text-muted-foreground">No proof photo</p>
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
                              className="max-h-40 w-full rounded-md border bg-white object-contain"
                            />
                          ) : (
                            <p className="text-xs italic text-muted-foreground">No signature</p>
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

export function getTlPoReceiveStats(orders: TlReceiveListItem[]) {
  return {
    awaiting: orders.filter((o) => o.status === 'pending_receive').length,
    delivered: orders.filter((o) => o.status === 'fully_received').length,
    shortfall: orders.filter((o) => o.status === 'shortfall_investigation').length,
    total: orders.length,
  };
}
