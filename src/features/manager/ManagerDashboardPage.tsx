import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Users,
    Package,
    AlertCircle,
    TrendingUp,
    BanknoteIcon,
    CheckCircle2,
    Clock,
    ArrowUpRight,
    Filter
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { format } from 'date-fns';

interface DashboardStats {
    totalMembers: number;
    totalLeaders: number;
    totalInventory: number;
    pendingDepositsCount: number;
}

interface CashDeposit {
    id: string;
    depositDate: string;
    amount: number;
    bankAccount: string;
    referenceNumber: string;
    status: string;
    agentName: string;
    agentId: string;
}


interface RemittanceLog {
    id: string;
    remittance_date: string;
    remitted_at: string;
    agent_name: string;
    items_remitted: number;
    total_revenue: number;
    orders_count: number;
}

interface DepositRow {
    id: string;
    deposit_date: string;
    amount: number;
    bank_account: string;
    reference_number: string;
    status: string;
    profiles: {
        full_name: string;
        id: string;
    } | null; // Supabase joins can be object or array, commonly object for single relation
}

interface RemittanceRow {
    id: string;
    remittance_date: string;
    remitted_at: string;
    items_remitted: number;
    total_revenue: number;
    orders_count: number;
    profiles: {
        full_name: string;
    } | null;
}

