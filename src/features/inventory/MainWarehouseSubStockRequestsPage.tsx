import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MessageSquareText,
  MoreVertical,
  Package,
  PenTool,
  Search,
  Send,
  Trash2,
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
  INTERNAL_STOCK_REQUESTS_QUERY_KEY,
  allocateInternalStockRequestRemaining,
  approveInternalStockRequest,
  createAndDeliverMainStockAllocation,
  deliverInternalStockRequest,
  fetchInternalStockRequests,
  rejectInternalStockRequest,
} from './internalStockRequestsApi';
import { countRequestsByStatus } from './internalStockRequestsMappers';
import {
  canExportMainRequestPdf,
  exportMainSubStockRequestPdf,
} from './utils/exportMainSubStockRequestPdf';
import {
  canExportInternalStockDeliveryReceipt,
  exportInternalStockDeliveryReceiptPdf,
  type DeliveryReceiptWaveEvent,
} from './utils/exportInternalStockDeliveryReceiptPdf';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import SubStockRequestsManual from '@/features/inventory/warehouse-manual/components/SubStockRequestsManual';
import {
  MainWarehouseAllocateDialog,
  type MainAllocateSubmitPayload,
} from './components/MainWarehouseAllocateDialog';
import { fetchMainWarehouseStockBoard } from './warehouseStockBoard';
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
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';

const STATUS_LABELS: Record<SubWarehouseStockRequestStatus, string> = {
  pending_approval: 'Pending approval',
  approved: 'Approved',
  pending_receive: 'Pending receive',
  partially_received: 'Partially received',
  fully_received: 'Fully received',
  rejected: 'Rejected',
};

type ListViewMode = 'cards' | 'rows';
type StatusFilter = 'all' | SubWarehouseStockRequestStatus;
type ListTab = 'requests' | 'allocations';

