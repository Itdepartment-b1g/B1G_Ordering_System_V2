import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_DIRECTION,
  DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_KEY,
  sortWarehouseStockRequests,
  type WarehouseStockRequestSortKey,
} from './utils/warehouseStockRequestSorting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type RequestStatus =
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

type StockRequestRow = {
  id: string;
  request_number: string;
  status: RequestStatus;
  expected_delivery_date: string | null;
  notes: string | null;
  created_at: string;
  brand: { id: string; name: string } | null;
  created_by_user: { full_name: string } | null;
  items: Array<{
    id: string;
    variant_id: string;
    ordered_quantity: number;
    received_quantity: number;
    variant: {
      id: string;
      name: string;
      variant_type: string;
      brand: { id: string; name: string } | null;
    } | null;
  }>;
  receives: Array<{
    id: string;
    received_at: string;
    notes: string | null;
    batch: { batch_number: string } | null;
    received_by_user: { full_name: string } | null;
  }>;
};

type BrandOption = { id: string; name: string };

type CreateRequestLineItem = {
  id: string;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  variantType: string;
  quantity: number;
};

type CatalogVariant = {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
  brand: { id: string; name: string } | { id: string; name: string }[] | null;
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending_receive: 'Pending receive',
  partially_received: 'Partially received',
  fully_received: 'Fully received',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<
  RequestStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending_receive: 'secondary',
  partially_received: 'default',
  fully_received: 'outline',
  cancelled: 'destructive',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getRequestBrandLabel(req: StockRequestRow): string {
  if (req.brand?.name) return req.brand.name;
  const names = [
    ...new Set(
      req.items
        .map((i) => i.variant?.brand?.name)
        .filter((n): n is string => !!n)
    ),
  ];
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return `${names.length} brands`;
}

function mapRequestRow(raw: Record<string, unknown>): StockRequestRow {
  const brand = firstRelation(raw.brand as StockRequestRow['brand'] | StockRequestRow['brand'][]);
  const createdBy = firstRelation(
    raw.created_by_user as StockRequestRow['created_by_user'] | StockRequestRow['created_by_user'][]
  );

  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: row.id as string,
      variant_id: row.variant_id as string,
      ordered_quantity: row.ordered_quantity as number,
      received_quantity: row.received_quantity as number,
      variant: (() => {
        const v = firstRelation(
          row.variant as StockRequestRow['items'][0]['variant'] | StockRequestRow['items'][0]['variant'][]
        );
        if (!v) return null;
        const brand = firstRelation(v.brand as { id: string; name: string } | { id: string; name: string }[]);
        return { ...v, brand };
      })(),
    };
  });

  const receives = ((raw.receives as unknown[]) ?? []).map((recv) => {
    const row = recv as Record<string, unknown>;
    return {
      id: row.id as string,
      received_at: row.received_at as string,
      notes: row.notes as string | null,
      batch: firstRelation(row.batch as StockRequestRow['receives'][0]['batch']),
      received_by_user: firstRelation(
        row.received_by_user as StockRequestRow['receives'][0]['received_by_user']
      ),
    };
  });

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as RequestStatus,
    expected_delivery_date: raw.expected_delivery_date as string | null,
    notes: raw.notes as string | null,
    created_at: raw.created_at as string,
    brand,
    created_by_user: createdBy,
    items,
    receives,
  };
}

