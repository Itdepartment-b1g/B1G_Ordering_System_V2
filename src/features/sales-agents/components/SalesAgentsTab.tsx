import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, UserPlus, Loader2, Package, Eye, Rewind, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { formatPhoneNumber } from '@/lib/utils';
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

import { UserRole } from '@/types/database.types';

interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: 'active' | 'inactive';

  role?: UserRole;
  totalSales: number;
  ordersCount: number;
}

interface Variant {
  id: string;
  name: string;
  variant_type: 'flavor' | 'battery';
  stock: number;
  price: number;
}

export function SalesAgentsTab() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusConfirmDialogOpen, setStatusConfirmDialogOpen] = useState(false);
  const [editConfirmDialogOpen, setEditConfirmDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [agentToReset, setAgentToReset] = useState<SalesAgent | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SalesAgent | null>(null);
  const [viewingAgent, setViewingAgent] = useState<SalesAgent | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<SalesAgent | null>(null);
  const [agentToChangeStatus, setAgentToChangeStatus] = useState<SalesAgent | null>(null);
  const [newStatus, setNewStatus] = useState<boolean>(true);
  const [selectedAgentForAllocation, setSelectedAgentForAllocation] = useState<SalesAgent | null>(null);
  const [agentInventory, setAgentInventory] = useState<Variant[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    role: 'mobile_sales' as UserRole
  });
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    status: 'active' as 'active' | 'inactive'
  });



  // City input state for adding cities
  const [currentCityInput, setCurrentCityInput] = useState('');
  const [editCityInput, setEditCityInput] = useState('');

  const { toast } = useToast();

  const filteredAgents = agents.filter(agent => {
    // Status filter
    if (statusFilter !== 'all' && agent.status !== statusFilter) return false;

    // Search filter
    return agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.cities.some(city => city.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const fetchAgents = async () => {
    try {
      setLoading(true);

      // Fetch agents with their sales data
      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          phone,
          region,
          city,
          status,
          role
        `)
        .eq('role', 'sales_agent')
        .order('created_at', { ascending: false });

      if (agentsError) throw agentsError;

      // Fetch sales data for each agent
      const agentsWithSales = await Promise.all(
        (agentsData || []).map(async (agent: any) => {
          // Get total sales and orders count
          const { data: salesData, error: salesError } = await supabase
            .from('client_orders')
            .select('total_amount, status')
            .eq('agent_id', agent.id)
            .eq('status', 'approved');

          if (salesError) {
            console.error('Error fetching sales data for agent', agent.id, salesError);
          }

          const totalSales = (salesData || []).reduce((sum: number, order: any) => {
            const amount = typeof order.total_amount === 'number' ? order.total_amount : parseFloat(String(order.total_amount)) || 0;
            return sum + amount;
          }, 0);
          const ordersCount = salesData?.length || 0;

          return {
            id: agent.id,
            name: agent.full_name,
            email: agent.email,
            phone: agent.phone || '',
            region: agent.region || '',
            cities: agent.city ? (Array.isArray(agent.city) ? agent.city : agent.city.split(',').map(c => c.trim()).filter(c => c)) : [],
            status: agent.status || 'active',
            role: agent.role || 'sales_agent',
            totalSales,
            ordersCount
          };
        })
      );

      setAgents(agentsWithSales);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sales agents',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleStatusToggle = (agent: SalesAgent, newStatus: boolean) => {
    setAgentToChangeStatus(agent);
    setNewStatus(newStatus);
    setStatusConfirmDialogOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!agentToChangeStatus) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus ? 'active' : 'inactive' })
        .eq('id', agentToChangeStatus.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `User status set to ${newStatus ? 'active' : 'inactive'} successfully`
      });

      fetchAgents();
      setStatusConfirmDialogOpen(false);
      setAgentToChangeStatus(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive'
      });
    }
  };

  const handleOpenView = (agent: SalesAgent) => {
    setViewingAgent(agent);
    setViewDialogOpen(true);
  };

  const handleOpenEdit = (agent: SalesAgent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      email: agent.email,
      phone: agent.phone || '',
      region: agent.region || '',
      cities: agent.cities || [],
      status: agent.status || 'active'
    });
    setEditDialogOpen(true);
  };

  const handleOpenDelete = (agent: SalesAgent) => {
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  const handleResetPassword = (agent: SalesAgent) => {
    setAgentToReset(agent);
    setResetPasswordDialogOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!agentToReset) return;

    setResettingPassword(true);
    try {
      // Get current user info ONCE to avoid multiple auth calls that might affect session
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id || '00000000-0000-0000-0000-000000000000';

      // Get admin name ONCE
      let adminName = 'Admin';
      if (userId && userId !== '00000000-0000-0000-0000-000000000000') {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .single();
        adminName = profileData?.full_name || 'Admin';
      }

      // Use the existing Edge Function for password reset
      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-agent', {
        body: {
          email: agentToReset.email,
          password: 'tempPassword123!',
          full_name: agentToReset.name,
          role: 'sales_agent',
          reset_password: true
        }
      });

      if (fnErr) {
        console.error('Edge Function error:', fnErr);
        throw new Error(fnErr.message || 'Edge Function failed');
      }

      if (!fnRes?.success && !fnRes?.userId) {
        throw new Error('Password reset failed - no success confirmation');
      }

      // Verify admin session is still valid after the call
      const { data: { session: sessionAfter } } = await supabase.auth.getSession();
      if (!sessionAfter || sessionAfter.user?.id !== userId) {
        console.warn('Admin session was invalidated after password reset. This should not happen.');
        // Don't throw error, just log it - the password reset was successful
        // The auth context will handle the logout if needed
      }

      // Log password reset event using cached values
      const { error: logError } = await supabase
        .from('events')
        .insert({
          actor_id: userId,
          actor_role: 'admin',
          performed_by: adminName,
          action: 'reset_password',
          target_type: 'profile',
          target_id: agentToReset.id,
          details: {
            actor: adminName,
            action_performed: 'reset_password',
            target_name: agentToReset.name,
            message: `Password reset for ${agentToReset.name} to tempPassword123!`,
            reset_target: agentToReset.name,
            reset_target_email: agentToReset.email
          },
          target_label: agentToReset.name,
          actor_label: adminName
        });

      if (logError) {
        console.error('Error logging password reset:', logError);
      }

      toast({
        title: 'Success',
        description: `Password for ${agentToReset.name} has been reset to "tempPassword123!"`
      });

      setResetPasswordDialogOpen(false);
      setAgentToReset(null);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive'
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleAddAgent = async () => {
    try {
      // 1) Create auth user via Edge Function
      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-agent', {
        body: {
          email: newAgent.email?.trim(),
          password: 'tempPassword123!',
          full_name: newAgent.name?.trim(),
          role: newAgent.role || 'sales_agent'
        }
      });
      if (fnErr) {
        const detailedMessage =
          (fnErr as any)?.context?.error ||
          (fnErr as any)?.context?.details ||
          fnErr.message ||
          'Failed to create auth user';
        throw new Error(detailedMessage);
      }
      const userId = (fnRes as any)?.userId as string | undefined;
      if (!userId) throw new Error('Auth user not created');

      // 2) Insert profile row with additional fields
      // Prepare city value - use null if empty array, otherwise join with comma
      const cityValue = newAgent.cities.length > 0
        ? newAgent.cities.join(',')
        : null;

      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: newAgent.name,
          email: newAgent.email,
          phone: newAgent.phone || null,
          region: newAgent.region || null,
          city: cityValue,
          role: newAgent.role || 'sales_agent',
          status: 'active'
        });

      if (profileErr) {
        console.error('Profile creation error:', profileErr);
        // Don't throw - profile might already be created by trigger
      }

      toast({
        title: 'Success',
        description: 'User created successfully'
      });

      setAddDialogOpen(false);
      setNewAgent({
        name: '',
        email: '',
        phone: '',
        region: '',
        cities: [],
        role: 'mobile_sales'
      });
      setCurrentCityInput('');
      fetchAgents();
    } catch (error: any) {
      console.error('Error creating agent:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive'
      });
    }
  };

  // City management functions
  const addCityToNewAgent = () => {
    if (currentCityInput.trim() && !newAgent.cities.includes(currentCityInput.trim())) {
      setNewAgent({ ...newAgent, cities: [...newAgent.cities, currentCityInput.trim()] });
      setCurrentCityInput('');
    }
  };

  const removeCityFromNewAgent = (cityToRemove: string) => {
    setNewAgent({ ...newAgent, cities: newAgent.cities.filter(city => city !== cityToRemove) });
  };

  const addCityToEditForm = () => {
    if (editCityInput.trim() && !editForm.cities.includes(editCityInput.trim())) {
      setEditForm({ ...editForm, cities: [...editForm.cities, editCityInput.trim()] });
      setEditCityInput('');
    }
  };

  const removeCityFromEditForm = (cityToRemove: string) => {
    setEditForm({ ...editForm, cities: editForm.cities.filter(city => city !== cityToRemove) });
  };

  const handleConfirmEdit = () => {
    if (!editingAgent) return;
    setEditConfirmDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingAgent) return;

    try {
      const trimmedName = editForm.name.trim();
      const trimmedEmail = editForm.email.trim();

      if (!trimmedName || !trimmedEmail) {
        toast({
          title: 'Error',
          description: 'Name and email are required',
          variant: 'destructive'
        });
        return;
      }

      const authUpdates: Record<string, any> = { user_id: editingAgent.id };
      let needsAuthUpdate = false;

      if (trimmedName !== editingAgent.name) {
        authUpdates.full_name = trimmedName;
        needsAuthUpdate = true;
      }
      if (trimmedEmail !== editingAgent.email) {
        authUpdates.email = trimmedEmail;
        needsAuthUpdate = true;
      }
      if (needsAuthUpdate) {
        authUpdates.role = editingAgent.role || 'sales_agent';
        const { data: authData, error: authError } = await supabase.functions.invoke('update-agent-auth', {
          body: authUpdates
        });

        if (authError) {
          throw new Error(authError.message || 'Failed to update authentication record');
        }
        if ((authData as any)?.error) {
          throw new Error((authData as any).error);
        }
      }

      // Prepare city value - use null if empty array, otherwise join with comma
      const cityValue = editForm.cities.length > 0
        ? editForm.cities.join(',')
        : null;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          email: trimmedEmail,
          phone: editForm.phone || null,
          region: editForm.region || null,
          city: cityValue,
          status: editForm.status
        })
        .eq('id', editingAgent.id);

      if (error) {
        console.error('Update error details:', error);
        throw error;
      }

      toast({
        title: 'Success',
        description: 'User updated successfully'
      });

      setEditDialogOpen(false);
      setEditConfirmDialogOpen(false);
      setEditingAgent(null);
      setEditCityInput('');
      fetchAgents();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user',
        variant: 'destructive'
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;

    try {
      // Set agent to inactive
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', agentToDelete.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User set to inactive successfully'
      });

      setDeleteDialogOpen(false);
      fetchAgents();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, region, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filteredAgents.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No users found</div>
            ) : (
              filteredAgents.map((agent) => (
                <div key={agent.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{agent.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{agent.email}</div>
                    </div>
                    <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                      {agent.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div>{agent.phone || '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Region</div>
                      <div>{agent.region || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Cities</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {agent.cities.length > 0 ? (
                          agent.cities.map((city, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {city}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">No cities</span>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Total Sales</div>
                      <div className="font-semibold">₱{agent.totalSales.toLocaleString()}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs text-muted-foreground">Orders</div>
                      <div>{agent.ordersCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">
                      <span className="mr-2">Active:</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={agent.status === 'active' ? 'text-green-700' : 'text-gray-600'}
                        onClick={() => handleStatusToggle(agent, agent.status !== 'active')}
                      >
                        {agent.status === 'active' ? 'Yes' : 'No'}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenView(agent)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(agent)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleResetPassword(agent)}>
                      Reset
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleOpenDelete(agent)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Name</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Region</TableHead>
                  <TableHead className="text-center">Cities</TableHead>

                  <TableHead className="text-center">Active Status</TableHead>
                  <TableHead className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Actions</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Click the ⋯ menu for agent options</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium text-center">{agent.name}</TableCell>
                    <TableCell className="text-center">{agent.email}</TableCell>
                    <TableCell className="text-center">{agent.phone}</TableCell>
                    <TableCell className="text-center">{agent.region}</TableCell>
                    <TableCell className="text-center">
                      {agent.cities.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1">
                          {agent.cities.map((city, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {city}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">No cities</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer transition-colors ${agent.status === 'active'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        onClick={() => handleStatusToggle(agent, agent.status !== 'active')}
                      >
                        <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                          }`}></div>
                        <span className="text-sm font-medium">
                          {agent.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleOpenView(agent)}
                            className="focus:bg-gray-100 hover:bg-gray-100 text-black focus:text-black"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenEdit(agent)}
                            className="focus:bg-gray-100 hover:bg-gray-100 text-black focus:text-black"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleResetPassword(agent)}
                            className="focus:bg-gray-100 hover:bg-gray-100 text-black focus:text-black"
                          >
                            <Rewind className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenDelete(agent)}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Deactivate User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editForm.phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setEditForm({ ...editForm, phone: formatted });
                  }}
                  placeholder="+63 917 555 0101"
                  maxLength={17}
                />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  value={editForm.region}
                  onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="city">Cities</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="city"
                    placeholder="Enter city name"
                    value={editCityInput}
                    onChange={(e) => setEditCityInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCityToEditForm()}
                  />
                  <Button type="button" onClick={addCityToEditForm} variant="outline">
                    Add
                  </Button>
                </div>
                {editForm.cities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editForm.cities.map((city, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {city}
                        <button
                          type="button"
                          onClick={() => removeCityFromEditForm(city)}
                          className="ml-1 hover:text-red-500"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="status"
                checked={editForm.status === 'active'}
                onCheckedChange={(checked) => setEditForm({ ...editForm, status: checked ? 'active' : 'inactive' })}
              />
              <Label htmlFor="status">Active</Label>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Agent Information</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              View agent profile details
            </DialogDescription>
          </DialogHeader>
          {viewingAgent && (
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Contact Information</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-3 py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground w-20">Name:</span>
                    <span className="text-sm font-medium">{viewingAgent.name}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground w-20">Email:</span>
                    <span className="text-sm">{viewingAgent.email}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground w-20">Phone:</span>
                    <span className="text-sm">{viewingAgent.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Location Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Location</h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-3 py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground w-20">Region:</span>
                    <span className="text-sm">{viewingAgent.region || '—'}</span>
                  </div>
                  <div className="flex items-start gap-3 py-2 border-b">
                    <span className="text-sm font-medium text-muted-foreground w-20">Cities:</span>
                    <div className="flex flex-wrap gap-1">
                      {viewingAgent.cities.length > 0 ? (
                        viewingAgent.cities.map((city, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {city}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Role & Status */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Role & Status</h3>
                <div className="space-y-2">

                  <div className="flex items-start gap-3 py-2">
                    <span className="text-sm font-medium text-muted-foreground w-20">Status:</span>
                    <Badge
                      variant={viewingAgent.status === 'active' ? 'default' : 'secondary'}
                      className={viewingAgent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
                    >
                      {viewingAgent.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {agentToDelete?.name}? This will prevent the user from accessing the system. You can reactivate them later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-orange-600 hover:bg-orange-700">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Agent Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-name">Name</Label>
                <Input
                  id="add-name"
                  placeholder="Enter name"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="add-email">Email</Label>
                <Input
                  id="add-email"
                  type="email"
                  placeholder="Enter email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-phone">Phone</Label>
                <Input
                  id="add-phone"
                  value={newAgent.phone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setNewAgent({ ...newAgent, phone: formatted });
                  }}
                  placeholder="+63 917 555 0101"
                  maxLength={17}
                />
              </div>
              <div>
                <Label htmlFor="add-region">Region</Label>
                <Input
                  id="add-region"
                  placeholder="Enter region"
                  value={newAgent.region}
                  onChange={(e) => setNewAgent({ ...newAgent, region: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="add-city">Cities</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="add-city"
                    placeholder="Enter city name"
                    value={currentCityInput}
                    onChange={(e) => setCurrentCityInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCityToNewAgent()}
                  />
                  <Button type="button" onClick={addCityToNewAgent} variant="outline">
                    Add
                  </Button>
                </div>
                {newAgent.cities.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newAgent.cities.map((city, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {city}
                        <button
                          type="button"
                          onClick={() => removeCityFromNewAgent(city)}
                          className="ml-1 hover:text-red-500"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="add-role">Role</Label>
              <Select value={newAgent.role} onValueChange={(value: UserRole) => setNewAgent({ ...newAgent, role: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                  <SelectItem value="team_leader">Team Leader</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAgent}>
                Add User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={statusConfirmDialogOpen} onOpenChange={setStatusConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to set {agentToChangeStatus?.name} to {newStatus ? 'Active' : 'Inactive'}?
              {!newStatus && ' This will temporarily prevent the agent from accessing the system.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              className={newStatus ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}
            >
              Set to {newStatus ? 'Active' : 'Inactive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Confirmation Dialog */}
      <AlertDialog open={editConfirmDialogOpen} onOpenChange={setEditConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm User Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save these changes for {editingAgent?.name}?
              This will update the user's information in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveEdit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for <strong>{agentToReset?.name}</strong>?
              The password will be changed to <strong>"tempPassword123!"</strong> and the user will need to use this new password to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingPassword}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmResetPassword}
              disabled={resettingPassword}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {resettingPassword ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Resetting...
                </>
              ) : (
                'Reset Password'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
