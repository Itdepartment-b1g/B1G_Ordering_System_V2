import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  MoreVertical,
  Printer,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { exportMainInventoryReturnPdf } from './utils/exportMainInventoryReturnPdf';

type ReturnStatus = 'pending' | 'approved' | 'rejected';

type ReturnLine = {
  variantId: string;
  quantity: number;
  variantName: string;
  variantType: string | null;
  brandName: string;
};

type MyReturn = {
  id: string;
  returnedTo: string;
  returnedAt: string;
  status: ReturnStatus;
  reason: string;
  rejectionReason: string | null;
  variantCount: number;
  totalQuantity: number;
  lines: ReturnLine[];
};

function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  const key = type?.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function lineLabel(line: ReturnLine): string {
  const brand = line.brandName?.trim();
  const variant = line.variantName?.trim() || 'Item';
  const type = variantTypeLabel(line.variantType);
  const name = brand && brand !== 'Unknown' ? `${brand} — ${variant}` : variant;
  return type ? `${name} (${type})` : name;
}

function compareLines(a: ReturnLine, b: ReturnLine): number {
  const brandCmp = a.brandName.localeCompare(b.brandName, undefined, { sensitivity: 'base' });
  if (brandCmp !== 0) return brandCmp;
  const variantCmp = a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' });
  if (variantCmp !== 0) return variantCmp;
  return (a.variantType || '').localeCompare(b.variantType || '', undefined, { sensitivity: 'base' });
}

