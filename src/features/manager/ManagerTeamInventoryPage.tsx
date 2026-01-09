import { useState, useMemo } from 'react';
import { useManagerTeamInventory } from './hooks/useManagerData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Search,
    Package,
    Eye,
    ChevronDown,
    ChevronRight,
    MapPin,
    Box,
    AlertTriangle,
    TrendingUp,
    Users,
    Crown,
    BarChart3
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface DetailedInventoryItem {
    id: string;
    variantName: string;
    variantType: string;
    brandId: string;
    brandName: string;
    stock: number;
    value?: number;
    allocatedPrice?: number;
    dspPrice?: number;
    rspPrice?: number;
}

interface AgentInventorySummary {
    agentId: string;
    agentName: string;
    agentRole: string;
    agentRegion: string;
    leaderId?: string;
    leaderName?: string;
    isDirectReport?: boolean;
    totalStock: number;
    totalValue?: number;
    totalDspValue?: number;
    totalRspValue?: number;
    variantCount: number;
    inventory: DetailedInventoryItem[];
}

export default function ManagerTeamInventoryPage() {
    const { data: teamData = [], isLoading: loading } = useManagerTeamInventory();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgent, setSelectedAgent] = useState<AgentInventorySummary | null>(null);
    const [expandedBrands, setExpandedBrands] = useState<string[]>([]);

    // Process Data for Grouping
    const { directReports, subTeams, stats } = useMemo(() => {
        let filtered = teamData;
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            filtered = teamData.filter(agent =>
                agent.agentName.toLowerCase().includes(lowerQuery) ||
                (agent.leaderName || '').toLowerCase().includes(lowerQuery)
            );
        }

        const direct = filtered.filter(a => a.isDirectReport);
        const sub = filtered.filter(a => !a.isDirectReport);

        // Group sub-teams by leader
        const teams: Record<string, { leaderName: string; agents: AgentInventorySummary[] }> = {};
        sub.forEach(agent => {
            const lid = agent.leaderId || 'unknown';
            if (!teams[lid]) {
                teams[lid] = {
                    leaderName: agent.leaderName || 'Unknown Leader',
                    agents: []
                };
            }
            teams[lid].agents.push(agent);
        });

        // Calculate Stats (from ALL filtered data)
        const totalStock = filtered.reduce((acc, curr) => acc + curr.totalStock, 0);
        const totalValue = filtered.reduce((acc, curr) => acc + (curr.totalValue || 0), 0);
        const totalDspValue = filtered.reduce((acc, curr) => acc + (curr.totalDspValue || 0), 0); // Added
        const totalRspValue = filtered.reduce((acc, curr) => acc + (curr.totalRspValue || 0), 0); // Added
        const lowStockAgents = filtered.filter(a => a.totalStock < 100).length; // Arbitrary threshold for demo

        return {
            directReports: direct,
            subTeams: teams,
            stats: { totalStock, totalValue, totalDspValue, totalRspValue, lowStockAgents } // Updated stats object
        };
    }, [teamData, searchQuery]);


    const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

    const toggleBrand = (brandId: string) => {
        setExpandedBrands(prev =>
            prev.includes(brandId)
                ? prev.filter(id => id !== brandId)
                : [...prev, brandId]
        );
    };

    const InventoryTable = ({ agents }: { agents: AgentInventorySummary[] }) => (
        <Table>
            <TableHeader className="bg-muted/30">
                <TableRow>
                    <TableHead className="w-[30%]">Agent Details</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead className="text-right">Product Types</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Total DSP</TableHead>
                    <TableHead className="text-right">Total RSP</TableHead>
                    <TableHead className="text-right">Total Stock</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {agents.map((agent) => (
                    <TableRow key={agent.agentId} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                            <div className="flex items-center gap-3">
                                <Avatar className={`h-9 w-9 border ${agent.agentRole === 'team_leader' ? 'ring-2 ring-amber-100' : ''}`}>
                                    <AvatarFallback className={agent.agentRole === 'team_leader' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}>
                                        {getInitials(agent.agentName)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                    <span className="font-medium text-sm">{agent.agentName}</span>
                                    {agent.agentRole === 'team_leader' && (
                                        <span className="text-[10px] text-amber-600 flex items-center gap-1 font-medium">
                                            <Crown className="h-3 w-3" /> Team Leader
                                        </span>
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
                        <TableCell className="text-right text-sm">
                            <span className="font-medium text-foreground">{agent.variantCount}</span> <span className="text-muted-foreground text-xs">variants</span>
                        </TableCell>
                        <TableCell className="text-right">
                            {agent.totalValue ? (
                                <span className="font-mono text-sm text-emerald-600">₱{agent.totalValue.toLocaleString()}</span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                            {agent.totalDspValue ? (
                                <span className="font-mono text-sm text-indigo-600">₱{agent.totalDspValue.toLocaleString()}</span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                            {agent.totalRspValue ? (
                                <span className="font-mono text-sm text-purple-600">₱{agent.totalRspValue.toLocaleString()}</span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                            <Badge variant="outline" className={`font-mono ${agent.totalStock < 50 ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                                {agent.totalStock.toLocaleString()}
                            </Badge>
                        </TableCell>
                        <TableCell>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedAgent(agent)}
                                className="h-8 w-8 p-0 hover:bg-muted"
                            >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Inventory</h1>
                    <p className="text-muted-foreground">Overview of stock distribution across your team hierarchy</p>
                </div>
                {/* Search */}
                <div className="relative w-full md:w-auto">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search agent or leader..."
                        className="pl-8 bg-background w-full md:w-[300px]"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Summary Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="items-start shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Team Stock</CardTitle>
                        <Box className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold">{stats.totalStock.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Units across all sub-teams</p>
                    </CardContent>
                </Card>
                <Card className="items-start shadow-sm border-l-4 border-l-emerald-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Allocated Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-green-600">₱{stats.totalValue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Total Allocated Value</p>
                    </CardContent>
                </Card>
                <Card className="items-start shadow-sm border-l-4 border-l-indigo-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total DSP Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-indigo-600">₱{stats.totalDspValue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Based on DSP Pricing</p>
                    </CardContent>
                </Card>
                <Card className="items-start shadow-sm border-l-4 border-l-purple-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total RSP Value</CardTitle>
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold text-purple-600">₱{stats.totalRspValue.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Based on RSP Pricing</p>
                    </CardContent>
                </Card>
                <Card className="items-start shadow-sm border-l-4 border-l-amber-500">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Low Stock Agents</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-2xl font-bold">{stats.lowStockAgents}</div>
                        <p className="text-xs text-muted-foreground">Agents with &lt; 100 units</p>
                    </CardContent>
                </Card>
            </div>


            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Direct Team Section */}
                    <Card className="border shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/40 py-3 px-4 border-b">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-primary" />
                                <CardTitle className="text-base font-semibold">My Direct Team</CardTitle>
                                <Badge variant="secondary" className="ml-2 text-xs rounded-full px-2">
                                    {directReports.length}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {directReports.length > 0 ? (
                                <InventoryTable agents={directReports} />
                            ) : (
                                <div className="p-8 text-center text-muted-foreground text-sm">No direct reports found.</div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Sub-Teams Section */}
                    {Object.entries(subTeams).map(([leaderId, group]) => (
                        <Card key={leaderId} className="border shadow-sm overflow-hidden">
                            <Collapsible defaultOpen>
                                <div className="bg-muted/20 border-b flex items-center justify-between py-2 px-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold ring-2 ring-white">
                                            {getInitials(group.leaderName)}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold">{group.leaderName}'s Team</h3>
                                            <p className="text-[10px] text-muted-foreground">Sub-Team Leader</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden sm:block">
                                            <div className="text-xs font-medium">{group.agents.length} Agents</div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {group.agents.reduce((acc, a) => acc + a.totalStock, 0).toLocaleString()} Total Units
                                            </div>
                                        </div>
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <ChevronDown className="h-4 w-4" />
                                            </Button>
                                        </CollapsibleTrigger>
                                    </div>
                                </div>
                                <CollapsibleContent>
                                    <InventoryTable agents={group.agents} />
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
                    ))}

                    {/* Empty State */}
                    {searchQuery && directReports.length === 0 && Object.keys(subTeams).length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            <Box className="h-12 w-12 mx-auto mb-2 opacity-20" />
                            <p>No results found for "{searchQuery}"</p>
                        </div>
                    )}
                </div>
            )}

            {/* Detailed Inventory Dialog */}
            <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-2xl">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Box className="h-5 w-5 text-primary" />
                            </div>
                            {selectedAgent?.agentName}'s Inventory
                        </DialogTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            View detailed stock allocation and inventory value
                        </p>
                    </DialogHeader>

                    {selectedAgent && (
                        <div className="space-y-6 pt-4">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <Card className="border-blue-200 bg-blue-50/50">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                                                <Package className="h-6 w-6 text-blue-600" />
                                            </div>
                                            <div>
                                                <div className="text-3xl font-bold text-blue-900">{selectedAgent.totalStock.toLocaleString()}</div>
                                                <div className="text-sm text-blue-700">Total Units</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-green-200 bg-green-50/50">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                                                <TrendingUp className="h-6 w-6 text-green-600" />
                                            </div>
                                            <div>
                                                <div className="text-3xl font-bold text-green-900">
                                                    ₱{(selectedAgent.totalValue || 0).toLocaleString()}
                                                </div>
                                                <div className="text-sm text-green-700">
                                                    Total Allocated Value
                                                </div>
                                                <div className="text-xs text-foreground font-medium mt-1">
                                                    DSP: ₱
                                                    {selectedAgent.inventory
                                                        .reduce((sum, item) => sum + (item.dspPrice || 0) * item.stock, 0)
                                                        .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    {' • '}
                                                    RSP: ₱
                                                    {selectedAgent.inventory
                                                        .reduce((sum, item) => sum + (item.rspPrice || 0) * item.stock, 0)
                                                        .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-purple-200 bg-purple-50/50">
                                    <CardContent className="pt-6">
                                        <div className="flex items-center gap-3">
                                            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                                                <BarChart3 className="h-6 w-6 text-purple-600" />
                                            </div>
                                            <div>
                                                <div className="text-3xl font-bold text-purple-900">{selectedAgent.variantCount}</div>
                                                <div className="text-sm text-purple-700">Product Types</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Inventory Breakdown Table */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold">Inventory Breakdown</h3>
                                    <Badge variant="outline">{selectedAgent.inventory.length} items</Badge>
                                </div>

                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="font-semibold">Product</TableHead>
                                                <TableHead className="font-semibold">Type</TableHead>
                                                <TableHead className="text-center font-semibold">Stock</TableHead>
                                                <TableHead className="text-right font-semibold">Unit / DSP / RSP</TableHead>
                                                <TableHead className="text-right font-semibold">Totals</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedAgent.inventory.map((item, index) => {
                                                const unitPrice = item.allocatedPrice || 0;
                                                const dspPrice = item.dspPrice || 0;
                                                const rspPrice = item.rspPrice || 0;

                                                const unitTotal = unitPrice * item.stock;
                                                const dspTotal = dspPrice * item.stock;
                                                const rspTotal = rspPrice * item.stock;

                                                return (
                                                    <TableRow key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                                        <TableCell>
                                                            <div>
                                                                <div className="font-medium">{item.brandName}</div>
                                                                <div className="text-sm text-muted-foreground">{item.variantName}</div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal uppercase tracking-wide">
                                                                {item.variantType}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="font-semibold">{item.stock.toLocaleString()}</span>
                                                            <span className="text-muted-foreground text-sm"> units</span>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs sm:text-sm">
                                                            <div className="flex flex-col items-end gap-0.5">
                                                                <div>
                                                                    Unit:{' '}
                                                                    <span className="font-semibold">
                                                                        ₱{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </span>
                                                                </div>
                                                                <div className="text-muted-foreground">
                                                                    DSP: ₱{dspPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • RSP:{' '}
                                                                    ₱{rspPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs sm:text-sm">
                                                            <div className="flex flex-col items-end gap-0.5">
                                                                <div className="font-bold text-primary">
                                                                    Total:{' '}
                                                                    ₱{unitTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </div>
                                                                <div className="text-muted-foreground">
                                                                    DSP: ₱{dspTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • RSP:{' '}
                                                                    ₱{rspTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                            {selectedAgent.inventory.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                        No inventory items found.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

