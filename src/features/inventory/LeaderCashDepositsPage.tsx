import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { format } from 'date-fns';
import { canViewCashDeposits } from '@/lib/roleUtils';
import { sendNotificationToCompanyRoles } from '@/features/shared/lib/notification.helpers';
import { usePaymentSettings } from '@/features/finance/hooks/usePaymentSettings';
import {
  BanknoteIcon,
  AlertCircle,
  Loader2,
  UploadCloud,
  CheckCircle2,
  Filter,
  Camera,
  X,
  Eye,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  User,
  Upload,
  Receipt,
  Printer,
  Clock,
  Search,
} from 'lucide-react';

// Interfaces
interface CashDeposit {
  id: string;
  depositDate: string;
  amount: number;
  bankAccount: string;
  referenceNumber: string;
  status: string;
  agentName: string;
  agentId?: string;
  depositSlipUrl?: string;
  depositType?: 'CASH' | 'CHEQUE';
  notes?: string | null;
  createdAt?: string;
}

interface DepositOrderBreakdown {
  orderId: string;
  orderNumber: string;
  clientName: string;
  // Amount to deposit for this order (cash + cheque only)
  remittedAmount: number;
  fullOrderTotal: number;
  cashPortion: number;
  chequePortion: number;
  nonCashPortion?: number;

  nonCashLabel?: string;
}

interface OrderItemDetail {
  id: string;
  quantity: number;
  unitPrice: number;
  productName: string;
  variantName: string;
  variantType?: string;
  subtotal: number;
}

// Grouped view types for daily consolidation
interface DailyOrderSummary extends DepositOrderBreakdown {
  agentId: string;
  agentName: string;
  depositId: string;
  totalQuantity: number;
  depositRecorded: boolean;
}

interface DailyAgentGroup {
  agentId: string;
  agentName: string;
  orders: DailyOrderSummary[];
  totalOrders: number;
  totalUnits: number;
  totalAmount: number; // cash + cheque only
}

interface DailyDepositGroup {
  dateKey: string; // e.g. '2026-02-11'
  dateLabel: string; // e.g. '2/11/2026'
  depositIds: string[];
  totalAmount: number; // cash + cheque for the day
  status: 'pending_deposit' | 'awaiting_verification' | 'verified';
}

const formatBankLabel = (name: string, accountNumber: string | null | undefined) =>
  accountNumber ? `${name} - ${accountNumber}` : name;

// Returns true when a deposit has real bank details recorded (not a placeholder from remittance).
const checkDepositRecorded = (depositId: string, deposits: CashDeposit[]): boolean => {
  const deposit = deposits.find(d => d.id === depositId);
  if (!deposit) return false;
  return !!deposit.bankAccount &&
    !deposit.bankAccount.includes('Cash Remittance') &&
    !deposit.bankAccount.includes('Cheque Remittance') &&
    deposit.bankAccount.trim() !== '';
};

// Orders with order_date before this are v1 imports; exclude from cash deposit views and totals.
const V1_IMPORT_ORDER_DATE_CUTOFF = '2026-02-16';

