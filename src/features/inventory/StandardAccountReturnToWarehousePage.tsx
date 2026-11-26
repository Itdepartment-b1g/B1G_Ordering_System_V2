import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { FileText, Loader2, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { StandardAccountReturnToWarehouseDialog } from './components/StandardAccountReturnToWarehouseDialog';
import {
  SaReturnAccordionList,
  SaReturnExpandedPanel,
  type SaReturnListStatus,
} from './components/SaReturnAccordionList';
import { getStandardAccountReturnEvidenceSignedUrl } from './utils/uploadStandardAccountReturnEvidence';
import { exportStandardAccountReturnPdfFromSource } from './utils/exportStandardAccountReturnPdf';
import { fetchLeaderRequestedFromName } from './utils/exportLeaderStockRequestPdf';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
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

type ReturnStatus = SaReturnListStatus;

type SaReturnReceiptLine = {
  warehouse_variant_id: string | null;
  qty_good: number;
  qty_damaged: number;
  variant: { name: string; brand: { name: string } | null } | null;
  destination_lot: {
    expiration_date: string | null;
    batch: { batch_number: string } | null;
  } | null;
};

type SaReturnReceipt = {
  id: string;
  received_at: string | null;
  received_by_user: { full_name: string } | null;
  lines: SaReturnReceiptLine[];
};

type SaReturnRow = {
  id: string;
  request_number: string;
  status: ReturnStatus;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  source_agent_id: string | null;
  approved_at: string | null;
  return_type: 'my_inventory' | 'item_disposal';
  signature_url: string | null;
  signature_path: string | null;
  proof_image_url: string | null;
  proof_image_path: string | null;
  destination_location: { name: string; is_main: boolean | null } | null;
  created_by_user: { full_name: string } | null;
  approved_by_user: { full_name: string } | null;
  inspected_by_user: { full_name: string } | null;
  inspected_at: string | null;
  items: Array<{
    id: string;
    warehouse_variant_id: string;
    return_quantity: number;
    inspected_quantity: number;
    stock_return_quantity: number;
    disposal_quantity: number;
    variant: {
      name: string;
      variant_type: string | null;
      brand: { name: string } | null;
    } | null;
  }>;
  receipts: SaReturnReceipt[];
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapRow(raw: Record<string, unknown>): SaReturnRow {
  const createdBy = firstRelation(
    raw.created_by_user as SaReturnRow['created_by_user'] | SaReturnRow['created_by_user'][]
  );
  const approvedBy = firstRelation(
    raw.approved_by_user as SaReturnRow['approved_by_user'] | SaReturnRow['approved_by_user'][]
  );
  const destinationLocation = firstRelation(
    raw.destination_location as
      | SaReturnRow['destination_location']
      | SaReturnRow['destination_location'][]
  );
  const receipts = ((raw.receipts as unknown[]) ?? []).map((receipt) => {
    const r = receipt as Record<string, unknown>;
    const receivedBy = firstRelation(
      r.received_by_user as
        | SaReturnReceipt['received_by_user']
        | SaReturnReceipt['received_by_user'][]
    );
    const lines = ((r.lines as unknown[]) ?? []).map((line) => {
      const l = line as Record<string, unknown>;
      const variant = firstRelation(
        l.warehouse_variant as SaReturnReceiptLine['variant'] | SaReturnReceiptLine['variant'][]
      );
      const brand = variant?.brand
        ? firstRelation(variant.brand as { name: string } | { name: string }[])
        : null;
      const destinationLot = firstRelation(
        l.destination_lot as
          | SaReturnReceiptLine['destination_lot']
          | SaReturnReceiptLine['destination_lot'][]
      );
      const batch = destinationLot?.batch
        ? firstRelation(
            destinationLot.batch as { batch_number: string } | { batch_number: string }[]
          )
        : null;
      return {
        warehouse_variant_id: (l.warehouse_variant_id as string | null) ?? null,
        qty_good: Number(l.qty_good) || 0,
        qty_damaged: Number(l.qty_damaged) || 0,
        variant: variant
          ? { name: variant.name, brand: brand ? { name: brand.name } : null }
          : null,
        destination_lot: destinationLot
          ? {
              expiration_date: (destinationLot.expiration_date as string | null) ?? null,
              batch: batch ? { batch_number: batch.batch_number } : null,
            }
          : null,
      } satisfies SaReturnReceiptLine;
    });

    return {
      id: r.id as string,
      received_at: (r.received_at as string | null) ?? null,
      received_by_user: receivedBy,
      lines,
    } satisfies SaReturnReceipt;
  });

  const sortedReceipts = [...receipts].sort((a, b) => {
    const aTime = a.received_at ? new Date(a.received_at).getTime() : 0;
    const bTime = b.received_at ? new Date(b.received_at).getTime() : 0;
    return bTime - aTime;
  });

  const inspectedBy =
    sortedReceipts
      .map((receipt) => receipt.received_by_user)
      .find((user) => user?.full_name?.trim()) ?? null;

  const inspectedAt = sortedReceipts.find((receipt) => receipt.received_at)?.received_at ?? null;

  const classificationByVariant = new Map<string, { stockReturn: number; disposal: number }>();
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      const key = line.warehouse_variant_id;
      if (!key) continue;
      const current = classificationByVariant.get(key) ?? { stockReturn: 0, disposal: 0 };
      current.stockReturn += Number(line.qty_good) || 0;
      current.disposal += Number(line.qty_damaged) || 0;
      classificationByVariant.set(key, current);
    }
  }

  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    const variant = firstRelation(
      row.client_variant as SaReturnRow['items'][0]['variant'] | SaReturnRow['items'][0]['variant'][]
    );
    const brand = variant?.brand
      ? firstRelation(variant.brand as { name: string } | { name: string }[])
      : null;
    const warehouseVariantId = row.warehouse_variant_id as string;
    const classification = classificationByVariant.get(warehouseVariantId) ?? {
      stockReturn: 0,
      disposal: 0,
    };
    return {
      id: row.id as string,
      warehouse_variant_id: warehouseVariantId,
      return_quantity: row.return_quantity as number,
      inspected_quantity: row.inspected_quantity as number,
      stock_return_quantity: classification.stockReturn,
      disposal_quantity: classification.disposal,
      variant: variant
        ? {
            name: variant.name,
            variant_type: (variant.variant_type as string | null) ?? null,
            brand: brand ? { name: brand.name } : null,
          }
        : null,
    };
  });

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as ReturnStatus,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
    created_by: (raw.created_by as string | null) ?? null,
    source_agent_id: (raw.source_agent_id as string | null) ?? null,
    approved_at: (raw.approved_at as string | null) ?? null,
    return_type:
      raw.return_type === 'item_disposal' ? 'item_disposal' : 'my_inventory',
    signature_url: (raw.signature_url as string | null) ?? null,
    signature_path: (raw.signature_path as string | null) ?? null,
    proof_image_url: (raw.proof_image_url as string | null) ?? null,
    proof_image_path: (raw.proof_image_path as string | null) ?? null,
    destination_location: destinationLocation,
    created_by_user: createdBy,
    approved_by_user: approvedBy,
    inspected_by_user: inspectedBy,
    inspected_at: inspectedAt,
    items,
    receipts,
  };
}

