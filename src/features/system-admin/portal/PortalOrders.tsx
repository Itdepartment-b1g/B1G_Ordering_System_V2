import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingCart, Clock, CheckCircle2, XCircle, User, Box, ArrowUpRight } from 'lucide-react';

export function PortalOrders({ companyId }: { companyId: string }) {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchOrders();
    }, [companyId]);

    const fetchOrders = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('client_orders')
                .select(`
                    *,
                    clients (
                        name,
                        company
                    ),
                    profiles!agent_id (
                        full_name
                    )
                `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setOrders(data || []);
        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusStyles = (status: string) => {
        switch (status.toLowerCase()) {
            case 'approved': return 'bg-green-100 text-green-700 border-green-200';
            case 'pending': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-muted-foreground font-medium italic">Streaming Transaction Logs...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="rounded-[2.5rem] border overflow-hidden shadow-sm">
                <CardHeader className="bg-muted/10 border-b p-8">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                <ShoppingCart className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-extrabold italic tracking-tight">TRANSACTION LEDGER</CardTitle>
                                <CardDescription className="text-xs font-medium">Monitoring 50 most recent cross-tenant orders</CardDescription>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="text-right">
                                <div className="text-sm font-black italic">₱{orders.reduce((acc, o) => acc + (o.total_amount || 0), 0).toLocaleString()}</div>
                                <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Ledger Volume</div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <div className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-b-2 bg-muted/20">
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order Ref</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">End Client</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Allocated Agent</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Value</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Stage</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</TableHead>
                                <TableHead className="px-8 py-5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-20 text-muted-foreground italic">
                                        Negative transaction density in this environment.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orders.map((order) => (
                                    <TableRow key={order.id} className="group hover:bg-muted/5 transition-colors border-b last:border-0">
                                        <TableCell className="px-8 py-6">
                                            <div className="font-mono font-bold text-xs tracking-tighter text-primary">#{order.order_number}</div>
                                        </TableCell>
                                        <TableCell className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <div className="text-sm font-black italic uppercase tracking-tight">{order.clients?.name}</div>
                                                <div className="text-[10px] font-bold text-muted-foreground truncate max-w-[150px]">{order.clients?.company}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-8 py-6">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                                                <span className="text-sm font-medium">{order.profiles?.full_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <div className="text-sm font-black italic tracking-tighter">₱{order.total_amount.toLocaleString()}</div>
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">{order.payment_method}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-8 py-6">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${getStatusStyles(order.status)}`}>
                                                {order.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-8 py-6">
                                            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                                                <Clock className="h-3 w-3" />
                                                {new Date(order.created_at).toLocaleDateString()}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-8 py-6 text-right">
                                            <button className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all">
                                                <ArrowUpRight className="h-4 w-4" />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
