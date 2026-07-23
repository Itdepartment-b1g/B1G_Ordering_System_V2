import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, Eye, FileText, Loader2, MoreHorizontal, RotateCcw, Search, SearchCheck, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { WarehouseStockReturnInspectDialog } from './components/WarehouseStockReturnInspectDialog';
import {
  buildInspectPayload,
  createInspectSplit,
  getInspectValidationError,
  type InspectRequestItem,
} from './warehouseStockReturnInspectShared';
import { getStandardAccountReturnEvidenceSignedUrl } from './utils/uploadStandardAccountReturnEvidence';
import { exportStandardAccountReturnPdfFromSource } from './utils/exportStandardAccountReturnPdf';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

type ClientReturnReceiptLine = {
  qty_good: number;
  qty_damaged: number;
  variant: { name: string; brand: { name: string } | null } | null;
  destination_lot: {
    expiration_date: string | null;
    batch: { batch_number: string } | null;
  } | null;
};

type ClientReturnReceipt = {
  id: string;
  received_at: string;
  notes: string | null;
  lines: ClientReturnReceiptLine[];
};

type ClientReturnRow = {
  id: string;
  request_number: string;
  status: ReturnStatus;
  notes: string | null;
  created_at: string;
  destination_location_id: string | null;
  signature_url: string | null;
  signature_path: string | null;
  proof_image_url: string | null;
  proof_image_path: string | null;
  client_company: { company_name: string } | null;
  destination_location: { id: string; name: string; is_main: boolean | null } | null;
  items: Array<{
    id: string;
    warehouse_variant_id: string;
    return_quantity: number;
    inspected_quantity: number;
    variant: {
      id: string;
      name: string;
      variant_type: string;
      brand: { name: string } | null;
    } | null;
  }>;
  receipts: ClientReturnReceipt[];
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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return format(parsed, 'MMM d, yyyy');
}

function formatInspectLotLabel(lot: InspectLotOption): string {
  const exp = lot.expiration_date ? ` · exp ${formatLotDate(lot.expiration_date)}` : '';
  return `${lot.batch_number}${exp} · ${lot.quantity_remaining} on hand`;
}

function formatReceiptLotLabel(
  batchNumber: string | null | undefined,
  expirationDate: string | null | undefined
): string {
  const batch = batchNumber?.trim() || '—';
  if (!expirationDate) return batch;
  return `${batch} · exp ${formatLotDate(expirationDate)}`;
}

