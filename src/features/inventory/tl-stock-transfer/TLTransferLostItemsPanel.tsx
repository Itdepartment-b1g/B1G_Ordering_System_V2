import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Loader2, PackageX, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { formatShortfallReasonLabel } from '@/features/orders/deliveryDiscrepancyShared';
import { TL_REQUEST_SELECT, mapTlTransferRows } from './tlStockTransferShared';
import type { TlTransferDateRange } from './tlStockTransferListHelpers';
import { TLTransferHistoryDialog } from './TLTransferHistoryDialog';
import { exportTlLostItemsPdf } from './exportTlTransferPdfs';
import {
  fetchTlTransferLostLines,
  filterTlLostItemGroups,
  groupTlLostItems,
  lostItemLabel,
  lostLineStatusLabel,
  TL_LOST_ITEM_QUERY_KEY,
  type TlLostItemGroup,
  type TlLostTransferLine,
} from './tlTransferLostItems';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';

type Props = {
  searchQuery: string;
  dateRange: TlTransferDateRange;
  dateRangeLabel: string;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
};

function dateRangeBoundsLabel(dateRange: TlTransferDateRange): string | null {
  if (!dateRange.start && !dateRange.end) return null;
  const start = dateRange.start
    ? dateRange.start.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '…';
  const end = dateRange.end
    ? dateRange.end.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '…';
  return `${start} – ${end}`;
}

function toLostItemsPdfSkus(groups: TlLostItemGroup[]) {
  return groups.map((group) => ({
    label: lostItemLabel(group),
    variantType: group.variantType,
    missingQuantity: group.missingQuantity,
    lostQuantity: group.lostQuantity,
    transferCount: group.transferCount,
    lastAt: group.lastAt,
    lines: group.transfers.map((line) => ({
      requestNumber: line.requestNumber,
      tdrNumber: line.tdrNumber,
      quantity: line.quantity,
      statusLabel: lostLineStatusLabel(line.status),
      reason: formatShortfallReasonLabel(line.reason, line.reporterNotes),
      sourceName: line.sourceName,
      requesterName: line.requesterName,
      createdAt: line.createdAt,
    })),
  }));
}
function lostStatusBadgeClass(status: string) {
  switch (status) {
    case 'open':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    case 'resolved_write_off_replace':
      return 'border-orange-200 bg-orange-50 text-orange-900';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-900';
  }
}

