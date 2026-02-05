import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
import { logEvent } from '@/lib/database.helpers';
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
import { useAuth } from '@/features/auth';
import { UserImportExport } from './UserImportExport';

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
  const { user, refreshProfile } = useAuth();
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addConfirmDialogOpen, setAddConfirmDialogOpen] = useState(false);
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
  const roleRequiresTerritory = (role?: UserRole | '') =>
    role === 'team_leader' || role === 'mobile_sales' || role === 'manager';

  const getRoleLabel = (role?: UserRole | '') => {
    switch (role) {
      case 'admin':
        return 'Admin';
      case 'finance':
        return 'Finance';
      case 'manager':
        return 'Manager';
      case 'team_leader':
        return 'Team Leader';
      case 'mobile_sales':
        return 'Mobile Sales';
      default:
        return '—';
    }
  };

  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    role: '' as UserRole | ''
  });
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    status: 'active' as 'active' | 'inactive',
    role: '' as UserRole | ''
  });

  // City input state for adding cities
  const [currentCityInput, setCurrentCityInput] = useState('');
  const [editCityInput, setEditCityInput] = useState('');
  const isRoleSelected = Boolean(newAgent.role);
  const addDialogRequiresTerritory = roleRequiresTerritory(newAgent.role);
  const editDialogRequiresTerritory = roleRequiresTerritory(editForm.role || (editingAgent?.role));

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
    // Wait for user to be loaded
    if (!user?.id) return;

    try {
      setLoading(true);

      // Fetch all users in the company except the logged-in user (RLS will handle company isolation)
      // AND fetch all approved orders in a SINGLE query (not N+1)
      const [agentsResult, ordersResult] = await Promise.all([
        supabase
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
          .neq('id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('client_orders')
          .select('agent_id, total_amount')
          .eq('status', 'approved')
      ]);

      if (agentsResult.error) throw agentsResult.error;
      if (ordersResult.error) {
        console.error('Error fetching orders:', ordersResult.error);
      }

      const agentsData = agentsResult.data || [];
      const ordersData = ordersResult.data || [];

      // Pre-aggregate orders by agent_id (O(n) instead of O(n*m))
      const salesByAgent: Record<string, { totalSales: number; ordersCount: number }> = {};
      for (const order of ordersData) {
        if (!order.agent_id) continue;
        if (!salesByAgent[order.agent_id]) {
          salesByAgent[order.agent_id] = { totalSales: 0, ordersCount: 0 };
        }
        const amount = typeof order.total_amount === 'number'
          ? order.total_amount
          : parseFloat(String(order.total_amount)) || 0;
        salesByAgent[order.agent_id].totalSales += amount;
        salesByAgent[order.agent_id].ordersCount += 1;
      }

      // Map agents with pre-aggregated sales data
      const agentsWithSales = agentsData.map((agent: any) => ({
        id: agent.id,
        name: agent.full_name,
        email: agent.email,
        phone: agent.phone || '',
        region: agent.region || '',
        cities: agent.city
          ? (Array.isArray(agent.city) ? agent.city : agent.city.split(',').map((c: string) => c.trim()).filter((c: string) => c))
          : [],
        status: agent.status || 'active',
        role: agent.role || 'mobile_sales',
        totalSales: salesByAgent[agent.id]?.totalSales || 0,
        ordersCount: salesByAgent[agent.id]?.ordersCount || 0
      }));

      setAgents(agentsWithSales);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchAgents();
    }
  }, [user?.id]);

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
      status: agent.status || 'active',
      role: agent.role || 'mobile_sales'
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

      // Log password reset event using the new helper
      await logEvent({
        actor_id: userId,
        action: 'reset_password',
        target_type: 'profile',
        target_id: agentToReset.id,
        target_label: agentToReset.name,
        details: {
          message: `Password reset for ${agentToReset.name} to tempPassword123!`,
          reset_target: agentToReset.name,
          reset_target_email: agentToReset.email
        }
      });

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

  const handleRoleChange = (value: UserRole) => {
    setNewAgent((prev) => ({
      ...prev,
      role: value,
      region: roleRequiresTerritory(value) ? prev.region : '',
      cities: roleRequiresTerritory(value) ? prev.cities : [],
    }));
  };

  const handleAddAgent = async () => {
    try {
      if (!newAgent.role) {
        toast({
          title: 'Role Required',
          description: 'Please select a role for the new user before continuing.',
          variant: 'destructive'
        });
        return;
      }

      if (!newAgent.name?.trim() || !newAgent.email?.trim() || !newAgent.phone?.trim()) {
        toast({
          title: 'Missing Information',
          description: 'Name, email, and phone are required for all roles.',
          variant: 'destructive'
        });
        return;
      }

      const needsTerritoryFields = roleRequiresTerritory(newAgent.role);
      if (needsTerritoryFields) {
        if (!newAgent.region?.trim()) {
          toast({
            title: 'Region Required',
            description: 'Please provide the region for this role.',
            variant: 'destructive'
          });
          return;
        }
        if (newAgent.cities.length === 0) {
          toast({
            title: 'Cities Required',
            description: 'Please add at least one city for this role.',
            variant: 'destructive'
          });
          return;
        }
      }

      // Validate that the super admin has a company_id
      let companyId = user?.company_id;

      if (!companyId) {
        console.error('User object missing company_id:', user);

        // Try to fetch company_id directly from the database
        console.log('🔄 Fetching company_id from database...');
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user?.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          toast({
            title: 'Profile Issue',
            description: 'Unable to load your profile. Please refresh the page or contact support.',
            variant: 'destructive'
          });
          return;
        }

        if (profileData?.company_id) {
          companyId = profileData.company_id;
          // Refresh the profile to update the user object
          await refreshProfile();
        } else {
          toast({
            title: 'Profile Issue',
            description: 'Your profile is missing company information. Please contact support.',
            variant: 'destructive'
          });
          return;
        }
      }

      // Prepare city value - use null if empty array, otherwise join with comma
      const regionValue = needsTerritoryFields ? newAgent.region?.trim() || null : null;
      const cityValue =
        needsTerritoryFields && newAgent.cities.length > 0
          ? newAgent.cities.join(',')
          : null;

      console.log('Creating user with company_id:', companyId);

      // Create auth user and profile via Edge Function with all fields
      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-agent', {
        body: {
          email: newAgent.email?.trim(),
          password: 'tempPassword123!',
          full_name: newAgent.name?.trim(),
          role: (newAgent.role as UserRole) || 'mobile_sales',
          phone: newAgent.phone || null,
          region: regionValue,
          city: cityValue,
          status: 'active',
          company_id: companyId
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

      // Check if the response contains an error (even if fnErr is null)
      if (fnRes && (fnRes as any).error) {
        throw new Error((fnRes as any).error);
      }

      const userId = (fnRes as any)?.userId as string | undefined;
      if (!userId) throw new Error('User not created');

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
        role: ''
      });
      setCurrentCityInput('');
      fetchAgents();
    } catch (error: any) {
      console.error('Error creating user:', error);
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

      console.log('🔍 [SalesAgentsTab] Update initiated for:', {
        editingAgentId: editingAgent.id,
        currentUserId: user?.id,
        isSelf: user?.id === editingAgent.id
      });

      // Prevent editing self
      if (user?.id === editingAgent.id) {
        console.warn('🚫 [SalesAgentsTab] Self-edit blocked');
        toast({
          title: "Action Denied",
          description: "You cannot edit your own account from this view.",
          variant: "destructive"
        });
        return;
      }

      // NOTE: We are now updating the role directly in the profiles table below.
      // The auth metadata will be synced on next login/refresh via AuthContext.


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
          status: editForm.status,
          role: editForm.role
        })
        .eq('id', editingAgent.id);

      if (error) {
        console.error('Update error details:', error);
        throw error;
      }

      // Log the profile update event
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        // Build change details
        const changes = [];
        if (trimmedName !== editingAgent.name) changes.push(`name: "${editingAgent.name}" → "${trimmedName}"`);
        if (trimmedEmail !== editingAgent.email) changes.push(`email: "${editingAgent.email}" → "${trimmedEmail}"`);
        if (editForm.phone !== editingAgent.phone) changes.push(`phone: "${editingAgent.phone || 'none'}" → "${editForm.phone || 'none'}"`);
        if (editForm.region !== editingAgent.region) changes.push(`region: "${editingAgent.region || 'none'}" → "${editForm.region || 'none'}"`);
        if (editForm.status !== editingAgent.status) changes.push(`status: "${editingAgent.status}" → "${editForm.status}"`);

        const citiesChanged = JSON.stringify(editForm.cities.sort()) !== JSON.stringify(editingAgent.cities.sort());
        if (citiesChanged) changes.push(`cities: [${editingAgent.cities.join(', ')}] → [${editForm.cities.join(', ')}]`);

        await logEvent({
          actor_id: currentUser.id,
          action: 'update',
          target_type: 'profile',
          target_id: editingAgent.id,
          target_label: trimmedName,
          details: {
            message: `Updated profile for ${trimmedName}${changes.length > 0 ? ': ' + changes.join(', ') : ''}`,
            changes: changes,
            updated_fields: {
              full_name: trimmedName,
              email: trimmedEmail,
              phone: editForm.phone || null,
              region: editForm.region || null,
              cities: editForm.cities,
              status: editForm.status
            }
          }
        });
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
        <CardHeader className="p-4 md:p-6">
          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive')}>
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
              <UserImportExport
                users={agents.map(agent => ({
                  id: agent.id,
                  name: agent.name,
                  email: agent.email,
                  phone: agent.phone,
                  region: agent.region,
                  cities: agent.cities,
                  role: agent.role || 'mobile_sales',
                  status: agent.status
                }))}
                onRefresh={fetchAgents}
              />
              <Button onClick={() => setAddDialogOpen(true)} className="h-9" size="sm">
                <UserPlus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Desktop Layout */}
          <div className="hidden md:flex items-center gap-4">
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
            <UserImportExport
              users={agents.map(agent => ({
                id: agent.id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
                region: agent.region,
                cities: agent.cities,
                role: agent.role || 'mobile_sales',
                status: agent.status
              }))}
              onRefresh={fetchAgents}
            />
            <Button onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {/* Mobile: card list */}
          <div className="md:hidden space-y-2">
            {filteredAgents.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No users found</div>
            ) : (
              filteredAgents.map((agent) => (
                <div key={agent.id} className="rounded-lg border bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{agent.email}</div>
                    </div>
                    <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="text-[10px] flex-shrink-0">
                      {agent.status}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Phone</div>
                        <div className="text-xs font-medium truncate">{agent.phone || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Region</div>
                        <div className="text-xs font-medium truncate">{agent.region || '—'}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Cities</div>
                      <div className="flex flex-wrap gap-1">
                        {agent.cities.length > 0 ? (
                          agent.cities.map((city, index) => (
                            <Badge key={index} variant="outline" className="text-[10px] h-5">
                              {city}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-[10px]">No cities</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground mb-1">Role</div>
                      <Badge variant="outline" className="text-[10px] h-5">{getRoleLabel(agent.role)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Total Sales</div>
                        <div className="text-xs font-semibold">₱{agent.totalSales.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Orders</div>
                        <div className="text-xs font-semibold">{agent.ordersCount}</div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>Status:</span>
                        <Switch
                          checked={agent.status === 'active'}
                          onCheckedChange={(checked) => handleStatusToggle(agent, checked)}
                        />
                        <span className={agent.status === 'active' ? 'text-green-600 font-medium' : 'text-gray-600'}>
                          {agent.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleOpenView(agent)}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleOpenEdit(agent)}>
                        <Edit className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleResetPassword(agent)}>
                        <Rewind className="h-3 w-3 mr-1" /> Reset
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-8 text-red-600 hover:text-red-700" onClick={() => handleOpenDelete(agent)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
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
                  <TableHead className="text-center">Role</TableHead>
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
                    <TableCell className="text-center">
                      <Badge variant="secondary">{getRoleLabel(agent.role)}</Badge>
                    </TableCell>
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
      {/* Edit Dialog - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh]">
            <SheetHeader className="pb-4">
              <SheetTitle>Edit User</SheetTitle>
              <SheetDescription>Update user information and settings</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(90vh-160px)] pr-4">
              <Accordion type="multiple" defaultValue={["basic", "role", "territory", "status"]} className="space-y-2">
                <AccordionItem value="basic" className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">Basic Information</AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div>
                      <Label htmlFor="name" className="text-xs">Name</Label>
                      <Input
                        id="name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-10 mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email" className="text-xs">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="h-10 mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-xs">Phone</Label>
                      <Input
                        id="phone"
                        value={editForm.phone}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          setEditForm({ ...editForm, phone: formatted });
                        }}
                        placeholder="+63 917 555 0101"
                        maxLength={17}
                        className="h-10 mt-1"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="role" className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">Role</AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <Label htmlFor="role" className="text-xs">User Role</Label>
                    <Select
                      value={editForm.role}
                      onValueChange={(value) => setEditForm({ ...editForm, role: value as UserRole })}
                    >
                      <SelectTrigger className="h-10 mt-1">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="team_leader">Team Leader</SelectItem>
                        <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                      </SelectContent>
                    </Select>
                  </AccordionContent>
                </AccordionItem>

                {editDialogRequiresTerritory ? (
                  <AccordionItem value="territory" className="border rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-medium">Territory & Cities</AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                      <div>
                        <Label htmlFor="region" className="text-xs">Region</Label>
                        <Input
                          id="region"
                          value={editForm.region}
                          onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                          className="h-10 mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="city" className="text-xs">Cities</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            id="city"
                            placeholder="Enter city name"
                            value={editCityInput}
                            onChange={(e) => setEditCityInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCityToEditForm();
                              }
                            }}
                            className="h-10"
                          />
                          <Button type="button" onClick={addCityToEditForm} variant="outline" className="h-10">
                            Add
                          </Button>
                        </div>
                        {editForm.cities.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
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
                    </AccordionContent>
                  </AccordionItem>
                ) : (
                  <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                    Region and cities are not required for {getRoleLabel(editingAgent?.role)} users.
                  </div>
                )}

                <AccordionItem value="status" className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">Status</AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="status"
                        checked={editForm.status === 'active'}
                        onCheckedChange={(checked) => setEditForm({ ...editForm, status: checked ? 'active' : 'inactive' })}
                      />
                      <Label htmlFor="status" className="text-sm">Active</Label>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ScrollArea>
            <div className="pt-4 border-t flex gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1 h-11">
                Cancel
              </Button>
              <Button onClick={handleConfirmEdit} className="flex-1 h-11">
                Save Changes
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
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

              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) => setEditForm({ ...editForm, role: value as UserRole })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="finance">Finance</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="team_leader">Team Leader</SelectItem>
                    <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className={`grid gap-4 ${editDialogRequiresTerritory ? 'md:grid-cols-2' : 'grid-cols-1 md:grid-cols-1'}`}>
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
                {editDialogRequiresTerritory && (
                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Input
                      id="region"
                      value={editForm.region}
                      onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                    />
                  </div>
                )}
              </div>
              {editDialogRequiresTerritory ? (
                <div>
                  <Label htmlFor="city">Cities</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="city"
                        placeholder="Enter city name"
                        value={editCityInput}
                        onChange={(e) => setEditCityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCityToEditForm();
                          }
                        }}
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
              ) : (
                <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                  Region and cities are not required for {getRoleLabel(editingAgent?.role)} users.
                </div>
              )}

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
      )}

      {/* View Dialog - Mobile: Sheet, Desktop: Dialog */}
      {isMobile ? (
        <Sheet open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader className="pb-4">
              <SheetTitle>User Information</SheetTitle>
              <SheetDescription>View user profile details</SheetDescription>
            </SheetHeader>
            {viewingAgent && (
              <ScrollArea className="h-[calc(85vh-120px)] pr-4">
                <div className="space-y-3">
                  {/* Contact Information */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Contact Information</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-xs text-muted-foreground">Name</span>
                        <span className="text-sm font-medium text-right">{viewingAgent.name}</span>
                      </div>
                      <div className="flex justify-between items-start border-t pt-2">
                        <span className="text-xs text-muted-foreground">Email</span>
                        <span className="text-xs text-right break-all ml-2">{viewingAgent.email}</span>
                      </div>
                      <div className="flex justify-between items-start border-t pt-2">
                        <span className="text-xs text-muted-foreground">Phone</span>
                        <span className="text-sm text-right">{viewingAgent.phone || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Location</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-xs text-muted-foreground">Region</span>
                        <span className="text-sm text-right">{viewingAgent.region || '—'}</span>
                      </div>
                      <div className="border-t pt-2">
                        <span className="text-xs text-muted-foreground block mb-2">Cities</span>
                        <div className="flex flex-wrap gap-1">
                          {viewingAgent.cities.length > 0 ? (
                            viewingAgent.cities.map((city, index) => (
                              <Badge key={index} variant="outline" className="text-[10px] h-5">
                                {city}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role & Status */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Role & Status</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Role</span>
                        <Badge variant="outline" className="text-xs">{getRoleLabel(viewingAgent.role)}</Badge>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-xs text-muted-foreground">Status</span>
                        <Badge
                          variant={viewingAgent.status === 'active' ? 'default' : 'secondary'}
                          className={viewingAgent.status === 'active' ? 'bg-green-100 text-green-700 text-xs' : 'bg-gray-100 text-gray-600 text-xs'}
                        >
                          {viewingAgent.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Performance */}
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Performance</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Total Sales</span>
                        <span className="text-sm font-semibold">₱{viewingAgent.totalSales.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2">
                        <span className="text-xs text-muted-foreground">Total Orders</span>
                        <span className="text-sm font-semibold">{viewingAgent.ordersCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
            <div className="pt-4 border-t">
              <Button onClick={() => setViewDialogOpen(false)} className="w-full h-11">
                Close
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
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
      )}

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
            <div>
              <Label htmlFor="add-role">Role</Label>
              <Select
                value={newAgent.role || undefined}
                onValueChange={(value) => handleRoleChange(value as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="team_leader">Team Leader</SelectItem>
                  <SelectItem value="mobile_sales">Mobile Sales</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Choose a role to see which details are required.
              </p>
            </div>

            {!isRoleSelected && (
              <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
                Select a role above to unlock the rest of the form. Different roles require different sets of fields.
              </div>
            )}

            <fieldset
              disabled={!isRoleSelected}
              className={`space-y-4 ${!isRoleSelected ? 'opacity-50 pointer-events-none select-none' : ''}`}
            >
              <div className="grid gap-4 md:grid-cols-2">
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

              <div className={`grid gap-4 ${addDialogRequiresTerritory ? 'md:grid-cols-2' : 'grid-cols-1 md:grid-cols-1'}`}>
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
                {addDialogRequiresTerritory && (
                  <div>
                    <Label htmlFor="add-region">Region</Label>
                    <Input
                      id="add-region"
                      placeholder="Enter region"
                      value={newAgent.region}
                      onChange={(e) => setNewAgent({ ...newAgent, region: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {addDialogRequiresTerritory && (
                <div>
                  <Label htmlFor="add-city">Cities</Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="add-city"
                        placeholder="Enter city name"
                        value={currentCityInput}
                        onChange={(e) => setCurrentCityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCityToNewAgent();
                          }
                        }}
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
              )}
            </fieldset>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setAddConfirmDialogOpen(true)} disabled={!isRoleSelected}>
                Add User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Confirmation Dialog */}
      <AlertDialog open={addConfirmDialogOpen} onOpenChange={setAddConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm New User</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Please confirm the details below. This will create the user and they’ll be able to log in once set up.
                </p>

                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Name</p>
                      <p className="text-sm font-semibold leading-tight">{newAgent.name || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Role</p>
                      <p className="text-sm font-semibold leading-tight">{newAgent.role || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Email</p>
                      <p className="text-sm leading-tight break-all">{newAgent.email || '—'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Phone</p>
                      <p className="text-sm leading-tight">{newAgent.phone || '—'}</p>
                    </div>

                    {addDialogRequiresTerritory && (
                      <>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Region</p>
                          <p className="text-sm leading-tight">{newAgent.region || '—'}</p>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <p className="text-xs font-medium text-muted-foreground">Cities</p>
                          <p className="text-sm leading-tight">
                            {newAgent.cities.length > 0 ? newAgent.cities.join(', ') : '—'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Double-check the email and role. You can edit user details later if needed.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setAddConfirmDialogOpen(false);
                await handleAddAgent();
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Confirm &amp; Add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div >
  );
}