function mapRow(raw: Record<string, unknown>): ClientReturnRow {
  const clientCompany = firstRelation(
    raw.client_company as ClientReturnRow['client_company'] | ClientReturnRow['client_company'][]
  );
  const destinationLocation = firstRelation(
    raw.destination_location as
      | ClientReturnRow['destination_location']
      | ClientReturnRow['destination_location'][]
  );

  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    const variant = firstRelation(
      row.warehouse_variant as
        | ClientReturnRow['items'][0]['variant']
        | ClientReturnRow['items'][0]['variant'][]
    );
    const brand = variant?.brand
      ? firstRelation(variant.brand as { name: string } | { name: string }[])
      : null;
    return {
      id: row.id as string,
      warehouse_variant_id: row.warehouse_variant_id as string,
      return_quantity: row.return_quantity as number,
      inspected_quantity: row.inspected_quantity as number,
      variant: variant
        ? {
            id: (variant.id as string) ?? (row.warehouse_variant_id as string),
            name: variant.name,
            variant_type: variant.variant_type ?? '',
            brand: brand ? { name: brand.name } : null,
          }
        : null,
    };
  });

  const receipts = ((raw.receipts as unknown[]) ?? []).map((receipt) => {
    const r = receipt as Record<string, unknown>;
    const lines = ((r.lines as unknown[]) ?? []).map((line) => {
      const l = line as Record<string, unknown>;
      const variant = firstRelation(
        l.warehouse_variant as
          | ClientReturnReceiptLine['variant']
          | ClientReturnReceiptLine['variant'][]
      );
      const brand = variant?.brand
        ? firstRelation(variant.brand as { name: string } | { name: string }[])
        : null;
      const destinationLot = firstRelation(
        l.destination_lot as
          | ClientReturnReceiptLine['destination_lot']
          | ClientReturnReceiptLine['destination_lot'][]
      );
      const batch = destinationLot?.batch
        ? firstRelation(
            destinationLot.batch as { batch_number: string } | { batch_number: string }[]
          )
        : null;
      return {
        qty_good: Number(l.qty_good) || 0,
        qty_damaged: Number(l.qty_damaged) || 0,
        variant: variant
          ? {
              name: variant.name,
              brand: brand ? { name: brand.name } : null,
            }
          : null,
        destination_lot: destinationLot
          ? {
              expiration_date: (destinationLot.expiration_date as string | null) ?? null,
              batch: batch ? { batch_number: batch.batch_number } : null,
            }
          : null,
      } satisfies ClientReturnReceiptLine;
    });

    return {
      id: r.id as string,
      received_at: r.received_at as string,
      notes: (r.notes as string | null) ?? null,
      lines,
    } satisfies ClientReturnReceipt;
  });

  receipts.sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
  );

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as ReturnStatus,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
    destination_location_id: (raw.destination_location_id as string | null) ?? null,
    signature_url: (raw.signature_url as string | null) ?? null,
    signature_path: (raw.signature_path as string | null) ?? null,
    proof_image_url: (raw.proof_image_url as string | null) ?? null,
    proof_image_path: (raw.proof_image_path as string | null) ?? null,
    client_company: clientCompany,
    destination_location: destinationLocation
      ? {
          id: destinationLocation.id,
          name: destinationLocation.name,
          is_main: destinationLocation.is_main ?? null,
        }
      : null,
    items,
    receipts,
  };
}

