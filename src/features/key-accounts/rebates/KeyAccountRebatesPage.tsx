import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Eye, Check, X, RotateCcw, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { SelectDeliveredPoForRebateDialog } from './SelectDeliveredPoForRebateDialog';
import {
  formatRebateCurrency,
  REBATE_RESOLUTION_OPTIONS,
  rebateReasonLabel,
  rebateResolutionLabel,
  rebateStatusBadgeClass,
  rebateStatusLabel,
  type KeyAccountRebateResolutionType,
  type KeyAccountRebateStatus,
} from './keyAccountRebateShared';
import {
  isKeyAccountAccounting,
  isKeyAccountDirector,
  isKeyAccountManager,
  isKeyAccountSalesAdmin,
  isKeyAccountSalesHead,
} from '@/features/key-accounts/keyAccountRoles';

type RebateRow = {
  id: string;
  rebate_number: string;
  purchase_order_id: string;
  kam_id: string | null;
  created_by: string | null;
  status: KeyAccountRebateStatus;
  resolution_type: string;
  reason_code: string;
  disputed_total: number;
  credit_amount: number;
  replacement_total: number;
  notes: string | null;
  rejection_reason: string | null;
  fulfillment_purchase_order_id: string | null;
  top_up_purchase_order_id?: string | null;
  created_at: string;
  purchase_order?: { po_number: string; total_amount: number } | null;
  client?: { client_name: string } | null;
  kam?: { full_name: string; role: string } | null;
  fulfillment_po?: { po_number: string } | null;
  top_up_po?: { po_number: string } | null;
};

/** PostgREST may return embedded FK rows as an object or a one-element array. */
function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type RebateQueryRow = Omit<
  RebateRow,
  'purchase_order' | 'client' | 'kam' | 'fulfillment_po' | 'top_up_po'
> & {
  purchase_order?: { po_number: string; total_amount: number } | { po_number: string; total_amount: number }[] | null;
  client?: { client_name: string } | { client_name: string }[] | null;
  kam?: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
  fulfillment_po?: { po_number: string } | { po_number: string }[] | null;
  top_up_po?: { po_number: string } | { po_number: string }[] | null;
};

function mapRebateRow(row: RebateQueryRow): RebateRow {
  return {
    ...row,
    purchase_order: unwrapRelation(row.purchase_order),
    client: unwrapRelation(row.client),
    kam: unwrapRelation(row.kam),
    fulfillment_po: unwrapRelation(row.fulfillment_po),
    top_up_po: unwrapRelation(row.top_up_po),
  };
}

function isOwnRebate(row: RebateRow, userId: string): boolean {
  return row.kam_id === userId || row.created_by === userId;
}

function isKamTeamRebate(
  row: RebateRow,
  assignedKamIds: Set<string>,
  isDirector: boolean
): boolean {
  if (!row.kam_id || row.kam?.role !== 'key_account_manager') return false;
  if (isDirector) return assignedKamIds.has(row.kam_id);
  return true;
}

type RebateLine = {
  id: string;
  disputed_quantity: number;
  line_total: number;
  variant?: { name: string; brand?: { name: string } | null } | null;
};

type RebateReplacement = {
  id: string;
  quantity: number;
  total_price: number;
  variant?: { name: string; brand?: { name: string } | null } | null;
};

type VariantQueryEmbed =
  | { name: string; brand?: { name: string } | { name: string }[] | null }
  | { name: string; brand?: { name: string } | { name: string }[] | null }[]
  | null
  | undefined;

function mapVariantEmbed(raw: VariantQueryEmbed): RebateLine['variant'] {
  const variant = unwrapRelation(raw);
  if (!variant) return null;
  return { name: variant.name, brand: unwrapRelation(variant.brand) };
}

function mapRebateLine(row: {
  id: string;
  disputed_quantity: number;
  line_total: number;
  variant?: VariantQueryEmbed;
}): RebateLine {
  return {
    id: row.id,
    disputed_quantity: row.disputed_quantity,
    line_total: row.line_total,
    variant: mapVariantEmbed(row.variant),
  };
}

function mapRebateReplacement(row: {
  id: string;
  quantity: number;
  total_price: number;
  variant?: VariantQueryEmbed;
}): RebateReplacement {
  return {
    id: row.id,
    quantity: row.quantity,
    total_price: row.total_price,
    variant: mapVariantEmbed(row.variant),
  };
}

const REBATES_PER_PAGE = 10;

type ResolutionFilter = 'all' | KeyAccountRebateResolutionType;
type ScopeFilter = 'all' | 'mine' | 'kam' | 'sales_director' | 'sales_head';

