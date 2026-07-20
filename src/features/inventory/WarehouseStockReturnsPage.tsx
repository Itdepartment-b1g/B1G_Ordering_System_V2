import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Search,
  Truck,
  Undo2,
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
import { SubWarehouseReturnStockDialog } from './components/SubWarehouseReturnStockDialog';
import { WarehouseStockReturnInspectDialog } from './components/WarehouseStockReturnInspectDialog';
import {
  buildInspectPayload,
  createInspectSplit,
  getInspectValidationError,
  type InspectRequestItem,
} from './warehouseStockReturnInspectShared';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import StockReturnsManual from '@/features/inventory/warehouse-manual/components/StockReturnsManual';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_DIRECTION,
  DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_KEY,
  sortWarehouseStockReturns,
  type WarehouseStockReturnSortKey,
} from './utils/warehouseStockReturnSorting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type ReturnStatus =
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

type InspectLotOption = {
  lot_id: string;
  variant_id: string;
  batch_number: string;
  expiration_date: string | null;
  quantity_remaining: number;
};

function formatSubLotLabel(batchNumber: string | null, expirationDate: string | null): string {
  const batch = batchNumber ?? '—';
  const exp = expirationDate ? ` · exp ${formatLotDate(expirationDate)}` : '';
  return `${batch}${exp}`;
}

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'MMM d, yyyy');
}

function formatInspectLotLabel(lot: InspectLotOption): string {
  const exp = lot.expiration_date ? ` · exp ${formatLotDate(lot.expiration_date)}` : '';
  return `${lot.batch_number}${exp} · ${lot.quantity_remaining} at main`;
}

type StockReturnRow = {
  id: string;
  request_number: string;
  status: ReturnStatus;
  notes: string | null;
  created_at: string;
  from_location_id: string;
  from_location: { id: string; name: string } | null;
  created_by_user: { full_name: string } | null;
  items: Array<{
    id: string;
    variant_id: string;
    lot_id: string | null;
    return_quantity: number;
    inspected_quantity: number;
    variant: {
      id: string;
      name: string;
      variant_type: string;
      brand: { id: string; name: string } | null;
    } | null;
    lot: {
      id: string;
      expiration_date: string | null;
      batch: { batch_number: string } | null;
    } | null;
  }>;
  receipts: Array<{
    id: string;
    received_at: string;
    notes: string | null;
    received_by_user: { full_name: string } | null;
    lines: Array<{
      qty_good: number;
      qty_damaged: number;
      variant: { name: string; brand: { name: string } | null } | null;
    }>;
  }>;
};

const STATUS_LABELS: Record<ReturnStatus, string> = {
  pending_receive: 'Pending inspect',
  partially_received: 'Partially inspected',
  fully_received: 'Fully inspected',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<
  ReturnStatus,
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

function mapReturnRow(raw: Record<string, unknown>): StockReturnRow {
  const fromLocation = firstRelation(
    raw.from_location as StockReturnRow['from_location'] | StockReturnRow['from_location'][]
  );
  const createdBy = firstRelation(
    raw.created_by_user as StockReturnRow['created_by_user'] | StockReturnRow['created_by_user'][]
  );

  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    const variant = firstRelation(
      row.variant as StockReturnRow['items'][0]['variant'] | StockReturnRow['items'][0]['variant'][]
    );
    const brand = variant?.brand
      ? firstRelation(variant.brand as { name: string } | { name: string }[])
      : null;
    const lot = firstRelation(
      row.lot as StockReturnRow['items'][0]['lot'] | StockReturnRow['items'][0]['lot'][]
    );
    const batch = lot?.batch
      ? firstRelation(lot.batch as { batch_number: string } | { batch_number: string }[])
      : null;
    return {
      id: row.id as string,
      variant_id: row.variant_id as string,
      lot_id: (row.lot_id as string | null) ?? null,
      return_quantity: row.return_quantity as number,
      inspected_quantity: row.inspected_quantity as number,
      variant: variant
        ? {
            ...variant,
            brand: brand ? { id: '', name: brand.name } : null,
          }
        : null,
      lot: lot
        ? {
            id: lot.id as string,
            expiration_date: (lot.expiration_date as string | null | undefined) ?? null,
            batch: batch ? { batch_number: batch.batch_number } : null,
          }
        : null,
    };
  });

  const receipts = ((raw.receipts as unknown[]) ?? []).map((receipt) => {
    const r = receipt as Record<string, unknown>;
    const receivedBy = firstRelation(
      r.received_by_user as StockReturnRow['receipts'][0]['received_by_user'] |
        StockReturnRow['receipts'][0]['received_by_user'][]
    );
    const lines = ((r.lines as unknown[]) ?? []).map((line) => {
      const l = line as Record<string, unknown>;
      const variant = firstRelation(
        l.variant as StockReturnRow['receipts'][0]['lines'][0]['variant'] |
          StockReturnRow['receipts'][0]['lines'][0]['variant'][]
      );
      const brand = variant?.brand
        ? firstRelation(variant.brand as { name: string } | { name: string }[])
        : null;
      return {
        qty_good: l.qty_good as number,
        qty_damaged: l.qty_damaged as number,
        variant: variant
          ? { name: variant.name, brand: brand ? { name: brand.name } : null }
          : null,
      };
    });
    return {
      id: r.id as string,
      received_at: r.received_at as string,
      notes: (r.notes as string | null) ?? null,
      received_by_user: receivedBy,
      lines,
    };
  });

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as ReturnStatus,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
    from_location_id: raw.from_location_id as string,
    from_location: fromLocation,
    created_by_user: createdBy,
    items,
    receipts,
  };
}

