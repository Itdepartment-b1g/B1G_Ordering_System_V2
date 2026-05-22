import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Crown, Mail, Users, UserCheck, UserPlus, Loader2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  director_id?: string;
}

interface DirectorWithKAMs {
  id: string;
  full_name: string;
  email: string;
  kams: User[];
}

export function KeyAccountTeamManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [directors, setDirectors] = useState<DirectorWithKAMs[]>([]);
  const [unassignedKAMs, setUnassignedKAMs] = useState<User[]>([]);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [assignKAMOpen, setAssignKAMOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'sales_director' | 'key_account_manager'>('sales_director');
  const [selectedDirector, setSelectedDirector] = useState('');
  const [selectedKAM, setSelectedKAM] = useState('');
  const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
  const [kamToUnassign, setKamToUnassign] = useState<{ id: string; name: string; directorName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [unassigning, setUnassigning] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch directors and KAMs
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setFetching(true);
    try {
      // Fetch all users with Key Account roles
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', user?.company_id)
        .in('role', ['sales_director', 'key_account_manager']);

      if (error) throw error;

      // Fetch KAM-Director assignments
      const { data: assignments } = await supabase
        .from('kam_director_assignments')
        .select('kam_id, director_id')
        .eq('company_id', user?.company_id);

      // Build assignment map
      const kamToDirectorMap = new Map<string, string>();
      assignments?.forEach(a => {
        kamToDirectorMap.set(a.kam_id, a.director_id);
      });

      // Organize users
      const directorsList: DirectorWithKAMs[] = [];
      const kamsList: User[] = [];

      users?.forEach(u => {
        if (u.role === 'sales_director') {
          directorsList.push({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            kams: []
          });
        } else {
          kamsList.push({
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            director_id: kamToDirectorMap.get(u.id)
          });
        }
      });

      // Assign KAMs to their directors
      kamsList.forEach(kam => {
        if (kam.director_id) {
          const director = directorsList.find(d => d.id === kam.director_id);
          if (director) {
            director.kams.push(kam);
          }
        }
      });

      setDirectors(directorsList);
      setUnassignedKAMs(kamsList.filter(k => !k.director_id));
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setFetching(false);
    }
  };

  // Create new user (Director or KAM)
  const handleCreateUser = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-key-account-user', {
        body: {
          full_name: newUserName,
          email: newUserEmail,
          password: 'tempPassword123!',
          role: newUserRole,
          company_id: user?.company_id,
          created_by: user?.id,
        },
      });

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: `${newUserRole === 'sales_director' ? 'Sales Director' : 'Key Account Manager'} created successfully` 
      });
      setCreateUserOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      fetchUsers();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const openUnassignDialog = (kam: User, directorName: string) => {
    setKamToUnassign({ id: kam.id, name: kam.full_name, directorName });
    setUnassignDialogOpen(true);
  };

  const handleUnassignKAM = async () => {
    if (!kamToUnassign || !user?.company_id) return;

    setUnassigning(true);
    try {
      const { error } = await supabase
        .from('kam_director_assignments')
        .delete()
        .eq('kam_id', kamToUnassign.id)
        .eq('company_id', user.company_id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `${kamToUnassign.name} has been unassigned from ${kamToUnassign.directorName}`,
      });
      setUnassignDialogOpen(false);
      setKamToUnassign(null);
      fetchUsers();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setUnassigning(false);
    }
  };

  // Assign KAM to Sales Director
  const handleAssignKAM = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('kam_director_assignments').insert({
        director_id: selectedDirector,
        kam_id: selectedKAM,
        company_id: user?.company_id,
        assigned_by: user?.id,
        assigned_at: new Date().toISOString(),
      });

      if (error) {
        if (error.code === '23505') {
          toast({ variant: 'destructive', title: 'Error', description: 'This KAM is already assigned to a Director' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Success', description: 'KAM assigned to Director successfully' });
        setAssignKAMOpen(false);
        setSelectedDirector('');
        setSelectedKAM('');
        fetchUsers();
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sales Directors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{directors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Key Account Managers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {directors.reduce((acc, d) => acc + d.kams.length, 0) + unassignedKAMs.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unassigned KAMs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{unassignedKAMs.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        {unassignedKAMs.length > 0 && directors.length > 0 && (
          <Button onClick={() => setAssignKAMOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign KAM to Director
          </Button>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Key Account User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as 'sales_director' | 'key_account_manager')}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales_director">Sales Director</SelectItem>
                  <SelectItem value="key_account_manager">Key Account Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Temporary password: <strong>tempPassword123!</strong>
              <br />
              User must change on first login.
            </div>
            <Button 
              onClick={handleCreateUser} 
              disabled={loading || !newUserName || !newUserEmail}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Create User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign KAM to Director Dialog */}
      <Dialog open={assignKAMOpen} onOpenChange={setAssignKAMOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Assign KAM to Sales Director</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="director">Sales Director</Label>
              <Select value={selectedDirector} onValueChange={setSelectedDirector}>
                <SelectTrigger id="director">
                  <SelectValue placeholder="Select Director" />
                </SelectTrigger>
                <SelectContent>
                  {directors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kam">Key Account Manager</Label>
              <Select value={selectedKAM} onValueChange={setSelectedKAM}>
                <SelectTrigger id="kam">
                  <SelectValue placeholder="Select KAM" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedKAMs.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleAssignKAM} 
              disabled={loading || !selectedDirector || !selectedKAM}
              className="w-full"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              Assign KAM to Director
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={unassignDialogOpen}
        onOpenChange={(open) => {
          setUnassignDialogOpen(open);
          if (!open) setKamToUnassign(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign Key Account Manager</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{kamToUnassign?.name}</strong> from{' '}
              <strong>{kamToUnassign?.directorName}</strong>&apos;s team? The KAM will appear in the
              Unassigned KAMs tab and can be assigned to another Director later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleUnassignKAM();
              }}
              disabled={unassigning}
              className="bg-red-600 hover:bg-red-700"
            >
              {unassigning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Unassigning...
                </>
              ) : (
                'Unassign KAM'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Team Tabs */}
      <Tabs defaultValue="teams" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50">
          <TabsTrigger value="teams" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Teams
          </TabsTrigger>
          <TabsTrigger value="unassigned" className="data-[state=active]:bg-background data-[state=active]:shadow-sm">
            Unassigned KAMs
            {unassignedKAMs.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                {unassignedKAMs.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-4 mt-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Sales Directors & Their KAMs
          </h3>

          {directors.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No Sales Directors created yet. Create your first Director to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 max-w-3xl">
              {directors.map((director) => (
                <Card key={director.id} className="min-h-[260px]">
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm ring-4 ring-blue-100">
                        <Crown className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="truncate text-lg">{director.full_name}</CardTitle>
                          <Badge className="bg-purple-600 hover:bg-purple-600">Sales Director</Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium">Team: {director.full_name}'s Team</p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {director.email}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-muted-foreground">Team Size</p>
                      <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">
                        {director.kams.length} KAM{director.kams.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="border-t pt-4">
                      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Assigned KAMs
                      </p>
                      {director.kams.length > 0 ? (
                        <div className="space-y-3">
                          {director.kams.map((kam) => (
                            <div
                              key={kam.id}
                              className="flex items-center justify-between rounded-md border bg-muted/30 p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{kam.full_name}</p>
                                <p className="truncate text-xs text-muted-foreground">{kam.email}</p>
                              </div>
                              <div className="ml-3 flex shrink-0 items-center gap-2">
                                <Badge variant="outline" className="rounded-full">
                                  KAM
                                </Badge>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Unassign from director"
                                  onClick={() => openUnassignDialog(kam, director.full_name)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                          No KAMs assigned to this Director yet.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unassigned" className="space-y-4 mt-6">
          {unassignedKAMs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <p className="font-medium">All KAMs are assigned</p>
                <p className="text-sm text-muted-foreground mt-1">
                  There are no Key Account Managers waiting for a Sales Director assignment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-600">
                  <UserPlus className="h-5 w-5" />
                  Unassigned KAMs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unassignedKAMs.map((kam) => (
                  <div
                    key={kam.id}
                    className="flex items-center justify-between rounded-md bg-amber-50 p-3"
                  >
                    <div>
                      <span className="text-sm font-medium">{kam.full_name}</span>
                      <p className="text-xs text-muted-foreground">{kam.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedKAM(kam.id);
                        setAssignKAMOpen(true);
                      }}
                    >
                      Assign to Director
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
