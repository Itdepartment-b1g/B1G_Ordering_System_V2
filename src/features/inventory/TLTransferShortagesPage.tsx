import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, PackageSearch, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import {
  TL_TRANSFER_RESOLUTION_OPTIONS,
  invalidateTlTransferQueries,
  tlShortageStatusLabel,
} from './tl-stock-transfer/tlStockTransferShared';
import { useTlTransferRealtime } from './tl-stock-transfer/useTlTransferRealtime';
import type {
  TLDiscrepancyResolution,
  TLDiscrepancyStatus,
  TLReceiveShortfallReason,
} from '@/types/tlStockRequests.types';

type ShortageRow = {
  id: string;
  request_id: string;
  quantity: number;
  reason: TLReceiveShortfallReason;
  reporter_notes: string | null;
  status: TLDiscrepancyStatus;
  created_at: string;
  request_number: string;
  tdr_number: string;
  requester_name: string;
  source_leader_id: string;
  brand_name: string;
  variant_name: string;
};

export default function TLTransferShortagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [resolveTarget, setResolveTarget] = useState<ShortageRow | null>(null);
  const [resolution, setResolution] = useState<TLDiscrepancyResolution | null>(null);
  const [foundChoice, setFoundChoice] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canUsePage =
    isAdmin || (user?.role === 'team_leader' && hasWarehouseHubLink === true);

  useTlTransferRealtime({
    enabled: canUsePage && !!user?.company_id,
    companyId: user?.company_id,
    channelKey: 'shortages',
  });

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['tl-transfer-shortages', user?.company_id, user?.id, isAdmin],
    enabled: !!user?.company_id && canUsePage,
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('tl_stock_request_discrepancies')
        .select(
          `
          id,
          request_id,
          request_item_id,
          quantity,
          reason,
          reporter_notes,
          status,
          created_at,
          request:tl_stock_requests(
            request_number,
            tdr_number,
            source_leader_id,
            requester:profiles!requester_leader_id(full_name)
          ),
          item:tl_stock_request_items(
            variant:variants(name, brand:brands(name))
          )
        `
        )
        .eq('company_id', user!.company_id)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;

      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        request_id: row.request_id,
        quantity: row.quantity,
        reason: row.reason,
        reporter_notes: row.reporter_notes,
        status: row.status,
        created_at: row.created_at,
        request_number: row.request?.request_number || '',
        tdr_number: row.request?.tdr_number || '',
        requester_name: row.request?.requester?.full_name || '',
        source_leader_id: row.request?.source_leader_id || '',
        brand_name: row.item?.variant?.brand?.name || '',
        variant_name: row.item?.variant?.name || '',
      })) as ShortageRow[];

      if (isAdmin) return mapped;
      return mapped.filter((row) => row.source_leader_id === user!.id);
    },
  });

  const statusRows = useMemo(
    () => (statusFilter === 'open' ? rows.filter((row) => row.status === 'open') : rows),
    [rows, statusFilter]
  );

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return statusRows.filter((row) => {
      if (!isDateInRange(row.created_at, dateRange.start, dateRange.end)) return false;
      if (!q) return true;
      return [
        row.request_number,
        row.tdr_number,
        row.requester_name,
        row.brand_name,
        row.variant_name,
        formatShortfallReasonLabel(row.reason, row.reporter_notes),
        tlShortageStatusLabel(row.status),
        row.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [statusRows, searchQuery, dateRange.start, dateRange.end]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery, dateRangeFilter, pageSize]);

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(filteredRows, page, pageSize),
    [filteredRows, page, pageSize]
  );

  const closeResolve = () => {
    setResolveTarget(null);
    setResolution(null);
    setFoundChoice(false);
    setNotes('');
  };

  const openFound = (row: ShortageRow) => {
    setResolveTarget(row);
    setResolution(null);
    setFoundChoice(true);
    setNotes('');
  };

  const openResolve = (row: ShortageRow, next: TLDiscrepancyResolution) => {
    setResolveTarget(row);
    setResolution(next);
    setFoundChoice(false);
    setNotes('');
  };

  const handleResolve = async (next: TLDiscrepancyResolution) => {
    if (!resolveTarget) return;
    setSaving(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('resolve_tl_stock_request_discrepancy', {
        p_discrepancy_id: resolveTarget.id,
        p_resolution: next,
        p_notes: notes || null,
      });
      if (rpcError) throw rpcError;
      if (!data?.success) throw new Error(data?.error || 'Failed to resolve shortage');
      toast({
        title: 'Shortage updated',
        description:
          next === 'write_off'
            ? 'Loss confirmed. Stock does not return to you. Transfer stays incomplete.'
            : next === 'found_keep'
              ? 'Stock returned to your inventory. You are keeping it. Transfer stays incomplete.'
              : next === 'redeliver'
                ? 'Stock returned to your inventory. Dispatch it again from Incoming on this same transfer.'
                : 'Loss confirmed. Dispatch the replacement from Incoming on this same transfer. You can send less if you need the units.',
      });
      closeResolve();
      invalidateTlTransferQueries(queryClient);
    } catch (err: any) {
      toast({
        title: 'Could not resolve',
        description: err.message || 'Failed to resolve shortage',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (hasWarehouseHubLinkLoading && user?.role === 'team_leader') {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!canUsePage) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Transfer shortages unavailable</CardTitle>
            <CardDescription>
              This queue is for team leaders who dispatch TL-to-TL transfers (warehouse-linked
              companies) and for company admins.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedOption = TL_TRANSFER_RESOLUTION_OPTIONS.find((o) => o.value === resolution);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer shortages</h1>
        <p className="text-muted-foreground">
          Investigate stock that left your inventory at dispatch but arrived short. Found returns
          those units to you; then dispatch again or keep them. Write off is only for lost stock.{' '}
          <Link to="/inventory/tl-stock-requests" className="text-primary underline-offset-4 hover:underline">
            Back to my transfers
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PackageSearch className="h-5 w-5" />
                {isAdmin ? 'Company TL transfer shortages' : 'Shortages you dispatched'}
              </CardTitle>
              <CardDescription>
                Found returns the missing units to your inventory. Then dispatch again from Incoming
                on the same transfer, or keep them. Replace writes off the loss and also reopens
                Incoming on that same transfer so you can send a replacement (you may send less).
                Write off is for stock that is actually lost and will not be replaced.
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="relative w-full sm:w-[240px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search transfer #, TDR, name…"
                  className="h-9 pl-8"
                />
              </div>
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="w-full sm:w-[220px] justify-between h-9"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={statusFilter === 'open' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('open')}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading shortages...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-destructive py-6">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {(error as Error).message.includes('tl_stock_request_discrepancies')
                  ? 'Apply migration 20260909160000_tl_stock_transfer_dispatch_receive_shortages.sql to enable this queue.'
                  : (error as Error).message}
              </span>
            </div>
          ) : statusRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {statusFilter === 'open' ? 'No open transfer shortages.' : 'No shortages yet.'}
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No shortages match this search or date range.
            </p>
          ) : (
            <div className="space-y-4">
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>TDR</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.request_number}</TableCell>
                      <TableCell className="font-mono text-sm">{row.tdr_number || '—'}</TableCell>
                      <TableCell>{row.requester_name}</TableCell>
                      <TableCell>
                        {row.brand_name} · {row.variant_name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                      <TableCell>
                        {formatShortfallReasonLabel(row.reason, row.reporter_notes)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tlShortageStatusLabel(row.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.status === 'open' ? (
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => openFound(row)}>
                              Found
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openResolve(row, 'write_off_replace')}
                            >
                              Replace
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openResolve(row, 'write_off')}
                            >
                              Write off
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ListPagination
              pageSize={pageSize}
              safePage={safePage}
              pageCount={pageCount}
              onPageSizeChange={setPageSize}
              onPrevious={() => setPage(Math.max(0, safePage - 1))}
              onNext={() => setPage(Math.min(pageCount - 1, safePage + 1))}
            />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!resolveTarget}
        onOpenChange={(open) => {
          if (!open) closeResolve();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {foundChoice ? 'Missing stock found' : selectedOption?.label || 'Resolve shortage'}
            </DialogTitle>
            <DialogDescription>
              {foundChoice
                ? 'These units return to your inventory. Dispatch them again (Incoming, new TDR) or keep them. Keeping is not a write-off — the stock is not lost.'
                : selectedOption?.description}
            </DialogDescription>
          </DialogHeader>
          {resolveTarget ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Transfer</span>{' '}
                <span className="font-medium">{resolveTarget.request_number}</span> · {resolveTarget.quantity}{' '}
                unit{resolveTarget.quantity === 1 ? '' : 's'}
              </p>
              <div className="space-y-2">
                <Label htmlFor="resolve-notes">Notes (optional)</Label>
                <Textarea
                  id="resolve-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className={foundChoice ? 'flex-col sm:flex-row sm:justify-end gap-2' : undefined}>
            <Button variant="outline" onClick={closeResolve} disabled={saving}>
              Cancel
            </Button>
            {foundChoice ? (
              <>
                <Button variant="secondary" onClick={() => void handleResolve('found_keep')} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Keep in my inventory
                </Button>
                <Button onClick={() => void handleResolve('redeliver')} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Dispatch again
                </Button>
              </>
            ) : (
              <Button onClick={() => resolution && void handleResolve(resolution)} disabled={saving || !resolution}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Confirm'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
