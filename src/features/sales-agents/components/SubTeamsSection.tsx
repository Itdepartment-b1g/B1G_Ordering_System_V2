import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Users, Trash2, Edit, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useManagerSubTeams } from '@/features/manager/hooks/useManagerData';
import { createSubTeam, deleteSubTeam } from '@/features/manager/api/subTeams';
import { useAuth } from '@/features/auth';
import type { SubTeam } from '@/features/manager/api/subTeams';

interface Props {
    leaders: any[]; // Pass available leaders to assign
}

export function SubTeamsSection({ leaders }: Props) {
    const { user } = useAuth();
    const { data: subTeams, isLoading, refetch } = useManagerSubTeams();
    const { toast } = useToast();
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [selectedLeader, setSelectedLeader] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter leaders who are NOT already assigned to a sub-team
    // Note: This logic depends on whether we allow a leader to lead multiple teams (schema says unique)
    const availableLeaders = leaders.filter(l =>
        !subTeams?.some(st => st.leader_id === l.id)
    );

    const handleCreateTeam = async () => {
        if (!newTeamName || !selectedLeader || !user?.company_id) return;

        setIsSubmitting(true);
        try {
            await createSubTeam(newTeamName, user.id, selectedLeader, user.company_id);
            toast({
                title: "Success",
                description: "Sub-team created successfully",
            });
            setCreateDialogOpen(false);
            setNewTeamName('');
            setSelectedLeader('');
            refetch(); // Refresh list
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to create sub-team",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTeam = async (id: string) => {
        if (!confirm("Are you sure? This will disband the sub-team.")) return;
        try {
            await deleteSubTeam(id);
            toast({ title: "Success", description: "Sub-team disbanded" });
            refetch();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    if (isLoading) return <div>Loading sub-teams...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium">Sub-Teams Management</h3>
                    <p className="text-sm text-muted-foreground">Create teams and assign Team Leaders</p>
                </div>
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Create Sub-Team
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Sub-Team</DialogTitle>
                            <DialogDescription>Define a new team and assign a Team Leader.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Team Name</Label>
                                <Input
                                    placeholder="e.g. North Region Squad"
                                    value={newTeamName}
                                    onChange={(e) => setNewTeamName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Team Leader</Label>
                                <Select value={selectedLeader} onValueChange={setSelectedLeader}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a leader" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableLeaders.map(l => (
                                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                                        ))}
                                        {availableLeaders.length === 0 && (
                                            <div className="p-2 text-sm text-muted-foreground text-center">No unassigned leaders available</div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleCreateTeam} disabled={isSubmitting || !newTeamName || !selectedLeader}>
                                {isSubmitting ? 'Creating...' : 'Create Team'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subTeams?.map((team) => (
                    <Card key={team.id} className="relative">
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-base">{team.name}</CardTitle>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTeam(team.id)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                            <CardDescription className="flex items-center gap-2">
                                <Crown className="h-3 w-3" />
                                {team.leader_name}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-sm text-muted-foreground">
                                Managed by you
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {subTeams?.length === 0 && (
                    <div className="col-span-full text-center py-10 border border-dashed rounded-lg text-muted-foreground">
                        No sub-teams created yet.
                    </div>
                )}
            </div>
        </div>
    );
}
