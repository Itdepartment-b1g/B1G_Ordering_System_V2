import { useState, useEffect, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, AlertCircle, Eye, ShoppingCart, Loader2, Search, ChevronRight, ChevronDown, FileSignature } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface RemittanceLog {
    id: string;
    agent_id: string;
    leader_id: string;
    remittance_date: string;
    remitted_at: string;
    items_remitted: number;
    total_units: number;
    orders_count: number;
    total_revenue: number;
    order_ids: string[];
    signature_url: string | null;
    agent_name?: string;
    leader_name?: string;
}

interface TeamStats {
    leaderId: string;
    leaderName: string;
    remittanceCount: number;
    totalItems: number;
    totalRevenue: number;
    lastRemittanceDate: string;
    remittances: RemittanceLog[];
}

export default function AdminTeamRemittancesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedLeaders, setExpandedLeaders] = useState<Set<string>>(new Set());

    // View Details State
    const [selectedRemittance, setSelectedRemittance] = useState<RemittanceLog | null>(null);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [remittanceOrders, setRemittanceOrders] = useState<any[]>([]);

    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'super_admin') {
            fetchTeamRemittances();
        }
    }, [user]);

    const fetchTeamRemittances = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('remittances_log')
                .select(`
          *,
          agent:profiles!remittances_log_agent_id_fkey(full_name),
          leader:profiles!remittances_log_leader_id_fkey(full_name)
        `)
                .order('remitted_at', { ascending: false });

            if (error) throw error;

            const remittances: RemittanceLog[] = (data || []).map((item: any) => ({
                id: item.id,
                agent_id: item.agent_id,
                leader_id: item.leader_id,
                remittance_date: item.remittance_date,
                remitted_at: item.remitted_at,
                items_remitted: item.items_remitted,
                total_units: item.total_units,
                orders_count: item.orders_count,
                total_revenue: item.total_revenue,
                order_ids: item.order_ids || [],
                signature_url: item.signature_url,
                agent_name: item.agent?.full_name || 'Unknown Agent',
                leader_name: item.leader?.full_name || 'Unknown Leader'
            }));

            // Group by Leader
            const statsMap = new Map<string, TeamStats>();

            remittances.forEach(rem => {
                const leaderId = rem.leader_id;
                if (!statsMap.has(leaderId)) {
                    statsMap.set(leaderId, {
                        leaderId,
                        leaderName: rem.leader_name || 'Unknown Leader',
                        remittanceCount: 0,
                        totalItems: 0,
                        totalRevenue: 0,
                        lastRemittanceDate: rem.remitted_at,
                        remittances: []
                    });
                }

                const stat = statsMap.get(leaderId)!;
                stat.remittanceCount++;
                stat.totalItems += rem.items_remitted;
                stat.totalRevenue += rem.total_revenue;
                stat.remittances.push(rem);
                // Keep earliest date as last remittance because we iterate desc? No, we ordered desc, so first is latest.
                // Wait, if iterating, first one found is latest if ordered by remitted_at desc.
                // So keeping the first valid date found is correct.
            });

            setTeamStats(Array.from(statsMap.values()));

        } catch (error) {
            console.error('Error fetching team remittances:', error);
            toast({
                title: 'Error',
                description: 'Failed to load team remittances',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const toggleLeader = (leaderId: string) => {
        const newSet = new Set(expandedLeaders);
        if (newSet.has(leaderId)) {
            newSet.delete(leaderId);
        } else {
            newSet.add(leaderId);
        }
        setExpandedLeaders(newSet);
    };

    const fetchOrderDetails = async (orderIds: string[]) => {
        if (!orderIds || orderIds.length === 0) {
            setRemittanceOrders([]);
            return;
        }

        setLoadingDetails(true);
        try {
            const { data, error } = await supabase
                .from('client_orders')
                .select(`
                  id,
                  order_number,
                  total_amount,
                  created_at,
                  clients(name),
                  items:client_order_items(
                    quantity,
                    variant:variants(name, brand:brands(name))
                  )
                `)
                .in('id', orderIds);

            if (error) throw error;

            const formattedOrders = (data || []).flatMap((order: any) =>
                (order.items || []).map((item: any) => ({
                    orderId: order.id,
                    orderNumber: order.order_number,
                    clientName: order.clients?.name || 'Unknown',
                    variantName: item.variant?.name || 'Unknown',
                    brandName: item.variant?.brand?.name || 'Unknown',
                    quantity: item.quantity,
                    totalAmount: order.total_amount,
                    createdAt: order.created_at
                }))
            );

            setRemittanceOrders(formattedOrders);
        } catch (error: any) {
            console.error('Error fetching order details:', error);
            toast({
                title: 'Error',
                description: 'Failed to load order details',
                variant: 'destructive'
            });
            setRemittanceOrders([]);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleViewDetails = async (remittance: RemittanceLog) => {
        setSelectedRemittance(remittance);
        setViewDialogOpen(true);

        // Fetch order details if there are any
        if (remittance.order_ids && remittance.order_ids.length > 0) {
            await fetchOrderDetails(remittance.order_ids);
        } else {
            setRemittanceOrders([]);
        }
    };

    const filteredStats = teamStats.filter(stat =>
        stat.leaderName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!user || !['admin', 'super_admin'].includes(user.role || '')) {
        return (
            <div className="container mx-auto p-6">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-5 w-5" />
                            <p>You do not have permission to view this page.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Team Remittances</h1>
                    <p className="text-muted-foreground mt-1">
                        Overview of stock remittances by team
                    </p>
                </div>
                <div className="relative w-72">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search team leader..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Teams Overview</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : filteredStats.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>No team remittances found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]"></TableHead>
                                        <TableHead>Team Leader</TableHead>
                                        <TableHead className="text-right">Total Remittances</TableHead>
                                        <TableHead className="text-right">Total Items</TableHead>
                                        <TableHead className="text-right">Total Revenue</TableHead>
                                        <TableHead className="text-right">Last Remittance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStats.map(stat => (
                                        <Fragment key={stat.leaderId}>
                                            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleLeader(stat.leaderId)}>
                                                <TableCell>
                                                    {expandedLeaders.has(stat.leaderId) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </TableCell>
                                                <TableCell className="font-medium">{stat.leaderName}</TableCell>
                                                <TableCell className="text-right">{stat.remittanceCount}</TableCell>
                                                <TableCell className="text-right">{stat.totalItems}</TableCell>
                                                <TableCell className="text-right font-bold">₱{stat.totalRevenue.toLocaleString()}</TableCell>
                                                <TableCell className="text-right">{format(new Date(stat.lastRemittanceDate), 'MMM dd, yyyy')}</TableCell>
                                            </TableRow>
                                            {expandedLeaders.has(stat.leaderId) && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="bg-muted/20 p-4">
                                                        <div className="rounded-md border bg-background">
                                                            <Table>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Agent</TableHead>
                                                                        <TableHead>Date</TableHead>
                                                                        <TableHead className="text-right">Items</TableHead>
                                                                        <TableHead className="text-right">Revenue</TableHead>
                                                                        <TableHead className="text-right">Actions</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {stat.remittances.map(rem => (
                                                                        <TableRow key={rem.id}>
                                                                            <TableCell>{rem.agent_name}</TableCell>
                                                                            <TableCell>{format(new Date(rem.remitted_at), 'MMM dd, HH:mm')}</TableCell>
                                                                            <TableCell className="text-right">{rem.items_remitted}</TableCell>
                                                                            <TableCell className="text-right">₱{rem.total_revenue.toLocaleString()}</TableCell>
                                                                            <TableCell className="text-right">
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    onClick={() => handleViewDetails(rem)}
                                                                                >
                                                                                    <Eye className="h-4 w-4 mr-1" />
                                                                                    View
                                                                                </Button>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
            <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Remittance Details</DialogTitle>
                    </DialogHeader>

                    {selectedRemittance && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground">Agent</h3>
                                    <p className="text-lg font-semibold">{selectedRemittance.agent_name}</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground">Date</h3>
                                    <p className="text-lg">{format(new Date(selectedRemittance.remitted_at), 'MMM dd, yyyy HH:mm')}</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground">Total Revenue</h3>
                                    <p className="text-lg font-bold text-green-600">₱{selectedRemittance.total_revenue.toLocaleString()}</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground">Items Remitted</h3>
                                    <p className="text-lg">{selectedRemittance.items_remitted}</p>
                                </div>
                            </div>

                            <Tabs defaultValue="orders" className="w-full">
                                <TabsList>
                                    <TabsTrigger value="orders">Orders & Items</TabsTrigger>
                                    <TabsTrigger value="signature">Signature</TabsTrigger>
                                </TabsList>

                                <TabsContent value="orders" className="mt-4">
                                    {loadingDetails ? (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="h-8 w-8 animate-spin" />
                                        </div>
                                    ) : remittanceOrders.length > 0 ? (
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Order #</TableHead>
                                                        <TableHead>Client</TableHead>
                                                        <TableHead>Item (Brand - Variant)</TableHead>
                                                        <TableHead className="text-right">Qty</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {remittanceOrders.map((order, idx) => (
                                                        <TableRow key={`${order.orderId}-${idx}`}>
                                                            <TableCell>{order.orderNumber}</TableCell>
                                                            <TableCell>{order.clientName}</TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium">{order.brandName}</span>
                                                                    <span className="text-xs text-muted-foreground">{order.variantName}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">{order.quantity}</TableCell>
                                                            <TableCell className="text-right">₱{(order.totalAmount || 0).toLocaleString()}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                            <p>No order details found for this remittance.</p>
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="signature" className="mt-4">
                                    <Card>
                                        <CardContent className="flex flex-col items-center justify-center py-8 min-h-[200px]">
                                            {selectedRemittance.signature_url ? (
                                                <img
                                                    src={selectedRemittance.signature_url}
                                                    alt="Agent Signature"
                                                    className="max-w-full max-h-[300px] border rounded"
                                                />
                                            ) : (
                                                <div className="text-center text-muted-foreground">
                                                    <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                                    <p>No signature available</p>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
