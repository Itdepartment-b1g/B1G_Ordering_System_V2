import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Search,
    Filter,
    RefreshCw,
    Building,
    MapPin,
    Phone,
    Mail,
    Users,
    LayoutList,
    Store,
    Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Client {
    id: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    address?: string; // or city
    city?: string;
    status: 'active' | 'inactive';
    account_type: 'Key Accounts' | 'Standard Accounts';
    category: 'Permanently Closed' | 'Renovating' | 'Open';
    agent_id: string;
    agentName: string;
    agentRole: string;
    total_orders: number;
    total_spent: number;
}

export default function ManagerClientsPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState<Client[]>([]);
    const [teamMembers, setTeamMembers] = useState<{ id: string, name: string }[]>([]);
    const [isMobile, setIsMobile] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
    const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (user) {
            fetchTeamClients();
        }
    }, [user]);

    const fetchTeamClients = async () => {
        try {
            setLoading(true);

            if (!user?.company_id) {
                throw new Error("No company ID found for user");
            }

            // 1. Get my team hierarchy (all levels below me)
            // Explicitly filter by company_id to ensure we get broader visibility if allowed by RLS
            const { data: relationships } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            const directReports = (relationships || [])
                .filter(r => r.leader_id === user?.id)
                .map(r => r.agent_id);

            const secondLevelReports = (relationships || [])
                .filter(r => directReports.includes(r.leader_id))
                .map(r => r.agent_id);

            const allTeamIds = [...directReports, ...secondLevelReports];

            // Also fetch profiles to get names for the filter dropdown
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('company_id', user.company_id)
                .in('id', allTeamIds);

            const profiledMap = new Map(profiles?.map(p => [p.id, p]));
            setTeamMembers(profiles?.map(p => ({ id: p.id, name: p.full_name })) || []);

            // 2. Fetch clients for ALL these agents
            if (allTeamIds.length === 0) {
                setClients([]);
                setLoading(false);
                return;
            }

            const { data: clientsData, error } = await supabase
                .from('clients')
                .select('*, client_orders(count)')
                .eq('company_id', user.company_id)
                .in('agent_id', allTeamIds)
                .order('name');

            if (error) throw error;

            const mappedClients: Client[] = (clientsData || []).map((client: any) => {
                const agentProfile = profiledMap.get(client.agent_id);
                // Parse count safely
                const ordersCount = client.client_orders?.[0]?.count || 0;

                return {
                    id: client.id,
                    name: client.name,
                    company: client.company,
                    email: client.email,
                    phone: client.phone,
                    city: client.city || client.address, // fallback
                    status: client.status,
                    account_type: client.account_type,
                    category: client.category,
                    agent_id: client.agent_id,
                    agentName: agentProfile?.full_name || 'Unknown',
                    agentRole: agentProfile?.role || 'sales_agent',
                    total_orders: ordersCount,
                    total_spent: client.total_spent || 0
                };
            });

            setClients(mappedClients);

        } catch (error) {
            console.error('Error fetching clients:', error);
            toast({
                title: 'Error',
                description: 'Failed to fetch team clients',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredClients = clients.filter(client => {
        const matchesSearch =
            client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (client.company || '').toLowerCase().includes(searchQuery.toLowerCase());

        const matchesAgent = selectedAgentFilter === 'all' || client.agent_id === selectedAgentFilter;
        const matchesType = accountTypeFilter === 'all' || client.account_type === accountTypeFilter;

        return matchesSearch && matchesAgent && matchesType;
    });

    const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

    return (
        <div className="space-y-4 md:space-y-6 p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Clients</h1>
                    <p className="text-sm md:text-base text-muted-foreground">View clients managed by your team</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button onClick={fetchTeamClients} variant="outline" size="sm" className="h-9 flex-1 md:flex-none">
                        <RefreshCw className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                        <span className="text-xs md:text-sm">Refresh</span>
                    </Button>
                    <Button variant="secondary" size="sm" className="h-9 flex-1 md:flex-none" disabled>
                        <Download className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                        <span className="text-xs md:text-sm">Export</span>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                <Card className="md:col-span-3 border-none shadow-md bg-gradient-to-br from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
                    <CardContent className="p-4 md:p-6">
                        <div className="flex flex-col lg:flex-row justify-between gap-4 md:gap-6">
                            <div className="flex-1 space-y-3 md:space-y-4">
                                <div className="flex items-center gap-2 text-primary font-semibold">
                                    <Users className="h-4 w-4 md:h-5 md:w-5" />
                                    <span className="text-sm md:text-base">Filter Clients</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-2.5 h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search client..."
                                            className="pl-8 bg-background h-9 md:h-10 text-xs md:text-sm"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Select value={selectedAgentFilter} onValueChange={setSelectedAgentFilter}>
                                            <SelectTrigger className="flex-1 bg-background h-9 md:h-10 text-xs md:text-sm">
                                                <SelectValue placeholder="All Agents" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all" className="text-xs md:text-sm">All Agents</SelectItem>
                                                {teamMembers.map(m => (
                                                    <SelectItem key={m.id} value={m.id} className="text-xs md:text-sm">{m.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                                            <SelectTrigger className="flex-1 bg-background h-9 md:h-10 text-xs md:text-sm">
                                                <SelectValue placeholder="Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all" className="text-xs md:text-sm">All Types</SelectItem>
                                                <SelectItem value="Key Accounts" className="text-xs md:text-sm">Key Accounts</SelectItem>
                                                <SelectItem value="Standard Accounts" className="text-xs md:text-sm">Standard</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-end justify-center lg:justify-end">
                                <div className="px-4 md:px-6 py-2 md:py-3 bg-white dark:bg-slate-900 rounded-lg border shadow-sm flex flex-col items-center min-w-[120px] md:min-w-[140px]">
                                    <span className="text-[10px] md:text-xs text-muted-foreground uppercase font-bold tracking-wider">Total</span>
                                    <span className="text-xl md:text-2xl font-bold text-primary">{filteredClients.length}</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="overflow-hidden border shadow-sm">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="text-center py-12 md:py-16 text-muted-foreground bg-muted/10">
                            <Store className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-20" />
                            <h3 className="text-base md:text-lg font-medium text-foreground">No Clients Found</h3>
                            <p className="text-xs md:text-sm">Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-3 p-3">
                                {filteredClients.map((client) => (
                                    <div key={client.id} className="border rounded-lg p-3 space-y-2 bg-background hover:bg-muted/30 transition-colors">
                                        {/* Header */}
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-sm truncate">{client.name}</h3>
                                                {client.company && (
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                                        <Building className="h-3 w-3 flex-shrink-0" /> 
                                                        <span className="truncate">{client.company}</span>
                                                    </p>
                                                )}
                                            </div>
                                            <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize text-[10px] h-5 ml-2 flex-shrink-0">
                                                {client.status}
                                            </Badge>
                                        </div>

                                        {/* Location */}
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <MapPin className="h-3 w-3 flex-shrink-0" />
                                            <span className="truncate">{client.city || 'N/A'}</span>
                                        </div>

                                        {/* Agent & Orders */}
                                        <div className="pt-2 border-t flex justify-between items-center">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Avatar className="h-6 w-6 flex-shrink-0">
                                                    <AvatarFallback className={`text-[10px] font-bold ${client.agentRole === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                                        {getInitials(client.agentName)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <span className="text-xs font-medium truncate">{client.agentName}</span>
                                                    {client.agentRole === 'team_leader' && (
                                                        <span className="text-[9px] text-amber-600 font-medium">Leader</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end flex-shrink-0">
                                                <span className="text-[10px] text-muted-foreground">Orders</span>
                                                <span className="text-sm font-bold font-mono">{client.total_orders}</span>
                                            </div>
                                        </div>

                                        {/* Account Type Badge */}
                                        {client.account_type === 'Key Accounts' && (
                                            <div className="pt-2 border-t">
                                                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[10px] h-5 w-full justify-center">
                                                    Key Account
                                                </Badge>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Desktop Table View */}
                            <div className="hidden md:block overflow-x-auto">
                                <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead className="w-[30%]">Client Details</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Assigned Agent</TableHead>
                                        <TableHead>Account Type</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Total Orders</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredClients.map((client) => (
                                        <TableRow key={client.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm">{client.name}</span>
                                                    {client.company && (
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Building className="h-3 w-3" /> {client.company}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                                    <MapPin className="h-3 w-3" />
                                                    {client.city || 'N/A'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className={`text-[10px] font-bold ${client.agentRole === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                                                            }`}>
                                                            {getInitials(client.agentName)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{client.agentName}</span>
                                                        {client.agentRole === 'team_leader' && (
                                                            <span className="text-[10px] text-amber-600 font-medium">Team Leader</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {client.account_type === 'Key Accounts' ? (
                                                    <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">
                                                        Key Account
                                                    </Badge>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">Standard</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize font-normal text-xs px-2 py-0.5">
                                                    {client.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right pr-6 font-mono text-sm">
                                                {client.total_orders}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        </>
                    )}
                </CardContent>
                <div className="p-3 md:p-4 border-t bg-muted/20 text-[10px] md:text-xs text-muted-foreground flex justify-between">
                    <span>Showing {filteredClients.length} clients</span>
                </div>
            </Card>
        </div>
    );
}
