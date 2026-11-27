import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ClipboardList,
  Eye,
  FileSignature,
  Loader2,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

export const AGENT_REMITTANCE_HISTORY_QUERY_KEY = 'agent-remittance-history';

type RemittanceLog = {
  id: string;
  agent_id: string;
  leader_id: string;
  remittance_date: string;
  remitted_at: string;
  items_remitted: number;
  total_units: number;
  orders_count: number;
  total_revenue: number;
  order_ids: string[];
  signature_url: string | null;
  signature_path: string | null;
  leader_name: string;
};

type RemittanceOrderLine = {
  orderId: string;
  orderNumber: string;
  clientName: string;
  variantName: string;
  brandName: string;
  quantity: number;
  totalAmount: number;
};

async function fetchMyRemittances(agentId: string): Promise<RemittanceLog[]> {
  const { data, error } = await supabase
    .from('remittances_log')
    .select(
      `
      id,
      agent_id,
      leader_id,
      remittance_date,
      remitted_at,
      items_remitted,
      total_units,
      orders_count,
      total_revenue,
      order_ids,
      signature_url,
      signature_path,
      leader:profiles!remittances_log_leader_id_fkey(full_name)
    `
    )
    .eq('agent_id', agentId)
    .order('remitted_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item) => {
    const leader = Array.isArray(item.leader) ? item.leader[0] : item.leader;
    return {
      id: String(item.id),
      agent_id: String(item.agent_id),
      leader_id: String(item.leader_id),
      remittance_date: String(item.remittance_date || ''),
      remitted_at: String(item.remitted_at || ''),
      items_remitted: Number(item.items_remitted) || 0,
      total_units: Number(item.total_units) || 0,
      orders_count: Number(item.orders_count) || 0,
      total_revenue: Number(item.total_revenue) || 0,
      order_ids: Array.isArray(item.order_ids) ? item.order_ids.map(String) : [],
      signature_url: item.signature_url == null ? null : String(item.signature_url),
      signature_path: item.signature_path == null ? null : String(item.signature_path),
      leader_name: leader?.full_name ? String(leader.full_name) : 'Unknown leader',
    };
  });
}

async function fetchRemittanceOrderLines(orderIds: string[]): Promise<RemittanceOrderLine[]> {
  if (orderIds.length === 0) return [];

  const { data, error } = await supabase
    .from('client_orders')
    .select(
      `
      id,
      order_number,
      total_amount,
      clients(name),
      items:client_order_items(
        quantity,
        variant:variants(name, brand:brands(name))
      )
    `
    )
    .in('id', orderIds);

  if (error) throw error;

  return (data || []).flatMap((order) => {
    const client = Array.isArray(order.clients) ? order.clients[0] : order.clients;
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item) => {
      const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant;
      const brand = variant && !Array.isArray(variant.brand) ? variant.brand : Array.isArray(variant?.brand) ? variant.brand[0] : null;
      return {
        orderId: String(order.id),
        orderNumber: String(order.order_number || '—'),
        clientName: client?.name ? String(client.name) : 'Unknown',
        variantName: variant?.name ? String(variant.name) : 'Unknown',
        brandName: brand?.name ? String(brand.name) : 'Unknown',
        quantity: Number(item.quantity) || 0,
        totalAmount: Number(order.total_amount) || 0,
      };
    });
  });
}

