import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  UserPlus, 
  Crown, 
  Loader2,
  UserMinus,
  MoreHorizontal
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

// Database interfaces
interface Agent {
  id: string;
  name: string;
  email: string;
  region: string;
  position?: 'Leader' | 'Mobile Sales' | 'Hermanos Sales Agent';
  status: 'active' | 'inactive';
  leaderId?: string;
  leaderName?: string;
}

interface Leader {
  id: string;
  name: string;
  region: string;
  teamSize: number;
}

export function TeamManagementTab() {
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

  const unassignedAgents = agents.filter(agent => !agent.leaderId && agent.position !== 'Leader');

  // Fetch data from database
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch all sales agents
      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'sales_agent')
        .order('created_at', { ascending: false });

      if (agentsError) throw agentsError;

      // Fetch team assignments
      const { data: teamData, error: teamError } = await supabase
        .from('leader_teams')
        .select('agent_id, leader_id');

      if (teamError) throw teamError;

      // Fetch leader profiles separately
      const leaderIds = [...new Set(teamData?.map(t => t.leader_id) || [])];
      const { data: leaderProfiles, error: leaderError } = await supabase
        .from('profiles')
        .select('id, full_name, region')
        .in('id', leaderIds);

      if (leaderError) throw leaderError;

      // Process agents data
      const processedAgents: Agent[] = (agentsData || []).map((agent: any) => {
        // Find team assignment for this agent
        const teamAssignment = teamData?.find(t => t.agent_id === agent.id);
        const leaderProfile = leaderProfiles?.find(l => l.id === teamAssignment?.leader_id);
        
        return {
          id: agent.id,
          name: agent.full_name || '',
          email: agent.email || '',
          region: agent.region || '',
          position: agent.position || undefined,
          status: agent.status || 'active',
          leaderId: teamAssignment?.leader_id || undefined,
          leaderName: leaderProfile?.full_name || undefined,
        };
      });

      // Process leaders data
      const leadersMap = new Map<string, Leader>();
      
      // Add leaders from team assignments
      leaderProfiles?.forEach(leader => {
        if (!leadersMap.has(leader.id)) {
          const teamSize = teamData?.filter(t => t.leader_id === leader.id).length || 0;
          leadersMap.set(leader.id, {
            id: leader.id,
            name: leader.full_name,
            region: leader.region,
            teamSize: teamSize
          });
        }
      });

      // Add leaders who don't have teams yet
      processedAgents
        .filter(agent => agent.position === 'Leader')
        .forEach(agent => {
          if (!leadersMap.has(agent.id)) {
            leadersMap.set(agent.id, {
              id: agent.id,
              name: agent.name,
              region: agent.region,
              teamSize: 0
            });
          }
        });

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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      const { error } = await supabase.rpc('assign_agent_to_leader', {
        p_agent_id: selectedAgent,
        p_leader_id: selectedLeader,
        p_admin_id: user.id
      });

      if (error) throw error;

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
      const { error } = await supabase.rpc('remove_agent_from_team', {
        p_agent_id: agentToUnassign,
        p_admin_id: user.id
      });

      if (error) throw error;

      const agent = agents.find(a => a.id === agentToUnassign);
      
      toast({
        title: 'Success',
        description: `${agent?.name} has been unassigned from the team`
      });
      
      // Refresh data
      await fetchData();
      
      setUnassignDialogOpen(false);
      setAgentToUnassign('');
      
    } catch (error) {
      console.error('Error unassigning agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to unassign agent from team',
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
      // 1) Update profile position back to Mobile Sales
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ position: 'Mobile Sales' })
        .eq('id', leaderToUnpromote);
      if (profileErr) throw profileErr;

      // 2) Remove existing team assignments for this leader
      const { error: teamErr } = await supabase
        .from('leader_teams')
        .delete()
        .eq('leader_id', leaderToUnpromote);
      if (teamErr) throw teamErr;

      toast({ title: 'Leader Unpromoted', description: 'Leader reverted to Mobile Sales and team cleared.' });
      setUnpromoteDialogOpen(false);
      setLeaderToUnpromote('');
      await fetchData();
    } catch (error) {
      console.error('Error unpromoting leader:', error);
      toast({ title: 'Error', description: 'Failed to unpromote leader', variant: 'destructive' });
    } finally {
      setUnpromoting(false);
    }
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading team data...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{leaders.length}</div>
                    <div className="text-xs text-muted-foreground">Leaders</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{agents.filter(a => a.leaderId).length}</div>
                    <div className="text-xs text-muted-foreground">Assigned</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-amber-600" />
                  <div>
                    <div className="text-2xl font-bold">{unassignedAgents.length}</div>
                    <div className="text-xs text-muted-foreground">Unassigned</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Tabs defaultValue="assign" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="promote">Promote Leader</TabsTrigger>
              <TabsTrigger value="leaders">Leaders</TabsTrigger>
              <TabsTrigger value="assign">Assign Agents</TabsTrigger>
              <TabsTrigger value="teams">Teams</TabsTrigger>
            </TabsList>

            {/* Promote Leader */}
            <TabsContent value="promote" className="space-y-4">
              <LeaderAssignmentSection />
            </TabsContent>

            {/* Assign Agents */}
            <TabsContent value="assign" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Team Assignment</CardTitle>
                      <p className="text-sm text-muted-foreground">Assign agents to team leaders</p>
                    </div>
                    <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Assign Agent
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Assign Agent to Team</DialogTitle>
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
                          </div>
                          <div className="space-y-2">
                            <Label>Select Leader</Label>
                            <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a leader" />
                              </SelectTrigger>
                              <SelectContent>
                                {leaders.map(leader => (
                                  <SelectItem key={leader.id} value={leader.id}>
                                    {leader.name} ({leader.region})
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
                              'Assign to Team'
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {unassignedAgents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>All agents are assigned to teams</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {unassignedAgents.length} agent(s) need assignment
                      </p>
                      <div className="space-y-2">
                        {unassignedAgents.map(agent => (
                          <div key={agent.id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <div className="font-medium">{agent.name}</div>
                              <div className="text-sm text-muted-foreground">{agent.region}</div>
                            </div>
                            <Badge variant="outline">Unassigned</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Teams */}
            <TabsContent value="teams" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Teams</CardTitle>
                  <p className="text-sm text-muted-foreground">Current team structure</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {leaders.map(leader => {
                      const teamAgents = agents.filter(agent => agent.leaderId === leader.id);
                      return (
                        <div key={leader.id} className="border rounded-lg p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <Crown className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{leader.name}</h3>
                              <p className="text-sm text-muted-foreground">{leader.region}</p>
                            </div>
                          </div>
                          {teamAgents.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No agents assigned</p>
                          ) : (
                            <div className="space-y-2">
                              {teamAgents.map(agent => (
                                <div key={agent.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                  <div className="flex items-center gap-3">
                                    <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                                      <Users className="h-3 w-3 text-green-600" />
                                    </div>
                                    <div>
                                      <div className="text-sm font-medium">{agent.name}</div>
                                      <div className="text-xs text-muted-foreground">{agent.region}</div>
                                    </div>
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreHorizontal className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem 
                                        onClick={() => handleUnassignClick(agent.id)}
                                        className="text-red-600"
                                      >
                                        <UserMinus className="h-3 w-3 mr-2" />
                                        Unassign from Team
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Leaders */}
            <TabsContent value="leaders" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Leaders</CardTitle>
                  <p className="text-sm text-muted-foreground">Manage existing leaders</p>
                </CardHeader>
                <CardContent>
                  {leaders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No leaders yet</div>
                  ) : (
                    <div className="space-y-3">
                      {leaders.map(l => (
                        <div key={l.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <Crown className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-medium">{l.name}</div>
                              <div className="text-xs text-muted-foreground">{l.region} • Team size: {l.teamSize}</div>
                            </div>
                          </div>
                          <Button variant="outline" onClick={() => handleUnpromoteClick(l.id)}>
                            Unpromote
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      
      {/* Confirmation Dialog */}
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
      
      {/* Unassign Confirmation Dialog */}
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

      {/* Unpromote Leader Confirmation */}
      <AlertDialog open={unpromoteDialogOpen} onOpenChange={setUnpromoteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpromote Leader</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert the leader to Mobile Sales and remove all their team assignments. Continue?
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
        </>
      )}
    </div>
  );
}