export default function LeaderCashDepositsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings: paymentSettings } = usePaymentSettings();

  // State
  const [loading, setLoading] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState<CashDeposit[]>([]);
  const [depositHistory, setDepositHistory] = useState<CashDeposit[]>([]);
  const [depositSummaries, setDepositSummaries] = useState<Record<string, {
    cashPortion: number;
    chequePortion: number;
    nonCashPortion: number;
  }>>({});
  const [pendingDailyGroups, setPendingDailyGroups] = useState<DailyDepositGroup[]>([]);
  const [dayDetailsByDate, setDayDetailsByDate] = useState<Record<string, {
    agents: DailyAgentGroup[];
    totalOrders: number;
    totalUnits: number;
  }>>({});
  const [loadingDayDetails, setLoadingDayDetails] = useState<Record<string, boolean>>({});
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [expandedDays, setExpandedDays] = useState<string[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string[]>>({}); // dateKey -> agentIds[]

  // Verified Deposit History filters
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  // Deposit Modal State
  const [depositTypeSelectionOpen, setDepositTypeSelectionOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedPendingDeposit, setSelectedPendingDeposit] = useState<CashDeposit | null>(null);
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);
  const [depositType, setDepositType] = useState<'CASH' | 'CHEQUE'>('CASH');
  const [bankAccount, setBankAccount] = useState('');
  const [cashReferenceNumber, setCashReferenceNumber] = useState('');
  const [chequeReferenceNumber, setChequeReferenceNumber] = useState('');
  const [depositNotes, setDepositNotes] = useState('');
  const [depositSlipFile, setDepositSlipFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View Details Modal State
  const [viewDepositDialogOpen, setViewDepositDialogOpen] = useState(false);
  const [selectedDepositToView, setSelectedDepositToView] = useState<CashDeposit | null>(null);
  const [depositOrders, setDepositOrders] = useState<DepositOrderBreakdown[]>([]);
  const [loadingDepositOrders, setLoadingDepositOrders] = useState(false);

  // Day Deposits Trail Modal State (shows all deposits for a day as a timeline)
  const [viewDayTrailOpen, setViewDayTrailOpen] = useState(false);
  const [dayTrailDeposits, setDayTrailDeposits] = useState<CashDeposit[]>([]);
  const [dayTrailOrders, setDayTrailOrders] = useState<Record<string, DepositOrderBreakdown[]>>({});
  const [loadingDayTrailOrders, setLoadingDayTrailOrders] = useState(false);

  // Order Details Modal State
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<{
    summary: DepositOrderBreakdown;
    items: OrderItemDetail[];
  } | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isFinanceOnly = user?.role === 'finance';

  // Agent selection helpers
  const toggleAgentSelection = (dateKey: string, agentId: string) => {
    setSelectedAgents(prev => {
      const currentSelected = prev[dateKey] || [];
      const isSelected = currentSelected.includes(agentId);
      
      if (isSelected) {
        return {
          ...prev,
          [dateKey]: currentSelected.filter(id => id !== agentId)
        };
      } else {
        return {
          ...prev,
          [dateKey]: [...currentSelected, agentId]
        };
      }
    });
  };

  const toggleAllAgentsForDay = (dateKey: string, agentIds: string[]) => {
    setSelectedAgents(prev => {
      const currentSelected = prev[dateKey] || [];
      const allSelected = agentIds.every(id => currentSelected.includes(id));
      
      if (allSelected) {
        return {
          ...prev,
          [dateKey]: []
        };
      } else {
        return {
          ...prev,
          [dateKey]: agentIds
        };
      }
    });
  };

  const getSelectedAgentsForDay = (dateKey: string): string[] => {
    return selectedAgents[dateKey] || [];
  };

  const calculateSelectedTotals = (day: any, dateKey: string) => {
    const selectedAgentIds = getSelectedAgentsForDay(dateKey);
    
    if (selectedAgentIds.length === 0) {
      // No selection = show all awaiting orders
      const allOrders = day.agents.flatMap((a: any) => a.orders);
      const awaiting = allOrders.filter((o: any) => !o.depositRecorded);
      return {
        orders: awaiting.length,
        quantity: awaiting.reduce((s: number, o: any) => s + o.totalQuantity, 0),
        amount: awaiting.reduce((s: number, o: any) => s + o.remittedAmount, 0),
        selectedCount: 0
      };
    }
    
    // Calculate only for selected agents
    const selectedOrders = day.agents
      .filter((a: any) => selectedAgentIds.includes(a.agentId))
      .flatMap((a: any) => a.orders)
      .filter((o: any) => !o.depositRecorded);
    
    return {
      orders: selectedOrders.length,
      quantity: selectedOrders.reduce((s: number, o: any) => s + o.totalQuantity, 0),
      amount: selectedOrders.reduce((s: number, o: any) => s + o.remittedAmount, 0),
      selectedCount: selectedAgentIds.length
    };
  };

  // Verified Deposit History: filtered + paginated
  const { filteredHistoryDeposits, historyTotalPages, filteredHistoryTotal } = useMemo(() => {
    const q = historySearchQuery.trim().toLowerCase();
    const filtered = depositHistory.filter((d) => {
      if (q) {
        const matchAgent = d.agentName?.toLowerCase().includes(q);
        const matchBank = d.bankAccount?.toLowerCase().includes(q);
        const matchRef = (d.referenceNumber || '').toLowerCase().includes(q);
        const matchNotes = (d.notes || '').toLowerCase().includes(q);
        if (!matchAgent && !matchBank && !matchRef && !matchNotes) return false;
      }
      if (historyDateFrom && d.depositDate < historyDateFrom) return false;
      if (historyDateTo && d.depositDate > historyDateTo) return false;
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    const paginated = filtered.slice(start, start + HISTORY_PAGE_SIZE);
    return {
      filteredHistoryDeposits: paginated,
      historyTotalPages: totalPages,
      filteredHistoryTotal: filtered.length,
    };
  }, [depositHistory, historySearchQuery, historyDateFrom, historyDateTo, historyPage]);

  // Reset page when filters change and current page would be empty
  useEffect(() => {
    const q = historySearchQuery.trim().toLowerCase();
    const filtered = depositHistory.filter((d) => {
      if (q) {
        const matchAgent = d.agentName?.toLowerCase().includes(q);
        const matchBank = d.bankAccount?.toLowerCase().includes(q);
        const matchRef = (d.referenceNumber || '').toLowerCase().includes(q);
        const matchNotes = (d.notes || '').toLowerCase().includes(q);
        if (!matchAgent && !matchBank && !matchRef && !matchNotes) return false;
      }
      if (historyDateFrom && d.depositDate < historyDateFrom) return false;
      if (historyDateTo && d.depositDate > historyDateTo) return false;
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
    if (historyPage > totalPages) setHistoryPage(1);
  }, [depositHistory, historySearchQuery, historyDateFrom, historyDateTo, historyPage]);

  // Initial Fetch & Realtime
  useEffect(() => {
    if (!user?.id || !['team_leader', 'super_admin', 'system_administrator', 'finance', 'manager', 'admin'].includes(user.role)) return;

    // Initial fetch
    fetchData();

    // Debounce timer for smooth real-time updates
    let updateTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing cash deposits...');
        fetchData(false); // Skip loading state for real-time updates
      }, 300);
    };

    // Subscribe to remittances_log and cash_deposits (both affect the cash deposits view)
    const remittancesChannel = supabase
      .channel(`remittances-cash-deposits-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'remittances_log',
        },
        () => debouncedRefresh()
      )
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'cash_deposits',
        },
        () => debouncedRefresh()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for remittances + cash_deposits');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
        }
      });

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      supabase.removeChannel(remittancesChannel);
    };
  }, [user?.id, user?.role]);

  const fetchData = async (showLoading = true) => {
    if (!user?.id) return;
    if (showLoading) setLoading(true);
    try {
      await fetchDepositHistory();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };


  const loadDepositSummaries = async (deposits: CashDeposit[]) => {
    try {
      if (!deposits.length) {
        setDepositSummaries({});
        return;
      }

      const depositIds = deposits.map(d => d.id);

      const { data, error } = await supabase
        .from('client_orders')
        .select('id, deposit_id, order_date, total_amount, payment_method, payment_mode, payment_splits')
        .in('deposit_id', depositIds);

      if (error) throw error;

      const summaries: Record<string, { cashPortion: number; chequePortion: number; nonCashPortion: number }> = {};

      (data || []).forEach((order: any) => {
        if (!order.order_date || order.order_date < V1_IMPORT_ORDER_DATE_CUTOFF) return;
        const depositId = order.deposit_id as string | null;
        if (!depositId) return;

        const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
        const paymentMethod = order.payment_method as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | null;
        const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

        let cashPortion = 0;
        let chequePortion = 0;
        let nonCashPortion = 0;

        if (paymentMode === 'SPLIT') {
          splits.forEach((s: any) => {
            const amount = s.amount || 0;
            if (s.method === 'CASH') {
              cashPortion += amount;
            } else if (s.method === 'CHEQUE') {
              chequePortion += amount;
            } else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
              nonCashPortion += amount;
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

        if (!summaries[depositId]) {
          summaries[depositId] = { cashPortion: 0, chequePortion: 0, nonCashPortion: 0 };
        }

        summaries[depositId].cashPortion += cashPortion;
        summaries[depositId].chequePortion += chequePortion;
        summaries[depositId].nonCashPortion += nonCashPortion;
      });

      setDepositSummaries(summaries);
      return summaries;
    } catch (error) {
      console.error('Error loading deposit summaries', error);
      // Fail-soft: keep existing summaries if any
      return depositSummaries;
    }
  };


  const fetchDepositHistory = async () => {
    try {
      // 1. Fetch from remittances_log (source of truth) - only remittances with cash/cheque orders go to cash deposits
      // Display all cash deposits starting from Feb 16, 2026
      let remittanceQuery = supabase
        .from('remittances_log')
        .select('id, company_id, agent_id, leader_id, remittance_date, order_ids')
        .gte('remittance_date', V1_IMPORT_ORDER_DATE_CUTOFF)
        .order('remittance_date', { ascending: false });

      if (['finance', 'admin', 'super_admin'].includes(user?.role || '') && user?.company_id) {
        remittanceQuery = remittanceQuery.eq('company_id', user.company_id);
      }

      if (['manager', 'team_leader'].includes(user?.role || '')) {
        if (!user?.company_id) return;
        const { data: relationships, error: relError } = await supabase
          .from('leader_teams')
          .select('agent_id, leader_id')
          .eq('company_id', user.company_id);
        if (relError) throw relError;

        const directReports = (relationships || []).filter(r => r.leader_id === user?.id).map(r => r.agent_id);
        let allTeamIds = directReports;
        if (user?.role === 'manager') {
          const secondLevel = (relationships || []).filter(r => directReports.includes(r.leader_id)).map(r => r.agent_id);
          allTeamIds = Array.from(new Set([...directReports, ...secondLevel]));
        }
        if (user?.role === 'team_leader' && user?.id) {
          allTeamIds = Array.from(new Set([...allTeamIds, user.id]));
        }
        if (allTeamIds.length === 0) {
          setPendingDeposits([]);
          setDepositHistory([]);
          return;
        }
        remittanceQuery = remittanceQuery.in('agent_id', allTeamIds);
      }

      const { data: remittanceRows, error: remErr } = await remittanceQuery;
      if (remErr) throw remErr;

      const allOrderIds = Array.from(new Set((remittanceRows || []).flatMap((r: any) => r.order_ids || [])));
      if (allOrderIds.length === 0) {
        setPendingDeposits([]);
        setDepositHistory([]);
        setPendingDailyGroups([]);
        return;
      }

      // 2. Fetch orders and filter to only those with cash or cheque (exclude bank transfer only)
      const { data: ordersData, error: ordErr } = await supabase
        .from('client_orders')
        .select('id, deposit_id, order_date, total_amount, payment_method, payment_mode, payment_splits')
        .in('id', allOrderIds);

      if (ordErr) throw ordErr;

      const orderIdsWithCashOrCheque: string[] = [];
      (ordersData || []).forEach((order: any) => {
        const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
        const paymentMethod = order.payment_method as string | null;
        const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];
        let cashPortion = 0;
        let chequePortion = 0;
        if (paymentMode === 'SPLIT') {
          splits.forEach((s: any) => {
            if (s.method === 'CASH') cashPortion += s.amount || 0;
            else if (s.method === 'CHEQUE') chequePortion += s.amount || 0;
            // Bank transfer and GCash are excluded - they do not go into cash deposits
          });
        } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
          const amt = order.total_amount || 0;
          if (paymentMethod === 'CASH') cashPortion = amt;
          else chequePortion = amt;
        }
        if (cashPortion > 0 || chequePortion > 0) {
          orderIdsWithCashOrCheque.push(order.id);
        }
      });

      const depositIdsFromRemittances = Array.from(new Set(
        (ordersData || [])
          .filter((o: any) => orderIdsWithCashOrCheque.includes(o.id) && o.deposit_id)
          .map((o: any) => o.deposit_id as string)
      ));

      if (depositIdsFromRemittances.length === 0) {
        setPendingDeposits([]);
        setDepositHistory([]);
        setPendingDailyGroups([]);
        return;
      }

      // 3. Fetch cash_deposits for those deposit_ids (slip, bank account, status, etc.)
      const { data: depositsData, error } = await supabase
        .from('cash_deposits')
        .select(`
          id, deposit_date, amount, bank_account, reference_number, status, deposit_slip_url, agent_id, deposit_type, notes, created_at,
          agent:profiles!cash_deposits_agent_id_fkey(full_name)
        `)
        .in('id', depositIdsFromRemittances)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const deposits = (depositsData || []).map((d: any) => ({
        id: d.id,
        depositDate: d.deposit_date,
        amount: d.amount,
        bankAccount: d.bank_account,
        referenceNumber: d.reference_number,
        status: d.status,
        agentName: d.agent?.full_name || 'Unknown',
        agentId: d.agent_id,
        depositSlipUrl: d.deposit_slip_url,
        depositType: d.deposit_type as 'CASH' | 'CHEQUE' | null,
        notes: d.notes || null,
        createdAt: d.created_at || undefined,
      }));

      // Pre-load summaries for all deposits so we can show correct cash/cheque-only amounts
      const summaries = await loadDepositSummaries(deposits);

      // Separate pending and verified deposits
      const pending = deposits.filter(d => d.status === 'pending_verification');
      setPendingDeposits(pending);
      setDepositHistory(deposits.filter(d => d.status === 'verified'));

      // Build daily groups for pending deposits (cash/cheque portions only).
      // Use only the sum of orders currently linked to each deposit (summary).
      // Do not fall back to deposit.amount when summary is missing: after e.g.
      // unlinking imported orders (deposit_id = NULL), that deposit may have no
      // orders left and deposit.amount would be stale, causing a header/expand mismatch.
      const dailyMap: Record<string, DailyDepositGroup> = {};
      pending.forEach((deposit) => {
        const date = new Date(deposit.depositDate);
        const dateKey = format(date, 'yyyy-MM-dd');
        const dateLabel = format(date, 'M/d/yyyy');
        const summary = summaries[deposit.id];
        const amount = summary ? summary.cashPortion + summary.chequePortion : 0;

        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            dateKey,
            dateLabel,
            depositIds: [],
            totalAmount: 0,
            // Initial status per day – will be refined after we see which deposits already have slips
            status: 'pending_deposit',
          };
        }
        dailyMap[dateKey].depositIds.push(deposit.id);
        dailyMap[dateKey].totalAmount += amount;
      });

      // After grouping, determine per-day status based on whether ALL deposits for that day
      // already have a deposit slip recorded.
      Object.values(dailyMap).forEach((group) => {
        const depositsForDay = pending.filter((d) => group.depositIds.includes(d.id));
        const allHaveSlip =
          depositsForDay.length > 0 && depositsForDay.every((d) => !!d.depositSlipUrl);

        group.status = allHaveSlip ? 'awaiting_verification' : 'pending_deposit';
      });

      const groups = Object.values(dailyMap).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));

      // Preload per-day agent/order/unit details so headers show real counts immediately
      try {
        const allDepositIds = Array.from(new Set(groups.flatMap((g) => g.depositIds)));

        if (allDepositIds.length > 0) {
          const { data: ordersData, error: ordersError } = await supabase
            .from('client_orders')
            .select(`
              id,
              deposit_id,
              order_date,
              order_number,
              total_amount,
              payment_method,
              payment_mode,
              payment_splits,
              created_at,
              agent_id,
              agent:profiles!client_orders_agent_id_fkey(full_name),
              clients(name),
              items:client_order_items(quantity)
            `)
            .in('deposit_id', allDepositIds);

          if (ordersError) throw ordersError;

          // Use all linked orders for day details count (include v1 so we show real agent/order numbers)
          const ordersForDayDetails = ordersData || [];

          // Map each deposit to its date key
          const depositIdToDateKey: Record<string, string> = {};
          groups.forEach((group) => {
            group.depositIds.forEach((id) => {
              depositIdToDateKey[id] = group.dateKey;
            });
          });

          const dayAgentMaps: Record<string, Record<string, DailyAgentGroup>> = {};

          ordersForDayDetails.forEach((order: any) => {
            const depositId = order.deposit_id as string | null;
            if (!depositId) return;

            const dateKey = depositIdToDateKey[depositId];
            if (!dateKey) return;

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

            const remittedAmount = cashPortion + chequePortion;
            if (remittedAmount <= 0) return; // Exclude bank-transfer-only orders from cash deposits view

            const totalQuantity = (order.items || []).reduce(
              (sum: number, item: any) => sum + (item.quantity || 0),
              0
            );
            const agentId = order.agent_id as string;
            const agentName = order.agent?.full_name || 'Unknown Agent';

            if (!dayAgentMaps[dateKey]) {
              dayAgentMaps[dateKey] = {};
            }
            if (!dayAgentMaps[dateKey][agentId]) {
              dayAgentMaps[dateKey][agentId] = {
                agentId,
                agentName,
                orders: [],
                totalOrders: 0,
                totalUnits: 0,
                totalAmount: 0,
              };
            }

            const depositRecorded = checkDepositRecorded(depositId, pending);

            const dailyOrder: DailyOrderSummary = {
              agentId,
              agentName,
              orderId: order.id,
              depositId,
              orderNumber: order.order_number,
              clientName: order.clients?.name || 'Unknown',
              remittedAmount,
              fullOrderTotal: order.total_amount || remittedAmount,
              cashPortion,
              chequePortion,
              nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
              nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined,
              totalQuantity,
              depositRecorded,
            };

            const agentGroup = dayAgentMaps[dateKey][agentId];
            agentGroup.orders.push(dailyOrder);
            agentGroup.totalOrders += 1;
            agentGroup.totalUnits += totalQuantity;
            agentGroup.totalAmount += remittedAmount;
          });

          const nextDayDetails: Record<
            string,
            {
              agents: DailyAgentGroup[];
              totalOrders: number;
              totalUnits: number;
            }
          > = {};

          Object.entries(dayAgentMaps).forEach(([dateKey, agentMap]) => {
            const agents = Object.values(agentMap).sort((a, b) => a.agentName.localeCompare(b.agentName));
            const totals = agents.reduce(
              (acc, ag) => {
                acc.totalOrders += ag.totalOrders;
                acc.totalUnits += ag.totalUnits;
                return acc;
              },
              { totalOrders: 0, totalUnits: 0 }
            );

            nextDayDetails[dateKey] = {
              agents,
              totalOrders: totals.totalOrders,
              totalUnits: totals.totalUnits,
            };
          });

          if (Object.keys(nextDayDetails).length > 0) {
            setDayDetailsByDate((prev) => ({
              ...prev,
              ...nextDayDetails,
            }));
          }
        }
      } catch (summaryError) {
        console.error('Error preloading daily cash summaries', summaryError);
      }

      setPendingDailyGroups(groups);

    } catch (error) {
      console.error('Error fetching history', error);
      toast({
        title: 'Error',
        description: 'Failed to load deposit history',
        variant: 'destructive'
      });
    }
  };


  const handleOpenDepositModal = (pendingDeposit: CashDeposit) => {
    if (isFinanceOnly) return;
    setSelectedPendingDeposit(pendingDeposit);
    setSelectedDepositIds([pendingDeposit.id]);
    setBankAccount('');
    setCashReferenceNumber('');
    setChequeReferenceNumber('');
    setDepositNotes('');
    setDepositSlipFile(null);
    setShowCamera(false);
    // Preload orders for this deposit so we can show accurate total and order references
    fetchDepositOrders([pendingDeposit.id]);

    // If type is already known (from recent remittance update), skip selection
    if (pendingDeposit.depositType === 'CASH' || pendingDeposit.depositType === 'CHEQUE') {
      setDepositType(pendingDeposit.depositType);
      setDepositDialogOpen(true);
    } else {
      // Fallback for old records or unspecified types
      setDepositTypeSelectionOpen(true);
    }
  };

  const fetchDepositOrders = async (depositIds: string[]) => {
    try {
      setLoadingDepositOrders(true);
      setDepositOrders([]);

      if (!depositIds || depositIds.length === 0) {
        setDepositOrders([]);
        return;
      }

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
          clients(name)
        `)
        .in('deposit_id', depositIds);

      if (error) throw error;

      const orders: DepositOrderBreakdown[] = (data || []).map((order: any) => {
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

        const remittedAmount = cashPortion + chequePortion;

        return {
          orderId: order.id,
          orderNumber: order.order_number,
          clientName: order.clients?.name || 'Unknown',
          remittedAmount,
          fullOrderTotal: order.total_amount || remittedAmount,
          cashPortion,
          chequePortion,
          nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
          nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined,
        };
      });

      setDepositOrders(orders);
    } catch (error) {
      console.error('Error fetching deposit orders', error);
      setDepositOrders([]);
    } finally {
      setLoadingDepositOrders(false);
    }
  };

  const openViewDeposit = (deposit: CashDeposit) => {
    setSelectedDepositToView(deposit);
    setViewDepositDialogOpen(true);
    fetchDepositOrders([deposit.id]);
  };

  const getDisplayDepositType = (depositType?: 'CASH' | 'CHEQUE' | null): string => {
    if (depositType === 'CASH' || depositType === 'CHEQUE') {
      return depositType;
    }
    // Legacy / mixed deposits where type wasn't explicitly stored
    return 'CASH/CHEQUE';
  };

  const getEffectiveDepositType = (deposit: CashDeposit): string => {
    const summary = depositSummaries[deposit.id];
    if (summary) {
      const hasCash = summary.cashPortion > 0;
      const hasCheque = summary.chequePortion > 0;
      if (hasCash && hasCheque) return 'CASH/CHEQUE';
      if (hasCash) return 'CASH';
      if (hasCheque) return 'CHEQUE';
    }
    return getDisplayDepositType(deposit.depositType || null);
  };

  const getEffectiveDepositAmount = (deposit: CashDeposit): number => {
    const summary = depositSummaries[deposit.id];
    if (summary) {
      const amount = summary.cashPortion + summary.chequePortion;
      if (amount > 0) return amount;
    }
    // Use 0 when no orders are linked (e.g. after unlinking imports); avoid stale deposit.amount
    return 0;
  };

  const getDepositTypeBadgeClass = (displayType: string): string => {
    if (displayType === 'CHEQUE') return "bg-purple-50 text-purple-700 border-purple-200";
    if (displayType === 'CASH') return "bg-green-50 text-green-700 border-green-200";
    if (displayType === 'CASH/CHEQUE') return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  };

  const selectedDepositDisplayType = selectedDepositToView ? getEffectiveDepositType(selectedDepositToView) : null;
  const selectedDepositDisplayAmount = selectedDepositToView ? getEffectiveDepositAmount(selectedDepositToView) : 0;

  const findDepositById = (depositId: string): CashDeposit | undefined => {
    return pendingDeposits.find(d => d.id === depositId) || depositHistory.find(d => d.id === depositId);
  };

  // For the Record Deposit modal: compute accurate cash/cheque total and order references
  const modalCashAmount =
    depositOrders.length > 0
      ? depositOrders.reduce((sum, o) => sum + (o.cashPortion || 0), 0)
      : selectedPendingDeposit
      ? (depositSummaries[selectedPendingDeposit.id]?.cashPortion || 0)
      : 0;

  const modalChequeAmount =
    depositOrders.length > 0
      ? depositOrders.reduce((sum, o) => sum + (o.chequePortion || 0), 0)
      : selectedPendingDeposit
      ? (depositSummaries[selectedPendingDeposit.id]?.chequePortion || 0)
      : 0;

  const modalDepositAmount = modalCashAmount + modalChequeAmount;
  const modalOrderNumbers = Array.from(new Set(depositOrders.map(o => o.orderNumber))).join(', ');

  const hasCashPortion = modalCashAmount > 0;
  const hasChequePortion = modalChequeAmount > 0;

  const handleViewOrderBreakdown = async (order: DepositOrderBreakdown) => {
    try {
      console.log('Viewing order breakdown:', order);
      // Open modal immediately with loading state
      setLoadingOrderDetails(true);
      // Initialize with summary only (items empty) to allow modal to render header
      setSelectedOrderDetails({
        summary: order,
        items: []
      });
      setOrderDialogOpen(true);

      // Fetch order items with product/variant details
      const { data, error } = await supabase
        .from('client_order_items')
        .select(`
          id,
          quantity,
          unit_price,
          variant:variants(
            name,
            variant_type,
            brand:brands(name)
          )
        `)
        .eq('client_order_id', order.orderId);

      if (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      }

      console.log('Fetched items:', data);

      const items: OrderItemDetail[] = (data || []).map((item: any) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        productName: item.variant?.brand?.name || 'Unknown Brand',
        variantName: item.variant?.name || 'Unknown Variant',
        variantType: item.variant?.variant_type,
        subtotal: (item.quantity || 0) * (item.unit_price || 0),
      }));

      // Update with items
      setSelectedOrderDetails({
        summary: order,
        items,
      });
    } catch (error) {
      console.error('Error fetching order details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details.',
        variant: 'destructive',
      });
      // Don't close modal on error, let user see it or close it manually
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  const toggleDay = (dateKey: string) => {
    const group = pendingDailyGroups.find(g => g.dateKey === dateKey);
    setExpandedDays(prev => {
      const isOpen = prev.includes(dateKey);
      const next = isOpen ? prev.filter(d => d !== dateKey) : [...prev, dateKey];
      if (!isOpen && group) {
        handleToggleDay(group);
      }
      return next;
    });
  };

  const toggleAgent = (agentKey: string) => {
    setExpandedAgents(prev =>
      prev.includes(agentKey) ? prev.filter(k => k !== agentKey) : [...prev, agentKey]
    );
  };

  const clearDateFilter = () => {
    setFilterFromDate('');
    setFilterToDate('');
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      console.error('Print failed', e);
    }
  };

  const getStatusBadge = (status: 'pending' | 'verified') => {
    if (status === 'verified') {
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Deposited
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
        <AlertCircle className="h-3 w-3 mr-1" />
        Pending Deposit
      </Badge>
    );
  };

  const handleOpenDayDeposit = (dateKey: string) => {
    if (isFinanceOnly) return;
    const group = pendingDailyGroups.find(g => g.dateKey === dateKey);
    if (!group) return;
    
    // Get selected agents for this day
    const selectedAgentIds = getSelectedAgentsForDay(dateKey);
    const dayDetails = dayDetailsByDate[dateKey];
    
    // Only include deposits that haven't had real bank details recorded yet (exclude already-recorded ones)
    let depositsForDay = pendingDeposits.filter(
      d => group.depositIds.includes(d.id) && !checkDepositRecorded(d.id, pendingDeposits)
    );
    
    // If agents are selected, filter deposits to only those belonging to selected agents
    if (selectedAgentIds.length > 0 && dayDetails) {
      const selectedDepositIds = dayDetails.agents
        .filter((a: any) => selectedAgentIds.includes(a.agentId))
        .flatMap((a: any) => a.orders.map((o: any) => o.depositId));
      
      depositsForDay = depositsForDay.filter(d => selectedDepositIds.includes(d.id));
    }
    
    if (!depositsForDay.length) {
      toast({
        title: 'No Deposit Found',
        description: selectedAgentIds.length > 0 
          ? 'No pending deposits found for the selected agents.'
          : 'There is no pending cash/cheque deposit for this day.',
        variant: 'destructive',
      });
      return;
    }
    
    // Use the first deposit as the "base" for agent/date info, but aggregate all for amount/orders
    const base = depositsForDay[0];
    setSelectedPendingDeposit(base);
    setSelectedDepositIds(depositsForDay.map(d => d.id));
    setBankAccount('');
    setCashReferenceNumber('');
    setChequeReferenceNumber('');
    setDepositNotes('');
    setDepositSlipFile(null);
    setShowCamera(false);
    setDepositType(base.depositType || 'CASH');
    fetchDepositOrders(depositsForDay.map(d => d.id));
    setDepositDialogOpen(true);
  };

  const handleViewDepositProof = (dateKey: string) => {
    // Collect all recorded deposits for this day (pending + verified), sorted oldest first
    const allForDay = [
      ...pendingDeposits.filter(
        d =>
          format(new Date(d.depositDate), 'yyyy-MM-dd') === dateKey &&
          checkDepositRecorded(d.id, pendingDeposits)
      ),
      ...depositHistory.filter(
        d => format(new Date(d.depositDate), 'yyyy-MM-dd') === dateKey
      ),
    ].sort((a, b) => {
      const ta = a.createdAt ?? a.depositDate;
      const tb = b.createdAt ?? b.depositDate;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    if (!allForDay.length) {
      toast({
        title: 'No Deposit Found',
        description: 'No deposit with recorded details was found for this date.',
        variant: 'destructive',
      });
      return;
    }

    // Open the day trail modal with all deposits
    setDayTrailDeposits(allForDay);
    setDayTrailOrders({});
    setViewDayTrailOpen(true);

    // Fetch orders for all those deposits in one go, grouped by deposit_id
    (async () => {
      try {
        setLoadingDayTrailOrders(true);
        const allIds = allForDay.map(d => d.id);
        const { data, error } = await supabase
          .from('client_orders')
          .select(`
            id, order_number, total_amount, payment_method, payment_mode, payment_splits, deposit_id, clients(name)
          `)
          .in('deposit_id', allIds);

        if (error) throw error;

        const grouped: Record<string, DepositOrderBreakdown[]> = {};
        allIds.forEach(id => { grouped[id] = []; });

        (data || []).forEach((order: any) => {
          const depositId = order.deposit_id as string;
          if (!depositId || !grouped[depositId]) return;

          const paymentMode = order.payment_mode as 'FULL' | 'SPLIT' | null;
          const paymentMethod = order.payment_method as string | null;
          const splits = Array.isArray(order.payment_splits) ? order.payment_splits : [];

          let cashPortion = 0;
          let chequePortion = 0;
          let nonCashPortion = 0;
          const nonCashLabels: string[] = [];

          if (paymentMode === 'SPLIT') {
            splits.forEach((s: any) => {
              const amt = s.amount || 0;
              if (s.method === 'CASH') cashPortion += amt;
              else if (s.method === 'CHEQUE') chequePortion += amt;
              else if (s.method === 'BANK_TRANSFER' || s.method === 'GCASH') {
                nonCashPortion += amt;
                const lbl = s.method === 'BANK_TRANSFER' ? (s.bank || 'Bank Transfer') : 'GCash';
                if (!nonCashLabels.includes(lbl)) nonCashLabels.push(lbl);
              }
            });
          } else if (paymentMethod === 'CASH' || paymentMethod === 'CHEQUE') {
            const amt = order.total_amount || 0;
            if (paymentMethod === 'CASH') cashPortion = amt;
            else chequePortion = amt;
          }

          const remittedAmount = cashPortion + chequePortion;
          grouped[depositId].push({
            orderId: order.id,
            orderNumber: order.order_number,
            clientName: order.clients?.name || 'Unknown',
            remittedAmount,
            fullOrderTotal: order.total_amount || remittedAmount,
            cashPortion,
            chequePortion,
            nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
            nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined,
          });
        });

        setDayTrailOrders(grouped);
      } catch (err) {
        console.error('Error fetching day trail orders', err);
      } finally {
        setLoadingDayTrailOrders(false);
      }
    })();
  };

  const handleToggleDay = (group: DailyDepositGroup) => {
    const nextKey = group.dateKey;
    if (!nextKey || dayDetailsByDate[nextKey]) return;

    // Lazy-load day details when a date is expanded
    (async () => {
      try {
        setLoadingDayDetails(prev => ({ ...prev, [nextKey]: true }));

        const { data, error } = await supabase
          .from('client_orders')
          .select(`
            id,
            deposit_id,
            order_date,
            order_number,
            total_amount,
            payment_method,
            payment_mode,
            payment_splits,
            created_at,
            agent_id,
            agent:profiles!client_orders_agent_id_fkey(full_name),
            clients(name),
            items:client_order_items(quantity)
          `)
          .in('deposit_id', group.depositIds);

        if (error) throw error;

        // Use all linked orders for count (include v1 so we show real agent/order numbers)
        const ordersForDayDetails = data || [];

        const agentMap: Record<string, DailyAgentGroup> = {};

        ordersForDayDetails.forEach((order: any) => {
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

          const remittedAmount = cashPortion + chequePortion;
          if (remittedAmount <= 0) return; // Exclude bank-transfer-only orders from cash deposits view

          const totalQuantity = (order.items || []).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
          const agentId = order.agent_id as string;
          const agentName = order.agent?.full_name || 'Unknown Agent';

          if (!agentMap[agentId]) {
            agentMap[agentId] = {
              agentId,
              agentName,
              orders: [],
              totalOrders: 0,
              totalUnits: 0,
              totalAmount: 0,
            };
          }

          const depositRecorded = checkDepositRecorded(order.deposit_id, pendingDeposits);

          const dailyOrder: DailyOrderSummary = {
            agentId,
            agentName,
            orderId: order.id,
            depositId: order.deposit_id,
            orderNumber: order.order_number,
            clientName: order.clients?.name || 'Unknown',
            remittedAmount,
            fullOrderTotal: order.total_amount || remittedAmount,
            cashPortion,
            chequePortion,
            nonCashPortion: nonCashPortion > 0 ? nonCashPortion : undefined,
            nonCashLabel: nonCashLabels.length > 0 ? nonCashLabels.join(' + ') : undefined,
            totalQuantity,
            depositRecorded,
          };

          agentMap[agentId].orders.push(dailyOrder);
          agentMap[agentId].totalOrders += 1;
          agentMap[agentId].totalUnits += totalQuantity;
          agentMap[agentId].totalAmount += remittedAmount;
        });

        const agents = Object.values(agentMap).sort((a, b) => a.agentName.localeCompare(b.agentName));
        const totals = agents.reduce(
          (acc, ag) => {
            acc.totalOrders += ag.totalOrders;
            acc.totalUnits += ag.totalUnits;
            return acc;
          },
          { totalOrders: 0, totalUnits: 0 }
        );

        setDayDetailsByDate(prev => ({
          ...prev,
          [nextKey]: {
            agents,
            totalOrders: totals.totalOrders,
            totalUnits: totals.totalUnits,
          },
        }));
      } catch (error) {
        console.error('Error loading day deposit details', error);
      } finally {
        setLoadingDayDetails(prev => ({ ...prev, [nextKey]: false }));
      }
    })();
  };

  const handleSelectDepositType = (type: 'CASH' | 'CHEQUE') => {
    setDepositType(type);
    setDepositTypeSelectionOpen(false);
    setDepositDialogOpen(true);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera',
        variant: 'destructive'
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `deposit-slip-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setDepositSlipFile(file);
          stopCamera();
          toast({ title: 'Photo Captured', description: 'Deposit slip photo captured successfully!' });
        }
      }, 'image/jpeg', 0.95);
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const handleSubmitDeposit = async () => {
    // Basic validation
    if (!bankAccount) {
      toast({
        title: 'Incomplete',
        description: 'Please select a bank or Direct to Office option.',
        variant: 'destructive',
      });
      return;
    }

    if (!depositSlipFile || !selectedPendingDeposit) {
      toast({
        title: 'Incomplete',
        description: 'Please upload the deposit slip photo.',
        variant: 'destructive',
      });
      return;
    }

    const isDirectOffice = bankAccount === 'DIRECT_OFFICE';
    const requiresCashRef = hasCashPortion && !isDirectOffice;
    const requiresChequeRef = hasChequePortion && !isDirectOffice;

    if (requiresCashRef && !cashReferenceNumber.trim()) {
      toast({
        title: 'Incomplete',
        description: 'Please enter the cash reference number.',
        variant: 'destructive',
      });
      return;
    }

    if (requiresChequeRef && !chequeReferenceNumber.trim()) {
      toast({
        title: 'Incomplete',
        description: 'Please enter the cheque reference number.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      let combinedReferenceNumber = '';

      if (hasCashPortion && hasChequePortion) {
        const parts: string[] = [];
        if (cashReferenceNumber.trim()) parts.push(`Cash: ${cashReferenceNumber.trim()}`);
        if (chequeReferenceNumber.trim()) parts.push(`Cheque: ${chequeReferenceNumber.trim()}`);
        combinedReferenceNumber = parts.join(' | ');
      } else if (hasCashPortion) {
        combinedReferenceNumber = cashReferenceNumber.trim();
      } else if (hasChequePortion) {
        combinedReferenceNumber = chequeReferenceNumber.trim();
      }

      // 1. Upload Slip
      const timestamp = Date.now();
      const filePath = `${user?.id}/deposits/${timestamp}_${depositSlipFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('cash-deposits')
        .upload(filePath, depositSlipFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cash-deposits')
        .getPublicUrl(filePath);

      // 2. Update existing pending deposit with bank details (keep status as pending_verification)
      const { error: updateError } = await supabase
        .from('cash_deposits')
        .update({
          bank_account: bankAccount,
          reference_number: combinedReferenceNumber || null,
          deposit_slip_url: publicUrl,
          updated_at: new Date().toISOString(),
          deposit_type: depositType,
          notes: depositNotes.trim() || null,
        })
        .in('id', selectedDepositIds); // <-- FIX: Update all selected deposits for this day group

      if (updateError) throw updateError;

      toast({ title: "Success", description: `${depositType === 'CASH' ? 'Cash' : 'Cheque'} deposit details recorded successfully! Awaiting verification.` });

      // Notify finance/admin roles that a new deposit is ready for verification (non-blocking)
      if (user?.company_id) {
        try {
          await sendNotificationToCompanyRoles({
            companyId: user.company_id,
            roles: ['admin', 'finance', 'super_admin', 'system_administrator'],
            type: 'system_message',
            title: 'New Cash/Cheque Deposit Pending Verification',
            message: `${user.full_name || 'A team leader'} recorded a ${depositType === 'CASH' ? 'cash' : 'cheque'} deposit for ${selectedPendingDeposit.agentName}.`,
            referenceType: 'cash_deposit',
            referenceId: selectedPendingDeposit.id,
          });
        } catch (e) {
          console.warn('Cash deposit notification failed (non-blocking):', e);
        }
      }
      setDepositDialogOpen(false);
      stopCamera(); // Clean up camera if it's still running
      fetchData();

    } catch (error: any) {
      console.error("Deposit Error:", error);
      toast({ title: "Error", description: error.message || "Failed to record deposit", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };


  if (!canViewCashDeposits(user?.role)) {
    return (
      <div className="p-8 space-y-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Only team leaders, managers, and admins can access this page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build daily cash data view (cash/cheque only) for the UI template
  const filteredDailyCashData = pendingDailyGroups
    .filter((group) => {
      if (filterFromDate && group.dateKey < filterFromDate) return false;
      if (filterToDate && group.dateKey > filterToDate) return false;
      return true;
    })
    .map((group) => {
      const details = dayDetailsByDate[group.dateKey];

      // Map internal day status to simple UI status:
      // - 'pending_deposit'       → 'pending'   (Pending Deposit)
      // - 'awaiting_verification' → 'verified'  (Deposited – waiting for finance verification)
      const depositStatus: 'pending' | 'verified' =
        group.status === 'pending_deposit' ? 'pending' : 'verified';

      return {
        date: group.dateKey,
        displayDate: group.dateLabel,
        totalAmount: group.totalAmount,
        totalQuantity: details?.totalUnits ?? 0,
        agents: details?.agents ?? [],
        depositStatus,
        rawGroup: group,
      };
    });

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Cash Deposits</h1>
          <p className="text-sm md:text-base text-muted-foreground">Record cash/cheque deposits from remittances</p>
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={() => fetchData()} title="Refresh">
          {loading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Filter className="h-3 w-3 md:h-4 md:w-4" />}
        </Button>
      </div>

      {/* Daily Cash Collections (cash/cheque portions only) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Daily Cash Collections
              </CardTitle>
              <CardDescription>
                Cash/cheque remittance orders grouped by date. Click to expand and view agent details.
              </CardDescription>
            </div>

            {/* Date Filter & Print */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="fromDate" className="text-sm whitespace-nowrap">
                  From:
                </Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-[140px] h-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="toDate" className="text-sm whitespace-nowrap">
                  To:
                </Label>
                <Input
                  id="toDate"
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-[140px] h-9"
                />
              </div>
              {(filterFromDate || filterToDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFilter}
                  className="h-9 px-2"
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="h-9 gap-1"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredDailyCashData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No cash/cheque orders found for the selected date range.</p>
              {(filterFromDate || filterToDate) && (
                <Button variant="link" onClick={clearDateFilter} className="mt-2">
                  Clear filter
                </Button>
              )}
            </div>
          ) : (
            filteredDailyCashData.map((day) => {
              const allDayOrders = day.agents.flatMap(a => a.orders);
              const awaitingOrders = allDayOrders.filter(o => !o.depositRecorded);
              const recordedOrders = allDayOrders.filter(o => o.depositRecorded);
              const awaitingAmount = awaitingOrders.reduce((s, o) => s + o.remittedAmount, 0);
              const recordedAmount = recordedOrders.reduce((s, o) => s + o.remittedAmount, 0);
              const awaitingQty = awaitingOrders.reduce((s, o) => s + o.totalQuantity, 0);
              const awaitingOrderCount = awaitingOrders.length;
              return (
              <Collapsible
                key={day.date}
                open={expandedDays.includes(day.date)}
                onOpenChange={() => toggleDay(day.date)}
              >
                <div className="border rounded-lg overflow-hidden">
                  {/* Day Header */}
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                      <div className="flex items-center gap-3">
                        {expandedDays.includes(day.date) ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <h3 className="font-semibold text-lg">{day.displayDate}</h3>
                          <p className="text-sm text-muted-foreground">
                            {day.agents.length} agent(s) •{' '}
                            {day.agents.reduce((sum, a) => sum + a.totalOrders, 0)} order(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-bold text-lg">
                            ₱{day.totalAmount.toLocaleString()}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {day.totalQuantity} units
                          </div>
                        </div>
                        {getStatusBadge(day.depositStatus)}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  {/* Day Content */}
                  <CollapsibleContent>
                    <div className="p-4 space-y-4 border-t">
                      {/* Agents List */}
                      {day.agents.map((agent) => {
                        const agentKey = `${day.date}-${agent.agentId}`;
                        const isSelected = getSelectedAgentsForDay(day.date).includes(agent.agentId);
                        const hasPendingOrders = agent.orders.some((o: any) => !o.depositRecorded);
                        
                        return (
                          <Collapsible
                            key={agentKey}
                            open={expandedAgents.includes(agentKey)}
                            onOpenChange={() => toggleAgent(agentKey)}
                          >
                            <div className={`border rounded-lg ${isSelected ? 'border-green-400 bg-green-50/30' : ''}`}>
                              {/* Agent Header */}
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer transition-colors">
                                  <div className="flex items-center gap-3">
                                    {expandedAgents.includes(agentKey) ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    
                                    {/* Checkbox - only show if agent has pending deposits and day is pending */}
                                    {hasPendingOrders && day.depositStatus === 'pending' && !isFinanceOnly && (
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleAgentSelection(day.date, agent.agentId)}
                                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                        />
                                      </div>
                                    )}
                                    
                                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                      <User className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{agent.agentName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {agent.totalOrders} order(s)
                                        {isSelected && (
                                          <span className="ml-1 text-green-600 font-medium">• Selected</span>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold">
                                      ₱{agent.totalAmount.toLocaleString()}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {agent.totalUnits} units
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleTrigger>

                              {/* Agent Orders */}
                              <CollapsibleContent>
                                <div className="border-t">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-muted/30">
                                        <TableHead>Order #</TableHead>
                                        <TableHead>Client</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {agent.orders.map((order) => (
                                        <TableRow
                                          key={order.orderId}
                                          className={order.depositRecorded ? 'bg-blue-50 hover:bg-blue-100' : ''}
                                        >
                                          <TableCell className="font-mono text-sm">
                                            {order.orderNumber}
                                          </TableCell>
                                          <TableCell>
                                            <div>
                                              <p className="font-medium">{order.clientName}</p>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {order.totalQuantity}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex flex-col items-end gap-1">
                                              <span className="font-semibold">
                                                ₱{(order.remittedAmount > 0 ? order.remittedAmount : order.fullOrderTotal).toLocaleString()}
                                                {order.remittedAmount === 0 && order.fullOrderTotal > 0 && (
                                                  <span className="text-muted-foreground font-normal text-xs ml-1">(non-cash)</span>
                                                )}
                                              </span>
                                              {order.depositRecorded && (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                                  Deposit Recorded
                                                </Badge>
                                              )}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleViewOrderBreakdown(order);
                                              }}
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        );
                      })}

                      {/* Day Summary & Actions */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t">
                        <div className="flex-1 space-y-2">
                          {/* Calculate selected totals */}
                          {(() => {
                            const totals = calculateSelectedTotals(day, day.date);
                            const selectedAgentIds = getSelectedAgentsForDay(day.date);
                            const hasSelection = selectedAgentIds.length > 0;
                            
                            return (
                              <>
                                {/* Awaiting Deposit row - shows based on selection */}
                                {totals.orders > 0 && (
                                  <div className={`rounded-lg p-3 ${hasSelection ? 'bg-green-50 border border-green-200' : 'bg-muted/50'}`}>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">
                                      {hasSelection 
                                        ? `Awaiting Deposit (${totals.selectedCount} agent${totals.selectedCount > 1 ? 's' : ''} selected)`
                                        : 'Awaiting Deposit (All Agents)'
                                      }
                                    </p>
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                      <div>
                                        <p className="text-xs text-muted-foreground">Orders</p>
                                        <p className="font-bold">{totals.orders}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Quantity</p>
                                        <p className="font-bold">{totals.quantity}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Amount</p>
                                        <p className={`font-bold ${hasSelection ? 'text-green-600' : ''}`}>
                                          ₱{totals.amount.toLocaleString()}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                          {/* Deposit Recorded row */}
                          {recordedOrders.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <p className="text-xs font-medium text-blue-600 mb-2">Deposit Recorded</p>
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <p className="text-xs text-blue-500">Orders</p>
                                  <p className="font-bold text-blue-700">{recordedOrders.length}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-blue-500">Quantity</p>
                                  <p className="font-bold text-blue-700">
                                    {recordedOrders.reduce((s, o) => s + o.totalQuantity, 0)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-blue-500">Amount</p>
                                  <p className="font-bold text-blue-700">
                                    ₱{recordedAmount.toLocaleString()}
                                    {recordedAmount === 0 && recordedOrders.some(o => o.fullOrderTotal > 0) && (
                                      <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                                        (non-cash orders)
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          {/* Select All / Clear buttons */}
                          {day.depositStatus === 'pending' && !isFinanceOnly && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleAllAgentsForDay(
                                  day.date, 
                                  day.agents.filter((a: any) => a.orders.some((o: any) => !o.depositRecorded)).map((a: any) => a.agentId)
                                )}
                              >
                                {(() => {
                                  const pendingAgentIds = day.agents
                                    .filter((a: any) => a.orders.some((o: any) => !o.depositRecorded))
                                    .map((a: any) => a.agentId);
                                  const allSelected = pendingAgentIds.length > 0 && pendingAgentIds.every((id: string) => getSelectedAgentsForDay(day.date).includes(id));
                                  return allSelected ? 'Deselect All' : `Select All (${pendingAgentIds.length})`;
                                })()}
                              </Button>
                              {getSelectedAgentsForDay(day.date).length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedAgents(prev => ({ ...prev, [day.date]: [] }))}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          )}
                          
                          {day.depositStatus === 'pending' ? (
                            isFinanceOnly ? null : (
                              <Button
                                className="gap-2 bg-green-600 hover:bg-green-700"
                                onClick={() => handleOpenDayDeposit(day.date)}
                                disabled={(() => {
                                  const totals = calculateSelectedTotals(day, day.date);
                                  return totals.orders === 0 && day.agents.some((a: any) => a.orders.some((o: any) => !o.depositRecorded));
                                })()}
                              >
                                <Upload className="h-4 w-4" />
                                Record Deposit
                                {getSelectedAgentsForDay(day.date).length > 0 && (
                                  <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded">
                                    {getSelectedAgentsForDay(day.date).length}
                                  </span>
                                )}
                              </Button>
                            )
                          ) : (
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => handleViewDepositProof(day.date)}
                            >
                              <Receipt className="h-4 w-4" />
                              View Deposit
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Deposit History Section */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Verified Deposit History</CardTitle>
          <CardDescription className="text-xs md:text-sm">Confirmed bank deposits recorded in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {depositHistory.length === 0 ? (
            <p className="text-muted-foreground text-xs md:text-sm">No verified deposits yet.</p>
          ) : (
            <>
              {/* Search, date filter, pagination */}
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by agent, bank, ref #, or notes..."
                      value={historySearchQuery}
                      onChange={(e) => { setHistorySearchQuery(e.target.value); setHistoryPage(1); }}
                      className="pl-8 h-9"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
                      <Input
                        type="date"
                        value={historyDateFrom}
                        onChange={(e) => { setHistoryDateFrom(e.target.value); setHistoryPage(1); }}
                        className="h-9 w-[130px]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">To</Label>
                      <Input
                        type="date"
                        value={historyDateTo}
                        onChange={(e) => { setHistoryDateTo(e.target.value); setHistoryPage(1); }}
                        className="h-9 w-[130px]"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Showing {filteredHistoryDeposits.length} of {filteredHistoryTotal}</span>
                  {historyTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage <= 1}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <span className="px-2">Page {historyPage} of {historyTotalPages}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                        disabled={historyPage >= historyTotalPages}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {filteredHistoryTotal === 0 ? (
                <p className="text-muted-foreground text-xs md:text-sm">No deposits match your search or date filter.</p>
              ) : (
              <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {filteredHistoryDeposits.map((deposit) => (
                  <div key={deposit.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{deposit.agentName}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">₱{getEffectiveDepositAmount(deposit).toLocaleString()}</p>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 h-5 text-[10px]">
                          <CheckCircle2 className="h-2 w-2 mr-1" /> Verified
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <Badge
                          variant="outline"
                          className={`ml-1 ${getDepositTypeBadgeClass(getEffectiveDepositType(deposit))}`}
                        >
                          {getEffectiveDepositType(deposit)}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank:</span>
                        <p className="font-medium text-[10px] truncate">{deposit.bankAccount}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Ref:</span>
                        <p className="font-mono text-[10px]">{deposit.referenceNumber || '-'}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => openViewDeposit(deposit)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Ref Number</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistoryDeposits.map((deposit) => {
                  const displayType = getEffectiveDepositType(deposit);
                  const displayAmount = getEffectiveDepositAmount(deposit);

                  return (
                    <TableRow key={deposit.id}>
                      <TableCell>{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getDepositTypeBadgeClass(displayType)}>
                          {displayType === 'CHEQUE' ? (
                            <CreditCard className="h-3 w-3 mr-1" />
                          ) : (
                            <BanknoteIcon className="h-3 w-3 mr-1" />
                          )}
                          {displayType}
                        </Badge>
                      </TableCell>
                      <TableCell>{deposit.agentName}</TableCell>
                      <TableCell>{deposit.bankAccount}</TableCell>
                      <TableCell className="font-mono text-xs">{deposit.referenceNumber || '-'}</TableCell>
                      <TableCell className="text-right font-medium">₱{displayAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={deposit.notes || ''}>
                        {deposit.notes || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openViewDeposit(deposit)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              </div>
              </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Deposit Type Selection Modal */}
      <Dialog open={depositTypeSelectionOpen} onOpenChange={setDepositTypeSelectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Deposit Type</DialogTitle>
            <DialogDescription>
              Is this a Cash Deposit or a Cheque Deposit?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-emerald-50 hover:border-emerald-200 transition-all group"
              onClick={() => handleSelectDepositType('CASH')}
            >
              <div className="p-3 rounded-full bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
                <BanknoteIcon className="h-8 w-8 text-emerald-700" />
              </div>
              <span className="font-semibold text-lg text-emerald-900">Cash Deposit</span>
            </Button>

            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-purple-50 hover:border-purple-200 transition-all group"
              onClick={() => handleSelectDepositType('CHEQUE')}
            >
              <div className="p-3 rounded-full bg-purple-100 group-hover:bg-purple-200 transition-colors">
                <CreditCard className="h-8 w-8 text-purple-700" />
              </div>
              <span className="font-semibold text-lg text-purple-900">Cheque Deposit</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDepositTypeSelectionOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Record Deposit Modal */}
      {isMobile ? (
        <Sheet open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Record Cash &amp; Cheque Deposit</SheetTitle>
                  <SheetDescription className="text-xs">
                    Enter deposit details for remittance from {selectedPendingDeposit?.agentName}
                  </SheetDescription>
                </SheetHeader>
                {/* Form Content */}
                <div className="space-y-4">
                  <div className={`p-3 rounded-lg flex justify-between items-center border ${depositType === 'CHEQUE' ? 'bg-purple-50 border-purple-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <span className={`${depositType === 'CHEQUE' ? 'text-purple-800' : 'text-emerald-800'} text-xs font-medium`}>Amount to Deposit:</span>
                    <span className={`text-lg font-bold ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                      ₱{modalDepositAmount.toLocaleString()}
                    </span>
                  </div>

                  {selectedPendingDeposit && (
                    <div className="border rounded-md p-3 bg-orange-50/30 border-orange-200 space-y-2 text-xs">
                      <p className="font-semibold uppercase text-muted-foreground text-[10px]">Remittance Summary</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agent:</span>
                        <span className="font-medium">{selectedPendingDeposit.agentName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium">{format(new Date(selectedPendingDeposit.depositDate), 'MMM dd, yyyy')}</span>
                      </div>
                      {modalOrderNumbers && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Orders:</span>
                          <span className="font-mono text-[10px] text-right max-w-[180px] truncate">
                            {modalOrderNumbers}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Bank Account</label>
                    <Select value={bankAccount} onValueChange={setBankAccount}>
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {(paymentSettings?.bank_accounts || [])
                          .filter((b) => b.enabled)
                          .map((bank, index) => {
                            const label = formatBankLabel(bank.name, bank.account_number);
                            return (
                              <SelectItem
                                key={`${bank.name}-${bank.account_number}-${index}`}
                                value={label}
                                className="text-xs"
                              >
                                {label}
                              </SelectItem>
                            );
                          })}
                        <SelectItem value="DIRECT_OFFICE" className="text-xs">
                          Direct to Office (Company)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {hasCashPortion && hasChequePortion ? (
                      <>
                        <label className="text-xs font-medium">Cash Reference Number</label>
                        <Input
                          placeholder="Cash ref (e.g. TR-123456789)"
                          value={cashReferenceNumber}
                          onChange={(e) => setCashReferenceNumber(e.target.value)}
                          className="h-10 text-xs mb-2"
                        />
                        <label className="text-xs font-medium">Cheque Reference Number</label>
                        <Input
                          placeholder="Cheque ref (e.g. CHQ-987654321)"
                          value={chequeReferenceNumber}
                          onChange={(e) => setChequeReferenceNumber(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </>
                    ) : hasCashPortion ? (
                      <>
                        <label className="text-xs font-medium">Cash Reference Number</label>
                        <Input
                          placeholder="Cash ref (e.g. TR-123456789)"
                          value={cashReferenceNumber}
                          onChange={(e) => setCashReferenceNumber(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-xs font-medium">Cheque Reference Number</label>
                        <Input
                          placeholder="Cheque ref (e.g. CHQ-987654321)"
                          value={chequeReferenceNumber}
                          onChange={(e) => setChequeReferenceNumber(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Notes / Remarks</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      rows={2}
                      placeholder="Optional notes or remarks about this deposit..."
                      value={depositNotes}
                      onChange={(e) => setDepositNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Deposit Slip Photo</label>
                    {showCamera ? (
                      <div className="space-y-2">
                        <div className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            id="camera-video"
                            autoPlay
                            playsInline
                            ref={(video) => {
                              if (video && stream) {
                                video.srcObject = stream;
                              }
                            }}
                            className="w-full h-48 object-cover"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" onClick={capturePhoto} size="sm" className="text-xs">
                            <Camera className="h-3 w-3 mr-1" />
                            Capture
                          </Button>
                          <Button type="button" variant="outline" onClick={stopCamera} size="sm" className="text-xs">
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : depositSlipFile ? (
                      <div className="space-y-2">
                        <div className={`border-2 rounded-lg p-3 ${depositType === 'CHEQUE' ? 'border-purple-200 bg-purple-50' : 'border-emerald-200 bg-emerald-50'}`}>
                          <div className={`text-xs font-medium flex items-center justify-center gap-2 ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Photo: {depositSlipFile.name}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDepositSlipFile(null)}
                          size="sm"
                          className="w-full text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={startCamera}
                          size="sm"
                          className="w-full text-xs"
                        >
                          <Camera className="h-3 w-3 mr-1" />
                          Take Photo
                        </Button>
                        <div className="relative">
                          <div className="border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={(e) => setDepositSlipFile(e.target.files?.[0] || null)}
                            />
                            <div className="space-y-1 pointer-events-none">
                              <UploadCloud className="h-6 w-6 mx-auto text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground">Or upload from device</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sticky buttons for mobile */}
                <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t space-y-2">
                  <Button
                    onClick={handleSubmitDeposit}
                    disabled={submitting || !bankAccount || !depositSlipFile}
                    className={`w-full h-10 text-xs ${depositType === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {submitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Confirm Deposit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDepositDialogOpen(false);
                      stopCamera();
                    }}
                    disabled={submitting}
                    className="w-full h-10 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <DialogContent className="sm:max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Cash &amp; Cheque Deposit</DialogTitle>
              <DialogDescription>
                Enter deposit details for remittance from <strong>{selectedPendingDeposit?.agentName}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-lg flex justify-between items-center border ${depositType === 'CHEQUE' ? 'bg-purple-50 border-purple-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <span className={`${depositType === 'CHEQUE' ? 'text-purple-800' : 'text-emerald-800'} font-medium`}>Amount to Deposit:</span>
                <span className={`text-2xl font-bold ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                  ₱{modalDepositAmount.toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4">
                {selectedPendingDeposit && (
                  <div className="border rounded-md p-4 bg-orange-50/70 border-orange-200 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs md:text-sm font-semibold uppercase text-muted-foreground mb-1">
                          Remittance Summary
                        </p>
                        <p className="text-sm md:text-base font-medium">
                          {selectedPendingDeposit.agentName}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{format(new Date(selectedPendingDeposit.depositDate), 'MMM dd, yyyy')}</p>
                        {selectedPendingDeposit.referenceNumber && (
                          <p className="font-mono mt-0.5">
                            {selectedPendingDeposit.referenceNumber}
                          </p>
                        )}
                      </div>
                    </div>

                    {depositOrders.length > 0 && (
                      <div className="rounded-md border bg-white max-h-72 overflow-y-auto shadow-inner w-full">
                        <div className="px-3 pt-3 pb-1">
                          <p className="text-xs md:text-sm font-semibold text-orange-900">
                            Orders included in this deposit
                          </p>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs md:text-sm whitespace-nowrap">Order #</TableHead>
                              <TableHead className="text-xs md:text-sm whitespace-nowrap">Client</TableHead>
                              <TableHead className="text-right text-xs md:text-sm whitespace-nowrap">Cash</TableHead>
                              <TableHead className="text-right text-xs md:text-sm whitespace-nowrap">Cheque</TableHead>
                              <TableHead className="text-right text-xs md:text-sm whitespace-nowrap">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {depositOrders.map((order) => (
                              <TableRow key={order.orderId}>
                                <TableCell className="font-mono text-[11px] md:text-sm">
                                  {order.orderNumber}
                                </TableCell>
                                <TableCell className="text-[11px] md:text-sm">
                                  {order.clientName}
                                </TableCell>
                                <TableCell className="text-right text-[11px] md:text-sm">
                                  {order.cashPortion > 0 ? `₱${order.cashPortion.toLocaleString()}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-[11px] md:text-sm">
                                  {order.chequePortion > 0 ? `₱${order.chequePortion.toLocaleString()}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-[11px] md:text-sm font-medium">
                                  ₱{order.remittedAmount.toLocaleString()}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="sticky bottom-0 flex justify-end gap-4 px-4 py-2 border-t bg-slate-50 text-[11px] md:text-sm">
                          <span className="text-muted-foreground">
                            Cash:&nbsp;
                            <span className="font-semibold text-emerald-700">
                              ₱{modalCashAmount.toLocaleString()}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Cheque:&nbsp;
                            <span className="font-semibold text-purple-700">
                              ₱{modalChequeAmount.toLocaleString()}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bank Account</label>
                    <Select value={bankAccount} onValueChange={setBankAccount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {(paymentSettings?.bank_accounts || [])
                          .filter((b) => b.enabled)
                          .map((bank, index) => {
                            const label = formatBankLabel(bank.name, bank.account_number);
                            return (
                              <SelectItem key={`${bank.name}-${bank.account_number}-${index}`} value={label}>
                                {label}
                              </SelectItem>
                            );
                          })}
                      <SelectItem value="DIRECT_OFFICE">
                        Direct to Office (Company)
                      </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {hasCashPortion && hasChequePortion ? (
                      <>
                        <label className="text-sm font-medium">Cash Reference Number</label>
                        <Input
                          placeholder="Cash ref (e.g. TR-123456789)"
                          value={cashReferenceNumber}
                          onChange={(e) => setCashReferenceNumber(e.target.value)}
                          className="mb-3"
                        />
                        <label className="text-sm font-medium">Cheque Reference Number</label>
                        <Input
                          placeholder="Cheque ref (e.g. CHQ-987654321)"
                          value={chequeReferenceNumber}
                          onChange={(e) => setChequeReferenceNumber(e.target.value)}
                        />
                      </>
                    ) : hasCashPortion ? (
                      <>
                        <label className="text-sm font-medium">Cash Reference Number</label>
                        <Input
                          placeholder="Cash ref (e.g. TR-123456789)"
                          value={cashReferenceNumber}
                          onChange={(e) => setCashReferenceNumber(e.target.value)}
                        />
                      </>
                    ) : (
                      <>
                        <label className="text-sm font-medium">Cheque Reference Number</label>
                        <Input
                          placeholder="Cheque ref (e.g. CHQ-987654321)"
                          value={chequeReferenceNumber}
                          onChange={(e) => setChequeReferenceNumber(e.target.value)}
                        />
                      </>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes / Remarks</label>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      rows={2}
                      placeholder="Optional notes or remarks about this deposit..."
                      value={depositNotes}
                      onChange={(e) => setDepositNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Deposit Slip Photo</label>
                    {showCamera ? (
                      <div className="space-y-3">
                        <div className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            id="camera-video"
                            autoPlay
                            playsInline
                            ref={(video) => {
                              if (video && stream) {
                                video.srcObject = stream;
                              }
                            }}
                            className="w-full h-40 md:h-56 object-cover"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" onClick={capturePhoto} className="flex-1">
                            <Camera className="h-4 w-4 mr-2" />
                            Capture Photo
                          </Button>
                          <Button type="button" variant="outline" onClick={stopCamera}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : depositSlipFile ? (
                      <div className="space-y-3">
                        <div className={`border-2 rounded-lg p-4 ${depositType === 'CHEQUE' ? 'border-purple-200 bg-purple-50' : 'border-emerald-200 bg-emerald-50'}`}>
                          <div className={`text-sm font-medium flex items-center justify-center gap-2 ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                            <CheckCircle2 className="h-5 w-5" />
                            <span>Photo Captured: {depositSlipFile.name}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDepositSlipFile(null)}
                          className="w-full"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Remove Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={startCamera}
                          className="w-full"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Take Photo
                        </Button>
                        <div className="relative">
                          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={(e) => setDepositSlipFile(e.target.files?.[0] || null)}
                            />
                            <div className="space-y-2 pointer-events-none">
                              <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">Or click to upload from device</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDepositDialogOpen(false);
                  stopCamera();
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitDeposit}
                disabled={submitting || !bankAccount || !depositSlipFile}
                className={`${depositType === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Deposit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Deposit Details Modal */}
      {isMobile ? (
        <Sheet open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Deposit Details</SheetTitle>
                  <SheetDescription className="text-xs">Cash/cheque deposit information and order breakdown</SheetDescription>
                </SheetHeader>

                {selectedDepositToView && (
                  <>
                    {/* Amount Card */}
                    <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center border border-gray-100">
                      <span className="text-gray-600 text-xs font-medium">Amount (Cash/Cheque):</span>
                      <span className="text-lg font-bold text-gray-900">
                        ₱{selectedDepositDisplayAmount.toLocaleString()}
                      </span>
                    </div>

                    {/* Details Cards */}
                    <div className="space-y-3">
                      {/* Status */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Status</span>
                          <div className="flex items-center gap-2">
                            {selectedDepositToView.status === 'verified' ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span className="text-xs font-medium text-emerald-700">Verified</span>
                              </>
                            ) : selectedDepositToView.status === 'pending_verification' ? (
                              <>
                                <AlertCircle className="h-3 w-3 text-amber-600" />
                                <span className="text-xs font-medium text-amber-700">Pending</span>
                              </>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground capitalize">
                                {selectedDepositToView.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Type</span>
                          <Badge
                            variant="outline"
                            className={`${getDepositTypeBadgeClass(selectedDepositDisplayType || getDisplayDepositType(selectedDepositToView.depositType))} h-5`}
                          >
                            {selectedDepositDisplayType === 'CHEQUE' ? (
                              <CreditCard className="h-2 w-2 mr-1" />
                            ) : (
                              <BanknoteIcon className="h-2 w-2 mr-1" />
                            )}
                            <span className="text-[10px]">
                              {selectedDepositDisplayType || getDisplayDepositType(selectedDepositToView.depositType)}
                            </span>
                          </Badge>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Date</span>
                          <span className="text-xs font-medium">
                            {format(new Date(selectedDepositToView.depositDate), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>

                      {/* Agent */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Agent</span>
                          <span className="text-xs font-medium">{selectedDepositToView.agentName}</span>
                        </div>
                      </div>

                      {/* Bank */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Bank</span>
                          <span className="text-xs font-medium truncate ml-2">{selectedDepositToView.bankAccount}</span>
                        </div>
                      </div>

                      {/* Reference */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Reference</span>
                          <span className="text-[10px] font-mono">{selectedDepositToView.referenceNumber}</span>
                        </div>
                      </div>
                    </div>

                    {/* Order Breakdown */}
                    <div className="space-y-2 mt-4">
                      <h4 className="text-xs font-semibold text-muted-foreground">Order Breakdown (Cash / Cheque)</h4>
                      {loadingDepositOrders ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : depositOrders.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No linked orders found for this deposit.</p>
                      ) : (
                        <div className="space-y-2">
                          {depositOrders.map((order) => (
                            <div key={order.orderId} className="border rounded-lg p-2 bg-background">
                              <div className="flex justify-between items-center text-[11px] mb-1">
                                <span className="font-mono text-[10px] text-muted-foreground">{order.orderNumber}</span>
                                <span className="font-semibold text-emerald-700">
                                  ₱{order.remittedAmount.toFixed(2)}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mb-1 flex justify-between">
                                <span className="truncate mr-2">{order.clientName}</span>
                              </div>
                              {(order.cashPortion > 0 || order.chequePortion > 0) && (
                                <div className="text-[10px] text-muted-foreground">
                                  {order.cashPortion > 0 && `Cash ₱${order.cashPortion.toFixed(2)}`}
                                  {order.chequePortion > 0 && (
                                    <>
                                      {order.cashPortion > 0 ? ' • ' : ''}
                                      {`Cheque ₱${order.chequePortion.toFixed(2)}`}
                                    </>
                                  )}
                                </div>
                              )}
                              {order.nonCashPortion && order.nonCashPortion > 0 && (
                                <div className="text-[10px] text-muted-foreground">
                                  {(order.nonCashLabel || 'Non-cash') + ` ₱${order.nonCashPortion.toFixed(2)} (handled by Finance)`}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Deposit Slip Image */}
                    {selectedDepositToView.depositSlipUrl && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium">Deposit Slip</h4>
                        <div className="border rounded-lg overflow-hidden bg-gray-50">
                          <img
                            src={selectedDepositToView.depositSlipUrl}
                            alt="Deposit Slip"
                            className="w-full h-auto object-contain max-h-[250px]"
                          />
                        </div>
                        <div className="text-center">
                          <a
                            href={selectedDepositToView.depositSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            View Full Image
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Close Button */}
                    <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t">
                      <Button variant="outline" onClick={() => setViewDepositDialogOpen(false)} className="w-full h-10 text-xs">
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Deposit Details</DialogTitle>
              <DialogDescription>
                Cash/cheque deposit information and order breakdown.
              </DialogDescription>
            </DialogHeader>

            {selectedDepositToView && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-gray-50 rounded-lg flex justify-between items-center border border-gray-100">
                  <span className="text-gray-600 font-medium">Amount (Cash/Cheque):</span>
                  <span className="text-2xl font-bold text-gray-900">
                    ₱{selectedDepositDisplayAmount.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Status</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {selectedDepositToView.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-emerald-700">Verified</span>
                        </>
                      ) : selectedDepositToView.status === 'pending_verification' ? (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <span className="font-medium text-amber-700">Pending Verification</span>
                        </>
                      ) : (
                        <span className="font-medium text-muted-foreground capitalize">
                          {selectedDepositToView.status.replace('_', ' ')}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Type</span>
                    <span className="col-span-2 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={getDepositTypeBadgeClass(selectedDepositDisplayType || getDisplayDepositType(selectedDepositToView.depositType))}
                      >
                        {selectedDepositDisplayType === 'CHEQUE' ? (
                          <CreditCard className="h-3 w-3 mr-1" />
                        ) : (
                          <BanknoteIcon className="h-3 w-3 mr-1" />
                        )}
                        {selectedDepositDisplayType || getDisplayDepositType(selectedDepositToView.depositType)}
                      </Badge>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Date</span>
                    <span className="col-span-2 font-medium">
                      {format(new Date(selectedDepositToView.depositDate), 'MMMM dd, yyyy')}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Agent</span>
                    <span className="col-span-2 font-medium">{selectedDepositToView.agentName}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="col-span-2 font-medium truncate">{selectedDepositToView.bankAccount}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="col-span-2 font-mono text-xs">{selectedDepositToView.referenceNumber}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <h4 className="text-sm font-semibold mb-2">Included Orders</h4>
                  {loadingDepositOrders ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : depositOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No orders linked.</p>
                  ) : (
                    <div className="bg-muted/30 rounded-md border text-sm max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Order #</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {depositOrders.map((order) => (
                            <TableRow key={order.orderId} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewOrderBreakdown(order)}>
                              <TableCell className="font-mono text-xs">{order.orderNumber}</TableCell>
                              <TableCell className="text-xs">{order.clientName}</TableCell>
                              <TableCell className="text-right font-medium text-xs">
                                ₱{order.remittedAmount.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {selectedDepositToView.depositSlipUrl && (
                  <div className="pt-2 border-t mt-4">
                    <h4 className="text-sm font-semibold mb-2">Deposit Slip</h4>
                    <div className="rounded-lg overflow-hidden border bg-gray-50 flex justify-center">
                      <img
                        src={selectedDepositToView.depositSlipUrl}
                        alt="Deposit Slip"
                        className="w-full h-auto object-contain max-h-[300px]"
                      />
                    </div>
                    <div className="mt-2 text-center">
                      <a
                        href={selectedDepositToView.depositSlipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                        title="Open full image in new tab"
                      >
                        View Full Image
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDepositDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* Day Deposits Trail Modal */}
      {isMobile ? (
        <Sheet open={viewDayTrailOpen} onOpenChange={setViewDayTrailOpen}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-5 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Deposit Trail
                  </SheetTitle>
                  <SheetDescription className="text-xs">All deposits recorded for this day</SheetDescription>
                </SheetHeader>

                {loadingDayTrailOrders && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!loadingDayTrailOrders && dayTrailDeposits.map((deposit, idx) => {
                  const orders = dayTrailOrders[deposit.id] || [];
                  const totalAmt = orders.reduce((s, o) => s + o.remittedAmount, 0);
                  const displayType = getEffectiveDepositType(deposit);
                  return (
                    <div key={deposit.id} className="border rounded-lg overflow-hidden">
                      {/* Deposit header */}
                      <div className="bg-muted/50 px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">Deposit #{idx + 1}</span>
                          <Badge variant="outline" className={`${getDepositTypeBadgeClass(displayType)} h-5 text-[10px]`}>
                            {displayType === 'CHEQUE' ? <CreditCard className="h-2 w-2 mr-1" /> : <BanknoteIcon className="h-2 w-2 mr-1" />}
                            {displayType}
                          </Badge>
                          {deposit.status === 'verified' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 h-5 text-[10px]">
                              <CheckCircle2 className="h-2 w-2 mr-1" />Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-5 text-[10px]">
                              <AlertCircle className="h-2 w-2 mr-1" />Pending
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm font-bold">₱{totalAmt.toLocaleString()}</span>
                      </div>

                      <div className="p-3 space-y-2 text-xs">
                        {/* Timestamp */}
                        {deposit.createdAt && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>{format(new Date(deposit.createdAt), 'MMM dd, yyyy • h:mm a')}</span>
                          </div>
                        )}
                        {/* Bank */}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Bank</span>
                          <span className="font-medium truncate ml-2">{deposit.bankAccount}</span>
                        </div>
                        {/* Reference */}
                        {deposit.referenceNumber && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Reference</span>
                            <span className="font-mono text-[10px]">{deposit.referenceNumber}</span>
                          </div>
                        )}
                        {/* Notes */}
                        {deposit.notes && (
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground shrink-0">Notes</span>
                            <span className="text-right">{deposit.notes}</span>
                          </div>
                        )}

                        {/* Orders */}
                        {orders.length > 0 && (
                          <div className="mt-1 border rounded-md overflow-hidden">
                            <div className="bg-muted/30 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                              Orders ({orders.length})
                            </div>
                            {orders.map(o => (
                              <div key={o.orderId} className="flex items-center justify-between px-2 py-1 border-t text-[11px]">
                                <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                                <span className="font-semibold">₱{o.remittedAmount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Deposit Slip */}
                        {deposit.depositSlipUrl && (
                          <div className="mt-1 border rounded-md overflow-hidden">
                            <img
                              src={deposit.depositSlipUrl}
                              alt="Deposit Slip"
                              className="w-full h-auto object-contain max-h-[200px]"
                            />
                            <div className="text-center py-1">
                              <a href={deposit.depositSlipUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-blue-600 hover:underline">
                                View Full Image
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="sticky bottom-0 bg-background pt-3 pb-2 border-t">
                  <Button variant="outline" onClick={() => setViewDayTrailOpen(false)} className="w-full h-10 text-xs">
                    Close
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={viewDayTrailOpen} onOpenChange={setViewDayTrailOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Deposit Trail
              </DialogTitle>
              <DialogDescription>All deposits recorded for this day, in order of creation.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {loadingDayTrailOrders && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loadingDayTrailOrders && dayTrailDeposits.map((deposit, idx) => {
                const orders = dayTrailOrders[deposit.id] || [];
                const totalAmt = orders.reduce((s, o) => s + o.remittedAmount, 0);
                const displayType = getEffectiveDepositType(deposit);
                return (
                  <div key={deposit.id} className="border rounded-lg overflow-hidden">
                    {/* Deposit header bar */}
                    <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-muted-foreground">Deposit #{idx + 1}</span>
                        <Badge variant="outline" className={`${getDepositTypeBadgeClass(displayType)} text-xs`}>
                          {displayType === 'CHEQUE' ? <CreditCard className="h-3 w-3 mr-1" /> : <BanknoteIcon className="h-3 w-3 mr-1" />}
                          {displayType}
                        </Badge>
                        {deposit.status === 'verified' ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />Pending
                          </Badge>
                        )}
                      </div>
                      <span className="text-base font-bold">₱{totalAmt.toLocaleString()}</span>
                    </div>

                    <div className="p-4 space-y-3 text-sm">
                      {/* Timestamp */}
                      {deposit.createdAt && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-xs">{format(new Date(deposit.createdAt), 'MMMM dd, yyyy • h:mm a')}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-1 text-sm">
                        <span className="text-muted-foreground">Bank</span>
                        <span className="col-span-2 font-medium truncate">{deposit.bankAccount}</span>
                      </div>
                      {deposit.referenceNumber && (
                        <div className="grid grid-cols-3 gap-1 text-sm">
                          <span className="text-muted-foreground">Reference</span>
                          <span className="col-span-2 font-mono text-xs">{deposit.referenceNumber}</span>
                        </div>
                      )}
                      {deposit.notes && (
                        <div className="grid grid-cols-3 gap-1 text-sm">
                          <span className="text-muted-foreground">Notes</span>
                          <span className="col-span-2">{deposit.notes}</span>
                        </div>
                      )}

                      {/* Orders */}
                      {orders.length > 0 && (
                        <div className="border rounded-md overflow-hidden">
                          <div className="bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            Orders ({orders.length})
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/10">
                                <TableHead className="text-xs py-1.5">Order #</TableHead>
                                <TableHead className="text-xs py-1.5">Client</TableHead>
                                <TableHead className="text-right text-xs py-1.5">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {orders.map(o => (
                                <TableRow key={o.orderId}>
                                  <TableCell className="font-mono text-xs py-1.5">{o.orderNumber}</TableCell>
                                  <TableCell className="text-xs py-1.5">{o.clientName}</TableCell>
                                  <TableCell className="text-right font-medium text-xs py-1.5">₱{o.remittedAmount.toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Deposit Slip */}
                      {deposit.depositSlipUrl && (
                        <div className="border rounded-md overflow-hidden">
                          <div className="bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                            Deposit Slip
                          </div>
                          <div className="flex justify-center bg-gray-50 p-2">
                            <img
                              src={deposit.depositSlipUrl}
                              alt="Deposit Slip"
                              className="w-full h-auto object-contain max-h-[220px]"
                            />
                          </div>
                          <div className="text-center py-1.5">
                            <a href={deposit.depositSlipUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline">
                              View Full Image
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDayTrailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Order Details Modal */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Items included in Order #{selectedOrderDetails?.summary.orderNumber}
            </DialogDescription>
          </DialogHeader>

          {loadingOrderDetails ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedOrderDetails ? (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs uppercase font-semibold">Client</span>
                  <span className="font-medium">{selectedOrderDetails.summary.clientName}</span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground block text-xs uppercase font-semibold">Total Amount</span>
                  <span className="font-bold text-lg text-emerald-600">
                    ₱{selectedOrderDetails.summary.fullOrderTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedOrderDetails.summary.nonCashPortion && (
                <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm flex justify-between items-center">
                  <span>
                    <span className="font-semibold">{selectedOrderDetails.summary.nonCashLabel || 'Non-Cash'}:</span>
                    {' '}₱{selectedOrderDetails.summary.nonCashPortion.toLocaleString()}
                  </span>
                  <Badge variant="secondary" className="bg-white text-blue-700">
                    Handled by Finance
                  </Badge>
                </div>
              )}

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[30%]">Product</TableHead>
                      <TableHead className="w-[30%]">Variant</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      // Group items by Product Name
                      const grouped = selectedOrderDetails.items.reduce((acc, item) => {
                        const key = item.productName;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(item);
                        return acc;
                      }, {} as Record<string, OrderItemDetail[]>);

                      return Object.entries(grouped).map(([productName, groupItems]) => (
                        <>
                          {/* Product Group Header */}
                          <TableRow key={`group-${productName}`} className="hover:bg-muted/10">
                            <TableCell className="font-bold text-sm align-top pt-3 pb-1">
                              {productName}
                            </TableCell>
                            <TableCell colSpan={4} className="p-0"></TableCell>
                          </TableRow>
                          
                          {/* Variant Items */}
                          {groupItems.map((item) => (
                            <TableRow key={item.id} className="border-0 hover:bg-transparent">
                              <TableCell className="py-1"></TableCell>
                              <TableCell className="py-1 align-top">
                                <div className="text-sm font-medium">{item.variantName}</div>
                                {item.variantType && (
                                  <div className="text-xs text-muted-foreground capitalize">
                                    {item.variantType}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right py-1 align-top text-sm">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="text-right py-1 align-top text-sm">
                                ₱{item.unitPrice.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right py-1 align-top font-medium text-sm">
                                ₱{item.subtotal.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Spacer Row for visual separation between groups */}
                          <TableRow className="h-2 border-0 hover:bg-transparent"><TableCell colSpan={5} className="p-0" /></TableRow>
                        </>
                      ));
                    })()}

                    {selectedOrderDetails.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                          No items found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end pt-2 border-t">
                 <div className="text-right space-y-1">
                    {(selectedOrderDetails.summary.cashPortion > 0) && (
                      <div className="text-sm text-muted-foreground">
                        Cash Portion: <span className="font-semibold text-foreground">₱{selectedOrderDetails.summary.cashPortion.toLocaleString()}</span>
                      </div>
                    )}
                    {(selectedOrderDetails.summary.chequePortion > 0) && (
                      <div className="text-sm text-muted-foreground">
                        Cheque Portion: <span className="font-semibold text-foreground">₱{selectedOrderDetails.summary.chequePortion.toLocaleString()}</span>
                      </div>
                    )}
                 </div>
              </div>

            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No order details available.
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setOrderDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
