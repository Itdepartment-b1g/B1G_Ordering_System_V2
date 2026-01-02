import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  UserPlus, 
  Crown, 
  Loader2,
  UserMinus,
  MoreHorizontal,
  ArrowRight,
  Building2,
  UserCheck,
  UserX,
  Sparkles,
  Mail,
  MapPin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { LeaderAssignmentSection } from './LeaderAssignmentSection';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '@/features/auth';

// Database interfaces
interface Agent {
  id: string;
  name: string;
  email: string;
  region: string;
  role: 'mobile_sales' | 'team_leader' | 'manager';
  status: 'active' | 'inactive';
  leaderId?: string;
  leaderName?: string;
}

interface Leader {
  id: string;
  name: string;
  region: string;
  teamSize: number;
  role?: 'team_leader' | 'manager';
}

export function TeamManagementTab() {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
  const [unpromoteDialogOpen, setUnpromoteDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [selectedLeader, setSelectedLeader] = useState<string>('');
  const [agentToUnassign, setAgentToUnassign] = useState<string>('');
  const [leaderToUnpromote, setLeaderToUnpromote] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [unpromoting, setUnpromoting] = useState(false);
  const { toast } = useToast();

  // Unassigned agents: mobile_sales and team_leader (managers can have both)
  const unassignedAgents = agents.filter(agent => 
    !agent.leaderId && 
    !['manager'].includes(agent.role) &&
    ['mobile_sales', 'team_leader'].includes(agent.role)
  );
  // Assigned agents: mobile_sales and team_leader who have a leader
  const assignedAgents = agents.filter(agent => 
    agent.leaderId && 
    ['mobile_sales', 'team_leader'].includes(agent.role)
  );
  const totalAgents = agents.filter(agent => agent.role === 'mobile_sales').length;
  
  // Top-level leaders: leaders who are not assigned to any manager
  const topLevelLeaders = leaders.filter(leader => {
    // Check if this leader is assigned to a manager (has a leaderId in agents)
    const isAssignedToManager = agents.some(agent => 
      agent.id === leader.id && agent.leaderId !== undefined
    );
    return !isAssignedToManager;
  });

 // Fetch data from database (with optional silent mode for real-time updates)
 const fetchData = async (silent = false) => {
  try {
    if (!silent) {
      setLoading(true);
    }
    
    // Build base queries with company filter applied upfront
    const companyFilter = user?.company_id ? { company_id: user.company_id } : {};
    
    // Execute all queries in parallel for maximum speed
    const [agentsResult, teamResult] = await Promise.all([
      // Fetch all relevant profiles
      supabase
        .from('profiles')
        .select('*')
        .in('role', ['mobile_sales', 'team_leader', 'manager'])
        .match(companyFilter)
        .order('created_at', { ascending: false })
        .limit(200),
      
      // Fetch team assignments (trimmed and capped)
      supabase
        .from('leader_teams')
        .select('agent_id, leader_id')
        .match(companyFilter)
        .limit(200)
    ]);

    if (agentsResult.error) throw agentsResult.error;
    if (teamResult.error) throw teamResult.error;

    const agentsData = agentsResult.data || [];
    const teamData = teamResult.data || [];

    // Create lookup maps for O(1) access
    const teamMap = new Map(teamData.map(t => [t.agent_id, t.leader_id]));
    const profileMap = new Map(agentsData.map(p => [p.id, p]));

    // Process agents data in a single pass
    const processedAgents: Agent[] = agentsData.map((agent: any) => {
      const leaderId = teamMap.get(agent.id);
      const leaderProfile = leaderId ? profileMap.get(leaderId) : undefined;
      
      return {
        id: agent.id,
        name: agent.full_name || '',
        email: agent.email || '',
        region: agent.region || '',
        role: agent.role || 'mobile_sales',
        status: agent.status || 'active',
        leaderId: leaderId,
        leaderName: leaderProfile?.full_name,
      };
    });

    // Build leaders map efficiently
    const leadersMap = new Map<string, Leader>();
    const teamSizeMap = new Map<string, number>();
    
    // Count team sizes
    for (const assignment of teamData) {
      teamSizeMap.set(
        assignment.leader_id, 
        (teamSizeMap.get(assignment.leader_id) || 0) + 1
      );
    }

    // Add all leaders and managers
    for (const agent of processedAgents) {
      if (['team_leader', 'manager'].includes(agent.role)) {
        leadersMap.set(agent.id, {
          id: agent.id,
          name: agent.name,
          region: agent.region,
          teamSize: teamSizeMap.get(agent.id) || 0,
          role: agent.role as 'team_leader' | 'manager'
        });
      }
    }

    setAgents(processedAgents);
    setLeaders(Array.from(leadersMap.values()));
    
  } catch (error) {
    console.error('Error fetching team data:', error);
    toast({
      title: 'Error',
      description: 'Failed to load team data',
      variant: 'destructive'
    });
  } finally {
    if (!silent) {
      setLoading(false);
    }
  }
};

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time subscriptions for seamless updates
  useEffect(() => {
    const channels: RealtimeChannel[] = [];
    let debounceTimer: NodeJS.Timeout | null = null;

    // Subscribe to profiles table changes (for role changes, new agents, etc.)
    // Only listen to mobile_sales, team_leader, and manager role changes
    const profilesChannel = subscribeToTable('profiles', (payload) => {
      // Only refresh if the change affects relevant roles
      const newData = payload.new as any;
      const oldData = payload.old as any;
      
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const role = newData?.role;
        if (['mobile_sales', 'team_leader', 'manager'].includes(role)) {
          console.log('🔄 Profiles changed:', payload.eventType);
          // Debounce to prevent rapid successive updates
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchData(true);
          }, 300);
        }
      } else if (payload.eventType === 'DELETE') {
        const role = oldData?.role;
        if (['mobile_sales', 'team_leader', 'manager'].includes(role)) {
          console.log('🔄 Profiles deleted:', payload.eventType);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchData(true);
          }, 300);
        }
      }
    });

    // Subscribe to leader_teams table changes (for team assignments)
    const teamsChannel = subscribeToTable('leader_teams', (payload) => {
      console.log('🔄 Leader teams changed:', payload.eventType);
      // Debounce to prevent rapid successive updates
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchData(true);
      }, 300);
    });

    channels.push(profilesChannel, teamsChannel);

    // Cleanup subscriptions on unmount
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channels.forEach(channel => unsubscribe(channel));
    };
  }, []); // Only set up once on mount

  const handleAssignAgent = async () => {
    if (!selectedAgent || !selectedLeader) {
      toast({
        title: 'Error',
        description: 'Please select both an agent and a leader',
        variant: 'destructive'
      });
      return;
    }

    setAssigning(true);
    
    try {
      // Get current user (admin) ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Use the database function to assign agent to leader
      const { data, error } = await supabase.rpc('assign_agent_to_leader', {
        p_agent_id: selectedAgent,
        p_leader_id: selectedLeader,
        p_admin_id: user.id
      });

      if (error) throw error;

      // Check if the function returned a failure response
      if (!data || !data.success) {
        const errorMessage = data?.error || 'Failed to assign agent to team';
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        });
        return;
      }

      toast({
        title: 'Success',
        description: 'Agent has been assigned to the team successfully'
      });
      
      // Refresh data
      await fetchData();
      
      setAssignDialogOpen(false);
      setConfirmDialogOpen(false);
      setSelectedAgent('');
      setSelectedLeader('');
      
    } catch (error) {
      console.error('Error assigning agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign agent to team',
        variant: 'destructive'
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignClick = () => {
    if (!selectedAgent || !selectedLeader) {
      toast({
        title: 'Error',
        description: 'Please select both an agent and a leader',
        variant: 'destructive'
      });
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleUnassignAgent = async () => {
    if (!agentToUnassign) {
      toast({
        title: 'Error',
        description: 'No agent selected to unassign',
        variant: 'destructive'
      });
      return;
    }

    setUnassigning(true);
    
    try {
      // Get current user (admin) ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Use the database function to remove agent from team
      const { data, error } = await supabase.rpc('remove_agent_from_team', {
        p_agent_id: agentToUnassign,
        p_admin_id: user.id
      });

      if (error) throw error;

      // Check if the function returned a failure response
      if (!data || !data.success) {
        const errorMessage = data?.error || 'Failed to unassign agent from team';
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive'
        });
        return;
      }

      const agent = agents.find(a => a.id === agentToUnassign);
      
      toast({
        title: 'Success',
        description: `${agent?.name} has been unassigned from the team`
      });
      
      // Refresh data
      await fetchData();
      
      setUnassignDialogOpen(false);
      setAgentToUnassign('');
      
    } catch (error: any) {
      console.error('Error unassigning agent:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to unassign agent from team',
        variant: 'destructive'
      });
    } finally {
      setUnassigning(false);
    }
  };

  const handleUnassignClick = (agentId: string) => {
    setAgentToUnassign(agentId);
    setUnassignDialogOpen(true);
  };

  const handleUnpromoteClick = (leaderId: string) => {
    setLeaderToUnpromote(leaderId);
    setUnpromoteDialogOpen(true);
  };

  const handleUnpromoteLeader = async () => {
    if (!leaderToUnpromote) {
      toast({ title: 'Error', description: 'No leader selected', variant: 'destructive' });
      return;
    }

    setUnpromoting(true);
    try {
      // First, get the current role of the leader
      const { data: leaderProfile, error: fetchErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', leaderToUnpromote)
        .single();

      if (fetchErr) throw fetchErr;
      if (!leaderProfile) {
        throw new Error('Leader not found');
      }

      const currentRole = leaderProfile.role;
      let newRole: string;
      let successMessage: string;

      if (currentRole === 'manager') {
        // Manager -> Team Leader
        newRole = 'team_leader';
        successMessage = 'Manager unpromoted to Team Leader. Team assignments remain.';
        // Don't remove team assignments - manager becomes team leader and keeps their team
      } else if (currentRole === 'team_leader') {
        // Team Leader -> Mobile Sales
        newRole = 'mobile_sales';
        successMessage = 'Team Leader unpromoted to Mobile Sales and team cleared.';
        // Remove existing team assignments for this leader
        const { error: teamErr } = await supabase
          .from('leader_teams')
          .delete()
          .eq('leader_id', leaderToUnpromote);
        if (teamErr) throw teamErr;
      } else {
        throw new Error('User is not a manager or team leader');
      }

      // Update profile role
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', leaderToUnpromote);
      if (profileErr) throw profileErr;

      toast({ 
        title: 'Unpromoted Successfully', 
        description: successMessage 
      });
      setUnpromoteDialogOpen(false);
      setLeaderToUnpromote('');
      await fetchData();
    } catch (error: any) {
      console.error('Error unpromoting leader:', error);
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to unpromote leader', 
        variant: 'destructive' 
      });
    } finally {
      setUnpromoting(false);
    }
  };

  if (loading) {
  return (
        <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Loading team data...</span>
          </div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Assign Agent Dialog - Hidden, accessible via other actions */}
                    <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle>Assign Agent to Team</DialogTitle>
            <DialogDescription>
              Select an unassigned agent to assign. Managers can have both team leaders and mobile sales agents. Team leaders can only have mobile sales agents.
            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Select Agent</Label>
                            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose an agent" />
                              </SelectTrigger>
                              <SelectContent>
                                {unassignedAgents.map(agent => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name} ({agent.region})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
              {unassignedAgents.length === 0 && (
                <p className="text-sm text-muted-foreground">All agents are assigned</p>
              )}
                          </div>
                          <div className="space-y-2">
                            <Label>Select Leader or Manager</Label>
                            <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a leader or manager" />
                              </SelectTrigger>
                              <SelectContent>
                                {leaders.map(leader => (
                                  <SelectItem key={leader.id} value={leader.id}>
                      {leader.name} ({leader.region}) - {leader.teamSize} members
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button 
                            className="w-full" 
                            onClick={handleAssignClick}
                            disabled={!selectedAgent || !selectedLeader || assigning}
                          >
                            {assigning ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Assigning...
                              </>
                            ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Assign to Team
                </>
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                <Crown className="h-5 w-5 text-blue-600" />
                  </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{leaders.length}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Leaders & Managers</p>
                    </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-green-50 border border-green-100">
                <UserCheck className="h-5 w-5 text-green-600" />
              </div>
                            <div>
                <p className="text-2xl font-semibold tracking-tight">{assignedAgents.length}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Assigned</p>
                            </div>
                          </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <UserX className="h-5 w-5 text-amber-600" />
                      </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{unassignedAgents.length}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Unassigned</p>
                    </div>
            </div>
                </CardContent>
              </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight">{totalAgents}</p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="teams" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-muted/50">
          <TabsTrigger value="teams" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Teams</TabsTrigger>
          <TabsTrigger value="leaders" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">Leaders & Managers</TabsTrigger>
          <TabsTrigger value="unassigned" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Unassigned 
            {unassignedAgents.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {unassignedAgents.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-4 mt-6">
          {topLevelLeaders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-20">
                <div className="text-center max-w-md mx-auto">
                  <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
                    <Building2 className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Teams Created</h3>
                  <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                    Get started by promoting a mobile sales agent to team leader
                  </p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="shadow-sm">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Promote First Leader
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                      <LeaderAssignmentSection />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topLevelLeaders.map(leader => {
                const teamAgents = agents.filter(agent => agent.leaderId === leader.id);
                return (
                  <Card key={leader.id} className="hover:shadow-md transition-all duration-200 border-border/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-blue-100">
                            <Crown className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base font-semibold truncate">{leader.name}</CardTitle>
                              {leader.role === 'manager' && (
                                <Badge variant="default" className="text-xs bg-purple-600">
                                  Manager
                                </Badge>
                              )}
                              {leader.role === 'team_leader' && (
                                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                                  Team Leader
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <p className="text-sm text-muted-foreground truncate">{leader.region}</p>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem 
                              onClick={() => handleUnpromoteClick(leader.id)}
                              className="text-orange-600 focus:text-orange-600"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              {leader.role === 'manager' ? 'Unpromote to Team Leader' : 'Unpromote to Mobile Sales'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm font-medium text-muted-foreground">Team Size</span>
                          <Badge variant="secondary" className="font-medium">{teamAgents.length} {teamAgents.length === 1 ? 'member' : 'members'}</Badge>
                        </div>
                        {teamAgents.length > 0 ? (
                          <div className="pt-3 border-t border-border/50">
                            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Team Members</p>
                            <div className="space-y-2.5">
                              {teamAgents.slice(0, 3).map(agent => (
                                <div key={agent.id} className="flex items-center gap-2.5 text-sm">
                                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-green-100">
                                    <Users className="h-3.5 w-3.5 text-white" />
                                  </div>
                                  <span className="font-medium truncate">{agent.name}</span>
                                </div>
                              ))}
                              {teamAgents.length > 3 && (
                                <p className="text-xs text-muted-foreground pl-10 font-medium">
                                  +{teamAgents.length - 3} more {teamAgents.length - 3 === 1 ? 'member' : 'members'}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-3 border-t border-border/50">
                            <p className="text-xs text-muted-foreground text-center py-2">No team members assigned</p>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => {
                                setAssignDialogOpen(true);
                                setSelectedLeader(leader.id);
                              }}
                            >
                              <UserPlus className="h-3.5 w-3.5 mr-2" />
                              Assign Agent
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Leaders Tab */}
        <TabsContent value="leaders" className="space-y-4 mt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Leaders & Managers</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage existing team leaders and managers
              </p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="default" className="shadow-sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Promote Leader
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <LeaderAssignmentSection />
              </DialogContent>
            </Dialog>
          </div>
          {leaders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16">
                <div className="text-center max-w-sm mx-auto">
                  <div className="h-16 w-16 mx-auto mb-5 rounded-full bg-muted/50 flex items-center justify-center">
                    <Crown className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Leaders or Managers</h3>
                  <p className="text-sm text-muted-foreground mb-6">Promote a mobile sales agent to create your first team leader</p>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="shadow-sm">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Promote First Leader
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                      <LeaderAssignmentSection />
                    </DialogContent>
                  </Dialog>
                  </div>
                </CardContent>
              </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leaders.map(leader => {
                const teamAgents = agents.filter(agent => agent.leaderId === leader.id);
                // Check if this leader is assigned to a manager
                const leaderAgent = agents.find(agent => agent.id === leader.id);
                const isAssignedToManager = leaderAgent?.leaderId !== undefined;
                const managerName = isAssignedToManager 
                  ? agents.find(agent => agent.id === leaderAgent?.leaderId)?.name || 'Manager'
                  : null;
                
                return (
                  <Card key={leader.id} className="hover:shadow-md transition-all duration-200 border-border/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-blue-100">
                            <Crown className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-base font-semibold truncate">{leader.name}</CardTitle>
                              {leader.role === 'manager' && (
                                <Badge variant="default" className="text-xs bg-purple-600">
                                  Manager
                                </Badge>
                              )}
                              {leader.role === 'team_leader' && (
                                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                                  Team Leader
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <p className="text-sm text-muted-foreground truncate">{leader.region}</p>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem 
                              onClick={() => handleUnpromoteClick(leader.id)}
                              className="text-orange-600 focus:text-orange-600"
                            >
                              <UserMinus className="h-4 w-4 mr-2" />
                              {leader.role === 'manager' ? 'Unpromote to Team Leader' : 'Unpromote to Mobile Sales'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-4">
                        {isAssignedToManager ? (
                          <div className="flex items-center justify-between py-2">
                            <span className="text-sm font-medium text-muted-foreground">Assigned to</span>
                            <Badge variant="default" className="font-medium bg-purple-600">
                              {managerName}'s team
                            </Badge>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between py-2">
                              <span className="text-sm font-medium text-muted-foreground">Team Size</span>
                              <Badge variant="secondary" className="font-medium">{teamAgents.length} {teamAgents.length === 1 ? 'member' : 'members'}</Badge>
                            </div>
                            {teamAgents.length > 0 && (
                              <div className="pt-3 border-t border-border/50">
                                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Team Members</p>
                                <div className="space-y-2.5">
                                  {teamAgents.slice(0, 3).map(agent => (
                                    <div key={agent.id} className="flex items-center gap-2.5 text-sm">
                                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-green-100">
                                        <Users className="h-3.5 w-3.5 text-white" />
                                      </div>
                                      <span className="font-medium truncate">{agent.name}</span>
                                    </div>
                                  ))}
                                  {teamAgents.length > 3 && (
                                    <p className="text-xs text-muted-foreground pl-10 font-medium">
                                      +{teamAgents.length - 3} more {teamAgents.length - 3 === 1 ? 'member' : 'members'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
            </TabsContent>

        {/* Unassigned Tab */}
        <TabsContent value="unassigned" className="space-y-4 mt-6">
          {unassignedAgents.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16">
                <div className="text-center max-w-sm mx-auto">
                  <div className="h-16 w-16 mx-auto mb-5 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                    <UserCheck className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">All Agents Assigned</h3>
                  <p className="text-sm text-muted-foreground">Great job! All mobile sales agents are part of a team.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-4">
                <div>
                  <CardTitle className="text-lg font-semibold">Unassigned Agents</CardTitle>
                  <CardDescription className="mt-1.5">
                    {unassignedAgents.length} agent{unassignedAgents.length !== 1 ? 's' : ''} waiting for team assignment
                  </CardDescription>
                </div>
                </CardHeader>
                <CardContent>
                <div className="space-y-2">
                  {unassignedAgents.map(agent => (
                    <div 
                      key={agent.id} 
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 hover:border-border transition-all duration-150 group"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-amber-100">
                          <Users className="h-5 w-5 text-white" />
                            </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground">{agent.name}</p>
                          <div className="flex items-center gap-4 mt-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[200px]">{agent.email}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              <span>{agent.region}</span>
                          </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 font-medium">
                          Unassigned
                        </Badge>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="shadow-sm"
                          onClick={() => {
                            setAssignDialogOpen(true);
                            setSelectedAgent(agent.id);
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-2" />
                          Assign
                          </Button>
                      </div>
                        </div>
                      ))}
                    </div>
                </CardContent>
              </Card>
          )}
            </TabsContent>
          </Tabs>
      
      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Team Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign{' '}
              <strong>{agents.find(a => a.id === selectedAgent)?.name}</strong>{' '}
              to{' '}
              <strong>{leaders.find(l => l.id === selectedLeader)?.name}</strong>'s{' '}
              team?
              <br /><br />
              This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Add the agent to the leader's team</li>
                <li>Allow the agent to request stock from this leader</li>
                <li>Give the leader oversight of this agent's performance</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleAssignAgent}
              disabled={assigning}
              className="bg-green-600 hover:bg-green-700"
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign to Team
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={unassignDialogOpen} onOpenChange={setUnassignDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Unassignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unassign{' '}
              <strong>{agents.find(a => a.id === agentToUnassign)?.name}</strong>{' '}
              from their current team?
              <br /><br />
              This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove the agent from their current team</li>
                <li>Make them available for reassignment</li>
                <li>Remove their ability to request stock from the current leader</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnassignAgent}
              disabled={unassigning}
              className="bg-red-600 hover:bg-red-700"
            >
              {unassigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unassigning...
                </>
              ) : (
                <>
                  <UserMinus className="h-4 w-4 mr-2" />
                  Unassign from Team
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unpromoteDialogOpen} onOpenChange={setUnpromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpromote Leader</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const leader = leaders.find(l => l.id === leaderToUnpromote);
                if (leader?.role === 'manager') {
                  return 'This will revert the manager to Team Leader. Their team assignments will remain. Continue?';
                } else {
                  return 'This will revert the team leader to Mobile Sales and remove all their team assignments. Continue?';
                }
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unpromoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleUnpromoteLeader}
              disabled={unpromoting}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {unpromoting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unpromoting...
                </>
              ) : (
                'Unpromote'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
