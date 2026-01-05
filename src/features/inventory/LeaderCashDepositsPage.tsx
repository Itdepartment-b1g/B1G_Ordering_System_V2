import { useEffect, useMemo, useState, ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { format } from 'date-fns';
import {
  BanknoteIcon,
  AlertCircle,
  Calendar,
  Loader2,
  ShoppingCart,
  UploadCloud,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

// Interfaces
interface CashOrder {
  id: string;
  orderNumber: string;
  agentId: string;
  agentName: string;
  totalAmount: number;
  itemsCount: number;
  depositId: string | null;
}

interface AgentDailySummary {
  agentId: string;
  agentName: string;
  ordersCount: number;
  totalItems: number;
  totalAmount: number;
  orderIds: string[];
}

interface CashDeposit {
  id: string;
  depositDate: string;
  amount: number;
  bankAccount: string;
  referenceNumber: string;
  status: string;
  agentName: string;
}

const BANK_OPTIONS = [
  "Unionbank - 00-218-002553-7",
  "BPI - 1761-011118",
  "PBCOM - 238101006138"
];

export default function LeaderCashDepositsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [pendingSummaries, setPendingSummaries] = useState<AgentDailySummary[]>([]);
  const [depositHistory, setDepositHistory] = useState<CashDeposit[]>([]);

  // Deposit Modal State
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<AgentDailySummary | null>(null);
  const [bankAccount, setBankAccount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [depositSlipFile, setDepositSlipFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initial Fetch & Realtime
  useEffect(() => {
    if (user?.role === 'team_leader' || user?.role === 'super_admin' || user?.role === 'system_administrator') {
      fetchData();
    }

    const channels = [
      subscribeToTable('client_orders', () => fetchData()),
      subscribeToTable('cash_deposits', () => fetchData())
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id, selectedDate]);

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await Promise.all([
        fetchPendingCashOrders(),
        fetchDepositHistory()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingCashOrders = async () => {
    try {
      // 1. Get Team IDs
      let teamIds: string[] = [];
      if (user?.role === 'team_leader') {
        const { data: teamData } = await supabase
          .from('leader_teams')
          .select('agent_id')
          .eq('leader_id', user.id);
        teamIds = (teamData || []).map((t: any) => t.agent_id);
      } else {
        // Admins see all agents (simplified for now, or fetch all profiles with role agent)
        // For stricter admin view, we might want to fetch all profiles first. 
        // Allowing empty teamIds to mean "all" if RLS permits, creates complexity.
        // For now, let's assume admins want to see EVERYTHING.
        // We'll filter via the query itself if teamIds is empty, distinct from "no team".
        // Actually, let's just fetch ALL cash orders if admin.
      }

      // 2. Fetch Orders
      let query = supabase
        .from('client_orders')
        .select(`
          id, order_number, agent_id, total_amount, 
          agent:profiles!client_orders_agent_id_fkey(full_name),
          items:client_order_items(quantity)
        `)
        .eq('payment_method', 'CASH')
        .is('deposit_id', null) // Only pending deposits
        //.eq('stage', 'admin_approved') // Only approved orders? Or all pending cash? Usually ALL closed sales.
        // Let's assume 'delivered' or 'completed' status, OR just payment_method CASH implies money was taken.
        // Safest is to track ALL cash orders created today/selected date.
        // Filter by date? User requirement: "fetching for that day"
        .gte('order_date', format(selectedDate, 'yyyy-MM-dd'))
        .lte('order_date', format(selectedDate, 'yyyy-MM-dd'));

      if (user?.role === 'team_leader' && teamIds.length > 0) {
        query = query.in('agent_id', teamIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      // 3. Aggregate by Agent
      const summaries: { [key: string]: AgentDailySummary } = {};

      (data as any[]).forEach(order => {
        const agentId = order.agent_id;
        const agentName = order.agent?.full_name || 'Unknown';
        const itemsCount = order.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;

        if (!summaries[agentId]) {
          summaries[agentId] = {
            agentId,
            agentName,
            ordersCount: 0,
            totalItems: 0,
            totalAmount: 0,
            orderIds: []
          };
        }

        summaries[agentId].ordersCount += 1;
        summaries[agentId].totalItems += itemsCount;
        summaries[agentId].totalAmount += Number(order.total_amount);
        summaries[agentId].orderIds.push(order.id);
      });

      setPendingSummaries(Object.values(summaries));

    } catch (error) {
      console.error('Error fetching pending orders', error);
      toast({ title: 'Error', description: 'Failed to fetch pending orders', variant: 'destructive' });
    }
  };

  const fetchDepositHistory = async () => {
    try {
      let query = supabase
        .from('cash_deposits')
        .select(`
          id, deposit_date, amount, bank_account, reference_number, status,
          agent:profiles!cash_deposits_agent_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      // If team leader, maybe filter? RLS handles company, checking team might be good but RLS is safer.

      const { data, error } = await query;
      if (error) throw error;

      setDepositHistory((data || []).map((d: any) => ({
        id: d.id,
        depositDate: d.deposit_date,
        amount: d.amount,
        bankAccount: d.bank_account,
        referenceNumber: d.reference_number,
        status: d.status,
        agentName: d.agent?.full_name || 'Unknown'
      })));

    } catch (error) {
      console.error('Error fetching history', error);
    }
  };


  const handleOpenDepositModal = (summary: AgentDailySummary) => {
    setSelectedSummary(summary);
    setBankAccount('');
    setReferenceNumber('');
    setDepositSlipFile(null);
    setDepositDialogOpen(true);
  };

  const handleSubmitDeposit = async () => {
    if (!selectedSummary || !bankAccount || !depositSlipFile) {
      toast({ title: "Incomplete", description: "Please fill all fields and upload slip.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload Slip
      const timestamp = Date.now();
      const filePath = `${user?.id}/deposits/${timestamp}_${depositSlipFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('cash-deposits') // Ensure this bucket exists!
        .upload(filePath, depositSlipFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cash-deposits')
        .getPublicUrl(filePath);

      // 2. Call RPC
      const { data, error } = await supabase.rpc('confirm_cash_deposit', {
        p_agent_id: selectedSummary.agentId,
        p_amount: selectedSummary.totalAmount,
        p_bank_account: bankAccount,
        p_reference_number: referenceNumber,
        p_deposit_slip_url: publicUrl,
        p_deposit_date: format(selectedDate, 'yyyy-MM-dd'),
        p_order_ids: selectedSummary.orderIds
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      toast({ title: "Success", description: "Cash deposit recorded successfully!" });
      setDepositDialogOpen(false);
      fetchData();

    } catch (error: any) {
      console.error("Deposit Error:", error);
      toast({ title: "Error", description: error.message || "Failed to record deposit", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };


  if (user?.role !== 'team_leader' && user?.role !== 'super_admin' && user?.role !== 'system_administrator') {
    return <div className="p-8 text-center text-muted-foreground">Access Restricted</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Cash Deposits</h1>
          <p className="text-muted-foreground">Manage and record cash collections from your sales team.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="pl-9 w-[180px]"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchData} title="Refresh">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Pending Deposits Section */}
      <Card className="border-l-4 border-l-amber-500 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Pending Deposits for {format(selectedDate, 'MMMM dd, yyyy')}
          </CardTitle>
          <CardDescription>
            Cash orders collected by agents today that need to be deposited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingSummaries.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-lg border border-dashed">
              <p className="text-muted-foreground">No pending cash orders found for this date.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead className="text-center">Total Orders</TableHead>
                  <TableHead className="text-center">Total Items</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSummaries.map((summary) => (
                  <TableRow key={summary.agentId} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{summary.agentName.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {summary.agentName}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{summary.ordersCount}</TableCell>
                    <TableCell className="text-center">{summary.totalItems}</TableCell>
                    <TableCell className="text-right font-bold text-lg text-emerald-600">
                      ₱{summary.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => handleOpenDepositModal(summary)} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <BanknoteIcon className="h-4 w-4" />
                        Record Deposit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deposit History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Deposit History</CardTitle>
          <CardDescription>Verified bank deposits recorded in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {depositHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent deposits.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Ref Number</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depositHistory.map((deposit) => (
                  <TableRow key={deposit.id}>
                    <TableCell>{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{deposit.agentName}</TableCell>
                    <TableCell>{deposit.bankAccount}</TableCell>
                    <TableCell className="font-mono text-xs">{deposit.referenceNumber || '-'}</TableCell>
                    <TableCell className="text-right font-medium">₱{deposit.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record Deposit Modal */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Cash Deposit</DialogTitle>
            <DialogDescription>
              Enter deposit details for <strong>{selectedSummary?.ordersCount} orders</strong> collected by <strong>{selectedSummary?.agentName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-emerald-50 rounded-lg flex justify-between items-center border border-emerald-100">
              <span className="text-emerald-800 font-medium">Total to Deposit:</span>
              <span className="text-2xl font-bold text-emerald-700">₱{selectedSummary?.totalAmount.toLocaleString()}</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bank Account</label>
              <Select value={bankAccount} onValueChange={setBankAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a bank account" />
                </SelectTrigger>
                <SelectContent>
                  {BANK_OPTIONS.map((bank) => (
                    <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Deposit Reference Number</label>
              <Input
                placeholder="e.g. TR-123456789"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Deposit Slip Photo</label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer relative">
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => setDepositSlipFile(e.target.files?.[0] || null)}
                />
                {depositSlipFile ? (
                  <div className="text-sm text-emerald-600 font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {depositSlipFile.name}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Click to upload deposit slip</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmitDeposit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