export function KeyAccountRebatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const role = user?.role;
  const isKAM = isKeyAccountManager(role);
  const isDirector = isKeyAccountDirector(role);
  const isSalesLead =
    isKeyAccountSalesAdmin(role) || isKeyAccountSalesHead(role) || isDirector;
  const showScopeFilter = isSalesLead;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RebateRow[]>([]);
  const [directorKamIds, setDirectorKamIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [resolutionFilter, setResolutionFilter] = useState<ResolutionFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<RebateRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lines, setLines] = useState<RebateLine[]>([]);
  const [replacements, setReplacements] = useState<RebateReplacement[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = !isKeyAccountAccounting(user?.role);

  const canApprove =
    isKeyAccountSalesAdmin(user?.role) ||
    isKeyAccountSalesHead(user?.role) ||
    isKeyAccountDirector(user?.role);

  useEffect(() => {
    if (!user?.id || !isDirector) {
      setDirectorKamIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('kam_director_assignments')
        .select('kam_id')
        .eq('director_id', user.id);
      if (error || cancelled) return;
      setDirectorKamIds(new Set((data ?? []).map((r: { kam_id: string }) => r.kam_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isDirector]);

  const fetchRows = useCallback(async () => {
    if (!user?.company_id || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = supabase
        .from('key_account_po_rebates')
        .select(`
          id,
          rebate_number,
          purchase_order_id,
          kam_id,
          created_by,
          status,
          resolution_type,
          reason_code,
          disputed_total,
          credit_amount,
          replacement_total,
          notes,
          rejection_reason,
          fulfillment_purchase_order_id,
          top_up_purchase_order_id,
          created_at,
          purchase_order:purchase_orders!key_account_po_rebates_purchase_order_id_fkey(po_number, total_amount),
          client:key_account_clients(client_name),
          kam:profiles!key_account_po_rebates_kam_id_fkey(full_name, role),
          fulfillment_po:purchase_orders!key_account_po_rebates_fulfillment_purchase_order_id_fkey(po_number),
          top_up_po:purchase_orders!key_account_po_rebates_top_up_purchase_order_id_fkey(po_number)
        `)
        .eq('company_id', user.company_id)
        .order('created_at', { ascending: false });

      if (isKAM) {
        query = query.or(`kam_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []).map((row) => mapRebateRow(row as RebateQueryRow)));
    } catch (e: unknown) {
      const message =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : e instanceof Error
            ? e.message
            : 'Failed to load';
      toast({
        variant: 'destructive',
        title: 'Error loading rebates',
        description: message,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.company_id, user?.id, isKAM, toast]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const rebateDateRange = useMemo(() => {
    return getDateRangeFromPreset(
      dateRangeFilter.preset,
      dateRangeFilter.customStart,
      dateRangeFilter.customEnd
    );
  }, [dateRangeFilter]);

  useEffect(() => {
    setPage(1);
  }, [q, rebateDateRange.start, rebateDateRange.end, resolutionFilter, scopeFilter]);

  const scopedRows = useMemo(() => {
    if (!showScopeFilter || !user?.id || scopeFilter === 'all') return rows;
    if (scopeFilter === 'mine') {
      return rows.filter((r) => isOwnRebate(r, user.id));
    }
    if (scopeFilter === 'kam') {
      return rows.filter((r) => isKamTeamRebate(r, directorKamIds, isDirector));
    }
    if (scopeFilter === 'sales_director') {
      return rows.filter((r) => r.kam?.role === 'sales_director');
    }
    if (scopeFilter === 'sales_head') {
      return rows.filter((r) => r.kam?.role === 'sales_head');
    }
    return rows;
  }, [rows, showScopeFilter, user?.id, scopeFilter, directorKamIds, isDirector]);

  const showKamColumn = showScopeFilter && scopeFilter !== 'mine';

  const ownerColumnLabel = useMemo(() => {
    if (scopeFilter === 'kam') return 'KAM';
    if (scopeFilter === 'sales_director') return 'Director';
    if (scopeFilter === 'sales_head') return 'Sales Head';
    return 'Owner';
  }, [scopeFilter]);

  const listTitle = useMemo(() => {
    if (isKAM) return 'My rebates';
    if (!showScopeFilter) return 'All rebates';
    if (scopeFilter === 'mine') return 'My rebates';
    if (scopeFilter === 'kam') return 'KAM rebates';
    if (scopeFilter === 'sales_director') return 'Sales Director rebates';
    if (scopeFilter === 'sales_head') return 'Sales Head rebates';
    return 'All rebates';
  }, [isKAM, showScopeFilter, scopeFilter]);

  const filtered = useMemo(() => {
    const dateFiltered = scopedRows.filter((r) =>
      isDateInRange(new Date(r.created_at), rebateDateRange.start, rebateDateRange.end)
    );
    const resolutionFiltered =
      resolutionFilter === 'all'
        ? dateFiltered
        : dateFiltered.filter((r) => r.resolution_type === resolutionFilter);
    const term = q.trim().toLowerCase();
    if (!term) return resolutionFiltered;
    return resolutionFiltered.filter((r) => {
      const poNum = r.purchase_order?.po_number?.toLowerCase() || '';
      const client = r.client?.client_name?.toLowerCase() || '';
      const kamName = r.kam?.full_name?.toLowerCase() || '';
      return (
        r.rebate_number.toLowerCase().includes(term) ||
        poNum.includes(term) ||
        client.includes(term) ||
        kamName.includes(term)
      );
    });
  }, [scopedRows, q, rebateDateRange.end, rebateDateRange.start, resolutionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / REBATES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const paginatedRows = useMemo(
    () =>
      filtered.slice(
        (currentPage - 1) * REBATES_PER_PAGE,
        currentPage * REBATES_PER_PAGE
      ),
    [filtered, currentPage]
  );

  const openDetail = async (row: RebateRow) => {
    setActive(row);
    setDetailOpen(true);
    setDetailLoading(true);
    setLines([]);
    setReplacements([]);
    try {
      const [linesRes, repRes] = await Promise.all([
        supabase
          .from('key_account_po_rebate_lines')
          .select('id, disputed_quantity, line_total, variant:variants(name, brand:brands(name))')
          .eq('rebate_id', row.id),
        supabase
          .from('key_account_po_rebate_replacements')
          .select('id, quantity, total_price, variant:variants(name, brand:brands(name))')
          .eq('rebate_id', row.id),
      ]);
      if (linesRes.error) throw linesRes.error;
      if (repRes.error) throw repRes.error;
      setLines((linesRes.data ?? []).map(mapRebateLine));
      setReplacements((repRes.data ?? []).map(mapRebateReplacement));
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error loading details',
        description: e instanceof Error ? e.message : 'Failed',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const approveRebate = async (rebateId: string) => {
    setActingId(rebateId);
    try {
      const { data, error } = await supabase.rpc('approve_and_execute_key_account_rebate', {
        p_rebate_id: rebateId,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Approval failed');
      toast({
        title: 'Rebate executed',
        description: data.fulfillment_po_number
          ? `${data.rebate_number} — fulfillment PO ${data.fulfillment_po_number} sent to warehouse.`
          : `${data.rebate_number} — credit recorded.`,
      });
      setDetailOpen(false);
      await fetchRows();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Approval failed',
        description: e instanceof Error ? e.message : 'Failed',
      });
    } finally {
      setActingId(null);
    }
  };

  const rejectRebate = async (rebateId: string) => {
    setActingId(rebateId);
    try {
      const { data, error } = await supabase.rpc('reject_key_account_rebate', {
        p_rebate_id: rebateId,
        p_reason: 'Rejected from rebates list',
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Reject failed');
      toast({ title: 'Rebate rejected', description: data.rebate_number });
      setDetailOpen(false);
      await fetchRows();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Reject failed',
        description: e instanceof Error ? e.message : 'Failed',
      });
    } finally {
      setActingId(null);
    }
  };

  const variantLabel = (v?: RebateLine['variant']) => {
    if (!v) return '—';
    const brand = v.brand?.name;
    return brand ? `${brand} — ${v.name}` : v.name;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Rebates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Post-delivery credits and replacement orders linked to Key Account POs.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create rebate
          </Button>
        )}
      </div>

      <SelectDeliveredPoForRebateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{listTitle}</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center">
              <Input
                placeholder="Search rebate #, PO, client…"
                className="w-full sm:w-[280px]"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {showScopeFilter && (
                <Select
                  value={scopeFilter}
                  onValueChange={(v) => setScopeFilter(v as ScopeFilter)}
                >
                  <SelectTrigger className="w-full sm:w-[220px] h-10 shrink-0">
                    <SelectValue placeholder="All rebates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rebates</SelectItem>
                    <SelectItem value="mine">My rebates</SelectItem>
                    <SelectItem value="kam">KAM rebates</SelectItem>
                    <SelectItem value="sales_director">Sales Director rebates</SelectItem>
                    <SelectItem value="sales_head">Sales Head rebates</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select
                value={resolutionFilter}
                onValueChange={(v) => setResolutionFilter(v as ResolutionFilter)}
              >
                <SelectTrigger className="w-full sm:w-[240px] h-10 shrink-0">
                  <SelectValue placeholder="All resolutions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resolutions</SelectItem>
                  {REBATE_RESOLUTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangeFilterPopover
                value={dateRangeFilter}
                onChange={setDateRangeFilter}
                triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
                align="end"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {scopedRows.length === 0
                ? `No rebates yet.${canCreate ? ' Click Create rebate and choose a delivered PO.' : ''}`
                : 'No rebates match your search, scope, resolution, or date range.'}
            </p>
          ) : (
            <>
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rebate #</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>PO</TableHead>
                      <TableHead>Client</TableHead>
                      {showKamColumn && <TableHead>{ownerColumnLabel}</TableHead>}
                      <TableHead>Resolution</TableHead>
                      <TableHead className="text-right">Disputed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.rebate_number}</TableCell>
                        <TableCell>
                          {row.created_at
                            ? new Date(row.created_at).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell>{row.purchase_order?.po_number ?? '—'}</TableCell>
                        <TableCell>{row.client?.client_name ?? '—'}</TableCell>
                        {showKamColumn && (
                          <TableCell>{row.kam?.full_name ?? '—'}</TableCell>
                        )}
                        <TableCell>{rebateResolutionLabel(row.resolution_type)}</TableCell>
                        <TableCell className="text-right">
                          {formatRebateCurrency(row.disputed_total)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={rebateStatusBadgeClass(row.status)}>
                            {rebateStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => void openDetail(row)}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {filtered.length > REBATES_PER_PAGE && (
                <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                  <div className="text-xs text-muted-foreground">
                    Showing{' '}
                    <span className="font-medium">
                      {(currentPage - 1) * REBATES_PER_PAGE + 1}-
                      {Math.min(currentPage * REBATES_PER_PAGE, filtered.length)}
                    </span>{' '}
                    of <span className="font-medium">{filtered.length}</span> rebates
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.rebate_number ?? 'Rebate'}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={rebateStatusBadgeClass(active.status)}>
                  {rebateStatusLabel(active.status)}
                </Badge>
                <Badge variant="secondary">{rebateReasonLabel(active.reason_code)}</Badge>
                <Badge variant="secondary">{rebateResolutionLabel(active.resolution_type)}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Source PO: </span>
                  {active.purchase_order?.po_number}
                </div>
                <div>
                  <span className="text-muted-foreground">Client: </span>
                  {active.client?.client_name ?? '—'}
                </div>
                {active.kam?.full_name && (
                  <div>
                    <span className="text-muted-foreground">KAM: </span>
                    {active.kam.full_name}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Disputed: </span>
                  {formatRebateCurrency(active.disputed_total)}
                </div>
                <div>
                  <span className="text-muted-foreground">Credit: </span>
                  {formatRebateCurrency(active.credit_amount)}
                </div>
                <div>
                  <span className="text-muted-foreground">Replacement: </span>
                  {formatRebateCurrency(active.replacement_total)}
                </div>
                {active.fulfillment_po?.po_number && (
                  <div>
                    <span className="text-muted-foreground">Fulfillment PO: </span>
                    {active.fulfillment_po.po_number}
                  </div>
                )}
                {active.top_up_po?.po_number && (
                  <div>
                    <span className="text-muted-foreground">Top-up PO: </span>
                    {active.top_up_po.po_number}
                  </div>
                )}
              </div>
              {active.notes && <p className="text-muted-foreground border-l-2 pl-3">{active.notes}</p>}
              {active.rejection_reason && (
                <p className="text-destructive text-sm">Rejected: {active.rejection_reason}</p>
              )}

              {detailLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <div>
                    <h4 className="font-medium mb-2">Disputed lines</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell>{variantLabel(l.variant)}</TableCell>
                            <TableCell className="text-right">{l.disputed_quantity}</TableCell>
                            <TableCell className="text-right">{formatRebateCurrency(l.line_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {replacements.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Replacement items</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {replacements.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>{variantLabel(r.variant)}</TableCell>
                              <TableCell className="text-right">{r.quantity}</TableCell>
                              <TableCell className="text-right">{formatRebateCurrency(r.total_price)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}

              {canApprove && active.status === 'submitted' && (
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    disabled={actingId === active.id}
                    onClick={() => void rejectRebate(active.id)}
                  >
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button disabled={actingId === active.id} onClick={() => void approveRebate(active.id)}>
                    {actingId === active.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Approve & execute
                  </Button>
                </div>
              )}

              {active.status === 'executed' && active.fulfillment_purchase_order_id && (
                <p className="text-xs text-muted-foreground">
                  Warehouse can fulfill the replacement PO from Purchase Orders → Key Accounts tab.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
