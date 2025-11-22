import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { 
  TrendingUp, 
  TrendingDown, 
  MapPin, 
  Package, 
  Users, 
  Target,
  Brain,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Award,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CalendarIcon,
  X
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { format, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth';

// Types
interface CityPerformance {
  city: string;
  orders: number;
  revenue: number;
  clients: number;
  growth: number;
}

interface ProductPerformance {
  brand: string;
  variant: string;
  orders: number;
  quantity: number;
  revenue: number;
  trend: 'up' | 'down' | 'stable';
}

interface AgentKPI {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  clients: number;
  avgOrderValue: number;
  conversionRate: number;
  performance: 'excellent' | 'good' | 'average' | 'needs_improvement';
  // Target values (set by leader/admin)
  targetClients?: number | null;
  targetRevenue?: number | null;
  targetQty?: number | null;
  // Actual values (calculated from current month data)
  actualClients?: number; // Clients created this month
  actualRevenue?: number; // Revenue from approved orders this month
  actualQty?: number; // Total quantity from approved orders this month
  // Achievement percentages
  achievementClients?: number; // Percentage (actualClients / targetClients * 100)
  achievementRevenue?: number; // Percentage (actualRevenue / targetRevenue * 100)
  achievementQty?: number; // Percentage (actualQty / targetQty * 100)
  // Legacy field (keeping for backward compatibility)
  targetOrders?: number | null;
  targetAchievement?: number;
}

interface AIInsight {
  type: 'opportunity' | 'warning' | 'suggestion' | 'success';
  category: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  actionable: string;
}

interface VariantSales {
  variantName: string;
  quantity: number;
  orderCount: number;
  clients: string[]; // Array of client names
}

interface BrandOption {
  id: string;
  name: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function AnalyticsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isLeader = user?.position === 'Leader';
  
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Analytics Data
  const [cityPerformance, setCityPerformance] = useState<CityPerformance[]>([]);
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [agentKPIs, setAgentKPIs] = useState<AgentKPI[]>([]);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  
  // Summary Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [revenueGrowth, setRevenueGrowth] = useState(0);
  
  // Agent Detail Dialog State
  const [agentDetailDialogOpen, setAgentDetailDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentKPI | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [variantSales, setVariantSales] = useState<VariantSales[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  
  // Date Range Filter State
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  
  // Target Management State
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetInputs, setTargetInputs] = useState<Record<string, {
    targetClients?: number | null;
    targetRevenue?: number | null;
    targetQty?: number | null;
  }>>({});
  const [savingTargets, setSavingTargets] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    if (user) {
      fetchAnalyticsData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, user?.position]);

  // Auto-generate insights when data is loaded
  useEffect(() => {
    if (!isAdmin) return;
    if (!loading && cityPerformance.length > 0 && productPerformance.length > 0 && agentKPIs.length > 0) {
      generateAIInsights();
    }
  }, [loading, cityPerformance.length, productPerformance.length, agentKPIs.length, isAdmin]);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        await Promise.all([
          fetchCityPerformance(),
          fetchProductPerformance(),
          fetchAgentKPIs(),
          fetchSummaryStats()
        ]);
      } else if (isLeader) {
        await fetchAgentKPIs();
      } else {
        // Other roles currently have no analytics access
        setAgentKPIs([]);
      }
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSummaryStats = async () => {
    try {
      // Current month
      const currentMonthStart = startOfMonth(new Date());
      const currentMonthEnd = endOfMonth(new Date());
      
      // Previous month
      const prevMonthStart = startOfMonth(subMonths(new Date(), 1));
      const prevMonthEnd = endOfMonth(subMonths(new Date(), 1));

      // Current month orders (using stage = 'admin_approved' for completed orders)
      const { data: currentOrders, error: currentError } = await supabase
        .from('client_orders')
        .select('total_amount')
        .gte('created_at', currentMonthStart.toISOString())
        .lte('created_at', currentMonthEnd.toISOString())
        .eq('stage', 'admin_approved');

      if (currentError) throw currentError;

      // Previous month orders
      const { data: prevOrders, error: prevError } = await supabase
        .from('client_orders')
        .select('total_amount')
        .gte('created_at', prevMonthStart.toISOString())
        .lte('created_at', prevMonthEnd.toISOString())
        .eq('stage', 'admin_approved');

      if (prevError) throw prevError;

      const currentRevenue = currentOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const prevRevenue = prevOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const currentOrderCount = currentOrders?.length || 0;

      const growth = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;
      const avgValue = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0;

      setTotalRevenue(currentRevenue);
      setTotalOrders(currentOrderCount);
      setAvgOrderValue(avgValue);
      setRevenueGrowth(growth);
    } catch (error) {
      console.error('Error fetching summary stats:', error);
    }
  };

  const fetchCityPerformance = async () => {
    try {
      // Get all completed orders with client city information
      const { data: orders, error: ordersError } = await supabase
        .from('client_orders')
        .select(`
          id,
          total_amount,
          stage,
          created_at,
          client_id,
          clients!inner(
            id,
            city
          )
        `)
        .eq('stage', 'admin_approved');

      if (ordersError) throw ordersError;

      // Calculate this month and last month for growth
      const currentMonthStart = startOfMonth(new Date());
      const prevMonthStart = startOfMonth(subMonths(new Date(), 1));

      // Group by city
      const cityMap = new Map<string, {
        orders: number;
        revenue: number;
        clients: Set<string>;
        currentMonthRevenue: number;
        prevMonthRevenue: number;
      }>();

      orders?.forEach((order: any) => {
        const city = order.clients?.city || 'Unknown';
        if (!cityMap.has(city)) {
          cityMap.set(city, {
            orders: 0,
            revenue: 0,
            clients: new Set(),
            currentMonthRevenue: 0,
            prevMonthRevenue: 0
          });
        }

        const cityData = cityMap.get(city)!;
        cityData.clients.add(order.client_id);
        cityData.orders += 1;
        cityData.revenue += order.total_amount || 0;

        const orderDate = new Date(order.created_at);
        if (orderDate >= currentMonthStart) {
          cityData.currentMonthRevenue += order.total_amount || 0;
        } else if (orderDate >= prevMonthStart && orderDate < currentMonthStart) {
          cityData.prevMonthRevenue += order.total_amount || 0;
        }
      });

      // Convert to array with growth calculation
      const cityPerformanceData: CityPerformance[] = Array.from(cityMap.entries()).map(([city, data]) => {
        const growth = data.prevMonthRevenue > 0 
          ? ((data.currentMonthRevenue - data.prevMonthRevenue) / data.prevMonthRevenue) * 100 
          : data.currentMonthRevenue > 0 ? 100 : 0;

        return {
          city,
          orders: data.orders,
          revenue: data.revenue,
          clients: data.clients.size,
          growth
        };
      });

      // Sort by revenue
      cityPerformanceData.sort((a, b) => b.revenue - a.revenue);

      setCityPerformance(cityPerformanceData);
    } catch (error) {
      console.error('Error fetching city performance:', error);
    }
  };

  const fetchProductPerformance = async () => {
    try {
      // Get all order items with variant and brand info from approved orders only
      const { data: orderItems, error } = await supabase
        .from('client_order_items')
        .select(`
          quantity,
          unit_price,
          client_orders!inner(stage, created_at),
          variants!inner(
            name,
            variant_type,
            brands!inner(name)
          )
        `)
        .eq('client_orders.stage', 'admin_approved');

      if (error) throw error;

      // Get previous month date for trend calculation
      const prevMonthStart = startOfMonth(subMonths(new Date(), 1));

      // Group by brand and variant
      const productMap = new Map<string, {
        brand: string;
        variant: string;
        orders: number;
        quantity: number;
        revenue: number;
        currentMonthOrders: number;
        prevMonthOrders: number;
      }>();

      orderItems?.forEach((item: any) => {
        const brand = item.variants?.brands?.name || 'Unknown';
        const variant = item.variants?.name || 'Unknown';
        const key = `${brand}|${variant}`;

        if (!productMap.has(key)) {
          productMap.set(key, {
            brand,
            variant,
            orders: 0,
            quantity: 0,
            revenue: 0,
            currentMonthOrders: 0,
            prevMonthOrders: 0
          });
        }

        const productData = productMap.get(key)!;
        productData.orders += 1;
        productData.quantity += item.quantity || 0;
        productData.revenue += (item.quantity || 0) * (item.unit_price || 0);

        const orderDate = new Date(item.client_orders.created_at);
        if (orderDate >= prevMonthStart) {
          productData.currentMonthOrders += 1;
        } else {
          productData.prevMonthOrders += 1;
        }
      });

      // Convert to array with trend
      const productPerformanceData: ProductPerformance[] = Array.from(productMap.values()).map(data => {
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (data.currentMonthOrders > data.prevMonthOrders) trend = 'up';
        else if (data.currentMonthOrders < data.prevMonthOrders) trend = 'down';

        return {
          brand: data.brand,
          variant: data.variant,
          orders: data.orders,
          quantity: data.quantity,
          revenue: data.revenue,
          trend
        };
      });

      // Sort by revenue
      productPerformanceData.sort((a, b) => b.revenue - a.revenue);

      setProductPerformance(productPerformanceData);
    } catch (error) {
      console.error('Error fetching product performance:', error);
    }
  };

  const fetchAgentKPIs = async () => {
    try {
      let agentsQuery = supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'sales_agent');

      if (isLeader && user?.id) {
        const { data: teamData, error: teamError } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);

        if (teamError) throw teamError;

        const agentIds = (teamData || []).map((member: any) => member.agent_id).filter(Boolean);

        if (agentIds.length === 0) {
          setAgentKPIs([]);
          return;
        }

        agentsQuery = agentsQuery.in('id', agentIds);
      }

      const { data: agents, error: agentsError } = await agentsQuery;

      if (agentsError) throw agentsError;

      // Get current month range for target calculation
      const currentMonthStart = startOfMonth(new Date());
      const currentMonthEnd = endOfMonth(new Date());
      const currentMonthFirstDay = currentMonthStart.toISOString().split('T')[0]; // Format: YYYY-MM-DD

      // Fetch all targets for current month
      const agentIds = (agents || []).map(a => a.id);
      const { data: targets, error: targetsError } = await supabase
        .from('agent_monthly_targets')
        .select('agent_id, target_clients, target_revenue, target_qty, target_orders')
        .eq('target_month', currentMonthFirstDay)
        .in('agent_id', agentIds);

      if (targetsError) {
        console.error('Error fetching targets:', targetsError);
        // Continue without targets if there's an error
      }

      // Create maps for targets
      const targetsMap = new Map<string, {
        targetClients?: number | null;
        targetRevenue?: number | null;
        targetQty?: number | null;
        targetOrders?: number | null;
      }>();
      (targets || []).forEach((t: any) => {
        targetsMap.set(t.agent_id, {
          targetClients: t.target_clients ?? null,
          targetRevenue: t.target_revenue ? parseFloat(t.target_revenue) : null,
          targetQty: t.target_qty ?? null,
          targetOrders: t.target_orders ?? null
        });
      });

      // Get orders for each agent
      const agentKPIsData: AgentKPI[] = await Promise.all(
        (agents || []).map(async (agent) => {
          // Get all approved orders (admin_approved stage) for total stats
          const { data: allOrders } = await supabase
            .from('client_orders')
            .select('id, total_amount, client_id, created_at')
            .eq('agent_id', agent.id)
            .eq('stage', 'admin_approved');

          // Get current month orders for target achievement calculation
          const { data: currentMonthOrders } = await supabase
            .from('client_orders')
            .select('id, total_amount, client_id')
            .eq('agent_id', agent.id)
            .eq('stage', 'admin_approved')
            .gte('created_at', currentMonthStart.toISOString())
            .lte('created_at', currentMonthEnd.toISOString());

          // Get current month clients (clients created this month)
          const { data: currentMonthClients } = await supabase
            .from('clients')
            .select('id')
            .eq('agent_id', agent.id)
            .gte('created_at', currentMonthStart.toISOString())
            .lte('created_at', currentMonthEnd.toISOString());

          // Get current month order items to calculate total quantity
          const { data: currentMonthOrderItems } = await supabase
            .from('client_order_items')
            .select('quantity, client_orders!inner(agent_id, stage, created_at)')
            .eq('client_orders.agent_id', agent.id)
            .eq('client_orders.stage', 'admin_approved')
            .gte('client_orders.created_at', currentMonthStart.toISOString())
            .lte('client_orders.created_at', currentMonthEnd.toISOString());

          // Calculate actual values for current month
          const actualClients = currentMonthClients?.length || 0;
          const actualRevenue = currentMonthOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
          const actualQty = currentMonthOrderItems?.reduce((sum, item: any) => sum + (item.quantity || 0), 0) || 0;

          // Get unique clients (all time)
          const uniqueClients = new Set(allOrders?.map(o => o.client_id) || []);

          // Get total clients assigned to this agent (all time)
          const { data: totalClients } = await supabase
            .from('clients')
            .select('id')
            .eq('agent_id', agent.id);

          const totalOrders = allOrders?.length || 0;
          const totalRevenue = allOrders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
          const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
          const conversionRate = totalClients && totalClients.length > 0 
            ? (uniqueClients.size / totalClients.length) * 100 
            : 0;

          // Get targets
          const agentTargets = targetsMap.get(agent.id) || {
            targetClients: null,
            targetRevenue: null,
            targetQty: null,
            targetOrders: null
          };

          // Calculate achievement percentages
          const achievementClients = agentTargets.targetClients && agentTargets.targetClients > 0
            ? (actualClients / agentTargets.targetClients) * 100
            : undefined;

          const achievementRevenue = agentTargets.targetRevenue && agentTargets.targetRevenue > 0
            ? (actualRevenue / agentTargets.targetRevenue) * 100
            : undefined;

          const achievementQty = agentTargets.targetQty && agentTargets.targetQty > 0
            ? (actualQty / agentTargets.targetQty) * 100
            : undefined;

          // Legacy achievement calculation (for backward compatibility)
          const targetOrders = agentTargets.targetOrders;
          const currentMonthOrderCount = currentMonthOrders?.length || 0;
          const targetAchievement = targetOrders && targetOrders > 0
            ? (currentMonthOrderCount / targetOrders) * 100
            : undefined;

          // Determine performance
          let performance: 'excellent' | 'good' | 'average' | 'needs_improvement' = 'average';
          if (totalRevenue > 100000 && conversionRate > 50) performance = 'excellent';
          else if (totalRevenue > 50000 && conversionRate > 30) performance = 'good';
          else if (totalRevenue < 20000 || conversionRate < 15) performance = 'needs_improvement';

          return {
            id: agent.id,
            name: agent.full_name || 'Unknown',
            orders: totalOrders,
            revenue: totalRevenue,
            clients: uniqueClients.size,
            avgOrderValue,
            conversionRate,
            performance,
            // Target values
            targetClients: agentTargets.targetClients,
            targetRevenue: agentTargets.targetRevenue,
            targetQty: agentTargets.targetQty,
            // Actual values
            actualClients,
            actualRevenue,
            actualQty,
            // Achievement percentages
            achievementClients: achievementClients !== undefined ? Math.round(achievementClients) : undefined,
            achievementRevenue: achievementRevenue !== undefined ? Math.round(achievementRevenue) : undefined,
            achievementQty: achievementQty !== undefined ? Math.round(achievementQty) : undefined,
            // Legacy fields
            targetOrders,
            targetAchievement: targetAchievement !== undefined ? Math.round(targetAchievement) : undefined
          };
        })
      );

      // Sort by revenue
      agentKPIsData.sort((a, b) => b.revenue - a.revenue);

      setAgentKPIs(agentKPIsData);
    } catch (error) {
      console.error('Error fetching agent KPIs:', error);
    }
  };

  const fetchBrands = async () => {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setBrands(data || []);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  };

  const fetchVariantSalesForAgent = async (agentId: string, brandId: string) => {
    if (!brandId) return;
    
    setLoadingVariants(true);
    try {
      // Get all variants for this brand
      const { data: variants, error: variantsError } = await supabase
        .from('variants')
        .select('id, name')
        .eq('brand_id', brandId);
      
      if (variantsError) throw variantsError;

      // Build query for approved order items
      let query = supabase
        .from('client_order_items')
        .select(`
          variant_id,
          quantity,
          client_orders!inner (
            agent_id,
            stage,
            created_at,
            clients!inner (
              name
            )
          )
        `)
        .eq('client_orders.agent_id', agentId)
        .eq('client_orders.stage', 'admin_approved');

      // Apply date filters if set
      if (dateFrom) {
        query = query.gte('client_orders.created_at', startOfDay(dateFrom).toISOString());
      }
      if (dateTo) {
        query = query.lte('client_orders.created_at', endOfDay(dateTo).toISOString());
      }

      const { data: orderItems, error: itemsError } = await query;
      
      if (itemsError) throw itemsError;

      // Build variant sales map with client tracking
      const salesMap = new Map<string, { quantity: number; orderCount: number; clients: Set<string> }>();
      
      (orderItems || []).forEach((item: any) => {
        const variantId = item.variant_id;
        const clientName = item.client_orders?.clients?.name || 'Unknown Client';
        const existing = salesMap.get(variantId) || { quantity: 0, orderCount: 0, clients: new Set<string>() };
        
        salesMap.set(variantId, {
          quantity: existing.quantity + item.quantity,
          orderCount: existing.orderCount + 1,
          clients: existing.clients.add(clientName)
        });
      });

      // Combine with variant names
      const variantSalesData: VariantSales[] = (variants || [])
        .map((variant) => {
          const sales = salesMap.get(variant.id) || { quantity: 0, orderCount: 0, clients: new Set<string>() };
          return {
            variantName: variant.name,
            quantity: sales.quantity,
            orderCount: sales.orderCount,
            clients: Array.from(sales.clients)
          };
        })
        .filter(v => v.quantity > 0) // Only show variants with sales
        .sort((a, b) => b.quantity - a.quantity); // Sort by quantity descending

      setVariantSales(variantSalesData);
    } catch (error) {
      console.error('Error fetching variant sales:', error);
      toast({
        title: 'Error',
        description: 'Failed to load variant sales data',
        variant: 'destructive'
      });
    } finally {
      setLoadingVariants(false);
    }
  };

  const handleViewAgentDetails = async (agent: AgentKPI) => {
    setSelectedAgent(agent);
    setSelectedBrand('');
    setVariantSales([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setAgentDetailDialogOpen(true);
    
    // Fetch brands when dialog opens
    await fetchBrands();
  };

  const handleBrandChange = async (brandId: string) => {
    setSelectedBrand(brandId);
    if (selectedAgent && brandId) {
      await fetchVariantSalesForAgent(selectedAgent.id, brandId);
    }
  };

  const handleDateFilterChange = async () => {
    if (selectedAgent && selectedBrand) {
      await fetchVariantSalesForAgent(selectedAgent.id, selectedBrand);
    }
  };

  const handleClearDateFilter = async () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    if (selectedAgent && selectedBrand) {
      await fetchVariantSalesForAgent(selectedAgent.id, selectedBrand);
    }
  };

  const handleOpenTargetDialog = () => {
    // Initialize target inputs with current targets
    const initialTargets: Record<string, {
      targetClients?: number | null;
      targetRevenue?: number | null;
      targetQty?: number | null;
    }> = {};
    agentKPIs.forEach(agent => {
      initialTargets[agent.id] = {
        targetClients: agent.targetClients ?? null,
        targetRevenue: agent.targetRevenue ?? null,
        targetQty: agent.targetQty ?? null
      };
    });
    setTargetInputs(initialTargets);
    setTargetDialogOpen(true);
  };

  // Helper function to format number with commas (no decimals)
  const formatNumberWithCommas = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    // Format as integer with commas only
    return Math.floor(value).toLocaleString('en-US');
  };

  // Helper function to parse formatted number (remove commas)
  const parseFormattedNumber = (value: string): string => {
    return value.replace(/,/g, '');
  };

  const handleTargetInputChange = (agentId: string, field: 'targetClients' | 'targetRevenue' | 'targetQty', value: string) => {
    // Remove commas and any decimal points from input
    const cleanedValue = parseFormattedNumber(value).replace(/\./g, '');
    
    let numValue: number | null = null;
    if (cleanedValue !== '') {
      const parsed = parseInt(cleanedValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        numValue = parsed;
      } else {
        // Invalid input, don't update
        return;
      }
    }
    setTargetInputs(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: numValue
      }
    }));
  };

  const handleSaveTarget = async (agentId: string) => {
    const targets = targetInputs[agentId];
    
    if (!targets || (!targets.targetClients && !targets.targetRevenue && !targets.targetQty)) {
      toast({
        title: 'Invalid Target',
        description: 'Please set at least one target (Clients, Revenue, or Qty)',
        variant: 'destructive'
      });
      return;
    }

    setSavingTargets(prev => new Set(prev).add(agentId));
    try {
      const currentMonthFirstDay = startOfMonth(new Date()).toISOString().split('T')[0];
      
      // Use upsert to insert or update
      const { error } = await supabase
        .from('agent_monthly_targets')
        .upsert({
          agent_id: agentId,
          target_month: currentMonthFirstDay,
          target_clients: targets.targetClients,
          target_revenue: targets.targetRevenue,
          target_qty: targets.targetQty
        }, {
          onConflict: 'agent_id,target_month'
        });

      if (error) throw error;

      toast({
        title: 'Target Saved',
        description: `Targets saved for ${agentKPIs.find(a => a.id === agentId)?.name}`,
      });

      // Refetch to get accurate achievement percentages
      await fetchAgentKPIs();
    } catch (error: any) {
      console.error('Error saving target:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save target',
        variant: 'destructive'
      });
    } finally {
      setSavingTargets(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  const handleSaveAllTargets = async () => {
    const targetsToSave = Object.entries(targetInputs).filter(([_, targets]) => 
      targets && (targets.targetClients || targets.targetRevenue || targets.targetQty)
    );
    
    if (targetsToSave.length === 0) {
      toast({
        title: 'No Targets',
        description: 'Please set at least one target before saving',
        variant: 'destructive'
      });
      return;
    }

    setSavingTargets(new Set(targetsToSave.map(([id]) => id)));
    try {
      const currentMonthFirstDay = startOfMonth(new Date()).toISOString().split('T')[0];
      
      // Prepare upsert data
      const targetsData = targetsToSave.map(([agentId, targets]) => ({
        agent_id: agentId,
        target_month: currentMonthFirstDay,
        target_clients: targets?.targetClients ?? null,
        target_revenue: targets?.targetRevenue ?? null,
        target_qty: targets?.targetQty ?? null
      }));

      // Use upsert to insert or update all targets
      const { error } = await supabase
        .from('agent_monthly_targets')
        .upsert(targetsData, {
          onConflict: 'agent_id,target_month'
        });

      if (error) throw error;

      toast({
        title: 'Targets Saved',
        description: `Successfully saved ${targetsToSave.length} target(s) for this month`,
      });

      // Refetch to get accurate achievement percentages
      await fetchAgentKPIs();
      
      // Close dialog
      setTargetDialogOpen(false);
    } catch (error: any) {
      console.error('Error saving targets:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save targets',
        variant: 'destructive'
      });
    } finally {
      setSavingTargets(new Set());
    }
  };

  const generateAIInsights = useCallback(async () => {
    if (!isAdmin) return;
    setAnalyzing(true);
    try {
      const insights: AIInsight[] = [];

      // City Insights
      if (cityPerformance.length > 0) {
        const topCity = cityPerformance[0];
        const lowestCity = cityPerformance[cityPerformance.length - 1];

        insights.push({
          type: 'success',
          category: 'Geographic',
          title: `${topCity.city} is Your Top Market`,
          description: `${topCity.city} generates ₱${topCity.revenue.toLocaleString()} (${((topCity.revenue / totalRevenue) * 100).toFixed(1)}% of total revenue) with ${topCity.clients} active clients.`,
          impact: 'high',
          actionable: `Consider expanding your agent team in ${topCity.city} to capitalize on this strong market.`
        });

        if (lowestCity.orders < topCity.orders * 0.2) {
          insights.push({
            type: 'opportunity',
            category: 'Geographic',
            title: `Untapped Potential in ${lowestCity.city}`,
            description: `${lowestCity.city} only has ${lowestCity.orders} orders compared to ${topCity.orders} in ${topCity.city}.`,
            impact: 'medium',
            actionable: `Deploy marketing campaigns or assign dedicated agents to ${lowestCity.city} to boost sales.`
          });
        }

        // Growth opportunities
        const growingCities = cityPerformance.filter(c => c.growth > 20);
        if (growingCities.length > 0) {
          insights.push({
            type: 'success',
            category: 'Growth',
            title: `${growingCities.length} Cities Showing Strong Growth`,
            description: growingCities.map(c => `${c.city} (+${c.growth.toFixed(1)}%)`).join(', '),
            impact: 'high',
            actionable: 'Increase inventory allocation to these high-growth cities to meet rising demand.'
          });
        }

        const decliningCities = cityPerformance.filter(c => c.growth < -10);
        if (decliningCities.length > 0) {
          insights.push({
            type: 'warning',
            category: 'Retention',
            title: `${decliningCities.length} Cities Declining`,
            description: decliningCities.map(c => `${c.city} (${c.growth.toFixed(1)}%)`).join(', '),
            impact: 'high',
            actionable: 'Investigate customer satisfaction and competitive pressure in these markets.'
          });
        }
      }

      // Product Insights
      if (productPerformance.length > 0) {
        const topProduct = productPerformance[0];
        const trendingUp = productPerformance.filter(p => p.trend === 'up').length;
        const trendingDown = productPerformance.filter(p => p.trend === 'down').length;

        insights.push({
          type: 'success',
          category: 'Product',
          title: `${topProduct.brand} ${topProduct.variant} is Your Best Seller`,
          description: `${topProduct.orders} orders, ${topProduct.quantity} units sold, generating ₱${topProduct.revenue.toLocaleString()}.`,
          impact: 'high',
          actionable: `Ensure ${topProduct.brand} ${topProduct.variant} is always in stock across all regions.`
        });

        if (trendingUp > 0) {
          insights.push({
            type: 'opportunity',
            category: 'Product',
            title: `${trendingUp} Products Trending Upward`,
            description: 'These products are gaining popularity month-over-month.',
            impact: 'medium',
            actionable: 'Increase stock levels for trending products to avoid stockouts.'
          });
        }

        if (trendingDown > 3) {
          insights.push({
            type: 'warning',
            category: 'Product',
            title: `${trendingDown} Products Losing Momentum`,
            description: 'These products show declining order volumes.',
            impact: 'medium',
            actionable: 'Consider promotions or phase out underperforming products to optimize inventory.'
          });
        }

        // Low performers
        const lowPerformers = productPerformance.filter(p => p.revenue < totalRevenue * 0.01);
        if (lowPerformers.length > 5) {
          insights.push({
            type: 'suggestion',
            category: 'Inventory',
            title: `${lowPerformers.length} Products Underperforming`,
            description: 'These products contribute less than 1% of total revenue each.',
            impact: 'low',
            actionable: 'Review if these SKUs are worth keeping or if inventory space could be better used.'
          });
        }
      }

      // Agent Insights
      if (agentKPIs.length > 0) {
        const excellentAgents = agentKPIs.filter(a => a.performance === 'excellent');
        const needsImprovement = agentKPIs.filter(a => a.performance === 'needs_improvement');
        const avgConversion = agentKPIs.reduce((sum, a) => sum + a.conversionRate, 0) / agentKPIs.length;

        if (excellentAgents.length > 0) {
          insights.push({
            type: 'success',
            category: 'Team',
            title: `${excellentAgents.length} Star Performers`,
            description: excellentAgents.map(a => `${a.name} (₱${a.revenue.toLocaleString()})`).join(', '),
            impact: 'high',
            actionable: 'Analyze their strategies and replicate best practices across the team.'
          });
        }

        if (needsImprovement.length > 0) {
          insights.push({
            type: 'warning',
            category: 'Team',
            title: `${needsImprovement.length} Agents Need Support`,
            description: `These agents have lower conversion rates (avg: ${avgConversion.toFixed(1)}%) or revenue.`,
            impact: 'high',
            actionable: 'Provide additional training, mentorship, or reassign territories.'
          });
        }

        // Conversion rate insights
        const highConversion = agentKPIs.filter(a => a.conversionRate > 60);
        if (highConversion.length > 0) {
          insights.push({
            type: 'success',
            category: 'Sales Efficiency',
            title: `${highConversion.length} Agents with 60%+ Conversion`,
            description: 'These agents are highly effective at converting clients to buyers.',
            impact: 'medium',
            actionable: 'Document and share their client relationship strategies company-wide.'
          });
        }
      }

      // Overall business insights
      if (revenueGrowth > 10) {
        insights.push({
          type: 'success',
          category: 'Business Health',
          title: `Strong Revenue Growth: +${revenueGrowth.toFixed(1)}%`,
          description: 'Your business is growing month-over-month.',
          impact: 'high',
          actionable: 'Consider expanding your product line or entering new markets.'
        });
      } else if (revenueGrowth < -5) {
        insights.push({
          type: 'warning',
          category: 'Business Health',
          title: `Revenue Decline: ${revenueGrowth.toFixed(1)}%`,
          description: 'Sales are down compared to last month.',
          impact: 'high',
          actionable: 'Review pricing strategy, marketing efforts, and competitive landscape.'
        });
      }

      setAIInsights(insights);
      
      toast({
        title: 'AI Analysis Complete',
        description: `Generated ${insights.length} actionable insights`,
      });
    } catch (error: any) {
      console.error('Error generating insights:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate AI insights',
        variant: 'destructive'
      });
    } finally {
      setAnalyzing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzing, cityPerformance, productPerformance, agentKPIs, revenueGrowth, totalRevenue, isAdmin]);

  const getPerformanceBadge = (performance: string) => {
    switch (performance) {
      case 'excellent':
        return <Badge className="bg-green-100 text-green-800">⭐ Excellent</Badge>;
      case 'good':
        return <Badge className="bg-blue-100 text-blue-800">✓ Good</Badge>;
      case 'average':
        return <Badge className="bg-gray-100 text-gray-800">~ Average</Badge>;
      case 'needs_improvement':
        return <Badge className="bg-red-100 text-red-800">⚠ Needs Support</Badge>;
      default:
        return <Badge>{performance}</Badge>;
    }
  };

  const renderAchievementPercentage = (achievement?: number) => {
    if (achievement === undefined) {
      return <span className="text-sm text-muted-foreground">-</span>;
    }
    
    const colorClass = achievement >= 100 
      ? 'text-green-600' 
      : achievement >= 75 
      ? 'text-blue-600' 
      : achievement >= 50 
      ? 'text-yellow-600' 
      : 'text-red-600';

    return (
      <div className="flex items-center justify-center gap-1">
        <span className={`text-sm font-semibold ${colorClass}`}>
          {achievement.toFixed(0)}%
        </span>
        {achievement >= 100 && (
          <CheckCircle className="h-4 w-4 text-green-600" />
        )}
      </div>
    );
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'opportunity':
        return <Target className="h-5 w-5 text-blue-600" />;
      case 'suggestion':
        return <Sparkles className="h-5 w-5 text-purple-600" />;
      default:
        return <Brain className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const renderAgentKPISection = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Agent Performance Chart */}
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Agent Revenue Performance</CardTitle>
          <CardDescription>Top performing sales agents</CardDescription>
        </CardHeader>
        <CardContent>
          {agentKPIs.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={agentKPIs.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue (₱)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 opacity-50 mb-2" />
              <p>No agent revenue data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent KPI Table */}
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Agent Key Performance Indicators</CardTitle>
              <CardDescription>Comprehensive agent metrics and ratings</CardDescription>
            </div>
            {isLeader && (
              <Button
                variant="outline"
                onClick={handleOpenTargetDialog}
                className="gap-2"
              >
                <Target className="h-4 w-4" />
                Set Targets
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="text-center align-middle">Agent</TableHead>
                    <TableHead colSpan={3} className="text-center bg-blue-50">Target</TableHead>
                    <TableHead colSpan={3} className="text-center bg-green-50">Actual</TableHead>
                    <TableHead colSpan={3} className="text-center bg-yellow-50">Achievement</TableHead>
                    <TableHead rowSpan={2} className="text-center align-middle">Actions</TableHead>
                  </TableRow>
                  <TableRow>
                    {/* Target columns */}
                    <TableHead className="text-center bg-blue-50">Clients</TableHead>
                    <TableHead className="text-center bg-blue-50">Revenue</TableHead>
                    <TableHead className="text-center bg-blue-50">Qty</TableHead>
                    {/* Actual columns */}
                    <TableHead className="text-center bg-green-50">Clients</TableHead>
                    <TableHead className="text-center bg-green-50">Revenue</TableHead>
                    <TableHead className="text-center bg-green-50">Qty</TableHead>
                    {/* Achievement columns */}
                    <TableHead className="text-center bg-yellow-50">Clients %</TableHead>
                    <TableHead className="text-center bg-yellow-50">Revenue %</TableHead>
                    <TableHead className="text-center bg-yellow-50">Qty %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentKPIs.map((agent, index) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium text-center">
                        <div className="flex items-center justify-center gap-2">
                          {index < 3 && <Award className="h-4 w-4 text-yellow-500" />}
                          {agent.name}
                        </div>
                      </TableCell>
                      {/* Target values */}
                      <TableCell className="text-center bg-blue-50/30">
                        <span className="text-sm font-medium">
                          {agent.targetClients ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/30">
                        <span className="text-sm font-medium">
                          {agent.targetRevenue ? `₱${Math.floor(agent.targetRevenue).toLocaleString()}` : '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center bg-blue-50/30">
                        <span className="text-sm font-medium">
                          {agent.targetQty ?? '-'}
                        </span>
                      </TableCell>
                      {/* Actual values */}
                      <TableCell className="text-center bg-green-50/30">
                        <span className="text-sm">{agent.actualClients ?? 0}</span>
                      </TableCell>
                      <TableCell className="text-center bg-green-50/30">
                        <span className="text-sm font-semibold">
                          ₱{agent.actualRevenue ? Math.floor(agent.actualRevenue).toLocaleString() : '0'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center bg-green-50/30">
                        <span className="text-sm">{agent.actualQty ?? 0}</span>
                      </TableCell>
                      {/* Achievement percentages */}
                      <TableCell className="text-center bg-yellow-50/30">
                        {renderAchievementPercentage(agent.achievementClients)}
                      </TableCell>
                      <TableCell className="text-center bg-yellow-50/30">
                        {renderAchievementPercentage(agent.achievementRevenue)}
                      </TableCell>
                      <TableCell className="text-center bg-yellow-50/30">
                        {renderAchievementPercentage(agent.achievementQty)}
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewAgentDetails(agent)}
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {agentKPIs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        {isLeader ? 'No agents assigned to your team yet.' : 'No agent data available'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          AI-Powered Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Real-time data analysis with intelligent business recommendations
        </p>
      </div>

      {/* Summary Cards (Admin Only) */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue (This Month)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₱{totalRevenue.toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-1">
                {revenueGrowth >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={`text-sm ${revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}% vs last month
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Completed this month
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₱{avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Per transaction
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Markets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{cityPerformance.length}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Cities with orders
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isAdmin && (
        <>
          {/* Main Analytics Tabs */}
          <Tabs defaultValue="cities" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="cities">
                <MapPin className="h-4 w-4 mr-2" />
                City Performance
              </TabsTrigger>
              <TabsTrigger value="products">
                <Package className="h-4 w-4 mr-2" />
                Product Analytics
              </TabsTrigger>
              <TabsTrigger value="agents">
                <Users className="h-4 w-4 mr-2" />
                Agent KPIs
              </TabsTrigger>
            </TabsList>

            {/* City Performance Tab */}
            <TabsContent value="cities" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* City Revenue Chart */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue by City</CardTitle>
                <CardDescription>Top performing markets</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={cityPerformance.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="city" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                    <Bar dataKey="revenue" fill="#3b82f6" name="Revenue (₱)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* City Details Table */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle>City-by-City Breakdown</CardTitle>
                <CardDescription>Detailed performance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Clients</TableHead>
                        <TableHead className="text-right">Growth</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cityPerformance.map((city, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              {city.city}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{city.orders}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{city.revenue.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">{city.clients}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {city.growth >= 0 ? (
                                <ArrowUpRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 text-red-600" />
                              )}
                              <span className={city.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                {city.growth >= 0 ? '+' : ''}{city.growth.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {cityPerformance.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No city data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Product Performance Tab */}
        <TabsContent value="products" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Product Revenue Chart */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle>Top Products by Revenue</CardTitle>
                <CardDescription>Best selling items</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={productPerformance.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      type="category" 
                      dataKey="variant" 
                      tick={{ fontSize: 11 }} 
                      width={120}
                    />
                    <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue (₱)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Product Details Table */}
            <Card className="col-span-1 lg:col-span-2">
              <CardHeader>
                <CardTitle>Product Performance Details</CardTitle>
                <CardDescription>Comprehensive product metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Units Sold</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-center">Trend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productPerformance.slice(0, 20).map((product, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{product.brand}</TableCell>
                          <TableCell>{product.variant}</TableCell>
                          <TableCell className="text-right">{product.orders}</TableCell>
                          <TableCell className="text-right">{product.quantity}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ₱{product.revenue.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            {product.trend === 'up' && (
                              <Badge className="bg-green-100 text-green-800">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                Rising
                              </Badge>
                            )}
                            {product.trend === 'down' && (
                              <Badge className="bg-red-100 text-red-800">
                                <TrendingDown className="h-3 w-3 mr-1" />
                                Falling
                              </Badge>
                            )}
                            {product.trend === 'stable' && (
                              <Badge variant="outline">Stable</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {productPerformance.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No product data available
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

            {/* Agent KPIs Tab */}
            <TabsContent value="agents" className="space-y-4">
              {renderAgentKPISection()}
            </TabsContent>
          </Tabs>

          {/* AI Insights List Section */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    AI Business Insights
                    {analyzing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  </CardTitle>
                  <CardDescription>
                    {aiInsights.length > 0 
                      ? `${aiInsights.length} actionable recommendations based on your data`
                      : 'Analyzing your business data...'
                    }
                  </CardDescription>
                </div>
                {aiInsights.length > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={generateAIInsights}
                    disabled={analyzing}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Refresh Insights
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {aiInsights.length > 0 ? (
                <div className="space-y-2">
                  {aiInsights.map((insight, index) => (
                    <div 
                      key={index}
                      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {getInsightIcon(insight.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{insight.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {insight.category}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              insight.impact === 'high' ? 'border-red-500 text-red-700 bg-red-50' :
                              insight.impact === 'medium' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' :
                              'border-gray-400 text-gray-700 bg-gray-50'
                            }`}
                          >
                            {insight.impact.toUpperCase()}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">{insight.description}</p>
                        
                        <div className="flex items-start gap-2 mt-2 p-2 bg-blue-50 rounded-md border-l-2 border-blue-500">
                          <Target className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-blue-900">
                            <strong>Recommended Action:</strong> {insight.actionable}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : analyzing ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-sm text-muted-foreground">Analyzing your business data...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">No insights available yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isLeader && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Team Performance Overview</CardTitle>
              <CardDescription>Metrics for agents assigned under your leadership</CardDescription>
            </CardHeader>
          </Card>
          {renderAgentKPISection()}
        </div>
      )}

      {/* Agent Detail Dialog */}
      <Dialog open={agentDetailDialogOpen} onOpenChange={setAgentDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Agent Sales Details - {selectedAgent?.name}
            </DialogTitle>
            <DialogDescription>
              View detailed product sales breakdown by brand and variant
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Agent Summary Stats */}
            {selectedAgent && (
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{selectedAgent.orders}</div>
                    <p className="text-xs text-muted-foreground">Total Orders</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">₱{selectedAgent.revenue.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{selectedAgent.clients}</div>
                    <p className="text-xs text-muted-foreground">Active Clients</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{selectedAgent.conversionRate.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">Conversion Rate</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Brand Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Brand</label>
              <Select value={selectedBrand} onValueChange={handleBrandChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a brand to view variant sales..." />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range Filter */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Date Range Filter
                </CardTitle>
                <CardDescription className="text-xs">
                  Filter sales by specific date or date range
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* From Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">From Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "PPP") : "Pick a start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* To Date */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">To Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "PPP") : "Pick an end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                          disabled={(date) => dateFrom ? date < dateFrom : false}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Filter Actions */}
                <div className="flex gap-2 mt-4">
                  <Button 
                    onClick={handleDateFilterChange}
                    disabled={!selectedBrand || loadingVariants}
                    className="flex-1"
                  >
                    Apply Filter
                  </Button>
                  {(dateFrom || dateTo) && (
                    <Button 
                      variant="outline"
                      onClick={handleClearDateFilter}
                      disabled={loadingVariants}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>

                {/* Active Filter Display */}
                {(dateFrom || dateTo) && (
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 font-medium">
                      Active Filter: {' '}
                      {dateFrom && dateTo
                        ? `${format(dateFrom, "MMM d, yyyy")} - ${format(dateTo, "MMM d, yyyy")}`
                        : dateFrom
                        ? `From ${format(dateFrom, "MMM d, yyyy")}`
                        : `Until ${format(dateTo!, "MMM d, yyyy")}`
                      }
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loading State */}
            {loadingVariants && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {/* Variant Sales Chart */}
            {!loadingVariants && selectedBrand && variantSales.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Variant Sales Breakdown</CardTitle>
                  <CardDescription>
                    Approved orders by product variant (flavors & batteries)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={variantSales}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="variantName" 
                        tick={{ fontSize: 11 }} 
                        angle={-45} 
                        textAnchor="end" 
                        height={100}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as VariantSales;
                            return (
                              <div className="bg-white p-3 border rounded-lg shadow-lg">
                                <p className="font-semibold">{data.variantName}</p>
                                <p className="text-sm text-muted-foreground">
                                  Total Quantity: <span className="font-semibold text-foreground">{data.quantity}</span>
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Order Count: <span className="font-semibold text-foreground">{data.orderCount}</span>
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="quantity" fill="#3b82f6" name="Total Quantity Sold" />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Variant Details Table */}
                  <div className="mt-6 border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Variant Name</TableHead>
                          <TableHead>Client Name(s)</TableHead>
                          <TableHead className="text-right">Total Quantity</TableHead>
                          <TableHead className="text-right">Number of Orders</TableHead>
                          <TableHead className="text-right">Avg per Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantSales.map((variant, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{variant.variantName}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {variant.clients.slice(0, 3).map((client, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {client}
                                  </Badge>
                                ))}
                                {variant.clients.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{variant.clients.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold">{variant.quantity}</TableCell>
                            <TableCell className="text-right">{variant.orderCount}</TableCell>
                            <TableCell className="text-right">
                              {(variant.quantity / variant.orderCount).toFixed(1)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold border-t-2">
                          <TableCell colSpan={2} className="text-right">Total:</TableCell>
                          <TableCell className="text-right text-primary">
                            {variantSales.reduce((sum, v) => sum + v.quantity, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {variantSales.reduce((sum, v) => sum + v.orderCount, 0)}
                          </TableCell>
                          <TableCell className="text-right">-</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* No Data State */}
            {!loadingVariants && selectedBrand && variantSales.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  No approved sales found for this brand
                </p>
              </div>
            )}

            {/* Instruction State */}
            {!selectedBrand && (
              <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Select a brand above to view detailed variant sales
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Target Management Dialog */}
      <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Set Monthly Targets
            </DialogTitle>
            <DialogDescription>
              Set targets for {format(startOfMonth(new Date()), 'MMMM yyyy')}. Targets will be used to calculate achievement percentages.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info Banner */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Targets are set for the current month ({format(startOfMonth(new Date()), 'MMMM yyyy')}). 
                Achievement is calculated based on approved orders for this month.
              </p>
            </div>

            {/* Targets Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="align-middle">Agent Name</TableHead>
                      <TableHead colSpan={3} className="text-center bg-blue-50">Current Targets</TableHead>
                      <TableHead colSpan={3} className="text-center bg-green-50">New Targets</TableHead>
                      <TableHead rowSpan={2} className="text-center align-middle">Action</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead className="text-right bg-blue-50">Clients</TableHead>
                      <TableHead className="text-right bg-blue-50">Revenue</TableHead>
                      <TableHead className="text-right bg-blue-50">Qty</TableHead>
                      <TableHead className="text-right bg-green-50">Clients</TableHead>
                      <TableHead className="text-right bg-green-50">Revenue</TableHead>
                      <TableHead className="text-right bg-green-50">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentKPIs.map((agent) => {
                      const targets = targetInputs[agent.id] || {
                        targetClients: agent.targetClients ?? null,
                        targetRevenue: agent.targetRevenue ?? null,
                        targetQty: agent.targetQty ?? null
                      };
                      const isSaving = savingTargets.has(agent.id);
                      
                      return (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">{agent.name}</TableCell>
                          {/* Current Targets */}
                          <TableCell className="text-right bg-blue-50/30">
                            <span className="text-sm text-muted-foreground">
                              {agent.targetClients ?? '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right bg-blue-50/30">
                            <span className="text-sm text-muted-foreground">
                              {agent.targetRevenue ? `₱${agent.targetRevenue.toLocaleString()}` : '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right bg-blue-50/30">
                            <span className="text-sm text-muted-foreground">
                              {agent.targetQty ?? '-'}
                            </span>
                          </TableCell>
                          {/* New Target Inputs */}
                          <TableCell className="text-right bg-green-50/30">
                            <Input
                              type="text"
                              value={formatNumberWithCommas(targets.targetClients)}
                              onChange={(e) => handleTargetInputChange(agent.id, 'targetClients', e.target.value)}
                              className="w-24 h-8 text-right ml-auto"
                              placeholder="0"
                              disabled={isSaving}
                            />
                          </TableCell>
                          <TableCell className="text-right bg-green-50/30">
                            <Input
                              type="text"
                              value={formatNumberWithCommas(targets.targetRevenue)}
                              onChange={(e) => handleTargetInputChange(agent.id, 'targetRevenue', e.target.value)}
                              className="w-28 h-8 text-right ml-auto"
                              placeholder="0"
                              disabled={isSaving}
                            />
                          </TableCell>
                          <TableCell className="text-right bg-green-50/30">
                            <Input
                              type="text"
                              value={formatNumberWithCommas(targets.targetQty)}
                              onChange={(e) => handleTargetInputChange(agent.id, 'targetQty', e.target.value)}
                              className="w-24 h-8 text-right ml-auto"
                              placeholder="0"
                              disabled={isSaving}
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSaveTarget(agent.id)}
                              disabled={isSaving || (!targets.targetClients && !targets.targetRevenue && !targets.targetQty)}
                              className="gap-2"
                            >
                              {isSaving ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                'Save'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {agentKPIs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No agents available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Set individual targets above, or save all at once using the button below.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setTargetDialogOpen(false)}
                  disabled={savingTargets.size > 0}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAllTargets}
                  disabled={savingTargets.size > 0}
                  className="gap-2"
                >
                  {savingTargets.size > 0 ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4" />
                      Save All Targets
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

