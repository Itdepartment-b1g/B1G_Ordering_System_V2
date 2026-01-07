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

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgentFilter, setSelectedAgentFilter] = useState<string>('all');
    const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');

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
                .select('*')
                .eq('company_id', user.company_id)
                .in('agent_id', allTeamIds)
                .order('name');

            if (error) throw error;

            const mappedClients: Client[] = (clientsData || []).map((client: any) => {
                const agentProfile = profiledMap.get(client.agent_id);
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
                    total_orders: client.total_orders || 0,
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
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Clients</h1>
                    <p className="text-muted-foreground">View clients managed by your team</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={fetchTeamClients} variant="outline" size="sm" className="h-9">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button variant="secondary" size="sm" className="h-9" disabled>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-3 border-none shadow-md bg-gradient-to-br from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
                    <CardContent className="p-6">
                        <div className="flex flex-col lg:flex-row justify-between gap-6">
                            <div className="flex-1 space-y-4">
                                <div className="flex items-center gap-2 text-primary font-semibold">
                                    <Users className="h-5 w-5" />
                                    <span>Filter Clients</span>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search client name or company..."
                                            className="pl-8 bg-background"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <Select value={selectedAgentFilter} onValueChange={setSelectedAgentFilter}>
                                            <SelectTrigger className="w-[180px] bg-background">
                                                <SelectValue placeholder="All Agents" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Agents</SelectItem>
                                                {teamMembers.map(m => (
                                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={accountTypeFilter} onValueChange={setAccountTypeFilter}>
                                            <SelectTrigger className="w-[180px] bg-background">
                                                <SelectValue placeholder="Account Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Types</SelectItem>
                                                <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                                                <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-end lg:justify-end">
                                <div className="px-6 py-3 bg-white dark:bg-slate-900 rounded-lg border shadow-sm flex flex-col items-center min-w-[140px]">
                                    <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Clients</span>
                                    <span className="text-2xl font-bold text-primary">{filteredClients.length}</span>
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
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground bg-muted/10">
                            <Store className="h-12 w-12 mx-auto mb-3 opacity-20" />
                            <h3 className="text-lg font-medium text-foreground">No Clients Found</h3>
                            <p>Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead className="w-[30%]">Client Details</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Assigned Agent</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Total Spent</TableHead>
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
                                                <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize font-normal text-xs px-2 py-0.5">
                                                    {client.status}
                                                </Badge>
                                                {client.account_type === 'Key Accounts' && (
                                                    <Badge variant="outline" className="ml-2 border-amber-200 text-amber-700 bg-amber-50 text-[10px]">KA</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right pr-6 font-mono text-sm">
                                                ₱{client.total_spent.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
                <div className="p-4 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between">
                    <span>Showing {filteredClients.length} clients</span>
                    <span>Real-time data</span>
                </div>
            </Card>
        </div>
    );
}
