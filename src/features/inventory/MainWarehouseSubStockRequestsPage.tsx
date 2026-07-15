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
  fetchInternalStockRequests,
  rejectInternalStockRequest,
} from './internalStockRequestsApi';
import { countRequestsByStatus } from './internalStockRequestsMappers';
import {
  canExportMainRequestPdf,
  exportMainSubStockRequestPdf,
} from './utils/exportMainSubStockRequestPdf';
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
            {request.status !== 'pending_approval' && request.status !== 'rejected'
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
  onReject,
  onAllocate,
  onExportPdf,
}: {
  request: SubWarehouseStockRequest;
  onView: (request: SubWarehouseStockRequest) => void;
  onApprove: (request: SubWarehouseStockRequest) => void;
  onReject: (request: SubWarehouseStockRequest) => void;
  onAllocate: (request: SubWarehouseStockRequest) => void;
  onExportPdf: (request: SubWarehouseStockRequest) => void;
}) {
  const canApprove = request.status === 'pending_approval';
  const canAllocate =
    request.status === 'partially_received' && requestHasAllocatableQty(request);
  const canExport = canExportMainRequestPdf(request);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
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
        {canApprove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onApprove(request)}>
              <Send className="mr-2 h-4 w-4" />
              Approve & release
            </DropdownMenuItem>
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
  const [approveSignatureDataUrl, setApproveSignatureDataUrl] = useState('');
  const [approveSignatureOpen, setApproveSignatureOpen] = useState(false);
  const [approveProofImageDataUrl, setApproveProofImageDataUrl] = useState('');
  const [approveProofImageName, setApproveProofImageName] = useState('');
  const approveProofFileRef = useRef<HTMLInputElement>(null);
  const [allocateTarget, setAllocateTarget] = useState<SubWarehouseStockRequest | null>(null);
  const [allocateNote, setAllocateNote] = useState('');
  const [allocateQtys, setAllocateQtys] = useState<Record<string, string>>({});
  const [allocateSignatureDataUrl, setAllocateSignatureDataUrl] = useState('');
  const [allocateSignatureOpen, setAllocateSignatureOpen] = useState(false);
  const [allocateProofImageDataUrl, setAllocateProofImageDataUrl] = useState('');
  const [allocateProofImageName, setAllocateProofImageName] = useState('');
  const allocateProofFileRef = useRef<HTMLInputElement>(null);

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
  };

  const closeAllocateDialog = () => {
    setAllocateTarget(null);
    setAllocateNote('');
    setAllocateQtys({});
    setAllocateSignatureDataUrl('');
    setAllocateSignatureOpen(false);
    setAllocateProofImageDataUrl('');
    setAllocateProofImageName('');
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
      if (warehouseFilter !== 'all' && r.fromLocationId !== warehouseFilter) return false;
      if (!isDateInRange(r.createdAt, dateRange.start, dateRange.end)) return false;
      if (q) {
        const haystack = [
          r.requestNumber,
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
    requests,
    statusFilter,
    warehouseFilter,
    searchQuery,
    dateRange.end,
    dateRange.start,
  ]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, warehouseFilter, searchQuery, dateRangeFilter, pageSize]);

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
      total: requests.length,
      pendingApproval: countRequestsByStatus(requests, 'pending_approval'),
      pendingReceive: countRequestsByStatus(requests, 'pending_receive'),
      partial: countRequestsByStatus(requests, 'partially_received'),
    }),
    [requests]
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!approveTarget || !approveSignatureDataUrl) {
        throw new Error('Signature required');
      }
      if (!approveProofImageDataUrl) {
        throw new Error('Proof image required');
      }
      return approveInternalStockRequest({
        requestId: approveTarget.id,
        signatureUrl: approveSignatureDataUrl,
        proofImageUrl: approveProofImageDataUrl,
      });
    },
    onSuccess: async () => {
      await invalidateRequests();
      toast({
        title: 'Approved & released',
        description: `${approveTarget?.requestNumber} is now pending receive at ${approveTarget?.fromLocationName}.`,
      });
      closeApproveDialog();
      setDetailRequestId(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not approve',
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
    }) => {
      const result = await allocateInternalStockRequestRemaining({
        requestId: payload.requestId,
        lines: payload.lines,
        note: payload.note,
        proofImageUrl: payload.proofImageUrl,
        signatureUrl: payload.signatureUrl,
      });
      return { ...result, meta: payload };
    },
    onSuccess: async ({ allocated, meta }) => {
      await invalidateRequests();
      const totalAllocated = allocated ?? meta.lines.reduce((s, l) => s + l.quantity, 0);
      toast({
        title: 'Remaining allocated',
        description:
          totalAllocated < meta.shortBefore
            ? `${meta.requestNumber}: allocated ${totalAllocated} of short ${meta.shortBefore}. Status stays partially received until fully received.`
            : `${meta.requestNumber}: allocated ${totalAllocated} (full short). Sub can confirm receive; status becomes fully received when confirmed.`,
      });
      closeAllocateDialog();
      setDetailRequestId(meta.requestId);
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
    setApproveSignatureDataUrl('');
    setApproveSignatureOpen(false);
    setApproveProofImageDataUrl('');
    setApproveProofImageName('');
    setApproveTarget(request);
  };

  const closeApproveDialog = () => {
    setApproveTarget(null);
    setApproveSignatureDataUrl('');
    setApproveSignatureOpen(false);
    setApproveProofImageDataUrl('');
    setApproveProofImageName('');
  };

  const handleConfirmApprove = () => {
    if (!approveTarget) return;
    if (!approveProofImageDataUrl) {
      toast({
        title: 'Proof photo required',
        description: 'Upload a proof photo before confirming this approval.',
        variant: 'destructive',
      });
      return;
    }
    if (!approveSignatureDataUrl) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm this approval and release.',
        variant: 'destructive',
      });
      return;
    }
    approveMutation.mutate();
  };

  const handleApproveProofFileChange = async (file: File | null) => {
    if (!file) return;
    const validationError = proofFileValidationError(file);
    if (validationError) {
      toast({ title: 'Invalid image', description: validationError, variant: 'destructive' });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setApproveProofImageDataUrl(dataUrl);
      setApproveProofImageName(file.name);
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
    });
  };

  const openRejectDialog = (request: SubWarehouseStockRequest) => {
    if (request.status !== 'pending_approval') return;
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
            Review stock requests from sub-warehouses. Approve & release, or monitor receive status
            and shortages.
          </p>
          {requestsError ? (
            <p className="text-sm text-destructive mt-2">
              {(requestsError as Error).message || 'Failed to load requests from the server.'}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pending approval</p>
            <p className="text-2xl font-semibold tabular-nums">{stats.pendingApproval}</p>
          </CardContent>
        </Card>
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

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Incoming requests
              </CardTitle>
              <p className="text-sm text-muted-foreground font-normal mt-1">
                Incoming requests from sub-warehouses.
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
          {loadingRequests ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading requests…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {requests.length === 0
                ? 'No stock requests from sub-warehouses yet.'
                : 'No requests match this filter.'}
            </p>
          ) : viewMode === 'cards' ? (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pagedItems.map((req) => {
                const totals = getRequestDeliveryTotals(req.items);
                return (
                  <li key={req.id} className="rounded-md border p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium tabular-nums">{req.requestNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.fromLocationName}
                          {req.requestedByName ? ` · ${req.requestedByName}` : ''}
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
                          onReject={openRejectDialog}
                          onAllocate={openAllocateDialog}
                          onExportPdf={(r) => void handleExportPdf(r)}
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
                          {req.requestNumber}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{req.fromLocationName}</p>
                            {req.requestedByName ? (
                              <p className="text-xs text-muted-foreground">{req.requestedByName}</p>
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
                              onReject={openRejectDialog}
                              onAllocate={openAllocateDialog}
                              onExportPdf={(r) => void handleExportPdf(r)}
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

      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequestId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailRequest ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detailRequest.requestNumber}
                  <StatusBadge status={detailRequest.status} />
                </DialogTitle>
                <p className="text-sm text-muted-foreground font-normal pt-1">
                  {detailRequest.fromLocationName}
                  {detailRequest.requestedByName ? ` · ${detailRequest.requestedByName}` : ''}
                  {' · '}
                  {formatRequestDate(detailRequest.createdAt)}
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
                      Approve & release
                    </Button>
                  </>
                ) : null}
                {/* {detailRequest.status === 'partially_received' &&
                requestHasAllocatableQty(detailRequest) ? (
                  <Button
                    type="button"
                    onClick={() => openAllocateDialog(detailRequest)}
                  >
                    Allocate remaining
                  </Button>
                ) : null} */}
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
                          Max now {item.allocatable}
                          {item.allocatable < item.short
                            ? ` (${item.short - item.allocatable} already unlocked)`
                            : ''}
                        </p>
                      </div>
                      <p className="text-sm tabular-nums text-right font-medium">{item.short}</p>
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm request — {approveTarget?.requestNumber}</DialogTitle>
          </DialogHeader>
          {approveTarget ? (
            <div className="space-y-4 py-1">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Sub-warehouse:{' '}
                  <span className="text-foreground font-medium">{approveTarget.fromLocationName}</span>
                </p>
                {approveTarget.requestedByName ? (
                  <p>
                    Requested by:{' '}
                    <span className="text-foreground font-medium">{approveTarget.requestedByName}</span>
                  </p>
                ) : null}
                {approveTarget.notes ? <p>Notes: {approveTarget.notes}</p> : null}
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
                      {approveTarget.items.map((item) => (
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
                  Total requested: {requestedTotal(approveTarget).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Proof photo (required)</Label>
                <input
                  ref={approveProofFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleApproveProofFileChange(e.target.files?.[0] ?? null)}
                />
                {!approveProofImageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => approveProofFileRef.current?.click()}
                    className="w-full rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/40 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">Upload approval proof</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG, WEBP, or GIF · max 5MB
                    </p>
                  </button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {approveProofImageName || 'Proof image'}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setApproveProofImageDataUrl('');
                          setApproveProofImageName('');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                    <img
                      src={approveProofImageDataUrl}
                      alt="Approval proof"
                      className="max-h-48 mx-auto rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => approveProofFileRef.current?.click()}
                    >
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Signature (required)</Label>
                {!approveSignatureDataUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setApproveSignatureOpen(true)}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Add signature
                  </Button>
                ) : (
                  <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                    <img
                      src={approveSignatureDataUrl}
                      alt="Approver signature"
                      className="max-h-28 mx-auto bg-white rounded-md"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setApproveSignatureDataUrl('')}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setApproveSignatureOpen(true)}
                      >
                        Re-sign
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      By signing, you approve and release these quantities to the sub-warehouse.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeApproveDialog}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmApprove}
              disabled={
                !approveProofImageDataUrl ||
                !approveSignatureDataUrl ||
                approveMutation.isPending
              }
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Confirm request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveSignatureOpen} onOpenChange={setApproveSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to approve & release</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Approver signature"
            description="Draw your signature to confirm this approval and release"
            onSave={(dataUrl) => {
              setApproveSignatureDataUrl(dataUrl);
              setApproveSignatureOpen(false);
            }}
            onCancel={() => setApproveSignatureOpen(false)}
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
    </div>
  );
}
