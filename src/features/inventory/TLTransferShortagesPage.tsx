import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, PackageSearch, Printer, Search } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import {
  TL_TRANSFER_RESOLUTION_OPTIONS,
  tlShortageStatusLabel,
} from './tl-stock-transfer/tlStockTransferShared';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { exportTlShortageInvestigationPdf } from './tl-stock-transfer/exportTlTransferPdfs';
import {
  fetchTlTransferShortages,
  refreshTlTransferLists,
  resolveTlStockDiscrepancy,
  type TlShortageRow,
} from '@/store/slices/motosales/tl-stock-transfers';
import { useTlTransferRealtime } from './tl-stock-transfer/useTlTransferRealtime';
import type {
  TLDiscrepancyResolution,
  TLReceiveShortfallReason,
} from '@/types/tlStockRequests.types';

type ShortageRow = TlShortageRow & {
  reason: TLReceiveShortfallReason;
};

type ShortageGroup = {
  key: string;
  request_number: string;
  tdr_number: string;
  requester_name: string;
  created_at: string;
  lines: ShortageRow[];
  openLines: ShortageRow[];
};

function groupShortages(rows: ShortageRow[]): ShortageGroup[] {
  const groups = new Map<string, ShortageGroup>();
  for (const row of rows) {
    const key = row.request_id || row.request_number;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        request_number: row.request_number,
        tdr_number: row.tdr_number,
        requester_name: row.requester_name,
        created_at: row.created_at,
        lines: [],
        openLines: [],
      };
      groups.set(key, group);
    }
    group.lines.push(row);
    if (row.status === 'open') group.openLines.push(row);
    if (row.created_at < group.created_at) group.created_at = row.created_at;
  }
  return Array.from(groups.values());
}

function formatReportedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function unitLabel(quantity: number) {
  return `${quantity} unit${quantity === 1 ? '' : 's'}`;
}

