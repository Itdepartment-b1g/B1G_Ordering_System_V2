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
  Eye
} from 'lucide-react';

interface TeamCashOrder {
  id: string;
  orderNumber: string;
  agentId: string;
  agentName: string;
  clientName: string;
  orderDate: string;
  totalAmount: number;
  paymentProofUrl?: string | null;
}

interface CashDeposit {
  id: string;
  transactionDate: string;
  amount: number;
  bankName?: string;
  reference?: string;
}

export default function LeaderCashDepositsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<TeamCashOrder[]>([]);
  const [deposits, setDeposits] = useState<CashDeposit[]>([]);

  // Deposit dialog state
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<TeamCashOrder | null>(null);
  const [bank, setBank] = useState('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [depositDate, setDepositDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role === 'team_leader' || user?.role === 'super_admin') {
      fetchData();
    }

    // Realtime refresh on client_orders or financial_transactions change
    const channels = [
      subscribeToTable('client_orders', () => {
        if (user?.role === 'team_leader' || user?.role === 'super_admin') {
          fetchTeamCashOrders();
        }
      }),
      subscribeToTable('financial_transactions', () => {
        if (user?.role === 'team_leader' || user?.role === 'super_admin') {
          fetchCashDeposits();
        }
      })
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id, user?.role]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchTeamCashOrders(), fetchCashDeposits()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamCashOrders = async () => {
    if (!user?.id) return;

    try {
      // Get team member IDs
      const { data: teamRows, error: teamError } = await supabase
        .from('leader_teams')
        .select('agent_id')
        .eq('leader_id', user.id);

      if (teamError) throw teamError;

      const teamIds = (teamRows || []).map((t: any) => t.agent_id);
      if (!teamIds.length) {
        setOrders([]);
        return;
      }

      // Fetch CASH orders that are already approved by admin
      const { data, error } = await supabase
        .from('client_orders')
        .select(`
          id,
          order_number,
          agent_id,
          client_id,
          total_amount,
          order_date,
          status,
          stage,
          payment_method,
          payment_proof_url,
          agent:profiles!client_orders_agent_id_fkey(full_name),
          client:clients(name)
        `)
        .in('agent_id', teamIds)
        .eq('payment_method', 'CASH')
        .eq('stage', 'admin_approved')
        .order('order_date', { ascending: false });

      if (error) throw error;

      const mapped: TeamCashOrder[] = (data || []).map((row: any) => ({
        id: row.id,
        orderNumber: row.order_number,
        agentId: row.agent_id,
        agentName: row.agent?.full_name || 'Unknown Agent',
        clientName: row.client?.name || 'Unknown Client',
        orderDate: row.order_date,
        totalAmount: row.total_amount || 0,
        paymentProofUrl: row.payment_proof_url || null
      }));

      setOrders(mapped);
    } catch (err: any) {
      console.error('Error fetching team CASH orders:', err);
      toast({
        title: 'Error',
        description: 'Failed to load CASH orders for your team',
        variant: 'destructive'
      });
    }
  };

  const fetchCashDeposits = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('id, transaction_date, amount, category, description')
        .eq('transaction_type', 'revenue')
        .eq('status', 'completed')
        .eq('created_by', user.id)
        .like('category', 'cash_deposit%')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      const mapped: CashDeposit[] = (data || []).map((row: any) => ({
        id: row.id,
        transactionDate: row.transaction_date,
        amount: Number(row.amount) || 0,
        bankName: row.category?.split(':')[1] || undefined,
        reference: row.description || undefined
      }));

      setDeposits(mapped);
    } catch (err: any) {
      console.error('Error fetching cash deposits:', err);
      toast({
        title: 'Error',
        description: 'Failed to load cash deposits',
        variant: 'destructive'
      });
    }
  };

  const outstandingOrders = useMemo(
    () => orders.filter((o) => !o.paymentProofUrl),
    [orders]
  );

  const depositedOrders = useMemo(
    () => orders.filter((o) => !!o.paymentProofUrl),
    [orders]
  );

  const totalCash = useMemo(
    () => orders.reduce((sum, o) => sum + o.totalAmount, 0),
    [orders]
  );

  const totalDeposited = useMemo(
    () => deposits.reduce((sum, d) => sum + d.amount, 0),
    [deposits]
  );

  const outstandingBalance = Math.max(0, totalCash - totalDeposited);

  const handleOpenDepositDialog = (order: TeamCashOrder) => {
    setSelectedOrder(order);
    setBank('');
    setReference('');
    setAmount(order.totalAmount.toString());
    setDepositDate(format(new Date(), 'yyyy-MM-dd'));
    setFile(null);
    setDepositDialogOpen(true);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
  };

  const handleSubmitDeposit = async () => {
    if (!user?.id || !selectedOrder) return;

    if (!bank || !amount || !file) {
      toast({
        title: 'Missing information',
        description: 'Please select a bank, enter amount, and attach a deposit slip.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }

      // Upload file to "cash-deposits" bucket (ensure bucket + RLS exist in Supabase)
      const timestamp = Date.now();
      const safeName = file.name.replace(/\s+/g, '-').toLowerCase();
      const filePath = `${user.id}/${selectedOrder.id}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('cash-deposits')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from('cash-deposits')
        .getPublicUrl(filePath);

      const proofUrl = publicData?.publicUrl;

      // 1) Attach proof to client order
      const { error: updateOrderError } = await supabase
        .from('client_orders')
        .update({
          payment_proof_url: proofUrl
        } as any)
        .eq('id', selectedOrder.id);

      if (updateOrderError) throw updateOrderError;

      // 2) Create financial transaction record
      const leaderCompanyId = (user as any).company_id;
      const category = `cash_deposit:${bank}`;

      const { error: financeError } = await supabase
        .from('financial_transactions')
        .insert({
          company_id: leaderCompanyId,
          transaction_date: depositDate,
          transaction_type: 'revenue',
          category,
          amount: numericAmount,
          reference_type: 'client_order',
          reference_id: selectedOrder.id,
          agent_id: selectedOrder.agentId,
          description: reference
            ? `Cash deposit for order ${selectedOrder.orderNumber} (${bank}, ref: ${reference})`
            : `Cash deposit for order ${selectedOrder.orderNumber} (${bank})`,
          status: 'completed',
          created_by: user.id
        } as any);

      if (financeError) throw financeError;

      toast({
        title: 'Deposit recorded',
        description: 'Cash deposit has been recorded successfully.'
      });

      setDepositDialogOpen(false);
      await Promise.all([fetchTeamCashOrders(), fetchCashDeposits()]);
    } catch (err: any) {
      console.error('Error recording cash deposit:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to record cash deposit',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.role !== 'team_leader' && user?.role !== 'super_admin') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <p>This page is only available for leaders / managers.</p>
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
          <h1 className="text-3xl font-bold">Team Cash Deposits</h1>
          <p className="text-muted-foreground mt-1">
            Review CASH orders from your team and upload bank deposit slips.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">CASH Orders</CardTitle>
            <CardDescription className="text-xs">Admin-approved</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total CASH Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{totalCash.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Deposited</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">₱{totalDeposited.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outstanding CASH</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">₱{outstandingBalance.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Outstanding orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BanknoteIcon className="h-5 w-5 text-amber-600" />
            Outstanding CASH Orders
          </CardTitle>
          <CardDescription>
            Orders paid in CASH that do not yet have a recorded bank deposit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading CASH orders…</span>
            </div>
          ) : outstandingOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No outstanding CASH orders</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outstandingOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">{order.orderNumber}</TableCell>
                    <TableCell>{order.agentName}</TableCell>
                    <TableCell>{order.clientName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span>{format(new Date(order.orderDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ₱{order.totalAmount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDepositDialog(order)}
                      >
                        <UploadCloud className="h-4 w-4 mr-1" />
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

      {/* Deposited section */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Cash Deposits</CardTitle>
          <CardDescription>Summary of recorded cash deposits for your team.</CardDescription>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <BanknoteIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No cash deposits recorded yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{format(new Date(d.transactionDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{d.bankName || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {d.reference || '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ₱{d.amount.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Deposit dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Cash Deposit</DialogTitle>
            <DialogDescription>
              Upload a bank deposit slip and record the deposit details for this CASH order.
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 py-2">
              <div className="border rounded-lg p-3 bg-muted/40">
                <p className="text-sm font-semibold">
                  Order <span className="font-mono">{selectedOrder.orderNumber}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedOrder.clientName} • {selectedOrder.agentName}
                </p>
                <p className="text-sm font-medium mt-1">
                  Amount: ₱{selectedOrder.totalAmount.toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Bank</label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BPI">BPI</SelectItem>
                    <SelectItem value="BDO">BDO</SelectItem>
                    <SelectItem value="Metrobank">Metrobank</SelectItem>
                    <SelectItem value="Security Bank">Security Bank</SelectItem>
                    <SelectItem value="Others">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Deposit Date</label>
                  <Input
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (₱)</label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Reference / Notes (optional)</label>
                <Input
                  placeholder="e.g. BPI ref# 1234 / branch name"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Deposit Slip Attachment</label>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                />
                <p className="text-xs text-muted-foreground">
                  Upload a clear photo or PDF of the bank deposit slip.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDepositDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitDeposit} disabled={submitting || !selectedOrder}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4 mr-2" />
                  Save Deposit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



