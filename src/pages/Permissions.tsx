import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const RolePermissionsTab = ({ role, roleLabel }: { role: string; roleLabel: string }) => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">{roleLabel} Permissions</h3>
        <p className="text-sm text-muted-foreground">
          Configure what {roleLabel.toLowerCase()} users can see and do in the system.
        </p>
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
            <CardTitle>Configure Role Permissions</CardTitle>
            <CardDescription>
              Select the permissions for each role. Changes will take effect immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="admin" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="admin">Admin</TabsTrigger>
                <TabsTrigger value="manager">Manager</TabsTrigger>
                <TabsTrigger value="team_leader">Team Leader</TabsTrigger>
                <TabsTrigger value="mobile_sales">Mobile Sales</TabsTrigger>
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
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
