import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileDown,
  History,
  LayoutGrid,
  List,
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
import { useToast } from '@/hooks/use-toast';
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
import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getRequestDeliveryTotals,
  requestHasOpenReceive,
  type SubWarehouseReceiveProof,
  type SubWarehouseStockRequest,
  type SubWarehouseStockRequestStatus,
} from './SubWarehouseStockRequestDialog';
import { SubWarehouseRequestHistoryTimeline } from './SubWarehouseRequestHistoryTimeline';
import {
  canExportInternalStockRequestReport,
  exportInternalStockRequestReportPdf,
} from '../utils/exportInternalStockRequestReportPdf';

const STATUS_LABELS: Record<SubWarehouseStockRequestStatus, string> = {
  pending_approval: 'Pending approval',
  pending_receive: 'Pending receive',
  partially_received: 'Partially received',
  fully_received: 'Fully received',
  rejected: 'Rejected',
};

type ListViewMode = 'cards' | 'rows';
type StatusFilter = 'all' | SubWarehouseStockRequestStatus;

function StatusBadge({ status }: { status: SubWarehouseStockRequestStatus }) {
  if (status === 'pending_approval') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'pending_receive') {
    return (
      <Badge variant="default" className="gap-1">
        <Truck className="h-3 w-3" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'partially_received') {
    return (
      <Badge variant="secondary" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-3 w-3" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge variant="destructive" className="gap-1">
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function formatRequestDate(iso: string): string {
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

function hasReceiptSummary(status: SubWarehouseStockRequestStatus): boolean {
  return (
    status === 'pending_receive' ||
    status === 'partially_received' ||
    status === 'fully_received'
  );
}

function canReceiveRequest(request: SubWarehouseStockRequest): boolean {
  // First release uses pending_receive; re-allocate unlocks openReceive while status may stay partial.
  if (request.status === 'pending_receive') return requestHasOpenReceive(request.items);
  if (request.status === 'partially_received') return requestHasOpenReceive(request.items);
  return false;
}

function getRequestOverallQty(request: SubWarehouseStockRequest): number {
  return request.items.reduce((sum, item) => sum + Math.max(0, item.requestedQuantity || 0), 0);
}


function RequestTotals({ request }: { request: SubWarehouseStockRequest }) {
  if (request.status !== 'partially_received' && request.status !== 'fully_received') {
    if (request.status === 'pending_receive') {
      const delivered = getRequestDeliveryTotals(request.items).delivered;
      return (
        <p className="text-xs text-muted-foreground tabular-nums">
          Delivered from Main {delivered} · awaiting confirm
        </p>
      );
    }
    return null;
  }

  const { delivered, received, short, openReceive } = getRequestDeliveryTotals(request.items);
  return (
    <div className="space-y-1">
      <p className="text-xs tabular-nums">
        Delivered {delivered} · Received {received}
        {short > 0 ? (
          <span className="text-amber-700 font-medium"> · Short {short}</span>
        ) : null}
      </p>
      {openReceive > 0 ? (
        <p className="text-xs text-foreground">
          Unlocked {openReceive} of short {short}
        </p>
      ) : short > 0 && request.status === 'partially_received' ? (
        <p className="text-xs text-amber-800">
          Waiting for main to allocate remaining {short} unit{short === 1 ? '' : 's'} on this
          request.
        </p>
      ) : short > 0 ? (
        <p className="text-xs text-amber-800">
          Main warehouse must allocate remaining {short} unit{short === 1 ? '' : 's'}.
        </p>
      ) : null}
    </div>
  );
}

function resolveReceiptProofs(request: SubWarehouseStockRequest): SubWarehouseReceiveProof[] {
  if (request.receiveProofs && request.receiveProofs.length > 0) {
    return request.receiveProofs;
  }
  return (request.history ?? [])
    .filter((e) => e.type === 'receive_confirmed')
    .map((e) => {
      if (e.type !== 'receive_confirmed') {
        return {
          at: e.at,
          proofImageDataUrl: '',
          signatureDataUrl: '',
        };
      }
      return {
        at: e.at,
        notes: e.note || request.receiveNotes,
        proofImageDataUrl: e.proofImageDataUrl || '',
        signatureDataUrl: e.signatureDataUrl || '',
        lines: e.lines,
      };
    });
}

function ReceiptCell({
  request,
  onViewReceipt,
}: {
  request: SubWarehouseStockRequest;
  onViewReceipt: (request: SubWarehouseStockRequest) => void;
}) {
  if (!hasReceiptSummary(request.status)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="space-y-2 min-w-[11rem]">
      <RequestTotals request={request} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() => onViewReceipt(request)}
      >
        View receipt
      </Button>
    </div>
  );
}

function ItemChips({
  request,
  initialVisible = 2,
}: {
  request: SubWarehouseStockRequest;
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = request.items;
  const hasMore = items.length > initialVisible;
  const visibleItems = expanded || !hasMore ? items : items.slice(0, initialVisible);
  const hiddenCount = items.length - initialVisible;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {visibleItems.map((item) => {
          const delivered = getItemDeliveredQty(item);
          const received = getItemReceivedQty(item);
          const short = Math.max(0, delivered - received);
          const label =
            request.status === 'pending_approval'
              ? `${item.brandName ? `${item.brandName} · ` : ''}${item.variantName} ×${item.requestedQuantity}`
              : short > 0 &&
                  (request.status === 'partially_received' || request.status === 'fully_received')
                ? `${item.variantName} · x${delivered}`
                : request.status === 'pending_receive'
                  ? `${item.variantName} · x${delivered}`
                  : `${item.variantName} · x${delivered}`;

          return (
            <Badge
              key={`${request.id}-${item.variantId}`}
              variant="outline"
              className={`font-normal ${short > 0 && request.status === 'partially_received' ? 'border-amber-300 text-amber-900' : ''}`}
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

function RequestRowActionsMenu({
  request,
  onHistory,
  onReceive,
  onExportPdf,
}: {
  request: SubWarehouseStockRequest;
  onHistory: (request: SubWarehouseStockRequest) => void;
  onReceive: (request: SubWarehouseStockRequest) => void;
  onExportPdf: (request: SubWarehouseStockRequest) => void;
}) {
  const canReceive = canReceiveRequest(request);
  const canExport = canExportInternalStockRequestReport(request);
  const isPartialFollowUp = request.status === 'partially_received' && canReceive;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => onHistory(request)}>
          <History className="mr-2 h-4 w-4" />
          View history
        </DropdownMenuItem>
        {canExport ? (
          <DropdownMenuItem onClick={() => onExportPdf(request)}>
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </DropdownMenuItem>
        ) : null}
        {canReceive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onReceive(request)}>
              <Truck className="mr-2 h-4 w-4" />
              {isPartialFollowUp ? 'Confirm partial receive' : 'Receive'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type SubWarehouseStockRequestListProps = {
  requests: SubWarehouseStockRequest[];
  onReceive: (request: SubWarehouseStockRequest) => void;
};

export function SubWarehouseStockRequestList({
  requests,
  onReceive,
}: SubWarehouseStockRequestListProps) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ListViewMode>('rows');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [historyRequest, setHistoryRequest] = useState<SubWarehouseStockRequest | null>(null);
  const [receiptRequest, setReceiptRequest] = useState<SubWarehouseStockRequest | null>(null);

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
    const list = requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!isDateInRange(r.createdAt, dateRange.start, dateRange.end)) return false;
      if (q) {
        const haystack = [r.requestNumber, r.requestedByName ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [requests, statusFilter, searchQuery, dateRange.end, dateRange.start]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, pageSize]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(filtered, page, pageSize);

  const handleExportReceivePdf = async (request: SubWarehouseStockRequest) => {
    if (!canExportInternalStockRequestReport(request)) {
      toast({
        title: 'Nothing to export',
        description: 'Export is available after main approves, rejects, or after a receive.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await exportInternalStockRequestReportPdf(request);
      toast({
        title: 'PDF opened',
        description: `${request.requestNumber} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not open the request PDF.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              My stock requests
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal mt-1">
              Confirm receive when status is pending receive. Shortages stay partial until main allocates
              the rest.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search request #…"
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
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABELS) as SubWarehouseStockRequestStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
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
        {requests.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No stock requests yet. Use Request stock to create one.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No requests match this filter.
          </p>
        ) : viewMode === 'cards' ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pagedItems.map((req) => (
              <li key={req.id} className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium tabular-nums">{req.requestNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatRequestDate(req.createdAt)}</p>
                    <p className="text-xs tabular-nums mt-1">
                      Qty {getRequestOverallQty(req).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={req.status} />
                    <RequestRowActionsMenu
                      request={req}
                      onHistory={setHistoryRequest}
                      onReceive={onReceive}
                      onExportPdf={(r) => void handleExportReceivePdf(r)}
                    />
                  </div>
                </div>

                <ItemChips request={req} />
                <RequestTotals request={req} />

                {hasReceiptSummary(req.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setReceiptRequest(req)}
                  >
                    View receipt
                  </Button>
                ) : null}

                {req.notes ? (
                  <p className="text-xs text-muted-foreground">Notes: {req.notes}</p>
                ) : null}
                {req.receiveNotes ? (
                  <p className="text-xs text-muted-foreground">Receive notes: {req.receiveNotes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium tabular-nums whitespace-nowrap">
                      {req.requestNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatRequestDate(req.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5 min-w-[14rem]">
                        <ItemChips request={req} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                      {getRequestOverallQty(req).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="min-w-[10rem]">
                      <ReceiptCell request={req} onViewReceipt={setReceiptRequest} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <RequestRowActionsMenu
                          request={req}
                          onHistory={setHistoryRequest}
                          onReceive={onReceive}
                          onExportPdf={(r) => void handleExportReceivePdf(r)}
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

      <Dialog open={!!historyRequest} onOpenChange={(open) => !open && setHistoryRequest(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              History{historyRequest ? ` — ${historyRequest.requestNumber}` : ''}
            </DialogTitle>
          </DialogHeader>
          <SubWarehouseRequestHistoryTimeline
            history={historyRequest?.history}
            items={historyRequest?.items}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiptRequest} onOpenChange={(open) => !open && setReceiptRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Receipt{receiptRequest ? ` — ${receiptRequest.requestNumber}` : ''}
            </DialogTitle>
          </DialogHeader>
          {receiptRequest ? (
            <div className="space-y-4">
              <StatusBadge status={receiptRequest.status} />
              <RequestTotals request={receiptRequest} />
              {receiptRequest.receiveNotes ? (
                <p className="text-sm text-muted-foreground">
                  Notes: {receiptRequest.receiveNotes}
                </p>
              ) : null}
              {(() => {
                const proofs = resolveReceiptProofs(receiptRequest);
                if (proofs.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-2">
                      No receive attachments yet. Confirm receive to capture proof photo and
                      signature.
                    </p>
                  );
                }
                return (
                  <div className="space-y-4">
                    {proofs.map((proof, index) => (
                      <div
                        key={`${receiptRequest.id}-receipt-${index}`}
                        className="rounded-md border p-3 space-y-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          Receive #{index + 1}
                          {proof.at ? ` · ${formatRequestDate(proof.at)}` : ''}
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
                );
              })()}
              {canExportInternalStockRequestReport(receiptRequest) ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExportReceivePdf(receiptRequest)}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export PDF
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
