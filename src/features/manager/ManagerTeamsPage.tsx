import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Users,
    MapPin,
    Crown,
    // Building2,
    // Mail,
    // MoreHorizontal,
    Search,
    // Filter,
    // Phone,
    // LayoutGrid,
    // List,
    // ChevronRight,
    User,
    Store,
    Package,
    Phone
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    avatar_url?: string;
}

interface TeamGroup {
    leaderId: string;
    leaderName: string;
    members: TeamMember[];
    isDirectTeam: boolean;
}

export default function ManagerTeamsPage() {
    const { user } = useAuth();
    const [allMembers, setAllMembers] = useState<TeamMember[]>([]);
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
                .select('id, full_name, email, phone, region, role, status, avatar_url')
                .eq('company_id', user.company_id);

            if (profilesError) throw profilesError;

            // 2. Fetch Leader-Team relationships
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
                setAllMembers([]);
                setLoading(false);
                return;
            }

            const teamIdsArray = Array.from(allTeamIds);

            // 3. Fetch Client Counts
            const { data: clientsData, error: clientsError } = await supabase
                .from('clients')
                .select('agent_id')
                .eq('company_id', user.company_id)
                .in('agent_id', teamIdsArray);

            if (clientsError) {
                console.error('Error fetching clients:', clientsError);
                // Don't throw, just continue with 0 counts
            }

            // 4. Fetch Inventory Counts
            const { data: inventoryData, error: inventoryError } = await supabase
                .from('agent_inventory')
                .select('agent_id, stock')
                .eq('company_id', user.company_id)
                .in('agent_id', teamIdsArray);

            if (inventoryError) {
                console.error('Error fetching inventory:', inventoryError);
                // Don't throw, just continue
            }

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
                    inventoryCount: inventoryCountMap.get(p.id) || 0,
                    avatar_url: p.avatar_url
                };
            });

            setAllMembers(processedMembers);

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

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    };

    // Group members by leader
    const groupedTeams: TeamGroup[] = useMemo(() => {
        if (!user) return [];

        const groups: Record<string, TeamGroup> = {};

        // Initialize "My Direct Team" group first
        groups[user.id] = {
            leaderId: user.id,
            leaderName: 'Me (Direct Reports)',
            members: [],
            isDirectTeam: true
        };

        allMembers.forEach(member => {
            // Filter logic here to respect search
            if (searchQuery &&
                !member.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !member.email.toLowerCase().includes(searchQuery.toLowerCase())) {
                return;
            }

            const leaderId = member.leaderId || 'unknown';

            if (!groups[leaderId]) {
                groups[leaderId] = {
                    leaderId: leaderId,
                    leaderName: member.leaderName || 'Unknown Leader',
                    members: [],
                    isDirectTeam: false
                };
            }
            groups[leaderId].members.push(member);
        });

        // Filter out empty groups and sort
        return Object.values(groups)
            .filter(g => g.members.length > 0)
            .sort((a, b) => {
                if (a.isDirectTeam) return -1;
                if (b.isDirectTeam) return 1;
                return a.leaderName.localeCompare(b.leaderName);
            });
    }, [allMembers, user, searchQuery]);


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
                    <h1 className="text-3xl font-bold tracking-tight">Team Overview</h1>
                    <p className="text-muted-foreground">Manage your direct reports and their sub-teams</p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search in teams..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {groupedTeams.length === 0 ? (
                <EmptyState icon={Users} title="No Teams Found" description="No team members match your search." />
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                    {groupedTeams.map((group) => (
                        <Card key={group.leaderId} className={`flex flex-col h-[600px] shadow-md border-t-4 ${group.isDirectTeam ? 'border-t-primary' : 'border-t-amber-500'}`}>
                            <CardHeader className="pb-3 bg-muted/10">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col gap-1">
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            {group.isDirectTeam ? (
                                                <>
                                                    <Users className="h-5 w-5 text-primary" />
                                                    My Direct Reports
                                                </>
                                            ) : (
                                                <>
                                                    <Crown className="h-5 w-5 text-amber-600" />
                                                    {group.leaderName}'s Team
                                                </>
                                            )}
                                        </CardTitle>
                                        <CardDescription>
                                            {group.members.length} {group.members.length === 1 ? 'Member' : 'Members'}
                                        </CardDescription>
                                    </div>
                                    {!group.isDirectTeam && (
                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                            Sub-Team
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 overflow-hidden">
                                <div className="border-b px-4 py-2 bg-muted/5 grid grid-cols-12 text-xs font-semibold text-muted-foreground">
                                    <div className="col-span-6">Member</div>
                                    <div className="col-span-3 text-right">Clients</div>
                                    <div className="col-span-3 text-right">Stock</div>
                                </div>
                                <ScrollArea className="h-full">
                                    <div className="divide-y">
                                        {group.members.map(member => (
                                            <div key={member.id} className="p-4 hover:bg-muted/50 transition-colors">
                                                <div className="grid grid-cols-12 gap-2 items-center">
                                                    <div className="col-span-6 flex items-center gap-3">
                                                        <Avatar className={`h-8 w-8 border ${member.role === 'team_leader' ? 'ring-1 ring-amber-400' : ''}`}>
                                                            <AvatarImage src={member.avatar_url} />
                                                            <AvatarFallback className={`${member.role === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'} text-xs font-bold`}>
                                                                {getInitials(member.name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="font-medium text-sm truncate" title={member.name}>
                                                                {member.name}
                                                            </span>
                                                            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                                                {member.role === 'team_leader' && (
                                                                    <Crown className="h-3 w-3 text-amber-500 fill-amber-500/20" />
                                                                )}
                                                                {member.role === 'team_leader' ? 'Leader' : 'Agent'}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="col-span-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                                            <span className="text-sm font-medium">{member.clientCount}</span>
                                                        </div>
                                                    </div>

                                                    <div className="col-span-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                                            <span className={`text-sm font-medium ${member.inventoryCount > 1000 ? 'text-green-600' : ''}`}>
                                                                {member.inventoryCount}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground pl-11">
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="h-3 w-3" />
                                                        {member.region || 'No Region'}
                                                    </div>
                                                    {member.phone && (
                                                        <div className="flex items-center gap-1">
                                                            <Phone className="h-3 w-3" />
                                                            {member.phone}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
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
