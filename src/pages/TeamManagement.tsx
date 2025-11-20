import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UsersRound, UserPlus, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  city: string;
}

interface Team {
  id: string;
  name: string;
  leader: string;
  manager: string;
  city: string;
  members: TeamMember[];
}

const DEMO_TEAMS: Team[] = [
  {
    id: '1',
    name: 'Sales East',
    leader: 'Alice Leader',
    manager: 'Bob Manager',
    city: 'New York',
    members: [
      { id: '6', name: 'Charlie Sales', email: 'sales@acme.com', role: 'mobile_sales', team: 'Sales East', city: 'New York' },
      { id: '7', name: 'David Sales', email: 'david@acme.com', role: 'mobile_sales', team: 'Sales East', city: 'New York' },
      { id: '8', name: 'Emma Sales', email: 'emma@acme.com', role: 'mobile_sales', team: 'Sales East', city: 'New York' },
    ],
  },
  {
    id: '2',
    name: 'Sales West',
    leader: 'Frank Leader',
    manager: 'Grace Manager',
    city: 'Los Angeles',
    members: [
      { id: '9', name: 'Henry Sales', email: 'henry@acme.com', role: 'mobile_sales', team: 'Sales West', city: 'Los Angeles' },
      { id: '10', name: 'Ivy Sales', email: 'ivy@acme.com', role: 'mobile_sales', team: 'Sales West', city: 'Los Angeles' },
    ],
  },
];

export default function TeamManagement() {
  const { toast } = useToast();
  const [teams] = useState<Team[]>(DEMO_TEAMS);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const handleAssign = () => {
    toast({
      title: 'Member assigned',
      description: 'The mobile sales has been assigned to the team.',
    });
    setIsAssignDialogOpen(false);
  };

  const handlePromote = (member: TeamMember, newRole: string) => {
    toast({
      title: 'Member promoted',
      description: `${member.name} has been promoted to ${newRole}.`,
    });
    setIsPromoteDialogOpen(false);
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      manager: 'default',
      team_leader: 'secondary',
      mobile_sales: 'outline',
    };
    
    const labels: Record<string, string> = {
      manager: 'Manager',
      team_leader: 'Team Leader',
      mobile_sales: 'Mobile Sales',
    };

    return <Badge variant={colors[role] as any}>{labels[role]}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <UsersRound className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Team Management</h1>
              <p className="text-muted-foreground">
                Manage teams, assign members, and promote users
              </p>
            </div>
          </div>
          <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Assign Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Mobile Sales to Team</DialogTitle>
                <DialogDescription>
                  Assign a mobile sales representative to a team
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleAssign(); }}>
                <div className="space-y-2">
                  <Label>Select User</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mobile sales" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user1">Charlie Sales</SelectItem>
                      <SelectItem value="user2">New Sales Rep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Select Team</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map(team => (
                        <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Assign</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6">
          {teams.map((team) => (
            <Card key={team.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{team.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{team.city}</p>
                  </div>
                  <Badge>{team.members.length} members</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Manager</p>
                    <p className="font-medium">{team.manager}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Team Leader</p>
                    <p className="font-medium">{team.leader}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <h3 className="font-semibold">Team Members</h3>
                  {team.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                        {getRoleBadge(member.role)}
                      </div>
                      <Dialog open={isPromoteDialogOpen && selectedMember?.id === member.id} 
                              onOpenChange={(open) => {
                                setIsPromoteDialogOpen(open);
                                if (!open) setSelectedMember(null);
                              }}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedMember(member)}
                          >
                            <TrendingUp className="mr-2 h-4 w-4" />
                            Promote
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Promote {member.name}</DialogTitle>
                            <DialogDescription>
                              Promote this user to a higher role
                            </DialogDescription>
                          </DialogHeader>
                          <form className="space-y-4" onSubmit={(e) => { 
                            e.preventDefault(); 
                            const formData = new FormData(e.currentTarget);
                            handlePromote(member, formData.get('newRole') as string);
                          }}>
                            <div className="space-y-2">
                              <Label>Current Role</Label>
                              <Input value={member.role.replace('_', ' ')} disabled />
                            </div>
                            <div className="space-y-2">
                              <Label>Promote To</Label>
                              <Select name="newRole">
                                <SelectTrigger>
                                  <SelectValue placeholder="Select new role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {member.role === 'mobile_sales' && (
                                    <SelectItem value="team_leader">Team Leader</SelectItem>
                                  )}
                                  {(member.role === 'mobile_sales' || member.role === 'team_leader') && (
                                    <SelectItem value="manager">Manager</SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button type="submit">Promote</Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