export default function AgentRemittanceHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({ preset: 'all' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<RemittanceLog | null>(null);
  const [orderLines, setOrderLines] = useState<RemittanceOrderLine[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const { data: remittances = [], isLoading } = useQuery({
    queryKey: [AGENT_REMITTANCE_HISTORY_QUERY_KEY, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        return await fetchMyRemittances(user!.id);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load remittance history',
          variant: 'destructive',
        });
        throw error;
      }
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`agent-remittance-history-${user.id}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'remittances_log',
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [AGENT_REMITTANCE_HISTORY_QUERY_KEY, user.id],
          });
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

  const filtered = useMemo(() => {
    return remittances.filter((row) => {
      if (!dateRange) return true;
      return isDateInRange(row.remitted_at, dateRange.start, dateRange.end);
    });
  }, [remittances, dateRange]);

  useEffect(() => {
    setPage(0);
  }, [dateRangeFilter, pageSize]);

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(filtered, page, pageSize),
    [filtered, page, pageSize]
  );

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.orders += row.orders_count;
        acc.units += row.total_units;
        acc.revenue += row.total_revenue;
        return acc;
      },
      { count: 0, orders: 0, units: 0, revenue: 0 }
    );
  }, [filtered]);

  const openDetails = async (row: RemittanceLog) => {
    setSelected(row);
    setOrderLines([]);
    if (!row.order_ids.length) return;
    setLoadingDetails(true);
    try {
      setOrderLines(await fetchRemittanceOrderLines(row.order_ids));
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load remittance order details',
        variant: 'destructive',
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="mt-0.5">
            <Link to="/my-inventory">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Remittance history</h1>
            <p className="text-sm text-muted-foreground">
              Your past remittances to your team leader.
            </p>
          </div>
        </div>
        <DateRangeFilterPopover value={dateRangeFilter} onChange={setDateRangeFilter} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Remittances</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Orders</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.orders}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Units</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totals.units}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            ₱{totals.revenue.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Your remittances
          </CardTitle>
          <CardDescription>
            {filtered.length === 0
              ? 'No remittances in this range.'
              : `${filtered.length} remittance${filtered.length === 1 ? '' : 's'} shown.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading remittance history…
            </div>
          ) : pagedItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>No remittances found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & time</TableHead>
                      <TableHead>Leader</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">
                            {format(new Date(row.remitted_at), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(row.remitted_at), 'h:mm a')}
                          </div>
                        </TableCell>
                        <TableCell>{row.leader_name}</TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">{row.items_remitted} items</div>
                          <div className="text-xs text-muted-foreground">{row.total_units} units</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{row.orders_count}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₱{row.total_revenue.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => void openDetails(row)}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={setPageSize}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setOrderLines([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remittance details</DialogTitle>
            <DialogDescription>
              {selected
                ? `Remitted ${format(new Date(selected.remitted_at), 'MMM d, yyyy h:mm a')}`
                : null}
            </DialogDescription>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Leader</p>
                  <p className="font-medium">{selected.leader_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Orders</p>
                  <p className="font-medium">{selected.orders_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="font-medium">₱{selected.total_revenue.toLocaleString()}</p>
                </div>
              </div>

              <Tabs defaultValue="summary">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="signature">Signature</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-3 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Items</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xl font-bold">
                        {selected.items_remitted}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Units</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xl font-bold">{selected.total_units}</CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="orders" className="pt-2">
                  {loadingDetails ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading orders…
                    </div>
                  ) : orderLines.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                      <ShoppingCart className="mx-auto mb-2 h-10 w-10 opacity-50" />
                      <p>No sold orders on this remittance</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderLines.map((line, index) => (
                            <TableRow key={`${line.orderId}-${index}`}>
                              <TableCell className="font-mono text-xs">{line.orderNumber}</TableCell>
                              <TableCell>{line.clientName}</TableCell>
                              <TableCell className="text-sm">
                                {line.brandName} — {line.variantName}
                              </TableCell>
                              <TableCell className="text-right">{line.quantity}</TableCell>
                              <TableCell className="text-right font-medium">
                                {index === 0 || orderLines[index - 1]?.orderId !== line.orderId
                                  ? `₱${line.totalAmount.toLocaleString()}`
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="signature" className="pt-2">
                  {selected.signature_url ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border bg-white p-6">
                        <img
                          src={selected.signature_url}
                          alt="Remittance signature"
                          className="mx-auto max-h-40"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Captured {format(new Date(selected.remitted_at), 'PPP p')}
                      </p>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-muted-foreground">
                      <FileSignature className="mx-auto mb-2 h-10 w-10 opacity-50" />
                      <p>No signature available for this remittance</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
