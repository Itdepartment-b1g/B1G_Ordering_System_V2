import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users as UsersIcon, Plus, Edit, Trash2, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  city: string;
  team: string;
  createdAt: string;
}

const DEMO_USERS: User[] = [
  {
    id: '2',
    name: 'John Doe',
    email: 'superadmin@acme.com',
    role: 'super_admin',
    status: 'active',
    city: 'All',
    team: 'Management',
    createdAt: '2024-01-01',
  },
  {
    id: '3',
    name: 'Jane Smith',
    email: 'admin@acme.com',
    role: 'admin',
    status: 'active',
    city: 'All',
    team: 'Management',
    createdAt: '2024-01-05',
  },
  {
    id: '4',
    name: 'Bob Manager',
    email: 'manager@acme.com',
    role: 'manager',
    status: 'active',
    city: 'New York',
    team: 'Sales East',
    createdAt: '2024-01-10',
  },
  {
    id: '5',
    name: 'Alice Leader',
    email: 'teamlead@acme.com',
    role: 'team_leader',
    status: 'active',
    city: 'New York',
    team: 'Sales East',
    createdAt: '2024-01-15',
  },
  {
    id: '6',
    name: 'Charlie Sales',
    email: 'sales@acme.com',
    role: 'mobile_sales',
    status: 'active',
    city: 'New York',
    team: 'Sales East',
    createdAt: '2024-01-20',
  },
];

export default function UsersPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>(DEMO_USERS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'default',
      admin: 'default',
      manager: 'secondary',
      team_leader: 'secondary',
      mobile_sales: 'outline',
    };
    
    const labels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Admin',
      manager: 'Manager',
      team_leader: 'Team Leader',
      mobile_sales: 'Mobile Sales',
    };

    return <Badge variant={colors[role] as any}>{labels[role]}</Badge>;
  };

  const handleResetPassword = (userId: string) => {
    toast({
      title: 'Password reset',
      description: 'A password reset link has been sent to the user.',
    });
  };

  const handleDelete = (userId: string) => {
    setUsers(users.filter(u => u.id !== userId));
    toast({
      title: 'User deleted',
      description: 'The user has been removed from the system.',
      variant: 'destructive',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <UsersIcon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Users</h1>
              <p className="text-muted-foreground">
                Manage user accounts and permissions
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user account
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="user@acme.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="team_leader">Team Leader</SelectItem>
                        <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new-york">New York</SelectItem>
                        <SelectItem value="los-angeles">Los Angeles</SelectItem>
                        <SelectItem value="chicago">Chicago</SelectItem>
                        <SelectItem value="san-francisco">San Francisco</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales-east">Sales East</SelectItem>
                      <SelectItem value="sales-west">Sales West</SelectItem>
                      <SelectItem value="sales-central">Sales Central</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Initial Password</Label>
                  <Input type="password" placeholder="Create secure password" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create User</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {users.map((user) => (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{user.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex gap-2">
                    {getRoleBadge(user.role)}
                    <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                      {user.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="grid grid-cols-3 gap-8">
                    <div>
                      <p className="text-sm text-muted-foreground">City</p>
                      <p className="font-medium">{user.city}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Team</p>
                      <p className="font-medium">{user.team}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Joined</p>
                      <p className="font-medium">{user.createdAt}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetPassword(user.id)}
                    >
                      <Key className="mr-2 h-4 w-4" />
                      Reset
                    </Button>
                    {user.role !== 'super_admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(user.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
