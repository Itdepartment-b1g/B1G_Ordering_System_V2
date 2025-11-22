import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';

export default function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [allActivities, setAllActivities] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    fetchFinancialData();

    // Real-time subscription
    const channel = subscribeToTable('financial_transactions', () => {
      fetchFinancialData();
    });

    return () => unsubscribe(channel);
  }, []);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);

      // Get all financial transactions (for expenses only, revenue now comes from client_orders)
      const { data: transactions } = await supabase
        .from('financial_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      // Calculate total revenue from admin-approved client orders (same as Dashboard)
      const { data: approvedOrdersForRevenue } = await supabase
        .from('client_orders')
        .select('total_amount')
        .eq('stage', 'admin_approved');

      const revenue = (approvedOrdersForRevenue || []).reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

      // Expenses will be based on approved purchase orders' total_amount
      // but we keep existing expense/commission stream for other costs.
      const { data: approvedPOs } = await supabase
        .from('purchase_orders')
        .select('total_amount, status')
        .eq('status', 'approved');

      const poExpenses = (approvedPOs || [])
        .reduce((sum: number, po: any) => sum + (Number(po.total_amount) || 0), 0);

      const otherExpenses = (transactions || [])
        .filter(t => t.transaction_type === 'expense' && t.status === 'completed')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      setTotalRevenue(revenue);
      setTotalExpenses(poExpenses + otherExpenses);
      setTotalProfit(revenue - (poExpenses + otherExpenses));

      // Group by month for charts (combine revenue txns, expense txns, and approved POs)
      const last6Months = new Date();
      last6Months.setMonth(last6Months.getMonth() - 5);

      const monthKey = (d: any) => new Date(d).toLocaleString('default', { month: 'short' });
      const monthlyStats: any = {};

      // Seed last 6 months so empty months still render
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleString('default', { month: 'short' });
        monthlyStats[key] = { month: key, revenue: 0, expenses: 0, profit: 0 };
      }

      // Revenue from admin-approved client orders (same as Dashboard)
      const sixMonthsAgoIso = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString();
      const { data: monthlyApproved } = await supabase
        .from('client_orders')
        .select('total_amount, order_date')
        .eq('stage', 'admin_approved')
        .gte('order_date', sixMonthsAgoIso);

      (monthlyApproved || []).forEach((o: any) => {
        const key = monthKey(o.order_date);
        monthlyStats[key].revenue += o.total_amount || 0;
      });

      // Expenses from financial transactions (expense type only)
      (transactions || [])
        .filter(t => new Date(t.transaction_date) >= last6Months)
        .forEach((t: any) => {
          const key = monthKey(t.transaction_date);
          if (t.transaction_type === 'expense' && t.status === 'completed') {
            monthlyStats[key].expenses += t.amount || 0;
          }
        });

      // Expenses from approved purchase orders
      (approvedPOs || []).forEach((po: any) => {
        const date = po.approved_at || po.updated_at || po.created_at || new Date();
        if (new Date(date) >= last6Months) {
          const key = monthKey(date);
          monthlyStats[key].expenses += Number(po.total_amount) || 0;
        }
      });

      // Compute profit
      Object.values(monthlyStats).forEach((m: any) => {
        m.profit = m.revenue - m.expenses;
      });

      setMonthlyData(Object.values(monthlyStats));

      // Recent transactions - combine approved client orders and approved purchase orders
      const recentActivities: any[] = [];

      // 1. Get recent admin-approved client orders (limit to 3 for balanced view)
      console.log('🔍 Fetching approved client orders...');
      const { data: recentClientOrders, error: clientOrdersError } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          total_amount,
          order_date,
          status,
          stage,
          agent_id,
          client_id,
          clients (
            name
          ),
          profiles!agent_id (
            full_name
          )
        `)
        .eq('stage', 'admin_approved')
        .order('order_date', { ascending: false })
        .limit(3);
      
      if (clientOrdersError) {
        console.error('❌ Error fetching client orders:', clientOrdersError);
      } else {
        console.log('✅ Client orders fetched successfully:', recentClientOrders);
      }

      // Add approved client orders
      console.log('📋 Recent client orders:', recentClientOrders);
      (recentClientOrders || []).forEach((order: any) => {
        console.log(`📋 Order ${order.order_number}: client=${order.clients?.name}, agent=${order.profiles?.full_name}`);
        recentActivities.push({
          id: `client-order-${order.id}`,
          type: 'Client Order',
          order: order.order_number,
          client: order.clients?.name || 'Unknown Client',
          agent: order.profiles?.full_name || 'No agent',
          amount: order.total_amount,
          date: new Date(order.order_date),
          status: 'approved',
          icon: '📋'
        });
      });

      // 2. Get recent approved purchase orders (limit to 2 for balanced view)
      const { data: recentPurchaseOrders } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          total_amount,
          approved_at,
          updated_at,
          status,
          supplier_id
        `)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(2);

      // Add approved purchase orders
      console.log('📦 Recent purchase orders:', recentPurchaseOrders);
      (recentPurchaseOrders || []).forEach((po: any) => {
        console.log(`📦 PO ${po.po_number}: approved_at=${po.approved_at}, updated_at=${po.updated_at}`);
        recentActivities.push({
          id: `purchase-order-${po.id}`,
          type: 'Purchase Order',
          order: po.po_number,
          client: 'B1G Corporation',
          agent: 'No agent',
          amount: po.total_amount,
          date: new Date(po.approved_at || po.updated_at),
          status: 'approved',
          icon: '📦'
        });
      });

      // Sort all activities by date (most recent first)
      const sortedActivities = recentActivities
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map(activity => ({
          ...activity,
          date: activity.date.toLocaleDateString()
        }));

      setAllActivities(sortedActivities);
      // Initialize first page
      setCurrentPage(1);
      setRecentTransactions(sortedActivities.slice(0, pageSize));

    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading financial data...</div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(allActivities.length / pageSize));
  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(clamped);
    const start = (clamped - 1) * pageSize;
    const end = start + pageSize;
    setRecentTransactions(allActivities.slice(start, end));
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Finance Dashboard</h1>
        <p className="text-muted-foreground">Track revenue, expenses, and financial performance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalRevenue.toLocaleString()}</div>
            <div className="flex items-center text-xs text-black mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>From all orders</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalExpenses.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <span>Operating costs</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {totalProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₱{totalProfit.toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <span>{totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}% margin</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {monthlyData.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Revenue vs Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend wrapperStyle={{ display: 'none' }} />
                  <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (₱)" />
                  <Bar dataKey="expenses" fill="#ef4444" name="Expenses (₱)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Profit Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend wrapperStyle={{ display: 'none' }} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit (₱)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Financial Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Client/Supplier</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No recent activities yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentTransactions.map(t => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{t.icon}</span>
                            <span className="text-sm font-medium">{t.type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{t.order}</TableCell>
                        <TableCell>{t.client}</TableCell>
                        <TableCell>{t.agent || '-'}</TableCell>
                        <TableCell className="font-bold">
                          ₱{t.amount.toLocaleString()}
                        </TableCell>
                        <TableCell>{t.date}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              t.status === 'paid' || t.status === 'approved' 
                                ? 'default' 
                                : 'secondary'
                            }
                          >
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
              {allActivities.length > pageSize && (
                <div className="mt-4 flex items-center justify-between">
                  <Button variant="secondary" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Previous</Button>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Page</span>
                    <span className="font-medium text-black">{currentPage}</span>
                    <span>of</span>
                    <span className="font-medium text-black">{totalPages}</span>
                  </div>
                  <Button variant="secondary" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</Button>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
