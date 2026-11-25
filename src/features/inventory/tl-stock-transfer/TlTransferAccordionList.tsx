import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { cn } from '@/lib/utils';
import { useAppDispatch } from '@/store/store';
import {
  fetchTlTransferTdrDetails,
  type TlTdrDetails,
} from '@/store/slices/motosales/tl-stock-transfers';
import type { TLRequestStatus, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  tlDispatchShortfallSummary,
  tlRemainingToDispatch,
  tlRemainingToReceive,
  tlStatusLabelForGroup,
  type TLRequestGroup,
} from './tlStockTransferShared';
import type { TlTransferListSortKey } from './tlStockTransferListHelpers';
import { TLTransferRowActionsMenu } from './TLTransferRowActionsMenu';
import { buildTlTransferReceiptPreviews } from './tlTransferTdrReceipts';

type ItemsSortKey =
  | 'brand'
  | 'variant'
  | 'variant_type'
  | 'requested'
  | 'to_dispatch'
  | 'received_qty';

const ITEMS_HEAD_CLASS =
  'h-auto bg-[#F3F4F6] px-3 py-2 text-xs font-semibold text-foreground hover:text-foreground';
const ITEMS_CELL_CLASS = 'whitespace-nowrap px-3 py-1.5';

function statusBadgeClass(status: TLRequestStatus | string) {
  const base = 'whitespace-nowrap';
  switch (status) {
    case 'pending_admin':
      return `${base} bg-yellow-50 text-yellow-800 border-yellow-200`;
    case 'pending_source_tl':
    case 'admin_approved':
      return `${base} bg-blue-50 text-blue-800 border-blue-200`;
    case 'pending_receipt':
      return `${base} bg-purple-50 text-purple-800 border-purple-200`;
    case 'completed':
      return `${base} bg-green-50 text-green-800 border-green-200`;
    case 'incomplete':
      return `${base} bg-orange-50 text-orange-800 border-orange-200`;
    case 'admin_rejected':
    case 'source_tl_rejected':
    case 'cancelled':
      return `${base} bg-red-50 text-red-800 border-red-200`;
    default:
      return base;
  }
}

export function TransferNumber({ value }: { value: string }) {
  return (
    <span className="font-mono text-sm font-medium whitespace-nowrap tabular-nums">{value}</span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function firstTimestamp(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function brandNames(group: TLRequestGroup) {
  const names = [
    ...new Set(
      group.items
        .map((item) => item.variant?.brand_name?.trim())
        .filter((name): name is string => !!name)
    ),
  ];
  return names.length > 0 ? names.join(', ') : '—';
}

export function TlTransferDetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value || '—'}</dd>
    </div>
  );
}

type Mode = 'transfers' | 'incoming';

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function sortTransferItems(
  items: TLRequestWithDetails[],
  sortKey: ItemsSortKey,
  direction: 'asc' | 'desc'
) {
  const dir = direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    let result = 0;
    switch (sortKey) {
      case 'brand':
        result = compareText(a.variant.brand_name || '', b.variant.brand_name || '');
        break;
      case 'variant':
        result = compareText(a.variant.name || '', b.variant.name || '');
        break;
      case 'variant_type':
        result = compareText(a.variant.type || '', b.variant.type || '');
        break;
      case 'requested':
        result = Number(a.requested_quantity || 0) - Number(b.requested_quantity || 0);
        break;
      case 'to_dispatch':
        result = tlRemainingToDispatch(a) - tlRemainingToDispatch(b);
        break;
      case 'received_qty':
        result = Number(a.received_quantity || 0) - Number(b.received_quantity || 0);
        break;
      default:
        result = 0;
    }
    if (result !== 0) return result * dir;
    return compareText(a.variant.name || '', b.variant.name || '');
  });
}

