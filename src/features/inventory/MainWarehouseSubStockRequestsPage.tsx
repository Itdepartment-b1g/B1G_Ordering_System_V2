import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  LayoutGrid,
  List,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Package,
  PenTool,
  Search,
  Send,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getItemShortQty,
  getItemAllocatableQty,
  getRequestDeliveryTotals,
  requestHasOpenReceive,
  type SubWarehouseStockRequest,
  type SubWarehouseStockRequestStatus,
} from './components/SubWarehouseStockRequestDialog';
import { SubWarehouseRequestHistoryTimeline } from './components/SubWarehouseRequestHistoryTimeline';
import {
  InternalStockDeliveryProofFields,
  isInternalStockDeliveryProofComplete,
  isInternalStockRiderSignatureProofComplete,
  useInternalStockDeliveryProof,
} from './components/InternalStockDeliveryProofFields';
import {
  INTERNAL_STOCK_REQUESTS_QUERY_KEY,
  allocateInternalStockRequestRemaining,
  approveInternalStockRequest,
  createMainStockAllocation,
  deliverInternalStockRequest,
  deliverMainStockAllocation,
  fetchInternalStockRequestById,
  fetchInternalStockRequests,
  rejectInternalStockRequest,
} from './internalStockRequestsApi';
import { countRequestsByStatus } from './internalStockRequestsMappers';
import {
  broadcastInternalStockRequestsChanged,
  refetchInternalStockRequestLists,
  useInternalStockRequestsRealtime,
} from './useInternalStockRequestsRealtime';
import {
  canExportMainRequestPdf,
  exportMainSubStockRequestPdf,
} from './utils/exportMainSubStockRequestPdf';
import {
  canExportInternalStockDeliveryReceipt,
  exportInternalStockDeliveryReceiptPdf,
  type DeliveryReceiptWaveEvent,
} from './utils/exportInternalStockDeliveryReceiptPdf';
import {
  canExportInternalStockPackingSlip,
  exportInternalStockPackingSlipPdf,
} from './utils/exportInternalStockPackingSlipPdf';
import {
  attachInternalStockProofImageUrls,
  prepareInternalStockDeliveryUploads,
  prepareInternalStockPackageUploads,
  prepareInternalStockRiderSignatureUploads,
} from './utils/uploadInternalStockDeliveryEvidence';
import {
  DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_DIRECTION,
  DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_KEY,
  sortMainSubStockRequests,
  type MainSubStockRequestSortKey,
} from './utils/mainSubStockRequestSorting';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import PageGettingStartedDialog from '@/features/inventory/warehouse-manual/components/PageGettingStartedDialog';
import SubStockRequestsManual from '@/features/inventory/warehouse-manual/components/SubStockRequestsManual';
import {
  MainWarehouseAllocateDialog,
  type MainAllocateSubmitPayload,
} from './components/MainWarehouseAllocateDialog';
import {
  fetchMainWarehouseStockBoard,
  fetchOpenTransferPoReservedByVariant,
  resolveStockBoardReservedLocationId,
} from './warehouseStockBoard';
import { Input } from '@/components/ui/input';
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

const STATUS_LABELS: Record<SubWarehouseStockRequestStatus, string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  ready_to_deliver: 'Ready to deliver',
  pending_receive: 'Pending receive',
  partially_received: 'Partially received',
  fully_received: 'Fully received',
  rejected: 'Rejected',
};

type ListViewMode = 'cards' | 'rows';
type StatusFilter = 'all' | SubWarehouseStockRequestStatus;
type ListTab = 'requests' | 'allocations';

const ALLOCATION_STATUS_FILTERS: SubWarehouseStockRequestStatus[] = [
  'ready_to_deliver',
  'pending_receive',
  'partially_received',
  'fully_received',
];

