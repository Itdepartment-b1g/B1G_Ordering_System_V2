import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Loader2,
    Package,
    Users,
    Crown,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ArrowRight,
    Clock,
    Search,
    ChevronDown,
    ChevronRight,
    Eye,
    Filter
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';

interface TeamMember {
    id: string;
    name: string;
    role: string;
    leaderId?: string;
    leaderName?: string;
}

interface RequestItem {
    id: string;
    agentId: string;
    agentName: string;
    leaderId: string;
    variantName: string;
    brandName: string;
    quantity: number;
    status: string;
    requestedAt: string;
    leaderNotes?: string;
    adminNotes?: string;
    rejectionReason?: string;
}

interface TeamRequests {
    leaderId: string;
    leaderName: string;
    isDirectTeam: boolean;
    requests: RequestItem[];
    expanded: boolean;
}

export default function ManagerRequestsPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [groupedRequests, setGroupedRequests] = useState<TeamRequests[]>([]);
    const [activeTab, setActiveTab] = useState('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);

    // Stats
    const getTabRequests = (groups: TeamRequests[]) => {
        const activeStatuses = ['pending', 'approved_by_leader'];
        const historyStatuses = ['approved_by_admin', 'fulfilled', 'rejected'];
        const targetStatuses = activeTab === 'pending' ? activeStatuses : historyStatuses;

        return groups.map(g => ({
            ...g,
            requests: g.requests.filter(r => targetStatuses.includes(r.status))
        })).filter(g => g.requests.length > 0);
    };

    const tabGroups = getTabRequests(groupedRequests);

    // Stats derived from the current tab's data (without search filter)
    const totalRequests = tabGroups.reduce((acc, group) => acc + group.requests.length, 0);
    const directTeamRequests = tabGroups.find(g => g.isDirectTeam)?.requests.length || 0;
    const subTeamRequests = totalRequests - directTeamRequests;

    useEffect(() => {
        fetchRequests();
    }, [user]);

    const fetchRequests = async () => {
        if (!user) return;

        try {
            setLoading(true);

            // 1. Fetch Hierarchy (Members & Leaders)
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('company_id', user.company_id);

            if (profilesError) throw profilesError;

            const { data: relationships, error: relError } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            if (relError) throw relError;

            // Identify Team
            const directReports = relationships
                .filter(r => r.leader_id === user.id)
                .map(r => r.agent_id);

            const secondLevelReports = relationships
                .filter(r => directReports.includes(r.leader_id))
                .map(r => r.agent_id);

            const allTeamIds = [...directReports, ...secondLevelReports];
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const allTeamIdsSet = new Set(allTeamIds);

            // 2. Fetch Requests - FETCH ALL STATUSES
            const allStatuses = ['pending', 'approved_by_leader', 'approved_by_admin', 'fulfilled', 'rejected'];

            const { data: requestsData, error: requestsError } = await supabase
                .from('stock_requests')
                .select(`
                    id,
                    agent_id,
                    leader_id,
                    requested_quantity,
                    requested_at,
                    status,
                    leader_notes,
                    admin_notes,
                    rejection_reason,
                    variant:variants(name, brand:brands(name))
                `)
                .in('agent_id', allTeamIds)
                .in('status', allStatuses)
                .order('requested_at', { ascending: false });

            if (requestsError) throw requestsError;

            // 3. Process & Group Data
            const groups: Record<string, TeamRequests> = {};

            // Initialize Current User's Direct Team Group
            groups[user.id] = {
                leaderId: user.id,
                leaderName: 'My Direct Reports',
                isDirectTeam: true,
                requests: [],
                expanded: true
            };

            // Initialize Sub-Teams
            directReports.forEach(drId => {
                const profile = profiles.find(p => p.id === drId);
                // Only create group if they are actually a leader (might have agents)
                if (profile?.role === 'team_leader') {
                    groups[drId] = {
                        leaderId: drId,
                        leaderName: `${profile.full_name}'s Team`,
                        isDirectTeam: false,
                        requests: [],
                        expanded: true
                    };
                }
            });

            requestsData?.forEach((req: any) => {
                const agentProfile = profiles.find(p => p.id === req.agent_id);
                // Determine which leader group this request belongs to
                // If the requester is in my direct reports -> belongs to Me
                // If the requester is in a sub-team -> belongs to that Team Leader

                let groupLeaderId = user.id; // Default to me
                const rel = relationships.find(r => r.agent_id === req.agent_id);

                if (rel && rel.leader_id !== user.id) {
                    groupLeaderId = rel.leader_id;
                }

                // If we found a group for this leader, add it.
                // Note: user.id group always exists. Sub-team groups exist if the leader is a direct report.
                if (groups[groupLeaderId]) {
                    groups[groupLeaderId].requests.push({
                        id: req.id,
                        agentId: req.agent_id,
                        agentName: agentProfile?.full_name || 'Unknown',
                        leaderId: groupLeaderId,
                        variantName: req.variant?.name || 'Unknown',
                        brandName: req.variant?.brand?.name || 'Unknown',
                        quantity: req.requested_quantity,
                        status: req.status,
                        requestedAt: req.requested_at,
                        leaderNotes: req.leader_notes,
                        adminNotes: req.admin_notes,
                        rejectionReason: req.rejection_reason
                    });
                }
            });

            // Filter out empty groups if needed, or keep to show hierarchy
            // We'll keep them but sort: Direct Team first, then alphabetical subteams
            const result = Object.values(groups)
                //.filter(g => g.requests.length > 0) // Only show groups with requests in this view
                .sort((a, b) => {
                    if (a.isDirectTeam) return -1;
                    if (b.isDirectTeam) return 1;
                    return a.leaderName.localeCompare(b.leaderName);
                });

            setGroupedRequests(result);

        } catch (error) {
            console.error('Error fetching manager requests:', error);
            toast({
                title: 'Error',
                description: 'Failed to load requests',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const toggleGroup = (leaderId: string) => {
        setGroupedRequests(prev => prev.map(g =>
            g.leaderId === leaderId ? { ...g, expanded: !g.expanded } : g
        ));
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending Leader</Badge>;
            case 'approved_by_leader':
                return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Forwarded</Badge>;
            case 'approved_by_admin':
            case 'fulfilled':
                return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
            case 'rejected':
                return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    // Client-side filtering for Search
    const filteredGroups = tabGroups.map(group => ({
        ...group,
        requests: group.requests.filter(r =>
            r.agentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.variantName.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(g => g.requests.length > 0);


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
                    <h1 className="text-3xl font-bold tracking-tight">Request Oversight</h1>
                    <p className="text-muted-foreground">Monitor and track inventory flow across your teams</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search agent, product..."
                            className="pl-8 bg-background"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-primary/5 border-primary/20 shadow-none">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                            <h2 className="text-2xl font-bold text-primary">{totalRequests}</h2>
                        </div>
                        <Package className="h-8 w-8 text-primary/20" />
                    </CardContent>
                </Card>
                <Card className="bg-card shadow-none border">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">My Direct Team</p>
                            <h2 className="text-2xl font-bold">{directTeamRequests}</h2>
                        </div>
                        <Users className="h-8 w-8 text-muted/20" />
                    </CardContent>
                </Card>
                <Card className="bg-card shadow-none border">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Sub-Teams</p>
                            <h2 className="text-2xl font-bold">{subTeamRequests}</h2>
                        </div>
                        <Crown className="h-8 w-8 text-amber-500/20" />
                    </CardContent>
                </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full md:w-auto bg-transparent p-0 border-b rounded-none h-auto gap-6 justify-start">
                    <TabsTrigger
                        value="pending"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
                    >
                        Active Requests
                    </TabsTrigger>
                    <TabsTrigger
                        value="history"
                        className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2"
                    >
                        History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-6">
                    <Card className="shadow-sm border">
                        <CardHeader className="px-6 py-4 border-b bg-muted/40">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-medium flex items-center gap-2">
                                    <Filter className="h-4 w-4 text-muted-foreground" />
                                    Requests List
                                </CardTitle>
                                <Badge variant="secondary" className="font-normal">
                                    {filteredGroups.reduce((acc, g) => acc + g.requests.length, 0)} Items
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                    <Package className="h-10 w-10 mb-3 opacity-20" />
                                    <p>No requests found in this view.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10">
                                        <TableRow>
                                            <TableHead className="w-[30%]">Agent</TableHead>
                                            <TableHead className="w-[25%]">Product Details</TableHead>
                                            <TableHead className="text-center">Quantity</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredGroups.map(group => (
                                            <>
                                                {/* Group Header Row */}
                                                <TableRow
                                                    key={`header-${group.leaderId}`}
                                                    className="bg-muted/30 hover:bg-muted/40 cursor-pointer"
                                                    onClick={() => toggleGroup(group.leaderId)}
                                                >
                                                    <TableCell colSpan={6} className="py-3">
                                                        <div className="flex items-center gap-2 font-medium">
                                                            {group.expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                            {group.isDirectTeam ? (
                                                                <span className="text-primary flex items-center gap-1.5 text-sm">
                                                                    <Users className="h-3.5 w-3.5" /> {group.leaderName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-amber-700 flex items-center gap-1.5 text-sm">
                                                                    <Crown className="h-3.5 w-3.5" /> {group.leaderName}
                                                                    <Badge variant="outline" className="ml-2 text-[10px] bg-white h-5 border-amber-200 text-amber-600 font-normal">Sub-Team</Badge>
                                                                </span>
                                                            )}
                                                            <span className="text-xs text-muted-foreground ml-auto bg-background px-2 py-0.5 rounded-full border">
                                                                {group.requests.length} requests
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>

                                                {/* Group Members Rows */}
                                                {group.expanded && group.requests.map(req => (
                                                    <TableRow key={req.id} className="hover:bg-muted/5">
                                                        <TableCell>
                                                            <div className="flex items-center gap-3 pl-6">
                                                                <Avatar className="h-8 w-8 border">
                                                                    <AvatarFallback className="text-xs bg-slate-50 text-slate-600">
                                                                        {getInitials(req.agentName)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-sm">{req.agentName}</span>
                                                                    <span className="text-[10px] text-muted-foreground">ID: {req.agentId.substring(0, 6)}...</span>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-medium text-sm">{req.variantName}</span>
                                                                <span className="text-xs text-muted-foreground">{req.brandName}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium">
                                                            {req.quantity}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">
                                                            {format(new Date(req.requestedAt), 'MMM d, h:mm a')}
                                                        </TableCell>
                                                        <TableCell>
                                                            {getStatusBadge(req.status)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedRequest(req); }}
                                                                className="h-8 w-8 p-0"
                                                            >
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* View Details Dialog */}
            <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Request Details</DialogTitle>
                        <DialogDescription>
                            Detailed view of inventory request
                        </DialogDescription>
                    </DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-4 pt-4 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Agent</label>
                                    <div className="font-medium">{selectedRequest.agentName}</div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Team</label>
                                    <div className="font-medium">{groupedRequests.find(g => g.leaderId === selectedRequest.leaderId)?.leaderName}</div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Product</label>
                                    <div className="font-medium">{selectedRequest.brandName} - {selectedRequest.variantName}</div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                                    <div className="font-medium">{selectedRequest.quantity} units</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Status</label>
                                    <div>{getStatusBadge(selectedRequest.status)}</div>
                                </div>
                                {selectedRequest.leaderNotes && (
                                    <div className="bg-muted/30 p-3 rounded-md space-y-1">
                                        <label className="text-xs font-semibold block text-primary">Leader Note</label>
                                        <p className="text-sm">{selectedRequest.leaderNotes}</p>
                                    </div>
                                )}
                                {selectedRequest.rejectionReason && (
                                    <div className="bg-red-50 p-3 rounded-md space-y-1 border border-red-100">
                                        <label className="text-xs font-semibold block text-red-600">Rejection Reason</label>
                                        <p className="text-sm text-red-700">{selectedRequest.rejectionReason}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
