import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Search,
    Package,
    Eye,
    ChevronRight,
    User,
    Crown,
    MapPin,
    Box,
    ChevronDown // Added ChevronDown
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface DetailedInventoryItem {
    id: string;
    variantName: string;
    variantType: string;
    brandId: string; // Added brandId
    brandName: string;
    stock: number;
}

interface AgentInventorySummary {
    agentId: string;
    agentName: string;
    agentRole: string;
    agentRegion: string;
    totalStock: number;
    variantCount: number;
    inventory: DetailedInventoryItem[];
}

export default function ManagerTeamInventoryPage() {
    const { user } = useAuth();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [teamData, setTeamData] = useState<AgentInventorySummary[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgent, setSelectedAgent] = useState<AgentInventorySummary | null>(null);
    const [expandedBrands, setExpandedBrands] = useState<string[]>([]); // Added state for expanded brands

    useEffect(() => {
        if (user) {
            fetchTeamInventory();
        }
    }, [user]);

    // Reset expanded brands when modal closes or agent changes
    useEffect(() => {
        if (!selectedAgent) {
            setExpandedBrands([]);
        }
    }, [selectedAgent]);

    const fetchTeamInventory = async () => {
        try {
            setLoading(true);
            if (!user?.company_id) return;

            // 1. Get Team Hierarchy
            const { data: relationships, error: relError } = await supabase
                .from('leader_teams')
                .select('agent_id, leader_id')
                .eq('company_id', user.company_id);

            if (relError) throw relError;

            // Define who is in the team (Direct + Indirect)
            const directReports = (relationships || [])
                .filter(r => r.leader_id === user?.id)
                .map(r => r.agent_id);

            const secondLevelReports = (relationships || [])
                .filter(r => directReports.includes(r.leader_id))
                .map(r => r.agent_id);

            const allTeamIds = Array.from(new Set([...directReports, ...secondLevelReports]));

            if (allTeamIds.length === 0) {
                setTeamData([]);
                setLoading(false);
                return;
            }

            // 2. Fetch Profiles (for name/role)
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select('id, full_name, role, region')
                .eq('company_id', user.company_id)
                .in('id', allTeamIds);

            if (profError) throw profError;

            // 3. Fetch Inventory Data (grouped logic)
            // We fetch all non-zero inventory for these agents
            const { data: inventoryData, error: invError } = await supabase
                .from('agent_inventory')
                .select(`
                    id,
                    stock,
                    agent_id,
                    variants!inner (
                        id,
                        name,
                        variant_type,
                        brand_id, 
                        brands!inner (
                            id,
                            name
                        )
                    )
                `)
                .eq('company_id', user.company_id)
                .in('agent_id', allTeamIds)
                .gt('stock', 0);

            if (invError) throw invError;

            // 4. Process and Aggregate Data
            const inventoryMap = new Map<string, DetailedInventoryItem[]>();

            inventoryData?.forEach((item: any) => {
                const agentId = item.agent_id;
                if (!inventoryMap.has(agentId)) {
                    inventoryMap.set(agentId, []);
                }

                inventoryMap.get(agentId)?.push({
                    id: item.id,
                    variantName: item.variants.name,
                    variantType: item.variants.variant_type,
                    brandId: item.variants.brands.id, // Capture brandId
                    brandName: item.variants.brands.name,
                    stock: item.stock
                });
            });

            // Map profiles to summaries
            const summaries: AgentInventorySummary[] = (profiles || []).map(profile => {
                const agentInventory = inventoryMap.get(profile.id) || [];
                const totalStock = agentInventory.reduce((sum, i) => sum + i.stock, 0);

                return {
                    agentId: profile.id,
                    agentName: profile.full_name,
                    agentRole: profile.role,
                    agentRegion: profile.region || 'N/A',
                    totalStock: totalStock,
                    variantCount: agentInventory.length,
                    inventory: agentInventory.sort((a, b) => b.stock - a.stock) // Sort by highest stock first in detail view
                };
            });

            // Sort: Leaders first, then by Total Stock desc
            summaries.sort((a, b) => {
                if (a.agentRole === 'team_leader' && b.agentRole !== 'team_leader') return -1;
                if (a.agentRole !== 'team_leader' && b.agentRole === 'team_leader') return 1;
                return b.totalStock - a.totalStock;
            });

            setTeamData(summaries);

        } catch (error) {
            console.error('Error fetching inventory:', error);
            toast({
                title: 'Error',
                description: 'Failed to load team inventory.',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

    const filteredData = teamData.filter(agent =>
        agent.agentName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalTeamStock = filteredData.reduce((sum, agent) => sum + agent.totalStock, 0);

    const toggleBrand = (brandId: string) => {
        setExpandedBrands(prev =>
            prev.includes(brandId)
                ? prev.filter(id => id !== brandId)
                : [...prev, brandId]
        );
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Inventory</h1>
                    <p className="text-muted-foreground">Overview of stock distribution across your team</p>
                </div>
                <div className="px-4 py-2 bg-muted/50 rounded-lg border">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Total Team Stock</span>
                    <div className="text-2xl font-bold text-primary">{totalTeamStock.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                </div>
            </div>

            <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b bg-muted/40 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search team member..."
                                className="pl-8 bg-background"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : filteredData.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            No team members found matching your search.
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/10">
                                <TableRow>
                                    <TableHead className="w-[30%]">Agent</TableHead>
                                    <TableHead>Region</TableHead>
                                    <TableHead className="text-right">Variant Types</TableHead>
                                    <TableHead className="text-right">Total Stock</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.map((agent) => (
                                    <TableRow key={agent.agentId} className="hover:bg-muted/30">
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <Avatar className={`h-9 w-9 border ${agent.agentRole === 'team_leader' ? 'ring-2 ring-amber-100' : ''}`}>
                                                    <AvatarFallback className={agent.agentRole === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>
                                                        {getInitials(agent.agentName)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{agent.agentName}</span>
                                                    {agent.agentRole === 'team_leader' ? (
                                                        <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                                                            <Crown className="h-3 w-3" /> Team Leader
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground">Direct Report</span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                                <MapPin className="h-3 w-3" />
                                                {agent.agentRegion}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {agent.variantCount}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Badge variant="secondary" className="font-bold">
                                                {agent.totalStock.toLocaleString()} units
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setSelectedAgent(agent)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
                                                    <DialogHeader className="p-6 pb-2">
                                                        <DialogTitle className="flex items-center gap-2 text-xl">
                                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold border ${agent.agentRole === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                                                {getInitials(agent.agentName)}
                                                            </div>
                                                            <div>
                                                                {agent.agentName}
                                                                <span className="block text-xs font-normal text-muted-foreground">Inventory Breakdown</span>
                                                            </div>
                                                        </DialogTitle>
                                                    </DialogHeader>

                                                    <div className="flex-1 overflow-y-auto p-6 pt-2">
                                                        {agent.inventory.length === 0 ? (
                                                            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                                                                <Box className="h-10 w-10 mb-2 opacity-20" />
                                                                <p>No inventory items found</p>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-4">
                                                                {/* Group by Brand and make each brand collapsible */}
                                                                {Array.from(new Set(agent.inventory.map(i => i.brandId))).map(brandId => {
                                                                    const brandItems = agent.inventory.filter(i => i.brandId === brandId);
                                                                    const brandName = brandItems[0]?.brandName || 'Unknown Brand';
                                                                    const isExpanded = expandedBrands.includes(brandId);

                                                                    return (
                                                                        <div key={brandId} className="border rounded-lg overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md">
                                                                            <div
                                                                                className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${isExpanded ? 'bg-muted/50' : 'bg-card hover:bg-muted/30'}`}
                                                                                onClick={() => toggleBrand(brandId)}
                                                                            >
                                                                                <div className="flex items-center gap-3">
                                                                                    <div className={`p-1.5 rounded-full transition-transform duration-200 ${isExpanded ? 'bg-primary/10 rotate-90' : 'bg-muted'}`}>
                                                                                        <ChevronRight className={`h-4 w-4 ${isExpanded ? 'text-primary' : 'text-muted-foreground'}`} />
                                                                                    </div>
                                                                                    <div>
                                                                                        <h3 className="font-semibold text-sm flex items-center gap-2">
                                                                                            {brandName}
                                                                                        </h3>
                                                                                        <div className="text-xs text-muted-foreground mt-0.5">
                                                                                            {brandItems.length} Products
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <Badge variant={isExpanded ? "default" : "secondary"} className="ml-auto text-xs h-6 px-3">
                                                                                    {brandItems.reduce((acc, i) => acc + i.stock, 0).toLocaleString()} units
                                                                                </Badge>
                                                                            </div>

                                                                            {isExpanded && (
                                                                                <div className="border-t bg-muted/5 animate-in slide-in-from-top-2 duration-200">
                                                                                    <Table>
                                                                                        <TableHeader className="bg-muted/30">
                                                                                            <TableRow className="hover:bg-transparent border-b-0">
                                                                                                <TableHead className="py-2 h-9 text-xs pl-12">Product Variant</TableHead>
                                                                                                <TableHead className="py-2 h-9 text-xs w-[100px]">Type</TableHead>
                                                                                                <TableHead className="py-2 h-9 text-xs text-right w-[100px] pr-6">Stock</TableHead>
                                                                                            </TableRow>
                                                                                        </TableHeader>
                                                                                        <TableBody>
                                                                                            {brandItems.map((item) => (
                                                                                                <TableRow key={item.id} className="hover:bg-muted/20 border-b-0">
                                                                                                    <TableCell className="py-2 font-medium text-sm pl-12">
                                                                                                        {item.variantName}
                                                                                                    </TableCell>
                                                                                                    <TableCell className="py-2">
                                                                                                        <Badge variant="outline" className="capitalize text-[10px] h-5 font-normal px-2 bg-background/50">
                                                                                                            {item.variantType}
                                                                                                        </Badge>
                                                                                                    </TableCell>
                                                                                                    <TableCell className="py-2 text-right pr-6">
                                                                                                        <span className={`font-semibold text-sm ${item.stock < 10 ? 'text-red-500' : ''}`}>
                                                                                                            {item.stock.toLocaleString()}
                                                                                                        </span>
                                                                                                    </TableCell>
                                                                                                </TableRow>
                                                                                            ))}
                                                                                            {/* Add bottom padding to table body to separate from border */}
                                                                                            <TableRow className="hover:bg-transparent h-2 border-none"><TableCell colSpan={3} className="p-0"></TableCell></TableRow>
                                                                                        </TableBody>
                                                                                    </Table>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </DialogContent>
                                            </Dialog>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
