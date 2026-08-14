import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllPaginated } from '@/lib/supabasePaginate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AnalyticsTablePagination, paginateAnalyticsRows } from './AnalyticsTablePagination';
import { firstRelation, type KeyAccountProductAnalyticsRow } from './keyAccountAnalyticsShared';

export type KeyAccountProductPoBreakdownOrder = {
  id: string;
  po_number: string;
  order_date: string;
  total_amount?: number | null;
  key_account_payment_status?: string | null;
  client?: { client_name: string | null } | { client_name: string | null }[] | null;
  kam?:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
};

export type KeyAccountProductPoBreakdownRow = {
  orderId: string;
  poNumber: string;
  orderDate: string;
  clientName: string;
  createdBy: string;
  isConsignment: boolean;
  quantity: number;
  netPoValue: number;
  paymentStatus: string;
};

type PaymentHistoryRow = {
  id: string;
  amount: number | null;
  settlement_discount?: number | null;
  created_at: string;
  payment_method?: string | null;
  bank_type?: string | null;
  recorder?:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
};

type PoKindFilter = 'all' | 'standard' | 'consignment';

function formatCurrency(value: number) {
  return `₱${Math.round(value).toLocaleString()}`;
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function paymentStatusBadgeClass(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-emerald-600 text-white hover:bg-emerald-600';
    case 'partial':
      return 'bg-amber-500 text-white hover:bg-amber-500';
    case 'consignment':
      return 'border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-50';
    default:
      return 'bg-slate-500 text-white hover:bg-slate-500';
  }
}

function resolvePaymentStatus(
  order: KeyAccountProductPoBreakdownOrder | undefined,
  isConsignment: boolean
): string {
  const raw = String(order?.key_account_payment_status || '')
    .trim()
    .toLowerCase();
  if (raw) return raw;
  return isConsignment ? 'consignment' : 'unpaid';
}

export function buildKeyAccountProductPoBreakdownRows(
  product: KeyAccountProductAnalyticsRow,
  orderById: Map<string, KeyAccountProductPoBreakdownOrder>
): KeyAccountProductPoBreakdownRow[] {
  return product.poContributions.map((contribution) => {
    const order = orderById.get(contribution.orderId);
    const client = firstRelation(order?.client);
    const kam = firstRelation(order?.kam);
    return {
      orderId: contribution.orderId,
      poNumber: order?.po_number || contribution.orderId.slice(0, 8),
      orderDate: order?.order_date || '',
      clientName: client?.client_name || '—',
      createdBy: kam?.full_name || kam?.email || '—',
      isConsignment: contribution.isConsignment,
      quantity: contribution.quantity,
      netPoValue: contribution.revenue,
      paymentStatus: resolvePaymentStatus(order, contribution.isConsignment),
    };
  });
}

