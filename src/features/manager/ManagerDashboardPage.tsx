import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useManagerDashboardData, ManagerDepositRow } from './hooks/useManagerData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    Users,
    Package,
    AlertCircle,
    TrendingUp,
    BanknoteIcon,
    CheckCircle2,
    Clock,
    ArrowUpRight,
    Filter,
    Eye,
    Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { format } from 'date-fns';

export default function ManagerDashboardPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const { data, isLoading, refetch } = useManagerDashboardData();

    // State for View Details Dialog
    const [viewDepositDialogOpen, setViewDepositDialogOpen] = useState(false);
    const [selectedDeposit, setSelectedDeposit] = useState<ManagerDepositRow | null>(null);

    const openDepositDetails = (deposit: ManagerDepositRow) => {
        setSelectedDeposit(deposit);
        setViewDepositDialogOpen(true);
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
                                                    <Button variant="ghost" size="sm" onClick={() => openDepositDetails(deposit)}>
                                                        <Eye className="h-4 w-4 mr-1" />
                                                        View Details
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

            {/* View Details / Verify Dialog */}
            <Dialog open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
                <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Deposit Details</DialogTitle>
                        <DialogDescription>
                            Review the details of this cash deposit.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedDeposit && (
                        <div className="space-y-4 py-4">
                            <div className="p-4 bg-emerald-50 rounded-lg flex justify-between items-center border border-emerald-100">
                                <span className="text-emerald-800 font-medium">Amount:</span>
                                <span className="text-2xl font-bold text-emerald-700">
                                    ₱{selectedDeposit.amount.toLocaleString()}
                                </span>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                    <span className="text-muted-foreground">Date</span>
                                    <span className="col-span-2 font-medium">
                                        {format(new Date(selectedDeposit.depositDate), 'MMMM dd, yyyy')}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                    <span className="text-muted-foreground">Agent</span>
                                    <span className="col-span-2 font-medium">{selectedDeposit.agentName}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                    <span className="text-muted-foreground">Bank</span>
                                    <span className="col-span-2 font-medium">{selectedDeposit.bankAccount}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 py-2 border-b">
                                    <span className="text-muted-foreground">Reference</span>
                                    <span className="col-span-2 font-mono">{selectedDeposit.referenceNumber}</span>
                                </div>
                            </div>

                            {selectedDeposit.depositSlipUrl ? (
                                <div className="mt-4">
                                    <h4 className="text-sm font-medium mb-2">Deposit Slip</h4>
                                    <div className="border rounded-lg overflow-hidden bg-gray-50">
                                        <img
                                            src={selectedDeposit.depositSlipUrl}
                                            alt="Deposit Slip"
                                            className="w-full h-auto object-contain max-h-[300px]"
                                        />
                                    </div>
                                    <div className="mt-2 text-center">
                                        <a
                                            href={selectedDeposit.depositSlipUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            View Full Image
                                        </a>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                                    <p className="text-sm">No deposit slip image attached.</p>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setViewDepositDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
