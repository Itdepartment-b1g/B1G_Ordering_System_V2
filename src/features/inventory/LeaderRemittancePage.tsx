import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Package, AlertCircle, Eye, FileSignature, ShoppingCart, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { canLeadTeam } from '@/lib/roleUtils';

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
  const [unsoldItems, setUnsoldItems] = useState<any[]>([]);
  const [loadingUnsoldItems, setLoadingUnsoldItems] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [teamAgents, setTeamAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!user?.id || !['team_leader', 'manager'].includes(user?.role || '')) return;

    // Initial fetch
    fetchTeamRemittances();

    // Debounce timers for smooth real-time updates
    let remittanceTimer: NodeJS.Timeout | null = null;
    let ordersTimer: NodeJS.Timeout | null = null;

    const debouncedRemittanceRefresh = () => {
      if (remittanceTimer) clearTimeout(remittanceTimer);
      remittanceTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing team remittances...');
        fetchTeamRemittances();
      }, 300);
    };

    const debouncedOrdersRefresh = () => {
      if (ordersTimer) clearTimeout(ordersTimer);
      ordersTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing remittance order details...');
        if (selectedRemittance && selectedRemittance.order_ids.length > 0) {
          fetchOrderDetails(selectedRemittance.order_ids);
        }
      }, 300);
    };

    // Subscribe to remittances_log changes
    const remittancesChannel = supabase
      .channel(`remittances-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'remittances_log',
        },
        (payload) => {
          console.log('🔔 Remittance change detected:', payload.eventType, payload);
          debouncedRemittanceRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for remittances_log');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for remittances_log');
        }
      });

    // Subscribe to client_orders changes (for order details when viewing)
    const ordersChannel = supabase
      .channel(`remittance-orders-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'client_orders',
        },
        (payload) => {
          console.log('🔔 Order change detected (remittance view):', payload.eventType, payload);
          debouncedOrdersRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for client_orders (remittance view)');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for client_orders');
        }
      });

    return () => {
      if (remittanceTimer) clearTimeout(remittanceTimer);
      if (ordersTimer) clearTimeout(ordersTimer);
      supabase.removeChannel(remittancesChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [user?.id, user?.role, selectedDate, selectedAgentId, selectedRemittance]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, selectedAgentId]);

  // Fetch team agents for filter (team leaders only)
  useEffect(() => {
    if (!user?.id || user?.role !== 'team_leader') return;
    (async () => {
      const { data, error } = await supabase
        .from('leader_teams')
        .select(`
          agent_id,
          profiles!leader_teams_agent_id_fkey (id, full_name)
        `)
        .eq('leader_id', user.id);
      if (error) {
        console.error('Error fetching team agents:', error);
        return;
      }
      const list = (data || [])
        .map((r: any) => ({
          id: r.agent_id,
          name: r.profiles?.full_name || 'Unknown'
        }))
        .filter((a: { id: string; name: string }) => a.id);
      setTeamAgents(list);
    })();
  }, [user?.id, user?.role]);

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
      // Apply agent filter if selected
      if (selectedAgentId && selectedAgentId !== 'all') {
        query = query.eq('agent_id', selectedAgentId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const remittanceRows = data || [];

      // Collect all unique order IDs across remittances
      const allOrderIds = Array.from(
        new Set(
          remittanceRows.flatMap((item: any) => item.order_ids || [])
        )
      );

      // Map of order_id -> cash/cheque remittance amount (for that order)
      const cashRevenueByOrder: Record<string, number> = {};

      if (allOrderIds.length > 0) {
        const { data: ordersData, error: ordersError } = await supabase
          .from('client_orders')
          .select('id, total_amount, payment_method, payment_mode, payment_splits')
          .in('id', allOrderIds);

        if (ordersError) throw ordersError;

        (ordersData || []).forEach((order: any) => {
          const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
          const paymentMethod = order.payment_method as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | null;
          const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

          let cashPortion = 0;
          let chequePortion = 0;

          if (paymentMode === 'SPLIT') {
            splits.forEach((s: any) => {
              if (s.method === 'CASH') {
                cashPortion += s.amount || 0;
              } else if (s.method === 'CHEQUE') {
                chequePortion += s.amount || 0;
              }
            });
          } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
            const amt = order.total_amount || 0;
            if (paymentMethod === 'CASH') {
              cashPortion = amt;
            } else {
              chequePortion = amt;
            }
          }

          const remittanceAmount = cashPortion + chequePortion;
          cashRevenueByOrder[order.id] = remittanceAmount;
        });
      }

      const formattedData: RemittanceLog[] = remittanceRows.map((item: any) => {
        const orderIds: string[] = item.order_ids || [];
        const calculatedRevenue = orderIds.reduce((sum: number, orderId: string) => {
          return sum + (cashRevenueByOrder[orderId] || 0);
        }, 0);

        return {
          id: item.id,
          agent_id: item.agent_id,
          leader_id: item.leader_id,
          remittance_date: item.remittance_date,
          remitted_at: item.remitted_at,
          items_remitted: item.items_remitted,
          total_units: item.total_units,
          orders_count: item.orders_count,
          // Use calculated cash/cheque revenue when available, otherwise fall back to stored total_revenue
          total_revenue: calculatedRevenue > 0 ? calculatedRevenue : item.total_revenue,
          order_ids: orderIds,
          signature_url: item.signature_url,
          signature_path: item.signature_path,
          agent_name: item.agent?.full_name || 'Unknown Agent'
        };
      });

      if (!formattedData.length) {
        setRemittances([]);
      } else {
        setRemittances(formattedData);
      }
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
          payment_method,
          payment_mode,
          payment_splits,
          created_at,
          clients(name),
          items:client_order_items(
            quantity,
            variant:variants(name, brand:brands(name))
          )
        `)
        .in('id', orderIds);

      if (error) throw error;

      const formattedOrders = (data || []).flatMap((order: any) => {
        const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
        const paymentMethod = order.payment_method as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | null;
        const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

        let cashPortion = 0;
        let chequePortion = 0;
        let nonCashPortion = 0;
        const nonCashLabels: string[] = [];

        if (paymentMode === 'SPLIT') {
          splits.forEach((s: any) => {
            const amount = s.amount || 0;
            if (s.method === 'CASH') {
              cashPortion += amount;
            } else if (s.method === 'CHEQUE') {
              chequePortion += amount;
            } else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
              nonCashPortion += amount;
              if (s.method === 'BANK_TRANSFER') {
                if (s.bank && !nonCashLabels.includes(s.bank)) {
                  nonCashLabels.push(s.bank);
                } else if (!s.bank && !nonCashLabels.includes('Bank Transfer')) {
                  nonCashLabels.push('Bank Transfer');
                }
              } else if (s.method === 'GCASH' && !nonCashLabels.includes('GCash')) {
                nonCashLabels.push('GCash');
              }
            }
          });
        } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
          const amt = order.total_amount || 0;
          if (paymentMethod === 'CASH') {
            cashPortion = amt;
          } else {
            chequePortion = amt;
          }
        }

        const remittanceAmount = cashPortion + chequePortion;

        return (order.items || []).map((item: any) => ({
          orderId: order.id,
          orderNumber: order.order_number,
          clientName: order.clients?.name || 'Unknown',
          variantName: item.variant?.name || 'Unknown',
          brandName: item.variant?.brand?.name || 'Unknown',
          quantity: item.quantity,
          // Amount remitted for this order (cash + cheque portions only)
          totalAmount: remittanceAmount,
          // Full order total for reference
          fullOrderTotal: order.total_amount,
          cashPortion,
          chequePortion,
          paymentMode,
          paymentMethod,
          nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
          nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined,
          createdAt: order.created_at
        }));
      });

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

  const fetchUnsoldItems = async (remittance: RemittanceLog) => {
    // NEW BEHAVIOR: Agents now keep their unsold inventory
    // No inventory is transferred during remittance, so unsold items section shows informational message
    setLoadingUnsoldItems(false);
    setUnsoldItems([]);
  };

  // Helper function to calculate correct cash/cheque revenue from order details
  const calculateCashRevenue = (): number => {
    if (remittanceOrders.length === 0) {
      return selectedRemittance?.total_revenue || 0;
    }
    // Sum unique orders' remittance amounts (cash + cheque portions only)
    return Array.from(new Set(remittanceOrders.map(o => o.orderId)))
      .reduce((sum, orderId) => {
        const order = remittanceOrders.find(o => o.orderId === orderId);
        return sum + (order?.totalAmount || 0);
      }, 0);
  };

  // Helper to check for missing orders
  useEffect(() => {
    if (!loadingDetails && remittanceOrders.length === 0 && selectedRemittance && selectedRemittance.orders_count > 0) {
      console.warn(`Mismatch detected: Remittance has ${selectedRemittance.orders_count} orders but 0 were fetched. This is likely an RLS issue.`);
    }
  }, [loadingDetails, remittanceOrders, selectedRemittance]);

  const handleViewDetails = async (remittance: RemittanceLog) => {
    setSelectedRemittance(remittance);
    setViewDialogOpen(true);

    // Fetch unsold items (always fetch, even if 0 items)
    await fetchUnsoldItems(remittance);

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

  const totalPages = Math.max(1, Math.ceil(totalRemittances / PAGE_SIZE));
  const paginatedRemittances = remittances.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const rangeStart = totalRemittances === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalRemittances);

  if (!canLeadTeam(user?.role)) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <p>This page is only available for team leaders and managers.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Team Remittances</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Track team remittances
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          {/* Agent Filter */}
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger className="w-full md:w-[200px] h-9 md:h-10 text-sm">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {teamAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Date Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal h-9 md:h-10 text-sm">
                <CalendarIcon className="mr-2 h-3 w-3 md:h-4 md:w-4" />
                {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : <span>Filter by date</span>}
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
                    className="w-full text-xs md:text-sm"
                    onClick={() => setSelectedDate(undefined)}
                  >
                    Clear filter
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium truncate">Remittances</CardTitle>
            <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-lg md:text-2xl font-bold">{totalRemittances}</div>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              From team
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium truncate">Items</CardTitle>
            <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-lg md:text-2xl font-bold">{totalItems}</div>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              {totalUnits} units
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium truncate">Orders</CardTitle>
            <ShoppingCart className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-lg md:text-2xl font-bold">{totalOrders}</div>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              Completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
            <CardTitle className="text-xs md:text-sm font-medium truncate">Revenue</CardTitle>
            <ShoppingCart className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground flex-shrink-0" />
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0">
            <div className="text-lg md:text-2xl font-bold">₱{(totalRevenue / 1000).toFixed(0)}k</div>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              Remitted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Remittances Table */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Team Remittances</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Loading...</p>
            </div>
          ) : remittances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm md:text-base">No remittances found</p>
              {(selectedDate || (selectedAgentId && selectedAgentId !== 'all')) && (
                <p className="text-xs md:text-sm mt-2">
                  Try selecting a different date/agent or clear the filters
                </p>
              )}
            </div>
          ) : isMobile ? (
            // Mobile Cards View
            <div className="space-y-3">
              {paginatedRemittances.map((remittance) => (
                <Card key={remittance.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{remittance.agent_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(remittance.remitted_at), 'MMM dd, yyyy • hh:mm a')}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2 text-[10px] h-5 flex-shrink-0">
                        {remittance.items_remitted} items
                      </Badge>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
                      <div className="p-2 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground">Units</div>
                        <div className="font-semibold">{remittance.total_units}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/50">
                        <div className="text-[10px] text-muted-foreground">Orders</div>
                        <div className="font-semibold">{remittance.orders_count}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-green-50 border border-green-200">
                        <div className="text-[10px] text-muted-foreground">Revenue</div>
                        <div className="font-semibold text-green-600">₱{(remittance.total_revenue / 1000).toFixed(0)}k</div>
                      </div>
                    </div>

                    {/* View Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => handleViewDetails(remittance)}
                    >
                      <Eye className="mr-2 h-3 w-3" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            // Desktop Table View
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
                {paginatedRemittances.map((remittance) => (
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
          {remittances.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-sm text-muted-foreground">
              <span>
                Showing {rangeStart}–{rangeEnd} of {totalRemittances}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="px-2 min-w-[4rem] text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      {isMobile ? (
        <Sheet open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Cash Remittance Details</SheetTitle>
                  <SheetDescription className="text-xs">
                    CASH deposit details and orders
                  </SheetDescription>
                </SheetHeader>

                {selectedRemittance && (
                  <div className="space-y-4">
                    {/* Header Info */}
                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted rounded-lg text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Agent</p>
                        <p className="font-semibold text-xs truncate">{selectedRemittance.agent_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Date</p>
                        <p className="font-semibold text-xs">
                          {format(new Date(selectedRemittance.remitted_at), 'MMM dd, yyyy')}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-muted-foreground">Time</p>
                        <p className="font-semibold text-xs">
                          {format(new Date(selectedRemittance.remitted_at), 'hh:mm a')}
                        </p>
                      </div>
                    </div>

                    {/* Tabs for Details */}
                    <Tabs defaultValue="summary" className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="summary" className="text-[10px] py-2">
                          Summary
                        </TabsTrigger>
                        <TabsTrigger value="orders" className="text-[10px] py-2">
                          Orders ({selectedRemittance.orders_count})
                        </TabsTrigger>
                        <TabsTrigger value="signature" className="text-[10px] py-2">
                          Signature
                        </TabsTrigger>
                      </TabsList>

                      {/* Summary Tab */}
                      <TabsContent value="summary" className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-3">
                              <div className="text-[10px] text-green-600 mb-1">Orders</div>
                              <div className="text-lg font-bold text-green-700">{selectedRemittance.orders_count}</div>
                            </CardContent>
                          </Card>

                          <Card className="bg-green-50 border-green-200">
                            <CardContent className="p-3">
                              <div className="text-[10px] text-green-600 mb-1">Revenue</div>
                              <div className="text-lg font-bold text-green-700">₱{(calculateCashRevenue() / 1000).toFixed(0)}k</div>
                            </CardContent>
                          </Card>

                          <Card className="bg-blue-50 border-blue-200 col-span-2">
                            <CardContent className="p-3">
                              <div className="text-[10px] text-blue-600 mb-1">Policy</div>
                              <div className="text-xs font-medium text-blue-700">Cash Only - Stock Retained</div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                          <h4 className="font-semibold text-xs mb-2 text-blue-900">Summary</h4>
                          <ul className="text-[10px] space-y-1 text-blue-800">
                            <li>✓ {selectedRemittance.items_remitted} items ({selectedRemittance.total_units} units) returned</li>
                            <li>✓ {selectedRemittance.orders_count} orders • ₱{calculateCashRevenue().toLocaleString()}</li>
                            <li>✓ Signature verified</li>
                          </ul>
                        </div>
                      </TabsContent>


                      {/* Orders Tab */}
                      <TabsContent value="orders" className="space-y-3">
                        {loadingDetails ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : remittanceOrders.length > 0 ? (
                          <>
                            <div className="space-y-2">
                              {/* Group orders by orderId */}
                              {Array.from(new Set(remittanceOrders.map(o => o.orderId))).map((orderId) => {
                                const orderItems = remittanceOrders.filter(o => o.orderId === orderId);
                                const firstItem = orderItems[0];
                                
                                return (
                                  <Card key={orderId} className="border">
                                    <CardContent className="p-3">
                                      {/* Header */}
                                      <div className="flex justify-between items-start mb-2 pb-2 border-b">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-mono text-[10px] text-muted-foreground">
                                            {firstItem.orderNumber}
                                          </div>
                                          <div className="font-medium text-xs truncate">{firstItem.clientName}</div>
                                        </div>
                                        <div className="text-right ml-2 flex-shrink-0">
                                          <div className="text-sm font-bold text-green-600">
                                            ₱{firstItem.totalAmount.toFixed(2)}
                                          </div>
                                          {firstItem.paymentMode === 'SPLIT' && (firstItem.cashPortion > 0 || firstItem.chequePortion > 0) && (
                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                              {firstItem.cashPortion > 0 && `Cash ₱${firstItem.cashPortion.toFixed(2)}`}
                                              {firstItem.chequePortion > 0 && (
                                                <>
                                                  {firstItem.cashPortion > 0 ? ' • ' : ''}
                                                  {`Cheque ₱${firstItem.chequePortion.toFixed(2)}`}
                                                </>
                                              )}
                                            </div>
                                          )}
                                          {firstItem.paymentMode === 'SPLIT' && firstItem.fullOrderTotal && (
                                            <div className="text-[10px] text-muted-foreground">
                                              Order ₱{firstItem.fullOrderTotal.toFixed(2)} (bank/GCash handled by Finance)
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Items */}
                                      <div className="space-y-1">
                                        {orderItems.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-[10px]">
                                            <span className="truncate flex-1">{item.brandName} - {item.variantName}</span>
                                            <span className="ml-2 font-medium flex-shrink-0">×{item.quantity}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="border rounded-lg p-3 text-center">
                                <p className="text-[10px] text-muted-foreground">Orders</p>
                                <p className="text-lg font-bold">{new Set(remittanceOrders.map(o => o.orderId)).size}</p>
                              </div>
                              <div className="border rounded-lg p-3 text-center">
                                <p className="text-[10px] text-muted-foreground">Revenue</p>
                                <p className="text-lg font-bold text-green-600">
                                  ₱{(Array.from(new Set(remittanceOrders.map(o => o.orderId)))
                                    .reduce((sum, orderId) => {
                                      const order = remittanceOrders.find(o => o.orderId === orderId);
                                      return sum + (order?.totalAmount || 0);
                                    }, 0) / 1000).toFixed(0)}k
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">No orders found</p>
                          </div>
                        )}
                      </TabsContent>

                      {/* Signature Tab */}
                      <TabsContent value="signature" className="space-y-3">
                        {selectedRemittance.signature_url ? (
                          <div className="space-y-3">
                            <div className="border rounded-lg p-3 bg-green-50 border-green-200">
                              <div className="flex items-center gap-2 text-green-700 mb-1">
                                <FileSignature className="h-4 w-4" />
                                <span className="text-xs font-semibold">Signature Verified</span>
                              </div>
                              <p className="text-[10px] text-green-600">
                                Agent signature captured on {format(new Date(selectedRemittance.remitted_at), 'MMM dd, yyyy')}
                              </p>
                            </div>

                            <div className="flex justify-center items-center border rounded-lg p-4 bg-background">
                              <img
                                src={selectedRemittance.signature_url}
                                alt="Agent Signature"
                                className="max-h-40 max-w-full object-contain"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">No signature available</p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* Close Button */}
                    <div className="sticky bottom-0 bg-background pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setViewDialogOpen(false)}
                        className="w-full h-10 text-xs"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cash Remittance Details</DialogTitle>
              <DialogDescription>
                Showing CASH deposit details and orders remitted by the agent
              </DialogDescription>
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
                      💰 Cash Orders ({selectedRemittance.orders_count})
                    </TabsTrigger>
                    <TabsTrigger value="signature">
                      ✍️ Signature
                    </TabsTrigger>
                  </TabsList>

                  {/* Summary Tab */}
                  <TabsContent value="summary" className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-blue-50 border-blue-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Inventory Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-lg font-bold text-blue-700">Retained</div>
                          <p className="text-xs text-blue-600">Agent keeps unsold stock</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-blue-50 border-blue-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">New Policy</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm font-medium text-blue-700">Cash Only</div>
                          <p className="text-xs text-blue-600">Only cash proceeds remitted</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-green-50 border-green-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Cash Orders</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-700">{selectedRemittance.orders_count}</div>
                          <p className="text-xs text-green-600">Transactions</p>
                        </CardContent>
                      </Card>

                      <Card className="bg-green-50 border-green-200">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Cash Revenue</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-700">
                            ₱{calculateCashRevenue().toLocaleString()}
                          </div>
                          <p className="text-xs text-green-600">To be deposited</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                      <h4 className="font-semibold mb-2 text-blue-900">Remittance Summary</h4>
                      <ul className="text-sm space-y-1 text-blue-800">
                        <li>✓ {selectedRemittance.items_remitted} items ({selectedRemittance.total_units} units) returned as unsold</li>
                        <li>✓ {selectedRemittance.orders_count} orders sold totaling ₱{calculateCashRevenue().toLocaleString()}</li>
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
                                    <TableHead className="text-right">Remittance Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(() => {
                                    // Group by order, then by brand for cleaner UI
                                    const grouped: Record<string, any[]> = {};
                                    remittanceOrders.forEach((row) => {
                                      if (!grouped[row.orderId]) {
                                        grouped[row.orderId] = [];
                                      }
                                      grouped[row.orderId].push(row);
                                    });

                                    const orderIds = Object.keys(grouped);

                                    return orderIds.flatMap((orderId) => {
                                      const rows = grouped[orderId];
                                      const first = rows[0];

                                      // Further group by brand inside each order
                                      const byBrand: Record<string, any[]> = {};
                                      rows.forEach((r) => {
                                        const brand = r.brandName || 'Unknown Brand';
                                        if (!byBrand[brand]) byBrand[brand] = [];
                                        byBrand[brand].push(r);
                                      });
                                      const brands = Object.keys(byBrand);

                                      return brands.flatMap((brand, brandIndex) => {
                                        const brandRows = byBrand[brand];
                                        return brandRows.map((row, rowIndex) => (
                                          <TableRow key={`${row.orderId}-${brand}-${rowIndex}`}>
                                            <TableCell className="font-mono text-sm">
                                              {brandIndex === 0 && rowIndex === 0 ? row.orderNumber : ''}
                                            </TableCell>
                                            <TableCell>
                                              {brandIndex === 0 && rowIndex === 0 ? row.clientName : ''}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                              {brand} - {row.variantName}
                                            </TableCell>
                                            <TableCell className="text-right">{row.quantity}</TableCell>
                                            <TableCell className="text-right font-semibold align-top">
                                              {brandIndex === 0 && rowIndex === 0 ? (
                                                <div className="space-y-1">
                                                  <div>₱{first.totalAmount.toFixed(2)}</div>
                                                  {first.paymentMode === 'SPLIT' && (first.cashPortion > 0 || first.chequePortion > 0) && (
                                                    <div className="text-xs text-muted-foreground">
                                                      {first.cashPortion > 0 && `Cash ₱${first.cashPortion.toFixed(2)}`}
                                                      {first.chequePortion > 0 && (
                                                        <>
                                                          {first.cashPortion > 0 ? ' • ' : ''}
                                                          {`Cheque ₱${first.chequePortion.toFixed(2)}`}
                                                        </>
                                                      )}
                                                    </div>
                                                  )}
                                                  {first.paymentMode === 'SPLIT' && first.fullOrderTotal && first.nonCashPortion && first.nonCashPortion > 0 && (
                                                    <div className="text-[10px] text-muted-foreground">
                                                      {first.nonCashLabel || 'Non-cash'} ₱{first.nonCashPortion.toFixed(2)} (handled by Finance)
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                ''
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ));
                                      });
                                    });
                                  })()}
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
      )}
    </div>
  );
}