export function KeyAccountProductPoBreakdownDialog({
  open,
  onOpenChange,
  product,
  dateRangeLabel,
  poRows,
  formatCurrencyFn = formatCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: KeyAccountProductAnalyticsRow | null;
  dateRangeLabel: string;
  poRows: KeyAccountProductPoBreakdownRow[];
  formatCurrencyFn?: (value: number) => string;
}) {
  const [search, setSearch] = useState('');
  const [poKindFilter, setPoKindFilter] = useState<PoKindFilter>('all');
  const [poPage, setPoPage] = useState(1);
  const [historyOrder, setHistoryOrder] = useState<KeyAccountProductPoBreakdownRow | null>(null);
  const [historyPayments, setHistoryPayments] = useState<PaymentHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setPoPage(1);
  }, [search, poKindFilter, product?.key, open]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return poRows.filter((row) => {
      if (poKindFilter === 'consignment' && !row.isConsignment) return false;
      if (poKindFilter === 'standard' && row.isConsignment) return false;
      if (!q) return true;
      const haystack = [row.poNumber, row.clientName, row.createdBy, row.paymentStatus]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [poRows, search, poKindFilter]);

  const pagedRows = useMemo(
    () => paginateAnalyticsRows(filteredRows, poPage),
    [filteredRows, poPage]
  );

  const historyPaidTotal = useMemo(
    () => historyPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [historyPayments]
  );
  const historyDiscountTotal = useMemo(
    () =>
      historyPayments.reduce((sum, row) => sum + (Number(row.settlement_discount) || 0), 0),
    [historyPayments]
  );
  const pagedHistoryPayments = useMemo(
    () => paginateAnalyticsRows(historyPayments, historyPage),
    [historyPayments, historyPage]
  );

  const openPaymentHistory = async (row: KeyAccountProductPoBreakdownRow) => {
    setHistoryOrder(row);
    setHistoryPayments([]);
    setHistoryPage(1);
    setHistoryLoading(true);
    try {
      const rows = await fetchAllPaginated<PaymentHistoryRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('purchase_order_key_account_payments')
          .select(
            `
            id,
            amount,
            settlement_discount,
            created_at,
            payment_method,
            bank_type,
            recorder:profiles!purchase_order_key_account_payments_recorded_by_fkey(full_name,email)
          `
          )
          .eq('purchase_order_id', row.orderId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to);
        return { data: (data as PaymentHistoryRow[] | null) ?? null, error };
      });
      setHistoryPayments(rows);
    } catch {
      setHistoryPayments([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const closePaymentHistory = () => {
    setHistoryOrder(null);
    setHistoryPayments([]);
    setHistoryLoading(false);
    setHistoryPage(1);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setSearch('');
            setPoKindFilter('all');
            setPoPage(1);
            closePaymentHistory();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {product ? `${product.brand} — ${product.variant}` : 'Product detail'}
            </DialogTitle>
            <DialogDescription>
              PO breakdown for {dateRangeLabel}. Qty and net PO value are this product&apos;s share
              on each PO.
            </DialogDescription>
          </DialogHeader>

          {product && (
            <div className="space-y-4 text-sm min-w-0">
              {product.rebatedRevenue > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-muted-foreground text-xs">Gross PO value</p>
                    <p className="font-semibold">{formatCurrencyFn(product.grossRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Rebated (credit)</p>
                    <p className="font-semibold text-amber-700 dark:text-amber-400">
                      −{formatCurrencyFn(product.rebatedRevenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Net PO value</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrencyFn(product.revenue)}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <div>
                  <p className="text-muted-foreground text-xs">Total Units Ordered</p>
                  <p className="font-semibold">{product.quantity.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total Net PO Value</p>
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrencyFn(product.revenue)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total POs</p>
                  <p className="font-semibold">{product.orderCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Clients</p>
                  <p className="font-semibold">{product.clientCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Consignment Units</p>
                  <p className="font-semibold text-sky-700 dark:text-sky-400">
                    {product.consignmentQuantity > 0
                      ? product.consignmentQuantity.toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">PO Breakdown</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search PO #, client, creator, status..."
                    className="max-w-md"
                  />
                  <Select
                    value={poKindFilter}
                    onValueChange={(value) => setPoKindFilter(value as PoKindFilter)}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="PO type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All PO types</SelectItem>
                      <SelectItem value="standard">Standard PO</SelectItem>
                      <SelectItem value="consignment">Consignment PO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border min-w-0">
                <Table className="w-full table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[22%]">PO #</TableHead>
                      <TableHead className="w-[10%] text-right">Qty</TableHead>
                      <TableHead className="w-[14%] text-right">Net PO Value</TableHead>
                      <TableHead className="w-[16%]">Client</TableHead>
                      <TableHead className="w-[16%]">Created by</TableHead>
                      <TableHead className="w-[12%]">Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No purchase orders include this product in the selected period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedRows.map((row) => (
                        <TableRow key={row.orderId}>
                          <TableCell className="align-top">
                            <div className="min-w-0 space-y-1">
                              <Button
                                type="button"
                                variant="link"
                                className="h-auto p-0 text-xs font-medium text-left whitespace-normal break-all"
                                onClick={() => void openPaymentHistory(row)}
                              >
                                {row.poNumber}
                              </Button>
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {row.orderDate ? formatOrderDate(row.orderDate) : '—'}
                                </span>
                                {row.isConsignment ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-normal border-amber-300 text-amber-800 bg-amber-50 px-1.5 py-0"
                                  >
                                    Consignment
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {row.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right align-top font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatCurrencyFn(row.netPoValue)}
                          </TableCell>
                          <TableCell className="align-top truncate" title={row.clientName}>
                            {row.clientName}
                          </TableCell>
                          <TableCell className="align-top truncate" title={row.createdBy}>
                            {row.createdBy}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant={row.paymentStatus === 'consignment' ? 'outline' : 'default'}
                              className={`text-[10px] px-1.5 ${paymentStatusBadgeClass(row.paymentStatus)}`}
                            >
                              {row.paymentStatus.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <AnalyticsTablePagination
                page={poPage}
                onPageChange={setPoPage}
                totalRows={filteredRows.length}
              />
              <p className="text-xs text-muted-foreground">
                {filteredRows.length} PO{filteredRows.length === 1 ? '' : 's'}
                {search.trim() ? ` matching “${search.trim()}”` : ''}
                {' · '}Click a PO # for payment history
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!historyOrder}
        onOpenChange={(next) => {
          if (!next) closePaymentHistory();
        }}
      >
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Payment history — {historyOrder?.poNumber}</span>
              {historyOrder?.isConsignment ? (
                <Badge
                  variant="outline"
                  className="text-xs font-normal border-amber-300 text-amber-800 bg-amber-50"
                >
                  Consignment
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {historyOrder?.clientName || 'Client'} ·{' '}
              {historyOrder?.orderDate ? formatOrderDate(historyOrder.orderDate) : '—'} · Product
              net {formatCurrencyFn(historyOrder?.netPoValue || 0)}
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading payment history…
            </div>
          ) : (
            <div className="space-y-4 text-sm min-w-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground text-xs">Cash recorded</p>
                  <p className="font-semibold text-emerald-600">
                    {formatCurrencyFn(historyPaidTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Settlement disc.</p>
                  <p className="font-semibold text-slate-600">
                    {formatCurrencyFn(historyDiscountTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Entries</p>
                  <p className="font-semibold">{historyPayments.length}</p>
                </div>
              </div>

              <div className="rounded-md border min-w-0">
                <Table className="w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Disc.</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedHistoryPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No payment entries for this PO.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedHistoryPayments.map((payment) => {
                        const recorder = firstRelation(payment.recorder);
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>{formatOrderDate(payment.created_at)}</TableCell>
                            <TableCell className="text-right tabular-nums text-emerald-600">
                              {formatCurrencyFn(Number(payment.amount) || 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-slate-600">
                              {Number(payment.settlement_discount) > 0
                                ? formatCurrencyFn(Number(payment.settlement_discount) || 0)
                                : '—'}
                            </TableCell>
                            <TableCell>
                              {[payment.payment_method, payment.bank_type]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </TableCell>
                            <TableCell>
                              {recorder?.full_name || recorder?.email || '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <AnalyticsTablePagination
                page={historyPage}
                onPageChange={setHistoryPage}
                totalRows={historyPayments.length}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
