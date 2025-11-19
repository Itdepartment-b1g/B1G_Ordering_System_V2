import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Save, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Permission {
  id: string;
  label: string;
  description: string;
}

const PERMISSIONS: Permission[] = [
  { id: 'view_dashboard', label: 'View Dashboard', description: 'Access to main dashboard' },
  { id: 'view_orders', label: 'View Orders', description: 'View all orders' },
  { id: 'create_orders', label: 'Create Orders', description: 'Create new orders' },
  { id: 'approve_orders', label: 'Approve Orders', description: 'Approve pending orders' },
  { id: 'delete_orders', label: 'Delete Orders', description: 'Delete orders' },
  { id: 'view_inventory', label: 'View Inventory', description: 'View inventory items' },
  { id: 'manage_inventory', label: 'Manage Inventory', description: 'Add, edit, delete inventory' },
  { id: 'allocate_inventory', label: 'Allocate Inventory', description: 'Allocate inventory to teams' },
  { id: 'view_clients', label: 'View Clients', description: 'View all clients' },
  { id: 'manage_clients', label: 'Manage Clients', description: 'Add, edit, delete clients' },
  { id: 'approve_clients', label: 'Approve Clients', description: 'Approve new clients' },
  { id: 'view_analytics', label: 'View Analytics', description: 'Access analytics and reports' },
  { id: 'view_users', label: 'View Users', description: 'View all users' },
  { id: 'manage_users', label: 'Manage Users', description: 'Add, edit, delete users' },
  { id: 'manage_permissions', label: 'Manage Permissions', description: 'Configure role permissions' },
  { id: 'view_reports', label: 'View Reports', description: 'Access reports' },
  { id: 'export_data', label: 'Export Data', description: 'Export data to files' },
];

const DEFAULT_PERMISSIONS = {
  admin: [
    'view_dashboard', 'view_orders', 'create_orders', 'approve_orders',
    'view_inventory', 'manage_inventory', 'allocate_inventory',
    'view_clients', 'manage_clients', 'approve_clients',
    'view_analytics', 'view_users', 'manage_users', 'view_reports', 'export_data'
  ],
  manager: [
    'view_dashboard', 'view_orders', 'create_orders', 'approve_orders',
    'view_inventory', 'allocate_inventory',
    'view_clients', 'manage_clients',
    'view_analytics', 'view_reports'
  ],
  team_leader: [
    'view_dashboard', 'view_orders', 'create_orders', 'approve_orders',
    'view_inventory', 'allocate_inventory',
    'view_clients', 'manage_clients'
  ],
  mobile_sales: [
    'view_dashboard', 'view_orders', 'create_orders',
    'view_inventory', 'view_clients', 'manage_clients'
  ],
};

export default function Permissions() {
  const { toast } = useToast();
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(DEFAULT_PERMISSIONS);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [isAddRoleDialogOpen, setIsAddRoleDialogOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  const handlePermissionToggle = (role: string, permissionId: string) => {
    setRolePermissions(prev => {
      const current = prev[role] || [];
      const updated = current.includes(permissionId)
        ? current.filter(p => p !== permissionId)
        : [...current, permissionId];
      return { ...prev, [role]: updated };
    });
  };

  const handleSave = (role: string) => {
    toast({
      title: 'Permissions saved',
      description: `${role} permissions have been updated successfully.`,
    });
  };

  const handleAddRole = () => {
    if (newRoleName.trim()) {
      const roleKey = newRoleName.toLowerCase().replace(/\s+/g, '_');
      setCustomRoles([...customRoles, roleKey]);
      setRolePermissions({ ...rolePermissions, [roleKey]: [] });
      setNewRoleName('');
      setIsAddRoleDialogOpen(false);
      toast({
        title: 'Role added',
        description: `${newRoleName} has been created successfully.`,
      });
    }
  };

  const handleDeleteRole = (role: string) => {
    setCustomRoles(customRoles.filter(r => r !== role));
    const newPermissions = { ...rolePermissions };
    delete newPermissions[role];
    setRolePermissions(newPermissions);
    toast({
      title: 'Role deleted',
      description: 'The custom role has been removed.',
      variant: 'destructive',
    });
  };

  const RolePermissionsTab = ({ role, roleLabel, canDelete = false }: { role: string; roleLabel: string; canDelete?: boolean }) => (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-2">{roleLabel} Permissions</h3>
          <p className="text-sm text-muted-foreground">
            Configure what {roleLabel.toLowerCase()} users can see and do in the system.
          </p>
        </div>
        {canDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDeleteRole(role)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Role
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {PERMISSIONS.map((permission) => (
          <Card key={permission.id}>
            <CardContent className="flex items-start space-x-4 pt-6">
              <Checkbox
                id={`${role}-${permission.id}`}
                checked={rolePermissions[role]?.includes(permission.id)}
                onCheckedChange={() => handlePermissionToggle(role, permission.id)}
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={`${role}-${permission.id}`}
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  {permission.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {permission.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => handleSave(role)}>
          <Save className="mr-2 h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Roles & Permissions</h1>
            <p className="text-muted-foreground">
              Manage permissions for different roles in your organization
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Configure Role Permissions</CardTitle>
                <CardDescription>
                  Select the permissions for each role. Changes will take effect immediately.
                </CardDescription>
              </div>
              <Dialog open={isAddRoleDialogOpen} onOpenChange={setIsAddRoleDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Custom Role
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Custom Role</DialogTitle>
                    <DialogDescription>
                      Create a new role for your organization
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="roleName">Role Name</Label>
                      <Input
                        id="roleName"
                        placeholder="e.g., Regional Manager"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddRoleDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddRole}>
                        Add Role
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="admin" className="w-full">
              <TabsList className={`grid w-full grid-cols-${Math.min(4 + customRoles.length, 6)}`}>
                <TabsTrigger value="admin">Admin</TabsTrigger>
                <TabsTrigger value="manager">Manager</TabsTrigger>
                <TabsTrigger value="team_leader">Team Leader</TabsTrigger>
                <TabsTrigger value="mobile_sales">Mobile Sales</TabsTrigger>
                {customRoles.map(role => (
                  <TabsTrigger key={role} value={role}>
                    {role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="admin" className="mt-6">
                <RolePermissionsTab role="admin" roleLabel="Admin" />
              </TabsContent>
              <TabsContent value="manager" className="mt-6">
                <RolePermissionsTab role="manager" roleLabel="Manager" />
              </TabsContent>
              <TabsContent value="team_leader" className="mt-6">
                <RolePermissionsTab role="team_leader" roleLabel="Team Leader" />
              </TabsContent>
              <TabsContent value="mobile_sales" className="mt-6">
                <RolePermissionsTab role="mobile_sales" roleLabel="Mobile Sales" />
              </TabsContent>
              {customRoles.map(role => (
                <TabsContent key={role} value={role} className="mt-6">
                  <RolePermissionsTab
                    role={role}
                    roleLabel={role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    canDelete
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
