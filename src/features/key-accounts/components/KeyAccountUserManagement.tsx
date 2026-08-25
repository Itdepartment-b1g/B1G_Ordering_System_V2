import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { formatPhoneNumber } from '@/lib/utils';
import { logEvent } from '@/lib/database.helpers';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_SALES_AGENT_SORT_DIRECTION,
  DEFAULT_SALES_AGENT_SORT_KEY,
  getSalesAgentRoleLabel,
  sortSalesAgents,
  type SalesAgentSortKey,
} from '@/features/sales-agents/utils/salesAgentSorting';
import { Plus, Search, Edit, Trash2, UserPlus, Loader2, Eye, Rewind, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import { KeyAccountUserImportExport } from './KeyAccountUserImportExport.tsx';
import { KEY_ACCOUNT_CREATABLE_ROLES, getKeyAccountRoleLabel } from '../keyAccountRoles';
import type { UserRole } from '@/types/database.types';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchKAUsers, resetKAUsers } from '@/store/slices/key-accounts/user-management';

type KAUserRole = UserRole;

type ProfileStatus = 'active' | 'inactive';

interface KAUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: ProfileStatus;
  role: string;
  totalSales: number;
  ordersCount: number;
}

const KA_ROLES_FOR_EDIT: UserRole[] = [
  'sales_admin',
  'sales_head',
  'sales_director',
  'key_account_manager',
  'key_account_accounting',
];

