import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Users, ChevronRight, ChevronDown, UserPlus, UserMinus, Crown, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

// Reusing interfaces from parent, or we can export them from a types file.
// For now defining here to be safe and self-contained.
export interface Agent {
    id: string;
    name: string;
    email: string;
    region: string;
    role: 'mobile_sales' | 'team_leader' | 'manager';
    status: 'active' | 'inactive';
    leaderId?: string;
    leaderName?: string;
    subTeamId?: string;
}

interface HierarchicalTeamListProps {
    managerId: string;
    agents: Agent[];
    onAssignToLeader: (leaderId: string) => void;
    onRemoveFromTeam: (agentId: string) => void;
    isManagerView: boolean; // If true, restrictive (Manager POV). If false, Admin POV.
}

export function HierarchicalTeamList({
    managerId,
    agents,
    onAssignToLeader,
    onRemoveFromTeam,
    isManagerView
}: HierarchicalTeamListProps) {
    // 1. Get Direct Reports of the Manager
    const directReports = agents.filter(a => a.leaderId === managerId);

    // 2. Separate Direct Reports into Leaders and Others (Mobile Sales)
    const subLeaders = directReports.filter(a => a.role === 'team_leader');
    const directMobileSales = directReports.filter(a => a.role === 'mobile_sales');

    return (
        <div className="space-y-4">
            {/* SECTION 1: Sub-Teams (Team Leaders) */}
            {subLeaders.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3">Sub-Teams</h4>
                    {subLeaders.map(leader => (
                        <TeamLeaderRow
                            key={leader.id}
                            leader={leader}
                            allAgents={agents}
                            onAssign={() => onAssignToLeader(leader.id)}
                            onRemove={onRemoveFromTeam}
                            isManagerView={isManagerView}
                        />
                    ))}
                </div>
            )}

            {/* SECTION 2: Direct Reports (Mobile Sales) */}
            {directMobileSales.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 mt-4">Direct Mobile Sales</h4>
                    <div className="border rounded-md divide-y bg-background">
                        {directMobileSales.map(agent => (
                            <div key={agent.id} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{agent.name}</p>
                                        <p className="text-xs text-muted-foreground">{agent.region}</p>
                                    </div>
                                </div>
                                {!isManagerView && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => onRemoveFromTeam(agent.id)}
                                    >
                                        <UserMinus className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {subLeaders.length === 0 && directMobileSales.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                    No members assigned to this team.
                </div>
            )}
        </div>
    );
}

function TeamLeaderRow({
    leader,
    allAgents,
    onAssign,
    onRemove,
    isManagerView
}: {
    leader: Agent,
    allAgents: Agent[],
    onAssign: () => void,
    onRemove: (id: string) => void,
    isManagerView: boolean
}) {
    const [isOpen, setIsOpen] = useState(false);

    // Find users managed by this Team Leader
    const subTeamMembers = allAgents.filter(a => a.leaderId === leader.id);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-md bg-white shadow-sm overflow-hidden">
            <div className={cn(
                "flex items-center justify-between p-3 transition-colors",
                isOpen ? "bg-muted/50" : "hover:bg-muted/30"
            )}>
                <div className="flex items-center gap-3 flex-1">
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                    </CollapsibleTrigger>

                    <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center border border-purple-200">
                            <Crown className="h-4 w-4 text-purple-700" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold">{leader.name}</p>
                                <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">Team Leader</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {subTeamMembers.length} member{subTeamMembers.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Add Member Button */}
                    {!isManagerView && (
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={(e) => { e.stopPropagation(); onAssign(); }}>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span className="sr-only sm:not-sr-only sm:inline-block text-xs">Add</span>
                        </Button>
                    )}

                    {/* Remove Leader Button */}
                    {!isManagerView && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onRemove(leader.id)}>
                            <UserMinus className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <CollapsibleContent>
                <div className="border-t bg-muted/20">
                    {subTeamMembers.length > 0 ? (
                        <div className="divide-y divide-border/50">
                            {subTeamMembers.map(member => (
                                <div key={member.id} className="flex items-center justify-between py-2.5 px-4 pl-12 hover:bg-background/80 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                            <Users className="h-3.5 w-3.5 text-slate-500" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">{member.name}</span>
                                            <span className="text-[10px] text-muted-foreground">{member.region}</span>
                                        </div>
                                    </div>
                                    {!isManagerView && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                                            onClick={() => onRemove(member.id)}
                                        >
                                            <UserMinus className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                            <span>No mobile sales assigned to this sub-team yet.</span>
                            {!isManagerView && (
                                <Button variant="link" size="sm" className="h-auto p-0" onClick={onAssign}>
                                    Assign agents now
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
