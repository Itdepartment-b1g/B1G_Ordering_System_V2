import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Users,
    MapPin,
    Crown,
    Building2,
    Mail,
    MoreHorizontal,
    Search,
    Filter,
    Phone,
    LayoutGrid,
    List,
    ChevronRight,
    User,
    Store,
    Package
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TeamMember {
    id: string;
    name: string;
    email: string;
    phone?: string;
    region: string;
    role: string;
    status: string;
    leaderId?: string;
    leaderName?: string;
    clientCount: number;
    inventoryCount: number;
}

export default function ManagerTeamsPage() {
    const { user } = useAuth();
    const [leaders, setLeaders] = useState<TeamMember[]>([]);
    const [agents, setAgents] = useState<TeamMember[]>([]); // All direct reports
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        fetchTeamData();
    }, [user]);

    const fetchTeamData = async () => {
        if (!user) return;

        try {
            setLoading(true);

            // 1. Fetch profiles for Leaders and Agents
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, email, phone, region, role, status')
                .eq('company_id', user.company_id);

            if (profilesError) throw profilesError;

            // 2. Fetch Leader-Team relationships (needed to identify who is in my team)
            const { data: relationships, error: relationshipsError } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            if (relationshipsError) throw relationshipsError;

            // Filter for THIS Manager's team
            const directReports = relationships
                .filter(r => r.leader_id === user.id)
                .map(r => r.agent_id);

            const secondLevelReports = relationships
                .filter(r => directReports.includes(r.leader_id))
                .map(r => r.agent_id);

            const allTeamIds = new Set([...directReports, ...secondLevelReports]);

            const teamProfiles = profiles.filter(p => allTeamIds.has(p.id));

            if (teamProfiles.length === 0) {
                setLeaders([]);
                setAgents([]);
                setLoading(false);
                return;
            }

            const teamIdsArray = Array.from(allTeamIds);

            // 3. Fetch Client Counts
            // Optimized: Fetch counts grouped by agent_id instead of raw rows if possible, 
            // but Supabase JS client aggregation is limited. 
            // We'll fetch relevant rows selecting minimal fields.
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('agent_id')
                .eq('company_id', user.company_id)
                .in('agent_id', teamIdsArray);

            if (clientsError) throw clientsError;

            // 4. Fetch Inventory Counts
            const { data: inventoryData, error: inventoryError } = await supabase
                .from('agent_inventory')
                .select('agent_id, stock')
                .eq('company_id', user.company_id)
                .in('agent_id', teamIdsArray);

            if (inventoryError) throw inventoryError;

            // Aggregate functionality
            const clientCountMap = new Map<string, number>();
            clientsData?.forEach(c => {
                clientCountMap.set(c.agent_id, (clientCountMap.get(c.agent_id) || 0) + 1);
            });

            const inventoryCountMap = new Map<string, number>();
            inventoryData?.forEach(i => {
                inventoryCountMap.set(i.agent_id, (inventoryCountMap.get(i.agent_id) || 0) + (i.stock || 0));
            });

            const processedMembers = teamProfiles.map(p => {
                const rel = relationships.find(r => r.agent_id === p.id);
                const leaderProfile = profiles.find(pr => pr.id === rel?.leader_id);
                return {
                    id: p.id,
                    name: p.full_name,
                    email: p.email,
                    phone: p.phone,
                    region: p.region,
                    role: p.role,
                    status: p.status,
                    leaderId: rel?.leader_id,
                    leaderName: leaderProfile?.full_name,
                    clientCount: clientCountMap.get(p.id) || 0,
                    inventoryCount: inventoryCountMap.get(p.id) || 0
                };
            });

            // Separate into groups
            const myLeaders = processedMembers.filter(m => m.role === 'team_leader');
            const myAgents = processedMembers.filter(m => m.role !== 'team_leader');

            setLeaders(myLeaders);
            setAgents(myAgents);

        } catch (error) {
            console.error('Error fetching manager teams:', error);
            toast({
                title: 'Error',
                description: 'Failed to load team data',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    // Combine and Sort members
    const allMembers = [...leaders, ...agents].sort((a, b) => {
        if (a.role === 'team_leader' && b.role !== 'team_leader') return -1;
        if (a.role !== 'team_leader' && b.role === 'team_leader') return 1;
        return a.name.localeCompare(b.name);
    });

    const filteredMembers = allMembers.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
                    <p className="text-muted-foreground">Overview of your team structure and members</p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name or email..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="rounded-md border bg-card shadow-sm">
                <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold text-sm">All Team Members</span>
                        <Badge variant="secondary" className="ml-2 text-xs">{filteredMembers.length}</Badge>
                    </div>
                </div>

                {filteredMembers.length === 0 ? (
                    <EmptyState icon={Users} title="No Members Found" description="Try adjusting your search criteria." />
                ) : (
                    <Table>
                        <TableHeader className="bg-muted/10">
                            <TableRow>
                                <TableHead className="w-[300px]">Member Details</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="text-right">Clients</TableHead>
                                <TableHead className="text-right pr-6">Stock Level</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredMembers.map(member => (
                                <TableRow key={member.id} className="group hover:bg-muted/30 transition-colors">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className={`h-10 w-10 border shadow-sm ${member.role === 'team_leader' ? 'ring-2 ring-amber-100' : ''}`}>
                                                <AvatarFallback className={`${member.role === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'} font-bold`}>
                                                    {getInitials(member.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-sm">{member.name}</span>
                                                <span className="text-xs text-muted-foreground">{member.email}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {member.role === 'team_leader' ? (
                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                <Crown className="h-3 w-3 mr-1" /> Team Leader
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-slate-600 bg-slate-100">
                                                <User className="h-3 w-3 mr-1" /> Direct Report
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <MapPin className="h-3 w-3" />
                                            {member.region || 'N/A'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Store className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-medium text-sm">{member.clientCount}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex items-center justify-end gap-2">
                                            <Package className="h-3 w-3 text-muted-foreground" />
                                            <span className={`font-semibold text-sm ${member.inventoryCount > 1000 ? 'text-green-600' : ''}`}>
                                                {member.inventoryCount.toLocaleString()}
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
}

function EmptyState({ icon: Icon, title, description }: { icon: any, title: string, description: string }) {
    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardContent className="py-12 text-center">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                    <Icon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{title}</h3>
                <p className="text-muted-foreground max-w-sm mx-auto text-sm">{description}</p>
            </CardContent>
        </Card>
    );
}

function TooltipWrapper({ children, content }: { children: React.ReactNode, content: string }) {
    // Simple wrapper if TooltipProvider is available globally, otherwise might need import
    // Assuming imported or simplified
    return (
        <div title={content} className="relative group cursor-help">
            {children}
        </div>
    );
}