function statusLabel(status: ReturnStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

function statusBadge(status: ReturnStatus) {
  const label = statusLabel(status);
  if (status === 'approved') return <Badge>{label}</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

function BrandReturnTables({ lines }: { lines: ReturnLine[] }) {
  const brands = useMemo(() => {
    const map = new Map<string, ReturnLine[]>();
    lines.forEach((line) => {
      const name = line.brandName?.trim() || 'Unknown brand';
      const list = map.get(name) ?? [];
      list.push(line);
      map.set(name, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);

  return (
    <div className="space-y-4">
      {brands.map(([brandName, brandLines]) => (
        <div key={brandName} className="overflow-hidden rounded-md border bg-white">
          <div className="border-b bg-muted/40 px-4 py-2.5 font-semibold">{brandName}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brandLines.map((line) => {
                const label = variantTypeLabel(line.variantType);
                return (
                  <TableRow key={line.variantId}>
                    <TableCell className="break-words">{line.variantName}</TableCell>
                    <TableCell>
                      {label ? (
                        <Badge variant="outline" className={`text-[10px] ${variantTypeBadgeClass(line.variantType)}`}>
                          {label}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.quantity.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

function ReturnDetails({ row }: { row: MyReturn }) {
  return (
    <div>
      <p className="mb-3 text-sm">
        <span className="font-medium">Reason of returned:</span>{' '}
        <span className="text-muted-foreground">{row.reason || '—'}</span>
      </p>
      {row.status === 'rejected' && row.rejectionReason && (
        <p className="mb-3 text-sm">
          <span className="font-medium">Rejection reason:</span>{' '}
          <span className="text-muted-foreground">{row.rejectionReason}</span>
        </p>
      )}
      <BrandReturnTables lines={row.lines} />
    </div>
  );
}

function ReturnRowActions({
  row,
  onView,
  onPrint,
  showView = false,
}: {
  row: MyReturn;
  onView?: (row: MyReturn) => void;
  onPrint: (row: MyReturn) => void;
  showView?: boolean;
}) {
  return (
    <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Return actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {showView && onView && (
            <DropdownMenuItem onClick={() => onView(row)}>
              <Eye className="mr-2 h-4 w-4" />
              View details
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onPrint(row)}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function MobileSalesReturnHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [statusTab, setStatusTab] = useState<'all' | 'pending' | 'approved'>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailRow, setDetailRow] = useState<MyReturn | null>(null);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['mobile-sales-return-history', user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_returns')
        .select(`
          id,
          return_reason,
          reason_notes,
          rejection_reason,
          created_at,
          status,
          receiver:profiles!inventory_returns_receiver_id_fkey(full_name)
        `)
        .eq('agent_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast({ title: 'Error', description: 'Failed to load return history', variant: 'destructive' });
        throw error;
      }
      if (!data?.length) return [];

      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory_return_items')
        .select(`
          return_id,
          variant_id,
          quantity,
          variant:variants(name, variant_type, brand:brands(name))
        `)
        .in('return_id', data.map((row) => row.id));

      if (itemsError) throw itemsError;

      const linesByReturn = new Map<string, ReturnLine[]>();
      (itemsData || []).forEach((row) => {
        const variant = Array.isArray(row.variant) ? row.variant[0] : row.variant;
        const brand = variant?.brand
          ? Array.isArray(variant.brand) ? variant.brand[0] : variant.brand
          : null;
        const list = linesByReturn.get(row.return_id) ?? [];
        list.push({
          variantId: row.variant_id,
          quantity: Number(row.quantity) || 0,
          variantName: variant?.name || 'Unknown',
          variantType: variant?.variant_type || null,
          brandName: brand?.name || 'Unknown',
        });
        linesByReturn.set(row.return_id, list);
      });

      return data.map((row) => {
        const receiver = Array.isArray(row.receiver) ? row.receiver[0] : row.receiver;
        const lines = (linesByReturn.get(row.id) ?? []).sort(compareLines);
        const reason = [row.return_reason, row.reason_notes].map((part) => part?.trim()).filter(Boolean).join(' — ');
        const status: ReturnStatus =
          row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending';
        return {
          id: row.id,
          returnedTo: receiver?.full_name || 'Team Leader',
          returnedAt: row.created_at,
          status,
          reason,
          rejectionReason: row.rejection_reason,
          variantCount: lines.length,
          totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
          lines,
        } satisfies MyReturn;
      });
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`mobile-sales-return-history-${user.id}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'inventory_returns',
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['mobile-sales-return-history', user.id] });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const dateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const visible = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return returns.filter((row) => {
      if (statusTab === 'pending' && row.status !== 'pending') return false;
      if (statusTab === 'approved' && row.status !== 'approved') return false;
      if (!isDateInRange(row.returnedAt, dateRange.start, dateRange.end)) return false;
      if (!query) return true;
      return (
        row.returnedTo.toLowerCase().includes(query) ||
        row.reason.toLowerCase().includes(query) ||
        statusLabel(row.status).toLowerCase().includes(query) ||
        row.lines.some(
          (line) =>
            line.brandName.toLowerCase().includes(query) ||
            line.variantName.toLowerCase().includes(query)
        )
      );
    });
  }, [returns, searchQuery, dateRange.start, dateRange.end, statusTab]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, dateRange.start, dateRange.end, pageSize, statusTab]);

  const { pageCount, safePage, pagedItems } = getListPaginationSlice(visible, page, pageSize);

  const returnedByName = user?.full_name?.trim() || 'You';

  const printReturn = (row: MyReturn) => {
    exportMainInventoryReturnPdf({
      returnedBy: user?.full_name || 'Mobile Sales',
      returnedTo: row.returnedTo,
      returnedAt: row.returnedAt,
      status: statusLabel(row.status),
      reason: row.reason,
      lines: row.lines.map((line) => ({
        brandName: line.brandName,
        variantName: line.variantName,
        variantType: line.variantType,
        quantity: line.quantity,
      })),
    });
  };

  const emptyLabel =
    statusTab === 'pending'
      ? 'No pending returns'
      : statusTab === 'approved'
        ? 'No approved returns'
        : 'No returns found';

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Returns to Team Leader</h1>
          <p className="mt-1 text-sm text-muted-foreground">Stock you returned to your team leader</p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/my-inventory">Back to My Inventory</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search team leader, brand, or variant…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <DateRangeFilterPopover
          value={dateRangeFilter}
          onChange={setDateRangeFilter}
          triggerClassName="h-10 w-full shrink-0 justify-between sm:w-[220px]"
          align="end"
        />
      </div>

      <Tabs
        value={statusTab}
        onValueChange={(value) => setStatusTab(value as 'all' | 'pending' | 'approved')}
      >
        <TabsList className="grid h-auto w-full grid-cols-3">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Return history
          </CardTitle>
          <CardDescription>Each return you sent to your team leader.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pagedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <RotateCcw className="mb-3 h-10 w-10 opacity-40" />
              <p className="font-medium text-foreground">{emptyLabel}</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Returned by</TableHead>
                      <TableHead>Returned to</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => {
                      const open = openId === row.id;
                      return (
                        <Fragment key={row.id}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setOpenId(open ? null : row.id)}
                          >
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={open ? 'Collapse return' : 'Expand return'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenId(open ? null : row.id);
                                }}
                              >
                                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </Button>
                            </TableCell>
                            <TableCell className="font-medium">{returnedByName}</TableCell>
                            <TableCell>{row.returnedTo}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {row.totalQuantity.toLocaleString()}
                            </TableCell>
                            <TableCell>{statusBadge(row.status)}</TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={row.reason || undefined}>
                              {row.reason.trim() || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <ReturnRowActions row={row} onPrint={printReturn} />
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={8} className="p-4">
                                <ReturnDetails row={row} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {pagedItems.map((row) => (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.returnedTo}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {format(new Date(row.returnedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.lines.length === 1
                            ? lineLabel(row.lines[0])
                            : `${row.variantCount} products`}
                        </p>
                        <p className="mt-1 text-xs">
                          {row.variantCount} variants · {row.totalQuantity.toLocaleString()} qty
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {statusBadge(row.status)}
                        <ReturnRowActions
                          row={row}
                          showView
                          onView={setDetailRow}
                          onPrint={printReturn}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <ListPagination
                pageSize={pageSize}
                safePage={safePage}
                pageCount={pageCount}
                onPageSizeChange={setPageSize}
                onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailRow} onOpenChange={(open) => { if (!open) setDetailRow(null); }}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-1.5rem)] max-w-2xl overflow-x-hidden overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Return details</DialogTitle>
            <DialogDescription className="break-words">
              {detailRow
                ? `${detailRow.returnedTo} · ${format(new Date(detailRow.returnedAt), 'MMM d, yyyy h:mm a')}`
                : 'Return items'}
            </DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="min-w-0 space-y-3">
              <div>{statusBadge(detailRow.status)}</div>
              <ReturnDetails row={detailRow} />
              <Button type="button" className="w-full" onClick={() => printReturn(detailRow)}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