export function KeyAccountUserManagement() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const { users: agents, status: fetchStatus, error: fetchError } = useAppSelector(
    (state) => state.kaUserManagement
  );
  const loading = fetchStatus === 'loading' || fetchStatus === 'idle';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addConfirmDialogOpen, setAddConfirmDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusConfirmDialogOpen, setStatusConfirmDialogOpen] = useState(false);
  const [editConfirmDialogOpen, setEditConfirmDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);

  const [agentToReset, setAgentToReset] = useState<KAUser | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  const [editingAgent, setEditingAgent] = useState<KAUser | null>(null);
  const [viewingAgent, setViewingAgent] = useState<KAUser | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<KAUser | null>(null);
  const [agentToChangeStatus, setAgentToChangeStatus] = useState<KAUser | null>(null);
  const [newStatus, setNewStatus] = useState<boolean>(true);

  const roleRequiresTerritory = (role?: string) => role === 'key_account_manager';

  const [newAgent, setNewAgent] = useState<{
    name: string;
    email: string;
    phone: string;
    region: string;
    cities: string[];
    role: UserRole | '';
  }>({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [],
    role: '',
  });

  const [editForm, setEditForm] = useState<{
    name: string;
    email: string;
    phone: string;
    region: string;
    cities: string[];
    status: ProfileStatus;
    role: UserRole | '';
  }>({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [],
    status: 'active',
    role: '',
  });

  const [currentCityInput, setCurrentCityInput] = useState('');
  const [editCityInput, setEditCityInput] = useState('');

  const isRoleSelected = Boolean(newAgent.role);
  const addDialogRequiresTerritory = roleRequiresTerritory(newAgent.role);
  const editDialogRequiresTerritory = roleRequiresTerritory(editForm.role || editingAgent?.role);

  const [sortState, setSortState] = useState<TableSortCycleState<SalesAgentSortKey>>(createInitialTableSortCycle);

  const { key: resolvedSortKey, direction: resolvedSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(sortState, DEFAULT_SALES_AGENT_SORT_KEY, DEFAULT_SALES_AGENT_SORT_DIRECTION),
    [sortState]
  );

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      if (statusFilter !== 'all' && agent.status !== statusFilter) return false;

      return (
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.cities.some((city) => city.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });
  }, [agents, searchQuery, statusFilter]);

  const sortedAgents = useMemo(
    () => sortSalesAgents(filteredAgents as any, resolvedSortKey, resolvedSortDirection) as unknown as KAUser[],
    [filteredAgents, resolvedSortKey, resolvedSortDirection]
  );

  const AGENTS_PER_PAGE = 10;
  const [agentPage, setAgentPage] = useState(1);
  const totalAgentPages = Math.max(1, Math.ceil(sortedAgents.length / AGENTS_PER_PAGE));
  const paginatedAgents = sortedAgents.slice((agentPage - 1) * AGENTS_PER_PAGE, agentPage * AGENTS_PER_PAGE);

  const handleSort = (key: SalesAgentSortKey) => {
    setSortState((current) => getNextTableSortCycleState(current, key));
  };

  useEffect(() => {
    setAgentPage(1);
  }, [searchQuery, statusFilter, sortState]);

  const fetchAgents = useCallback(() => {
    if (!user?.id) return;
    dispatch(fetchKAUsers());
  }, [user?.id, dispatch]);

  useEffect(() => {
    fetchAgents();
    return () => { dispatch(resetKAUsers()); };
  }, [fetchAgents, dispatch]);

  useEffect(() => {
    if (fetchError) {
      toast({ title: 'Error', description: fetchError, variant: 'destructive' });
    }
  }, [fetchError, toast]);

  const handleStatusToggle = (agent: KAUser, enabled: boolean) => {
    setAgentToChangeStatus(agent);
    setNewStatus(enabled);
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
        description: `User status set to ${newStatus ? 'active' : 'inactive'} successfully`,
      });

      setStatusConfirmDialogOpen(false);
      setAgentToChangeStatus(null);
      fetchAgents();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    }
  };

  const handleOpenView = (agent: KAUser) => {
    setViewingAgent(agent);
    setViewDialogOpen(true);
  };

  const handleOpenEdit = (agent: KAUser) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      email: agent.email,
      phone: agent.phone || '',
      region: agent.region || '',
      cities: agent.cities || [],
      status: agent.status || 'active',
      role: (agent.role || 'key_account_manager') as UserRole,
    });
    setEditDialogOpen(true);
  };

  const handleOpenDelete = (agent: KAUser) => {
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  const handleResetPassword = (agent: KAUser) => {
    setAgentToReset(agent);
    setResetPasswordDialogOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!agentToReset) return;
    setResettingPassword(true);

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id || '00000000-0000-0000-0000-000000000000';

      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-agent', {
        body: {
          email: agentToReset.email,
          password: 'tempPassword123!',
          full_name: agentToReset.name,
          role: 'sales_agent',
          reset_password: true,
        },
      });

      if (fnErr) throw new Error(fnErr.message || 'Edge Function failed');
      if (!fnRes?.success && !fnRes?.userId) throw new Error('Password reset failed - no success confirmation');

      await logEvent({
        actor_id: userId,
        action: 'reset_password',
        target_type: 'profile',
        target_id: agentToReset.id,
        target_label: agentToReset.name,
        details: {
          message: `Password reset for ${agentToReset.name} to tempPassword123!`,
          reset_target: agentToReset.name,
          reset_target_email: agentToReset.email,
        },
      });

      toast({
        title: 'Success',
        description: `Password for ${agentToReset.name} has been reset to "tempPassword123!"`,
      });

      setResetPasswordDialogOpen(false);
      setAgentToReset(null);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive',
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
        toast({ title: 'Role Required', description: 'Please select a role for the new user.', variant: 'destructive' });
        return;
      }

      if (!newAgent.name?.trim() || !newAgent.email?.trim() || !newAgent.phone?.trim()) {
        toast({ title: 'Missing Information', description: 'Name, email, and phone are required.', variant: 'destructive' });
        return;
      }

      if (!KEY_ACCOUNT_CREATABLE_ROLES.includes(newAgent.role as any)) {
        toast({ title: 'Invalid Role', description: 'Only Key Account creatable roles are allowed.', variant: 'destructive' });
        return;
      }

      if (roleRequiresTerritory(newAgent.role)) {
        if (!newAgent.region?.trim()) {
          toast({ title: 'Region Required', description: 'Please provide the region.', variant: 'destructive' });
          return;
        }
        if (newAgent.cities.length === 0) {
          toast({ title: 'Cities Required', description: 'Please add at least one city.', variant: 'destructive' });
          return;
        }
      }

      let companyId = user?.company_id;
      if (!companyId) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user?.id)
          .single();

        if (profileError) throw new Error(profileError.message || 'Unable to load company_id');
        if (!profileData?.company_id) throw new Error('Your profile is missing company information');
        companyId = profileData.company_id;
        await refreshProfile();
      }

      const regionValue = roleRequiresTerritory(newAgent.role) ? newAgent.region.trim() || null : null;
      const cityValue = roleRequiresTerritory(newAgent.role) && newAgent.cities.length > 0 ? newAgent.cities.join(',') : null;

      const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-key-account-user', {
        body: {
          email: newAgent.email.trim(),
          password: 'tempPassword123!',
          full_name: newAgent.name.trim(),
          role: newAgent.role,
          company_id: companyId,
          created_by: user?.id,
          phone: newAgent.phone || null,
          region: regionValue,
          city: cityValue,
        },
      });

      if (fnErr) {
        const detailedMessage = (fnErr as any)?.context?.error || (fnErr as any)?.context?.details || fnErr.message || 'Failed to create user';
        throw new Error(detailedMessage);
      }
      if (fnRes && (fnRes as any).error) throw new Error((fnRes as any).error);

      const userId = (fnRes as any)?.userId as string | undefined;
      if (!userId) throw new Error('User not created');

      toast({ title: 'Success', description: 'User created successfully' });

      setAddDialogOpen(false);
      setNewAgent({ name: '', email: '', phone: '', region: '', cities: [], role: '' });
      fetchAgents();
    } catch (error: any) {
      console.error('Error creating key account user:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create user', variant: 'destructive' });
    }
  };

  const addCityToNewAgent = () => {
    const trimmed = currentCityInput.trim();
    if (!trimmed) return;
    if (!newAgent.cities.includes(trimmed)) {
      setNewAgent({ ...newAgent, cities: [...newAgent.cities, trimmed] });
      setCurrentCityInput('');
    }
  };

  const removeCityFromNewAgent = (cityToRemove: string) => {
    setNewAgent({ ...newAgent, cities: newAgent.cities.filter((city) => city !== cityToRemove) });
  };

  const addCityToEditForm = () => {
    const trimmed = editCityInput.trim();
    if (!trimmed) return;
    if (!editForm.cities.includes(trimmed)) {
      setEditForm({ ...editForm, cities: [...editForm.cities, trimmed] });
      setEditCityInput('');
    }
  };

  const removeCityFromEditForm = (cityToRemove: string) => {
    setEditForm({ ...editForm, cities: editForm.cities.filter((city) => city !== cityToRemove) });
  };

  const handleConfirmEdit = () => setEditConfirmDialogOpen(true);

  const handleSaveEdit = async () => {
    if (!editingAgent) return;

    try {
      const trimmedName = editForm.name.trim();
      const trimmedEmail = editForm.email.trim();

      if (!trimmedName || !trimmedEmail) {
        toast({ title: 'Error', description: 'Name and email are required', variant: 'destructive' });
        return;
      }

      if (!editForm.role) {
        toast({ title: 'Error', description: 'Role is required', variant: 'destructive' });
        return;
      }

      // Prevent editing self
      if (user?.id === editingAgent.id) {
        toast({ title: 'Action Denied', description: 'You cannot edit your own account from this view.', variant: 'destructive' });
        return;
      }

      const cityValue = editForm.cities.length > 0 ? editForm.cities.join(',') : null;
      const regionValue = editDialogRequiresTerritory ? editForm.region || null : null;
      const finalCityValue = editDialogRequiresTerritory ? cityValue : null;

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          email: trimmedEmail,
          phone: editForm.phone || null,
          region: regionValue,
          city: finalCityValue,
          status: editForm.status,
          role: editForm.role,
        })
        .eq('id', editingAgent.id);

      if (error) throw error;

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await logEvent({
          actor_id: currentUser.id,
          action: 'update',
          target_type: 'profile',
          target_id: editingAgent.id,
          target_label: trimmedName,
          details: {
            message: `Updated profile for ${trimmedName}`,
          },
        });
      }

      toast({ title: 'Success', description: 'User updated successfully' });

      setEditDialogOpen(false);
      setEditConfirmDialogOpen(false);
      setEditingAgent(null);
      setEditCityInput('');
      fetchAgents();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;
    try {
      const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', agentToDelete.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'User set to inactive successfully' });
      setDeleteDialogOpen(false);
      fetchAgents();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update user status', variant: 'destructive' });
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
              <KeyAccountUserImportExport
                users={agents.map((agent) => ({
                  id: agent.id,
                  name: agent.name,
                  email: agent.email,
                  phone: agent.phone,
                  region: agent.region,
                  cities: agent.cities,
                  role: agent.role || 'key_account_manager',
                  status: agent.status,
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
            <KeyAccountUserImportExport
              users={agents.map((agent) => ({
                id: agent.id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
                region: agent.region,
                cities: agent.cities,
                role: agent.role || 'key_account_manager',
                status: agent.status,
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
              paginatedAgents.map((agent) => (
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
                      <Badge variant="outline" className="text-[10px] h-5">
                        {getSalesAgentRoleLabel(agent.role as UserRole)}
                      </Badge>
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
                        <Switch checked={agent.status === 'active'} onCheckedChange={(checked) => handleStatusToggle(agent, checked)} />
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
                        <Trash2 className="h-3 w-3 mr-1" /> Deactivate
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
                  <SortableTableHead
                    label="Name"
                    sortKey="name"
                    sortDirection={getTableSortDisplayDirection(sortState, 'name')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Email"
                    sortKey="email"
                    sortDirection={getTableSortDisplayDirection(sortState, 'email')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Phone"
                    sortKey="phone"
                    sortDirection={getTableSortDisplayDirection(sortState, 'phone')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Role"
                    sortKey="role"
                    sortDirection={getTableSortDisplayDirection(sortState, 'role')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Region"
                    sortKey="region"
                    sortDirection={getTableSortDisplayDirection(sortState, 'region')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Cities"
                    sortKey="cities"
                    sortDirection={getTableSortDisplayDirection(sortState, 'cities')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <SortableTableHead
                    label="Active Status"
                    sortKey="status"
                    sortDirection={getTableSortDisplayDirection(sortState, 'status')}
                    onSort={handleSort}
                    className="text-center"
                  />
                  <TableHead className="text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Actions</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Click the ⋯ menu for user options</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium text-center">{agent.name}</TableCell>
                    <TableCell className="text-center">{agent.email}</TableCell>
                    <TableCell className="text-center">{agent.phone}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{getSalesAgentRoleLabel(agent.role as UserRole)}</Badge>
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
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full cursor-pointer transition-colors ${
                          agent.status === 'active'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        onClick={() => handleStatusToggle(agent, agent.status !== 'active')}
                      >
                        <div className={`w-2 h-2 rounded-full ${agent.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-sm font-medium">{agent.status === 'active' ? 'Active' : 'Inactive'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => handleOpenView(agent)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenEdit(agent)}>
                            <Edit className="h-4 w-4 mr-2" /> Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleResetPassword(agent)}>
                            <Rewind className="h-4 w-4 mr-2" /> Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenDelete(agent)} className="text-red-600 focus:text-red-600 focus:bg-red-50 hover:bg-red-50">
                            <Trash2 className="h-4 w-4 mr-2" /> Deactivate User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {sortedAgents.length > AGENTS_PER_PAGE && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium">
                    {(agentPage - 1) * AGENTS_PER_PAGE + 1}-{Math.min(agentPage * AGENTS_PER_PAGE, sortedAgents.length)}
                  </span>{' '}
                  of <span className="font-medium">{sortedAgents.length}</span> users
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAgentPage((p) => Math.max(1, p - 1))}
                    disabled={agentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Prev
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {agentPage} of {totalAgentPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAgentPage((p) => Math.min(totalAgentPages, p + 1))}
                    disabled={agentPage === totalAgentPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">User Information</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">View user profile details</DialogDescription>
          </DialogHeader>
          {viewingAgent && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Name</div>
                <div className="text-sm">{viewingAgent.name}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Email</div>
                <div className="text-sm break-all">{viewingAgent.email}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Phone</div>
                <div className="text-sm">{viewingAgent.phone || '—'}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Role</div>
                <Badge variant="outline" className="w-fit">
                  {getKeyAccountRoleLabel(viewingAgent.role || '')}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Status</div>
                <Badge variant={viewingAgent.status === 'active' ? 'default' : 'secondary'} className="w-fit">
                  {viewingAgent.status}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Region</div>
                <div className="text-sm">{viewingAgent.region || '—'}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Cities</div>
                {viewingAgent.cities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {viewingAgent.cities.map((city, idx) => (
                      <Badge key={idx} variant="outline">
                        {city}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">—</div>
                )}
              </div>
            </div>
          )}
          <div className="pt-4 border-t">
            <Button onClick={() => setViewDialogOpen(false)} className="w-full h-11">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Key Account User</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Update user information and settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm({ ...editForm, role: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {KA_ROLES_FOR_EDIT.map((role) => (
                    <SelectItem key={role} value={role}>
                      {getKeyAccountRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={`grid gap-4 ${editDialogRequiresTerritory ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
              <div>
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
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
                  <Label htmlFor="edit-region">Region</Label>
                  <Input
                    id="edit-region"
                    value={editForm.region}
                    onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                  />
                </div>
              )}
            </div>

            {editDialogRequiresTerritory && (
              <div>
                <Label htmlFor="edit-city">Cities</Label>
                <div className="space-y-2 mt-1">
                  <div className="flex gap-2">
                    <Input
                      id="edit-city"
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
                  {editForm.cities.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {editForm.cities.map((city, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {city}
                          <button type="button" onClick={() => removeCityFromEditForm(city)} className="ml-1 hover:text-destructive">
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No cities</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={editForm.status === 'active'} onCheckedChange={(checked) => setEditForm({ ...editForm, status: checked ? 'active' : 'inactive' })} />
              <Label>Active</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmEdit}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Edit Dialog */}
      <AlertDialog open={editConfirmDialogOpen} onOpenChange={setEditConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm User Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save these changes for {editingAgent?.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {agentToDelete?.name}? This will prevent the user from accessing the system.
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

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Key Account User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-role">Role</Label>
              <Select value={newAgent.role || undefined} onValueChange={(value) => handleRoleChange(value as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {KEY_ACCOUNT_CREATABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {getKeyAccountRoleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Choose a Key Account role. Territory fields are only required for Key Account Managers.
              </p>
            </div>

            {!isRoleSelected && (
              <div className="rounded-md border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
                Select a role above to unlock the rest of the form.
              </div>
            )}

            <fieldset disabled={!isRoleSelected} className={`space-y-4 ${!isRoleSelected ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="add-name">Name</Label>
                  <Input id="add-name" placeholder="Enter name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="add-email">Email</Label>
                  <Input id="add-email" type="email" placeholder="Enter email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} />
                </div>
              </div>

              <div className={`grid gap-4 ${addDialogRequiresTerritory ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
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
                    <Input id="add-region" placeholder="Enter region" value={newAgent.region} onChange={(e) => setNewAgent({ ...newAgent, region: e.target.value })} />
                  </div>
                )}
              </div>

              {addDialogRequiresTerritory && (
                <div>
                  <Label htmlFor="add-city">Cities</Label>
                  <div className="space-y-2 mt-1">
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
                    {newAgent.cities.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {newAgent.cities.map((city, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {city}
                            <button type="button" onClick={() => removeCityFromNewAgent(city)} className="ml-1 hover:text-destructive">
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No cities added</div>
                    )}
                  </div>
                </div>
              )}
            </fieldset>

            <div className="flex justify-end space-x-2 pt-2 border-t">
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

      {/* Add User Confirm Dialog */}
      <AlertDialog open={addConfirmDialogOpen} onOpenChange={setAddConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm New User</AlertDialogTitle>
            <AlertDialogDescription>
              Please confirm the details below. This will create the user and they’ll be able to log in once set up.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Name</p>
                <p className="text-sm font-semibold leading-tight">{newAgent.name || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Role</p>
                <p className="text-sm font-semibold leading-tight">{newAgent.role ? getKeyAccountRoleLabel(newAgent.role) : '—'}</p>
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
                    <p className="text-sm leading-tight">{newAgent.cities.length > 0 ? newAgent.cities.join(', ') : '—'}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setAddConfirmDialogOpen(false);
                await handleAddAgent();
              }}
              className="bg-primary hover:bg-primary/90"
            >
              Confirm & Add
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
              {!newStatus && ' This will temporarily prevent the user from accessing the system.'}
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

      {/* Reset Password Confirmation Dialog */}
      <AlertDialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reset the password for <strong>{agentToReset?.name}</strong>?
              The password will be changed to <strong>"tempPassword123!"</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingPassword}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResetPassword} disabled={resettingPassword} className="bg-blue-600 text-white hover:bg-blue-700">
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