import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    CreditCard,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    PieChart,
    BarChart3,
    Calendar,
    Target
} from 'lucide-react';
import { motion } from 'framer-motion';

export function PortalFinance({ companyId }: { companyId: string }) {
    const [stats, setStats] = useState({
        revenue: 0,
        expenses: 0,
        profit: 0,
        pendingOrders: 0
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchFinancialData();
    }, [companyId]);

    const fetchFinancialData = async () => {
        try {
            setIsLoading(true);

            // 1. Fetch Approved Revenue
            const { data: orders, error: ordersError } = await supabase
                .from('client_orders')
                .select('total_amount, status')
                .eq('company_id', companyId)
                .eq('status', 'approved');

            // 2. Fetch Approved Expenses (Purchase Orders)
            const { data: pos, error: posError } = await supabase
                .from('purchase_orders')
                .select('total_amount, status')
                .eq('company_id', companyId)
                .eq('status', 'delivered');

            // 3. Fetch Pending Volume
            const { data: pending, error: pendingError } = await supabase
                .from('client_orders')
                .select('total_amount')
                .eq('company_id', companyId)
                .eq('status', 'pending');

            if (ordersError || posError || pendingError) throw new Error('Query density imbalance detected');

            const totalRevenue = orders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
            const totalExpenses = pos?.reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;
            const pendingVolume = pending?.reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;

            setStats({
                revenue: totalRevenue,
                expenses: totalExpenses,
                profit: totalRevenue - totalExpenses,
                pendingOrders: pendingVolume
            });
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-muted-foreground font-medium italic">Calculating Financial Equilibrium...</p>
            </div>
        );
    }

    const margin = stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0;

    return (
        <div className="space-y-10">
            {/* Primary Metrics Group */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { title: "Network Revenue", value: stats.revenue, icon: TrendingUp, color: "text-green-600", bg: "bg-green-500/10", border: "border-green-200" },
                    { title: "Cost of Goods", value: stats.expenses, icon: TrendingDown, color: "text-red-600", bg: "bg-red-500/10", border: "border-red-200" },
                    { title: "Net Equilibrium", value: stats.profit, icon: Target, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
                    { title: "Pipeline Value", value: stats.pendingOrders, icon: Activity, color: "text-blue-600", bg: "bg-blue-500/10", border: "border-blue-200" }
                ].map((item, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <Card className={`rounded-[2rem] border-2 ${item.border} shadow-sm relative overflow-hidden h-full`}>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <item.icon className={`h-3 w-3 ${item.color}`} />
                                    {item.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-3xl font-black italic tracking-tighter ${item.color}`}>
                                    ₱{item.value.toLocaleString()}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                        <div className={`h-full ${item.bg.replace('/10', '')} transition-all duration-1000`} style={{ width: '70%' }} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* In-depth Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 rounded-[2.5rem] border-2 shadow-sm relative overflow-hidden bg-gradient-to-br from-background to-muted/20">
                    <CardHeader className="p-8 pb-4">
                        <div className="flex items-center gap-4">
                            <BarChart3 className="h-6 w-6 text-primary" />
                            <div>
                                <CardTitle className="text-xl font-black italic tracking-tight">OPERATIONAL MARGINS</CardTitle>
                                <CardDescription className="text-sm font-medium">Profitability ratio against cost distribution</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 h-[300px] flex items-end justify-between gap-4">
                        {[45, 60, 35, 80, 55, 75, 90].map((h, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-4 group">
                                <div className="w-full relative">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${h}%` }}
                                        transition={{ duration: 1, delay: i * 0.1 }}
                                        className="w-full bg-primary/20 group-hover:bg-primary/40 rounded-t-2xl border-t-4 border-primary transition-all cursor-crosshair relative"
                                    >
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground text-[10px] font-black px-2 py-1 rounded-lg">
                                            {h}%
                                        </div>
                                    </motion.div>
                                </div>
                                <span className="text-[10px] font-black italic text-muted-foreground">MOD {i + 1}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] border-2 shadow-sm bg-primary text-primary-foreground relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 p-12 opacity-10">
                        <DollarSign className="h-48 w-48 rotate-12" />
                    </div>
                    <CardHeader className="p-8">
                        <CardTitle className="text-xl font-black italic tracking-tight">NET EFFICIENCY</CardTitle>
                        <CardDescription className="text-primary-foreground/70 font-bold uppercase tracking-widest text-[10px]">Overall Margin Index</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0 flex flex-col items-center justify-center flex-1">
                        <div className="relative h-40 w-40 flex items-center justify-center">
                            <svg className="h-full w-full -rotate-90">
                                <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="15" fill="transparent" className="text-primary-foreground/10" />
                                <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="15" fill="transparent" strokeDasharray="440" strokeDashoffset={440 - (440 * margin) / 100} className="text-primary-foreground transition-all duration-1000" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black italic tracking-tighter">{margin.toFixed(1)}%</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">Margin</span>
                            </div>
                        </div>
                    </CardContent>
                    <div className="p-8 bg-black/10 flex items-center justify-between border-t border-white/10">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Status</span>
                            <span className="text-xs font-bold italic tracking-tight uppercase">High Performing Environment</span>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                            <Activity className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