function StatusBadge({ status }: { status: SubWarehouseStockRequestStatus }) {
  if (status === 'pending_approval') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'approved') {
    return (
      <Badge variant="secondary" className="gap-1 border-blue-200 bg-blue-50 text-blue-800">
        <CheckCircle2 className="h-3 w-3" />
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  if (status === 'ready_to_deliver') {
    return (
      <Badge variant="secondary" className="gap-1 border-violet-200 bg-violet-50 text-violet-900">
        <Package className="h-3 w-3" />
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
        <XCircle className="h-3 w-3" />
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

function requestedTotal(request: SubWarehouseStockRequest): number {
  return request.items.reduce((sum, item) => sum + item.requestedQuantity, 0);
}

const QTY_LEGEND = [
  { key: 'req', label: 'Requested', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  { key: 'del', label: 'Delivered', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  { key: 'recv', label: 'Received', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'short', label: 'Short', className: 'bg-amber-50 text-amber-900 border-amber-200' },
] as const;

function QtyLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Qty legend</span>
      {QTY_LEGEND.map((item) => (
        <span
          key={item.key}
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-medium ${item.className}`}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function QtyChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: (typeof QTY_LEGEND)[number]['key'];
}) {
  const toneClass = QTY_LEGEND.find((item) => item.key === tone)?.className ?? '';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums ${toneClass}`}
      title={`${label}: ${value}`}
    >
      <span className="opacity-80">{label}</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}

function RequestQtySummary({ request }: { request: SubWarehouseStockRequest }) {
  const totals = getRequestDeliveryTotals(request.items);
  const requested = requestedTotal(request);
  const showDelivery =
    request.status === 'pending_receive' ||
    request.status === 'partially_received' ||
    request.status === 'fully_received';

  return (
    <div className="flex flex-wrap gap-1">
      <QtyChip label="REQ:" value={requested} tone="req" />
      {showDelivery ? <QtyChip label="DL:" value={totals.delivered} tone="del" /> : null}
      {showDelivery ? <QtyChip label="REC:" value={totals.received} tone="recv" /> : null}
      {showDelivery ? (
        <QtyChip
          label="SHORT:"
          value={totals.received > 0 ? totals.short : 0}
          tone="short"
        />
      ) : null}
    </div>
  );
}

function MainItemChips({
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
        {visibleItems.map((item) => (
          <Badge key={`${request.id}-${item.variantId}`} variant="outline" className="font-normal">
            {item.brandName ? `${item.brandName} · ` : ''}
            {item.variantName} ×{item.requestedQuantity}
            {request.status !== 'pending_approval' &&
            request.status !== 'approved' &&
            request.status !== 'ready_to_deliver' &&
            request.status !== 'rejected'
              ? ` · D ${getItemDeliveredQty(item)} · R ${getItemReceivedQty(item)}`
              : ''}
          </Badge>
        ))}
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

function requestHasAllocatableQty(request: SubWarehouseStockRequest): boolean {
  return request.items.some((item) => getItemAllocatableQty(item) > 0);
}

function requestHasOpenShortages(request: SubWarehouseStockRequest): boolean {
  return (request.openDiscrepancyCount ?? 0) > 0;
}

function requestCanAllocateRemaining(request: SubWarehouseStockRequest): boolean {
  return (
    request.status === 'partially_received' &&
    requestHasAllocatableQty(request) &&
    !requestHasOpenShortages(request)
  );
}

/** Secondary badge when shortage is resolved and Main can unlock the next receive wave. */
function ReadyToAllocateBadge() {
  return (
    <Badge
      variant="outline"
      className="font-normal text-[10px] h-5 gap-1 border-emerald-300 bg-emerald-50 text-emerald-900"
    >
      <Package className="h-3 w-3" />
      Ready to allocate
    </Badge>
  );
}

function shortageInvestigateUrl(requestNumber: string) {
  return `/inventory/delivery-shortages?source=internal&status=open&search=${encodeURIComponent(requestNumber)}`;
}

function MainRequestActionsMenu({
  request,
  onView,
  onApprove,
  onDeliver,
  onReject,
  onAllocate,
  onExportPdf,
  onPrintDeliveryReceipt,
  onPrintPackingSlip,
}: {
  request: SubWarehouseStockRequest;
  onView: (request: SubWarehouseStockRequest) => void;
  onApprove: (request: SubWarehouseStockRequest) => void;
  onDeliver: (request: SubWarehouseStockRequest) => void;
  onReject: (request: SubWarehouseStockRequest) => void;
  onAllocate: (request: SubWarehouseStockRequest) => void;
  onExportPdf: (request: SubWarehouseStockRequest) => void;
  onPrintDeliveryReceipt: (request: SubWarehouseStockRequest) => void;
  onPrintPackingSlip: (request: SubWarehouseStockRequest) => void;
}) {
  const canApprove = request.status === 'pending_approval';
  const canDeliver =
    request.status === 'approved' ||
    (request.status === 'ready_to_deliver' && request.initiationType === 'main_allocation');
  const canReject = request.status === 'pending_approval' || request.status === 'approved';
  const canAllocate = requestCanAllocateRemaining(request);
  const canInvestigate = requestHasOpenShortages(request);
  const canExport = canExportMainRequestPdf(request);
  const canPrintDr = canExportInternalStockDeliveryReceipt(request);
  const canPrintPacking = canExportInternalStockPackingSlip(request);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onView(request)}>
          <Eye className="mr-2 h-4 w-4" />
          View
        </DropdownMenuItem>
        {canExport ? (
          <DropdownMenuItem onClick={() => onExportPdf(request)}>
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </DropdownMenuItem>
        ) : null}
        {canPrintPacking ? (
          <DropdownMenuItem onClick={() => onPrintPackingSlip(request)}>
            <Package className="mr-2 h-4 w-4" />
            Print packing slip
          </DropdownMenuItem>
        ) : null}
        {canPrintDr ? (
          <DropdownMenuItem onClick={() => onPrintDeliveryReceipt(request)}>
            <Truck className="mr-2 h-4 w-4" />
            Print Delivery Receipt
          </DropdownMenuItem>
        ) : null}
        {canApprove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onApprove(request)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </DropdownMenuItem>
          </>
        ) : null}
        {canDeliver ? (
          <>
            {!canApprove ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => onDeliver(request)}>
              <Send className="mr-2 h-4 w-4" />
              Deliver
            </DropdownMenuItem>
          </>
        ) : null}
        {canReject ? (
          <>
            {!canApprove && !canDeliver ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onReject(request)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </DropdownMenuItem>
          </>
        ) : null}
        {canInvestigate ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={shortageInvestigateUrl(request.requestNumber)}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Investigate shortage
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        {canAllocate ? (
          <>
            {!canInvestigate ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onClick={() => onAllocate(request)}>
              <Package className="mr-2 h-4 w-4" />
              Allocate remaining
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function MainWarehouseSubStockRequestsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: requests = [],
    isLoading: loadingRequests,
    isFetching: fetchingRequests,
    error: requestsError,
  } = useQuery({
    queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY, 'main', user?.company_id, 'rpc-v2-lite'],
    enabled: !!user?.company_id,
    staleTime: 0,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: () => fetchInternalStockRequests(),
  });

  /** List refresh for this page — do not await on mutation success (blocks dialog close). */
  const refreshRequestList = () => {
    void refetchInternalStockRequestLists(queryClient);
  };

  /** Inventory caches — background only; InventoryContext realtime also picks these up. */
  const refreshInventoryCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
  };

  const schedulePostMutationRefresh = () => {
    refreshRequestList();
    refreshInventoryCaches();
    void broadcastInternalStockRequestsChanged(user?.company_id);
  };

  useInternalStockRequestsRealtime({
    enabled: !!user?.company_id,
    companyId: user?.company_id,
  });

  const [viewMode, setViewMode] = useState<ListViewMode>('rows');
  const [listTab, setListTab] = useState<ListTab>('requests');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<MainSubStockRequestSortKey>>(createInitialTableSortCycle);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSignatureDataUrl, setRejectSignatureDataUrl] = useState('');
  const [rejectSignatureOpen, setRejectSignatureOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<SubWarehouseStockRequest | null>(null);
  const deliverProof = useInternalStockDeliveryProof(!!deliverTarget);
  const [allocateTarget, setAllocateTarget] = useState<SubWarehouseStockRequest | null>(null);
  const allocateProof = useInternalStockDeliveryProof(!!allocateTarget);
  const [allocateNote, setAllocateNote] = useState('');
  const [allocateQtys, setAllocateQtys] = useState<Record<string, string>>({});
  const [mainAllocateOpen, setMainAllocateOpen] = useState(false);

  const listDetailFallback = useMemo(
    () => requests.find((r) => r.id === detailRequestId) ?? null,
    [requests, detailRequestId]
  );

  const { data: detailRequestFetched } = useQuery({
    queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY, 'detail', detailRequestId],
    enabled: !!detailRequestId,
    staleTime: 0,
    queryFn: () => fetchInternalStockRequestById(detailRequestId!),
  });

  const detailRequest = detailRequestFetched ?? listDetailFallback;

  const resolveFullRequest = async (
    request: SubWarehouseStockRequest
  ): Promise<SubWarehouseStockRequest> => {
    try {
      const full = await fetchInternalStockRequestById(request.id);
      return full ?? request;
    } catch {
      return request;
    }
  };

  const handleExportPdf = async (request: SubWarehouseStockRequest) => {
    if (!canExportMainRequestPdf(request)) {
      toast({
        title: 'Nothing to export',
        description: 'Approve, reject, or wait for a receive confirmation before exporting.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const full = await resolveFullRequest(request);
      await exportMainSubStockRequestPdf(full);
      toast({
        title: 'PDF opened',
        description: `${request.requestNumber} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not open the PDF.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintDeliveryReceipt = async (request: SubWarehouseStockRequest) => {
    if (!canExportInternalStockDeliveryReceipt(request)) {
      toast({
        title: 'Nothing to print',
        description: 'Deliver the request before printing a Delivery Receipt.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const full = await resolveFullRequest(request);
      await exportInternalStockDeliveryReceiptPdf(full);
      toast({
        title: 'Delivery Receipt opened',
        description: `${request.requestNumber} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not open the Delivery Receipt.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintDeliveryReceiptForEvent = async (
    request: SubWarehouseStockRequest,
    event: DeliveryReceiptWaveEvent
  ) => {
    try {
      const full = await resolveFullRequest(request);
      await exportInternalStockDeliveryReceiptPdf(full, { event });
      toast({
        title: 'Delivery Receipt opened',
        description: `${event.drNumber?.trim() || request.drNumber || request.requestNumber} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Could not open the Delivery Receipt.',
        variant: 'destructive',
      });
    }
  };

  const handlePrintPackingSlip = async (request: SubWarehouseStockRequest) => {
    try {
      const full = await resolveFullRequest(request);
      await exportInternalStockPackingSlipPdf(full);
    } catch (error) {
      toast({
        title: 'Could not print packing slip',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const openAllocateDialog = (request: SubWarehouseStockRequest) => {
    if (requestHasOpenShortages(request)) {
      toast({
        title: 'Open shortage investigation',
        description:
          'Resolve open sub-stock shortages in Delivery Shortages before allocating remaining.',
        variant: 'destructive',
      });
      return;
    }
    if (!requestHasAllocatableQty(request)) {
      const open = getRequestDeliveryTotals(request.items).openReceive;
      toast({
        title: open > 0 ? 'Waiting on sub warehouse' : 'Nothing to allocate',
        description:
          open > 0
            ? 'This short is already unlocked. Wait until the sub confirms receive.'
            : 'No remaining short to allocate on this request.',
        variant: 'destructive',
      });
      return;
    }
    const initial: Record<string, string> = {};
    for (const item of request.items) {
      const allocatable = getItemAllocatableQty(item);
      if (allocatable > 0) initial[item.variantId] = String(allocatable);
    }
    allocateProof.reset();
    setAllocateTarget(request);
    setAllocateNote('');
    setAllocateQtys(initial);
  };

  const closeAllocateDialog = () => {
    setAllocateTarget(null);
    setAllocateNote('');
    setAllocateQtys({});
  };

  const warehouseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const req of requests) {
      if (req.fromLocationId) map.set(req.fromLocationId, req.fromLocationName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);

  const { data: allSubLocations = [], isLoading: loadingSubLocations } = useQuery({
    queryKey: ['sub-warehouse-locations-for-allocate', user?.company_id],
    enabled: !!user?.company_id && mainAllocateOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, name, code')
        .eq('company_id', user!.company_id!)
        .eq('is_main', false)
        .order('name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; code: string | null }>;
    },
  });

  const { data: mainStockBrands = [], isLoading: loadingMainStockBrands } = useQuery({
    queryKey: ['main-warehouse-stock-for-allocate', user?.company_id],
    enabled: !!user?.company_id && mainAllocateOpen,
    queryFn: () => fetchMainWarehouseStockBoard(user!.company_id!),
    staleTime: 30_000,
  });

  const { data: mainAllocatePoReservedByVariantId = {} } = useQuery({
    queryKey: ['main-warehouse-allocate-po-reserved', user?.company_id, mainAllocateOpen],
    enabled: !!user?.company_id && mainAllocateOpen,
    queryFn: async () => {
      const locationId = await resolveStockBoardReservedLocationId({
        companyId: user!.company_id!,
        scope: { kind: 'main', mode: 'available' },
      });
      if (!locationId) return {};
      return fetchOpenTransferPoReservedByVariant(user!.company_id!, locationId);
    },
    staleTime: 30_000,
  });

  const mainAllocateMutation = useMutation({
    mutationFn: async (payload: MainAllocateSubmitPayload) => {
      if (!user?.company_id) throw new Error('Missing company');
      const uploaded = await prepareInternalStockPackageUploads({
        companyId: user.company_id,
        packagePhotos: payload.packagePhotos,
      });
      const result = await createMainStockAllocation({
        fromLocationId: payload.fromLocationId,
        items: payload.items,
        proofImageUrl: uploaded.packages.firstUrl,
        proofImagePath: uploaded.packages.firstPath,
        proofImageUrls: uploaded.packages.urls,
        proofImagePaths: uploaded.packages.paths,
        notes: payload.notes || undefined,
      });
      const requestId =
        typeof result?.request_id === 'string' ? result.request_id : undefined;
      if (requestId) {
        await attachInternalStockProofImageUrls({
          requestId,
          eventType: 'main_allocated',
          proofImageUrls: uploaded.packages.urls,
          proofImagePaths: uploaded.packages.paths,
        });
      }
      return result;
    },
    onSuccess: (result) => {
      setMainAllocateOpen(false);
      const requestNumber =
        typeof result?.request_number === 'string' ? result.request_number : 'Allocation';
      toast({
        title: 'Allocation created',
        description: `${requestNumber} is ready to deliver. Print the packing slip for the boxes.`,
      });
      schedulePostMutationRefresh();

      const requestId = result?.request_id ? String(result.request_id) : null;
      if (!requestId) return;

      void (async () => {
        try {
          const match = await fetchInternalStockRequestById(requestId);
          if (match) await exportInternalStockPackingSlipPdf(match);
        } catch {
          toast({
            title: 'Packing slip',
            description:
              'Allocation created, but the packing slip could not be opened automatically. Use Print packing slip.',
            variant: 'destructive',
          });
        }
      })();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not allocate',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const tabRequests = useMemo(
    () =>
      requests.filter((r) =>
        listTab === 'allocations'
          ? r.initiationType === 'main_allocation'
          : r.initiationType !== 'main_allocation'
      ),
    [requests, listTab]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tabRequests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (warehouseFilter !== 'all' && r.fromLocationId !== warehouseFilter) return false;
      if (!isDateInRange(r.createdAt, dateRange.start, dateRange.end)) return false;
      if (q) {
        const haystack = [
          r.requestNumber,
          r.drNumber ?? '',
          r.fromLocationName,
          r.requestedByName ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [
    tabRequests,
    statusFilter,
    warehouseFilter,
    searchQuery,
    dateRange.end,
    dateRange.start,
  ]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_KEY,
        DEFAULT_MAIN_SUB_STOCK_REQUEST_SORT_DIRECTION
      ),
    [sortState]
  );

  const sorted = useMemo(
    () => sortMainSubStockRequests(filtered, resolvedSortKey, resolvedSortDirection),
    [filtered, resolvedSortKey, resolvedSortDirection]
  );

  useEffect(() => {
    setPage(0);
  }, [listTab, statusFilter, warehouseFilter, searchQuery, dateRangeFilter, pageSize, sortState]);

  useEffect(() => {
    // Drop status filters that don't apply on the allocations tab.
    if (
      listTab === 'allocations' &&
      statusFilter !== 'all' &&
      !ALLOCATION_STATUS_FILTERS.includes(statusFilter)
    ) {
      setStatusFilter('all');
    }
  }, [listTab, statusFilter]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(sorted, page, pageSize);

  const handleSort = (key: MainSubStockRequestSortKey) => {
    setSortState((prev) => getNextTableSortCycleState(prev, key));
  };

  const stats = useMemo(
    () => ({
      total: tabRequests.length,
      pendingApproval: countRequestsByStatus(tabRequests, 'pending_approval'),
      pendingReceive: countRequestsByStatus(tabRequests, 'pending_receive'),
      partial: countRequestsByStatus(tabRequests, 'partially_received'),
      requestCount: requests.filter((r) => r.initiationType !== 'main_allocation').length,
      allocationCount: requests.filter((r) => r.initiationType === 'main_allocation').length,
    }),
    [tabRequests, requests]
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approveTarget) throw new Error('No request selected');
      return approveInternalStockRequest({ requestId: approveTarget.id });
    },
    onSuccess: () => {
      closeApproveDialog();
      toast({
        title: 'Approved',
        description: `${approveTarget?.requestNumber} is approved. Deliver when ready to ship.`,
      });
      schedulePostMutationRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not approve',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deliverMutation = useMutation({
    mutationFn: async () => {
      if (!deliverTarget) {
        throw new Error('No request selected');
      }
      if (!user?.company_id) throw new Error('Missing company');
      const proof = deliverProof.value;
      const isMainReadyToDeliver =
        deliverTarget.initiationType === 'main_allocation' &&
        deliverTarget.status === 'ready_to_deliver';

      if (isMainReadyToDeliver) {
        if (!isInternalStockRiderSignatureProofComplete(proof)) {
          throw new Error('Rider details and signature are required');
        }
        const uploaded = await prepareInternalStockRiderSignatureUploads({
          companyId: user.company_id,
          requestId: deliverTarget.id,
          riderPhotoDataUrl: proof.riderPhotoDataUrl,
          riderPhotoName: proof.riderPhotoName,
          signatureDataUrl: proof.signatureDataUrl,
        });
        return deliverMainStockAllocation({
          requestId: deliverTarget.id,
          signatureUrl: uploaded.signature.url,
          signaturePath: uploaded.signature.path,
          riderName: proof.riderName.trim(),
          riderPlateNumber: proof.riderPlate.trim(),
          riderPhotoUrl: uploaded.rider.url,
          riderPhotoPath: uploaded.rider.path,
        });
      }

      if (!isInternalStockDeliveryProofComplete(proof)) {
        throw new Error('Rider details, package photos, and signature are required');
      }
      const uploaded = await prepareInternalStockDeliveryUploads({
        companyId: user.company_id,
        requestId: deliverTarget.id,
        riderPhotoDataUrl: proof.riderPhotoDataUrl,
        riderPhotoName: proof.riderPhotoName,
        packagePhotos: proof.packagePhotos,
        signatureDataUrl: proof.signatureDataUrl,
      });
      const result = await deliverInternalStockRequest({
        requestId: deliverTarget.id,
        signatureUrl: uploaded.signature.url,
        signaturePath: uploaded.signature.path,
        proofImageUrl: uploaded.packages.firstUrl,
        proofImagePath: uploaded.packages.firstPath,
        riderName: proof.riderName.trim(),
        riderPlateNumber: proof.riderPlate.trim(),
        riderPhotoUrl: uploaded.rider.url,
        riderPhotoPath: uploaded.rider.path,
      });
      await attachInternalStockProofImageUrls({
        requestId: deliverTarget.id,
        eventType: 'delivered',
        proofImageUrls: uploaded.packages.urls,
        proofImagePaths: uploaded.packages.paths,
      });
      return result;
    },
    onSuccess: (result) => {
      const delivered = deliverTarget;
      const proof = deliverProof.value;
      const drNumber =
        typeof result?.dr_number === 'string' && result.dr_number.trim()
          ? result.dr_number.trim()
          : undefined;
      closeDeliverDialog();
      setDetailRequestId(null);
      toast({
        title: 'Delivered',
        description: drNumber
          ? `${delivered?.requestNumber} delivered (${drNumber}). Pending receive at ${delivered?.fromLocationName}.`
          : `${delivered?.requestNumber} is now pending receive at ${delivered?.fromLocationName}.`,
      });
      schedulePostMutationRefresh();

      if (!delivered) return;

      const receiptRequest: SubWarehouseStockRequest = {
        ...delivered,
        status: 'pending_receive',
        drNumber: drNumber || delivered.drNumber,
        riderName: proof.riderName.trim() || delivered.riderName,
        riderPlateNumber: proof.riderPlate.trim() || delivered.riderPlateNumber,
        riderPhotoUrl: proof.riderPhotoDataUrl || delivered.riderPhotoUrl,
        items: delivered.items.map((item) => ({
          ...item,
          deliveredQuantity: item.requestedQuantity,
          receivedQuantity: 0,
          openReceiveQuantity: item.requestedQuantity,
        })),
      };
      void (async () => {
        try {
          await exportInternalStockDeliveryReceiptPdf(receiptRequest);
        } catch {
          toast({
            title: 'Delivery Receipt',
            description:
              'Delivered, but the receipt could not be opened automatically. Use Print Delivery Receipt.',
            variant: 'destructive',
          });
        }
      })();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not deliver',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectTarget) throw new Error('No request selected');
      if (!rejectReason.trim()) throw new Error('Rejection reason is required');
      if (!rejectSignatureDataUrl) throw new Error('Signature required');
      return rejectInternalStockRequest({
        requestId: rejectTarget.id,
        reason: rejectReason.trim(),
        signatureUrl: rejectSignatureDataUrl,
      });
    },
    onSuccess: () => {
      closeRejectDialog();
      setDetailRequestId(null);
      toast({
        title: 'Request rejected',
        description: `${rejectTarget?.requestNumber} was rejected.`,
      });
      schedulePostMutationRefresh();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not reject',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const allocateMutation = useMutation({
    mutationFn: async (payload: {
      requestId: string;
      requestNumber: string;
      lines: Array<{ variant_id: string; quantity: number }>;
      note?: string;
      shortBefore: number;
      packagePhotos: import('@/features/shared/components/MultiProofPhotoField').PackageProofPhotoItem[];
      signatureDataUrl: string;
      riderName: string;
      riderPlateNumber: string;
      riderPhotoDataUrl: string;
      riderPhotoName?: string;
    }) => {
      if (!user?.company_id) throw new Error('Missing company');
      const uploaded = await prepareInternalStockDeliveryUploads({
        companyId: user.company_id,
        requestId: payload.requestId,
        riderPhotoDataUrl: payload.riderPhotoDataUrl,
        riderPhotoName: payload.riderPhotoName,
        packagePhotos: payload.packagePhotos,
        signatureDataUrl: payload.signatureDataUrl,
      });
      const result = await allocateInternalStockRequestRemaining({
        requestId: payload.requestId,
        lines: payload.lines,
        note: payload.note,
        proofImageUrl: uploaded.packages.firstUrl,
        proofImagePath: uploaded.packages.firstPath,
        signatureUrl: uploaded.signature.url,
        signaturePath: uploaded.signature.path,
        riderName: payload.riderName,
        riderPlateNumber: payload.riderPlateNumber,
        riderPhotoUrl: uploaded.rider.url,
        riderPhotoPath: uploaded.rider.path,
      });
      await attachInternalStockProofImageUrls({
        requestId: payload.requestId,
        eventType: 'remaining_released',
        proofImageUrls: uploaded.packages.urls,
        proofImagePaths: uploaded.packages.paths,
      });
      return { ...result, meta: payload };
    },
    onSuccess: ({ allocated, meta, dr_number }) => {
      const totalAllocated = allocated ?? meta.lines.reduce((s, l) => s + l.quantity, 0);
      const drNumber =
        typeof dr_number === 'string' && dr_number.trim() ? dr_number.trim() : undefined;
      closeAllocateDialog();
      setDetailRequestId(meta.requestId);
      toast({
        title: 'Remaining allocated',
        description: drNumber
          ? totalAllocated < meta.shortBefore
            ? `${meta.requestNumber}: allocated ${totalAllocated} of short ${meta.shortBefore} (${drNumber}). Status stays partially received until fully received.`
            : `${meta.requestNumber}: allocated ${totalAllocated} (${drNumber}). Sub can confirm receive; status becomes fully received when confirmed.`
          : totalAllocated < meta.shortBefore
            ? `${meta.requestNumber}: allocated ${totalAllocated} of short ${meta.shortBefore}. Status stays partially received until fully received.`
            : `${meta.requestNumber}: allocated ${totalAllocated} (full short). Sub can confirm receive; status becomes fully received when confirmed.`,
      });
      schedulePostMutationRefresh();

      void (async () => {
        try {
          const match = await fetchInternalStockRequestById(meta.requestId);
          if (!match) return;
          const wave =
            match.history
              ?.filter(
                (e): e is DeliveryReceiptWaveEvent =>
                  e.type === 'remaining_released' &&
                  (!drNumber || e.drNumber === drNumber)
              )
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0] ??
            undefined;
          await exportInternalStockDeliveryReceiptPdf(match, wave ? { event: wave } : undefined);
        } catch {
          toast({
            title: 'Delivery Receipt',
            description:
              'Allocated, but the receipt could not be opened automatically. Use Print DR on the timeline.',
            variant: 'destructive',
          });
        }
      })();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not allocate',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const openApproveDialog = (request: SubWarehouseStockRequest) => {
    if (request.status !== 'pending_approval') return;
    setApproveTarget(request);
  };

  const closeApproveDialog = () => {
    setApproveTarget(null);
  };

  const handleConfirmApprove = () => {
    if (!approveTarget) return;
    approveMutation.mutate();
  };

  const openDeliverDialog = (request: SubWarehouseStockRequest) => {
    const canDeliver =
      request.status === 'approved' ||
      (request.status === 'ready_to_deliver' && request.initiationType === 'main_allocation');
    if (!canDeliver) return;
    deliverProof.reset();
    setDeliverTarget(request);
  };

  const closeDeliverDialog = () => {
    setDeliverTarget(null);
  };

  const isDeliverMainAllocation =
    deliverTarget?.initiationType === 'main_allocation' &&
    deliverTarget?.status === 'ready_to_deliver';

  const handleConfirmDeliver = () => {
    if (!deliverTarget) return;
    if (isDeliverMainAllocation) {
      if (!isInternalStockRiderSignatureProofComplete(deliverProof.value)) {
        toast({
          title: 'Delivery proof incomplete',
          description: 'Rider name, plate, photo, and signature are required.',
          variant: 'destructive',
        });
        return;
      }
    } else if (!isInternalStockDeliveryProofComplete(deliverProof.value)) {
      toast({
        title: 'Delivery proof incomplete',
        description: 'Rider name, plate, photo, delivery proof, and signature are required.',
        variant: 'destructive',
      });
      return;
    }
    deliverMutation.mutate();
  };

  const handleAllocateRemaining = () => {
    if (!allocateTarget) return;

    const lines = allocateTarget.items
      .map((item) => {
        const raw = allocateQtys[item.variantId] ?? '';
        const qty = raw.trim() === '' ? 0 : Number(raw);
        const max = getItemAllocatableQty(item);
        return {
          variantId: item.variantId,
          quantity: Number.isFinite(qty) ? Math.min(Math.max(0, Math.floor(qty)), max) : 0,
          max,
          raw,
        };
      })
      .filter((line) => {
        const item = allocateTarget.items.find((i) => i.variantId === line.variantId);
        return item ? getItemAllocatableQty(item) > 0 || line.raw.trim() !== '' : false;
      });

    for (const line of lines) {
      if (line.raw.trim() !== '' && (!/^\d+$/.test(line.raw.trim()) || Number(line.raw) < 0)) {
        toast({
          title: 'Invalid quantity',
          description: 'Allocate qty must be a whole number ≥ 0.',
          variant: 'destructive',
        });
        return;
      }
      if (Number(line.raw || 0) > line.max) {
        toast({
          title: 'Exceeds available to allocate',
          description: `Cannot allocate more than ${line.max} for a line (short minus already unlocked).`,
          variant: 'destructive',
        });
        return;
      }
    }

    const payload = lines
      .map((line) => ({ variant_id: line.variantId, quantity: line.quantity }))
      .filter((line) => line.quantity > 0);

    if (payload.length === 0) {
      toast({
        title: 'Nothing to allocate',
        description: 'Enter at least one allocate quantity greater than 0.',
        variant: 'destructive',
      });
      return;
    }

    if (!isInternalStockDeliveryProofComplete(allocateProof.value)) {
      toast({
        title: 'Delivery proof incomplete',
        description: 'Rider name, plate, photo, proof photo, and signature are required.',
        variant: 'destructive',
      });
      return;
    }

    const shortBefore = getRequestDeliveryTotals(allocateTarget.items).short;
    const proof = allocateProof.value;

    allocateMutation.mutate({
      requestId: allocateTarget.id,
      requestNumber: allocateTarget.requestNumber,
      lines: payload,
      note: allocateNote.trim() || undefined,
      shortBefore,
      packagePhotos: proof.packagePhotos,
      signatureDataUrl: proof.signatureDataUrl,
      riderName: proof.riderName.trim(),
      riderPlateNumber: proof.riderPlate.trim(),
      riderPhotoDataUrl: proof.riderPhotoDataUrl,
      riderPhotoName: proof.riderPhotoName,
    });
  };

  const openRejectDialog = (request: SubWarehouseStockRequest) => {
    if (request.status !== 'pending_approval' && request.status !== 'approved') return;
    setRejectReason('');
    setRejectSignatureDataUrl('');
    setRejectSignatureOpen(false);
    setRejectTarget(request);
  };

  const closeRejectDialog = () => {
    setRejectTarget(null);
    setRejectReason('');
    setRejectSignatureDataUrl('');
    setRejectSignatureOpen(false);
  };

  const handleRejectConfirm = () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Enter a rejection reason.',
        variant: 'destructive',
      });
      return;
    }
    if (!rejectSignatureDataUrl) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm this rejection.',
        variant: 'destructive',
      });
      return;
    }
    rejectMutation.mutate();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Transfer</h1>
          <p className="text-muted-foreground">
            Review stock requests from sub-warehouses, or allocate stock directly. Approve, then
            deliver, or monitor receive status and shortages.
          </p>
          {requestsError ? (
            <p className="text-sm text-destructive mt-2">
              {(requestsError as Error).message || 'Failed to load requests from the server.'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="gap-2" onClick={() => setMainAllocateOpen(true)}>
            <Send className="h-4 w-4" />
            Transfer to Sub-warehouse
          </Button>
          <PageGettingStartedDialog />
          <PageManualDialog
            title="Sub Stock Requests & Allocations Manual"
            fullManualHref="/warehouse-manual#sub-stock-requests"
          >
            <SubStockRequestsManual embedded />
          </PageManualDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              {listTab === 'allocations' ? 'Allocations' : 'Requests'}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        {listTab === 'requests' ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending approval</p>
              <p className="text-2xl font-semibold tabular-nums">{stats.pendingApproval}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Fully received</p>
              <p className="text-2xl font-semibold tabular-nums">
                {countRequestsByStatus(tabRequests, 'fully_received')}
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending receive</p>
            <p className="text-2xl font-semibold tabular-nums">{stats.pendingReceive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Partially received</p>
            <p className="text-2xl font-semibold tabular-nums">{stats.partial}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={listTab}
        onValueChange={(v) => setListTab(v as ListTab)}
        className="space-y-4"
      >
        <TabsList className="bg-muted/30 p-1 border h-auto w-full sm:w-auto">
          <TabsTrigger
            value="requests"
            className="px-4 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none"
          >
            Stock requests
            <Badge variant="secondary" className="tabular-nums font-normal">
              {stats.requestCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="allocations"
            className="px-4 py-2 gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1 sm:flex-none"
          >
            Allocations
            <Badge variant="secondary" className="tabular-nums font-normal">
              {stats.allocationCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {listTab === 'allocations' ? 'Main allocations' : 'Incoming requests'}
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal mt-1">
                {listTab === 'allocations'
                  ? 'Stock you pushed to sub-warehouses without a prior request. Subs confirm receive.'
                  : 'Stock requests raised by sub-warehouses. Approve, then deliver.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative w-full sm:w-[220px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    listTab === 'allocations' ? 'Search AL / DR…' : 'Search RN / DR…'
                  }
                  className="h-9 pl-8"
                />
              </div>
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-9">
                  <SelectValue placeholder="Sub-warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {warehouseOptions.map((wh) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {(listTab === 'allocations'
                    ? ALLOCATION_STATUS_FILTERS
                    : (Object.keys(STATUS_LABELS) as SubWarehouseStockRequestStatus[])
                  ).map((s) => (
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
          {loadingRequests && requests.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading requests…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {tabRequests.length === 0
                ? listTab === 'allocations'
                  ? 'No allocations yet. Use Allocate to Sub Warehouse to push stock.'
                  : 'No stock requests from sub-warehouses yet.'
                : 'No items match this filter.'}
              {fetchingRequests ? (
                <span className="mt-2 flex items-center justify-center gap-1.5 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refreshing…
                </span>
              ) : null}
            </p>
          ) : viewMode === 'cards' ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pagedItems.map((req) => {
                const totals = getRequestDeliveryTotals(req.items);
                return (
                  <li key={req.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium tabular-nums">{req.requestNumber}</p>
                          {req.initiationType === 'main_allocation' ? (
                            <Badge variant="outline" className="font-normal text-[10px] h-5">
                              Main allocation
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {req.fromLocationName}
                          {req.requestedByName
                            ? ` · ${
                                req.initiationType === 'main_allocation'
                                  ? 'Allocated by'
                                  : 'Requested by'
                              } ${req.requestedByName}`
                            : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRequestDate(req.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <StatusBadge status={req.status} />
                          <MainRequestActionsMenu
                            request={req}
                            onView={(r) => setDetailRequestId(r.id)}
                            onApprove={openApproveDialog}
                            onDeliver={openDeliverDialog}
                            onReject={openRejectDialog}
                            onAllocate={openAllocateDialog}
                            onExportPdf={(r) => void handleExportPdf(r)}
                            onPrintDeliveryReceipt={(r) => void handlePrintDeliveryReceipt(r)}
                            onPrintPackingSlip={(r) => void handlePrintPackingSlip(r)}
                          />
                        </div>
                        {requestHasOpenShortages(req) ? (
                          <Badge variant="destructive" className="font-normal text-[10px] h-5">
                            Open shortage
                          </Badge>
                        ) : requestCanAllocateRemaining(req) ? (
                          <ReadyToAllocateBadge />
                        ) : null}
                      </div>
                    </div>

                    <MainItemChips request={req} />

                    {req.status === 'partially_received' && totals.short > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-800">
                          {requestHasOpenShortages(req) ? (
                            <>
                              Short {totals.short} on {req.requestNumber} —{' '}
                              {(req.openDiscrepancyCount ?? 0) === 1
                                ? '1 open shortage'
                                : `${req.openDiscrepancyCount} open shortages`}
                              . Resolve before Allocate Remaining.
                            </>
                          ) : requestCanAllocateRemaining(req) ? (
                            <>
                              Short {totals.short} on {req.requestNumber} — allocate remaining for
                              the next receive wave.
                            </>
                          ) : requestHasOpenReceive(req.items) ? (
                            <>
                              Short {totals.short} unlocked for sub confirm on {req.requestNumber}.
                              Wait until they receive this wave.
                            </>
                          ) : (
                            <>
                              Short {totals.short} on {req.requestNumber} — allocate remaining for
                              the next receive wave.
                            </>
                          )}
                        </p>
                        {requestHasOpenShortages(req) ? (
                          <Button asChild size="sm" variant="outline" className="h-8">
                            <Link to={shortageInvestigateUrl(req.requestNumber)}>
                              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                              Resolve shortage
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {req.notes ? (
                      <p className="text-xs text-muted-foreground">Notes: {req.notes}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <div className="px-3 py-2 border-b bg-muted/30">
                <QtyLegend />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Request"
                      sortKey="requestNumber"
                      sortDirection={getTableSortDisplayDirection(sortState, 'requestNumber')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Sub-warehouse"
                      sortKey="subWarehouse"
                      sortDirection={getTableSortDisplayDirection(sortState, 'subWarehouse')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Date"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Qty"
                      sortKey="qty"
                      sortDirection={getTableSortDisplayDirection(sortState, 'qty')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Status"
                      sortKey="status"
                      sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                      onSort={handleSort}
                    />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((req) => {
                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium tabular-nums whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span>{req.requestNumber}</span>
                            {req.initiationType === 'main_allocation' ? (
                              <Badge variant="outline" className="font-normal text-[10px] h-5 w-fit">
                                Main allocation
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{req.fromLocationName}</p>
                            {req.requestedByName ? (
                              <p className="text-xs text-muted-foreground">
                                {req.initiationType === 'main_allocation'
                                  ? 'Allocated by '
                                  : ''}
                                {req.requestedByName}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatRequestDate(req.createdAt)}
                        </TableCell>
                        <TableCell className="min-w-[12rem]">
                          <RequestQtySummary request={req} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <StatusBadge status={req.status} />
                            {requestHasOpenShortages(req) ? (
                              <Badge variant="destructive" className="font-normal text-[10px] h-5">
                                Open shortage
                              </Badge>
                            ) : requestCanAllocateRemaining(req) ? (
                              <ReadyToAllocateBadge />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-2">
                            {requestHasOpenShortages(req) ? (
                              <Button asChild size="sm" variant="outline" className="h-8">
                                <Link to={shortageInvestigateUrl(req.requestNumber)}>
                                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                  Resolve shortage
                                </Link>
                              </Button>
                            ) : null}
                            <MainRequestActionsMenu
                              request={req}
                              onView={(r) => setDetailRequestId(r.id)}
                              onApprove={openApproveDialog}
                              onDeliver={openDeliverDialog}
                              onReject={openRejectDialog}
                              onAllocate={openAllocateDialog}
                              onExportPdf={(r) => void handleExportPdf(r)}
                              onPrintDeliveryReceipt={(r) => void handlePrintDeliveryReceipt(r)}
                              onPrintPackingSlip={(r) => void handlePrintPackingSlip(r)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
      </Card>
      </Tabs>

      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequestId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailRequest ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detailRequest.requestNumber}
                  {detailRequest.initiationType === 'main_allocation' ? (
                    <Badge variant="outline" className="font-normal text-[10px] h-5">
                      Main allocation
                    </Badge>
                  ) : null}
                  <StatusBadge status={detailRequest.status} />
                  {requestHasOpenShortages(detailRequest) ? (
                    <Badge variant="destructive" className="font-normal text-[10px] h-5">
                      Open shortage
                    </Badge>
                  ) : requestCanAllocateRemaining(detailRequest) ? (
                    <ReadyToAllocateBadge />
                  ) : null}
                </DialogTitle>
                <p className="text-sm text-muted-foreground font-normal pt-1">
                  {detailRequest.fromLocationName}
                  {detailRequest.requestedByName
                    ? ` · ${
                        detailRequest.initiationType === 'main_allocation'
                          ? 'Allocated by'
                          : 'Requested by'
                      } ${detailRequest.requestedByName}`
                    : ''}
                  {' · '}
                  {formatRequestDate(detailRequest.createdAt)}
                  {detailRequest.drNumber ? ` · DR ${detailRequest.drNumber}` : ''}
                </p>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {detailRequest.status === 'partially_received' ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                    <p className="text-sm text-amber-800">
                      Short {getRequestDeliveryTotals(detailRequest.items).short} units on{' '}
                      <span className="font-medium tabular-nums">{detailRequest.requestNumber}</span>.
                      {requestHasOpenShortages(detailRequest) ? (
                        <>
                          {' '}
                          Open shortage investigation — resolve before Allocate Remaining.
                        </>
                      ) : requestCanAllocateRemaining(detailRequest) ? (
                        ' Allocate a receive wave now; the sub can confirm only what you unlock.'
                      ) : requestHasOpenReceive(detailRequest.items) ? (
                        ' Unlocked qty is waiting for the sub to confirm this wave.'
                      ) : (
                        ' Allocate a receive wave when stock is available; the sub waits until then.'
                      )}{' '}
                      Status stays partially received until the short is fully confirmed.
                    </p>
                    {requestHasOpenShortages(detailRequest) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="destructive" className="font-normal text-[10px] h-5">
                          {(detailRequest.openDiscrepancyCount ?? 0) === 1
                            ? '1 open shortage'
                            : `${detailRequest.openDiscrepancyCount} open shortages`}
                        </Badge>
                        <Button asChild size="sm" variant="outline" className="h-8">
                          <Link to={shortageInvestigateUrl(detailRequest.requestNumber)}>
                            <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                            Resolve shortage
                          </Link>
                        </Button>
                      </div>
                    ) : requestCanAllocateRemaining(detailRequest) ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <ReadyToAllocateBadge />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {detailRequest.notes ? (
                  <div className="flex gap-2.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
                    <MessageSquareText className="h-4 w-4 shrink-0 mt-0.5 text-sky-700" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                        {detailRequest.initiationType === 'main_allocation'
                          ? 'Allocation notes'
                          : 'Request notes'}
                      </p>
                      <p className="whitespace-pre-wrap leading-snug">{detailRequest.notes}</p>
                    </div>
                  </div>
                ) : null}
                {/* {detailRequest.receiveNotes ? (
                  <p className="text-sm text-muted-foreground">
                    Receive notes: {detailRequest.receiveNotes}
                  </p>
                ) : null} */}
                {detailRequest.rejectionReason ? (
                  <div className="flex gap-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950">
                    <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-700" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                        Rejection
                      </p>
                      <p className="whitespace-pre-wrap leading-snug">{detailRequest.rejectionReason}</p>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  {/* <p className="text-sm font-medium">Request history</p> */}
                  <SubWarehouseRequestHistoryTimeline
                    history={detailRequest.history}
                    items={detailRequest.items}
                    request={detailRequest}
                    riderName={detailRequest.riderName}
                    riderPlateNumber={detailRequest.riderPlateNumber}
                    riderPhotoUrl={detailRequest.riderPhotoUrl}
                    onPrintDeliveryReceipt={(event) =>
                      void handlePrintDeliveryReceiptForEvent(detailRequest, event)
                    }
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setDetailRequestId(null)}>
                  Close
                </Button>
                {canExportMainRequestPdf(detailRequest) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleExportPdf(detailRequest)}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                ) : null}
                {canExportInternalStockPackingSlip(detailRequest) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePrintPackingSlip(detailRequest)}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Print packing slip
                  </Button>
                ) : null}
                {canExportInternalStockDeliveryReceipt(detailRequest) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handlePrintDeliveryReceipt(detailRequest)}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Print Delivery Receipt
                  </Button>
                ) : null}
                {detailRequest.status === 'pending_approval' ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => openRejectDialog(detailRequest)}
                    >
                      Reject
                    </Button>
                    <Button type="button" onClick={() => openApproveDialog(detailRequest)}>
                      Approve
                    </Button>
                  </>
                ) : null}
                {detailRequest.status === 'approved' ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => openRejectDialog(detailRequest)}
                    >
                      Reject
                    </Button>
                    <Button type="button" onClick={() => openDeliverDialog(detailRequest)}>
                      Deliver
                    </Button>
                  </>
                ) : null}
                {detailRequest.status === 'ready_to_deliver' &&
                detailRequest.initiationType === 'main_allocation' ? (
                  <Button type="button" onClick={() => openDeliverDialog(detailRequest)}>
                    Deliver
                  </Button>
                ) : null}
                {detailRequest.status === 'partially_received' &&
                requestCanAllocateRemaining(detailRequest) ? (
                  <Button type="button" onClick={() => openAllocateDialog(detailRequest)}>
                    Allocate remaining
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!allocateTarget}
        onOpenChange={(open) => {
          if (!open) closeAllocateDialog();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Allocate remaining — {allocateTarget?.requestNumber}
            </DialogTitle>
          </DialogHeader>
          {allocateTarget ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Unlock a receive wave for the remaining short (based on available inventory).
                Short total:{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {getRequestDeliveryTotals(allocateTarget.items).short}
                </span>
                . Sub confirms only what you unlock now; status stays{' '}
                <span className="font-medium">partially received</span> until the short is fully
                received.
              </p>
              <div className="rounded-md border divide-y">
                <div className="hidden sm:grid grid-cols-[1fr_4.5rem_5.5rem] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40">
                  <span>SKU</span>
                  <span className="text-right">Short</span>
                  <span className="text-right">Allocate</span>
                </div>
                {allocateTarget.items
                  .map((item) => ({
                    ...item,
                    short: getItemShortQty(item),
                    allocatable: getItemAllocatableQty(item),
                  }))
                  .filter((item) => item.short > 0)
                  .map((item) => (
                    <div
                      key={item.variantId}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_4.5rem_5.5rem] gap-2 px-3 py-3 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.variantName}</p>
                        <p className="text-xs text-muted-foreground">
                          Total short {item.short}
                          {item.allocatable < item.short
                            ? ` · ${item.short - item.allocatable} already unlocked`
                            : ''}
                          {` · Available now ${item.allocatable}`}
                        </p>
                      </div>
                      <div className="flex sm:block items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground sm:hidden">Short</span>
                        <p className="text-sm tabular-nums text-right font-medium">
                          {item.allocatable}
                        </p>
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={item.allocatable}
                        step={1}
                        className="h-9 text-right tabular-nums"
                        value={allocateQtys[item.variantId] ?? ''}
                        onChange={(e) =>
                          setAllocateQtys((prev) => ({
                            ...prev,
                            [item.variantId]: e.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                  ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocate-note">Note (optional)</Label>
                <Textarea
                  id="allocate-note"
                  value={allocateNote}
                  onChange={(e) => setAllocateNote(e.target.value)}
                  placeholder="e.g. Only 3 available in main inventory"
                  rows={2}
                />
              </div>

              <InternalStockDeliveryProofFields
                value={allocateProof.value}
                onChange={allocateProof.patch}
                riderPhotoError={allocateProof.riderPhotoError}
                proofError={allocateProof.proofError}
                onRiderPhotoError={allocateProof.setRiderPhotoError}
                onProofError={allocateProof.setProofError}
                labels={{
                  idPrefix: 'allocate-remaining',
                  proofLabel: 'Proof photo (required)',
                  proofUploadTitle: 'Upload allocate proof',
                  proofAlt: 'Allocate proof',
                  signatureAlt: 'Allocator signature',
                  signatureDialogTitle: 'Sign to allocate remaining',
                  signatureCanvasTitle: 'Allocator signature',
                  signatureCanvasDescription:
                    'Draw your signature to confirm this allocation wave',
                }}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAllocateDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAllocateRemaining}
              disabled={
                !isInternalStockDeliveryProofComplete(allocateProof.value) ||
                allocateMutation.isPending
              }
            >
              {allocateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Allocating…
                </>
              ) : (
                'Confirm allocate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) closeApproveDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve request — {approveTarget?.requestNumber}</DialogTitle>
          </DialogHeader>
          {approveTarget ? (
            <div className="space-y-3 py-1 text-sm text-muted-foreground">
              <p>
                Approve this request for{' '}
                <span className="text-foreground font-medium">{approveTarget.fromLocationName}</span>
                ? Stock will not move until you deliver.
              </p>
              <p className="tabular-nums">
                Total requested:{' '}
                <span className="text-foreground font-medium">
                  {requestedTotal(approveTarget).toLocaleString()}
                </span>
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeApproveDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApprove}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deliverTarget}
        onOpenChange={(open) => {
          if (!open) closeDeliverDialog();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isDeliverMainAllocation
                ? `Deliver allocation — ${deliverTarget?.requestNumber}`
                : `Deliver request — ${deliverTarget?.requestNumber}`}
            </DialogTitle>
          </DialogHeader>
          {deliverTarget ? (
            <div className="space-y-4 py-1">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Sub-warehouse:{' '}
                  <span className="text-foreground font-medium">{deliverTarget.fromLocationName}</span>
                </p>
                {deliverTarget.requestedByName ? (
                  <p>
                    Requested by:{' '}
                    <span className="text-foreground font-medium">{deliverTarget.requestedByName}</span>
                  </p>
                ) : null}
                {deliverTarget.notes ? <p>Notes: {deliverTarget.notes}</p> : null}
                {isDeliverMainAllocation ? (
                  <p>
                    Package photos were captured at allocation. Add rider details to dispatch.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Items to deliver</p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">Brand</TableHead>
                        <TableHead className="h-9 text-xs">Variant</TableHead>
                        <TableHead className="h-9 text-xs text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliverTarget.items.map((item) => (
                        <TableRow key={item.variantId} className="hover:bg-transparent">
                          <TableCell className="py-2.5 text-sm">
                            {item.brandName?.trim() || '—'}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm">{item.variantName}</TableCell>
                          <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                            {item.requestedQuantity.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground text-right tabular-nums">
                  Total to deliver: {requestedTotal(deliverTarget).toLocaleString()}
                </p>
              </div>

              <InternalStockDeliveryProofFields
                mode={isDeliverMainAllocation ? 'rider' : 'full'}
                value={deliverProof.value}
                onChange={deliverProof.patch}
                riderPhotoError={deliverProof.riderPhotoError}
                proofError={deliverProof.proofError}
                onRiderPhotoError={deliverProof.setRiderPhotoError}
                onProofError={deliverProof.setProofError}
                labels={{
                  idPrefix: 'deliver',
                  sectionTitle: isDeliverMainAllocation ? 'Rider & signature' : undefined,
                  signatureAlt: 'Delivery signature',
                  signatureDialogTitle: 'Sign to deliver',
                  signatureCanvasTitle: 'Delivery signature',
                  signatureCanvasDescription:
                    'Draw your signature to confirm this delivery',
                }}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDeliverDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmDeliver}
              disabled={
                (isDeliverMainAllocation
                  ? !isInternalStockRiderSignatureProofComplete(deliverProof.value)
                  : !isInternalStockDeliveryProofComplete(deliverProof.value)) ||
                deliverMutation.isPending
              }
            >
              {deliverMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Delivering…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Confirm deliver
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) closeRejectDialog();
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reject request — {rejectTarget?.requestNumber}</DialogTitle>
          </DialogHeader>
          {rejectTarget ? (
            <div className="space-y-4 py-1">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Sub-warehouse:{' '}
                  <span className="text-foreground font-medium">{rejectTarget.fromLocationName}</span>
                </p>
                {rejectTarget.requestedByName ? (
                  <p>
                    Requested by:{' '}
                    <span className="text-foreground font-medium">{rejectTarget.requestedByName}</span>
                  </p>
                ) : null}
                {rejectTarget.notes ? <p>Notes: {rejectTarget.notes}</p> : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Requested items</p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 text-xs">Brand</TableHead>
                        <TableHead className="h-9 text-xs">Variant</TableHead>
                        <TableHead className="h-9 text-xs text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rejectTarget.items.map((item) => (
                        <TableRow key={item.variantId} className="hover:bg-transparent">
                          <TableCell className="py-2.5 text-sm">
                            {item.brandName?.trim() || '—'}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm">{item.variantName}</TableCell>
                          <TableCell className="py-2.5 text-sm text-right tabular-nums font-medium">
                            {item.requestedQuantity.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground text-right tabular-nums">
                  Total requested: {requestedTotal(rejectTarget).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason (required)</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Why is this request rejected?"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Signature (required)</Label>
                {!rejectSignatureDataUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setRejectSignatureOpen(true)}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Add signature
                  </Button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <img
                      src={rejectSignatureDataUrl}
                      alt="Rejection signature"
                      className="max-h-28 mx-auto bg-white rounded-md"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectSignatureDataUrl('')}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRejectSignatureOpen(true)}
                      >
                        Re-sign
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      By signing, you confirm rejection of these requested items.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeRejectDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={!rejectReason.trim() || !rejectSignatureDataUrl || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting…
                </>
              ) : (
                'Reject request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectSignatureOpen} onOpenChange={setRejectSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to confirm rejection</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Rejection signature"
            description="Draw your signature to confirm this rejection"
            onSave={(dataUrl) => {
              setRejectSignatureDataUrl(dataUrl);
              setRejectSignatureOpen(false);
            }}
            onCancel={() => setRejectSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <MainWarehouseAllocateDialog
        open={mainAllocateOpen}
        onOpenChange={setMainAllocateOpen}
        locations={allSubLocations}
        loadingLocations={loadingSubLocations}
        brands={mainStockBrands}
        loadingBrands={loadingMainStockBrands}
        poReservedByVariantId={mainAllocatePoReservedByVariantId}
        submitting={mainAllocateMutation.isPending}
        onSubmit={async (payload) => {
          await mainAllocateMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
