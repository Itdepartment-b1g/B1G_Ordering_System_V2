import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Package, DollarSign, TrendingUp, Activity, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Profile } from '@/types/database.types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

export default function SuperAdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalInventory: 0,
    totalStock: 0,
    totalAllocated: 0,
    totalAvailable: 0,
    totalRevenue: 0,
    pendingRevenue: 0,
    totalCombinedRevenue: 0,
  });
  const [recentUsers, setRecentUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<{ 
    month: string; 
    approvedRevenue: number; 
    pendingRevenue: number 
  }[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (companyId) {
      fetchAvailableYears();
      fetchDashboardData();
    } else if (user) {
      // User exists but no company_id - stop loading to prevent infinite loading state
      console.warn('⚠️ [SuperAdminDashboard] User has no company_id, skipping data fetch');
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (companyId && selectedYear) {
      fetchDashboardData();
    }
  }, [selectedYear, user]);

  const fetchAvailableYears = async () => {
    const companyId = (user as any)?.company_id;
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('client_orders')
        .select('order_date')
        .eq('company_id', companyId)
        .eq('stage', 'admin_approved')
        .not('order_date', 'is', null);

      if (error) throw error;

      // Extract unique years from order dates
      const years = new Set<number>();
      if (data) {
        data.forEach((order: any) => {
          if (order.order_date) {
            const year = new Date(order.order_date).getFullYear();
            years.add(year);
          }
        });
      }

      // Add current year if no orders exist
      const currentYear = new Date().getFullYear();
      if (years.size === 0) {
        years.add(currentYear);
      }

      const sortedYears = Array.from(years).sort((a, b) => b - a); // Descending order
      setAvailableYears(sortedYears);

      // Set default year to current year or most recent year with data
      if (!selectedYear || !years.has(selectedYear)) {
        setSelectedYear(sortedYears[0] || currentYear);
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
    }
  };

  const fetchDashboardData = async () => {
    const companyId = (user as any)?.company_id;
    if (!companyId || !selectedYear) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      // Calculate start and end dates for the selected year
      const yearStart = new Date(selectedYear, 0, 1); // January 1st
      const yearEnd = new Date(selectedYear, 11, 31); // December 31st
      const yearStartIso = yearStart.toISOString().split('T')[0];
      const yearEndIso = yearEnd.toISOString().split('T')[0];

      // Fetch users, main inventory, and approved/pending orders in parallel
      const [
        { data: profiles, error: profilesError },
        { data: mainInventoryRows, error: inventoryError },
        { data: approvedOrders, error: ordersError },
        { data: pendingOrders, error: pendingError },
        { data: monthlyOrders, error: monthlyError },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, company_id, full_name, email, role, status, created_at, updated_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        supabase
          .from('main_inventory')
          .select('stock, allocated_stock')
          .eq('company_id', companyId),
        supabase
          .from('client_orders')
          .select('total_amount')
          .eq('company_id', companyId)
          .eq('status', 'approved')
          .gte('order_date', yearStartIso)
          .lte('order_date', yearEndIso),
        // Total pending orders revenue for selected year
        supabase
          .from('client_orders')
          .select('total_amount')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .gte('order_date', yearStartIso)
          .lte('order_date', yearEndIso),
        // Monthly revenue for bar chart (selected year) - both approved and pending
        supabase
          .from('client_orders')
          .select('total_amount, order_date, status')
          .eq('company_id', companyId)
          .in('status', ['approved', 'pending'])
          .gte('order_date', yearStartIso)
          .lte('order_date', yearEndIso),
      ]);

      if (profilesError) throw profilesError;

      const activeProfiles = profiles?.filter(p => p.status === 'active') || [];
      const recentProfiles = profiles?.slice(0, 5) || [];

      // Inventory: total stock, allocated, available (from main_inventory)
      let totalStock = 0;
      let totalAllocated = 0;
      if (!inventoryError && mainInventoryRows?.length) {
        totalStock = mainInventoryRows.reduce((sum, row) => sum + (row.stock ?? 0), 0);
        totalAllocated = mainInventoryRows.reduce((sum, row) => sum + (row.allocated_stock ?? 0), 0);
      }
      const totalAvailable = Math.max(0, totalStock - totalAllocated);

      // Revenue: sum of total_amount from all approved orders
      let totalRevenue = 0;
      if (!ordersError && approvedOrders?.length) {
        totalRevenue = approvedOrders.reduce((sum, o) => sum + (Number(o.total_amount) ?? 0), 0);
      }

      // Pending Revenue: sum of total_amount from all pending orders
      let pendingRevenue = 0;
      if (!pendingError && pendingOrders?.length) {
        pendingRevenue = pendingOrders.reduce((sum, o) => sum + (Number(o.total_amount) ?? 0), 0);
      }

      // Total Combined Revenue (Approved + Pending)
      const totalCombinedRevenue = totalRevenue + pendingRevenue;

      // Build monthly revenue data for chart (last 12 months, sorted chronologically)
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      if (!monthlyError) {
        // Initialize all 12 months with 0 revenue for both categories
        const approvedByMonth: Record<string, number> = {};
        const pendingByMonth: Record<string, number> = {};
        monthNames.forEach(month => {
          approvedByMonth[month] = 0;
          pendingByMonth[month] = 0;
        });

        // Add actual revenue data from orders (filter by selected year and stage)
        if (monthlyOrders?.length) {
          monthlyOrders.forEach((o: any) => {
            const orderDate = new Date(o.order_date);
            const orderYear = orderDate.getFullYear();
            
            // Only include orders from the selected year
            if (orderYear === selectedYear) {
              const month = orderDate.toLocaleString('default', { month: 'short' });
              const amount = Number(o.total_amount) || 0;
              
              if (o.status === 'approved' && approvedByMonth.hasOwnProperty(month)) {
                approvedByMonth[month] += amount;
              } else if (o.status === 'pending' && pendingByMonth.hasOwnProperty(month)) {
                pendingByMonth[month] += amount;
              }
            }
          });
        }

        // Create chart data in chronological order (Jan to Dec)
        const chartData = monthNames.map(month => ({
          month,
          approvedRevenue: approvedByMonth[month] || 0,
          pendingRevenue: pendingByMonth[month] || 0,
        }));

        console.log('📊 Revenue chart data:', chartData);
        setRevenueData(chartData);
      } else {
        console.log('⚠️ No monthly revenue data:', { monthlyError, monthlyOrders });
        // Still show all months with 0 revenue
        const chartData = monthNames.map(month => ({
          month,
          approvedRevenue: 0,
          pendingRevenue: 0,
        }));
        setRevenueData(chartData);
      }

      setStats({
        totalUsers: profiles?.length || 0,
        activeUsers: activeProfiles.length,
        totalInventory: totalStock,
        totalStock,
        totalAllocated,
        totalAvailable,
        totalRevenue,
        pendingRevenue,
        totalCombinedRevenue,
      });

      setRecentUsers(recentProfiles);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      finance: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      manager: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      team_leader: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      mobile_sales: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    };

    return (
      <Badge className={roleColors[role] || 'bg-gray-100 text-gray-800'}>
        {role.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-4 text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {user?.full_name || user?.email}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalStock.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Total stock · {stats.totalAllocated.toLocaleString()} allocated · {stats.totalAvailable.toLocaleString()} available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue from Pending Orders</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{stats.pendingRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              For year {selectedYear}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value (Pending + Approved)</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{stats.totalCombinedRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              For year {selectedYear}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From approved orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Revenue Overview</CardTitle>
          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => setSelectedYear(parseInt(value))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {revenueData.length === 0 ? (
            <div className="w-full h-[250px] md:h-[300px] flex items-center justify-center text-muted-foreground">
              <p>No revenue data available for {selectedYear}</p>
            </div>
          ) : (
            <div className="w-full h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [
                      `₱${value.toLocaleString()}`, 
                      name === 'approvedRevenue' ? 'Approved' : 'Pending'
                    ]} 
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value: string) => value === 'approvedRevenue' ? 'Approved' : 'Pending'}
                  />
                  <Bar dataKey="approvedRevenue" fill="#3b82f6" name="approvedRevenue" /> {/* Blue */}
                  <Bar dataKey="pendingRevenue" fill="#f97316" name="pendingRevenue" /> {/* Orange */}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Users */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                recentUsers.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.full_name}</TableCell>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>{getRoleBadge(profile.role)}</TableCell>
                    <TableCell>
                      <Badge variant={profile.status === 'active' ? 'default' : 'secondary'}>
                        {profile.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(profile.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