function getLastReceivedAt(req: StockReturnRow): string | null {
  if (req.receipts.length === 0) return null;
  return req.receipts.reduce((latest, r) =>
    r.received_at > latest ? r.received_at : latest
  , req.receipts[0].received_at);
}

export default function WarehouseStockReturnsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership, isLoading: membershipLoading } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });
  const isMainWarehouseUser = membership.isMain;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<WarehouseStockReturnSortKey>>(createInitialTableSortCycle);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StockReturnRow | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<StockReturnRow | null>(null);
  const [inspectItems, setInspectItems] = useState<InspectRequestItem[]>([]);
  const [inspectNotes, setInspectNotes] = useState('');
  const [inspectSubmitting, setInspectSubmitting] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const inspectVariantIds = useMemo(
    () => [...new Set(inspectItems.map((item) => item.variant_id))],
    [inspectItems]
  );

  const { data: mainWarehouseLocationId } = useQuery({
    queryKey: ['main-warehouse-location-id', user?.company_id],
    enabled: inspectOpen && !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id')
        .eq('company_id', user!.company_id!)
        .eq('is_main', true)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const { data: inspectMainLots = [], isLoading: loadingInspectLots } = useQuery({
    queryKey: ['warehouse-inspect-main-batch-lots', mainWarehouseLocationId, inspectVariantIds],
    enabled: inspectOpen && !!mainWarehouseLocationId && inspectVariantIds.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<InspectLotOption[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          variant_id,
          quantity_remaining,
          expiration_date,
          batch:inventory_batches ( batch_number )
        `
        )
        .eq('warehouse_location_id', mainWarehouseLocationId!)
        .in('variant_id', inspectVariantIds)
        .order('received_at', { ascending: true });
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const batch = firstRelation(r.batch as { batch_number?: string } | null);
          const remaining = Number(r.quantity_remaining);
          if (!Number.isFinite(remaining)) return null;
          return {
            lot_id: r.id as string,
            variant_id: r.variant_id as string,
            batch_number: batch?.batch_number ?? '—',
            expiration_date: (r.expiration_date as string | null) ?? null,
            quantity_remaining: Math.max(0, remaining),
          } satisfies InspectLotOption;
        })
        .filter(Boolean) as InspectLotOption[];
    },
  });

  const isSubWarehouseUser = !membership.isMain && !!membership.locationId;

  const { data: subWarehouseLocations = [] } = useQuery({
    queryKey: ['warehouse-sub-location-for-return', membership.locationId],
    enabled: isSubWarehouseUser && !!membership.locationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id, name, is_main')
        .eq('id', membership.locationId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return [];
      return [{ id: data.id, name: data.name, is_main: !!data.is_main }];
    },
  });

  const {
    data: returns = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'warehouse-stock-returns',
      user?.company_id,
      membership.isMain,
      membership.locationId,
    ],
    enabled:
      !!user?.company_id &&
      isWarehouse &&
      !membershipLoading &&
      (membership.isMain || !!membership.locationId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let requestQuery = supabase
        .from('warehouse_stock_return_requests')
        .select(
          `
          id,
          request_number,
          status,
          notes,
          created_at,
          from_location_id,
          from_location:warehouse_locations!warehouse_stock_return_requests_from_location_id_fkey ( id, name ),
          created_by_user:profiles!warehouse_stock_return_requests_created_by_fkey ( full_name ),
          items:warehouse_stock_return_request_items (
            id,
            variant_id,
            lot_id,
            return_quantity,
            inspected_quantity,
            variant:variants (
              id,
              name,
              variant_type,
              brand:brands ( id, name )
            ),
            lot:inventory_batch_lots!warehouse_stock_return_request_items_lot_id_fkey (
              id,
              expiration_date,
              batch:inventory_batches ( batch_number )
            )
          ),
          receipts:warehouse_stock_return_receipts (
            id,
            received_at,
            notes,
            received_by_user:profiles!warehouse_stock_return_receipts_received_by_fkey ( full_name ),
            lines:warehouse_stock_return_receipt_lines (
              qty_good,
              qty_damaged,
              variant:variants ( name, brand:brands ( name ) )
            )
          )
        `
        )
        .eq('company_id', user!.company_id!);

      if (!membership.isMain && membership.locationId) {
        requestQuery = requestQuery.eq('from_location_id', membership.locationId);
      }

      const { data, error: fetchError } = await requestQuery.order('created_at', {
        ascending: false,
      });
      if (fetchError) throw fetchError;
      return (data ?? []).map((row) => mapReturnRow(row as Record<string, unknown>));
    },
  });

  const visibleReturns = returns;

  const returnDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const filteredReturns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const { start, end } = returnDateRange;

    const isInDateRange = (req: StockReturnRow) => {
      if (!start && !end) return true;
      if (isDateInRange(new Date(req.created_at), start, end)) return true;
      return req.receipts.some((r) => isDateInRange(new Date(r.received_at), start, end));
    };

    return visibleReturns.filter((r) => {
      if (!isInDateRange(r)) return false;
      if (statusFilter === 'open') {
        if (!['pending_receive', 'partially_received'].includes(r.status)) return false;
      } else if (statusFilter !== 'all' && r.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const loc = r.from_location?.name?.toLowerCase() ?? '';
      return r.request_number.toLowerCase().includes(q) || loc.includes(q);
    });
  }, [visibleReturns, searchQuery, statusFilter, returnDateRange]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_KEY,
        DEFAULT_WAREHOUSE_STOCK_RETURN_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedReturns = useMemo(
    () => sortWarehouseStockReturns(filteredReturns, resolvedSortKey, resolvedSortDirection),
    [filteredReturns, resolvedSortKey, resolvedSortDirection]
  );

  const totalPages = Math.max(1, Math.ceil(sortedReturns.length / pageSize));

  const paginatedReturns = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedReturns.slice(start, start + pageSize);
  }, [sortedReturns, page, pageSize]);

  const handleSort = (key: WarehouseStockReturnSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, dateRangeFilter, pageSize, sortState]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart = sortedReturns.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, sortedReturns.length);

  const openInspectDialog = (req: StockReturnRow) => {
    const items: InspectRequestItem[] = req.items
      .filter((i) => i.inspected_quantity < i.return_quantity)
      .map((i) => {
        const remaining = i.return_quantity - i.inspected_quantity;
        return {
          request_item_id: i.id,
          variant_id: i.variant_id,
          brand_name: i.variant?.brand?.name ?? 'Unknown',
          variant_name: i.variant?.name ?? i.variant_id,
          variant_type: i.variant?.variant_type ?? '',
          sub_batch_number: i.lot?.batch?.batch_number ?? null,
          sub_expiration_date: i.lot?.expiration_date ?? null,
          return_quantity: i.return_quantity,
          inspected_quantity: i.inspected_quantity,
          splits: [
            createInspectSplit({
              qty_good: remaining,
              qty_damaged: 0,
            }),
          ],
        };
      });
    setSelectedReturn(req);
    setInspectItems(items);
    setInspectNotes('');
    setInspectOpen(true);
  };

  useEffect(() => {
    if (!inspectOpen || inspectMainLots.length === 0) return;
    setInspectItems((prev) =>
      prev.map((item) => {
        const options = inspectMainLots.filter((lot) => lot.variant_id === item.variant_id);
        if (options.length !== 1) return item;
        return {
          ...item,
          splits: item.splits.map((split) =>
            split.destination_lot_id
              ? split
              : { ...split, destination_lot_id: options[0].lot_id }
          ),
        };
      })
    );
  }, [inspectOpen, inspectMainLots]);

  const validationError = useMemo(
    () => getInspectValidationError(inspectItems),
    [inspectItems]
  );

  const handleInspect = async () => {
    if (!selectedReturn || validationError) {
      toast({
        variant: 'destructive',
        title: 'Validation',
        description: validationError ?? 'Fix inspection lines before submitting.',
      });
      return;
    }

    const lines = buildInspectPayload(inspectItems);

    if (lines.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nothing to inspect',
        description: 'Enter good or damaged quantities for at least one line.',
      });
      return;
    }

    setInspectSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('receive_warehouse_stock_return_request', {
        p_request_id: selectedReturn.id,
        p_lines: lines,
        p_notes: inspectNotes.trim() || null,
        p_received_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as {
        success?: boolean;
        error?: string;
        request_number?: string;
        fully_received?: boolean;
      };
      if (!result?.success) throw new Error(result?.error ?? 'Inspection failed');

      toast({
        title: 'Return inspected',
        description: result.fully_received
          ? `${result.request_number ?? 'Return'} fully received.`
          : `${result.request_number ?? 'Return'} partially inspected.`,
      });
      setInspectOpen(false);
      setSelectedReturn(null);
      await queryClient.refetchQueries({ queryKey: ['warehouse-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-batch-aging'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to inspect return',
      });
    } finally {
      setInspectSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('cancel_warehouse_stock_return_request', {
        p_request_id: cancelTarget.id,
        p_reason: null,
        p_cancelled_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) throw new Error(result?.error ?? 'Cancel failed');

      toast({
        title: 'Return cancelled',
        description: result.request_number ?? 'Request cancelled; sub-warehouse stock restored.',
      });
      setCancelTarget(null);
      await queryClient.refetchQueries({ queryKey: ['warehouse-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-location-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to cancel return',
      });
    } finally {
      setCancelSubmitting(false);
    }
  };

  if (!isWarehouse) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Warehouse access only.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-7 w-7" />
            Stock Returns
          </h1>
          <p className="text-muted-foreground mt-1">
            {isMainWarehouseUser
              ? 'Inspect returns: sub batch is fixed from submit; assign main batch + split good vs damaged.'
              : 'You chose sub batch lots when submitting. Main warehouse assigns main batch and inspects good vs damaged.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <PageManualDialog
            title="Stock Returns Manual"
            fullManualHref="/warehouse-manual#stock-returns"
          >
            <StockReturnsManual embedded />
          </PageManualDialog>
          {isSubWarehouseUser && (
            <Button
              className="shrink-0"
              onClick={() => setReturnOpen(true)}
              disabled={membershipLoading || subWarehouseLocations.length === 0}
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Return stock
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search return # or location…"
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
                <SelectItem value="pending_receive">Pending inspect</SelectItem>
                <SelectItem value="partially_received">Partially inspected</SelectItem>
                <SelectItem value="fully_received">Fully inspected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error instanceof Error ? error.message : 'Failed to load returns'}</span>
            </div>
          )}
          {isLoading || membershipLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReturns.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {visibleReturns.length === 0
                ? isSubWarehouseUser
                  ? 'No stock return requests yet. Use Return stock above to submit variants back to main.'
                  : 'No stock return requests yet. Sub-warehouses submit returns from Sub Warehouses.'
                : 'No returns match the selected filters.'}
            </p>
          ) : (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Return"
                      sortKey="returnNumber"
                      sortDirection={getTableSortDisplayDirection(sortState, 'returnNumber')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="From"
                      sortKey="fromLocation"
                      sortDirection={getTableSortDisplayDirection(sortState, 'fromLocation')}
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
                      label="Last inspected"
                      sortKey="lastInspectedAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'lastInspectedAt')}
                      onSort={handleSort}
                    />
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedReturns.map((req) => {
                    const total = req.items.reduce((s, i) => s + i.return_quantity, 0);
                    const inspected = req.items.reduce((s, i) => s + i.inspected_quantity, 0);
                    const canInspect =
                      isMainWarehouseUser &&
                      ['pending_receive', 'partially_received'].includes(req.status);
                    const canCancel =
                      req.status === 'pending_receive' &&
                      inspected === 0 &&
                      (isMainWarehouseUser ||
                        String(req.from_location_id) === String(membership.locationId));
                    const lastReceivedAt = getLastReceivedAt(req);

                    return (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium">{req.request_number}</TableCell>
                        <TableCell>{req.from_location?.name ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[req.status]}>
                            {STATUS_LABELS[req.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inspected} / {total}
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedReturn(req);
                                setDetailOpen(true);
                              }}
                            >
                              View
                            </Button>
                            {canInspect && (
                              <Button variant="outline" size="sm" onClick={() => openInspectDialog(req)}>
                                <Truck className="h-3.5 w-3.5 mr-1" />
                                Inspect
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
                    Showing {paginationStart}–{paginationEnd} of {sortedReturns.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="returns-page-size" className="text-xs whitespace-nowrap">
                      Rows per page
                    </Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => setPageSize(Number(v))}
                    >
                      <SelectTrigger id="returns-page-size" className="h-8 w-[72px]">
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

      <WarehouseStockReturnInspectDialog
        open={inspectOpen}
        onOpenChange={setInspectOpen}
        requestNumber={selectedReturn?.request_number ?? ''}
        fromLocationName={selectedReturn?.from_location?.name ?? 'sub-warehouse'}
        items={inspectItems}
        onItemsChange={setInspectItems}
        mainLots={inspectMainLots}
        loadingLots={loadingInspectLots}
        formatSubLotLabel={formatSubLotLabel}
        formatMainLotLabel={formatInspectLotLabel}
        notes={inspectNotes}
        onNotesChange={setInspectNotes}
        validationError={validationError}
        submitting={inspectSubmitting}
        onConfirm={() => void handleInspect()}
      />

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedReturn?.request_number}</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">From</span>
                  <p className="font-medium">{selectedReturn.from_location?.name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <Badge variant={STATUS_VARIANT[selectedReturn.status]}>
                      {STATUS_LABELS[selectedReturn.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted by</span>
                  <p>{selectedReturn.created_by_user?.full_name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p>{format(new Date(selectedReturn.created_at), 'PPp')}</p>
                </div>
              </div>
              {selectedReturn.notes && (
                <div>
                  <span className="text-muted-foreground">Notes</span>
                  <p>{selectedReturn.notes}</p>
                </div>
              )}
              <div>
                <h4 className="font-medium mb-2">Lines</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Sub batch</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">Inspected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.variant?.brand?.name ? `${item.variant.brand.name} · ` : ''}
                          {item.variant?.name ?? item.variant_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatSubLotLabel(
                            item.lot?.batch?.batch_number ?? null,
                            item.lot?.expiration_date ?? null
                          )}
                        </TableCell>
                        <TableCell className="text-right">{item.return_quantity}</TableCell>
                        <TableCell className="text-right">{item.inspected_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {selectedReturn.receipts.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Inspection history</h4>
                  <div className="space-y-3">
                    {selectedReturn.receipts.map((r) => (
                      <div key={r.id} className="border rounded-lg p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(r.received_at), 'PPp')}
                          {r.received_by_user?.full_name
                            ? ` · ${r.received_by_user.full_name}`
                            : ''}
                        </p>
                        {r.lines.map((line, idx) => (
                          <p key={idx}>
                            {line.variant?.brand?.name ? `${line.variant.brand.name} · ` : ''}
                            {line.variant?.name ?? 'SKU'}:{' '}
                            <span className="text-green-700 dark:text-green-400">
                              {line.qty_good} good
                            </span>
                            {line.qty_damaged > 0 && (
                              <>
                                ,{' '}
                                <span className="text-destructive">
                                  {line.qty_damaged} damaged
                                </span>
                              </>
                            )}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel return request?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.request_number} will be cancelled and sub-warehouse stock quantities
              will be restored for uninspected lines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancel();
              }}
              disabled={cancelSubmitting}
            >
              {cancelSubmitting ? 'Cancelling…' : 'Cancel request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isSubWarehouseUser && (
        <SubWarehouseReturnStockDialog
          open={returnOpen}
          onOpenChange={setReturnOpen}
          isMainWarehouseUser={false}
          myLocationId={membership.locationId}
          locations={subWarehouseLocations}
          userId={user?.id ?? null}
        />
      )}
    </div>
  );
}
