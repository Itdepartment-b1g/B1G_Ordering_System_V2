import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ChevronLeft, Calendar as CalendarIcon, Download, Loader2, Package, TrendingUp, Filter, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, getWeek, getWeekOfMonth, isSameMonth, isSameYear, isWithinInterval, parseISO } from 'date-fns';

export default function ClientAnalyticsPage() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);

  // Raw Data (All time)
  const [allOrders, setAllOrders] = useState<any[]>([]);

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or '0'-'11'
  const [selectedWeek, setSelectedWeek] = useState<string>('all'); // 'all' or week number '1', '2', etc.
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  // Derived Data (Filtered)
  const [lineGraphData, setLineGraphData] = useState<any[]>([]);
  const [brandData, setBrandData] = useState<any[]>([]);
  const [variantData, setVariantData] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalSpent: 0, totalQty: 0 });
  const [yearlyStats, setYearlyStats] = useState<{ year: number, spent: number }[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<{ month: string, spent: number }[]>([]);

  // Order Detail Dialog
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
      fetchAllOrders();
    }
  }, [clientId]);

  useEffect(() => {
    if (allOrders.length > 0) {
      processData();
    }
  }, [allOrders, selectedYear, selectedMonth, selectedWeek, selectedBrand]);

  const fetchClientDetails = async () => {
    try {
      const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
      if (error) throw error;
      setClient(data);
    } catch (error: any) {
      console.error('Error fetching client:', error);
      toast({ title: 'Error', description: 'Failed to load client details', variant: 'destructive' });
      navigate('/clients');
    }
  };

  const fetchAllOrders = async () => {
    setLoading(true);
    try {
      // Fetch ALL approved orders for this client to enable client-side filtering and y-o-y comparison
      const { data, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          created_at,
          total_amount,
          status,
          stage,
          order_number,
          items:client_order_items (
            quantity,
            unit_price,
            variant_id,
            variants (
              name,
              brand_id,
              brands (name)
            )
          )
        `)
        .eq('client_id', clientId)
        .or('stage.eq.admin_approved,status.eq.approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllOrders(data || []);
    } catch (error: any) {
      console.error('Error fetching analytics data:', error);
      toast({ title: 'Error', description: 'Failed to load analytics data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const processData = () => {
    // 1. Calculate Yearly Stats (2025, 2026, etc.) - Unfiltered by Brand/Month/Week
    const yearlyMap = new Map<number, number>();
    allOrders.forEach(order => {
      const year = new Date(order.created_at).getFullYear();
      yearlyMap.set(year, (yearlyMap.get(year) || 0) + (order.total_amount || 0));
    });
    const yearlyStatsData = Array.from(yearlyMap.entries())
      .map(([year, spent]) => ({ year, spent }))
      .sort((a, b) => b.year - a.year);
    setYearlyStats(yearlyStatsData);

    // 2. Filter Orders based on selected filters
    let currentFiltered = allOrders.filter(order => {
      const date = new Date(order.created_at);
      const yearMatch = date.getFullYear().toString() === selectedYear;
      if (!yearMatch) return false;

      // Month Filter
      if (selectedMonth !== 'all') {
        if (date.getMonth().toString() !== selectedMonth) return false;
      }

      // Week Filter
      if (selectedWeek !== 'all') {
        // User definition: Week 1 = Days 1-7, Week 2 = 8-14, etc.
        const dayOfMonth = date.getDate();
        const week = Math.ceil(dayOfMonth / 7);
        if (week.toString() !== selectedWeek) return false;
      }

      // Brand Filter
      if (selectedBrand) {
        // Check if order has any item from this brand
        const hasBrand = order.items.some((item: any) => item.variants?.brands?.name === selectedBrand);
        if (!hasBrand) return false;
      }

      return true;
    });

    setFilteredOrders(currentFiltered);

    // 3. Calculate Summary (Total Spent & Qty from filtered orders)
    let totalSpent = 0;
    let totalQty = 0;

    // We need to re-calculate amounts if filtering by Brand, because an order might contain mixed brands.
    // If filtering by Brand, we should only count the portion of the order that matches the brand?
    // User requirement: "if we click example on one brand everything will be filtered to that brand"
    // Usually means we only show stats for that brand.
    
    const brandMap = new Map<string, number>();
    const variantMap = new Map<string, { quantity: number, spent: number, brand: string }>();

    currentFiltered.forEach(order => {
      let orderSpent = 0;
      let orderQty = 0;

      order.items.forEach((item: any) => {
        const brandName = item.variants?.brands?.name || 'Unknown';
        
        // If brand filter is active, only count items for that brand
        if (selectedBrand && brandName !== selectedBrand) return;

        const qty = item.quantity || 0;
        const price = item.unit_price || 0;
        const cost = qty * price;

        orderSpent += cost;
        orderQty += qty;

        // Brand Stats (for Chart)
        brandMap.set(brandName, (brandMap.get(brandName) || 0) + cost);

        // Variant Stats
        const variantName = item.variants?.name || 'Unknown';
        const currentVariant = variantMap.get(variantName) || { quantity: 0, spent: 0, brand: brandName };
        variantMap.set(variantName, {
          quantity: currentVariant.quantity + qty,
          spent: currentVariant.spent + cost,
          brand: brandName
        });
      });

      totalSpent += orderSpent;
      totalQty += orderQty;
    });

    setSummary({ totalSpent, totalQty });

    const brands = Array.from(brandMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    setBrandData(brands);

    const variants = Array.from(variantMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.spent - a.spent);
    setVariantData(variants);

    // 4. Monthly Breakdown Stats (for the selected Year) - Unfiltered by Month/Week but filtered by Brand if selected
    // This allows seeing "Jan = X, Feb = Y" even if "Jan" is selected in filter? 
    // Usually "Monthly Breakdown" shows all months for context.
    // So we use 'allOrders' filtered by Year and Brand only (ignoring Month/Week filter for this specific stat container).
    const monthlyStatsMap = new Map<string, number>();
    const monthsInYear = eachMonthOfInterval({
      start: startOfYear(new Date(parseInt(selectedYear), 0, 1)),
      end: endOfYear(new Date(parseInt(selectedYear), 0, 1))
    });
    
    // Initialize months
    monthsInYear.forEach(m => monthlyStatsMap.set(format(m, 'MMM'), 0));

    allOrders.forEach(order => {
       const date = new Date(order.created_at);
       if (date.getFullYear().toString() !== selectedYear) return;

       let orderSpent = 0;
       if (selectedBrand) {
         // Only count brand items
         order.items.forEach((item: any) => {
            if (item.variants?.brands?.name === selectedBrand) {
              orderSpent += (item.quantity * item.unit_price);
            }
         });
       } else {
         orderSpent = order.total_amount || 0;
       }
       
       const key = format(date, 'MMM');
       monthlyStatsMap.set(key, (monthlyStatsMap.get(key) || 0) + orderSpent);
    });

    setMonthlyStats(Array.from(monthlyStatsMap.entries()).map(([month, spent]) => ({ month, spent })));

    // 5. Line Graph Data (Timeline)
    // Depending on filters: 
    // - If Month is ALL: Show Monthly Trend (Jan-Dec)
    // - If Month is SELECTED: Show Daily Trend (1-31)
    // - If Week is SELECTED: Show Daily Trend for that week
    
    // Determine Start/End for graph
    let graphStart: Date;
    let graphEnd: Date;
    let isDaily = false;

    if (selectedMonth === 'all') {
      graphStart = startOfYear(new Date(parseInt(selectedYear), 0, 1));
      graphEnd = endOfYear(new Date(parseInt(selectedYear), 0, 1));
      isDaily = false; // Monthly view
    } else {
      graphStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth), 1));
      graphEnd = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth), 1));
      isDaily = true; // Daily view
      
      if (selectedWeek !== 'all') {
        const weekNum = parseInt(selectedWeek);
        const startDay = (weekNum - 1) * 7 + 1;
        // Ensure start day is valid
        if (startDay <= endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth))).getDate()) {
             graphStart = new Date(parseInt(selectedYear), parseInt(selectedMonth), startDay);
             
             let endDay = weekNum * 7;
             // Cap end day at month end
             const lastDayOfMonth = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth))).getDate();
             if (endDay > lastDayOfMonth) endDay = lastDayOfMonth;
             
             graphEnd = new Date(parseInt(selectedYear), parseInt(selectedMonth), endDay);
        }
      }
    }

    const graphMap = new Map<string, number>();
    if (isDaily) {
      const days = eachDayOfInterval({ start: graphStart, end: graphEnd });
      days.forEach(d => graphMap.set(format(d, 'd'), 0));
    } else {
      const months = eachMonthOfInterval({ start: graphStart, end: graphEnd });
      months.forEach(m => graphMap.set(format(m, 'MMM'), 0));
    }

    // Populate Graph
    // Use 'currentFiltered' which respects all filters (Year, Month, Week, Brand)
    currentFiltered.forEach(order => {
      const date = new Date(order.created_at);
      const key = isDaily ? format(date, 'd') : format(date, 'MMM');
      
      let amount = 0;
      if (selectedBrand) {
         order.items.forEach((item: any) => {
            if (item.variants?.brands?.name === selectedBrand) {
              amount += (item.quantity * item.unit_price);
            }
         });
      } else {
        amount = order.total_amount || 0;
      }
      
      graphMap.set(key, (graphMap.get(key) || 0) + amount);
    });

    setLineGraphData(Array.from(graphMap.entries()).map(([name, value]) => ({ name, value })));
  };

  const handleOrderClick = (order: any) => {
    // If brand filter is active, we might want to show only those items? 
    // Or just show full order. Detailed view usually implies full context. 
    // Let's show full order but maybe highlight filtered items? 
    // For now showing full order is safer to avoid confusion about order totals.
    setSelectedOrder(order);
    setOrderDetailOpen(true);
  };



  // Generate Week Options based on selected Month
  const getWeekOptions = () => {
    if (selectedMonth === 'all') return []; 
    
    // We strictly define 5 weeks max: 1-7, 8-14, 15-21, 22-28, 29-End
    const daysInMonth = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth))).getDate();
    const weeksCount = Math.ceil(daysInMonth / 7);
    
    const options = [];
    for (let i = 1; i <= weeksCount; i++) {
        let start = (i - 1) * 7 + 1;
        let end = i * 7;
        if (end > daysInMonth) end = daysInMonth;
        
        // Suffix handling for labels
        const getOrdinal = (n: number) => {
            const s = ["th", "st", "nd", "rd"];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        options.push({
            value: i.toString(),
            label: `Week ${i} (${getOrdinal(start)} - ${getOrdinal(end)})`
        });
    }
    return options;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto pb-32">
       {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Client Analytics</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="font-semibold text-foreground">{client?.name}</span>
              <span>•</span>
              <span>{client?.company || 'No Company'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
           {selectedBrand && (
             <Badge variant="secondary" className="h-10 px-3 cursor-pointer hover:bg-destructive/10 hover:text-destructive flex items-center gap-2" onClick={() => setSelectedBrand(null)}>
               Brand: {selectedBrand}
               <X className="h-3 w-3" />
             </Badge>
           )}
           <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3].map(i => {
                const year = new Date().getFullYear() - i;
                return <SelectItem key={year} value={year.toString()}>{year}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setSelectedWeek('all'); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => (
                <SelectItem key={index} value={index.toString()}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMonth !== 'all' && (
             <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Week" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Weeks</SelectItem>
                {getWeekOptions().map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

       {loading ? (
        <div className="flex items-center justify-center h-64">
           <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
      



           {/* Main Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Line Graph */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Spending Trend {selectedBrand ? `(${selectedBrand})` : ''}
                </CardTitle>
                <CardDescription>
                  {selectedMonth === 'all' ? 'Monthly' : 'Daily'} Spending 
                   {selectedWeek !== 'all' ? ` (Week ${selectedWeek}: ${
                     selectedWeek === '1' ? '1st-7th' :
                     selectedWeek === '2' ? '8th-14th' :
                     selectedWeek === '3' ? '15th-21st' :
                     selectedWeek === '4' ? '22nd-28th' :
                     '29th-End'
                   })` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineGraphData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} minTickGap={30} />
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`} />
                      <RechartsTooltip 
                        formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Spent']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Brand Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Spending by Brand</CardTitle>
                <CardDescription>Click a bar to filter dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={brandData} 
                      layout="vertical" 
                      margin={{ left: 20 }} 
                      onClick={(data) => {
                         if (data && data.activePayload && data.activePayload.length > 0) {
                           const clickedBrand = data.activePayload[0].payload.name;
                           setSelectedBrand(selectedBrand === clickedBrand ? null : clickedBrand);
                         }
                      }}
                      className="cursor-pointer"
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                      <RechartsTooltip formatter={(value: number) => [`₱${value.toLocaleString()}`, 'Spent']} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                        {brandData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={selectedBrand === entry.name ? '#2563eb' : '#8884d8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Order History */}
             <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Order History
                </CardTitle>
                <CardDescription>
                  {filteredOrders.length} orders found {selectedBrand ? `containing ${selectedBrand}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          No orders found matching filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.map((order) => (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleOrderClick(order)}>
                          <TableCell className="font-mono text-xs">{order.order_number || order.id.slice(0, 8)}</TableCell>
                          <TableCell>{format(new Date(order.created_at), 'MMM d')}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{order.stage === 'admin_approved' ? 'Completed' : order.status}</Badge></TableCell>
                          <TableCell className="text-right font-medium">₱{order.total_amount.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Variant Breakdown */}
             <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle>Variant Analysis</CardTitle>
                <CardDescription>Top variants {selectedBrand ? `for ${selectedBrand}` : ''}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Spent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variantData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No data available</TableCell>
                      </TableRow>
                    ) : (
                      variantData.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{v.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{v.brand}</TableCell>
                          <TableCell className="text-center">{v.quantity}</TableCell>
                          <TableCell className="text-right">₱{v.spent.toLocaleString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Summary Footer */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-background border-t p-4 shadow-lg z-10 flex justify-between items-center px-8">
         <div className="flex gap-8">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Filtered Total Paid</p>
              <p className="text-2xl font-bold text-primary">₱{summary.totalSpent.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Filtered Quantity</p>
              <p className="text-2xl font-bold text-foreground">{summary.totalQty.toLocaleString()}</p>
            </div>
         </div>

      </div>

      {/* Order Dialog - Redesigned */}
       <Dialog open={orderDetailOpen} onOpenChange={setOrderDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          {selectedOrder && (
            <>
              {/* Header */}
              <div className="p-6 border-b bg-muted/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight">
                      Order {selectedOrder.order_number || selectedOrder.id.slice(0, 8)}
                    </h2>
                    <Badge 
                      variant={selectedOrder.stage === 'admin_approved' ? 'default' : 'secondary'}
                      className="uppercase text-[10px] tracking-wider"
                    >
                      {selectedOrder.stage === 'admin_approved' ? 'Completed' : selectedOrder.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {format(new Date(selectedOrder.created_at), 'MMMM d, yyyy')} 
                    <span className="text-muted-foreground/50">•</span>
                    {format(new Date(selectedOrder.created_at), 'h:mm a')}
                  </p>
                </div>
                
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6">
                 {/* Items Grouped by Brand */}
                 <div className="space-y-8">
                    {Object.entries(
                      selectedOrder.items.reduce((acc: any, item: any) => {
                        const brand = item.variants?.brands?.name || 'Unbranded';
                        if (!acc[brand]) acc[brand] = [];
                        acc[brand].push(item);
                        return acc;
                      }, {})
                    ).map(([brand, items]: [string, any]) => (
                      <div key={brand} className="space-y-3">
                         <div className="flex items-center gap-2 pb-2 border-b">
                            <Badge variant="outline" className="font-semibold">{brand}</Badge>
                         </div>
                         <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="w-[50%]">Item</TableHead>
                                <TableHead className="text-center">Price</TableHead>
                                <TableHead className="text-center">Stocks</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((item: any, idx: number) => (
                                <TableRow key={idx} className="hover:bg-muted/50 border-none">
                                  <TableCell className="py-2">
                                    <span className="font-medium text-sm">{item.variants?.name}</span>
                                  </TableCell>
                                  <TableCell className="text-center py-2 text-muted-foreground">₱{item.unit_price.toLocaleString()}</TableCell>
                                  <TableCell className="text-center py-2 font-medium">{item.quantity}</TableCell>
                                  <TableCell className="text-right py-2 font-medium">
                                    ₱{(item.quantity * item.unit_price).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                         </Table>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-muted/20 border-t flex justify-between items-center text-sm text-muted-foreground">
                 <div>
                   <span>{selectedOrder.items.length} unique items</span>
                   <span className="mx-2">•</span>
                   <span>{selectedOrder.items.reduce((acc: number, i: any) => acc + i.quantity, 0)} total units</span>
                 </div>
                 <Button variant="ghost" size="sm" onClick={() => setOrderDetailOpen(false)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
