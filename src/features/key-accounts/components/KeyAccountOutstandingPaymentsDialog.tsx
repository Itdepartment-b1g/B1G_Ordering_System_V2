import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  firstRelation,
  isKeyAccountConsignmentOrder,
} from '@/features/key-accounts/key-accounts-analytics/keyAccountAnalyticsShared';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from '@/features/key-accounts/key-accounts-analytics/AnalyticsTablePagination';
import {
  formatKeyAccountDashboardCurrency,
  splitKeyAccountPoPaymentRevenue,
} from '@/features/key-accounts/dashboard/keyAccountDashboardRevenue';
import { useAppDispatch } from '@/store/store';
import {
  fetchKAPoPayments,
  fetchKAPoPaymentsBulk,
  type KAPoPaymentBulkRow,
} from '@/store/slices/key-accounts/purchase-order';

export type KeyAccountOutstandingPoInput = {
  id: string;
  po_number: string;
  order_date: string;
  total_amount: number;
  po_order_kind?: string | null;
  key_account_payment_status?: string | null;
  client?:
    | { client_name: string | null }
    | { client_name: string | null }[]
    | null;
};

type OutstandingPoRow = {
  orderId: string;
  poNumber: string;
  orderDate: string;
  clientName: string;
  isConsignment: boolean;
  totalAmount: number;
  paidAmount: number;
  settlementDiscount: number;
  remainingBalance: number;
  consignmentFloat: number;
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

type PaymentHistoryDisplayRow = {
  key: string;
  created_at: string;
  methodLabel: string;
  recorderName: string;
  amountLabel: string;
  amountClassName?: string;
};

type PoKindFilter = 'all' | 'standard' | 'consignment';
type StatusFilter = 'all' | 'unpaid' | 'partial';

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

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function formatAmountOrDash(value: number) {
  if (!value) return '—';
  return formatKeyAccountDashboardCurrency(value);
}

function buildPaymentHistoryDisplayRows(payments: PaymentHistoryRow[]): PaymentHistoryDisplayRow[] {
  const rows: PaymentHistoryDisplayRow[] = [];
  for (const payment of payments) {
    const recorder = firstRelation(payment.recorder);
    const recorderName = recorder?.full_name || recorder?.email || '—';
    const cash = Number(payment.amount) || 0;
    const discount = Number(payment.settlement_discount) || 0;
    const createdAt = payment.created_at || '';

    if (cash > 0) {
      const method = payment.payment_method
        ? String(payment.payment_method).replace(/_/g, ' ')
        : '—';
      const bank = payment.bank_type
        ? ` · ${String(payment.bank_type).replace(/_/g, ' ')}`
        : '';
      rows.push({
        key: `${payment.id}-cash`,
        created_at: createdAt,
        methodLabel: `${method}${bank}`,
        recorderName,
        amountLabel: formatKeyAccountDashboardCurrency(cash),
        amountClassName: 'font-medium',
      });
    }

    if (discount > 0) {
      rows.push({
        key: `${payment.id}-discount`,
        created_at: createdAt,
        methodLabel: 'Settlement discount',
        recorderName,
        amountLabel: `Disc. ${formatKeyAccountDashboardCurrency(discount)}`,
        amountClassName: 'text-slate-600',
      });
    }
  }
  return rows;
}

function buildOutstandingRows(
  orders: KeyAccountOutstandingPoInput[],
  payments: KAPoPaymentBulkRow[]
): OutstandingPoRow[] {
  const paidByOrderId = new Map<string, number>();
  const discountByOrderId = new Map<string, number>();
  for (const payment of payments) {
    const id = payment.purchase_order_id;
    paidByOrderId.set(id, (paidByOrderId.get(id) || 0) + (Number(payment.amount) || 0));
    discountByOrderId.set(
      id,
      (discountByOrderId.get(id) || 0) + (Number(payment.settlement_discount) || 0)
    );
  }

  return orders
    .map((order) => {
      const total = Number(order.total_amount) || 0;
      const isConsignment = isKeyAccountConsignmentOrder(order);
      const paidRaw = paidByOrderId.get(order.id) || 0;
      const discountRaw = discountByOrderId.get(order.id) || 0;
      const split = splitKeyAccountPoPaymentRevenue(total, paidRaw, isConsignment, discountRaw);
      const status = String(order.key_account_payment_status || 'unpaid');
      const client = firstRelation(order.client);

      return {
        orderId: order.id,
        poNumber: order.po_number || '—',
        orderDate: order.order_date || '',
        clientName: client?.client_name || '—',
        isConsignment,
        totalAmount: total,
        paidAmount: split.paidRevenue,
        settlementDiscount: split.settlementDiscountRevenue,
        remainingBalance: split.partialRevenue + split.unpaidRevenue,
        consignmentFloat: split.consignmentRevenue,
        paymentStatus: status,
      };
    })
    .sort((a, b) => {
      const aOutstanding = a.isConsignment ? a.consignmentFloat : a.remainingBalance;
      const bOutstanding = b.isConsignment ? b.consignmentFloat : b.remainingBalance;
      return bOutstanding - aOutstanding || a.poNumber.localeCompare(b.poNumber);
    });
}

export function KeyAccountOutstandingPaymentsDialog({
  open,
  onOpenChange,
  orders,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: KeyAccountOutstandingPoInput[];
}) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OutstandingPoRow[]>([]);
  const [search, setSearch] = useState('');
  const [poKindFilter, setPoKindFilter] = useState<PoKindFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [poPage, setPoPage] = useState(1);
  const [historyOrder, setHistoryOrder] = useState<OutstandingPoRow | null>(null);
  const [historyPayments, setHistoryPayments] = useState<PaymentHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setSearch('');
    setPoKindFilter('all');
    setStatusFilter('all');
    setPoPage(1);

    void (async () => {
      try {
        const result = await dispatch(
          fetchKAPoPaymentsBulk(orders.map((order) => order.id))
        ).unwrap();
        if (cancelled) return;
        setRows(buildOutstandingRows(orders, result.payments));
      } catch {
        if (!cancelled) setRows(buildOutstandingRows(orders, []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch, open, orders]);

  useEffect(() => {
    setPoPage(1);
  }, [search, poKindFilter, statusFilter]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (poKindFilter === 'consignment' && !row.isConsignment) return false;
      if (poKindFilter === 'standard' && row.isConsignment) return false;
      if (statusFilter === 'unpaid' && row.paymentStatus !== 'unpaid') return false;
      if (statusFilter === 'partial' && row.paymentStatus !== 'partial') return false;
      if (!q) return true;
      const haystack = [row.poNumber, row.clientName, row.paymentStatus].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, poKindFilter, statusFilter]);

  const pagedRows = useMemo(
    () => paginateAnalyticsRows(filteredRows, poPage),
    [filteredRows, poPage]
  );

  const summary = useMemo(() => {
    let unpaid = 0;
    let partial = 0;
    let remaining = 0;
    let consignment = 0;
    let paid = 0;
    let discount = 0;
    let total = 0;
    for (const row of rows) {
      if (row.paymentStatus === 'partial') partial += 1;
      else unpaid += 1;
      remaining += row.isConsignment ? 0 : row.remainingBalance;
      consignment += row.consignmentFloat;
      paid += row.paidAmount;
      discount += row.settlementDiscount;
      total += row.totalAmount;
    }
    return { unpaid, partial, remaining, consignment, paid, discount, total };
  }, [rows]);

  const filteredTotals = useMemo(() => {
    let paid = 0;
    let consignment = 0;
    let discount = 0;
    let total = 0;
    let remaining = 0;
    for (const row of filteredRows) {
      paid += row.paidAmount;
      consignment += row.consignmentFloat;
      discount += row.settlementDiscount;
      total += row.totalAmount;
      remaining += row.isConsignment ? 0 : row.remainingBalance;
    }
    return { paid, consignment, discount, total, remaining };
  }, [filteredRows]);

  const historyPaidTotal = useMemo(
    () => historyPayments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [historyPayments]
  );
  const historyDiscountTotal = useMemo(
    () =>
      historyPayments.reduce((sum, row) => sum + (Number(row.settlement_discount) || 0), 0),
    [historyPayments]
  );
  const historyDisplayRows = useMemo(
    () => buildPaymentHistoryDisplayRows(historyPayments),
    [historyPayments]
  );
  const historyCashPaymentCount = useMemo(
    () => historyPayments.filter((p) => (Number(p.amount) || 0) > 0).length,
    [historyPayments]
  );
  const pagedHistoryPayments = useMemo(
    () => paginateAnalyticsRows(historyDisplayRows, historyPage),
    [historyDisplayRows, historyPage]
  );

  const openPaymentHistory = async (row: OutstandingPoRow) => {
    setHistoryOrder(row);
    setHistoryPayments([]);
    setHistoryPage(1);
    setHistoryLoading(true);
    try {
      const result = await dispatch(fetchKAPoPayments(row.orderId)).unwrap();
      setHistoryPayments((result.payments as PaymentHistoryRow[]) || []);
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
            setStatusFilter('all');
            setPoPage(1);
            closePaymentHistory();
          }
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Unpaid / Partial POs</DialogTitle>
            <DialogDescription>
              Purchase orders with payment tracking that are not fully paid. Consignment float is
              under Cons.; remaining balance is for standard POs. Click a PO # for payment history.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading outstanding balances…
            </div>
          ) : (
            <div className="space-y-4 text-sm min-w-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                <div>
                  <p className="text-muted-foreground text-xs">Unpaid</p>
                  <p className="font-semibold">{summary.unpaid}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Partial</p>
                  <p className="font-semibold text-amber-600">{summary.partial}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Remaining balance</p>
                  <p className="font-semibold text-orange-600">
                    {formatKeyAccountDashboardCurrency(summary.remaining)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Consignment</p>
                  <p className="font-semibold text-sky-600">
                    {formatKeyAccountDashboardCurrency(summary.consignment)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Paid so far</p>
                  <p className="font-semibold text-emerald-600">
                    {formatKeyAccountDashboardCurrency(summary.paid)}
                    {summary.discount > 0 ? (
                      <span className="block text-xs font-normal text-slate-600">
                        + {formatKeyAccountDashboardCurrency(summary.discount)} disc.
                      </span>
                    ) : null}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total</p>
                  <p className="font-semibold">
                    {formatKeyAccountDashboardCurrency(summary.total)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search PO #, client, status..."
                  className="max-w-md"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as StatusFilter)}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                  </SelectContent>
                </Select>
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

              <div className="rounded-md border min-w-0">
                <Table className="w-full table-fixed text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[26%]">PO #</TableHead>
                      <TableHead className="w-[16%]">Client</TableHead>
                      <TableHead className="w-[10%] text-right">Paid</TableHead>
                      <TableHead className="w-[10%] text-right">Cons.</TableHead>
                      <TableHead className="w-[10%] text-right">Disc.</TableHead>
                      <TableHead className="w-[10%] text-right">Total</TableHead>
                      <TableHead className="w-[10%] text-right">Rem.</TableHead>
                      <TableHead className="w-[8%]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No unpaid or partial purchase orders.
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
                                  {formatOrderDate(row.orderDate)}
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
                          <TableCell className="align-top truncate" title={row.clientName}>
                            {row.clientName}
                          </TableCell>
                          <TableCell className="text-right align-top text-emerald-600 tabular-nums">
                            {formatAmountOrDash(row.paidAmount)}
                          </TableCell>
                          <TableCell className="text-right align-top text-sky-600 tabular-nums">
                            {formatAmountOrDash(row.consignmentFloat)}
                          </TableCell>
                          <TableCell className="text-right align-top text-slate-600 tabular-nums">
                            {formatAmountOrDash(row.settlementDiscount)}
                          </TableCell>
                          <TableCell className="text-right align-top tabular-nums">
                            {formatKeyAccountDashboardCurrency(row.totalAmount)}
                          </TableCell>
                          <TableCell className="text-right align-top font-medium tabular-nums">
                            {row.isConsignment
                              ? '—'
                              : formatKeyAccountDashboardCurrency(row.remainingBalance)}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              className={`text-[10px] px-1.5 ${paymentStatusBadgeClass(row.paymentStatus)}`}
                            >
                              {row.paymentStatus.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {filteredRows.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="text-xs font-semibold">
                          Total ({filteredRows.length} PO{filteredRows.length === 1 ? '' : 's'})
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-emerald-600">
                          {formatAmountOrDash(filteredTotals.paid)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-sky-600">
                          {formatAmountOrDash(filteredTotals.consignment)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-slate-600">
                          {formatAmountOrDash(filteredTotals.discount)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {formatKeyAccountDashboardCurrency(filteredTotals.total)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">
                          {formatKeyAccountDashboardCurrency(filteredTotals.remaining)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  ) : null}
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
              {historyOrder ? formatOrderDate(historyOrder.orderDate) : '—'} · PO total{' '}
              {formatKeyAccountDashboardCurrency(historyOrder?.totalAmount || 0)}
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading payment history…
            </div>
          ) : (
            <div className="space-y-4 text-sm min-w-0">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">PO total</p>
                  <p className="text-lg font-semibold">
                    {formatKeyAccountDashboardCurrency(historyOrder?.totalAmount || 0)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Paid so far</p>
                  <p className="text-lg font-semibold text-emerald-600">
                    {formatKeyAccountDashboardCurrency(historyPaidTotal)}
                    {historyDiscountTotal > 0 ? (
                      <span className="block text-xs font-normal text-slate-600">
                        + {formatKeyAccountDashboardCurrency(historyDiscountTotal)} disc.
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    {historyOrder?.isConsignment ? 'Consignment float' : 'Remaining balance'}
                  </p>
                  <p className="text-lg font-semibold">
                    {formatKeyAccountDashboardCurrency(
                      historyOrder?.isConsignment
                        ? historyOrder.consignmentFloat
                        : historyOrder?.remainingBalance || 0
                    )}
                  </p>
                </div>
              </div>

              {historyDisplayRows.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  No payment history recorded for this PO.
                </div>
              ) : (
                <>
                  <div className="rounded-md border min-w-0">
                    <Table className="w-full table-fixed text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[28%]">Date</TableHead>
                          <TableHead className="w-[28%]">Method</TableHead>
                          <TableHead className="w-[22%]">Recorded by</TableHead>
                          <TableHead className="w-[22%] text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedHistoryPayments.map((row) => (
                          <TableRow key={row.key}>
                            <TableCell className="align-top">
                              {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell className="align-top break-words">{row.methodLabel}</TableCell>
                            <TableCell
                              className="align-top truncate"
                              title={row.recorderName}
                            >
                              {row.recorderName}
                            </TableCell>
                            <TableCell
                              className={`text-right align-top tabular-nums ${row.amountClassName || ''}`}
                            >
                              {row.amountLabel}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <AnalyticsTablePagination
                    page={historyPage}
                    onPageChange={setHistoryPage}
                    totalRows={historyDisplayRows.length}
                  />
                </>
              )}
              <p className="text-xs text-muted-foreground text-right">
                {historyCashPaymentCount} payment entr
                {historyCashPaymentCount === 1 ? 'y' : 'ies'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
