import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
  MapPin,
  Plus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SubTeamsSection } from './SubTeamsSection';
import { HierarchicalTeamList } from './HierarchicalTeamList';
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
import { sendNotification } from '@/features/shared/lib/notification.helpers';

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
  subTeamId?: string;
}

interface Leader {
  id: string;
  name: string;
  region: string;
  teamSize: number;
  role: 'team_leader' | 'manager';
  leaderId?: string; // Added to track if assigned to Admin
  teamName?: string; // Team name for manager teams
}


interface Props {
  isManager?: boolean;
  createTeamDialogOpen?: boolean;
  setCreateTeamDialogOpen?: (open: boolean) => void;
  showCreateButton?: boolean;
}

export function TeamManagementTab({
  isManager = false,
  createTeamDialogOpen: externalCreateTeamDialogOpen,
  setCreateTeamDialogOpen: setExternalCreateTeamDialogOpen,
  showCreateButton = true
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignManagerDialogOpen, setAssignManagerDialogOpen] = useState(false);
  const [assignLeaderDialogOpen, setAssignLeaderDialogOpen] = useState(false);
  const [internalCreateTeamDialogOpen, setInternalCreateTeamDialogOpen] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
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
  const [selectedTeamLeaderId, setSelectedTeamLeaderId] = useState<string | null>(null);
  const [isPreselectedManager, setIsPreselectedManager] = useState(false);
  const [newTeamName, setNewTeamName] = useState(''); // New State for Team Name
  const [subTeams, setSubTeams] = useState<any[]>([]); // New State for SubTeams

  const [manageTeamDialogOpen, setManageTeamDialogOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Derived state for dialog control to support both controlled and uncontrolled modes
  const isCreateTeamDialogOpen = externalCreateTeamDialogOpen ?? internalCreateTeamDialogOpen;
  const setCreateTeamDialogOpen = setExternalCreateTeamDialogOpen ?? setInternalCreateTeamDialogOpen;

  // Derived lists for cleaner usage
  const unassignedTeamLeaders = agents.filter(a => !a.leaderId && a.role === 'team_leader');
  const unassignedMobileSales = agents.filter(a => !a.leaderId && a.role === 'mobile_sales');

  // Combined list for the "Unassigned" tab view
  const unassignedAgents = [...unassignedTeamLeaders, ...unassignedMobileSales];

  // Debugging: Check why Manager2 appears
  useEffect(() => {
    console.log('Admin Debug: All Agents:', agents);
    console.log('Admin Debug: Unassigned TLs:', unassignedTeamLeaders);
    console.log('Admin Debug: Unassigned Mobile:', unassignedMobileSales);
  }, [agents, unassignedTeamLeaders]);

  // Assigned agents: mobile_sales and team_leader who have a leader
  const assignedAgents = agents.filter(agent =>
    agent.leaderId &&
    ['mobile_sales', 'team_leader'].includes(agent.role)
  );
  const totalAgents = agents.filter(agent => agent.role === 'mobile_sales').length;

  // Teams Tab: Only show Managers who are explicitly assigned to a team (i.e. assigned to Admin)
  const topLevelLeaders = leaders.filter(leader => leader.role === 'manager' && leader.leaderId);

  // Fetch data from database (with optional silent mode for real-time updates)
  const fetchData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }

      // Build base queries with company filter applied upfront
      const companyFilter = user?.company_id ? { company_id: user.company_id } : {};

      // Execute all queries in parallel for maximum speed
      const [agentsResult, teamResult, subTeamResult] = await Promise.all([
        // Fetch all relevant profiles
        supabase
          .from('profiles')
          .select('id, full_name, email, region, role, status, company_id')
          .in('role', ['mobile_sales', 'team_leader', 'manager'])
          .match(companyFilter)
          .order('created_at', { ascending: false })
          .limit(200),

        // Fetch team assignments (trimmed and capped)
        supabase
          .from('leader_teams')
          .select('agent_id, leader_id, team_name')
          .match(companyFilter)
          .limit(200),

        // Fetch sub-teams overview
        supabase
          .from('sub_teams_overview')
          .select('*')
          .match(companyFilter)
      ]);

      if (agentsResult.error) throw agentsResult.error;
      if (teamResult.error) throw teamResult.error;
      if (subTeamResult.error) throw subTeamResult.error;

      const agentsData = agentsResult.data || [];
      const teamData = teamResult.data || [];
      const subTeamsData = subTeamResult.data || [];

      // Create lookup maps for O(1) access
      const teamMap = new Map(teamData.map(t => [t.agent_id, t.leader_id]));
      const teamNameMap = new Map(teamData.map(t => [t.agent_id, t.team_name]));
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
            role: agent.role as 'team_leader' | 'manager',
            leaderId: agent.leaderId, // Store assignment status
            teamName: teamNameMap.get(agent.id), // Store team name
          });
        }
      }

      setAgents(processedAgents);
      setLeaders(Array.from(leadersMap.values()));
      setSubTeams(subTeamsData);

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
  }, [user?.company_id]);

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

  // Helper to open the correct dialog based on leader role
  const openAssignmentDialog = (leaderId: string, role: string) => {
    setSelectedLeader(leaderId);
    setSelectedAgent('');

    if (role === 'manager') {
      setAssignManagerDialogOpen(true);
    } else if (role === 'team_leader') {
      setAssignLeaderDialogOpen(true);
    }
  };

  // Handler for Manager Team Creation (Assigning Manager to Admin)
  const handleCreateTeam = async () => {
    if (!selectedLeader) {
      toast({ title: 'Error', description: 'Please select a manager', variant: 'destructive' });
      return;
    }

    if (!newTeamName.trim()) {
      toast({ title: 'Error', description: 'Please enter a team name', variant: 'destructive' });
      return;
    }

    setCreatingTeam(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Assign the selected Manager (who is the "agent" here) to the current Admin
      const { data, error } = await supabase.rpc('assign_agent_to_leader', {
        p_agent_id: selectedLeader,
        p_leader_id: user.id,
        p_admin_id: user.id,
        p_team_name: newTeamName
      });

      if (error) throw error;
      if (!data || !data.success) throw new Error(data?.error || 'Failed to create team');

      toast({ title: 'Success', description: 'Manager team created successfully.' });
      await fetchData();
      setCreateTeamDialogOpen(false);
      setSelectedLeader('');
      setNewTeamName('');
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleAssignAgent = async () => {
    if (!selectedAgent || !selectedLeader) {
      toast({
        title: 'Error',
        description: 'Please select both an agent and a leader',
        variant: 'destructive'
      });
      return;
    }

    // Hierarchy Check: If assigning to a Team Leader, that Team Leader must report to a Manager
    const leaderProfile = agents.find(a => a.id === selectedLeader);
    if (leaderProfile?.role === 'team_leader') {
      if (!leaderProfile.leaderId) {
        toast({
          title: 'Hierarchy Violation',
          description: 'Cannot assign agents to this Team Leader. This Team Leader must be assigned to a Manager first.',
          variant: 'destructive'
        });
        return;
      }
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

      // Notify leader and agent (non-blocking)
      try {
        const assignedAgent = agents.find(a => a.id === selectedAgent);
        const assignedLeader = leaders.find(l => l.id === selectedLeader);

        if ((user as any)?.company_id && assignedAgent && assignedLeader) {
          // Notify the mobile sales agent
          await sendNotification({
            userId: assignedAgent.id,
            companyId: (user as any).company_id,
            type: 'system_message',
            title: 'Assigned to Team Leader',
            message: `You have been assigned to ${assignedLeader.name}'s team.`,
            referenceType: 'leader_team',
            referenceId: selectedLeader,
          });

          // Notify the team leader
          await sendNotification({
            userId: assignedLeader.id,
            companyId: (user as any).company_id,
            type: 'system_message',
            title: 'New Team Member Assigned',
            message: `${assignedAgent.name} has been assigned to your team.`,
            referenceType: 'leader_team',
            referenceId: selectedAgent,
          });
        }
      } catch (e) {
        console.warn('Team assignment notification failed (non-blocking):', e);
      }

      // Refresh data
      await fetchData();

      setAssignManagerDialogOpen(false);
      setAssignLeaderDialogOpen(false);
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

      // Notify agent, their leader, and manager (if part of a sub-team) - non-blocking
      try {
        if (agent && (user as any)?.company_id) {
          // Notify the mobile sales agent
          await sendNotification({
            userId: agent.id,
            companyId: (user as any).company_id,
            type: 'system_message',
            title: 'Removed from Team',
            message: `You have been removed from your team leader's team.`,
            referenceType: 'leader_team',
            referenceId: agent.id,
          });

          // Notify the team leader if we know them
          if (agent.leaderId) {
            await sendNotification({
              userId: agent.leaderId,
              companyId: (user as any).company_id,
              type: 'system_message',
              title: 'Team Member Removed',
              message: `${agent.name} has been removed from your team.`,
              referenceType: 'leader_team',
              referenceId: agent.id,
            });
          }

          // Notify the manager overseeing the sub-team, if applicable
          if (agent.subTeamId) {
            const { data: subTeamRow, error: subTeamError } = await supabase
              .from('sub_teams')
              .select('manager_id')
              .eq('id', agent.subTeamId)
              .maybeSingle();

            if (!subTeamError && subTeamRow?.manager_id) {
              await sendNotification({
                userId: subTeamRow.manager_id,
                companyId: (user as any).company_id,
                type: 'system_message',
                title: 'Sub-Team Member Removed',
                message: `${agent.name} has been removed from one of your sub-teams.`,
                referenceType: 'sub_team',
                referenceId: agent.subTeamId,
              });
            }
          }
        }
      } catch (e) {
        console.warn('Team unassignment notification failed (non-blocking):', e);
      }

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
      {/* Create Team Dialog - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={isCreateTeamDialogOpen} onOpenChange={setCreateTeamDialogOpen}>
          <SheetContent side="bottom" className="h-[70vh]">
            <SheetHeader className="pb-4">
              <SheetTitle>Create Manager Team</SheetTitle>
              <SheetDescription>
                Select a Manager to lead this team
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(70vh-180px)]">
              <div className="space-y-4 pr-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Team Name</Label>
                  <Input
                    placeholder="e.g. Alpha Squadron"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select Manager</Label>
                  <p className="text-xs text-muted-foreground mb-2">Choose who will lead this team</p>
                  {leaders.filter(l => l.role === 'manager' && !l.leaderId).length > 0 ? (
                    <div className="space-y-2">
                      {leaders
                        .filter(l => l.role === 'manager' && !l.leaderId)
                        .map(leader => (
                          <div
                            key={leader.id}
                            onClick={() => setSelectedLeader(leader.id)}
                            className={`p-3 border rounded-lg cursor-pointer transition-all ${
                              selectedLeader === leader.id
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-border hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                selectedLeader === leader.id ? 'bg-purple-500' : 'bg-muted'
                              }`}>
                                <Crown className={`h-5 w-5 ${
                                  selectedLeader === leader.id ? 'text-white' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{leader.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{leader.region}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No unassigned managers available</p>
                  )}
                </div>
              </div>
            </ScrollArea>
            <div className="pt-4 border-t">
              <Button
                onClick={handleCreateTeam}
                disabled={creatingTeam || !selectedLeader}
                className="w-full h-12"
              >
                {creatingTeam ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" /> Create Team
                  </>
                )}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
      <Dialog open={isCreateTeamDialogOpen} onOpenChange={setCreateTeamDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Manager Team</DialogTitle>
            <DialogDescription>
              Select a Manager to lead this new team. This will assign the Manager to you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input
                  placeholder="e.g. Alpha Squadron"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Select Manager</Label>
              <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Manager" />
                </SelectTrigger>
                <SelectContent>
                  {/* Show only Unassigned Managers (not yet connected to Admin) */}
                  {leaders
                    .filter(l => l.role === 'manager' && !l.leaderId)
                    .map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.region})
                      </SelectItem>
                    ))}
                  {leaders.filter(l => l.role === 'manager' && !l.leaderId).length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">No unassigned managers available</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateTeam}
              disabled={creatingTeam || !selectedLeader}
              className="w-full"
            >
              {creatingTeam ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" /> Create Team
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {!isManager && showCreateButton && (
        <div className="flex justify-end">
          <Button onClick={() => {
            setSelectedLeader('');
            setCreateTeamDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" /> Create Manager Team
          </Button>
        </div>
      )}

      {/* 1. Assign Team Leader to Manager - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={assignManagerDialogOpen} onOpenChange={setAssignManagerDialogOpen}>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader className="pb-4">
              <SheetTitle>Assign Team Leader</SheetTitle>
              <SheetDescription>
                Select a Team Leader to report to Manager
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(85vh-120px)]">
              <div className="space-y-4 pr-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Select Team Leader</Label>
                    <p className="text-xs text-muted-foreground mb-2">Choose who will report to the manager</p>
                    {unassignedTeamLeaders.length > 0 ? (
                      <div className="space-y-2">
                        {unassignedTeamLeaders.map(agent => (
                          <div
                            key={agent.id}
                            onClick={() => setSelectedAgent(agent.id)}
                            className={`p-3 border rounded-lg cursor-pointer transition-all ${
                              selectedAgent === agent.id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-border hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                selectedAgent === agent.id ? 'bg-blue-500' : 'bg-muted'
                              }`}>
                                <Crown className={`h-5 w-5 ${
                                  selectedAgent === agent.id ? 'text-white' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{agent.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{agent.region}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No unassigned Team Leaders available</p>
                    )}
                  </div>

                  {/* Manager Selection */}
                  <div>
                    <Label className="text-sm font-medium">Manager</Label>
                    {isPreselectedManager ? (
                      <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50 mt-2">
                        <span className="text-sm font-medium">
                          {leaders.find(l => l.id === selectedLeader)?.name || 'Selected Manager'}
                        </span>
                        <Badge variant="secondary" className="text-xs">Fixed</Badge>
                      </div>
                    ) : (
                      <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Choose a Manager" />
                        </SelectTrigger>
                        <SelectContent>
                          {leaders
                            .filter(l => l.role === 'manager')
                            .map(leader => (
                              <SelectItem key={leader.id} value={leader.id}>
                                {leader.name} ({leader.region})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
            <div className="pt-4 border-t">
              <Button
                className="w-full h-12"
                onClick={handleAssignAgent}
                disabled={!selectedAgent || !selectedLeader || assigning}
              >
                {assigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Crown className="h-4 w-4 mr-2" />
                    Assign Team Leader
                  </>
                )}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
      <Dialog open={assignManagerDialogOpen} onOpenChange={setAssignManagerDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Team Leader to Manager</DialogTitle>
            <DialogDescription>
              Select an unassigned Team Leader to report to this Manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Team Leader</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a Team Leader" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedTeamLeaders
                    .map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.region})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {unassignedTeamLeaders.length === 0 && (
                <p className="text-sm text-muted-foreground">No unassigned Team Leaders available</p>
              )}
            </div>

            {/* Manager Selection or Display */}
            <div className="space-y-2">
              <Label>Manager</Label>
              {isPreselectedManager ? (
                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                  <span className="text-sm font-medium">
                    {leaders.find(l => l.id === selectedLeader)?.name || 'Selected Manager'}
                  </span>
                  <Badge variant="secondary" className="text-xs">Fixed</Badge>
                </div>
              ) : (
                <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaders
                      .filter(l => l.role === 'manager')
                      .map(leader => (
                        <SelectItem key={leader.id} value={leader.id}>
                          {leader.name} ({leader.region})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleAssignAgent}
              disabled={!selectedAgent || !selectedLeader || assigning}
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Assign Team Leader
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* 2. Assign Mobile Sales to Team Leader - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={assignLeaderDialogOpen} onOpenChange={setAssignLeaderDialogOpen}>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader className="pb-4">
              <SheetTitle>Assign Mobile Sales</SheetTitle>
              <SheetDescription>
                Select a Mobile Sales agent to join the team
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(85vh-120px)]">
              <div className="space-y-4 pr-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Select Mobile Sales Agent</Label>
                    <p className="text-xs text-muted-foreground mb-2">Choose who will join the team</p>
                    {unassignedMobileSales.length > 0 ? (
                      <div className="space-y-2">
                        {unassignedMobileSales.map(agent => (
                          <div
                            key={agent.id}
                            onClick={() => setSelectedAgent(agent.id)}
                            className={`p-3 border rounded-lg cursor-pointer transition-all ${
                              selectedAgent === agent.id
                                ? 'border-green-500 bg-green-50'
                                : 'border-border hover:border-green-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                selectedAgent === agent.id ? 'bg-green-500' : 'bg-muted'
                              }`}>
                                <Users className={`h-5 w-5 ${
                                  selectedAgent === agent.id ? 'text-white' : 'text-muted-foreground'
                                }`} />
                              </div>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{agent.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">{agent.region}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No unassigned Mobile Sales agents available</p>
                    )}
                  </div>

                  {/* Team Leader Selection */}
                  <div>
                    <Label className="text-sm font-medium">Team Leader</Label>
                    {isPreselectedManager ? (
                      <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50 mt-2">
                        <span className="text-sm font-medium">
                          {leaders.find(l => l.id === selectedLeader)?.name || 'Selected Team Leader'}
                        </span>
                        <Badge variant="secondary" className="text-xs">Fixed</Badge>
                      </div>
                    ) : (
                      <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Choose a Team Leader" />
                        </SelectTrigger>
                        <SelectContent>
                          {leaders
                            .filter(l => l.role === 'team_leader')
                            .map(leader => (
                              <SelectItem key={leader.id} value={leader.id}>
                                {leader.name} ({leader.region})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
            <div className="pt-4 border-t">
              <Button
                className="w-full h-12"
                onClick={handleAssignAgent}
                disabled={!selectedAgent || !selectedLeader || assigning}
              >
                {assigning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Assign Agent
                  </>
                )}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
      <Dialog open={assignLeaderDialogOpen} onOpenChange={setAssignLeaderDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign Mobile Sales to Team Leader</DialogTitle>
            <DialogDescription>
              Select an unassigned Mobile Sales agent to join this team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Mobile Sales Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedMobileSales
                    .map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.region})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {unassignedMobileSales.length === 0 && (
                <p className="text-sm text-muted-foreground">No unassigned Mobile Sales agents available</p>
              )}
            </div>

            {/* Team Leader Selection or Display */}
            <div className="space-y-2">
              <Label>Team Leader</Label>
              {isPreselectedManager ? (
                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                  <span className="text-sm font-medium">
                    {leaders.find(l => l.id === selectedLeader)?.name || 'Selected Team Leader'}
                  </span>
                  <Badge variant="secondary" className="text-xs">Fixed</Badge>
                </div>
              ) : (
                <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a Team Leader" />
                  </SelectTrigger>
                  <SelectContent>
                    {leaders
                      .filter(l => l.role === 'team_leader')
                      .map(leader => (
                        <SelectItem key={leader.id} value={leader.id}>
                          {leader.name} ({leader.region})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleAssignAgent}
              disabled={!selectedAgent || !selectedLeader || assigning}
            >
              {assigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Assign Agent
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                <Crown className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-semibold tracking-tight">{leaders.length}</p>
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground mt-0.5">Leaders & Managers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-2.5 rounded-lg bg-green-50 border border-green-100">
                <UserCheck className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-semibold tracking-tight">{assignedAgents.length}</p>
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground mt-0.5">Assigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <UserX className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-semibold tracking-tight">{unassignedAgents.length}</p>
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground mt-0.5">Unassigned</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 md:p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <Users className="h-4 w-4 md:h-5 md:w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xl md:text-2xl font-semibold tracking-tight">{totalAgents}</p>
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground mt-0.5">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="teams" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50">
          <TabsTrigger value="teams" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-sm md:text-base">Teams</TabsTrigger>
          <TabsTrigger value="unassigned" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-sm md:text-base">
            Unassigned
            {unassignedAgents.length > 0 && (
              <Badge variant="secondary" className="ml-1 md:ml-2 h-4 md:h-5 px-1 md:px-1.5 text-[10px] md:text-xs">
                {unassignedAgents.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-4 mt-6">
          {/* Sub Teams Management Section (Managers Only) */}
          {isManager && (
            <div className="mb-8 p-4 border rounded-lg bg-slate-50">
              <SubTeamsSection leaders={leaders.filter(l => l.role === 'team_leader')} />
            </div>
          )}

          {topLevelLeaders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-20">
                <div className="text-center max-w-md mx-auto">
                  <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
                    <Building2 className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">No Teams Created</h3>
                  <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
                    Get started by promoting a mobile sales agent to team leader or manager
                  </p>
                  {!isManager && (
                    <Dialog>
                      <DialogTrigger asChild>
                        {/* <Button className="shadow-sm">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Promote First Leader
                        </Button> */}
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px]">
                        {/* Leader Assignment Section - Admins Only */}
                        <LeaderAssignmentSection />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {topLevelLeaders.map(leader => {
                const teamAgents = agents.filter(agent => agent.leaderId === leader.id);
                return (
                  <Card key={leader.id} className="hover:shadow-md transition-all duration-200 border-border/50">
                    <CardHeader className="pb-3 p-4 md:p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                          <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-blue-100">
                            <Crown className="h-5 w-5 md:h-6 md:w-6 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-sm md:text-base font-semibold truncate">{leader.name}</CardTitle>
                              {leader.role === 'manager' ? (
                                <Badge variant="default" className="text-[10px] md:text-xs bg-purple-600">
                                  Manager
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] md:text-xs border-blue-500 text-blue-700">
                                  {leader.role?.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>
                            {leader.teamName && (
                              <p className="text-xs text-foreground mt-0.5 truncate font-medium">
                                Team: {leader.teamName}
                              </p>
                            )}
                            <div className="flex items-center gap-1 md:gap-1.5 mt-1">
                              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <p className="text-xs md:text-sm text-muted-foreground truncate">{leader.region}</p>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8 flex-shrink-0">
                              <MoreHorizontal className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedTeamLeaderId(leader.id);
                                setManageTeamDialogOpen(true);
                              }}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Manage Team
                            </DropdownMenuItem>
                            {!isManager && (
                              <DropdownMenuItem
                                onClick={() => handleUnpromoteClick(leader.id)}
                                className="text-orange-600 focus:text-orange-600"
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                {leader.role === 'manager' ? 'Unpromote to Team Leader' : 'Unpromote to Mobile Sales'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 p-4 md:p-6">
                      <div className="space-y-3 md:space-y-4">
                        <div className="flex items-center justify-between py-2">
                          <span className="text-xs md:text-sm font-medium text-muted-foreground">Team Size</span>
                          {/* Total Size Calculation */}
                          {(() => {
                            const mySubTeams = subTeams.filter(st => st.manager_id === leader.id);
                            const totalSubTeamMembers = mySubTeams.reduce((acc, st) => acc + (st.member_ids?.length || 0), 0);
                            const totalSize = teamAgents.length + totalSubTeamMembers;
                            return (
                              <Badge variant="secondary" className="font-medium text-xs md:text-sm">
                                {totalSize} {totalSize === 1 ? 'member' : 'members'}
                              </Badge>
                            );
                          })()}
                        </div>

                        {/* DIRECT REPORTS (Team Leaders) */}
                        {teamAgents.length > 0 ? (
                          <div className="pt-2 md:pt-3 border-t border-border/50">
                            <p className="text-[10px] md:text-xs font-semibold text-muted-foreground mb-2 md:mb-3 uppercase tracking-wide">
                              {leader.role === 'manager' ? 'Team Leaders' : 'Team Members'}
                            </p>
                            <div className="space-y-2">
                              {teamAgents.slice(0, 3).map(agent => (
                                <div key={agent.id} className="flex items-center gap-2 text-xs md:text-sm">
                                  <div className="h-6 w-6 md:h-7 md:w-7 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-green-100">
                                    <Users className="h-3 w-3 md:h-3.5 md:w-3.5 text-white" />
                                  </div>
                                  <span className="font-medium truncate">{agent.name}</span>
                                </div>
                              ))}
                              {teamAgents.length > 3 && (
                                <p className="text-[10px] md:text-xs text-muted-foreground pl-8 md:pl-10 font-medium">
                                  +{teamAgents.length - 3} more {teamAgents.length - 3 === 1 ? 'member' : 'members'}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2 md:pt-3 border-t border-border/50">
                            {/* Only show "No members" if also no sub-teams */}
                            {(!subTeams.some(st => st.manager_id === leader.id)) && (
                              <p className="text-[10px] md:text-xs text-muted-foreground text-center py-2">No team members assigned</p>
                            )}
                          </div>
                        )}

                        {/* SUB TEAMS SECTION */}
                        {(() => {
                          const mySubTeams = subTeams.filter(st => st.manager_id === leader.id);
                          if (mySubTeams.length > 0) {
                            return (
                              <div className="pt-3 border-t border-border/50">
                                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Sub-Teams</p>
                                <div className="space-y-3">
                                  {mySubTeams.map(st => (
                                    <div key={st.id} className="p-2 rounded bg-slate-50 border text-xs">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold text-slate-700">{st.leader_name}'s Team</span>
                                        <Badge variant="outline" className="h-5 px-1 bg-white text-[10px]">
                                          {st.member_ids?.length || 0}
                                        </Badge>
                                      </div>
                                      <div className="truncate text-muted-foreground">
                                        {st.members_details?.map((m: any) => m.name).join(', ') || 'No members'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {/* Assign Button (Only if simple member/leader view needed, but Manage Dialog is preferred generally) */}
                        {teamAgents.length === 0 && !subTeams.some(st => st.manager_id === leader.id) && user?.role !== 'manager' && !isManager && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 text-xs md:text-sm"
                            onClick={() => openAssignmentDialog(leader.id, leader.role as string)}
                          >
                            <UserPlus className="h-3 w-3 md:h-3.5 md:w-3.5 mr-2" />
                            Assign Agent
                          </Button>
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
        < TabsContent value="unassigned" className="space-y-4 mt-6" >
          {
            unassignedAgents.length === 0 ? (
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
                <CardHeader className="pb-3 md:pb-4 p-4 md:p-6">
                  <div>
                    <CardTitle className="text-base md:text-lg font-semibold">Unassigned Agents</CardTitle>
                    <CardDescription className="mt-1 md:mt-1.5 text-xs md:text-sm">
                      {unassignedAgents.length} agent{unassignedAgents.length !== 1 ? 's' : ''} waiting for team assignment
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  <div className="space-y-2">
                    {unassignedAgents.map(agent => (
                      <div
                        key={agent.id}
                        className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 border rounded-lg hover:bg-muted/30 hover:border-border transition-all duration-150 group gap-3"
                      >
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
                          <div className="h-10 w-10 md:h-11 md:w-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-amber-100">
                            {agent.role === 'team_leader' ? (
                              <Crown className="h-4 w-4 md:h-5 md:w-5 text-white" />
                            ) : (
                              <Users className="h-4 w-4 md:h-5 md:w-5 text-white" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm text-foreground">{agent.name}</p>
                              {agent.role === 'team_leader' && (
                                <Badge variant="outline" className="text-[10px] md:text-xs border-blue-500 text-blue-700 px-1.5 py-0 h-4 md:h-5">
                                  Team Leader
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 mt-1 md:mt-1.5">
                              <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                                <Mail className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate max-w-[250px] md:max-w-[200px]">{agent.email}</span>
                              </div>
                              <div className="flex items-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                <span>{agent.region}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3 ml-13 md:ml-0">
                          <Badge variant="outline" className="text-[10px] md:text-xs text-amber-600 border-amber-300 bg-amber-50 font-medium">
                            Unassigned
                          </Badge>
                          {!isManager && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="shadow-sm flex-1 md:flex-none text-xs md:text-sm h-8 md:h-9"
                              onClick={() => {
                                setIsPreselectedManager(false);
                                setSelectedAgent(agent.id);
                                setSelectedLeader(''); // Reset leader so user must select one

                                if (agent.role === 'team_leader') {
                                  setAssignManagerDialogOpen(true);
                                } else {
                                  setAssignLeaderDialogOpen(true);
                                }
                              }}
                            >
                              <UserPlus className="h-3 w-3 md:h-3.5 md:w-3.5 mr-2" />
                              Assign
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          }
        </TabsContent >
      </Tabs >

      {/* Confirmation Dialogs */}
      < AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen} >
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
      </AlertDialog >

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

      {/* Manage Team Dialog - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={manageTeamDialogOpen} onOpenChange={setManageTeamDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh]">
            <SheetHeader className="pb-4">
              <SheetTitle className="text-left">
                Manage Team
              </SheetTitle>
              <SheetDescription className="text-left">
                {leaders.find(l => l.id === selectedTeamLeaderId)?.name}'s Team
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="h-[calc(90vh-160px)] pr-4">
              {selectedTeamLeaderId && (
                <HierarchicalTeamList
                  managerId={selectedTeamLeaderId}
                  agents={agents}
                  onRemoveFromTeam={handleUnassignClick}
                  isManagerView={isManager}
                  onAssignToLeader={(leaderId) => {
                    setManageTeamDialogOpen(false);
                    setIsPreselectedManager(true);
                    // Find role to determine correct dialog
                    const role = leaders.find(l => l.id === leaderId)?.role || agents.find(a => a.id === leaderId)?.role || 'team_leader';
                    openAssignmentDialog(leaderId, role);
                  }}
                />
              )}
            </ScrollArea>

            <div className="pt-4 border-t flex flex-col gap-2">
              {!isManager && selectedTeamLeaderId && (
                <Button
                  className="w-full h-11"
                  onClick={() => {
                    setManageTeamDialogOpen(false);
                    setIsPreselectedManager(true);
                    const role = leaders.find(l => l.id === selectedTeamLeaderId)?.role || 'manager';
                    openAssignmentDialog(selectedTeamLeaderId, role);
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign to Manager
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => setManageTeamDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
      <Dialog open={manageTeamDialogOpen} onOpenChange={setManageTeamDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Manage Team: {leaders.find(l => l.id === selectedTeamLeaderId)?.name}
            </DialogTitle>
            <DialogDescription>
              View and manage all members assigned to this team.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {selectedTeamLeaderId && (
              <HierarchicalTeamList
                managerId={selectedTeamLeaderId}
                agents={agents}
                onRemoveFromTeam={handleUnassignClick}
                isManagerView={isManager}
                onAssignToLeader={(leaderId) => {
                  setManageTeamDialogOpen(false);
                  setIsPreselectedManager(true);
                  // Find role to determine correct dialog
                  const role = leaders.find(l => l.id === leaderId)?.role || agents.find(a => a.id === leaderId)?.role || 'team_leader';
                  openAssignmentDialog(leaderId, role);
                }}
              />
            )}
          </div>

          <div className="pt-4 border-t flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setManageTeamDialogOpen(false)}
            >
              Close
            </Button>
            {/* Global Add Member (Assign to Main Manager) - Optional, keeping for flexibility */}
            {!isManager && selectedTeamLeaderId && (
              <Button
                onClick={() => {
                  setManageTeamDialogOpen(false);
                  setIsPreselectedManager(true);
                  const role = leaders.find(l => l.id === selectedTeamLeaderId)?.role || 'manager';
                  openAssignmentDialog(selectedTeamLeaderId, role);
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Assign to Manager
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      )}
    </div >
  );
}
