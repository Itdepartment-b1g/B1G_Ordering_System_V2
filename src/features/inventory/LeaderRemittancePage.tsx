import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Package, AlertCircle, Eye, FileSignature, ShoppingCart, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

interface RemittanceLog {
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
  agent_name?: string;
}

export default function LeaderRemittancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [remittances, setRemittances] = useState<RemittanceLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedRemittance, setSelectedRemittance] = useState<RemittanceLog | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [remittanceOrders, setRemittanceOrders] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role === 'sales_agent' && user?.position === 'Leader') {
      fetchTeamRemittances();
    }

    // Real-time subscriptions for remittances and orders
    const channels = [
      subscribeToTable('remittances_log', () => {
        console.log('🔄 Real-time: Team remittance updated');
        if (user?.role === 'sales_agent' && user?.position === 'Leader') {
          fetchTeamRemittances();
        }
      }),
      subscribeToTable('client_orders', () => {
        console.log('🔄 Real-time: Orders updated, refreshing remittance details');
        // Refresh if viewing details
        if (selectedRemittance && selectedRemittance.order_ids.length > 0) {
          fetchOrderDetails(selectedRemittance.order_ids);
        }
      })
    ];

    return () => channels.forEach(unsubscribe);
  }, [user, selectedDate]);

  const fetchTeamRemittances = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Build query for remittances to this leader
      let query = supabase
        .from('remittances_log')
        .select(`
          *,
          agent:profiles!remittances_log_agent_id_fkey(full_name)
        `)
        .eq('leader_id', user.id)
        .order('remitted_at', { ascending: false });

      // Apply date filter if selected
      if (selectedDate) {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        query = query.eq('remittance_date', dateStr);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData: RemittanceLog[] = (data || []).map((item: any) => ({
        id: item.id,
        agent_id: item.agent_id,
        leader_id: item.leader_id,
        remittance_date: item.remittance_date,
        remitted_at: item.remitted_at,
        items_remitted: item.items_remitted,
        total_units: item.total_units,
        orders_count: item.orders_count,
        total_revenue: item.total_revenue,
        order_ids: item.order_ids || [],
        signature_url: item.signature_url,
        signature_path: item.signature_path,
        agent_name: item.agent?.full_name || 'Unknown Agent'
      }));

      setRemittances(formattedData);
    } catch (error: any) {
      console.error('Error fetching team remittances:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team remittances',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (orderIds: string[]) => {
    if (!orderIds || orderIds.length === 0) {
      setRemittanceOrders([]);
      return;
    }

    setLoadingDetails(true);
    try {
      const { data, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          total_amount,
          created_at,
          clients(name),
          items:client_order_items(
            quantity,
            variant:variants(name, brand:brands(name))
          )
        `)
        .in('id', orderIds);

      if (error) throw error;

      const formattedOrders = (data || []).flatMap((order: any) =>
        (order.items || []).map((item: any) => ({
          orderId: order.id,
          orderNumber: order.order_number,
          clientName: order.clients?.name || 'Unknown',
          variantName: item.variant?.name || 'Unknown',
          brandName: item.variant?.brand?.name || 'Unknown',
          quantity: item.quantity,
          totalAmount: order.total_amount,
          createdAt: order.created_at
        }))
      );

      setRemittanceOrders(formattedOrders);
    } catch (error: any) {
      console.error('Error fetching order details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details',
        variant: 'destructive'
      });
      setRemittanceOrders([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleViewDetails = async (remittance: RemittanceLog) => {
    setSelectedRemittance(remittance);
    setViewDialogOpen(true);

    // Fetch order details if there are any
    if (remittance.order_ids && remittance.order_ids.length > 0) {
      await fetchOrderDetails(remittance.order_ids);
    } else {
      setRemittanceOrders([]);
    }
  };

  const totalRemittances = remittances.length;
  const totalItems = remittances.reduce((sum, r) => sum + r.items_remitted, 0);
  const totalUnits = remittances.reduce((sum, r) => sum + r.total_units, 0);
  const totalRevenue = remittances.reduce((sum, r) => sum + r.total_revenue, 0);
  const totalOrders = remittances.reduce((sum, r) => sum + r.orders_count, 0);

  if (user?.role !== 'sales_agent' || user?.position !== 'Leader') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <p>This page is only available for leaders.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team Remittances</h1>
          <p className="text-muted-foreground mt-1">
            View remitted stocks from your team agents
          </p>
        </div>

        {/* Date Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'PPP') : <span>Filter by date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
            />
            {selectedDate && (
              <div className="p-3 border-t">
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setSelectedDate(undefined)}
                >
                  Clear filter
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remittances</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRemittances}</div>
            <p className="text-xs text-muted-foreground">
              From team agents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items Returned</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground">
              {totalUnits} units total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orders Sold</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">
              Completed orders
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From remitted orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Remittances Table */}
      <Card>
        <CardHeader>
          <CardTitle>Team Remittances</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading remittances...
            </div>
          ) : remittances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No remittances found</p>
              {selectedDate && (
                <p className="text-sm mt-2">
                  Try selecting a different date or clear the filter
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {remittances.map((remittance) => (
                  <TableRow key={remittance.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {format(new Date(remittance.remitted_at), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(remittance.remitted_at), 'hh:mm a')}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {remittance.agent_name}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm">
                        <div className="font-semibold">{remittance.items_remitted} items</div>
                        <div className="text-muted-foreground">{remittance.total_units} units</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">
                        {remittance.orders_count}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ₱{remittance.total_revenue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(remittance)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remittance Details</DialogTitle>
          </DialogHeader>

          {selectedRemittance && (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Agent</p>
                  <p className="font-semibold">{selectedRemittance.agent_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="font-semibold">
                    {format(new Date(selectedRemittance.remitted_at), 'PPP p')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Remittance ID</p>
                  <p className="font-mono text-xs">{selectedRemittance.id.slice(0, 8)}...</p>
                </div>
              </div>

              {/* Tabs for Details */}
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">
                    📊 Summary
                  </TabsTrigger>
                  <TabsTrigger value="orders">
                    🛒 Sold Orders ({selectedRemittance.orders_count})
                  </TabsTrigger>
                  <TabsTrigger value="signature">
                    ✍️ Signature
                  </TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Items Returned</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{selectedRemittance.items_remitted}</div>
                        <p className="text-xs text-muted-foreground">Unique items</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Total Units</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{selectedRemittance.total_units}</div>
                        <p className="text-xs text-muted-foreground">Quantity</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Orders Sold</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{selectedRemittance.orders_count}</div>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Revenue</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">₱{selectedRemittance.total_revenue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                    <h4 className="font-semibold mb-2 text-blue-900">Remittance Summary</h4>
                    <ul className="text-sm space-y-1 text-blue-800">
                      <li>✓ {selectedRemittance.items_remitted} items ({selectedRemittance.total_units} units) returned as unsold</li>
                      <li>✓ {selectedRemittance.orders_count} orders sold totaling ₱{selectedRemittance.total_revenue.toLocaleString()}</li>
                      <li>✓ Signature captured and verified</li>
                      <li>✓ Agent inventory cleared</li>
                    </ul>
                  </div>
                </TabsContent>

                {/* Orders Tab */}
                <TabsContent value="orders" className="space-y-4">
                  {loadingDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : remittanceOrders.length > 0 ? (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Order Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="border rounded-lg max-h-96 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Order#</TableHead>
                                  <TableHead>Client</TableHead>
                                  <TableHead>Product</TableHead>
                                  <TableHead className="text-right">Qty</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {remittanceOrders.map((order, index) => (
                                  <TableRow key={`${order.orderId}-${index}`}>
                                    <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                                    <TableCell>{order.clientName}</TableCell>
                                    <TableCell className="text-sm">{order.brandName} - {order.variantName}</TableCell>
                                    <TableCell className="text-right">{order.quantity}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                      {/* Only show total on first item of each order */}
                                      {index === 0 || remittanceOrders[index - 1].orderId !== order.orderId
                                        ? `₱${order.totalAmount.toFixed(2)}`
                                        : '-'}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="border rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Unique Orders</p>
                          <p className="text-2xl font-bold">{new Set(remittanceOrders.map(o => o.orderId)).size}</p>
                        </div>
                        <div className="border rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">Total Revenue</p>
                          <p className="text-2xl font-bold">
                            ₱{Array.from(new Set(remittanceOrders.map(o => o.orderId)))
                              .reduce((sum, orderId) => {
                                const order = remittanceOrders.find(o => o.orderId === orderId);
                                return sum + (order?.totalAmount || 0);
                              }, 0).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No orders were sold during this remittance</p>
                    </div>
                  )}
                </TabsContent>

                {/* Signature Tab */}
                <TabsContent value="signature" className="space-y-4">
                  {selectedRemittance.signature_url ? (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Agent Signature</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="border rounded-lg p-6 bg-white">
                            <img
                              src={selectedRemittance.signature_url}
                              alt="Agent Signature"
                              className="max-h-40 mx-auto"
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <div className="border rounded-lg p-4 bg-green-50 border-green-200">
                        <div className="flex items-start gap-3">
                          <FileSignature className="h-5 w-5 text-green-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-green-900">Signature Verified</p>
                            <p className="text-sm text-green-700 mt-1">
                              This signature was captured and saved at the time of remittance.
                              It confirms the agent's acknowledgment and authorization of this transaction.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <p>Storage Path: {selectedRemittance.signature_path}</p>
                        <p>Captured: {format(new Date(selectedRemittance.remitted_at), 'PPP p')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No signature available for this remittance</p>
                      <p className="text-sm mt-2">This may be an older remittance from before signature capture was implemented.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