const SaReturnList = SaReturnAccordionList<SaReturnRow>;

export default function StandardAccountReturnToWarehousePage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isTeamLeader = user?.role === 'team_leader';
  const isCompanyAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const inventorySource = isTeamLeader ? 'leader' : 'main';
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q')?.trim() || searchParams.get('search')?.trim() || ''
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<SaReturnRow | null>(null);
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null);
  const [detailSignatureUrl, setDetailSignatureUrl] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaReturnRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const { data: pendingApproverName } = useQuery({
    queryKey: ['sa-return-pending-approver-name', user?.company_id],
    enabled: !!user?.company_id && hasWarehouseHubLink,
    staleTime: 5 * 60_000,
    queryFn: () => fetchLeaderRequestedFromName(user?.company_id),
  });

  const { data: returns = [], isLoading, error: returnsError } = useQuery({
    queryKey: ['sa-stock-returns', user?.company_id, user?.id, isTeamLeader],
    enabled: !!user?.company_id && hasWarehouseHubLink,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      let query = supabase
        .from('standard_account_stock_return_requests')
        .select(
          `
          id,
          request_number,
          status,
          notes,
          created_at,
          created_by,
          source_agent_id,
          approved_at,
          approved_by,
          return_type,
          signature_url,
          signature_path,
          proof_image_url,
          proof_image_path,
          destination_location:warehouse_locations!destination_location_id (
            name,
            is_main
          ),
          created_by_user:profiles!created_by ( full_name ),
          approved_by_user:profiles!approved_by ( full_name ),
          items:standard_account_stock_return_request_items (
            id,
            warehouse_variant_id,
            return_quantity,
            inspected_quantity,
            client_variant:variants!client_variant_id (
              name,
              variant_type,
              brand:brands ( name )
            )
          ),
          receipts:standard_account_stock_return_receipts (
            id,
            received_at,
            received_by_user:profiles!received_by ( full_name ),
            lines:standard_account_stock_return_receipt_lines (
              warehouse_variant_id,
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
        .eq('client_company_id', user!.company_id!);

      if (isTeamLeader && user?.id) {
        query = query.or(`source_agent_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
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
    return returns.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!isDateInRange(row.created_at, dateRange.start, dateRange.end)) return false;
      if (!q) return true;
      return (
        row.request_number.toLowerCase().includes(q) ||
        (row.destination_location?.name ?? '').toLowerCase().includes(q) ||
        row.items.some(
          (i) =>
            i.variant?.name.toLowerCase().includes(q) ||
            i.variant?.brand?.name.toLowerCase().includes(q)
        )
      );
    });
  }, [returns, searchQuery, statusFilter, dateRange.end, dateRange.start]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, pageSize]);

  useEffect(() => {
    const fromUrl =
      searchParams.get('q')?.trim() || searchParams.get('search')?.trim() || '';
    if (!fromUrl) return;
    setSearchQuery(fromUrl);
    setStatusFilter('all');
    setDateRangeFilter({ preset: 'all' });
  }, [searchParams]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(filtered, page, pageSize);

  const openDetail = async (row: SaReturnRow) => {
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

  const handleExportPdf = async (row: SaReturnRow) => {
    setExportingPdfId(row.id);
    try {
      const { data: companyRow } = user?.company_id
        ? await supabase
            .from('companies')
            .select('company_name')
            .eq('id', user.company_id)
            .maybeSingle()
        : { data: null };

      await exportStandardAccountReturnPdfFromSource({
        request_number: row.request_number,
        status: row.status,
        created_at: row.created_at,
        approved_at: row.approved_at,
        inspected_at: row.inspected_at,
        notes: row.notes,
        return_type: row.return_type,
        signature_url: row.signature_url,
        signature_path: row.signature_path,
        client_company: companyRow?.company_name
          ? { company_name: companyRow.company_name }
          : null,
        destination_location: row.destination_location,
        created_by_user: row.created_by_user,
        approved_by_user: row.approved_by_user,
        inspected_by_user: row.inspected_by_user,
        items: row.items.map((item) => ({
          warehouse_variant_id: item.warehouse_variant_id,
          return_quantity: item.return_quantity,
          inspected_quantity: item.inspected_quantity,
          variant: item.variant,
        })),
        receipts: row.receipts.map((receipt) => ({
          received_at: receipt.received_at,
          lines: receipt.lines.map((line) => ({
            warehouseVariantId: line.warehouse_variant_id,
            brandName: line.variant?.brand?.name ?? null,
            variantName: line.variant?.name ?? null,
            qtyGood: line.qty_good,
            qtyDamaged: line.qty_damaged,
            batchNumber: line.destination_lot?.batch?.batch_number ?? null,
            expirationDate: line.destination_lot?.expiration_date ?? null,
          })),
        })),
      });
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

  const handleApprove = async (row: SaReturnRow) => {
    setApprovingId(row.id);
    try {
      const { data, error } = await supabase.rpc('approve_standard_account_stock_return_request', {
        p_request_id: row.id,
        p_approved_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) throw new Error(result?.error ?? 'Approve failed');

      toast({
        title: 'Return approved',
        description: `${result.request_number ?? row.request_number} sent to warehouse for inspection.`,
      });
      await queryClient.refetchQueries({ queryKey: ['sa-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['sa-client-stock-returns'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to approve return',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const wasPendingApproval = cancelTarget.status === 'pending_approval';
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
        title: wasPendingApproval ? 'Return rejected' : 'Return cancelled',
        description: `${result.request_number ?? 'Return'} ${
          wasPendingApproval ? 'rejected' : 'cancelled'
        }; stock restored${
          cancelTarget.source_agent_id
            ? ' to TL inventory (and main stock / allocated)'
            : ' to main inventory'
        }.`,
      });
      setCancelTarget(null);
      await queryClient.refetchQueries({ queryKey: ['sa-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['agent-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['my-inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['sa-return-available-inventory'] });
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

  if (!hasWarehouseHubLink) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This company is not linked to a warehouse, so returns to warehouse are unavailable.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Return to Warehouse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isTeamLeader
              ? 'Return stock from your inventory. Super admin must approve before the warehouse can inspect. Reject/cancel restores your inventory plus company stock and allocated totals.'
              : 'Send unallocated main stock to the warehouse, or approve team leader returns waiting for you. Warehouse inspects good vs damaged and chooses the batch.'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <RotateCcw className="h-4 w-4 mr-2" />
          New return
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Returns</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search RT number or product…"
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
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="pending_receive">Pending inspection</SelectItem>
                <SelectItem value="partially_received">Partially inspected</SelectItem>
                <SelectItem value="fully_received">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {returnsError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Could not load returns:{' '}
              {returnsError instanceof Error ? returnsError.message : 'Unknown error'}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No returns yet.</div>
          ) : (
            <div className="space-y-4">
              <SaReturnList
                rows={pagedItems}
                isCompanyAdmin={isCompanyAdmin}
                approvingId={approvingId}
                exportingPdfId={exportingPdfId}
                pendingApproverName={pendingApproverName}
                onView={(row) => void openDetail(row)}
                onPrintPdf={(row) => void handleExportPdf(row)}
                onApprove={
                  isCompanyAdmin ? (row) => void handleApprove(row) : undefined
                }
                onCancel={(row) => setCancelTarget(row)}
              />
              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={setPageSize}
                onPrevious={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <StandardAccountReturnToWarehouseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={user?.company_id ?? null}
        userId={user?.id ?? null}
        userFullName={user?.full_name ?? null}
        inventorySource={inventorySource}
      />

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <SaReturnExpandedPanel
              row={{
                ...detailReturn,
                proof_image_url: detailProofUrl ?? detailReturn.proof_image_url,
                signature_url: detailSignatureUrl ?? detailReturn.signature_url,
              }}
              pendingApproverName={pendingApproverName}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {cancelTarget?.status === 'pending_approval' && isCompanyAdmin
                ? `Reject ${cancelTarget?.request_number}?`
                : `Cancel ${cancelTarget?.request_number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.source_agent_id
                ? 'Stock will be restored to the team leader inventory, and company main stock + allocated stock will be restored. This only works before warehouse inspection.'
                : 'Stock will be restored to main inventory. This only works if the warehouse has not started inspection.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Keep return</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting}>
              {cancelSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {cancelTarget?.status === 'pending_approval' && isCompanyAdmin
                ? 'Reject return'
                : 'Cancel return'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