export function TLTransferLostItemsPanel({
  searchQuery,
  dateRange,
  dateRangeLabel,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState<TlLostItemGroup | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLines, setHistoryLines] = useState<TLRequestWithDetails[]>([]);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  const printReport = (groupsToPrint: TlLostItemGroup[]) => {
    try {
      exportTlLostItemsPdf({
        preparedBy: user?.full_name || '—',
        dateRangeLabel,
        dateRangeBounds: dateRangeBoundsLabel(dateRange),
        searchQuery,
        printedAt: new Date().toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }),
        skus: toLostItemsPdfSkus(groupsToPrint),
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not print report',
        description: err instanceof Error ? err.message : 'Failed to open the print view.',
        variant: 'destructive',
      });
    }
  };

  const { data: lines = [], isLoading, error } = useQuery({
    queryKey: [TL_LOST_ITEM_QUERY_KEY, user?.company_id, user?.id],
    enabled: !!user?.company_id && !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: () =>
      fetchTlTransferLostLines({
        companyId: user!.company_id!,
        userId: user!.id,
      }),
  });

  const groups = useMemo(() => groupTlLostItems(lines), [lines]);
  const filtered = useMemo(
    () => filterTlLostItemGroups(groups, searchQuery, dateRange),
    [groups, searchQuery, dateRange]
  );
  const pagination = useMemo(
    () => getListPaginationSlice(filtered, page, pageSize),
    [filtered, page, pageSize]
  );

  const openHistory = async (line: TlLostTransferLine) => {
    setHistoryLoadingId(line.requestId);
    try {
      const { data, error: fetchError } = await supabase
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('id', line.requestId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const mapped = mapTlTransferRows(data ? [data] : []);
      if (mapped.length === 0) {
        throw new Error('Transfer not found.');
      }
      setHistoryLines(mapped);
      setHistoryOpen(true);
    } catch (err: unknown) {
      toast({
        title: 'Could not open history',
        description: err instanceof Error ? err.message : 'Failed to load that transfer.',
        variant: 'destructive',
      });
    } finally {
      setHistoryLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading missing and lost items...
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {(error as Error).message || 'Could not load missing and lost items.'}
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <PackageX className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p>No missing or lost transfer items</p>
        <p className="mt-1 text-sm">
          Items show here after a receive is short — still investigating, written off, or replaced.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No missing or lost items match this search or date range.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Report uses the date filter above{searchQuery.trim() ? ' and the current search' : ''}.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => printReport(filtered)}>
          <Printer className="mr-2 h-4 w-4" />
          Print report
        </Button>
      </div>
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-center">
                Missing
                <span className="block font-normal text-[11px] text-muted-foreground">
                  (under investigation)
                </span>
              </TableHead>
              <TableHead className="text-center">Lost</TableHead>
              <TableHead className="text-center">Transfers</TableHead>
              <TableHead>Last reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pagedItems.map((group) => (
              <TableRow
                key={group.variantId}
                className="cursor-pointer hover:bg-muted/50"
                title="View transfer numbers"
                onClick={() => setSelected(group)}
              >
                <TableCell>
                  <p className="font-medium">{lostItemLabel(group)}</p>
                  {group.variantType ? (
                    <p className="text-sm text-muted-foreground">{group.variantType}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {group.missingQuantity > 0 ? group.missingQuantity : '—'}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {group.lostQuantity > 0 ? group.lostQuantity : '—'}
                </TableCell>
                <TableCell className="text-center tabular-nums">{group.transferCount}</TableCell>
                <TableCell>{new Date(group.lastAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        pageSize={pageSize}
        safePage={pagination.safePage}
        pageCount={pagination.pageCount}
        onPageSizeChange={onPageSizeChange}
        onPrevious={() => onPageChange(Math.max(0, pagination.safePage - 1))}
        onNext={() =>
          onPageChange(Math.min(pagination.pageCount - 1, pagination.safePage + 1))
        }
      />

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? lostItemLabel(selected) : 'Transfers'}</DialogTitle>
            <DialogDescription>
              Transfer numbers where this SKU was missing or written off.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {selected.missingQuantity > 0 ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                    Missing {selected.missingQuantity}
                  </Badge>
                ) : null}
                {selected.lostQuantity > 0 ? (
                  <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-900">
                    Lost {selected.lostQuantity}
                  </Badge>
                ) : null}
              </div>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Transfer #</TableHead>
                      <TableHead className="whitespace-nowrap">TDR</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="min-w-[14rem] whitespace-nowrap">Status</TableHead>
                      <TableHead className="min-w-[10rem]">From / To</TableHead>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.transfers.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {line.requestNumber || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {line.tdrNumber || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`${lostStatusBadgeClass(line.status)} whitespace-nowrap`}
                          >
                            {lostLineStatusLabel(line.status)}
                          </Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatShortfallReasonLabel(line.reason, line.reporterNotes)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{line.sourceName || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            to {line.requesterName || '—'}
                          </p>
                        </TableCell>
                        <TableCell>{new Date(line.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Transfer history"
                            disabled={historyLoadingId === line.requestId}
                            onClick={() => void openHistory(line)}
                          >
                            {historyLoadingId === line.requestId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <History className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => selected && printReport([selected])}>
              <Printer className="mr-2 h-4 w-4" />
              Print this item
            </Button>
            <Button type="button" variant="outline" onClick={() => setSelected(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TLTransferHistoryDialog
        open={historyOpen}
        lines={historyLines}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) setHistoryLines([]);
        }}
      />
    </div>
  );
}
