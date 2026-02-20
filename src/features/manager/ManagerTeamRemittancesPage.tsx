import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    CalendarIcon,
    Package,
    AlertCircle,
    Eye,
    FileSignature,
    ShoppingCart,
    Loader2,
    Search,
    Users,
    Crown,
    Box,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Orders with order_date before this are v1 imports; exclude from team remittance detail.
const V1_IMPORT_ORDER_DATE_CUTOFF = '2026-02-16';

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
    signature_path: string | null;
    agent_name?: string;
    leader_name?: string;
}

interface GroupedRemittances {
    leaderId: string;
    leaderName: string;
    isDirect: boolean;
    remittances: RemittanceLog[];
    totalRevenue: number;
    totalUnits: number;
}

export default function ManagerTeamRemittancesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [groupedData, setGroupedData] = useState<GroupedRemittances[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [selectedRemittance, setSelectedRemittance] = useState<RemittanceLog | null>(null);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [remittanceOrders, setRemittanceOrders] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgentId, setSelectedAgentId] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;
    const [isMobile, setIsMobile] = useState(false);
    const [signatureError, setSignatureError] = useState(false);
    const [signedSignatureUrl, setSignedSignatureUrl] = useState<string | null>(null);
    const [loadingSignature, setLoadingSignature] = useState(false);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Stats
    const [stats, setStats] = useState({
        totalRemittances: 0,
        totalItems: 0, // SKUs
        totalUnits: 0, // Qty
        totalRevenue: 0,
        totalOrders: 0
    });

    useEffect(() => {
        if (!user?.id || user.role !== 'manager') return;
        fetchTeamRemittances();
    }, [user?.id, user?.role, selectedDate, selectedAgentId]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedAgentId, selectedDate]);

    const fetchTeamRemittances = async () => {
        if (!user?.id || !user.company_id) return;

        setLoading(true);
        try {
            // 1. Fetch Team Hierarchy
            const { data: relationships, error: relError } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            if (relError) throw relError;

            const directReports = (relationships || [])
                .filter((r: any) => r.leader_id === user.id)
                .map((r: any) => r.agent_id);

            const secondLevelReports = (relationships || [])
                .filter((r: any) => directReports.includes(r.leader_id))
                .map((r: any) => r.agent_id);

            const allTeamIds = [...directReports, ...secondLevelReports];

            if (allTeamIds.length === 0) {
                setGroupedData([]);
                setStats({ totalRemittances: 0, totalItems: 0, totalUnits: 0, totalRevenue: 0, totalOrders: 0 });
                return;
            }

            // 2. Build query for remittances
            let query = supabase
                .from('remittances_log')
                .select(`
          *,
          agent:profiles!remittances_log_agent_id_fkey(full_name),
          leader:profiles!remittances_log_leader_id_fkey(full_name)
        `)
                .in('agent_id', allTeamIds)
                .order('remitted_at', { ascending: false });

            // Apply date filter if selected
            if (selectedDate) {
                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                query = query.eq('remittance_date', dateStr);
            }

            const { data, error } = await query;

            if (error) throw error;

            const formattedData: RemittanceLog[] = (data || []).map((item: any) => ({
                id: item.id,
                agent_id: item.agent_id,
                leader_id: item.leader_id,
                remittance_date: item.remittance_date,
                remitted_at: item.remitted_at,
                items_remitted: item.items_remitted,
                total_units: item.total_units || 0, // Ensure we catch 0s
                orders_count: item.orders_count,
                total_revenue: item.total_revenue,
                order_ids: item.order_ids || [],
                signature_url: item.signature_url,
                signature_path: item.signature_path,
                agent_name: item.agent?.full_name || 'Unknown Agent',
                leader_name: item.leader?.full_name || 'Unknown Leader'
            }));

            // Calculate Stats
            const newStats = formattedData.reduce((acc, curr) => ({
                totalRemittances: acc.totalRemittances + 1,
                totalItems: acc.totalItems + curr.items_remitted,
                totalUnits: acc.totalUnits + curr.total_units,
                totalRevenue: acc.totalRevenue + curr.total_revenue,
                totalOrders: acc.totalOrders + curr.orders_count
            }), { totalRemittances: 0, totalItems: 0, totalUnits: 0, totalRevenue: 0, totalOrders: 0 });

            setStats(newStats);

            // Grouping Logic
            const groups = new Map<string, GroupedRemittances>();

            // Initialize "My Direct Team" group first
            groups.set(user.id, {
                leaderId: user.id,
                leaderName: 'My Direct Team',
                isDirect: true,
                remittances: [],
                totalRevenue: 0,
                totalUnits: 0
            });

            formattedData.forEach(rem => {
                const isDirect = rem.leader_id === user.id;
                const groupKey = isDirect ? user.id : rem.leader_id;

                if (!groups.has(groupKey)) {
                    groups.set(groupKey, {
                        leaderId: rem.leader_id,
                        leaderName: rem.leader_name || 'Unknown Leader',
                        isDirect: false,
                        remittances: [],
                        totalRevenue: 0,
                        totalUnits: 0
                    });
                }

                const group = groups.get(groupKey)!;
                group.remittances.push(rem);
                group.totalRevenue += rem.total_revenue;
                group.totalUnits += rem.total_units;
            });

            // Filter out empty groups, sort (search and agent filter applied client-side)
            const processedGroups = Array.from(groups.values()).filter(g => g.remittances.length > 0);
            processedGroups.sort((a, b) => {
                if (a.isDirect) return -1;
                if (b.isDirect) return 1;
                return a.leaderName.localeCompare(b.leaderName);
            });
            setGroupedData(processedGroups);

        } catch (error: any) {
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
          order_date,
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

            const nonImported = (data || []).filter(
                (o: any) => !o.order_date || o.order_date >= V1_IMPORT_ORDER_DATE_CUTOFF
            );
            const formattedOrders = nonImported.flatMap((order: any) =>
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

    const fetchSignedSignatureUrl = async (remittanceId: string) => {
        setLoadingSignature(true);
        try {
            const { data, error } = await supabase.rpc('get_remittance_signature_url', {
                remittance_id: remittanceId
            });

            if (error) throw error;

            if (data) {
                setSignedSignatureUrl(data);
                setSignatureError(false);
            } else {
                setSignedSignatureUrl(null);
                setSignatureError(true);
            }
        } catch (error: any) {
            console.error('Error fetching signed signature URL:', error);
            toast({
                title: 'Error',
                description: 'Failed to load signature',
                variant: 'destructive'
            });
            setSignatureError(true);
            setSignedSignatureUrl(null);
        } finally {
            setLoadingSignature(false);
        }
    };

    const handleViewDetails = async (remittance: RemittanceLog) => {
        setSelectedRemittance(remittance);
        setViewDialogOpen(true);
        setSignatureError(false);
        setSignedSignatureUrl(null);

        // Fetch orders
        if (remittance.order_ids && remittance.order_ids.length > 0) {
            await fetchOrderDetails(remittance.order_ids);
        } else {
            setRemittanceOrders([]);
        }

        // Use direct signature URL if bucket is public, otherwise fetch signed URL
        if (remittance.signature_url) {
            // Bucket is public, use direct URL
            setSignedSignatureUrl(remittance.signature_url);
        } else if (remittance.signature_path) {
            // Bucket is private, fetch signed URL
            await fetchSignedSignatureUrl(remittance.id);
        }
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    if (user?.role !== 'manager') {
        return (
            <div className="container mx-auto p-6">
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-5 w-5" />
                            <p>This page is only available for managers.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Remittances</h1>
                    <p className="text-sm md:text-base text-muted-foreground mt-1">
                        Track cash collections across your team
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative w-full sm:w-[250px] md:w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search agent..."
                            className="pl-8 bg-background h-9 md:h-10 text-sm"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); fetchTeamRemittances(); }}
                        />
                    </div>

                    {/* Date Filter */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full sm:w-[160px] md:w-[180px] h-9 md:h-10 justify-start text-left font-normal border-dashed text-xs md:text-sm">
                                <CalendarIcon className="mr-1 md:mr-2 h-3 w-3 md:h-4 md:w-4" />
                                {selectedDate ? format(selectedDate, 'MMM dd') : <span>Filter date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={setSelectedDate}
                                initialFocus
                            />
                            {selectedDate && (
                                <div className="p-3 border-t">
                                    <Button
                                        variant="ghost"
                                        className="w-full"
                                        onClick={() => setSelectedDate(undefined)}
                                    >
                                        Clear filter
                                    </Button>
                                </div>
                            )}
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-3">
                <Card className="bg-gradient-to-br from-white to-gray-50 border-l-4 border-l-primary shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">Remittances</CardTitle>
                        <FileSignature className="h-3 w-3 md:h-4 md:w-4 text-primary opacity-70" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-lg md:text-2xl font-bold">{stats.totalRemittances}</div>
                        <p className="text-[10px] md:text-xs text-muted-foreground">
                            Records
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-white to-gray-50 border-l-4 border-l-gray-400 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground">Items</CardTitle>
                        <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground opacity-70" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-lg md:text-2xl font-bold">{stats.totalItems}</div>
                        <p className="text-[10px] md:text-xs text-muted-foreground">
                            Variants
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-white border-l-4 border-l-emerald-500 shadow-sm col-span-2 md:col-span-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                        <CardTitle className="text-[10px] md:text-sm font-medium text-emerald-700">Revenue</CardTitle>
                        <ShoppingCart className="h-3 w-3 md:h-4 md:w-4 text-emerald-600 opacity-70" />
                    </CardHeader>
                    <CardContent className="p-3 md:p-6 pt-0">
                        <div className="text-lg md:text-2xl font-bold text-emerald-700">₱{stats.totalRevenue.toLocaleString()}</div>
                        <p className="text-[10px] md:text-xs text-emerald-600">
                            Collected
                        </p>
                    </CardContent>
                </Card>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading remittance data...</p>
                </div>
            ) : groupedData.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <Package className="h-12 w-12 mb-4 opacity-20" />
                        <h3 className="text-lg font-medium">No remittances found</h3>
                        <p className="max-w-sm mt-1">
                            {searchQuery || selectedDate
                                ? "Try adjusting your filters to see more results."
                                : "Your team hasn't submitted any remittances yet."}
                        </p>
                        {(searchQuery || selectedDate) && (
                            <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setSelectedDate(undefined); }}>
                                Clear Filters
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4 md:space-y-6">
                    {groupedData.map((group) => (
                        <Card key={group.leaderId} className="overflow-hidden border shadow-sm">
                            <CardHeader className={`py-3 md:py-4 px-3 md:px-6 ${group.isDirect ? 'bg-primary/5' : 'bg-muted/30'} border-b flex flex-row items-center justify-between`}>
                                <div className="flex items-center gap-2 md:gap-3">
                                    {group.isDirect ? (
                                        <div className="p-1.5 md:p-2 bg-primary/10 rounded-full">
                                            <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                        </div>
                                    ) : (
                                        <div className="p-1.5 md:p-2 bg-amber-100 rounded-full">
                                            <Crown className="h-4 w-4 md:h-5 md:w-5 text-amber-700" />
                                        </div>
                                    )}
                                    <div>
                                        <CardTitle className="text-sm md:text-base font-bold">
                                            {group.leaderName}
                                        </CardTitle>
                                        <CardDescription className="text-[10px] md:text-sm">
                                            {group.isDirect ? 'Direct Reports' : 'Sub-Team'}
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-muted-foreground text-[9px] md:text-xs uppercase tracking-wider">Revenue</span>
                                    <span className="font-bold text-emerald-600 text-xs md:text-sm">₱{group.totalRevenue.toLocaleString()}</span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {/* Mobile Card View */}
                                <div className="md:hidden space-y-2 p-3">
                                    {group.remittances.map((remittance) => (
                                        <div key={remittance.id} className="border rounded-lg p-3 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-7 w-7">
                                                        <AvatarFallback className="text-[9px] bg-slate-100">
                                                            {getInitials(remittance.agent_name || '')}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="font-medium text-xs">{remittance.agent_name}</p>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            {format(new Date(remittance.remitted_at), 'MMM dd, yyyy')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="font-bold text-emerald-600 text-xs">₱{remittance.total_revenue.toLocaleString()}</span>
                                            </div>

                                            <div className="flex justify-between items-center pt-2 border-t text-xs">
                                                {remittance.orders_count > 0 ? (
                                                    <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 h-5 text-[10px]">
                                                        {remittance.orders_count} orders
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-[10px]">No orders</span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-[10px]"
                                                    onClick={() => handleViewDetails(remittance)}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    View
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Desktop Table View */}
                                <div className="hidden md:block">
                                    <Table>
                                    <TableHeader className="bg-muted/10">
                                        <TableRow>
                                            <TableHead className="w-[200px] pl-6">Date</TableHead>
                                            <TableHead>Agent</TableHead>
                                            <TableHead className="text-right">Orders</TableHead>
                                            <TableHead className="text-right">Revenue</TableHead>
                                            <TableHead className="w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {group.remittances.map((remittance) => (
                                            <TableRow key={remittance.id} className="hover:bg-muted/50 transition-colors">
                                                <TableCell className="pl-6 font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{format(new Date(remittance.remitted_at), 'MMM dd, yyyy')}</span>
                                                        <span className="text-xs text-muted-foreground">{format(new Date(remittance.remitted_at), 'hh:mm a')}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarFallback className="text-[10px] bg-slate-100">
                                                                {getInitials(remittance.agent_name || '')}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-medium text-sm">{remittance.agent_name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {remittance.orders_count > 0 ? (
                                                        <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                                                            {remittance.orders_count} orders
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-emerald-600">
                                                    ₱{remittance.total_revenue.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0"
                                                        onClick={() => handleViewDetails(remittance)}
                                                    >
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                </div>
            )}

            {/* View Details Dialog - Mobile: Sheet, Desktop: Dialog */}
            {isMobile ? (
                <Sheet open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                    <SheetContent side="bottom" className="h-[90vh]">
                        <SheetHeader className="pb-3">
                            <SheetTitle className="text-base">Remittance Details</SheetTitle>
                            <SheetDescription className="text-xs">
                                Cash deposit by {selectedRemittance?.agent_name}
                            </SheetDescription>
                        </SheetHeader>

                        {selectedRemittance && (
                            <ScrollArea className="h-[calc(90vh-100px)]">
                                <div className="space-y-3 pr-4">
                                    {/* Header Info - Mobile */}
                                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-lg border text-xs">
                                        <div>
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Agent</p>
                                            <p className="font-semibold mt-0.5 text-xs">{selectedRemittance.agent_name}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Revenue</p>
                                            <p className="font-bold text-emerald-600 mt-0.5">₱{selectedRemittance.total_revenue.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Orders</p>
                                            <p className="font-semibold mt-0.5">{selectedRemittance.orders_count}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase">Items</p>
                                            <p className="font-semibold mt-0.5">{selectedRemittance.items_remitted}</p>
                                        </div>
                                    </div>

                                    {/* Orders - Mobile */}
                                    {selectedRemittance.orders_count > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="font-semibold text-sm">Orders ({selectedRemittance.orders_count})</h4>
                                            {loadingDetails ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                </div>
                                            ) : remittanceOrders.length > 0 ? (
                                                <div className="space-y-2">
                                                    {remittanceOrders.map((order, index) => (
                                                        <div key={`${order.orderId}-${index}`} className="border rounded-lg p-2 space-y-1 text-xs">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <p className="font-mono text-[10px] text-muted-foreground">{order.orderNumber}</p>
                                                                    <p className="font-medium text-xs">{order.clientName}</p>
                                                                </div>
                                                                {(index === 0 || remittanceOrders[index - 1].orderId !== order.orderId) && (
                                                                    <span className="font-bold text-emerald-600 text-xs">₱{order.totalAmount.toLocaleString()}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px]">
                                                                <span className="text-muted-foreground">{order.brandName}</span>
                                                                <span className="mx-1">•</span>
                                                                <span>{order.variantName}</span>
                                                                <span className="mx-1">•</span>
                                                                <span className="font-semibold">Qty: {order.quantity}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-center py-6 text-muted-foreground text-xs border border-dashed rounded-lg">No order details</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Signature - Mobile */}
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-sm">Signature</h4>
                                        {loadingSignature ? (
                                            <div className="border rounded-lg p-8 text-center">
                                                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                                                <p className="text-xs text-muted-foreground">Loading signature...</p>
                                            </div>
                                        ) : signedSignatureUrl && !signatureError ? (
                                            <div className="border rounded-lg overflow-hidden">
                                                <div className="flex items-center justify-center p-4 bg-slate-50 min-h-[120px]">
                                                    <img
                                                        src={signedSignatureUrl}
                                                        alt="Agent Signature"
                                                        className="max-h-32 max-w-full object-contain mix-blend-multiply"
                                                        onError={(e) => {
                                                            console.error('Failed to load signature image:', signedSignatureUrl);
                                                            setSignatureError(true);
                                                        }}
                                                    />
                                                </div>
                                                <div className="bg-emerald-50 border-t p-2 flex items-center gap-2">
                                                    <FileSignature className="h-3 w-3 text-emerald-700" />
                                                    <p className="text-[10px] font-bold text-emerald-800">Verified</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="border border-dashed rounded-lg p-6 text-center">
                                                <FileSignature className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-30" />
                                                <p className="text-xs text-muted-foreground">
                                                    {signatureError 
                                                        ? 'Signature failed to load' 
                                                        : 'No signature available'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </ScrollArea>
                        )}

                        <div className="pt-3 border-t mt-3">
                            <Button onClick={() => setViewDialogOpen(false)} className="w-full h-10">
                                Close
                            </Button>
                        </div>
                    </SheetContent>
                </Sheet>
            ) : (
                <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Remittance Details</DialogTitle>
                            <DialogDescription>
                                Showing CASH deposit details and orders remitted by {selectedRemittance?.agent_name}
                            </DialogDescription>
                        </DialogHeader>

                        {selectedRemittance && (
                        <div className="space-y-4">
                            {/* Header Info */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted/40 rounded-lg border">
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agent</p>
                                    <p className="font-semibold mt-1">{selectedRemittance.agent_name}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team Leader</p>
                                    {selectedRemittance.leader_id === user!.id ? (
                                        <p className="font-semibold text-primary mt-1">Me (Direct)</p>
                                    ) : (
                                        <p className="font-semibold mt-1">{selectedRemittance.leader_name}</p>
                                    )}
                                </div>

                                <div>
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Remittance ID</p>
                                    <p className="font-mono text-xs mt-1 text-muted-foreground">{selectedRemittance.id.slice(0, 8)}</p>
                                </div>
                            </div>

                            {/* Tabs for Details */}
                            <Tabs defaultValue="summary" className="w-full">
                                <TabsList className="grid w-full grid-cols-3">
                                    <TabsTrigger value="summary">
                                        📊 Summary
                                    </TabsTrigger>
                                    <TabsTrigger value="orders">
                                        💰 Cash Orders ({selectedRemittance.orders_count})
                                    </TabsTrigger>
                                    <TabsTrigger value="signature">
                                        ✍️ Signature
                                    </TabsTrigger>
                                </TabsList>

                                {/* Summary Tab */}
                                <TabsContent value="summary" className="space-y-4 pt-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-4">

                                            <Card className="border-l-4 border-l-green-500">
                                                <CardHeader className="py-3">
                                                    <CardTitle className="text-sm font-medium">Cash Collected</CardTitle>
                                                </CardHeader>
                                                <CardContent className="py-2">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-2xl font-bold text-green-700">₱{selectedRemittance.total_revenue.toLocaleString()}</p>
                                                            <p className="text-xs text-muted-foreground">From {selectedRemittance.orders_count} orders</p>
                                                        </div>
                                                        <ShoppingCart className="h-8 w-8 text-green-200" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>

                                        <div className="border rounded-lg p-5 bg-slate-50 h-full">
                                            <h4 className="font-semibold mb-4 text-slate-800 flex items-center gap-2">
                                                <FileSignature className="h-4 w-4" /> Audit Log
                                            </h4>
                                            <ul className="space-y-3">
                                                <li className="flex gap-3 text-sm">
                                                    <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                                                    <p className="text-slate-600">
                                                        Agent verified <span className="font-medium text-slate-900">{selectedRemittance.items_remitted} product lines</span>.
                                                    </p>
                                                </li>
                                                <li className="flex gap-3 text-sm">
                                                    <div className="h-6 w-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                                                    <p className="text-slate-600">
                                                        Submitted <span className="font-medium text-slate-900">{selectedRemittance.orders_count} orders</span> for cash remission.
                                                    </p>
                                                </li>
                                                <li className="flex gap-3 text-sm">
                                                    <div className="h-6 w-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                                                    <p className="text-slate-600">
                                                        Digital signature captured at <span className="font-mono text-xs">{format(new Date(selectedRemittance.remitted_at), 'hh:mm a')}</span>.
                                                    </p>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Orders Tab */}
                                <TabsContent value="orders" className="space-y-4 pt-4">
                                    {loadingDetails ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        </div>
                                    ) : remittanceOrders.length > 0 ? (
                                        <>
                                            <Card>
                                                <CardHeader className="py-3">
                                                    <div className="flex items-center justify-between">
                                                        <CardTitle className="text-sm">Order Breakdown</CardTitle>
                                                        <Badge variant="outline">{remittanceOrders.length} line items</Badge>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="max-h-[400px] overflow-y-auto">
                                                        <Table>
                                                            <TableHeader>
                                                                <TableRow>
                                                                    <TableHead className="w-[120px]">Order#</TableHead>
                                                                    <TableHead>Client</TableHead>
                                                                    <TableHead>Product Details</TableHead>
                                                                    <TableHead className="text-right">Qty</TableHead>
                                                                    <TableHead className="text-right">Total</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {remittanceOrders.map((order, index) => (
                                                                    <TableRow key={`${order.orderId}-${index}`}>
                                                                        <TableCell className="font-mono text-xs font-medium text-muted-foreground">{order.orderNumber}</TableCell>
                                                                        <TableCell className="font-medium text-sm">{order.clientName}</TableCell>
                                                                        <TableCell>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-sm">{order.brandName}</span>
                                                                                <span className="text-xs text-muted-foreground">{order.variantName}</span>
                                                                            </div>
                                                                        </TableCell>
                                                                        <TableCell className="text-right font-medium">{order.quantity}</TableCell>
                                                                        <TableCell className="text-right">
                                                                            {/* Only show total on first item of each order */}
                                                                            {index === 0 || remittanceOrders[index - 1].orderId !== order.orderId ? (
                                                                                <span className="font-bold text-emerald-600">₱{order.totalAmount.toLocaleString()}</span>
                                                                            ) : (
                                                                                <span className="text-muted-foreground/30 text-xs">—</span>
                                                                            )}
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                                            <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                            <p>No orders were included in this remittance.</p>
                                        </div>
                                    )}
                                </TabsContent>

                                {/* Signature Tab */}
                                <TabsContent value="signature" className="space-y-4 pt-4">
                                    {loadingSignature ? (
                                        <div className="text-center py-12">
                                            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-primary" />
                                            <p className="text-muted-foreground">Loading signature...</p>
                                        </div>
                                    ) : signedSignatureUrl && !signatureError ? (
                                        <div className="space-y-4">
                                            <Card className="overflow-hidden">
                                                <CardContent className="flex flex-col items-center justify-center p-8 bg-slate-50 min-h-[200px]">
                                                    <img
                                                        src={signedSignatureUrl}
                                                        alt="Agent Signature"
                                                        className="max-h-48 max-w-full object-contain mix-blend-multiply"
                                                        onError={(e) => {
                                                            console.error('Failed to load signature image');
                                                            setSignatureError(true);
                                                        }}
                                                    />
                                                </CardContent>
                                                <div className="bg-emerald-50 border-t border-emerald-100 p-4 flex items-center gap-3">
                                                    <div className="p-2 bg-emerald-100 rounded-full">
                                                        <FileSignature className="h-4 w-4 text-emerald-700" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-emerald-800">Digitally Verified</p>
                                                        <p className="text-xs text-emerald-600">Captured at source on {format(new Date(selectedRemittance.remitted_at), 'PPP p')}</p>
                                                    </div>
                                                </div>
                                            </Card>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                                            <FileSignature className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                            <p>{signatureError 
                                                ? 'Signature image failed to load or you do not have permission to view it.' 
                                                : 'No signature available'}</p>
                                        </div>
                                    )}
                                </TabsContent>
                            </Tabs>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