export function TransferItemsBreakdownTable({
  items,
  mode = 'transfers',
}: {
  items: TLRequestWithDetails[];
  mode?: Mode;
}) {
  const [sortState, setSortState] =
    useState<TableSortCycleState<ItemsSortKey>>(createInitialTableSortCycle);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const defaultSortKey: ItemsSortKey = mode === 'incoming' ? 'to_dispatch' : 'received_qty';
  const { key: activeSortKey, direction } = resolveTableSortDirection(
    sortState,
    defaultSortKey,
    'desc'
  );

  const sortedItems = useMemo(
    () => sortTransferItems(items, activeSortKey, direction),
    [items, activeSortKey, direction]
  );

  const pagination = useMemo(
    () => getListPaginationSlice(sortedItems, page, pageSize),
    [sortedItems, page, pageSize]
  );

  const allTotalReceived = items.reduce(
    (sum, item) => sum + Number(item.received_quantity || 0),
    0
  );
  const allTotalRequested = items.reduce(
    (sum, item) => sum + Number(item.requested_quantity || 0),
    0
  );
  const allTotalToDispatch = items.reduce(
    (sum, item) => sum + tlRemainingToDispatch(item),
    0
  );

  const head = (label: string, sortKey: ItemsSortKey, className?: string) => (
    <SortableTableHead
      label={label}
      sortKey={sortKey}
      sortDirection={getTableSortDisplayDirection(sortState, sortKey)}
      onSort={(key) => {
        setPage(0);
        setSortState((current) => getNextTableSortCycleState(current, key));
      }}
      className={cn(ITEMS_HEAD_CLASS, className)}
    />
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-[#E5E7EB]">
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow className="border-[#E5E7EB] hover:bg-transparent">
              {head('Brand', 'brand')}
              {head('Variant', 'variant')}
              {head('Variant Type', 'variant_type')}
              {mode === 'incoming' ? (
                <>
                  {head('Requested', 'requested', 'text-right')}
                  {head('To dispatch', 'to_dispatch', 'text-right')}
                </>
              ) : (
                head('Received Qty', 'received_qty', 'text-right')
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pagedItems.map((item) => (
              <TableRow
                key={item.id}
                className="border-[#E5E7EB] bg-white hover:bg-white"
              >
                <TableCell className={cn(ITEMS_CELL_CLASS, 'font-normal')}>
                  {item.variant.brand_name || '—'}
                </TableCell>
                <TableCell className={ITEMS_CELL_CLASS}>
                  {item.variant.name || '—'}
                </TableCell>
                <TableCell className={cn(ITEMS_CELL_CLASS, 'text-muted-foreground')}>
                  {item.variant.type || '—'}
                </TableCell>
                {mode === 'incoming' ? (
                  <>
                    <TableCell className={cn(ITEMS_CELL_CLASS, 'text-right tabular-nums')}>
                      {item.requested_quantity}
                    </TableCell>
                    <TableCell
                      className={cn(ITEMS_CELL_CLASS, 'text-right font-medium tabular-nums')}
                    >
                      {tlRemainingToDispatch(item)}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className={cn(ITEMS_CELL_CLASS, 'text-right tabular-nums')}>
                    {item.received_quantity != null ? item.received_quantity : '—'}
                  </TableCell>
                )}
              </TableRow>
            ))}
            <TableRow className="border-[#E5E7EB] bg-white hover:bg-white">
              <TableCell className={cn(ITEMS_CELL_CLASS, 'py-2 text-xs font-semibold')}>
                TOTAL
              </TableCell>
              <TableCell className={ITEMS_CELL_CLASS} />
              <TableCell className={ITEMS_CELL_CLASS} />
              {mode === 'incoming' ? (
                <>
                  <TableCell
                    className={cn(ITEMS_CELL_CLASS, 'py-2 text-right text-xs font-semibold tabular-nums')}
                  >
                    {allTotalRequested}
                  </TableCell>
                  <TableCell
                    className={cn(ITEMS_CELL_CLASS, 'py-2 text-right text-xs font-semibold tabular-nums')}
                  >
                    {allTotalToDispatch}
                  </TableCell>
                </>
              ) : (
                <TableCell
                  className={cn(ITEMS_CELL_CLASS, 'py-2 text-right text-xs font-semibold tabular-nums')}
                >
                  {allTotalReceived}
                </TableCell>
              )}
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {sortedItems.length > 0 ? (
        <ListPagination
          pageSize={pageSize}
          safePage={pagination.safePage}
          pageCount={pagination.pageCount}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
          onPrevious={() => setPage((current) => Math.max(0, pagination.safePage - 1))}
          onNext={() =>
            setPage((current) =>
              Math.min(pagination.pageCount - 1, pagination.safePage + 1)
            )
          }
        />
      ) : null}
    </div>
  );
}

function PersonCell({
  name,
  region,
}: {
  name?: string | null;
  region?: string | null;
}) {
  return (
    <TableCell className="min-w-[10rem] whitespace-nowrap">
      <p className="whitespace-nowrap font-normal">{name || '—'}</p>
      {region ? (
        <p className="text-sm text-muted-foreground whitespace-nowrap">{region}</p>
      ) : null}
    </TableCell>
  );
}

function TlTransferExpandedPanel({
  group,
  mode,
}: {
  group: TLRequestGroup;
  mode: Mode;
}) {
  const dispatch = useAppDispatch();
  const [detailTab, setDetailTab] = useState<'details' | 'receipts'>('details');
  const [tdrQuery, setTdrQuery] = useState<TlTdrDetails | null>(null);
  const headerId = group.items[0]?.request_id || null;

  const brands = brandNames(group);
  const hasDispatched = group.items.some((item) => item.dispatched_quantity != null);
  const hasReceived = group.items.some((item) => item.received_quantity != null);
  const remainingToDispatch = group.items.reduce(
    (sum, item) => sum + tlRemainingToDispatch(item),
    0
  );
  const requestedAt = group.created_at;
  const dispatchedAt = firstTimestamp(group.items.map((item) => item.dispatched_at));
  const receivedAt = firstTimestamp(group.items.map((item) => item.received_at));
  const dispatchedBy = dispatchedAt ? group.source.full_name : null;
  const receivedBy = receivedAt ? group.requester.full_name : null;
  const dispatchShort = group.items
    .map((item) => tlDispatchShortfallSummary(item))
    .find((summary) => summary?.reasonLabel);
  const dispatchPhotos = [
    ...new Set(group.items.flatMap((item) => item.dispatch_proof_urls || [])),
  ];
  const receivePhotos = [
    ...new Set(group.items.flatMap((item) => item.receive_proof_urls || [])),
  ];
  const adminNotes =
    group.items.map((item) => item.admin_notes?.trim()).find(Boolean) || null;
  const dispatcherNotes =
    group.items.map((item) => item.source_tl_notes?.trim()).find(Boolean) || null;

  useEffect(() => {
    if (!headerId) {
      setTdrQuery(null);
      return;
    }
    let cancelled = false;
    void dispatch(fetchTlTransferTdrDetails(headerId))
      .unwrap()
      .then((data) => {
        if (!cancelled) setTdrQuery(data);
      })
      .catch(() => {
        if (!cancelled) setTdrQuery(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, headerId]);

  const receiptPreviews = useMemo(
    () => buildTlTransferReceiptPreviews(group.items, tdrQuery),
    [group.items, tdrQuery]
  );

  return (
    <Tabs
      value={detailTab}
      onValueChange={(value) => setDetailTab(value as 'details' | 'receipts')}
      className="w-full"
    >
      <div className="border-b pb-3">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="details">Transfer details</TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            Delivery receipts
            {receiptPreviews.length > 0 ? (
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5">
                {receiptPreviews.length}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="details" className="mt-4 space-y-5 data-[state=inactive]:hidden">
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Details
          </h4>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <TlTransferDetailField
              label="Transfer Number"
              value={<TransferNumber value={group.request_number} />}
            />
            {mode === 'transfers' ? (
              <TlTransferDetailField label="TDR" value={group.tdr_number || '—'} />
            ) : null}
            <TlTransferDetailField
              label="Requested by"
              value={
                group.requester.region
                  ? `${group.requester.full_name} · ${group.requester.region}`
                  : group.requester.full_name
              }
            />
            <TlTransferDetailField
              label="Requested from"
              value={
                group.source.region
                  ? `${group.source.full_name} · ${group.source.region}`
                  : group.source.full_name
              }
            />
            <TlTransferDetailField label="Brand" value={brands} />
            <TlTransferDetailField label="Requested Total Qty" value={group.totalRequested} />
            {mode === 'incoming' ? (
              <TlTransferDetailField label="To Dispatch" value={remainingToDispatch} />
            ) : (
              <>
                <TlTransferDetailField
                  label="Dispatched Total Qty"
                  value={hasDispatched ? group.totalDispatched : '—'}
                />
                <TlTransferDetailField
                  label="Received Total Qty"
                  value={hasReceived ? group.totalReceived : '—'}
                />
              </>
            )}
            <TlTransferDetailField label="Request At" value={formatDateTime(requestedAt)} />
            <TlTransferDetailField label="Dispatch At" value={formatDateTime(dispatchedAt)} />
            <TlTransferDetailField label="Receive At" value={formatDateTime(receivedAt)} />
            <TlTransferDetailField label="Dispatched By" value={dispatchedBy || '—'} />
            <TlTransferDetailField label="Received By" value={receivedBy || '—'} />
            <TlTransferDetailField
              label="Status"
              value={
                <Badge variant="secondary" className={statusBadgeClass(group.status)}>
                  {tlStatusLabelForGroup(group)}
                </Badge>
              }
            />
            <TlTransferDetailField label="Date" value={formatDate(group.created_at)} />
          </dl>
          {dispatchShort?.reasonLabel ? (
            <p className="mt-3 text-xs text-amber-800">
              Dispatch note: {dispatchShort.reasonLabel}
            </p>
          ) : null}

          <div className="mt-5 space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h5>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border px-3 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">Request notes</p>
                <p className="mt-1 whitespace-pre-wrap">{group.requester_notes?.trim() || '—'}</p>
              </div>
              <div className="rounded-md border px-3 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">Admin notes</p>
                <p className="mt-1 whitespace-pre-wrap">{adminNotes || '—'}</p>
              </div>
              <div className="rounded-md border px-3 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">Dispatcher notes</p>
                <p className="mt-1 whitespace-pre-wrap">{dispatcherNotes || '—'}</p>
              </div>
              {group.rejection_reason ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
                  <p className="text-xs text-muted-foreground">Rejection reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-destructive">{group.rejection_reason}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Photos
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Dispatch photos</p>
                {dispatchPhotos.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dispatchPhotos.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-14 w-14 overflow-hidden rounded-md border bg-muted"
                      >
                        <img src={url} alt="Dispatch proof" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No dispatch photos yet</p>
                )}
              </div>
              <div className="rounded-md border px-3 py-2.5">
                <p className="text-xs text-muted-foreground">Receive photos</p>
                {receivePhotos.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {receivePhotos.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-14 w-14 overflow-hidden rounded-md border bg-muted"
                      >
                        <img src={url} alt="Receive proof" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No receive photos yet</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mode === 'incoming' ? 'Items' : 'Received Items'}
          </h4>
          <TransferItemsBreakdownTable items={group.items} mode={mode} />
        </section>
      </TabsContent>

      <TabsContent value="receipts" className="mt-4 space-y-4 data-[state=inactive]:hidden">
        {receiptPreviews.length > 0 ? (
          <div className="space-y-4">
            {receiptPreviews.map((preview) => (
              <iframe
                key={preview.key}
                title={preview.title}
                srcDoc={preview.html}
                className="h-[min(70vh,760px)] w-full rounded-lg border bg-white"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1 py-10 text-center">
            <p className="text-sm font-medium">No delivery receipt yet</p>
            <p className="text-sm text-muted-foreground">
              There is no delivery receipt for this transaction yet. It will appear here once stock
              is dispatched.
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

type Props = {
  groups: TLRequestGroup[];
  mode?: Mode;
  /** @deprecated Both Requested by and Requested from are always shown */
  counterpartLabel?: string;
  /** @deprecated Both Requested by and Requested from are always shown */
  counterpartField?: 'requester' | 'source';
  sortState?: TableSortCycleState<TlTransferListSortKey>;
  onSort?: (key: TlTransferListSortKey) => void;
  onView: (group: TLRequestGroup) => void;
  onHistory: (group: TLRequestGroup) => void;
  onPrint: (group: TLRequestGroup) => void;
  onPrintTdr?: (group: TLRequestGroup) => void;
  onReceive?: (group: TLRequestGroup) => void;
  onDispatch?: (group: TLRequestGroup) => void;
  onReject?: (group: TLRequestGroup) => void;
};

export function TlTransferAccordionList({
  groups,
  mode = 'transfers',
  sortState,
  onSort,
  onView,
  onHistory,
  onPrint,
  onPrintTdr,
  onReceive,
  onDispatch,
  onReject,
}: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const sortable = !!sortState && !!onSort;
  // expand + transfer# + (tdr?) + requested by + requested from + brands + qtys/status + date + actions
  const colCount = mode === 'incoming' ? 8 : 12;

  const toggle = (requestNumber: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestNumber)) next.delete(requestNumber);
      else next.add(requestNumber);
      return next;
    });
  };

  const head = (label: string, sortKey?: TlTransferListSortKey, className?: string) => {
    if (sortable && sortKey) {
      return (
        <SortableTableHead
          label={label}
          sortKey={sortKey}
          sortDirection={getTableSortDisplayDirection(sortState, sortKey)}
          onSort={onSort}
          className={className}
        />
      );
    }
    return <TableHead className={className}>{label}</TableHead>;
  };

  return (
    <div className="overflow-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 px-2" aria-label="Expand" />
            {head('Transfer #', 'request_number', 'min-w-[11rem]')}
            {mode === 'transfers' ? head('TDR', 'tdr_number', 'whitespace-nowrap') : null}
            {head('Requested by', 'counterpart', 'min-w-[10rem]')}
            {head('Requested from', 'source', 'min-w-[10rem]')}
            {head('Brands', 'item', 'min-w-[8rem]')}
            {mode === 'incoming' ? (
              head('To dispatch', 'to_dispatch', 'text-right')
            ) : (
              <>
                {head('Requested', 'requested_quantity', 'text-right')}
                {head('Dispatched', 'dispatched_quantity', 'text-right')}
                {head('Received', 'received_quantity', 'text-right')}
                {head('Status', 'status', 'min-w-[14rem]')}
              </>
            )}
            {head('Date', 'created_at', 'whitespace-nowrap')}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const open = openIds.has(group.request_number);
            const brands = brandNames(group);
            const hasDispatched = group.items.some((item) => item.dispatched_quantity != null);
            const hasReceived = group.items.some((item) => item.received_quantity != null);
            const remainingToDispatch = group.items.reduce(
              (sum, item) => sum + tlRemainingToDispatch(item),
              0
            );
            const canReceive =
              !!onReceive &&
              group.items.some(
                (item) => item.status === 'pending_receipt' && tlRemainingToReceive(item) > 0
              );
            const canReject =
              !!onReject && group.items.every((item) => item.received_quantity == null);
            return (
              <Fragment key={group.request_number}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => toggle(group.request_number)}
                  data-state={open ? 'open' : undefined}
                >
                  <TableCell className="w-10 px-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={open ? 'Collapse transfer' : 'Expand transfer'}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(group.request_number);
                      }}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform duration-200',
                          open && 'rotate-180'
                        )}
                      />
                    </Button>
                  </TableCell>
                  <TableCell className="min-w-[11rem]">
                    <TransferNumber value={group.request_number} />
                  </TableCell>
                  {mode === 'transfers' ? (
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {group.tdr_number || '—'}
                    </TableCell>
                  ) : null}
                  <PersonCell
                    name={group.requester.full_name}
                    region={group.requester.region}
                  />
                  <PersonCell
                    name={group.source.full_name}
                    region={group.source.region}
                  />
                  <TableCell className="min-w-[8rem]">
                    <p className="whitespace-nowrap font-normal">{brands}</p>
                  </TableCell>
                  {mode === 'incoming' ? (
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="text-base font-semibold tabular-nums">
                        {remainingToDispatch}
                      </Badge>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {group.totalRequested}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasDispatched ? group.totalDispatched : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasReceived ? group.totalReceived : '—'}
                      </TableCell>
                      <TableCell className="min-w-[14rem] whitespace-nowrap">
                        <Badge
                          variant="secondary"
                          className={statusBadgeClass(group.status)}
                        >
                          {tlStatusLabelForGroup(group)}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                  <TableCell className="whitespace-nowrap">
                    {formatDate(group.created_at)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <TLTransferRowActionsMenu
                      onView={() => onView(group)}
                      onHistory={() => onHistory(group)}
                      onPrint={() => onPrint(group)}
                      onPrintTdr={onPrintTdr ? () => onPrintTdr(group) : undefined}
                      onReceive={canReceive ? () => onReceive?.(group) : undefined}
                      onDispatch={onDispatch ? () => onDispatch(group) : undefined}
                      onReject={canReject ? () => onReject?.(group) : undefined}
                    />
                  </TableCell>
                </TableRow>

                {open ? (
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableCell colSpan={colCount} className="p-0">
                      <div className="border-t px-4 py-4 sm:px-5">
                        <TlTransferExpandedPanel group={group} mode={mode} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
