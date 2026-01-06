
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, ShoppingCart, TrendingUp, AlertCircle, ArrowRight, CheckCircle2, Package, Calendar } from 'lucide-react';
import { useFinanceStats } from './dashboardHooks';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export function FinanceDashboard() {
    const { data: stats, isLoading } = useFinanceStats();

    if (isLoading) {
        return (
            <div className="p-4 md:p-8 flex flex-col items-center justify-center min-h-[400px] gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-muted-foreground">Loading finance dashboard...</div>
            </div>
        );
    }

    const {
        pendingOrders = [],
        recentDeposits = [],
        totalPendingRevenue = 0,
        totalDepositsToday = 0,
        pendingOrdersCount = 0
    } = stats || {};

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Summary Cards */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">₱{totalPendingRevenue.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">From {pendingOrdersCount} incoming orders</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Deposits Today</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">₱{totalDepositsToday.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Recorded today</p>
                </CardContent>
            </Card>

            {/* Spacer cards for layout balance or future metrics */}
            <Card className="hidden lg:block border-dashed opacity-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">--</div>
                    <p className="text-xs text-muted-foreground">Coming Soon</p>
                </CardContent>
            </Card>
            <Card className="hidden lg:block border-dashed opacity-50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Expenses</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">--</div>
                    <p className="text-xs text-muted-foreground">Coming Soon</p>
                </CardContent>
            </Card>

            {/* Incoming Orders Widget */}
            <Card className="col-span-full md:col-span-2">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5 text-blue-600" />
                                Incoming Orders
                            </CardTitle>
                            <CardDescription>Recent orders awaiting processing</CardDescription>
                        </div>
                        {pendingOrders.length > 0 && (
                            <Link to="/orders">
                                <Button variant="ghost" size="sm" className="text-xs">
                                    View All <ArrowRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {pendingOrders.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>No pending orders</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pendingOrders.map((order: any) => (
                                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">Order #{order.order_number}</p>
                                            <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-yellow-50 text-yellow-700 border-yellow-200">
                                                Pending
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            by <span className="font-medium text-foreground">{order.profiles?.full_name || 'Unknown'}</span>
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm">₱{order.total_amount?.toLocaleString()}</p>
                                        <p className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM dd, HH:mm')}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cash Deposits Widget */}
            <Card className="col-span-full md:col-span-2">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                Cash Deposits
                            </CardTitle>
                            <CardDescription>Recent cash deposit records</CardDescription>
                        </div>
                        {recentDeposits.length > 0 && (
                            <Link to="/finance">
                                <Button variant="ghost" size="sm" className="text-xs">
                                    View All <ArrowRight className="h-3 w-3 ml-1" />
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {recentDeposits.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-20" />
                            <p>No recent deposits</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentDeposits.map((deposit: any) => (
                                <div key={deposit.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">
                                                {deposit.profiles?.full_name || 'Unknown Agent'}
                                            </p>
                                            {deposit.status === 'verified' ? (
                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">Verified</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-orange-50 text-orange-700 border-orange-200">Pending</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {format(new Date(deposit.deposit_date), 'MMM dd, yyyy')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-sm text-emerald-600">+ ₱{deposit.amount?.toLocaleString()}</p>
                                        {deposit.deposit_slip_url && (
                                            <div className="text-xs text-blue-600 underline cursor-pointer">View Slip</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