export default function ManagerDashboardPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);

    // Data States
    const [stats, setStats] = useState<DashboardStats>({
        totalMembers: 0,
        totalLeaders: 0,
        totalInventory: 0,
        pendingDepositsCount: 0
    });

    const [pendingDeposits, setPendingDeposits] = useState<CashDeposit[]>([]);
    const [remittances, setRemittances] = useState<RemittanceLog[]>([]);

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            if (!user?.company_id) return;

            // 1. Get Team Hierarchy (My Team)
            const { data: relationships, error: relError } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            if (relError) throw relError;

            // Identify direct and indirect reports
            const directReports = (relationships || [])
                .filter(r => r.leader_id === user.id)
                .map(r => r.agent_id);

            const secondLevelReports = (relationships || [])
                .filter(r => directReports.includes(r.leader_id))
                .map(r => r.agent_id);

            const allTeamIds = Array.from(new Set([...directReports, ...secondLevelReports]));

            // Calculate Stats
            // Fetch Profiles for roles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, role')
                .in('id', allTeamIds);

            const totalMembers = allTeamIds.length;
            const totalLeaders = profiles?.filter(p => p.role === 'team_leader').length || 0;

            // Fetch Inventory Sum
            const { data: inventoryData } = await supabase
                .from('agent_inventory')
                .select('stock')
                .in('agent_id', allTeamIds);

            const totalInventory = inventoryData?.reduce((sum, item) => sum + (item.stock || 0), 0) || 0;

            // 2. Fetch Pending Cash Deposits (from Team Leaders/Members)
            // We look for pending deposits from anyone in the team hierarchy
            const { data: depositsData, error: depositsError } = await supabase
                .from('cash_deposits')
                .select(`
          id, deposit_date, amount, bank_account, reference_number, status, 
          profiles!cash_deposits_agent_id_fkey(full_name, id)
        `)
                .in('agent_id', allTeamIds)
                .eq('status', 'pending_verification')
                .order('deposit_date', { ascending: false });

            if (depositsError) throw depositsError;


            const formattedDeposits = ((depositsData as unknown as DepositRow[]) || []).map((d) => ({
                id: d.id,
                depositDate: d.deposit_date,
                amount: d.amount,
                bankAccount: d.bank_account,
                referenceNumber: d.reference_number,
                status: d.status,
                agentName: d.profiles?.full_name || 'Unknown',
                agentId: d.profiles?.id || ''
            }));

            // 3. Fetch Remittances (Remitted TO me)
            // Leader ID in remittances_log should be ME
            const { data: remittancesData, error: remitError } = await supabase
                .from('remittances_log')
                .select(`
          id, remittance_date, remitted_at, items_remitted, total_revenue, orders_count,
          profiles!remittances_log_agent_id_fkey(full_name)
        `)
                .eq('leader_id', user.id)
                .order('remitted_at', { ascending: false })
                .limit(20); // Last 20 remittances

            if (remitError) throw remitError;


            const formattedRemittances = ((remittancesData as unknown as RemittanceRow[]) || []).map((r) => ({
                id: r.id,
                remittance_date: r.remittance_date,
                remitted_at: r.remitted_at,
                agent_name: r.profiles?.full_name || 'Unknown',
                items_remitted: r.items_remitted,
                total_revenue: r.total_revenue,
                orders_count: r.orders_count
            }));

            setStats({
                totalMembers,
                totalLeaders,
                totalInventory,
                pendingDepositsCount: formattedDeposits.length
            });
            setPendingDeposits(formattedDeposits);
            setRemittances(formattedRemittances);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast({
                title: 'Error',
                description: 'Failed to load dashboard data',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (user?.role === 'manager') {
            fetchDashboardData();
        }
    }, [user, fetchDashboardData]);

    const handleVerifyDeposit = async (id: string) => {
        // Optimistic update
        setPendingDeposits(prev => prev.filter(d => d.id !== id));
        toast({ title: "Verified", description: "Deposit marked as verified." });

        const { error } = await supabase
            .from('cash_deposits')
            .update({ status: 'verified', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            toast({ title: "Error", description: "Failed to verify deposit", variant: "destructive" });
            fetchDashboardData(); // Revert
        } else {
            fetchDashboardData(); // Refresh to be safe
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Manager Dashboard</h1>
                <p className="text-muted-foreground">Overview of your team's performance and pending items.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Team Members</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalMembers}</div>
                        <p className="text-xs text-muted-foreground">{stats.totalLeaders} Team Leaders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Team Inventory</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalInventory.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total units in stock</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Deposits</CardTitle>
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.pendingDepositsCount}</div>
                        <p className="text-xs text-muted-foreground">Requires verification</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => fetchDashboardData()}>Refresh Data</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="deposits" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="deposits" className="flex items-center gap-2">
                        <BanknoteIcon className="h-4 w-4" />
                        Pending Deposits
                        {pendingDeposits.length > 0 && (
                            <Badge variant="destructive" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                                {pendingDeposits.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="remittances" className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4" />
                        Recent Remittances
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="deposits">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Cash Deposits</CardTitle>
                            <CardDescription>Review and verify cash deposits submitted by your team leaders.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {pendingDeposits.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500 opacity-50" />
                                    <p>No pending deposits found.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Agent / Leader</TableHead>
                                            <TableHead>Bank Account</TableHead>
                                            <TableHead>Reference</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingDeposits.map((deposit) => (
                                            <TableRow key={deposit.id}>
                                                <TableCell>{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</TableCell>
                                                <TableCell className="font-medium">{deposit.agentName}</TableCell>
                                                <TableCell>{deposit.bankAccount}</TableCell>
                                                <TableCell className="font-mono text-xs">{deposit.referenceNumber}</TableCell>
                                                <TableCell className="text-right font-bold">₱{deposit.amount.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" onClick={() => handleVerifyDeposit(deposit.id)} className="bg-emerald-600 hover:bg-emerald-700">
                                                        Verify
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="remittances">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Remittances</CardTitle>
                            <CardDescription>Stock and cash remittances received from your team.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {remittances.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p>No remittances found recently.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date & Time</TableHead>
                                            <TableHead>From Agent</TableHead>
                                            <TableHead className="text-right">Items Returned</TableHead>
                                            <TableHead className="text-right">Orders Sold</TableHead>
                                            <TableHead className="text-right">Total Revenue</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {remittances.map((remittance) => (
                                            <TableRow key={remittance.id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{format(new Date(remittance.remitted_at), 'MMM dd, yyyy')}</span>
                                                        <span className="text-xs text-muted-foreground">{format(new Date(remittance.remitted_at), 'hh:mm a')}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">{remittance.agent_name}</TableCell>
                                                <TableCell className="text-right">{remittance.items_remitted}</TableCell>
                                                <TableCell className="text-right">{remittance.orders_count}</TableCell>
                                                <TableCell className="text-right font-bold">₱{remittance.total_revenue.toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