export default function WarehouseClientStockReturnsPage() {
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
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<ClientReturnRow | null>(null);
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null);
  const [detailSignatureUrl, setDetailSignatureUrl] = useState<string | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<ClientReturnRow | null>(null);
  const [inspectItems, setInspectItems] = useState<InspectRequestItem[]>([]);
  const [inspectNotes, setInspectNotes] = useState('');
  const [inspectSubmitting, setInspectSubmitting] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ClientReturnRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const inspectVariantIds = useMemo(
    () => [...new Set(inspectItems.map((item) => item.variant_id))],
    [inspectItems]
  );

  const inspectLocationId =
    selectedReturn?.destination_location_id ?? selectedReturn?.destination_location?.id ?? null;

  const {
    data: returns = [],
    isLoading,
    error: returnsError,
  } = useQuery({
    queryKey: [
      'sa-client-stock-returns',
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
      // Keep embeds simple — long FK hints / profiles joins were causing silent empty lists.
      let requestQuery = supabase
        .from('standard_account_stock_return_requests')
        .select(
          `
          id,
          request_number,
          status,
          notes,
          created_at,
          destination_location_id,
          signature_url,
          signature_path,
          proof_image_url,
          proof_image_path,
          client_company:companies!client_company_id (
            company_name
          ),
          destination_location:warehouse_locations!destination_location_id (
            id,
            name,
            is_main
          ),
          items:standard_account_stock_return_request_items (
            id,
            warehouse_variant_id,
            return_quantity,
            inspected_quantity,
            warehouse_variant:variants!warehouse_variant_id (
              id,
              name,
              variant_type,
              brand:brands ( name )
            )
          ),
          receipts:standard_account_stock_return_receipts (
            id,
            received_at,
            notes,
            lines:standard_account_stock_return_receipt_lines (
              qty_good,
              qty_damaged,
              warehouse_variant:variants!warehouse_variant_id (
                name,
                brand:brands ( name )
              ),
              destination_lot:inventory_batch_lots!destination_lot_id (
                expiration_date,
                batch:inventory_batches ( batch_number )
              )
            )
          )
        `
        )
        .eq('warehouse_company_id', user!.company_id!);

      if (!membership.isMain && membership.locationId) {
        requestQuery = requestQuery.eq('destination_location_id', membership.locationId);
      }

      const { data, error } = await requestQuery.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
    },
  });

  const { data: inspectLots = [], isLoading: loadingInspectLots } = useQuery({
    queryKey: ['sa-client-inspect-lots', inspectLocationId, inspectVariantIds],
    enabled: inspectOpen && !!inspectLocationId && inspectVariantIds.length > 0,
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
        .eq('warehouse_location_id', inspectLocationId!)
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
            quantity_remaining: remaining,
          };
        })
        .filter(Boolean) as InspectLotOption[];
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const { start, end } = dateRange;

    return returns.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      const inCreatedRange = isDateInRange(row.created_at, start, end);
      const inReceiptRange = row.receipts.some((r) =>
        isDateInRange(r.received_at, start, end)
      );
      if (!inCreatedRange && !inReceiptRange) return false;

      if (!q) return true;
      return (
        row.request_number.toLowerCase().includes(q) ||
        (row.client_company?.company_name ?? '').toLowerCase().includes(q) ||
        (row.destination_location?.name ?? '').toLowerCase().includes(q) ||
        row.items.some(
          (i) =>
            i.variant?.name.toLowerCase().includes(q) ||
            i.variant?.brand?.name.toLowerCase().includes(q)
        )
      );
    });
  }, [returns, searchQuery, statusFilter, dateRange]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, pageSize]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(filtered, page, pageSize);

  const openDetail = async (row: ClientReturnRow) => {
    setDetailReturn(row);
    setDetailOpen(true);
    setDetailProofUrl(row.proof_image_url);
    setDetailSignatureUrl(row.signature_url);

    const [proof, signature] = await Promise.all([
      getStandardAccountReturnEvidenceSignedUrl(row.proof_image_path),
      getStandardAccountReturnEvidenceSignedUrl(row.signature_path),
    ]);
    if (proof) setDetailProofUrl(proof);
    if (signature) setDetailSignatureUrl(signature);
  };

  const handleExportPdf = async (row: ClientReturnRow) => {
    setExportingPdfId(row.id);
    try {
      await exportStandardAccountReturnPdfFromSource(row);
      toast({
        title: 'PDF opened',
        description: `${row.request_number} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'PDF export failed',
        description: 'Could not open the return PDF.',
      });
    } finally {
      setExportingPdfId(null);
    }
  };

  const canInspectRow = (row: ClientReturnRow) => {
    if (!(row.status === 'pending_receive' || row.status === 'partially_received')) return false;
    if (isMainWarehouseUser) return true;
    return (
      !!membership.locationId &&
      row.destination_location_id === membership.locationId
    );
  };

  const openInspect = (row: ClientReturnRow) => {
    const items: InspectRequestItem[] = row.items
      .filter((i) => i.return_quantity > i.inspected_quantity)
      .map((i) => ({
        request_item_id: i.id,
        variant_id: i.warehouse_variant_id,
        brand_name: i.variant?.brand?.name ?? '—',
        variant_name: i.variant?.name ?? '—',
        variant_type: i.variant?.variant_type ?? '',
        sub_batch_number: null,
        sub_expiration_date: null,
        return_quantity: i.return_quantity,
        inspected_quantity: i.inspected_quantity,
        splits: [createInspectSplit()],
      }));

    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nothing left',
        description: 'All lines on this return have already been inspected.',
      });
      return;
    }

    setSelectedReturn(row);
    setInspectItems(items);
    setInspectNotes('');
    setInspectOpen(true);
  };

  useEffect(() => {
    if (!inspectOpen || inspectLots.length === 0) return;
    setInspectItems((prev) =>
      prev.map((item) => {
        const options = inspectLots.filter((lot) => lot.variant_id === item.variant_id);
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
  }, [inspectOpen, inspectLots]);

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
      const { data, error } = await supabase.rpc('receive_standard_account_stock_return_request', {
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
      await queryClient.refetchQueries({ queryKey: ['sa-client-stock-returns'] });
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
      const { data, error } = await supabase.rpc('cancel_standard_account_stock_return_request', {
        p_request_id: cancelTarget.id,
        p_reason: null,
        p_cancelled_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) throw new Error(result?.error ?? 'Cancel failed');

      toast({
        title: 'Return cancelled',
        description: `${result.request_number ?? 'Return'} cancelled; client stock restored.`,
      });
      setCancelTarget(null);
      await queryClient.refetchQueries({ queryKey: ['sa-client-stock-returns'] });
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
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Warehouse access only.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <RotateCcw className="h-6 w-6" />
          Client Stock Returns
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect returns from linked Standard Accounts (RT-YYYYMM-####). Good qty restocks a batch
          at the chosen location; damaged goes to disposal.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Incoming client returns</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search RT number, company, location, or product…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                <SelectItem value="pending_receive">Pending inspect</SelectItem>
                <SelectItem value="partially_received">Partially inspected</SelectItem>
                <SelectItem value="fully_received">Fully inspected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {returnsError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Could not load client returns</div>
                <div className="text-destructive/90 mt-1">
                  {returnsError instanceof Error
                    ? returnsError.message
                    : 'Unknown error loading returns'}
                </div>
              </div>
            </div>
          ) : isLoading || membershipLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No client returns yet.
              {!isMainWarehouseUser && (
                <div className="mt-1 text-xs">
                  Sub-warehouse users only see returns sent to their location.
                </div>
              )}
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((row) => {
                  const totalQty = row.items.reduce((s, i) => s + i.return_quantity, 0);
                  const inspected = row.items.reduce((s, i) => s + i.inspected_quantity, 0);
                  const destLabel = row.destination_location
                    ? `${row.destination_location.name}${
                        row.destination_location.is_main ? ' (Main)' : ' (Sub)'
                      }`
                    : '—';
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.request_number}</TableCell>
                      <TableCell>{row.client_company?.company_name ?? '—'}</TableCell>
                      <TableCell className="text-sm">{destLabel}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status]}>
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.items.length} SKU · {inspected}/{totalQty} inspected
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => void openDetail(row)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={exportingPdfId === row.id}
                              onClick={() => void handleExportPdf(row)}
                            >
                              {exportingPdfId === row.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="mr-2 h-4 w-4" />
                              )}
                              Print PDF
                            </DropdownMenuItem>
                            {canInspectRow(row) && (
                              <DropdownMenuItem onClick={() => openInspect(row)}>
                                <SearchCheck className="mr-2 h-4 w-4" />
                                Inspect
                              </DropdownMenuItem>
                            )}
                            {(isMainWarehouseUser ||
                              row.destination_location_id === membership.locationId) &&
                              row.status === 'pending_receive' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setCancelTarget(row)}
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel
                                  </DropdownMenuItem>
                                </>
                              )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetailReturn(null);
            setDetailProofUrl(null);
            setDetailSignatureUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <DialogTitle>{detailReturn?.request_number ?? 'Return details'}</DialogTitle>
              {detailReturn && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingPdfId === detailReturn.id}
                  onClick={() => void handleExportPdf(detailReturn)}
                >
                  {exportingPdfId === detailReturn.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Print PDF
                </Button>
              )}
            </div>
          </DialogHeader>
          {detailReturn && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Client</span>
                  <p className="font-medium">
                    {detailReturn.client_company?.company_name ?? '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Destination</span>
                  <p className="font-medium">
                    {detailReturn.destination_location
                      ? `${detailReturn.destination_location.name}${
                          detailReturn.destination_location.is_main ? ' (Main)' : ' (Sub)'
                        }`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <Badge variant={STATUS_VARIANT[detailReturn.status]}>
                      {STATUS_LABELS[detailReturn.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p>{format(new Date(detailReturn.created_at), 'PPp')}</p>
                </div>
              </div>

              {detailReturn.notes && (
                <div>
                  <span className="text-muted-foreground">Notes</span>
                  <p>{detailReturn.notes}</p>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2">Lines</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">Inspected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailReturn.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.variant?.brand?.name ? `${item.variant.brand.name} · ` : ''}
                          {item.variant?.name ?? item.warehouse_variant_id}
                        </TableCell>
                        <TableCell className="text-right">{item.return_quantity}</TableCell>
                        <TableCell className="text-right">{item.inspected_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {detailReturn.receipts.length > 0 ? (
                <div>
                  <h4 className="font-medium mb-2">Inspection history</h4>
                  <div className="space-y-3">
                    {detailReturn.receipts.map((receipt) => (
                      <div key={receipt.id} className="border rounded-lg p-3 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(receipt.received_at), 'PPp')}
                        </p>
                        {receipt.notes?.trim() ? (
                          <p className="text-xs text-muted-foreground">
                            Notes: {receipt.notes.trim()}
                          </p>
                        ) : null}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>Batch</TableHead>
                              <TableHead className="text-right">Good</TableHead>
                              <TableHead className="text-right">Damaged</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receipt.lines.map((line, idx) => (
                              <TableRow key={`${receipt.id}-${idx}`}>
                                <TableCell>
                                  {line.variant?.brand?.name
                                    ? `${line.variant.brand.name} · `
                                    : ''}
                                  {line.variant?.name ?? 'SKU'}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {formatReceiptLotLabel(
                                    line.destination_lot?.batch?.batch_number,
                                    line.destination_lot?.expiration_date
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-green-700 dark:text-green-400">
                                  {line.qty_good}
                                </TableCell>
                                <TableCell className="text-right text-destructive">
                                  {line.qty_damaged}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No inspection recorded yet. Inspect to assign batch and good/damaged qty.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Return proof</h4>
                  {detailProofUrl ? (
                    <a href={detailProofUrl} target="_blank" rel="noreferrer">
                      <img
                        src={detailProofUrl}
                        alt="Return proof"
                        className="max-h-48 w-full rounded-md border object-contain bg-muted/20"
                      />
                    </a>
                  ) : (
                    <p className="text-muted-foreground text-xs">No proof photo attached.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Signature</h4>
                  {detailSignatureUrl ? (
                    <img
                      src={detailSignatureUrl}
                      alt="Return signature"
                      className="max-h-36 w-full rounded-md border object-contain bg-white"
                    />
                  ) : (
                    <p className="text-muted-foreground text-xs">No signature attached.</p>
                  )}
                </div>
              </div>

              {canInspectRow(detailReturn) && (
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => {
                      setDetailOpen(false);
                      openInspect(detailReturn);
                    }}
                  >
                    Inspect return
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WarehouseStockReturnInspectDialog
        open={inspectOpen}
        onOpenChange={setInspectOpen}
        requestNumber={selectedReturn?.request_number ?? ''}
        fromLocationName={
          selectedReturn
            ? `${selectedReturn.client_company?.company_name ?? 'Client'} → ${
                selectedReturn.destination_location?.name ?? 'warehouse'
              }`
            : 'Client company'
        }
        items={inspectItems}
        onItemsChange={setInspectItems}
        mainLots={inspectLots}
        loadingLots={loadingInspectLots}
        formatSubLotLabel={() => 'Client inventory (no batch)'}
        formatMainLotLabel={formatInspectLotLabel}
        notes={inspectNotes}
        onNotesChange={setInspectNotes}
        validationError={validationError}
        submitting={inspectSubmitting}
        onConfirm={handleInspect}
      />

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.request_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores stock to the client company inventory. Only allowed before inspection
              starts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Keep return</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting}>
              {cancelSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