export default function WarehouseStockRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<WarehouseStockRequestSortKey>>(createInitialTableSortCycle);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StockRequestRow | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<StockRequestRow | null>(null);

  const [createLines, setCreateLines] = useState<CreateRequestLineItem[]>([]);
  const [createNotes, setCreateNotes] = useState('');
  const [createExpectedDate, setCreateExpectedDate] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [selectedBrandForAdd, setSelectedBrandForAdd] = useState('');

  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  const { data: brands = [] } = useQuery({
    queryKey: ['warehouse-stock-request-brands', user?.company_id],
    enabled: !!user?.company_id && isWarehouse && isMainWarehouseUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('company_id', user!.company_id!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as BrandOption[];
    },
  });

  const { data: catalogVariants = [], isLoading: catalogLoading } = useQuery({
    queryKey: ['warehouse-stock-request-catalog', user?.company_id],
    enabled: !!user?.company_id && isWarehouse && isMainWarehouseUser && createOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variants')
        .select('id, name, variant_type, brand_id, brand:brands ( id, name )')
        .eq('company_id', user!.company_id!)
        .eq('is_active', true)
        .order('variant_type')
        .order('name');
      if (error) throw error;
      return (data ?? []) as CatalogVariant[];
    },
  });

  const {
    data: requests = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['warehouse-stock-requests', user?.company_id],
    enabled: !!user?.company_id && isWarehouse,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('warehouse_stock_requests')
        .select(
          `
          id,
          request_number,
          status,
          expected_delivery_date,
          notes,
          created_at,
          brand:brands ( id, name ),
          created_by_user:profiles!warehouse_stock_requests_created_by_fkey ( full_name ),
          items:warehouse_stock_request_items (
            id,
            variant_id,
            ordered_quantity,
            received_quantity,
            variant:variants ( id, name, variant_type, brand:brands ( id, name ) )
          ),
          receives:warehouse_stock_request_receives (
            id,
            received_at,
            notes,
            batch:inventory_batches ( batch_number ),
            received_by_user:profiles!warehouse_stock_request_receives_received_by_fkey ( full_name )
          )
        `
        )
        .eq('company_id', user!.company_id!)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      return (data ?? []).map((row) => mapRequestRow(row as Record<string, unknown>));
    },
  });

  const requestDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const { start, end } = requestDateRange;

    const isRequestInDateRange = (request: StockRequestRow) => {
      if (!start && !end) return true;
      if (isDateInRange(new Date(request.created_at), start, end)) return true;
      return request.receives.some((recv) =>
        isDateInRange(new Date(recv.received_at), start, end)
      );
    };

    return requests.filter((r) => {
      if (!isRequestInDateRange(r)) return false;
      if (statusFilter === 'open') {
        if (!['pending_receive', 'partially_received'].includes(r.status)) return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const brandName = getRequestBrandLabel(r).toLowerCase();
      const itemBrands = r.items
        .map((i) => i.variant?.brand?.name?.toLowerCase() ?? '')
        .join(' ');
      return (
        r.request_number.toLowerCase().includes(q) ||
        brandName.includes(q) ||
        itemBrands.includes(q) ||
        (r.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [requests, searchQuery, statusFilter, requestDateRange.end, requestDateRange.start]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_KEY,
        DEFAULT_WAREHOUSE_STOCK_REQUEST_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedRequests = useMemo(
    () => sortWarehouseStockRequests(filteredRequests, resolvedSortKey, resolvedSortDirection),
    [filteredRequests, resolvedSortKey, resolvedSortDirection]
  );

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / pageSize));

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRequests.slice(start, start + pageSize);
  }, [sortedRequests, page, pageSize]);

  const handleSort = (key: WarehouseStockRequestSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, dateRangeFilter, pageSize, sortState]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart =
    sortedRequests.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, sortedRequests.length);

  const getLastReceivedAt = (request: StockRequestRow) => {
    if (request.receives.length === 0) return null;
    return request.receives.reduce((latest, recv) => {
      const t = new Date(recv.received_at).getTime();
      return t > latest ? t : latest;
    }, 0);
  };

  const openReceiveDialog = (request: StockRequestRow) => {
    setSelectedRequest(request);
    const initial: Record<string, number> = {};
    for (const item of request.items) {
      const remaining = item.ordered_quantity - item.received_quantity;
      if (remaining > 0) initial[item.variant_id] = remaining;
    }
    setReceiveQuantities(initial);
    setReceiveNotes('');
    setReceiveOpen(true);
  };

  const openDetailDialog = (request: StockRequestRow) => {
    setSelectedRequest(request);
    setDetailOpen(true);
  };

  const resetCreateForm = () => {
    setCreateLines([]);
    setCreateNotes('');
    setCreateExpectedDate('');
    setSelectedBrandForAdd('');
    setAddBrandOpen(false);
  };

  const handleAddBrandVariants = () => {
    if (!selectedBrandForAdd) return;

    const variantsForBrand = catalogVariants.filter((v) => v.brand_id === selectedBrandForAdd);
    if (variantsForBrand.length === 0) {
      toast({ title: 'No items', description: 'No variants found for this brand.', variant: 'destructive' });
      return;
    }

    const existingVariantIds = new Set(createLines.map((l) => l.variantId));
    const brandName = brands.find((b) => b.id === selectedBrandForAdd)?.name ?? 'Brand';

    const toAdd = variantsForBrand
      .filter((v) => !existingVariantIds.has(v.id))
      .map((v) => ({
        id: crypto.randomUUID(),
        brandId: v.brand_id,
        brandName,
        variantId: v.id,
        variantName: v.name,
        variantType: v.variant_type,
        quantity: 0,
      }));

    if (toAdd.length === 0) {
      toast({
        title: 'Already added',
        description: 'All variants for this brand are already on the request.',
        variant: 'destructive',
      });
      return;
    }

    setCreateLines((prev) => [...prev, ...toAdd]);
    setAddBrandOpen(false);
    setSelectedBrandForAdd('');
    toast({
      title: 'Added',
      description: `Added ${brandName} variants. Enter quantities for lines to include.`,
    });
  };

  const handleCreate = async () => {
    const items = createLines
      .map((line) => ({
        variant_id: line.variantId,
        quantity: Math.max(0, Math.floor(line.quantity)),
      }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      toast({
        title: 'Enter quantities',
        description: 'Add items and set at least one quantity greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    const brandIds = new Set(
      createLines.filter((l) => l.quantity > 0).map((l) => l.brandId)
    );
    const headerBrandId = brandIds.size === 1 ? [...brandIds][0] : null;

    setCreateSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_warehouse_stock_request', {
        p_brand_id: headerBrandId,
        p_items: items,
        p_notes: createNotes.trim() || null,
        p_expected_delivery_date: createExpectedDate || null,
        p_created_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) {
        throw new Error(result?.error ?? 'Failed to create stock request');
      }
      toast({
        title: 'Stock request created',
        description: result.request_number ?? 'Request saved.',
      });
      setCreateOpen(false);
      resetCreateForm();
      await queryClient.invalidateQueries({ queryKey: ['warehouse-stock-requests'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create stock request';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleReceive = async () => {
    if (!selectedRequest) return;

    const items = selectedRequest.items
      .map((item) => {
        const remaining = item.ordered_quantity - item.received_quantity;
        const qty = Math.min(
          remaining,
          Math.max(0, Math.floor(receiveQuantities[item.variant_id] ?? 0))
        );
        return { variant_id: item.variant_id, quantity: qty };
      })
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      toast({
        title: 'Nothing to receive',
        description: 'Enter at least one quantity to receive.',
        variant: 'destructive',
      });
      return;
    }

    setReceiveSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('receive_warehouse_stock_request', {
        p_request_id: selectedRequest.id,
        p_items: items,
        p_notes: receiveNotes.trim() || null,
        p_received_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as {
        success?: boolean;
        error?: string;
        batch_number?: string;
        fully_received?: boolean;
        total_received?: number;
      };
      if (!result?.success) {
        throw new Error(result?.error ?? 'Failed to receive stock');
      }
      toast({
        title: result.fully_received ? 'Fully received' : 'Partially received',
        description: `Batch ${result.batch_number ?? ''} — ${result.total_received ?? 0} unit(s) added to main inventory.`,
      });
      setReceiveOpen(false);
      setSelectedRequest(null);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-stock-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-inventory-catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-batch-aging'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to receive stock';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      const { data, error } = await supabase.rpc('cancel_warehouse_stock_request', {
        p_request_id: cancelTarget.id,
        p_reason: 'Cancelled by user',
        p_cancelled_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error ?? 'Failed to cancel request');
      }
      toast({ title: 'Request cancelled' });
      setCancelTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['warehouse-stock-requests'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel request';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  if (!isWarehouse) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Warehouse access only.</p>
      </div>
    );
  }

  if (!isMainWarehouseUser) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Stock Requests
            </CardTitle>
            <CardDescription>
              Inbound stock requests and receiving are managed by the main warehouse.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-7 w-7" />
            Stock Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            Create inbound requests with one or more brands. Receiving in one delivery puts all
            variants into the same batch.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New request
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search request # or brand…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
              align="end"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Open only</SelectItem>
                <SelectItem value="pending_receive">Pending receive</SelectItem>
                <SelectItem value="partially_received">Partially received</SelectItem>
                <SelectItem value="fully_received">Fully received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error instanceof Error ? error.message : 'Failed to load requests'}</span>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {requests.length === 0
                ? 'No stock requests yet. Create one to order inbound stock by brand.'
                : 'No stock requests match the selected date range, status, or search.'}
            </p>
          ) : (
            <div>
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
                      label="Brand"
                      sortKey="brandName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'brandName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Status"
                      sortKey="status"
                      sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Progress"
                      sortKey="progress"
                      sortDirection={getTableSortDisplayDirection(sortState, 'progress')}
                      onSort={handleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Created"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Last received"
                      sortKey="lastReceivedAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'lastReceivedAt')}
                      onSort={handleSort}
                    />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.map((req) => {
                    const ordered = req.items.reduce((s, i) => s + i.ordered_quantity, 0);
                    const received = req.items.reduce((s, i) => s + i.received_quantity, 0);
                    const canReceive = ['pending_receive', 'partially_received'].includes(req.status);
                    const canCancel = req.status === 'pending_receive' && received === 0;
                    const lastReceivedAt = getLastReceivedAt(req);

                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.request_number}</TableCell>
                        <TableCell>{getRequestBrandLabel(req)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[req.status]}>
                            {STATUS_LABELS[req.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {received} / {ordered}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(req.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {lastReceivedAt
                            ? format(new Date(lastReceivedAt), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            <Button variant="ghost" size="sm" onClick={() => openDetailDialog(req)}>
                              View
                            </Button>
                            {canReceive && (
                              <Button variant="outline" size="sm" onClick={() => openReceiveDialog(req)}>
                                <Truck className="h-3.5 w-3.5 mr-1" />
                                Receive
                              </Button>
                            )}
                            {canCancel && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setCancelTarget(req)}
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {paginationStart}–{paginationEnd} of {sortedRequests.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="requests-page-size" className="text-xs whitespace-nowrap">
                      Rows per page
                    </Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => setPageSize(Number(v))}
                    >
                      <SelectTrigger id="requests-page-size" className="h-8 w-[72px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="min-w-[100px] text-center tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              New stock request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add variants from one or more brands. When you receive in one delivery, all items share
              the same <code className="text-xs">BATCH-YYYY-MM-#####</code>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Expected delivery (optional)</Label>
                <Input
                  type="date"
                  value={createExpectedDate}
                  onChange={(e) => setCreateExpectedDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                rows={2}
                placeholder="Supplier reference, shipment details…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Request items</Label>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setAddBrandOpen(true)}
                  disabled={catalogLoading}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add from brand
                </Button>
              </div>
              {catalogLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading catalog…
                </div>
              ) : createLines.length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                  No items yet. Click <strong>Add from brand</strong> to add variants (set qty &gt; 0 to
                  include on submit).
                </p>
              ) : (
                <div className="border rounded-lg overflow-auto max-h-[320px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right w-28">Qty</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {createLines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{line.brandName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{line.variantType}</TableCell>
                          <TableCell className="text-sm font-medium">{line.variantName}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              className="w-24 ml-auto"
                              value={line.quantity || ''}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value, 10) || 0;
                                setCreateLines((prev) =>
                                  prev.map((row) =>
                                    row.id === line.id ? { ...row, quantity: qty } : row
                                  )
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() =>
                                setCreateLines((prev) => prev.filter((row) => row.id !== line.id))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={createSubmitting || createLines.length === 0}
            >
              {createSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addBrandOpen} onOpenChange={setAddBrandOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add from brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select brand</Label>
              <Select value={selectedBrandForAdd || undefined} onValueChange={setSelectedBrandForAdd}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a brand…" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Adds all active variants under this brand with quantity 0. Enter quantities on the
                lines you want to request.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBrandOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBrandVariants} disabled={!selectedBrandForAdd}>
              Add brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Receive stock — {selectedRequest?.request_number}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                One receive creates one batch ({'BATCH-YYYY-MM-#####'}) for all lines in this
                delivery.
              </p>
              <div className="space-y-2 border rounded-lg p-3">
                {selectedRequest.items
                  .filter((i) => i.received_quantity < i.ordered_quantity)
                  .map((item) => {
                    const remaining = item.ordered_quantity - item.received_quantity;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.variant?.brand?.name ? `${item.variant.brand.name} · ` : ''}
                            {item.variant?.name ?? item.variant_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Remaining: {remaining} of {item.ordered_quantity}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          className="w-24"
                          value={receiveQuantities[item.variant_id] ?? ''}
                          onChange={(e) =>
                            setReceiveQuantities((prev) => ({
                              ...prev,
                              [item.variant_id]: Math.min(
                                remaining,
                                parseInt(e.target.value, 10) || 0
                              ),
                            }))
                          }
                        />
                      </div>
                    );
                  })}
              </div>
              <div className="grid gap-2">
                <Label>Receive notes (optional)</Label>
                <Textarea
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleReceive()} disabled={receiveSubmitting}>
              {receiveSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Confirm receive'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRequest?.request_number}</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant={STATUS_VARIANT[selectedRequest.status]}>
                  {STATUS_LABELS[selectedRequest.status]}
                </Badge>
                <span className="text-muted-foreground">{getRequestBrandLabel(selectedRequest)}</span>
              </div>
              {selectedRequest.notes && (
                <p>
                  <span className="font-medium">Notes:</span> {selectedRequest.notes}
                </p>
              )}
              <div>
                <p className="font-medium mb-2">Line items</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRequest.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.variant?.brand?.name ?? '—'}</TableCell>
                        <TableCell>{item.variant?.name ?? '—'}</TableCell>
                        <TableCell className="text-right">{item.ordered_quantity}</TableCell>
                        <TableCell className="text-right">{item.received_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {selectedRequest.receives.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Receive history</p>
                  <ul className="space-y-2">
                    {selectedRequest.receives
                      .sort(
                        (a, b) =>
                          new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
                      )
                      .map((recv) => (
                        <li
                          key={recv.id}
                          className="flex items-center gap-2 border rounded-md px-3 py-2"
                        >
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">
                              {recv.batch?.batch_number ?? 'Batch'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(recv.received_at), 'MMM d, yyyy h:mm a')}
                              {recv.received_by_user?.full_name
                                ? ` · ${recv.received_by_user.full_name}`
                                : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel stock request?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel {cancelTarget?.request_number}? This is only allowed before any stock has been
              received.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCancel()}>Cancel request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
