import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import { 
  Award,
  Loader2,
  CalendarIcon,
  X,
  Package,
  MapPin,
  Filter,
  Eye,
  Target
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay, startOfYear, endOfYear, startOfMonth, endOfMonth, startOfWeek, endOfWeek, getWeeksInMonth, differenceInDays, subDays, subMonths } from 'date-fns';
import { DateRange } from 'react-day-picker';

// Date range presets
type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'last_year' | 'custom';

const getDateRange = (preset: DatePreset, customStart?: Date, customEnd?: Date): { start?: Date; end?: Date } => {
  const now = new Date();
  const start = new Date();
  const end = new Date();
  
  switch (preset) {
    case 'this_month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'last_month':
      start.setMonth(now.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth());
      end.setDate(0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'last_3_months':
      start.setMonth(now.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'last_6_months':
      start.setMonth(now.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'this_year':
      start.setMonth(0); // January
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'last_year':
      start.setFullYear(now.getFullYear() - 1);
      start.setMonth(0);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(now.getFullYear() - 1);
      end.setMonth(11); // December
      end.setDate(31);
      end.setHours(23, 59, 59, 999);
      return { start, end };
      
    case 'custom':
      return { start: customStart, end: customEnd };
      
    case 'all':
    default:
      return { start: undefined, end: undefined };
  }
};

// Types
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

interface VariantSales {
  variantName: string;
  quantity: number;
  orderCount: number;
  clients: string[];
}

interface BrandOption {
  id: string;
  name: string;
}

interface ClientMetrics {
  clientId: string;
  clientName: string;
  company: string;
  city: string;
  totalOrders: number;
  totalRevenue: number;
  lastOrderDate: string | null;
}

interface AgentInfo {
  id: string;
  name: string;
  color: string;
}

interface TimeSeriesDataPoint {
  period: string;
  [agentId: string]: string | number; // period is string, agent values are numbers
}

interface ClientVisitData {
  clientId: string;
  clientName: string;
  shopName: string;
  city: string;
  visits: number;
}

interface MonthlyVisitData {
  month: number;
  monthName: string;
  totalVisits: number;
  clients: ClientVisitData[];
}

interface WeeklyVisitData {
  week: number;
  weekLabel: string;
  totalVisits: number;
  clients: ClientVisitData[];
}

interface DailyVisitData {
  day: number;
  dayLabel: string;
  totalVisits: number;
  clients: ClientVisitData[];
}

type MetricType = 'revenue' | 'clients' | 'orders';
type RoleType = 'mobile_sales' | 'team_leader';

interface AgentAnalyticsTabProps {
  userId: string;
  isAdmin: boolean;
  isLeader: boolean;
  isManager?: boolean;
  onViewAgentDetails?: (agent: AgentKPI) => Promise<void>;
  onOpenTargetDialog?: () => void;
  agentKPIs?: AgentKPI[];
}

const AGENT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

// Custom Legend Component
interface CustomLegendProps {
  payload?: Array<{
    value: any;
    color?: string;
    dataKey?: any;
    [key: string]: any;
  }>;
}

const CustomLegend = ({ payload }: CustomLegendProps) => {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="pt-6 pb-2">
      <div className="flex flex-wrap items-center gap-3 justify-start">
        {payload.map((entry, index) => (
          <div
            key={`legend-item-${index}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50 border border-border/50 hover:bg-muted transition-colors shadow-sm"
          >
            <div
              className="h-3 w-3 rounded-full shrink-0 ring-2 ring-offset-2 ring-offset-background"
              style={{ 
                backgroundColor: entry.color
              }}
            />
            <span className="text-sm font-medium text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AgentAnalyticsTab({ 
  userId, 
  isAdmin, 
  isLeader,
  isManager = false,
  onViewAgentDetails,
  onOpenTargetDialog,
  agentKPIs = []
}: AgentAnalyticsTabProps) {
  const { toast } = useToast();
  
  // Performance Chart State
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesDataPoint[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [selectedRole, setSelectedRole] = useState<RoleType>('mobile_sales');
  const [selectedPerson, setSelectedPerson] = useState<string>('all'); // 'all' or specific person ID
  const [availablePeople, setAvailablePeople] = useState<AgentInfo[]>([]);
  const [chartDateRange, setChartDateRange] = useState<DateRange | undefined>(undefined);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  
  // Agent Detail Dialog State
  const [agentDetailDialogOpen, setAgentDetailDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentKPI | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [variantSales, setVariantSales] = useState<VariantSales[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  
  // Agent Client Data
  const [agentClients, setAgentClients] = useState<ClientMetrics[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  
  // Date Range Filter State
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Visit Log State
  const [visitLogData, setVisitLogData] = useState<ClientVisitData[]>([]);
  const [monthlyVisitData, setMonthlyVisitData] = useState<MonthlyVisitData[]>([]);
  const [weeklyVisitData, setWeeklyVisitData] = useState<WeeklyVisitData[]>([]);
  const [dailyVisitData, setDailyVisitData] = useState<DailyVisitData[]>([]);
  const [loadingVisitLog, setLoadingVisitLog] = useState(false);
  const [visitLogYear, setVisitLogYear] = useState<number>(new Date().getFullYear());
  const [visitLogMonth, setVisitLogMonth] = useState<number | 'all'>('all');
  const [visitLogWeek, setVisitLogWeek] = useState<number | 'all'>('all');
  const [visitClientDialog, setVisitClientDialog] = useState(false);
  const [selectedVisitClient, setSelectedVisitClient] = useState<ClientVisitData | null>(null);
  const [selectedMonthData, setSelectedMonthData] = useState<MonthlyVisitData | null>(null);
  const [selectedWeekData, setSelectedWeekData] = useState<WeeklyVisitData | null>(null);
  const [selectedDayData, setSelectedDayData] = useState<DailyVisitData | null>(null);

  useEffect(() => {
    fetchAvailablePeople();
  }, [selectedRole, userId]);

  useEffect(() => {
    fetchPerformanceData();
  }, [selectedMetric, selectedRole, selectedPerson, chartDateRange, userId]);

  // Fetch visit log data when a specific person is selected or visit log filters change
  useEffect(() => {
    if (selectedPerson !== 'all') {
      fetchVisitLogData(selectedPerson);
    } else {
      setVisitLogData([]);
    }
  }, [selectedPerson, visitLogYear, visitLogMonth, visitLogWeek]);

  // Sync datePreset with chartDateRange
  useEffect(() => {
    const dateRange = getDateRange(datePreset, customStartDate, customEndDate);
    if (dateRange.start && dateRange.end) {
      setChartDateRange({ from: dateRange.start, to: dateRange.end });
    } else {
      setChartDateRange(undefined);
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Handle preset change
  const handlePresetChange = (value: DatePreset) => {
    setDatePreset(value);
    if (value !== 'custom') {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
    setIsDatePickerOpen(false);
  };

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (date?: Date) => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  // Parse date from input
  const parseDateFromInput = (dateString: string): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const fetchAvailablePeople = async () => {
    try {
      let peopleQuery = supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', selectedRole)
        .order('full_name', { ascending: true });

      if (isLeader && userId) {
        const { data: teamData } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', userId);

        const peopleIds = (teamData || []).map((member: any) => member.agent_id).filter(Boolean);
        if (peopleIds.length > 0) {
          peopleQuery = peopleQuery.in('id', peopleIds);
        }
      }

      const { data, error } = await peopleQuery;
      if (error) throw error;

      const peopleList = (data || []).map((person, index) => ({
        id: person.id,
        name: person.full_name || 'Unknown',
        color: AGENT_COLORS[index % AGENT_COLORS.length]
      }));

      setAvailablePeople(peopleList);
    } catch (error) {
      console.error('Error fetching people:', error);
    }
  };

  const fetchPerformanceData = async () => {
    setLoadingPerformance(true);
    try {
      // Get list based on role
      let peopleQuery = supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', selectedRole);

      if (isLeader && userId) {
        const { data: teamData } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', userId);

        const peopleIds = (teamData || []).map((member: any) => member.agent_id).filter(Boolean);
        if (peopleIds.length === 0) {
          setTimeSeriesData([]);
          setAgents([]);
          setLoadingPerformance(false);
          return;
        }
        peopleQuery = peopleQuery.in('id', peopleIds);
      }

      const { data: peopleData, error: peopleError } = await peopleQuery;
      if (peopleError) throw peopleError;

      if (!peopleData || peopleData.length === 0) {
        setTimeSeriesData([]);
        setAgents([]);
        setLoadingPerformance(false);
        return;
      }

      // Create person info with colors - filter if specific person selected
      let personInfoList: AgentInfo[];
      if (selectedPerson !== 'all') {
        // Show only selected person
        const selectedPersonData = peopleData.find(p => p.id === selectedPerson);
        if (!selectedPersonData) {
          setTimeSeriesData([]);
          setAgents([]);
          setLoadingPerformance(false);
          return;
        }
        personInfoList = [{
          id: selectedPersonData.id,
          name: selectedPersonData.full_name || 'Unknown',
          color: AGENT_COLORS[0]
        }];
      } else {
        // Show all people
        personInfoList = peopleData.map((person, index) => ({
          id: person.id,
          name: person.full_name || 'Unknown',
          color: AGENT_COLORS[index % AGENT_COLORS.length]
        }));
      }
      setAgents(personInfoList);

      // Calculate date range and time periods
      let timePeriods: { label: string; start: Date; end: Date }[] = [];

      // Determine date range and granularity
      if (!chartDateRange?.from) {
        // All Time - show monthly breakdown from start to now
        // Get the earliest and latest dates from the database
        const { data: earliestOrder } = await supabase
          .from('client_orders')
          .select('created_at')
          .order('created_at', { ascending: true })
          .limit(1);
        
        const { data: latestOrder } = await supabase
          .from('client_orders')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        const today = new Date();
        
        let startComp = earliestOrder?.[0]?.created_at 
          ? new Date(earliestOrder[0].created_at) 
          : new Date(new Date().getFullYear() - 1, 0, 1);
        
        const endComp = latestOrder?.[0]?.created_at 
          ? new Date(latestOrder[0].created_at) 
          : today;

        // Ensure we show at least 6 months of history for context, even if data is new
        const sixMonthsAgo = new Date(endComp);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        
        if (startComp > sixMonthsAgo) {
          startComp = sixMonthsAgo;
        }

        // Generate monthly periods from earliest to latest
        const start = startOfMonth(startComp);
        const end = endOfMonth(endComp);
        
        const current = new Date(start);
        
        while (current <= end) {
          const periodStart = startOfMonth(current);
          const periodEnd = endOfMonth(current);
          
          timePeriods.push({
            label: format(periodStart, 'MMM yyyy'),
            start: periodStart,
            end: periodEnd
          });
          
          // Move to next month
          current.setMonth(current.getMonth() + 1);
        }
      } else {
        // Custom Range
        const fromDate = startOfDay(chartDateRange.from);
        const toDate = chartDateRange.to ? endOfDay(chartDateRange.to) : endOfDay(fromDate);
        const daysDiff = differenceInDays(toDate, fromDate);

        if (daysDiff <= 35) {
          // Daily breakdown (approx 1 month or less)
          let current = new Date(fromDate);
          while (current <= toDate) {
            timePeriods.push({
              label: format(current, 'MMM d'),
              start: startOfDay(current),
              end: endOfDay(current)
            });
            current.setDate(current.getDate() + 1);
          }
        } else if (daysDiff <= 180) {
          // Weekly breakdown (approx 6 months or less)
          let current = startOfWeek(fromDate);
          while (current <= toDate) {
            const weekEnd = endOfWeek(current);
            const actualEnd = weekEnd > toDate ? toDate : weekEnd;
            const actualStart = current < fromDate ? fromDate : current;

            if (actualStart <= actualEnd) {
              timePeriods.push({
                label: `Week of ${format(actualStart, 'MMM d')}`,
                start: actualStart,
                end: actualEnd
              });
            }
            current.setDate(current.getDate() + 7);
          }
        } else {
          // Monthly breakdown (> 6 months)
          let current = startOfMonth(fromDate);
          while (current <= toDate) {
            const monthEnd = endOfMonth(current);
            const actualEnd = monthEnd > toDate ? toDate : monthEnd;
            const actualStart = current < fromDate ? fromDate : current;

            if (actualStart <= actualEnd) {
              timePeriods.push({
                label: format(actualStart, 'MMM yyyy'),
                start: actualStart,
                end: actualEnd
              });
            }
            current.setMonth(current.getMonth() + 1);
          }
        }
      }

      // Fetch data for each time period and agent
      const timeSeriesResults: TimeSeriesDataPoint[] = await Promise.all(
        timePeriods.map(async (period) => {
          const dataPoint: TimeSeriesDataPoint = { period: period.label };

          for (const person of personInfoList) {
            let value = 0;

            let query = supabase.from('client_orders').select('total_amount, id, created_at');

            // Apply filters
            if (selectedMetric === 'revenue') {
              query = query.select('total_amount');
            } else if (selectedMetric === 'orders') {
              query = query.select('id');
            } else if (selectedMetric === 'clients') {
               // For clients, we query the 'clients' table, handled below
               query = supabase.from('clients').select('id, created_at') as any;
            }

            // Apply metric specific logic
            if (selectedMetric === 'clients') {
               const { data: clients } = await supabase
                .from('clients')
                .select('id')
                .eq('agent_id', person.id)
                .gte('created_at', period.start.toISOString())
                .lte('created_at', period.end.toISOString());
              
              value = clients?.length || 0;
            } else {
              // Orders or Revenue
               const { data: orders } = await supabase
                .from('client_orders')
                .select(selectedMetric === 'revenue' ? 'total_amount' : 'id')
                .eq('agent_id', person.id)
                .gte('created_at', period.start.toISOString())
                .lte('created_at', period.end.toISOString());
              
              if (selectedMetric === 'revenue') {
                value = orders?.reduce((sum, order: any) => sum + (order.total_amount || 0), 0) || 0;
              } else {
                value = orders?.length || 0;
              }
            }

            dataPoint[person.id] = value;
          }

          return dataPoint;
        })
      );

      setTimeSeriesData(timeSeriesResults);
    } catch (error) {
      console.error('Error fetching performance data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load agent performance data',
        variant: 'destructive'
      });
    } finally {
      setLoadingPerformance(false);
    }
  };

  const fetchVisitLogData = async (agentId: string) => {
    setLoadingVisitLog(true);
    try {
      // First, fetch ALL clients assigned to this agent
      const { data: agentClients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name, company, city')
        .eq('agent_id', agentId);

      if (clientsError) throw clientsError;

      if (!agentClients || agentClients.length === 0) {
        setVisitLogData([]);
        setMonthlyVisitData([]);
        return;
      }

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      if (visitLogMonth === 'all') {
        // When "All Months" is selected, build monthly breakdown
        const yearStart = startOfYear(new Date(visitLogYear, 0, 1));
        const yearEnd = endOfYear(yearStart);

        // Fetch all visits for this year
        const { data: visits, error: visitsError } = await supabase
          .from('visit_logs')
          .select('id, client_id, visited_at')
          .eq('agent_id', agentId)
          .gte('visited_at', yearStart.toISOString())
          .lte('visited_at', yearEnd.toISOString());

        if (visitsError) throw visitsError;

        // Build monthly breakdown
        const monthlyData: MonthlyVisitData[] = monthNames.map((monthName, index) => {
          const monthStart = startOfMonth(new Date(visitLogYear, index, 1));
          const monthEnd = endOfMonth(monthStart);
          
          // Count visits per client for this month
          const clientVisitMap = new Map<string, number>();
          (visits || []).forEach((visit: any) => {
            const visitDate = new Date(visit.visited_at);
            if (visitDate >= monthStart && visitDate <= monthEnd) {
              const count = clientVisitMap.get(visit.client_id) || 0;
              clientVisitMap.set(visit.client_id, count + 1);
            }
          });

          // Build client data for this month
          const clients: ClientVisitData[] = agentClients.map((client: any) => ({
            clientId: client.id,
            clientName: client.name || 'Unknown Client',
            shopName: client.company || '-',
            city: client.city || 'Unknown',
            visits: clientVisitMap.get(client.id) || 0
          }));

          // Sort clients by visits (descending)
          clients.sort((a, b) => b.visits - a.visits);

          const totalVisits = clients.reduce((sum, c) => sum + c.visits, 0);

          return {
            month: index + 1,
            monthName,
            totalVisits,
            clients
          };
        });

        setMonthlyVisitData(monthlyData);
        setWeeklyVisitData([]);
        setVisitLogData([]);
      } else if (visitLogWeek === 'all') {
        // Month selected but All Weeks - show weekly breakdown (Week 1-4)
        const monthStart = startOfMonth(new Date(visitLogYear, (visitLogMonth as number) - 1, 1));
        const monthEnd = endOfMonth(monthStart);
        const weeksInMonth = getWeeksInMonth(monthStart);

        // Fetch all visits for this month
        const { data: visits, error: visitsError } = await supabase
          .from('visit_logs')
          .select('id, client_id, visited_at')
          .eq('agent_id', agentId)
          .gte('visited_at', monthStart.toISOString())
          .lte('visited_at', monthEnd.toISOString());

        if (visitsError) throw visitsError;

        // Build weekly breakdown
        const weeklyData: WeeklyVisitData[] = [];
        for (let weekNum = 1; weekNum <= weeksInMonth; weekNum++) {
          // Calculate week boundaries within the month
          const weekStartDay = (weekNum - 1) * 7 + 1;
          const weekEndDay = Math.min(weekNum * 7, new Date(visitLogYear, (visitLogMonth as number), 0).getDate());
          
          const weekStart = new Date(visitLogYear, (visitLogMonth as number) - 1, weekStartDay);
          const weekEnd = new Date(visitLogYear, (visitLogMonth as number) - 1, weekEndDay, 23, 59, 59);

          // Count visits per client for this week
          const clientVisitMap = new Map<string, number>();
          (visits || []).forEach((visit: any) => {
            const visitDate = new Date(visit.visited_at);
            if (visitDate >= weekStart && visitDate <= weekEnd) {
              const count = clientVisitMap.get(visit.client_id) || 0;
              clientVisitMap.set(visit.client_id, count + 1);
            }
          });

          // Build client data for this week
          const clients: ClientVisitData[] = agentClients.map((client: any) => ({
            clientId: client.id,
            clientName: client.name || 'Unknown Client',
            shopName: client.company || '-',
            city: client.city || 'Unknown',
            visits: clientVisitMap.get(client.id) || 0
          }));

          clients.sort((a, b) => b.visits - a.visits);
          const totalVisits = clients.reduce((sum, c) => sum + c.visits, 0);

          // Format ordinal suffix for dates (1st, 2nd, 3rd, etc.)
          const ordinal = (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
          };

          weeklyData.push({
            week: weekNum,
            weekLabel: `Week ${weekNum} (${ordinal(weekStartDay)} - ${ordinal(weekEndDay)})`,
            totalVisits,
            clients
          });
        }

        setWeeklyVisitData(weeklyData);
        setDailyVisitData([]);
        setMonthlyVisitData([]);
        setVisitLogData([]);
      } else {
        // Specific week selected - show daily breakdown
        const weekNum = visitLogWeek as number;
        const daysInMonth = new Date(visitLogYear, visitLogMonth as number, 0).getDate();
        const weekStartDay = (weekNum - 1) * 7 + 1;
        const weekEndDay = Math.min(weekNum * 7, daysInMonth);
        
        const dateStart = new Date(visitLogYear, (visitLogMonth as number) - 1, weekStartDay);
        const dateEnd = new Date(visitLogYear, (visitLogMonth as number) - 1, weekEndDay, 23, 59, 59);

        // Fetch visits within date range
        const { data: visits, error: visitsError } = await supabase
          .from('visit_logs')
          .select('id, client_id, visited_at')
          .eq('agent_id', agentId)
          .gte('visited_at', dateStart.toISOString())
          .lte('visited_at', dateEnd.toISOString());

        if (visitsError) throw visitsError;

        // Format ordinal suffix for dates
        const ordinal = (n: number) => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        // Build daily breakdown
        const dailyData: DailyVisitData[] = [];
        for (let day = weekStartDay; day <= weekEndDay; day++) {
          const dayStart = new Date(visitLogYear, (visitLogMonth as number) - 1, day);
          const dayEnd = new Date(visitLogYear, (visitLogMonth as number) - 1, day, 23, 59, 59);

          // Count visits per client for this day
          const clientVisitMap = new Map<string, number>();
          (visits || []).forEach((visit: any) => {
            const visitDate = new Date(visit.visited_at);
            if (visitDate >= dayStart && visitDate <= dayEnd) {
              const count = clientVisitMap.get(visit.client_id) || 0;
              clientVisitMap.set(visit.client_id, count + 1);
            }
          });

          // Build client data for this day
          const clients: ClientVisitData[] = agentClients.map((client: any) => ({
            clientId: client.id,
            clientName: client.name || 'Unknown Client',
            shopName: client.company || '-',
            city: client.city || 'Unknown',
            visits: clientVisitMap.get(client.id) || 0
          }));

          clients.sort((a, b) => b.visits - a.visits);
          const totalVisits = clients.reduce((sum, c) => sum + c.visits, 0);

          dailyData.push({
            day,
            dayLabel: ordinal(day),
            totalVisits,
            clients
          });
        }

        setDailyVisitData(dailyData);
        setVisitLogData([]);
        setMonthlyVisitData([]);
        setWeeklyVisitData([]);
      }
    } catch (error) {
      console.error('Error fetching visit log data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load visit log data',
        variant: 'destructive'
      });
    } finally {
      setLoadingVisitLog(false);
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
      const { data: variants, error: variantsError } = await supabase
        .from('variants')
        .select('id, name')
        .eq('brand_id', brandId);
      
      if (variantsError) throw variantsError;

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

      if (dateFrom) {
        query = query.gte('client_orders.created_at', startOfDay(dateFrom).toISOString());
      }
      if (dateTo) {
        query = query.lte('client_orders.created_at', endOfDay(dateTo).toISOString());
      }

      const { data: orderItems, error: itemsError } = await query;
      
      if (itemsError) throw itemsError;

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
        .filter(v => v.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity);

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

  const fetchAgentClients = async (agentId: string) => {
    setLoadingClients(true);
    try {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, name, company, city')
        .eq('agent_id', agentId);

      if (clientsError) throw clientsError;

      if (!clients || clients.length === 0) {
        setAgentClients([]);
        return;
      }

      const clientIds = clients.map(c => c.id);
      
      const { data: orders, error: ordersError } = await supabase
        .from('client_orders')
        .select('client_id, total_amount, created_at')
        .in('client_id', clientIds)
        .eq('stage', 'admin_approved');

      if (ordersError) throw ordersError;

      const clientStats = new Map<string, { orders: number; revenue: number; lastOrder: string | null }>();

      orders?.forEach(order => {
        const current = clientStats.get(order.client_id) || { orders: 0, revenue: 0, lastOrder: null };
        
        current.orders += 1;
        current.revenue += order.total_amount || 0;
        
        if (!current.lastOrder || new Date(order.created_at) > new Date(current.lastOrder)) {
          current.lastOrder = order.created_at;
        }

        clientStats.set(order.client_id, current);
      });

      const metrics: ClientMetrics[] = clients.map(client => {
        const stats = clientStats.get(client.id) || { orders: 0, revenue: 0, lastOrder: null };
        return {
          clientId: client.id,
          clientName: client.name,
          company: client.company || '—',
          city: client.city || '—',
          totalOrders: stats.orders,
          totalRevenue: stats.revenue,
          lastOrderDate: stats.lastOrder
        };
      });

      metrics.sort((a, b) => b.totalRevenue - a.totalRevenue);
      setAgentClients(metrics);
    } catch (error) {
      console.error('Error fetching agent clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load client data',
        variant: 'destructive'
      });
    } finally {
      setLoadingClients(false);
    }
  };

  const handleViewAgentDetails = async (agent: AgentKPI) => {
    setSelectedAgent(agent);
    setSelectedBrand('');
    setVariantSales([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setAgentDetailDialogOpen(true);
    
    await Promise.all([
      fetchBrands(),
      fetchAgentClients(agent.id)
    ]);
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

  // Generate year options (last 3 years + current + next)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  
  // Generate month options
  const monthOptions = [
    { value: 'all', label: 'All Months' },
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  // Generate week options for visit log filters
  const visitLogWeeksInMonth = visitLogMonth !== 'all' ? getWeeksInMonth(new Date(visitLogYear, visitLogMonth - 1)) : 0;
  const visitLogWeekOptions = visitLogMonth !== 'all' ? [
    { value: 'all', label: 'All Weeks' },
    ...Array.from({ length: visitLogWeeksInMonth }, (_, i) => ({
      value: i + 1,
      label: `Week ${i + 1}`
    }))
  ] : [];

  // Helper to get date range label for selected week
  const getWeekDateRangeLabel = () => {
    if (visitLogMonth === 'all' || visitLogWeek === 'all') return '';
    const weekNum = visitLogWeek as number;
    const daysInMonth = new Date(visitLogYear, visitLogMonth as number, 0).getDate();
    const weekStartDay = (weekNum - 1) * 7 + 1;
    const weekEndDay = Math.min(weekNum * 7, daysInMonth);
    const ordinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    return `(${ordinal(weekStartDay)} - ${ordinal(weekEndDay)})`;
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'revenue': return 'Revenue (₱)';
      case 'clients': return 'Total Clients';
      case 'orders': return 'Total Orders';
      default: return 'Value';
    }
  };

  const formatValue = (value: number) => {
    if (selectedMetric === 'revenue') {
      return `₱${value.toLocaleString()}`;
    }
    return value.toLocaleString();
  };



  return (
    <>
      {/* Agent Performance Chart */}
      <Card className="col-span-1 lg:col-span-2">
        <CardHeader>
          <CardTitle>Agent Performance Overview</CardTitle>
          <CardDescription>
            Compare agent performance across different metrics and time periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Layout: Filters on left, Chart on right */}
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
            {/* Left Sidebar: Filters */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Role Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role Type</label>
                  <Select value={selectedRole} onValueChange={(value: RoleType) => {
                    setSelectedRole(value);
                    setSelectedPerson('all'); // Reset person selection when role changes
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                      <SelectItem value="team_leader">Team Leaders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Individual Person Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Person</label>
                  <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {selectedRole === 'mobile_sales' ? 'Mobile Sales' : 'Team Leaders'}</SelectItem>
                      {availablePeople.map(person => (
                        <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Metric Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Metric</label>
                  <Select value={selectedMetric} onValueChange={(value: MetricType) => setSelectedMetric(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Revenue</SelectItem>
                      <SelectItem value="clients">Total Clients</SelectItem>
                      <SelectItem value="orders">Total Orders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="border-t pt-4 space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full justify-between text-left font-normal ${!chartDateRange ? 'text-muted-foreground' : ''}`}
                      >
                        <div className="flex items-center truncate">
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">
                            {chartDateRange?.from ? (
                              chartDateRange.to ? (
                                <>
                                  {format(chartDateRange.from, "LLL dd, y")} -{" "}
                                  {format(chartDateRange.to, "LLL dd, y")}
                                </>
                              ) : (
                                format(chartDateRange.from, "LLL dd, y")
                              )
                            ) : (
                              <span>All Time</span>
                            )}
                          </span>
                        </div>
                        {chartDateRange?.from && (
                          <div 
                            role="button"
                            className="rounded-full hover:bg-muted p-1 -mr-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setChartDateRange(undefined);
                            }}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </Button>
                    </PopoverTrigger>
                      <PopoverContent className="w-[360px] p-0" align="start">
                        <div className="p-4 space-y-4">
                          {/* Quick Filters */}
                          <div className="space-y-3">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Filters</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant={datePreset === 'this_month' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('this_month')}
                                className="justify-center h-9"
                              >
                                This Month
                              </Button>
                              <Button
                                variant={datePreset === 'last_month' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('last_month')}
                                className="justify-center h-9"
                              >
                                Last Month
                              </Button>
                              <Button
                                variant={datePreset === 'last_3_months' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('last_3_months')}
                                className="justify-center h-9"
                              >
                                Last 3 Months
                              </Button>
                              <Button
                                variant={datePreset === 'last_6_months' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('last_6_months')}
                                className="justify-center h-9"
                              >
                                Last 6 Months
                              </Button>
                              <Button
                                variant={datePreset === 'this_year' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('this_year')}
                                className="justify-center h-9"
                              >
                                This Year
                              </Button>
                              <Button
                                variant={datePreset === 'last_year' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('last_year')}
                                className="justify-center h-9"
                              >
                                Last Year
                              </Button>
                              <Button
                                variant={datePreset === 'all' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('all')}
                                className="justify-center col-span-2 h-9"
                              >
                                All Time
                              </Button>
                            </div>
                          </div>

                          {/* Custom Date Range */}
                          <div className="space-y-3 pt-3 border-t">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Range</Label>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor="agent-start-date" className="text-xs text-muted-foreground">From</Label>
                                <Input
                                  id="agent-start-date"
                                  type="date"
                                  value={formatDateForInput(customStartDate)}
                                  onChange={(e) => {
                                    const date = parseDateFromInput(e.target.value);
                                    setCustomStartDate(date);
                                    if (date && customEndDate) {
                                      handlePresetChange('custom');
                                    }
                                  }}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="agent-end-date" className="text-xs text-muted-foreground">To</Label>
                                <Input
                                  id="agent-end-date"
                                  type="date"
                                  value={formatDateForInput(customEndDate)}
                                  onChange={(e) => {
                                    const date = parseDateFromInput(e.target.value);
                                    setCustomEndDate(date);
                                    if (customStartDate && date) {
                                      handlePresetChange('custom');
                                    }
                                  }}
                                  className="h-9"
                                />
                              </div>
                            </div>
                            {customStartDate && customEndDate && (
                              <Button
                                variant={datePreset === 'custom' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handlePresetChange('custom')}
                                className="w-full h-9"
                              >
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                Apply Custom Range
                              </Button>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                </div>
              </CardContent>
            </Card>

            {/* Right Side: Chart */}
            <div className="min-h-[700px]">
              {loadingPerformance ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : timeSeriesData.length > 0 && agents.length > 0 ? (
                <ResponsiveContainer width="100%" height={700}>
                  <LineChart data={timeSeriesData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="period" 
                      tick={{ fontSize: 11 }} 
                      angle={-45} 
                      textAnchor="end" 
                      height={80} 
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }} 
                      domain={[0, 'auto']}
                    />
                    <Tooltip 
                      formatter={(value: number) => formatValue(value)}
                    />
                    <Legend 
                      content={(props) => <CustomLegend payload={props.payload} />}
                    />
                    {agents.map((agent) => (
                      <Line
                        key={agent.id}
                        type="monotone"
                        dataKey={agent.id}
                        stroke={agent.color}
                        strokeWidth={2.5}
                        dot={{ r: 5, fill: agent.color }}
                        activeDot={{ r: 7 }}
                        name={agent.name}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <Award className="h-10 w-10 opacity-50 mb-2" />
                  <p>No agent performance data available for the selected period</p>
                </div>
              )}
            </div>
          </div>

          {/* Visit Log Section - Only show when specific person is selected */}
          {selectedPerson !== 'all' && (
            <div className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        Client Visit Log
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Visit counts for {availablePeople.find(p => p.id === selectedPerson)?.name || 'selected agent'}
                      </CardDescription>
                    </div>
                    
                    {/* Visit Log Filters */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Year Filter */}
                      <Select value={visitLogYear.toString()} onValueChange={(value) => setVisitLogYear(parseInt(value))}>
                        <SelectTrigger className="w-[100px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {yearOptions.map(year => (
                            <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Month Filter */}
                      <Select value={visitLogMonth.toString()} onValueChange={(value) => {
                        const newMonth = value === 'all' ? 'all' : parseInt(value);
                        setVisitLogMonth(newMonth);
                        if (newMonth === 'all') {
                          setVisitLogWeek('all');
                        }
                      }}>
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {monthOptions.map(month => (
                            <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Week Filter - only show when specific month selected */}
                      {visitLogMonth !== 'all' && (
                        <Select 
                          value={visitLogWeek.toString()} 
                          onValueChange={(value) => setVisitLogWeek(value === 'all' ? 'all' : parseInt(value))}
                        >
                          <SelectTrigger className="w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {visitLogWeekOptions.map(week => (
                              <SelectItem key={week.value} value={week.value.toString()}>{week.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingVisitLog ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : visitLogMonth === 'all' && monthlyVisitData.length > 0 ? (
                    // Monthly breakdown view (Jan - Dec)
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyVisitData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="monthName" 
                            tick={{ fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis 
                            allowDecimals={false}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-background border rounded-lg p-3 shadow-lg">
                                    <p className="font-semibold">{label} {visitLogYear}</p>
                                    <p className="text-sm text-primary">
                                      {payload[0].value} total visits
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Click to see client details
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar 
                            dataKey="totalVisits" 
                            fill="#8b5cf6" 
                            name={`Visits ${visitLogYear}`}
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data: any) => {
                              if (data && data.payload) {
                                setSelectedMonthData(data.payload);
                                setVisitClientDialog(true);
                              }
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : visitLogMonth !== 'all' && visitLogWeek === 'all' && weeklyVisitData.length > 0 ? (
                    // Weekly breakdown view (Week 1 - Week 4)
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={weeklyVisitData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="weekLabel" 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            allowDecimals={false}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-background border rounded-lg p-3 shadow-lg">
                                    <p className="font-semibold">{label} - {monthOptions.find(m => m.value === visitLogMonth)?.label} {visitLogYear}</p>
                                    <p className="text-sm text-primary">
                                      {payload[0].value} total visits
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Click to see client details
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar 
                            dataKey="totalVisits" 
                            fill="#8b5cf6" 
                            name={`Visits - ${monthOptions.find(m => m.value === visitLogMonth)?.label} ${visitLogYear}`}
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data: any) => {
                              if (data && data.payload) {
                                setSelectedWeekData(data.payload);
                                setSelectedMonthData(null);
                                setVisitClientDialog(true);
                              }
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : dailyVisitData.length > 0 ? (
                    // Daily breakdown view (specific week - shows each day)
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dailyVisitData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="dayLabel" 
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis 
                            allowDecimals={false}
                            tick={{ fontSize: 12 }}
                          />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-background border rounded-lg p-3 shadow-lg">
                                    <p className="font-semibold">{label} {monthOptions.find(m => m.value === visitLogMonth)?.label} {visitLogYear}</p>
                                    <p className="text-sm text-primary">
                                      {payload[0].value} total visits
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Click to see client details
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar 
                            dataKey="totalVisits" 
                            fill="#8b5cf6" 
                            name={`Week ${visitLogWeek} ${getWeekDateRangeLabel()} - ${monthOptions.find(m => m.value === visitLogMonth)?.label} ${visitLogYear}`}
                            radius={[4, 4, 0, 0]}
                            cursor="pointer"
                            onClick={(data: any) => {
                              if (data && data.payload) {
                                setSelectedDayData(data.payload);
                                setSelectedWeekData(null);
                                setSelectedMonthData(null);
                                setVisitClientDialog(true);
                              }
                            }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                      <MapPin className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-sm text-muted-foreground">
                        No visit data found for this agent in {visitLogYear}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Visit Dialog */}
      <Dialog open={visitClientDialog} onOpenChange={setVisitClientDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {selectedMonthData 
                ? `${selectedMonthData.monthName} ${visitLogYear} - Client Visits`
                : selectedWeekData
                  ? `${selectedWeekData.weekLabel} - ${monthOptions.find(m => m.value === visitLogMonth)?.label} ${visitLogYear} - Client Visits`
                  : selectedDayData
                    ? `${selectedDayData.dayLabel} - Client Visits`
                    : 'Client Visits Comparison'}
            </DialogTitle>
            <DialogDescription>
              {selectedMonthData 
                ? `${selectedMonthData.totalVisits} total visits by ${availablePeople.find(p => p.id === selectedPerson)?.name || 'agent'}`
                : selectedWeekData
                  ? `${selectedWeekData.totalVisits} total visits by ${availablePeople.find(p => p.id === selectedPerson)?.name || 'agent'}`
                  : selectedDayData
                    ? `${selectedDayData.totalVisits} total visits on ${selectedDayData.dayLabel}`
                    : `All clients visited by ${availablePeople.find(p => p.id === selectedPerson)?.name || 'agent'} — Week ${visitLogWeek}, ${monthOptions.find(m => m.value === visitLogMonth)?.label} ${visitLogYear}`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg overflow-hidden mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Shop Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(selectedMonthData ? selectedMonthData.clients : selectedWeekData ? selectedWeekData.clients : selectedDayData ? selectedDayData.clients : visitLogData).map((client) => (
                  <TableRow 
                    key={client.clientId}
                    className={selectedVisitClient?.clientId === client.clientId ? 'bg-primary/10' : ''}
                  >
                    <TableCell className="font-medium">
                      {client.clientName}
                      {selectedVisitClient?.clientId === client.clientId && (
                        <Badge variant="outline" className="ml-2 text-xs">Selected</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.shopName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {client.city}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={client.visits > 0 ? (selectedVisitClient?.clientId === client.clientId ? 'default' : 'secondary') : 'outline'}>
                        {client.visits}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

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

            <Tabs defaultValue="sales" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sales">Sales by Brand</TabsTrigger>
                <TabsTrigger value="clients">Clients</TabsTrigger>
              </TabsList>

              <TabsContent value="sales" className="mt-4">
                {/* Brand Selection & Date Filters */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <Select value={selectedBrand} onValueChange={handleBrandChange}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select Brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map(brand => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedBrand && (
                    <>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            {dateFrom ? format(dateFrom, 'MMM d, yyyy') : 'From Date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={dateFrom}
                            onSelect={(date) => {
                              setDateFrom(date);
                              if (date && dateTo) handleDateFilterChange();
                            }}
                          />
                        </PopoverContent>
                      </Popover>

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            {dateTo ? format(dateTo, 'MMM d, yyyy') : 'To Date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={dateTo}
                            onSelect={(date) => {
                              setDateTo(date);
                              if (dateFrom && date) handleDateFilterChange();
                            }}
                          />
                        </PopoverContent>
                      </Popover>

                      {(dateFrom || dateTo) && (
                        <Button variant="ghost" size="icon" onClick={handleClearDateFilter}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Variant Sales Table */}
                {loadingVariants ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : selectedBrand && variantSales.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Variant</TableHead>
                          <TableHead className="text-right">Quantity Sold</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead>Clients</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantSales.map((variant, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{variant.variantName}</TableCell>
                            <TableCell className="text-right font-semibold">{variant.quantity}</TableCell>
                            <TableCell className="text-right">{variant.orderCount}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {variant.clients.slice(0, 3).map((client, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : selectedBrand && variantSales.length === 0 && !loadingVariants ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                    <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No sales data found for this brand{dateFrom || dateTo ? ' in the selected date range' : ''}
                    </p>
                  </div>
                ) : null}

                {!selectedBrand && (
                  <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                    <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Select a brand above to view detailed variant sales
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="clients" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Assigned Clients & Performance</CardTitle>
                    <CardDescription>
                      Performance metrics for each client managed by {selectedAgent?.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingClients ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Client Name</TableHead>
                              <TableHead>Location</TableHead>
                              <TableHead className="text-right">Orders</TableHead>
                              <TableHead className="text-right">Total Revenue</TableHead>
                              <TableHead className="text-right">Last Order</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {agentClients.map((client) => (
                              <TableRow key={client.clientId}>
                                <TableCell>
                                  <div className="font-medium">{client.clientName}</div>
                                  <div className="text-xs text-muted-foreground">{client.company}</div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {client.city}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">{client.totalOrders}</TableCell>
                                <TableCell className="text-right font-semibold">
                                  ₱{client.totalRevenue.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground text-sm">
                                  {client.lastOrderDate 
                                    ? new Date(client.lastOrderDate).toLocaleDateString()
                                    : 'Never'}
                                </TableCell>
                              </TableRow>
                            ))}
                            {agentClients.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                  No clients assigned to this agent yet.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
