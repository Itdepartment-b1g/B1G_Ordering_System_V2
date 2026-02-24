import { useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useManagerDashboardData, ManagerDepositRow } from './hooks/useManagerData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
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
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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
        <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-8">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manager Dashboard</h1>
                <p className="text-sm md:text-base text-muted-foreground">Overview of your team's performance and pending items.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium">Team Members</CardTitle>
                        <Users className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-xl md:text-2xl font-bold">{stats.totalMembers}</div>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{stats.totalLeaders} Leaders</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium">Inventory</CardTitle>
                        <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-xl md:text-2xl font-bold">{stats.totalInventory.toLocaleString()}</div>
                        <p className="text-[10px] md:text-xs text-muted-foreground">Total units</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium">Deposits</CardTitle>
                        <AlertCircle className="h-3 w-3 md:h-4 md:w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-xl md:text-2xl font-bold">{stats.pendingDepositsCount}</div>
                        <p className="text-[10px] md:text-xs text-muted-foreground">Pending</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="deposits" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="deposits" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                        <BanknoteIcon className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden sm:inline">Pending</span> Deposits
                        {pendingDeposits.length > 0 && (
                            <Badge variant="destructive" className="ml-1 h-4 w-4 md:h-5 md:w-5 rounded-full p-0 flex items-center justify-center text-[9px] md:text-[10px]">
                                {pendingDeposits.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="remittances" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                        <ArrowUpRight className="h-3 w-3 md:h-4 md:w-4" />
                        <span className="hidden sm:inline">Recent</span> Remittances
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="deposits">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Pending Cash Deposits</CardTitle>
                            <CardDescription className="text-xs md:text-sm">Review and verify cash deposits submitted by your team leaders.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6">
                            {pendingDeposits.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500 opacity-50" />
                                    <p className="text-sm">No pending deposits found.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Mobile Card View */}
                                    <div className="md:hidden space-y-3">
                                        {pendingDeposits.map((deposit) => (
                                            <div key={deposit.id} className="border rounded-lg p-3 space-y-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-medium text-sm">{deposit.agentName}</p>
                                                        <p className="text-xs text-muted-foreground">{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</p>
                                                    </div>
                                                    <p className="text-sm font-bold">₱{deposit.amount.toLocaleString()}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div>
                                                        <span className="text-muted-foreground">Bank:</span>
                                                        <p className="font-medium truncate">{deposit.bankAccount}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Ref:</span>
                                                        <p className="font-mono text-[10px]">{deposit.referenceNumber}</p>
                                                    </div>
                                                </div>
                                                <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => openDepositDetails(deposit)}>
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    View Details
                                                </Button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Desktop Table View */}
                                    <div className="hidden md:block">
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
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="remittances">
                    <Card>
                        <CardHeader className="p-4 md:p-6">
                            <CardTitle className="text-base md:text-lg">Recent Remittances</CardTitle>
                            <CardDescription className="text-xs md:text-sm">Stock and cash remittances received from your team.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6">
                            {remittances.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No remittances found recently.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Mobile Card View */}
                                    <div className="md:hidden space-y-3">
                                        {remittances.map((remittance) => (
                                            <div key={remittance.id} className="border rounded-lg p-3 space-y-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-medium text-sm">{remittance.agent_name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {format(new Date(remittance.remitted_at), 'MMM dd, yyyy')} • {format(new Date(remittance.remitted_at), 'hh:mm a')}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold">₱{remittance.total_revenue.toLocaleString()}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                                                    <div>
                                                        <span className="text-muted-foreground">Items Returned:</span>
                                                        <p className="font-semibold">{remittance.items_remitted}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground">Orders Sold:</span>
                                                        <p className="font-semibold">{remittance.orders_count}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Desktop Table View */}
                                    <div className="hidden md:block">
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
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* View Details / Verify Dialog - Mobile: Sheet, Desktop: Dialog */}
            {isMobile ? (
                <Sheet open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
                    <SheetContent side="bottom" className="h-[85vh]">
                        <SheetHeader className="pb-4">
                            <SheetTitle>Deposit Details</SheetTitle>
                            <SheetDescription>Review the details of this cash deposit</SheetDescription>
                        </SheetHeader>
                        {selectedDeposit && (
                            <ScrollArea className="h-[calc(85vh-120px)] pr-4">
                                <div className="space-y-3">
                                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                                        <span className="text-xs text-emerald-800 font-medium block mb-1">Amount</span>
                                        <span className="text-2xl font-bold text-emerald-700">
                                            ₱{selectedDeposit.amount.toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="rounded-lg border bg-card p-3 space-y-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Date</span>
                                            <span className="font-medium">{format(new Date(selectedDeposit.depositDate), 'MMM dd, yyyy')}</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-t pt-2">
                                            <span className="text-muted-foreground">Agent</span>
                                            <span className="font-medium">{selectedDeposit.agentName}</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-t pt-2">
                                            <span className="text-muted-foreground">Bank</span>
                                            <span className="font-medium">{selectedDeposit.bankAccount}</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-t pt-2">
                                            <span className="text-muted-foreground">Reference</span>
                                            <span className="font-mono text-[10px]">{selectedDeposit.referenceNumber}</span>
                                        </div>
                                    </div>

                                    {selectedDeposit.depositSlipUrl ? (
                                        <div>
                                            <h4 className="text-xs font-medium mb-2">Deposit Slip</h4>
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
                                        <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                                            <p className="text-xs">No deposit slip image attached.</p>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        )}
                        <div className="pt-4 border-t">
                            <Button onClick={() => setViewDepositDialogOpen(false)} className="w-full h-11">
                                Close
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>
            ) : (
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
            )}
        </div>
    );
}