export default function TLTransferShortagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>(() =>
    searchParams.get('status') === 'all' ? 'all' : 'open'
  );
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [resolveLines, setResolveLines] = useState<ShortageRow[]>([]);
  const [resolution, setResolution] = useState<TLDiscrepancyResolution | null>(null);
  const [foundChoice, setFoundChoice] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const canUsePage =
    isAdmin || (user?.role === 'team_leader' && hasWarehouseHubLink === true);

  useTlTransferRealtime({
    enabled: canUsePage && !!user?.company_id,
    companyId: user?.company_id,
    channelKey: 'shortages',
    lists: isAdmin ? ['shortages', 'admin'] : ['shortages'],
  });

  const rows = useAppSelector((state) => state.motoSalesTlTransfers.shortages) as ShortageRow[];
  const shortagesStatus = useAppSelector((state) => state.motoSalesTlTransfers.shortagesStatus);
  const error = useAppSelector((state) => state.motoSalesTlTransfers.shortagesError);
  const isLoading = shortagesStatus === 'idle' || shortagesStatus === 'loading';

  useEffect(() => {
    if (!user?.company_id || !canUsePage) return;
    void dispatch(fetchTlTransferShortages());
  }, [dispatch, user?.company_id, canUsePage]);

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

  const groups = useMemo(() => groupShortages(filteredRows), [filteredRows]);

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [statusFilter, searchQuery, dateRangeFilter, pageSize]);

  const { pageCount, safePage, pagedItems: pagedGroups } = useMemo(
    () => getListPaginationSlice(groups, page, pageSize),
    [groups, page, pageSize]
  );

  const closeResolve = () => {
    setResolveLines([]);
    setResolution(null);
    setFoundChoice(false);
    setNotes('');
  };

  const linesForAction = (group: ShortageGroup) => {
    const picked = group.openLines.filter((line) => selectedIds.has(line.id));
    return picked.length > 0 ? picked : group.openLines;
  };

  const openFound = (lines: ShortageRow[]) => {
    if (lines.length === 0) return;
    setResolveLines(lines);
    setResolution(null);
    setFoundChoice(true);
    setNotes('');
  };

  const openResolve = (lines: ShortageRow[], next: TLDiscrepancyResolution) => {
    if (lines.length === 0) return;
    setResolveLines(lines);
    setResolution(next);
    setFoundChoice(false);
    setNotes('');
  };

  const toggleLine = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const printTransfer = (group: ShortageGroup) => {
    const requestId = group.lines[0]?.request_id;
    const lines = (requestId ? rows.filter((row) => row.request_id === requestId) : group.lines).slice();
    const header = lines[0] ?? group.lines[0];
    if (!header) return;
    setPrintingId(group.key);
    try {
      exportTlShortageInvestigationPdf({
        requestNumber: header.request_number,
        tdrNumber: header.tdr_number,
        requesterName: header.requester_name,
        sourceName: header.source_name,
        reportedAt: lines.reduce(
          (earliest, line) => (line.created_at < earliest ? line.created_at : earliest),
          header.created_at
        ),
        lines: lines.map((line) => {
          const open = line.status === 'open';
          return {
            item: `${line.brand_name} · ${line.variant_name}`,
            quantity: Number(line.quantity || 0),
            reason: formatShortfallReasonLabel(line.reason),
            reportNotes: line.reporter_notes,
            result: open ? 'Open' : 'Resolved',
            choice: open ? '—' : tlShortageStatusLabel(line.status),
            resolutionNotes: line.resolution_notes,
          };
        }),
      });
    } catch (err: any) {
      toast({
        title: 'Could not print investigation',
        description: err?.message || 'Failed to open the print view.',
        variant: 'destructive',
      });
    } finally {
      setPrintingId(null);
    }
  };

  const toggleGroup = (group: ShortageGroup, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const line of group.openLines) {
        if (checked) next.add(line.id);
        else next.delete(line.id);
      }
      return next;
    });
  };

  const handleResolve = async (next: TLDiscrepancyResolution) => {
    if (resolveLines.length === 0) return;
    setSaving(true);
    let failed: string | null = null;
    const done: string[] = [];
    try {
      for (const line of resolveLines) {
        try {
          await dispatch(
            resolveTlStockDiscrepancy({
              discrepancy_id: line.id,
              resolution: next,
              notes: notes || null,
            })
          ).unwrap();
          done.push(line.id);
        } catch (err: any) {
          failed = err?.message || 'Failed to resolve shortage';
          break;
        }
      }
      if (done.length > 0) {
        setSelectedIds((current) => {
          const nextIds = new Set(current);
          for (const id of done) nextIds.delete(id);
          return nextIds;
        });
        void refreshTlTransferLists(dispatch, {
          lists: isAdmin ? ['shortages', 'admin'] : ['shortages'],
        });
      }
      if (failed) {
        toast({
          title: done.length > 0 ? 'Some items were not updated' : 'Could not resolve',
          description: failed,
          variant: 'destructive',
        });
        if (done.length > 0) closeResolve();
        return;
      }
      const count = resolveLines.length;
      toast({
        title: count === 1 ? 'Shortage updated' : `${count} shortages updated`,
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
            Back to my transfer request
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
                {String(error).includes('tl_stock_request_discrepancies')
                  ? 'Apply migration 20260909160000_tl_stock_transfer_dispatch_receive_shortages.sql to enable this queue.'
                  : error}
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
              {groups.some((group) => group.openLines.length > 1) ? (
                <p className="text-xs text-muted-foreground">
                  Each transfer is one group. Found, Replace, and Write off apply to every open
                  item, or only the items you check.
                </p>
              ) : null}
              {pagedGroups.map((group) => {
                const openIds = group.openLines.map((line) => line.id);
                const selectedInGroup = openIds.filter((id) => selectedIds.has(id));
                const allOpenSelected =
                  openIds.length > 1 && selectedInGroup.length === openIds.length;
                const someOpenSelected =
                  selectedInGroup.length > 0 && selectedInGroup.length < openIds.length;
                const actionLines = linesForAction(group);
                const countSuffix =
                  selectedInGroup.length > 0 && selectedInGroup.length < group.openLines.length
                    ? ` (${selectedInGroup.length})`
                    : '';
                const openQty = group.openLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
                const resolvedCount = group.lines.length - group.openLines.length;
                const summary =
                  group.openLines.length === 0
                    ? 'Resolved'
                    : resolvedCount > 0
                      ? `${group.openLines.length} open · ${resolvedCount} resolved`
                      : `${group.openLines.length} open · ${unitLabel(openQty)}`;

                return (
                  <div key={group.key} className="rounded-lg border overflow-hidden">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between bg-muted/30 px-3 py-3 border-b">
                      <div className="flex items-start gap-3 min-w-0">
                        {group.openLines.length > 1 ? (
                          <Checkbox
                            className="mt-1"
                            checked={allOpenSelected ? true : someOpenSelected ? 'indeterminate' : false}
                            onCheckedChange={(value) => toggleGroup(group, value === true)}
                            aria-label={`Select open items in ${group.request_number}`}
                          />
                        ) : (
                          <div className="w-4 shrink-0" />
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{group.request_number}</span>
                            <span className="font-mono text-sm text-muted-foreground">
                              {group.tdr_number || 'No TDR'}
                            </span>
                            <Badge variant={group.openLines.length > 0 ? 'secondary' : 'outline'}>
                              {summary}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{group.requester_name || 'Unknown requester'}</span>
                            <span>Reported {formatReportedAt(group.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void printTransfer(group)}
                          disabled={printingId === group.key}
                        >
                          {printingId === group.key ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Printer className="mr-1 h-4 w-4" />
                          )}
                          Print
                        </Button>
                        {group.openLines.length > 0 ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openFound(actionLines)}
                            >
                              Found{countSuffix}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openResolve(actionLines, 'write_off_replace')}
                            >
                              Replace{countSuffix}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openResolve(actionLines, 'write_off')}
                            >
                              Write off{countSuffix}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="divide-y">
                      {group.lines.map((line) => {
                        const isOpen = line.status === 'open';
                        const canPick = isOpen && group.openLines.length > 1;
                        return (
                          <div
                            key={line.id}
                            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2.5 text-sm"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              {canPick ? (
                                <Checkbox
                                  className="mt-0.5"
                                  checked={selectedIds.has(line.id)}
                                  onCheckedChange={(value) => toggleLine(line.id, value === true)}
                                  aria-label={`Select ${line.brand_name} ${line.variant_name}`}
                                />
                              ) : (
                                <div className="w-4 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <div className="font-medium">
                                  {line.brand_name} · {line.variant_name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatShortfallReasonLabel(line.reason, line.reporter_notes)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 sm:justify-end pl-7 sm:pl-0 shrink-0">
                              <span className="font-semibold tabular-nums">{line.quantity}</span>
                              <Badge variant={isOpen ? 'secondary' : 'outline'}>
                                {tlShortageStatusLabel(line.status)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={setPageSize}
                onPrevious={() => setPage(Math.max(0, safePage - 1))}
                onNext={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                rowsPerPageLabel="Transfers per page"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={resolveLines.length > 0}
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
          {resolveLines.length > 0 ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Transfer</span>{' '}
                <span className="font-medium">{resolveLines[0].request_number}</span>
                {' · '}
                {resolveLines.length === 1
                  ? unitLabel(Number(resolveLines[0].quantity || 0))
                  : `${resolveLines.length} items · ${unitLabel(
                      resolveLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
                    )}`}
              </p>
              <ul className="rounded-md border divide-y">
                {resolveLines.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      {line.brand_name} · {line.variant_name}
                    </span>
                    <span className="tabular-nums font-medium">{line.quantity}</span>
                  </li>
                ))}
              </ul>
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
