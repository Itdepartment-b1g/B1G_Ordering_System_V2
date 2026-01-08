import { useRef, useState } from 'react'; // Removed useEffect, useCallback
import { useQueryClient } from '@tanstack/react-query';
import { useManagerDashboardData } from './hooks/useManagerData';
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
    const queryClient = useQueryClient(); // Add this import if not present, and import from @tanstack/react-query

    const { data, isLoading, refetch } = useManagerDashboardData();

    // Optimistic / Mutation function for verify
    const handleVerifyDeposit = async (id: string) => {
        // Optimistic update
        toast({ title: "Verified", description: "Deposit marked as verified." });

        const { error } = await supabase
            .from('cash_deposits')
            .update({ status: 'verified', updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            toast({ title: "Error", description: "Failed to verify deposit", variant: "destructive" });
            refetch(); // Revert/Refresh
        } else {
            // Invalidate to refetch fresh data
            queryClient.invalidateQueries({ queryKey: ['manager', 'dashboard', user?.company_id, user?.id] });
            // Also invalidate the deposit history in cash deposits page if we want consistency across tabs
            queryClient.invalidateQueries({ queryKey: ['manager', 'deposits', user?.company_id] });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const { stats, pendingDeposits, remittances } = data || {
        stats: { totalMembers: 0, totalLeaders: 0, totalInventory: 0, pendingDepositsCount: 0 },
        pendingDeposits: [],
        remittances: []
    };

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
                            <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => refetch()}>Refresh Data</Button>
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
