import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { differenceInDays, format } from 'date-fns';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Package,
  Plus,
  Scale,
  Search,
} from 'lucide-react';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  applyWarehouseStockAdjustment,
  clearWarehouseStockAdjustmentBatchLots,
  clearWarehouseStockAdjustmentVariants,
  fetchWarehouseStockAdjustmentBatchLots,
  fetchWarehouseStockAdjustmentBrands,
  fetchWarehouseStockAdjustmentLocations,
  fetchWarehouseStockAdjustmentVariants,
  fetchWarehouseStockAdjustments,
  type BatchLotOption,
  type WarehouseStockAdjustmentRow,
} from '@/store/slices/warehouse/stock-adjustments';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_DIRECTION,
  DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_KEY,
  sortWarehouseStockAdjustments,
  type WarehouseStockAdjustmentSortKey,
} from './utils/warehouseStockAdjustmentSorting';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import StockAdjustmentManual from '@/features/inventory/warehouse-manual/components/StockAdjustmentManual';
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

const NEW_BATCH_VALUE = '__new__';
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

type AdjustmentRow = WarehouseStockAdjustmentRow;

const REASON_PRESETS = [
  'Cycle count correction',
  // 'Found stock',
  'Damaged',
  'Obsolete',
  // 'Data entry error',
  'Supplier discrepancy',
  'Other',
];

const SOURCE_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  stock_request_receive: 'Stock request',
  adjustment_in: 'Adjustment',
};

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

function formatBatchLotLabel(lot: Pick<BatchLotOption, 'batch_number' | 'expiration_date' | 'quantity_remaining'>): string {
  const exp = lot.expiration_date ? ` · exp ${formatLotDate(lot.expiration_date)}` : '';
  return `${lot.batch_number}${exp} · ${lot.quantity_remaining} remaining`;
}

function formatBatchLotHeading(lot: Pick<BatchLotOption, 'batch_number' | 'expiration_date'>): string {
  const exp = lot.expiration_date ? ` · exp ${formatLotDate(lot.expiration_date)}` : '';
  return `${lot.batch_number}${exp}`;
}

export default function WarehouseStockAdjustmentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;

  const {
    adjustments,
    locations,
    brands,
    variants,
    batchLots,
    variantsBrandId,
    batchLotsKey,
    status: adjustmentsStatus,
    batchLotsStatus,
    error: adjustmentsError,
  } = useAppSelector((state) => state.warehouseStockAdjustments);

  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] =
    useState<TableSortCycleState<WarehouseStockAdjustmentSortKey>>(createInitialTableSortCycle);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const [locationId, setLocationId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [lotId, setLotId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [quantity, setQuantity] = useState('');
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonCustom, setReasonCustom] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isLoading =
    adjustmentsStatus === 'loading' ||
    (adjustmentsStatus === 'idle' && !!user?.company_id && isWarehouse && isMainWarehouseUser);
  const batchesLoading = batchLotsStatus === 'loading';
  const error = adjustmentsError ? new Error(adjustmentsError) : null;

  useEffect(() => {
    if (!user?.company_id || !isWarehouse || !isMainWarehouseUser) return;
    void dispatch(fetchWarehouseStockAdjustments());
    void dispatch(fetchWarehouseStockAdjustmentLocations());
  }, [dispatch, user?.company_id, isWarehouse, isMainWarehouseUser]);

  useEffect(() => {
    if (!user?.company_id || !isWarehouse || !isMainWarehouseUser || !adjustOpen) return;
    void dispatch(fetchWarehouseStockAdjustmentBrands());
  }, [dispatch, user?.company_id, isWarehouse, isMainWarehouseUser, adjustOpen]);

  useEffect(() => {
    if (!brandId || !adjustOpen) {
      dispatch(clearWarehouseStockAdjustmentVariants());
      return;
    }
    void dispatch(fetchWarehouseStockAdjustmentVariants(brandId));
  }, [dispatch, brandId, adjustOpen]);

  useEffect(() => {
    if (!locationId || !variantId || !adjustOpen) {
      dispatch(clearWarehouseStockAdjustmentBatchLots());
      return;
    }
    void dispatch(
      fetchWarehouseStockAdjustmentBatchLots({ locationId, variantId })
    );
  }, [dispatch, locationId, variantId, adjustOpen]);

  // Drop stale catalog rows when brand / lot key changes mid-flight.
  const visibleVariants =
    variantsBrandId === brandId ? variants : [];
  const visibleBatchLots =
    batchLotsKey === `${locationId}:${variantId}` ? batchLots : [];

  const selectedLot = useMemo(
    () =>
      lotId && lotId !== NEW_BATCH_VALUE
        ? visibleBatchLots.find((l) => l.lot_id === lotId)
        : null,
    [visibleBatchLots, lotId]
  );

  const selectableLots = useMemo(() => visibleBatchLots, [visibleBatchLots]);

  const hasBatchSelection =
    !!lotId &&
    (lotId === NEW_BATCH_VALUE || visibleBatchLots.some((l) => l.lot_id === lotId));

  const canRemoveFromSelectedBatch =
    hasBatchSelection &&
    lotId !== NEW_BATCH_VALUE &&
    !!selectedLot &&
    selectedLot.quantity_remaining > 0;

  const handleBatchChange = (value: string) => {
    setLotId(value);
    setQuantity('');
    if (value === NEW_BATCH_VALUE) {
      setDirection('in');
    }
  };

  useEffect(() => {
    if (lotId === NEW_BATCH_VALUE && direction === 'out') {
      setDirection('in');
    }
    if (
      selectedLot &&
      lotId !== NEW_BATCH_VALUE &&
      direction === 'out' &&
      selectedLot.quantity_remaining <= 0
    ) {
      setDirection('in');
    }
  }, [lotId, direction, selectedLot]);

  const maxQuantity = useMemo(() => {
    if (direction === 'out' && selectedLot) return selectedLot.quantity_remaining;
    return undefined;
  }, [direction, selectedLot]);

  const adjustmentDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of adjustments) {
      const brand = row.variant?.brand;
      if (brand?.id) map.set(brand.id, brand.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [adjustments]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const { start, end } = adjustmentDateRange;

    return adjustments.filter((a) => {
      if (!isDateInRange(new Date(a.created_at), start, end)) return false;
      if (directionFilter !== 'all' && a.direction !== directionFilter) return false;
      if (brandFilter !== 'all' && a.variant?.brand?.id !== brandFilter) return false;
      if (!q) return true;
      const brand = a.variant?.brand?.name?.toLowerCase() ?? '';
      const variant = a.variant?.name?.toLowerCase() ?? '';
      return (
        a.reason.toLowerCase().includes(q) ||
        brand.includes(q) ||
        variant.includes(q) ||
        (a.batch?.batch_number?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    adjustments,
    searchQuery,
    brandFilter,
    directionFilter,
    adjustmentDateRange.end,
    adjustmentDateRange.start,
  ]);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        sortState,
        DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_KEY,
        DEFAULT_WAREHOUSE_STOCK_ADJUSTMENT_SORT_DIRECTION
      ),
    [sortState]
  );

  const sortedAdjustments = useMemo(
    () => sortWarehouseStockAdjustments(filtered, resolvedSortKey, resolvedSortDirection),
    [filtered, resolvedSortKey, resolvedSortDirection]
  );

  const totalPages = Math.max(1, Math.ceil(sortedAdjustments.length / pageSize));

  const paginatedAdjustments = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAdjustments.slice(start, start + pageSize);
  }, [sortedAdjustments, page, pageSize]);

  const handleSort = (key: WarehouseStockAdjustmentSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, brandFilter, directionFilter, dateRangeFilter, pageSize, sortState]);

  useEffect(() => {
    if (brandFilter !== 'all' && !brandOptions.some((b) => b.id === brandFilter)) {
      setBrandFilter('all');
    }
  }, [brandFilter, brandOptions]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginationStart = sortedAdjustments.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const paginationEnd = Math.min(page * pageSize, sortedAdjustments.length);

  const resetForm = () => {
    const mainLoc = locations.find((l) => l.is_main);
    setLocationId(mainLoc?.id ?? '');
    setBrandId('');
    setVariantId('');
    setLotId('');
    setDirection('out');
    setQuantity('');
    setReasonPreset('');
    setReasonCustom('');
    setNotes('');
  };

  const openAdjustDialog = () => {
    resetForm();
    setAdjustOpen(true);
  };

  const handleDirectionChange = (next: 'in' | 'out') => {
    setDirection(next);
    setQuantity('');
    setLotId((current) => {
      if (!current) return '';
      if (next === 'out') {
        if (current === NEW_BATCH_VALUE) return '';
        const lot = visibleBatchLots.find((l) => l.lot_id === current);
        if (!lot || lot.quantity_remaining <= 0) return '';
      }
      return current;
    });
  };

  const resolvedReason =
    reasonPreset === 'Other' ? reasonCustom.trim() : reasonPreset.trim() || reasonCustom.trim();

  const handleSubmit = async () => {
    const qty = Math.max(0, parseInt(quantity, 10) || 0);
    if (!locationId || !variantId) {
      toast({
        title: 'Missing fields',
        description: 'Select location, brand, and variant.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasBatchSelection) {
      toast({
        title: 'Select a batch',
        description: 'Choose which batch to adjust, or create a new ADJ batch.',
        variant: 'destructive',
      });
      return;
    }

    if (qty <= 0) {
      toast({
        title: 'Enter quantity',
        description: 'Quantity must be greater than zero.',
        variant: 'destructive',
      });
      return;
    }

    if (direction === 'out') {
      if (lotId === NEW_BATCH_VALUE) {
        toast({
          title: 'Cannot remove from new batch',
          description: 'Select an existing batch to remove stock, or switch to Add stock (+).',
          variant: 'destructive',
        });
        return;
      }
      if (!canRemoveFromSelectedBatch) {
        toast({
          title: 'Cannot remove from this batch',
          description: 'This batch has no remaining stock to remove.',
          variant: 'destructive',
        });
        return;
      }
      if (selectedLot && qty > selectedLot.quantity_remaining) {
        toast({
          title: 'Quantity too high',
          description: `This batch only has ${selectedLot.quantity_remaining} unit(s) remaining.`,
          variant: 'destructive',
        });
        return;
      }
    }

    if (resolvedReason.length < 3) {
      toast({
        title: 'Reason required',
        description: 'Provide a reason (at least 3 characters).',
        variant: 'destructive',
      });
      return;
    }

    const delta = direction === 'in' ? qty : -qty;
    const rpcLotId =
      direction === 'in' && (lotId === NEW_BATCH_VALUE || !lotId) ? null : lotId || null;

    setSubmitting(true);
    try {
      const result = await dispatch(
        applyWarehouseStockAdjustment({
          warehouse_location_id: locationId,
          variant_id: variantId,
          quantity_delta: delta,
          reason: resolvedReason,
          notes: notes.trim() || null,
          lot_id: rpcLotId,
        })
      ).unwrap();
      toast({
        title: direction === 'in' ? 'Stock added' : 'Stock removed',
        description:
          result.batch_number
            ? `${result.quantity} unit(s) · ${result.batch_number}${
                result.remaining_after != null ? ` · ${result.remaining_after} left in batch` : ''
              }`
            : `${result.quantity} unit(s) adjusted`,
      });
      setAdjustOpen(false);
      resetForm();
      await dispatch(fetchWarehouseStockAdjustments());
      if (locationId && variantId) {
        await dispatch(fetchWarehouseStockAdjustmentBatchLots({ locationId, variantId }));
      }
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
      await queryClient.invalidateQueries({ queryKey: ['batch-lot-adjustments'] });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-batch-aging'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Adjustment failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
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
            <CardTitle className="flex items-center gap-2 text-lg">
              <Scale className="h-5 w-5" />
              Stock Adjustments
            </CardTitle>
            <CardDescription>
              Stock adjustments are managed by the main warehouse.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-7 w-7" />
            Stock Adjustments
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Select a batch lot, see its remaining quantity, then apply an audited correction.
            For supplier inbound, use <strong>Stock Requests → Receive</strong>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <PageManualDialog
            title="Stock Adjustment Manual"
            fullManualHref="/warehouse-manual#stock-adjustment"
          >
            <StockAdjustmentManual embedded />
          </PageManualDialog>
          <Button onClick={openAdjustDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New adjustment
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search variant, brand, reason, batch…"
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
            {brandOptions.length > 0 && (
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brandOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="in">Stock in (+)</SelectItem>
                <SelectItem value="out">Stock out (−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-4 w-4" />
              <span>{error instanceof Error ? error.message : 'Failed to load adjustments'}</span>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {adjustments.length === 0
                ? 'No adjustments yet.'
                : 'No adjustments match the selected date range, brand, direction, or search.'}
            </p>
          ) : (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      label="Date"
                      sortKey="createdAt"
                      sortDirection={getTableSortDisplayDirection(sortState, 'createdAt')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Location"
                      sortKey="locationName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'locationName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Product"
                      sortKey="productName"
                      sortDirection={getTableSortDisplayDirection(sortState, 'productName')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Direction"
                      sortKey="direction"
                      sortDirection={getTableSortDisplayDirection(sortState, 'direction')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Qty"
                      sortKey="quantity"
                      sortDirection={getTableSortDisplayDirection(sortState, 'quantity')}
                      onSort={handleSort}
                      className="text-right"
                    />
                    <SortableTableHead
                      label="Reason"
                      sortKey="reason"
                      sortDirection={getTableSortDisplayDirection(sortState, 'reason')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="Batch"
                      sortKey="batchNumber"
                      sortDirection={getTableSortDisplayDirection(sortState, 'batchNumber')}
                      onSort={handleSort}
                    />
                    <SortableTableHead
                      label="By"
                      sortKey="performedBy"
                      sortDirection={getTableSortDisplayDirection(sortState, 'performedBy')}
                      onSort={handleSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAdjustments.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(row.created_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>{row.warehouse_location?.name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{row.variant?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.variant?.brand?.name ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.direction === 'in' ? 'default' : 'destructive'}>
                          {row.direction === 'in' ? (
                            <Plus className="h-3 w-3 mr-1" />
                          ) : (
                            <Minus className="h-3 w-3 mr-1" />
                          )}
                          {row.direction === 'in' ? 'In' : 'Out'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.quantity}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="line-clamp-2 text-sm">{row.reason}</span>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {row.batch?.batch_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.performed_by_user?.full_name ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {paginationStart}–{paginationEnd} of {sortedAdjustments.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="adjustments-page-size" className="text-xs whitespace-nowrap">
                      Rows per page
                    </Label>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => setPageSize(Number(v))}
                    >
                      <SelectTrigger id="adjustments-page-size" className="h-8 w-[72px]">
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

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New stock adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Location</Label>
              <Select
                value={locationId || undefined}
                onValueChange={(v) => {
                  setLocationId(v);
                  setLotId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.is_main ? ' (Main)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Brand</Label>
              <Select
                value={brandId || undefined}
                onValueChange={(v) => {
                  setBrandId(v);
                  setVariantId('');
                  setLotId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Variant</Label>
              <Select
                value={variantId || undefined}
                onValueChange={(v) => {
                  setVariantId(v);
                  setLotId('');
                }}
                disabled={!brandId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={brandId ? 'Select variant' : 'Select brand first'} />
                </SelectTrigger>
                <SelectContent>
                  {visibleVariants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.variant_type} — {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {variantId && locationId && (
              <div className="grid gap-2">
                <Label>Batch</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Select the batch first, then choose add or remove and enter quantity.
                </p>
                {batchesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading batches…
                  </div>
                ) : (
                  <Select value={lotId || undefined} onValueChange={handleBatchChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select batch to adjust" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_BATCH_VALUE}>Create new ADJ batch</SelectItem>
                      {selectableLots.map((lot) => (
                        <SelectItem key={lot.lot_id} value={lot.lot_id}>
                          {formatBatchLotLabel(lot)}
                        </SelectItem>
                      ))}
                      {selectableLots.length === 0 && (
                        <SelectItem value="__none__" disabled>
                          No existing batches — use Create new ADJ batch
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {selectedLot && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Package className="h-4 w-4" />
                  {formatBatchLotHeading(selectedLot)}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                  {selectedLot.expiration_date && (
                    <>
                      <span>Expiration</span>
                      <span className="text-foreground">{formatLotDate(selectedLot.expiration_date)}</span>
                    </>
                  )}
                  <span>Remaining</span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {selectedLot.quantity_remaining}
                  </span>
                  <span>Originally received</span>
                  <span className="text-foreground tabular-nums">{selectedLot.quantity_received}</span>
                  <span>Received</span>
                  <span className="text-foreground">
                    {format(new Date(selectedLot.received_at), 'MMM d, yyyy')}
                  </span>
                  <span>Days in warehouse</span>
                  <span className="text-foreground tabular-nums">
                    {differenceInDays(new Date(), new Date(selectedLot.received_at))}
                  </span>
                  <span>Source</span>
                  <span className="text-foreground">
                    {SOURCE_LABELS[selectedLot.source_type] ?? selectedLot.source_type}
                  </span>
                </div>
              </div>
            )}

            {lotId === NEW_BATCH_VALUE && (
              <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">
                A new <code className="text-xs">ADJ-YYYY-MM-#####</code> batch will be created for
                this adjustment. Only <strong>Add stock (+)</strong> is available.
              </p>
            )}

            {hasBatchSelection && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Direction</Label>
                  <Select
                    value={direction}
                    onValueChange={(v) => handleDirectionChange(v as 'in' | 'out')}
                    disabled={lotId === NEW_BATCH_VALUE}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Add stock (+)</SelectItem>
                      <SelectItem value="out" disabled={!canRemoveFromSelectedBatch}>
                        Remove stock (−)
                        {!canRemoveFromSelectedBatch && lotId !== NEW_BATCH_VALUE
                          ? ' — no remaining qty'
                          : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={maxQuantity != null ? `Max ${maxQuantity}` : undefined}
                    disabled={!hasBatchSelection}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>Reason</Label>
              <Select value={reasonPreset || undefined} onValueChange={setReasonPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASON_PRESETS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reasonPreset === 'Other' && (
                <Input
                  placeholder="Describe the reason"
                  value={reasonCustom}
                  onChange={(e) => setReasonCustom(e.target.value)}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional context for the audit log"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply adjustment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