const ALLOCATION_STATUS_FILTERS: SubWarehouseStockRequestStatus[] = [
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

const MAX_PROOF_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image'));
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function proofFileValidationError(file: File): string | null {
  if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
    return 'Use JPG, PNG, WEBP, or GIF.';
  }
  if (file.size > MAX_PROOF_IMAGE_BYTES) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
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

function MainRequestActionsMenu({
  request,
  onView,
  onApprove,
  onDeliver,
  onReject,
  onAllocate,
  onExportPdf,
  onPrintDeliveryReceipt,
}: {
  request: SubWarehouseStockRequest;
  onView: (request: SubWarehouseStockRequest) => void;
  onApprove: (request: SubWarehouseStockRequest) => void;
  onDeliver: (request: SubWarehouseStockRequest) => void;
  onReject: (request: SubWarehouseStockRequest) => void;
  onAllocate: (request: SubWarehouseStockRequest) => void;
  onExportPdf: (request: SubWarehouseStockRequest) => void;
  onPrintDeliveryReceipt: (request: SubWarehouseStockRequest) => void;
}) {
  const canApprove = request.status === 'pending_approval';
  const canDeliver = request.status === 'approved';
  const canReject = request.status === 'pending_approval' || request.status === 'approved';
  const canAllocate =
    request.status === 'partially_received' && requestHasAllocatableQty(request);
  const canExport = canExportMainRequestPdf(request);
  const canPrintDr = canExportInternalStockDeliveryReceipt(request);

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
        {canAllocate ? (
          <>
            <DropdownMenuSeparator />
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
    error: requestsError,
    isFetching: fetchingRequests,
    status: queryStatus,
  } = useQuery({
    queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY, 'main', user?.company_id, 'rpc-v1'],
    enabled: !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      console.log('[MainSubStockRequests] fetch start', {
        companyId: user?.company_id,
        userId: user?.id,
        email: user?.email,
        role: user?.role,
      });

      const { data: accessDebug, error: accessDebugErr } = await supabase.rpc(
        'debug_internal_stock_request_access'
      );
      console.log('[MainSubStockRequests] access debug RPC', { accessDebug, accessDebugErr });

      const { data: idList, error: idListErr } = await supabase.rpc(
        'list_visible_internal_stock_request_ids',
        { p_from_location_id: null }
      );
      console.log('[MainSubStockRequests] visible ids RPC', {
        count: Array.isArray(idList) ? idList.length : 0,
        idList,
        idListErr,
      });

      try {
        const data = await fetchInternalStockRequests();
        console.log('[MainSubStockRequests] fetch OK', {
          count: data.length,
          requestNumbers: data.map((r) => r.requestNumber),
          requests: data,
        });
        return data;
      } catch (err) {
        console.error('[MainSubStockRequests] fetch FAILED', err);
        throw err;
      }
    },
  });

  const invalidateRequests = async () => {
    await queryClient.invalidateQueries({ queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY] });
    await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    await queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
  };

  // Live updates when sub creates/receives (or any status change on company requests).
  useEffect(() => {
    if (!user?.company_id) return;

    const channel = supabase
      .channel(`internal-stock-requests-main-${user.company_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'internal_stock_requests',
          filter: `company_id=eq.${user.company_id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.company_id, queryClient]);

  const [viewMode, setViewMode] = useState<ListViewMode>('rows');
  const [listTab, setListTab] = useState<ListTab>('requests');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSignatureDataUrl, setRejectSignatureDataUrl] = useState('');
  const [rejectSignatureOpen, setRejectSignatureOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [deliverSignatureDataUrl, setDeliverSignatureDataUrl] = useState('');
  const [deliverSignatureOpen, setDeliverSignatureOpen] = useState(false);
  const [deliverProofImageDataUrl, setDeliverProofImageDataUrl] = useState('');
  const [deliverProofImageName, setDeliverProofImageName] = useState('');
  const deliverProofFileRef = useRef<HTMLInputElement>(null);
  const [deliverRiderName, setDeliverRiderName] = useState('');
  const [deliverRiderPlate, setDeliverRiderPlate] = useState('');
  const [deliverRiderPhotoDataUrl, setDeliverRiderPhotoDataUrl] = useState('');
  const [deliverRiderPhotoName, setDeliverRiderPhotoName] = useState('');
  const deliverRiderPhotoFileRef = useRef<HTMLInputElement>(null);
  const [allocateTarget, setAllocateTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [allocateNote, setAllocateNote] = useState('');
  const [allocateQtys, setAllocateQtys] = useState<Record<string, string>>({});
  const [allocateSignatureDataUrl, setAllocateSignatureDataUrl] = useState('');
  const [allocateSignatureOpen, setAllocateSignatureOpen] = useState(false);
  const [allocateProofImageDataUrl, setAllocateProofImageDataUrl] = useState('');
  const [allocateProofImageName, setAllocateProofImageName] = useState('');
  const allocateProofFileRef = useRef<HTMLInputElement>(null);
  const [allocateRiderName, setAllocateRiderName] = useState('');
  const [allocateRiderPlate, setAllocateRiderPlate] = useState('');
  const [allocateRiderPhotoDataUrl, setAllocateRiderPhotoDataUrl] = useState('');
  const [allocateRiderPhotoName, setAllocateRiderPhotoName] = useState('');
  const allocateRiderPhotoFileRef = useRef<HTMLInputElement>(null);
  const [mainAllocateOpen, setMainAllocateOpen] = useState(false);

  const detailRequest = useMemo(
    () => requests.find((r) => r.id === detailRequestId) ?? null,
    [requests, detailRequestId]
  );

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
      await exportMainSubStockRequestPdf(request);
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
      await exportInternalStockDeliveryReceiptPdf(request);
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
      await exportInternalStockDeliveryReceiptPdf(request, { event });
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

  const openAllocateDialog = (request: SubWarehouseStockRequest) => {
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
    setAllocateTarget(request);
    setAllocateNote('');
    setAllocateQtys(initial);
    setAllocateSignatureDataUrl('');
    setAllocateSignatureOpen(false);
    setAllocateProofImageDataUrl('');
    setAllocateProofImageName('');
    setAllocateRiderName('');
    setAllocateRiderPlate('');
    setAllocateRiderPhotoDataUrl('');
    setAllocateRiderPhotoName('');
  };

  const closeAllocateDialog = () => {
    setAllocateTarget(null);
    setAllocateNote('');
    setAllocateQtys({});
    setAllocateSignatureDataUrl('');
    setAllocateSignatureOpen(false);
    setAllocateProofImageDataUrl('');
    setAllocateProofImageName('');
    setAllocateRiderName('');
    setAllocateRiderPlate('');
    setAllocateRiderPhotoDataUrl('');
    setAllocateRiderPhotoName('');
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

  const mainAllocateMutation = useMutation({
    mutationFn: async (payload: MainAllocateSubmitPayload) => {
      return createAndDeliverMainStockAllocation({
        fromLocationId: payload.fromLocationId,
        items: payload.items,
        signatureUrl: payload.signatureUrl,
        proofImageUrl: payload.proofImageUrl,
        riderName: payload.riderName,
        riderPlateNumber: payload.riderPlateNumber,
        riderPhotoUrl: payload.riderPhotoUrl,
        notes: payload.notes || undefined,
      });
    },
    onSuccess: async (result) => {
      await invalidateRequests();
      const requestNumber =
        typeof result?.request_number === 'string' ? result.request_number : 'Allocation';
      const drNumber =
        typeof result?.dr_number === 'string' && result.dr_number.trim()
          ? result.dr_number.trim()
          : undefined;
      toast({
        title: 'Allocated & delivered',
        description: drNumber
          ? `${requestNumber} delivered (${drNumber}). Pending receive at the sub warehouse.`
          : `${requestNumber} is now pending receive at the sub warehouse.`,
      });
      setMainAllocateOpen(false);

      if (result?.request_id) {
        const match = (await fetchInternalStockRequests()).find((r) => r.id === result.request_id);
        if (match) {
          try {
            await exportInternalStockDeliveryReceiptPdf(match);
          } catch {
            toast({
              title: 'Delivery Receipt',
              description:
                'Allocated, but the receipt could not be opened automatically. Use Print Delivery Receipt.',
              variant: 'destructive',
            });
          }
        }
      }
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
    const list = tabRequests.filter((r) => {
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
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [
    tabRequests,
    statusFilter,
    warehouseFilter,
    searchQuery,
    dateRange.end,
    dateRange.start,
  ]);

  useEffect(() => {
    setPage(0);
  }, [listTab, statusFilter, warehouseFilter, searchQuery, dateRangeFilter, pageSize]);

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

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(filtered, page, pageSize);

  useEffect(() => {
    console.log('[MainSubStockRequests] state', {
      queryStatus,
      loadingRequests,
      fetchingRequests,
      enabled: !!user?.company_id,
      user: user ? { id: user.id, email: user.email, company_id: user.company_id, role: user.role } : null,
      rawCount: requests.length,
      filteredCount: filtered.length,
      error: requestsError
        ? {
            message: (requestsError as Error).message,
            name: (requestsError as Error).name,
            ...(requestsError as object),
          }
        : null,
      filters: { statusFilter, warehouseFilter, searchQuery, dateRangeFilter },
      rawRequests: requests,
      filteredRequests: filtered,
    });
  }, [
    queryStatus,
    loadingRequests,
    fetchingRequests,
    user,
    requests,
    filtered,
    requestsError,
    statusFilter,
    warehouseFilter,
    searchQuery,
    dateRangeFilter,
  ]);

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
    onSuccess: async () => {
      await invalidateRequests();
      toast({
        title: 'Approved',
        description: `${approveTarget?.requestNumber} is approved. Deliver when ready to ship.`,
      });
      closeApproveDialog();
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
      if (!deliverTarget || !deliverSignatureDataUrl) {
        throw new Error('Signature required');
      }
      if (!deliverProofImageDataUrl) {
        throw new Error('Delivery proof required');
      }
      if (!deliverRiderName.trim()) {
        throw new Error('Rider name required');
      }
      if (!deliverRiderPlate.trim()) {
        throw new Error('Rider plate number required');
      }
      if (!deliverRiderPhotoDataUrl) {
        throw new Error('Rider photo required');
      }
      return deliverInternalStockRequest({
        requestId: deliverTarget.id,
        signatureUrl: deliverSignatureDataUrl,
        proofImageUrl: deliverProofImageDataUrl,
        riderName: deliverRiderName.trim(),
        riderPlateNumber: deliverRiderPlate.trim(),
        riderPhotoUrl: deliverRiderPhotoDataUrl,
      });
    },
    onSuccess: async (result) => {
      const delivered = deliverTarget;
      const drNumber =
        typeof result?.dr_number === 'string' && result.dr_number.trim()
          ? result.dr_number.trim()
          : undefined;
      await invalidateRequests();
      toast({
        title: 'Delivered',
        description: drNumber
          ? `${delivered?.requestNumber} delivered (${drNumber}). Pending receive at ${delivered?.fromLocationName}.`
          : `${delivered?.requestNumber} is now pending receive at ${delivered?.fromLocationName}.`,
      });
      closeDeliverDialog();
      setDetailRequestId(null);
      if (delivered) {
        const receiptRequest: SubWarehouseStockRequest = {
          ...delivered,
          status: 'pending_receive',
          drNumber: drNumber || delivered.drNumber,
          riderName: deliverRiderName.trim() || delivered.riderName,
          riderPlateNumber: deliverRiderPlate.trim() || delivered.riderPlateNumber,
          riderPhotoUrl: deliverRiderPhotoDataUrl || delivered.riderPhotoUrl,
          items: delivered.items.map((item) => ({
            ...item,
            deliveredQuantity: item.requestedQuantity,
            receivedQuantity: 0,
            openReceiveQuantity: item.requestedQuantity,
          })),
        };
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
      }
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
    onSuccess: async () => {
      await invalidateRequests();
      toast({
        title: 'Request rejected',
        description: `${rejectTarget?.requestNumber} was rejected.`,
      });
      closeRejectDialog();
      setDetailRequestId(null);
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
      proofImageUrl: string;
      signatureUrl: string;
      riderName: string;
      riderPlateNumber: string;
      riderPhotoUrl: string;
    }) => {
      const result = await allocateInternalStockRequestRemaining({
        requestId: payload.requestId,
        lines: payload.lines,
        note: payload.note,
        proofImageUrl: payload.proofImageUrl,
        signatureUrl: payload.signatureUrl,
        riderName: payload.riderName,
        riderPlateNumber: payload.riderPlateNumber,
        riderPhotoUrl: payload.riderPhotoUrl,
      });
      return { ...result, meta: payload };
    },
    onSuccess: async ({ allocated, meta, dr_number }) => {
      await invalidateRequests();
      const totalAllocated = allocated ?? meta.lines.reduce((s, l) => s + l.quantity, 0);
      const drNumber =
        typeof dr_number === 'string' && dr_number.trim() ? dr_number.trim() : undefined;
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
      closeAllocateDialog();
      setDetailRequestId(meta.requestId);

      try {
        const match = (await fetchInternalStockRequests()).find((r) => r.id === meta.requestId);
        if (match) {
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
        }
      } catch {
        toast({
          title: 'Delivery Receipt',
          description:
            'Allocated, but the receipt could not be opened automatically. Use Print DR on the timeline.',
          variant: 'destructive',
        });
      }
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
    if (request.status !== 'approved') return;
    setDeliverSignatureDataUrl('');
    setDeliverSignatureOpen(false);
    setDeliverProofImageDataUrl('');
    setDeliverProofImageName('');
    setDeliverRiderName('');
    setDeliverRiderPlate('');
    setDeliverRiderPhotoDataUrl('');
    setDeliverRiderPhotoName('');
    setDeliverTarget(request);
  };

  const closeDeliverDialog = () => {
    setDeliverTarget(null);
    setDeliverSignatureDataUrl('');
    setDeliverSignatureOpen(false);
    setDeliverProofImageDataUrl('');
    setDeliverProofImageName('');
    setDeliverRiderName('');
    setDeliverRiderPlate('');
    setDeliverRiderPhotoDataUrl('');
    setDeliverRiderPhotoName('');
  };

  const handleConfirmDeliver = () => {
    if (!deliverTarget) return;
    if (!deliverRiderName.trim()) {
      toast({
        title: 'Rider name required',
        description: 'Enter the rider name before confirming this delivery.',
        variant: 'destructive',
      });
      return;
    }
    if (!deliverRiderPlate.trim()) {
      toast({
        title: 'Plate number required',
        description: 'Enter the rider plate number before confirming this delivery.',
        variant: 'destructive',
      });
      return;
    }
    if (!deliverRiderPhotoDataUrl) {
      toast({
        title: 'Rider photo required',
        description: 'Upload a rider photo before confirming this delivery.',
        variant: 'destructive',
      });
      return;
    }
    if (!deliverProofImageDataUrl) {
      toast({
        title: 'Delivery proof required',
        description: 'Upload a delivery proof photo before confirming this delivery.',
        variant: 'destructive',
      });
      return;
    }
    if (!deliverSignatureDataUrl) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm this delivery.',
        variant: 'destructive',
      });
      return;
    }
    deliverMutation.mutate();
  };

  const handleDeliverProofFileChange = async (file: File | null) => {
    if (!file) return;
    const validationError = proofFileValidationError(file);
    if (validationError) {
      toast({ title: 'Invalid image', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDeliverProofImageDataUrl(dataUrl);
      setDeliverProofImageName(file.name);
    } catch {
      toast({
        title: 'Could not read image',
        description: 'Try another photo.',
        variant: 'destructive',
      });
    }
  };

  const handleDeliverRiderPhotoFileChange = async (file: File | null) => {
    if (!file) return;
    const validationError = proofFileValidationError(file);
    if (validationError) {
      toast({ title: 'Invalid image', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDeliverRiderPhotoDataUrl(dataUrl);
      setDeliverRiderPhotoName(file.name);
    } catch {
      toast({
        title: 'Could not read image',
        description: 'Try another photo.',
        variant: 'destructive',
      });
    }
  };

  const handleAllocateProofFileChange = async (file: File | null) => {
    if (!file) return;
    const validationError = proofFileValidationError(file);
    if (validationError) {
      toast({ title: 'Invalid image', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAllocateProofImageDataUrl(dataUrl);
      setAllocateProofImageName(file.name);
    } catch {
      toast({
        title: 'Could not read image',
        description: 'Try another photo.',
        variant: 'destructive',
      });
    }
  };

  const handleAllocateRiderPhotoFileChange = async (file: File | null) => {
    if (!file) return;
    const validationError = proofFileValidationError(file);
    if (validationError) {
      toast({ title: 'Invalid image', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAllocateRiderPhotoDataUrl(dataUrl);
      setAllocateRiderPhotoName(file.name);
    } catch {
      toast({
        title: 'Could not read image',
        description: 'Try another photo.',
        variant: 'destructive',
      });
    }
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

    if (!allocateRiderName.trim()) {
      toast({
        title: 'Rider name required',
        description: 'Enter the rider name before allocating remaining stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!allocateRiderPlate.trim()) {
      toast({
        title: 'Plate number required',
        description: 'Enter the rider plate number before allocating remaining stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!allocateRiderPhotoDataUrl) {
      toast({
        title: 'Rider photo required',
        description: 'Upload a rider photo before allocating remaining stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!allocateProofImageDataUrl) {
      toast({
        title: 'Proof photo required',
        description: 'Upload a proof photo before allocating remaining stock.',
        variant: 'destructive',
      });
      return;
    }

    if (!allocateSignatureDataUrl) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm this allocation.',
        variant: 'destructive',
      });
      return;
    }

    const shortBefore = getRequestDeliveryTotals(allocateTarget.items).short;

    allocateMutation.mutate({
      requestId: allocateTarget.id,
      requestNumber: allocateTarget.requestNumber,
      lines: payload,
      note: allocateNote.trim() || undefined,
      shortBefore,
      proofImageUrl: allocateProofImageDataUrl,
      signatureUrl: allocateSignatureDataUrl,
      riderName: allocateRiderName.trim(),
      riderPlateNumber: allocateRiderPlate.trim(),
      riderPhotoUrl: allocateRiderPhotoDataUrl,
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
          <h1 className="text-3xl font-bold tracking-tight">Sub Stock Requests</h1>
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
            Allocate to Sub Warehouse
          </Button>
          <PageManualDialog
            title="Sub Stock Requests Manual"
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
          {loadingRequests ? (
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
                        />
                      </div>
                    </div>

                    <MainItemChips request={req} />

                    {req.status === 'partially_received' && totals.short > 0 ? (
                      <p className="text-xs text-amber-800">
                        {requestHasAllocatableQty(req) ? (
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
                    <TableHead>Request</TableHead>
                    <TableHead>Sub-warehouse</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Status</TableHead>
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
                          <StatusBadge status={req.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <MainRequestActionsMenu
                              request={req}
                              onView={(r) => setDetailRequestId(r.id)}
                              onApprove={openApproveDialog}
                              onDeliver={openDeliverDialog}
                              onReject={openRejectDialog}
                              onAllocate={openAllocateDialog}
                              onExportPdf={(r) => void handleExportPdf(r)}
                              onPrintDeliveryReceipt={(r) => void handlePrintDeliveryReceipt(r)}
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
                  <p className="text-sm text-amber-800 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    Short {getRequestDeliveryTotals(detailRequest.items).short} units on{' '}
                    <span className="font-medium tabular-nums">{detailRequest.requestNumber}</span>.
                    {requestHasAllocatableQty(detailRequest)
                      ? ' Allocate a receive wave now; the sub can confirm only what you unlock.'
                      : requestHasOpenReceive(detailRequest.items)
                        ? ' Unlocked qty is waiting for the sub to confirm this wave.'
                        : ' Allocate a receive wave when stock is available; the sub waits until then.'}{' '}
                    Status stays partially received until the short is fully confirmed.
                  </p>
                ) : null}

                {detailRequest.notes ? (
                  <div className="flex gap-2.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
                    <MessageSquareText className="h-4 w-4 shrink-0 mt-0.5 text-sky-700" />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
                        Request notes
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="allocate-rider-name">Rider name (required)</Label>
                  <Input
                    id="allocate-rider-name"
                    value={allocateRiderName}
                    onChange={(e) => setAllocateRiderName(e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allocate-rider-plate">Plate number (required)</Label>
                  <Input
                    id="allocate-rider-plate"
                    value={allocateRiderPlate}
                    onChange={(e) => setAllocateRiderPlate(e.target.value)}
                    placeholder="e.g. ABC-1234"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rider photo (required)</Label>
                <input
                  ref={allocateRiderPhotoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) =>
                    void handleAllocateRiderPhotoFileChange(e.target.files?.[0] ?? null)
                  }
                />
                {!allocateRiderPhotoDataUrl ? (
                  <button
                    type="button"
                    onClick={() => allocateRiderPhotoFileRef.current?.click()}
                    className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload rider photo</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WEBP, or GIF · max 5MB
                    </p>
                  </button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {allocateRiderPhotoName || 'Rider photo'}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAllocateRiderPhotoDataUrl('');
                          setAllocateRiderPhotoName('');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <img
                      src={allocateRiderPhotoDataUrl}
                      alt="Rider"
                      className="max-h-48 mx-auto rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => allocateRiderPhotoFileRef.current?.click()}
                    >
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Proof photo (required)</Label>
                <input
                  ref={allocateProofFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleAllocateProofFileChange(e.target.files?.[0] ?? null)}
                />
                {!allocateProofImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => allocateProofFileRef.current?.click()}
                    className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload allocate proof</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WEBP, or GIF · max 5MB
                    </p>
                  </button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {allocateProofImageName || 'Proof image'}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAllocateProofImageDataUrl('');
                          setAllocateProofImageName('');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <img
                      src={allocateProofImageDataUrl}
                      alt="Allocate proof"
                      className="max-h-48 mx-auto rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => allocateProofFileRef.current?.click()}
                    >
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Signature (required)</Label>
                {!allocateSignatureDataUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setAllocateSignatureOpen(true)}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Add signature
                  </Button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <img
                      src={allocateSignatureDataUrl}
                      alt="Allocator signature"
                      className="max-h-28 mx-auto bg-white rounded-md"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAllocateSignatureDataUrl('')}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAllocateSignatureOpen(true)}
                      >
                        Re-sign
                      </Button>
                    </div>
                  </div>
                )}
              </div>
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
                !allocateRiderName.trim() ||
                !allocateRiderPlate.trim() ||
                !allocateRiderPhotoDataUrl ||
                !allocateProofImageDataUrl ||
                !allocateSignatureDataUrl ||
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

      <Dialog open={allocateSignatureOpen} onOpenChange={setAllocateSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to allocate remaining</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Allocator signature"
            description="Draw your signature to confirm this allocation wave"
            onSave={(dataUrl) => {
              setAllocateSignatureDataUrl(dataUrl);
              setAllocateSignatureOpen(false);
            }}
            onCancel={() => setAllocateSignatureOpen(false)}
          />
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
            <DialogTitle>Deliver request — {deliverTarget?.requestNumber}</DialogTitle>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="deliver-rider-name">Rider name (required)</Label>
                  <Input
                    id="deliver-rider-name"
                    value={deliverRiderName}
                    onChange={(e) => setDeliverRiderName(e.target.value)}
                    placeholder="e.g. Juan Dela Cruz"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliver-rider-plate">Plate number (required)</Label>
                  <Input
                    id="deliver-rider-plate"
                    value={deliverRiderPlate}
                    onChange={(e) => setDeliverRiderPlate(e.target.value)}
                    placeholder="e.g. ABC-1234"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rider photo (required)</Label>
                <input
                  ref={deliverRiderPhotoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) =>
                    void handleDeliverRiderPhotoFileChange(e.target.files?.[0] ?? null)
                  }
                />
                {!deliverRiderPhotoDataUrl ? (
                  <button
                    type="button"
                    onClick={() => deliverRiderPhotoFileRef.current?.click()}
                    className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload rider photo</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WEBP, or GIF · max 5MB
                    </p>
                  </button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {deliverRiderPhotoName || 'Rider photo'}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeliverRiderPhotoDataUrl('');
                          setDeliverRiderPhotoName('');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <img
                      src={deliverRiderPhotoDataUrl}
                      alt="Rider"
                      className="max-h-48 mx-auto rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => deliverRiderPhotoFileRef.current?.click()}
                    >
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Delivery proof (required)</Label>
                <input
                  ref={deliverProofFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleDeliverProofFileChange(e.target.files?.[0] ?? null)}
                />
                {!deliverProofImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => deliverProofFileRef.current?.click()}
                    className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload delivery / cargo proof</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WEBP, or GIF · max 5MB
                    </p>
                  </button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {deliverProofImageName || 'Delivery proof'}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeliverProofImageDataUrl('');
                          setDeliverProofImageName('');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <img
                      src={deliverProofImageDataUrl}
                      alt="Delivery proof"
                      className="max-h-48 mx-auto rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => deliverProofFileRef.current?.click()}
                    >
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Signature (required)</Label>
                {!deliverSignatureDataUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setDeliverSignatureOpen(true)}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Add signature
                  </Button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <img
                      src={deliverSignatureDataUrl}
                      alt="Delivery signature"
                      className="max-h-28 mx-auto bg-white rounded-md"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDeliverSignatureDataUrl('')}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDeliverSignatureOpen(true)}
                      >
                        Re-sign
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      By signing, you deliver these quantities to the sub-warehouse.
                    </p>
                  </div>
                )}
              </div>
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
                !deliverRiderName.trim() ||
                !deliverRiderPlate.trim() ||
                !deliverRiderPhotoDataUrl ||
                !deliverProofImageDataUrl ||
                !deliverSignatureDataUrl ||
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

      <Dialog open={deliverSignatureOpen} onOpenChange={setDeliverSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to deliver</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Delivery signature"
            description="Draw your signature to confirm this delivery"
            onSave={(dataUrl) => {
              setDeliverSignatureDataUrl(dataUrl);
              setDeliverSignatureOpen(false);
            }}
            onCancel={() => setDeliverSignatureOpen(false)}
          />
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
        submitting={mainAllocateMutation.isPending}
        onSubmit={async (payload) => {
          await mainAllocateMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
