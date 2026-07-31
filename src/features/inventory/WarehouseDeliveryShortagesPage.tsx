import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, PackageSearch, Search } from 'lucide-react';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { useToast } from '@/hooks/use-toast';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import DeliveryShortagesManual from '@/features/inventory/warehouse-manual/components/DeliveryShortagesManual';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import {
  DISCREPANCY_RESOLUTION_OPTIONS,
  DISCREPANCY_STATUS_LABELS,
  INTERNAL_DISCREPANCY_RESOLUTION_OPTIONS,
  formatShortfallReasonLabel,
  type DiscrepancyResolution,
  type DiscrepancyStatus,
  type ShortfallReason,
} from '@/features/orders/deliveryDiscrepancyShared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

type ShortageSource = 'po' | 'internal';

type DiscrepancyRow = {
  id: string;
  company_id: string;
  /** PO delivery id or internal request id (group key). */
  group_id: string;
  /** PO id or internal request id (for links). */
  parent_id: string;
  parent_number: string | null;
  dr_number: string | null;
  location_name: string | null;
  variant_id: string;
  quantity: number;
  reason: ShortfallReason;
  reporter_notes: string | null;
  status: DiscrepancyStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  brand_name: string | null;
  variant_name: string | null;
  reported_by_name: string | null;
  resolved_by_name: string | null;
};

type ShortageGroup = {
  group_id: string;
  parent_id: string;
  parent_number: string | null;
  dr_number: string | null;
  location_name: string | null;
  created_at: string;
  reporter_notes: string | null;
  lines: DiscrepancyRow[];
  openLines: DiscrepancyRow[];
  openQty: number;
  openCount: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function itemLabel(row: Pick<DiscrepancyRow, 'brand_name' | 'variant_name' | 'variant_id'>): string {
  return (
    [row.brand_name, row.variant_name].filter(Boolean).join(' · ') || row.variant_id.slice(0, 8)
  );
}

async function enrichVariantAndProfileNames(
  data: Array<{
    variant_id?: string | null;
    reported_by?: string | null;
    resolved_by?: string | null;
  }>
): Promise<{
  nameById: Record<string, string>;
  variantLabelById: Record<string, { brand_name: string | null; variant_name: string | null }>;
}> {
  const profileIds = [
    ...new Set(
      data
        .flatMap((r) => [r.reported_by, r.resolved_by])
        .filter(Boolean) as string[]
    ),
  ];
  const nameById: Record<string, string> = {};
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds);
    for (const p of profiles || []) {
      if (p.id && p.full_name) nameById[p.id] = p.full_name;
    }
  }

  const variantIds = [
    ...new Set(data.map((r) => r.variant_id).filter(Boolean) as string[]),
  ];
  const variantLabelById: Record<string, { brand_name: string | null; variant_name: string | null }> =
    {};
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from('variants')
      .select('id, name, brands:brand_id(name)')
      .in('id', variantIds);
    for (const v of variants || []) {
      const brand = firstRelation(
        (v as { brands?: { name?: string | null } | { name?: string | null }[] | null }).brands
      );
      variantLabelById[v.id as string] = {
        brand_name: brand?.name ?? null,
        variant_name: (v as { name?: string | null }).name ?? null,
      };
    }
  }

  return { nameById, variantLabelById };
}

const SHORTAGE_GROUPS_PER_PAGE = 10;

export default function WarehouseDeliveryShortagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership, isLoading: membershipLoading } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse,
  });

  const [searchParams, setSearchParams] = useSearchParams();

  const [source, setSource] = useState<ShortageSource>(() => {
    const s = searchParams.get('source');
    return s === 'internal' ? 'internal' : 'po';
  });
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'resolved'>(() => {
    const s = searchParams.get('status');
    if (s === 'open' || s === 'all' || s === 'resolved') return s;
    return 'open';
  });
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') ?? '');
  const [shortagesPage, setShortagesPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolveTargets, setResolveTargets] = useState<DiscrepancyRow[]>([]);
  const [resolveAction, setResolveAction] = useState<DiscrepancyResolution>('redeliver');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const s = searchParams.get('status');
    if (s === 'open' || s === 'all' || s === 'resolved') {
      setStatusFilter(s);
    }
    const q = searchParams.get('search');
    if (q != null) setSearchQuery(q);
    const src = searchParams.get('source');
    if (src === 'internal' || src === 'po') setSource(src);
  }, [searchParams]);

  const setSourceAndUrl = (next: ShortageSource) => {
    setSource(next);
    setSelectedIds(new Set());
    setShortagesPage(1);
    const params = new URLSearchParams(searchParams);
    if (next === 'internal') params.set('source', 'internal');
    else params.delete('source');
    setSearchParams(params, { replace: true });
  };

  const {
    data: rows = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'warehouse-delivery-shortages',
      source,
      user?.company_id,
      membership.locationId,
      membership.isMain,
    ],
    enabled: !!user?.company_id && isWarehouse && !membershipLoading,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<DiscrepancyRow[]> => {
      if (source === 'internal') {
        let q = supabase
          .from('internal_stock_request_discrepancies')
          .select(
            `
            id,
            company_id,
            request_id,
            from_location_id,
            variant_id,
            quantity,
            reason,
            reporter_notes,
            status,
            resolution_notes,
            created_at,
            resolved_at,
            reported_by,
            resolved_by,
            dr_number,
            internal_stock_requests:request_id(request_number, dr_number),
            warehouse_locations:from_location_id(name)
          `
          )
          .eq('company_id', user!.company_id!)
          .order('created_at', { ascending: false });

        if (!membership.isMain && membership.locationId) {
          q = q.eq('from_location_id', membership.locationId);
        }

        const { data, error: qErr } = await q;
        if (qErr) throw qErr;

        const { nameById, variantLabelById } = await enrichVariantAndProfileNames(data || []);

        return (data || []).map((raw: Record<string, unknown>) => {
          const req = firstRelation(
            raw.internal_stock_requests as {
              request_number?: string;
              dr_number?: string | null;
            } | null
          );
          const loc = firstRelation(raw.warehouse_locations as { name?: string } | null);
          const variantId = raw.variant_id as string;
          const variantLabel = variantLabelById[variantId];
          const reportedBy = raw.reported_by as string | null;
          const resolvedBy = raw.resolved_by as string | null;
          const requestId = raw.request_id as string;

          return {
            id: raw.id as string,
            company_id: raw.company_id as string,
            group_id: `${requestId}:${(raw.dr_number as string | null) || req?.dr_number || 'none'}`,
            parent_id: requestId,
            parent_number: req?.request_number ?? null,
            dr_number: (raw.dr_number as string | null) ?? req?.dr_number ?? null,
            location_name: loc?.name ?? null,
            variant_id: variantId,
            quantity: Number(raw.quantity) || 0,
            reason: raw.reason as ShortfallReason,
            reporter_notes: (raw.reporter_notes as string | null) ?? null,
            status: raw.status as DiscrepancyStatus,
            resolution_notes: (raw.resolution_notes as string | null) ?? null,
            created_at: raw.created_at as string,
            resolved_at: (raw.resolved_at as string | null) ?? null,
            brand_name: variantLabel?.brand_name ?? null,
            variant_name: variantLabel?.variant_name ?? null,
            reported_by_name: reportedBy ? nameById[reportedBy] ?? null : null,
            resolved_by_name: resolvedBy ? nameById[resolvedBy] ?? null : null,
          };
        });
      }

      let q = supabase
        .from('purchase_order_delivery_discrepancies')
        .select(
          `
          id,
          company_id,
          purchase_order_id,
          delivery_id,
          warehouse_location_id,
          variant_id,
          quantity,
          reason,
          buyer_notes,
          status,
          resolution_notes,
          created_at,
          resolved_at,
          reported_by,
          resolved_by,
          purchase_orders:purchase_order_id(po_number),
          purchase_order_deliveries:delivery_id(dr_number),
          warehouse_locations:warehouse_location_id(name)
        `
        )
        .eq('company_id', user!.company_id!)
        .order('created_at', { ascending: false });

      if (!membership.isMain && membership.locationId) {
        q = q.eq('warehouse_location_id', membership.locationId);
      }

      const { data, error: qErr } = await q;
      if (qErr) throw qErr;

      const { nameById, variantLabelById } = await enrichVariantAndProfileNames(data || []);

      return (data || []).map((raw: Record<string, unknown>) => {
        const po = firstRelation(raw.purchase_orders as { po_number?: string } | null);
        const delivery = firstRelation(
          raw.purchase_order_deliveries as { dr_number?: string | null } | null
        );
        const loc = firstRelation(raw.warehouse_locations as { name?: string } | null);
        const variantId = raw.variant_id as string;
        const variantLabel = variantLabelById[variantId];
        const reportedBy = raw.reported_by as string | null;
        const resolvedBy = raw.resolved_by as string | null;

        return {
          id: raw.id as string,
          company_id: raw.company_id as string,
          group_id: raw.delivery_id as string,
          parent_id: raw.purchase_order_id as string,
          parent_number: po?.po_number ?? null,
          dr_number: delivery?.dr_number ?? null,
          location_name: loc?.name ?? null,
          variant_id: variantId,
          quantity: Number(raw.quantity) || 0,
          reason: raw.reason as ShortfallReason,
          reporter_notes: (raw.buyer_notes as string | null) ?? null,
          status: raw.status as DiscrepancyStatus,
          resolution_notes: (raw.resolution_notes as string | null) ?? null,
          created_at: raw.created_at as string,
          resolved_at: (raw.resolved_at as string | null) ?? null,
          brand_name: variantLabel?.brand_name ?? null,
          variant_name: variantLabel?.variant_name ?? null,
          reported_by_name: reportedBy ? nameById[reportedBy] ?? null : null,
          resolved_by_name: resolvedBy ? nameById[resolvedBy] ?? null : null,
        };
      });
    },
  });

  const reportDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'open' && row.status !== 'open') return false;
      if (statusFilter === 'resolved' && row.status === 'open') return false;
      if (!isDateInRange(row.created_at, reportDateRange.start, reportDateRange.end)) return false;
      if (!q) return true;
      const hay = [
        row.parent_number,
        row.dr_number,
        row.location_name,
        row.brand_name,
        row.variant_name,
        row.reason,
        row.reporter_notes,
        row.resolution_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchQuery, statusFilter, reportDateRange.end, reportDateRange.start]);

  const groups = useMemo((): ShortageGroup[] => {
    const byGroup = new Map<string, DiscrepancyRow[]>();
    for (const row of filtered) {
      const list = byGroup.get(row.group_id) || [];
      list.push(row);
      byGroup.set(row.group_id, list);
    }

    const result: ShortageGroup[] = [];
    for (const [group_id, lines] of byGroup) {
      const sorted = [...lines].sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        return itemLabel(a).localeCompare(itemLabel(b));
      });
      const openLines = sorted.filter((l) => l.status === 'open');
      const first = sorted[0];
      result.push({
        group_id,
        parent_id: first.parent_id,
        parent_number: first.parent_number,
        dr_number: first.dr_number,
        location_name: first.location_name,
        created_at: sorted.reduce(
          (min, l) => (l.created_at < min ? l.created_at : min),
          sorted[0].created_at
        ),
        reporter_notes: sorted.find((l) => l.reporter_notes)?.reporter_notes ?? null,
        lines: sorted,
        openLines,
        openQty: openLines.reduce((s, l) => s + l.quantity, 0),
        openCount: openLines.length,
      });
    }

    return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [filtered]);

  useEffect(() => {
    setShortagesPage(1);
  }, [searchQuery, statusFilter, reportDateRange.start, reportDateRange.end, source]);

  const totalShortagePages = Math.max(1, Math.ceil(groups.length / SHORTAGE_GROUPS_PER_PAGE));
  const currentShortagePage = Math.min(Math.max(1, shortagesPage), totalShortagePages);
  const paginatedGroups = groups.slice(
    (currentShortagePage - 1) * SHORTAGE_GROUPS_PER_PAGE,
    currentShortagePage * SHORTAGE_GROUPS_PER_PAGE
  );

  const openCount = useMemo(() => rows.filter((r) => r.status === 'open').length, [rows]);

  const selectedOpenRows = useMemo(
    () => rows.filter((r) => r.status === 'open' && selectedIds.has(r.id)),
    [rows, selectedIds]
  );

  const selectedQty = useMemo(
    () => selectedOpenRows.reduce((s, r) => s + r.quantity, 0),
    [selectedOpenRows]
  );

  const resolutionOptions =
    source === 'internal' ? INTERNAL_DISCREPANCY_RESOLUTION_OPTIONS : DISCREPANCY_RESOLUTION_OPTIONS;

  const toggleLine = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleGroupOpenLines = (group: ShortageGroup, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const line of group.openLines) {
        if (checked) next.add(line.id);
        else next.delete(line.id);
      }
      return next;
    });
  };

  const openBulkResolve = (action: DiscrepancyResolution, lines?: DiscrepancyRow[]) => {
    const targets = (lines ?? selectedOpenRows).filter((l) => l.status === 'open');
    if (targets.length === 0) {
      toast({
        title: 'Nothing selected',
        description: 'Select at least one open shortage line.',
        variant: 'destructive',
      });
      return;
    }
    setResolveTargets(targets);
    setResolveAction(action);
    setResolveNotes('');
  };

  const resolveCopy = (action: DiscrepancyResolution) =>
    resolutionOptions.find((o) => o.value === action)!;

  const submitResolve = async () => {
    if (resolveTargets.length === 0) return;
    if (source === 'internal' && !resolveNotes.trim()) {
      toast({
        title: 'Notes required',
        description: 'Add resolution notes before confirming.',
        variant: 'destructive',
      });
      return;
    }
    setResolving(true);
    try {
      const ids = resolveTargets.map((t) => t.id);
      const rpcName =
        source === 'internal'
          ? 'resolve_internal_stock_request_discrepancies_bulk'
          : 'resolve_po_delivery_discrepancies_bulk';
      const { data, error: rpcErr } = await supabase.rpc(rpcName, {
        p_discrepancy_ids: ids,
        p_resolution: resolveAction,
        p_notes: resolveNotes.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      if (!(data as { success?: boolean })?.success) {
        throw new Error((data as { error?: string })?.error || 'Resolve failed');
      }

      const resolvedCount = Number((data as { resolved_count?: number })?.resolved_count) || ids.length;
      const qty = Number((data as { quantity?: number })?.quantity) || selectedQty;
      const failedCount = Number((data as { failed_count?: number })?.failed_count) || 0;
      const copy = resolveCopy(resolveAction);

      toast({
        title: copy.label,
        description: `${resolvedCount} line(s) · ${qty} unit(s). ${copy.description}${
          failedCount > 0 ? ` ${failedCount} failed.` : ''
        }`,
      });

      setResolveTargets([]);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ['warehouse-delivery-shortages'] });
      if (source === 'internal') {
        await queryClient.invalidateQueries({ queryKey: ['internal-stock-requests'] });
      }
    } catch (e: unknown) {
      toast({
        title: 'Could not resolve',
        description: e instanceof Error ? e.message : 'Resolve failed',
        variant: 'destructive',
      });
    } finally {
      setResolving(false);
    }
  };

  if (!isWarehouse) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Shortages</CardTitle>
            <CardDescription>Warehouse staff only.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const parentLabel = source === 'internal' ? 'RN' : 'PO';
  const notesLabel = source === 'internal' ? 'Sub note' : 'Buyer note';

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackageSearch className="h-7 w-7" />
            Delivery Shortages
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            {source === 'internal' ? (
              <>
                Sub-stock shortages are grouped by request / DR. Investigate first, then choose:{' '}
                <strong>Found &amp; redeliver</strong> (then Allocate Remaining with rider + proof),{' '}
                <strong>Write off &amp; replace</strong> (release reservation, then Allocate Remaining),
                or <strong>Write off only</strong> (accept the short).
              </>
            ) : (
              <>
                Shortages are grouped by DR. Investigate first, then choose per line:{' '}
                <strong>Found &amp; redeliver</strong> (restore stock),{' '}
                <strong>Write off &amp; replace</strong> (no restore, reopen PO for another DR), or{' '}
                <strong>Write off only</strong> (accept the short).
              </>
            )}
          </p>
        </div>
        <PageManualDialog
          title="Delivery Shortages Manual"
          fullManualHref="/warehouse-manual#delivery-shortages"
        >
          <DeliveryShortagesManual embedded />
        </PageManualDialog>
      </div>

      <div className="flex gap-2 border-b pb-0">
        <Button
          type="button"
          variant="ghost"
          className={`rounded-b-none border-b-2 px-4 ${
            source === 'po'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground'
          }`}
          onClick={() => setSourceAndUrl('po')}
        >
          PO deliveries
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={`rounded-b-none border-b-2 px-4 ${
            source === 'internal'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground'
          }`}
          onClick={() => setSourceAndUrl('internal')}
        >
          Sub Warehouse Allocations & Requests
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={
                  source === 'internal'
                    ? 'Search RN, DR, sub warehouse, item, notes…'
                    : 'Search PO, DR, item, notes…'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[180px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open ({openCount})</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilterPopover
              value={dateRangeFilter}
              onChange={setDateRangeFilter}
              triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
              align="end"
            />
          </div>

          {selectedOpenRows.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-sm">
                <span className="font-semibold">{selectedOpenRows.length}</span> line
                {selectedOpenRows.length === 1 ? '' : 's'} selected ·{' '}
                <span className="font-semibold tabular-nums">{selectedQty}</span> unit
                {selectedQty === 1 ? '' : 's'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openBulkResolve('redeliver')}>
                  Found & redeliver
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openBulkResolve('write_off_replace')}
                >
                  Write off & replace
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openBulkResolve('write_off')}
                >
                  Write off only
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {isLoading || membershipLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading shortages…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-destructive py-6">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {(error as Error).message.includes('internal_stock_request_discrepancies')
                  ? 'Sub-stock shortages table is not available yet. Apply migration 20260724180000_internal_stock_request_discrepancies.sql.'
                  : (error as Error).message.includes('purchase_order_delivery_discrepancies')
                    ? 'Delivery shortages table is not available yet. Apply migration 20260715120000_po_delivery_discrepancies.sql.'
                    : (error as Error).message}
              </span>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {statusFilter === 'open'
                ? source === 'internal'
                  ? 'No open sub-stock shortages.'
                  : 'No open delivery shortages.'
                : 'No shortages match your filters.'}
            </p>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedGroups.map((group) => {
                  const openIds = group.openLines.map((l) => l.id);
                  const selectedInGroup = openIds.filter((id) => selectedIds.has(id));
                  const allOpenSelected =
                    openIds.length > 0 && selectedInGroup.length === openIds.length;
                  const someOpenSelected =
                    selectedInGroup.length > 0 && selectedInGroup.length < openIds.length;

                  return (
                    <div key={group.group_id} className="rounded-lg border overflow-hidden">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between bg-muted/30 px-3 py-3 border-b">
                        <div className="flex items-start gap-3 min-w-0">
                          {group.openCount > 0 ? (
                            <Checkbox
                              className="mt-1"
                              checked={
                                allOpenSelected ? true : someOpenSelected ? 'indeterminate' : false
                              }
                              onCheckedChange={(v) => toggleGroupOpenLines(group, v === true)}
                              aria-label="Select all open lines in this group"
                            />
                          ) : (
                            <div className="w-4" />
                          )}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {group.parent_number ? (
                                <Link
                                  to={
                                    source === 'internal'
                                      ? `/inventory/sub-stock-requests?search=${encodeURIComponent(group.parent_number)}`
                                      : `/purchase-orders?search=${encodeURIComponent(group.parent_number)}`
                                  }
                                  className="font-semibold text-violet-700 hover:underline"
                                >
                                  {group.parent_number}
                                </Link>
                              ) : (
                                <span className="font-semibold">{parentLabel}</span>
                              )}
                              <span className="font-mono text-sm text-muted-foreground">
                                {group.dr_number || 'No DR #'}
                              </span>
                              {group.openCount > 0 ? (
                                <Badge variant="destructive">
                                  {group.openCount} open · {group.openQty} unit
                                  {group.openQty === 1 ? '' : 's'}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Resolved</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>
                                Reported {format(new Date(group.created_at), 'MMM d, yyyy HH:mm')}
                              </span>
                              {group.location_name ? <span>{group.location_name}</span> : null}
                            </div>
                            {group.reporter_notes ? (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {notesLabel}: {group.reporter_notes}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {group.openCount > 0 ? (
                          <div className="flex flex-wrap gap-2 sm:justify-end shrink-0">
                            {(() => {
                              const lines =
                                selectedInGroup.length > 0
                                  ? group.openLines.filter((l) => selectedIds.has(l.id))
                                  : group.openLines;
                              const countSuffix =
                                selectedInGroup.length > 0 &&
                                selectedInGroup.length < group.openCount
                                  ? ` (${selectedInGroup.length})`
                                  : '';
                              return (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
                                    onClick={() => openBulkResolve('redeliver', lines)}
                                  >
                                    Found & redeliver{countSuffix}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8"
                                    onClick={() => openBulkResolve('write_off_replace', lines)}
                                  >
                                    Write off & replace{countSuffix}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8"
                                    onClick={() => openBulkResolve('write_off', lines)}
                                  >
                                    Write off only{countSuffix}
                                  </Button>
                                </>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>

                      <div className="divide-y">
                        {group.lines.map((line) => {
                          const isOpen = line.status === 'open';
                          return (
                            <div
                              key={line.id}
                              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2.5 text-sm"
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                {isOpen ? (
                                  <Checkbox
                                    className="mt-0.5"
                                    checked={selectedIds.has(line.id)}
                                    onCheckedChange={(v) => toggleLine(line.id, v === true)}
                                    aria-label={`Select ${itemLabel(line)}`}
                                  />
                                ) : (
                                  <div className="w-4" />
                                )}
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{itemLabel(line)}</div>
                                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                                    <span>
                                      {formatShortfallReasonLabel(
                                        line.reason,
                                        line.reporter_notes
                                      )}
                                    </span>
                                    {line.reported_by_name ? (
                                      <span>by {line.reported_by_name}</span>
                                    ) : null}
                                    {!isOpen && line.resolved_at ? (
                                      <span>
                                        {format(new Date(line.resolved_at), 'MMM d')}
                                        {line.resolved_by_name
                                          ? ` · ${line.resolved_by_name}`
                                          : ''}
                                      </span>
                                    ) : null}
                                  </div>
                                  {!isOpen && line.resolution_notes ? (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {line.resolution_notes}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 sm:justify-end pl-7 sm:pl-0 shrink-0">
                                <span className="font-semibold tabular-nums">{line.quantity}</span>
                                <Badge variant={isOpen ? 'destructive' : 'secondary'}>
                                  {DISCREPANCY_STATUS_LABELS[line.status] || line.status}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {groups.length > SHORTAGE_GROUPS_PER_PAGE && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4 pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium">
                      {(currentShortagePage - 1) * SHORTAGE_GROUPS_PER_PAGE + 1}-
                      {Math.min(currentShortagePage * SHORTAGE_GROUPS_PER_PAGE, groups.length)}
                    </span>{' '}
                    of <span className="font-medium">{groups.length}</span>{' '}
                    {source === 'internal' ? 'requests' : 'deliveries'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShortagesPage((p) => Math.max(1, p - 1))}
                      disabled={currentShortagePage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {currentShortagePage} of {totalShortagePages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShortagesPage((p) => Math.min(totalShortagePages, p + 1))}
                      disabled={currentShortagePage === totalShortagePages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={resolveTargets.length > 0}
        onOpenChange={(o) => {
          if (!o && !resolving) setResolveTargets([]);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{resolveCopy(resolveAction).label}</DialogTitle>
            <DialogDescription>
              {resolveCopy(resolveAction).description} Applying to{' '}
              {resolveTargets.reduce((s, t) => s + t.quantity, 0)} unit(s) across{' '}
              {resolveTargets.length} line(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2 max-h-56 overflow-y-auto">
              {resolveTargets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 border-b last:border-0 pb-2 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="font-semibold leading-snug">{itemLabel(t)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.parent_number || parentLabel} · {t.dr_number || 'DR'} ·{' '}
                      {formatShortfallReasonLabel(t.reason, t.reporter_notes)}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums shrink-0">{t.quantity}</div>
                </div>
              ))}
            </div>
            <div className="rounded-md border px-3 py-2 text-xs space-y-1 bg-background">
              {source === 'internal' ? (
                <>
                  <div>
                    <span className="text-muted-foreground">Reservation:</span>{' '}
                    <span className="font-medium">
                      {resolveAction === 'write_off'
                        ? 'Release held reservation back to available'
                        : 'Release held reservation; re-deliver via Allocate Remaining'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next step:</span>{' '}
                    <span className="font-medium">
                      {resolveAction === 'write_off'
                        ? 'Reduce delivered qty; no replacement for this shortage'
                        : 'Use Allocate Remaining (rider photo, plate, proof, new DR) on Sub Stock Requests'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-muted-foreground">Stock:</span>{' '}
                    <span className="font-medium">
                      {resolveAction === 'redeliver'
                        ? 'Restore to warehouse inventory'
                        : 'Do not restore (already deducted at dispatch)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">PO fulfillment:</span>{' '}
                    <span className="font-medium">
                      {resolveAction === 'write_off'
                        ? 'Leave closed for this qty (no replacement DR)'
                        : 'Reopen reservation for another DR on this PO'}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>
                Resolution notes
                {source === 'internal' ? (
                  <span className="text-destructive"> (required)</span>
                ) : (
                  <span className="text-muted-foreground font-normal"> (optional)</span>
                )}
              </Label>
              <Textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder={
                  resolveAction === 'redeliver'
                    ? source === 'internal'
                      ? 'Found on truck / left at gate — will Allocate Remaining to re-deliver…'
                      : 'Found on truck / left at gate — returning to stock…'
                    : resolveAction === 'write_off_replace'
                      ? 'Confirmed missing — will ship replacement from remaining stock…'
                      : 'Confirmed loss — accepting short delivery…'
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTargets([])} disabled={resolving}>
              Cancel
            </Button>
            <Button
              variant={resolveAction === 'write_off' ? 'destructive' : 'default'}
              onClick={() => void submitResolve()}
              disabled={resolving || (source === 'internal' && !resolveNotes.trim())}
            >
              {resolving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm ({resolveTargets.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
