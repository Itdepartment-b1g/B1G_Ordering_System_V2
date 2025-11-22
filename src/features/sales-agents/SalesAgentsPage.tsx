import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, UserPlus, Loader2, Package, Eye, Rewind, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import { TeamManagementTab } from './components/TeamManagementTab';
import { useAuth } from '@/features/auth';
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

interface SalesAgent {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: 'active' | 'inactive';
  position?: 'Leader' | 'Mobile Sales';
  role?: 'admin' | 'sales_agent';
  totalSales: number;
  ordersCount: number;
}

interface Variant {
  id: string;
  name: string;
  variant_type: 'flavor' | 'battery';
  stock: number;
  price: number;
  dspPrice?: number;
  rspPrice?: number;
}

interface Brand {
  id: string;
  name: string;
  flavors: Variant[];
  batteries: Variant[];
}

interface AllocationItem {
  variant_id: string;
  quantity: number;
  price: number;
  dspPrice?: number;
  rspPrice?: number;
}

export default function SalesAgentsPage() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [allocation, setAllocation] = useState({
    agentId: '',
    brandId: ''
  });
  const [allocationItems, setAllocationItems] = useState<AllocationItem[]>([]);
  const [currentVariant, setCurrentVariant] = useState({ variantId: '', quantity: 0 });

  // Edit Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<SalesAgent | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    status: 'active' as 'active' | 'inactive',
    position: '' as 'Leader' | 'Mobile Sales' | 'Hermanos Sales Agent' | ''
  });

  // Delete Confirmation States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<SalesAgent | null>(null);

  // Reset Password Dialog States
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [agentToReset, setAgentToReset] = useState<SalesAgent | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Status Change Confirmation States
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [agentToChangeStatus, setAgentToChangeStatus] = useState<SalesAgent | null>(null);
  const [newStatus, setNewStatus] = useState<boolean>(true);
  const [changingStatus, setChangingStatus] = useState(false);

  // Update Confirmation States
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingAgent, setViewingAgent] = useState<SalesAgent | null>(null);
  const [viewOrders, setViewOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const { toast } = useToast();

  // Add Agent Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    phone: '',
    region: '',
    cities: [] as string[],
    position: '' as 'Leader' | 'Mobile Sales' | 'Hermanos Sales Agent' | ''
  });

  // City input state for adding cities
  const [currentCityInput, setCurrentCityInput] = useState('');
  const [editCityInput, setEditCityInput] = useState('');

  const getPositionBadgeStyles = (position?: string) => {
    switch (position) {
      case 'Leader':
        return { variant: 'default' as const, className: 'bg-blue-100 text-blue-700' };
      case 'Mobile Sales':
        return { variant: 'secondary' as const, className: 'bg-green-100 text-green-700' };
      case 'Hermanos Sales Agent':
        return { variant: 'secondary' as const, className: 'bg-purple-100 text-purple-700' };
      default:
        return { variant: 'outline' as const, className: 'text-muted-foreground' };
    }
  };

  // Helper functions for city tags
  const addCityToNewAgent = () => {
    if (currentCityInput.trim() && !newAgent.cities.includes(currentCityInput.trim())) {
      setNewAgent({ ...newAgent, cities: [...newAgent.cities, currentCityInput.trim()] });
      setCurrentCityInput('');
    }
  };

  const removeCityFromNewAgent = (cityToRemove: string) => {
    setNewAgent({ ...newAgent, cities: newAgent.cities.filter(city => city !== cityToRemove) });
  };

  const addCityToEditAgent = () => {
    if (editCityInput.trim() && !editForm.cities.includes(editCityInput.trim())) {
      setEditForm({ ...editForm, cities: [...editForm.cities, editCityInput.trim()] });
      setEditCityInput('');
    }
  };

  const removeCityFromEditAgent = (cityToRemove: string) => {
    setEditForm({ ...editForm, cities: editForm.cities.filter(city => city !== cityToRemove) });
  };

  // Fetch agents and brands from Supabase
  useEffect(() => {
    fetchAgents();
    fetchBrands();

    // Real-time subscription for profiles
    const profilesChannel = subscribeToTable('profiles', () => {
      fetchAgents();
    });

    // Real-time subscription for client_orders (to update sales totals when orders are approved/rejected)
    const ordersChannel = subscribeToTable('client_orders', () => {
      fetchAgents();
    });

    return () => {
      unsubscribe(profilesChannel);
      unsubscribe(ordersChannel);
    };
  }, []);

  const fetchBrands = async () => {
    try {
      setLoadingBrands(true);

      const { data: brandsData, error } = await supabase
        .from('brands')
        .select(`
          id,
          name,
          variants (
            id,
            name,
            variant_type,
            main_inventory (
              stock,
              unit_price,
              selling_price,
              dsp_price,
              rsp_price
            )
          )
        `)
        .order('name');

      if (error) throw error;

      const formattedBrands: Brand[] = (brandsData || []).map((brand: any) => ({
        id: brand.id,
        name: brand.name,
        flavors: brand.variants
          ?.filter((v: any) => v.variant_type === 'flavor')
          .map((v: any) => {
            const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
            return {
              id: v.id,
              name: v.name,
              variant_type: 'flavor' as const,
              stock: inventory?.stock || 0,
              price: (typeof inventory?.selling_price === 'number' ? inventory.selling_price : (inventory?.unit_price || 0)),
              dspPrice: inventory?.dsp_price,
              rspPrice: inventory?.rsp_price,
            };
          }) || [],
        batteries: brand.variants
          ?.filter((v: any) => v.variant_type === 'battery')
          .map((v: any) => {
            const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
            return {
              id: v.id,
              name: v.name,
              variant_type: 'battery' as const,
              stock: inventory?.stock || 0,
              price: (typeof inventory?.selling_price === 'number' ? inventory.selling_price : (inventory?.unit_price || 0)),
              dspPrice: inventory?.dsp_price,
              rspPrice: inventory?.rsp_price,
            };
          }) || [],
      }));

      setBrands(formattedBrands);
    } catch (error) {
      console.error('Error fetching brands:', error);
      toast({
        title: 'Error',
        description: 'Failed to load brands',
        variant: 'destructive'
      });
    } finally {
      setLoadingBrands(false);
    }
  };

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'sales_agent')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch all approved orders to calculate sales
      const { data: orders, error: ordersError } = await supabase
        .from('client_orders')
        .select('agent_id, total_amount, status')
        .eq('status', 'approved');

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      }

      console.log('📊 Approved orders fetched:', orders);

      const formattedAgents: SalesAgent[] = (data || []).map((agent: any) => {
        // Filter orders for this specific agent and only approved ones
        const agentOrders = (orders || []).filter(
          (order: any) => order.agent_id === agent.id && order.status === 'approved'
        );

        // Calculate total sales from approved orders
        const totalSales = agentOrders.reduce((sum: number, order: any) => sum + (Number(order.total_amount) || 0), 0);

        console.log(`💰 Agent ${agent.full_name}: ${agentOrders.length} orders, Total: ₱${totalSales}`);

        return {
          id: agent.id,
          name: agent.full_name || '',
          email: agent.email || '',
          phone: agent.phone || '',
          region: agent.region || '',
          cities: agent.city ? (Array.isArray(agent.city) ? agent.city : agent.city.split(',').map(c => c.trim()).filter(c => c)) : [],
          status: agent.status || 'active',
          position: agent.position || undefined,
          role: agent.role || 'sales_agent',
          totalSales: totalSales,
          ordersCount: agentOrders.length,
        };
      });

      setAgents(formattedAgents);
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

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.cities.some(city => city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleOpenEdit = (agent: SalesAgent) => {
    setEditingAgent(agent);
    setEditForm({
      name: agent.name,
      email: agent.email,
      phone: agent.phone,
      region: agent.region,
      cities: agent.cities,
      status: agent.status,
      position: agent.position || ''
    });
    setEditDialogOpen(true);
  };

  const handleOpenView = async (agent: SalesAgent) => {
    setViewingAgent(agent);
    setViewDialogOpen(true);
    // Load this agent's orders
    try {
      setLoadingOrders(true);
      const { data, error } = await supabase
        .from('client_orders')
        .select(`id, order_number, client_id, order_date, total_amount, status, client_order_items(count), clients(name)`) // items count and client name
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const mapped = (data || []).map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        clientName: o.clients?.name || 'Unknown Client',
        date: o.order_date,
        amount: o.total_amount || 0,
        items: Array.isArray(o.client_order_items) && o.client_order_items[0] ? o.client_order_items[0].count : 0,
        status: o.status,
      }));
      setViewOrders(mapped);
    } catch (err) {
      console.error('Error loading agent orders:', err);
      setViewOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSaveEdit = () => {
    if (!editingAgent) return;

    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.phone.trim() || !editForm.region.trim()) {
      toast({ title: 'Error', description: 'All fields are required', variant: 'destructive' });
      return;
    }

    setUpdateConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
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
          status: editForm.status,
          position: editForm.position || null,
        } as any)
        .eq('id', editingAgent.id);

      if (error) {
        console.error('Update error details:', error);
        throw error;
      }

      toast({
        title: 'Success',
        description: `${editForm.name} has been updated successfully${editForm.status === 'inactive' ? '. They will be logged out if currently active.' : ''}`
      });

      setUpdateConfirmOpen(false);
      setEditDialogOpen(false);
      setEditingAgent(null);

      // Real-time will handle updating the list
    } catch (error) {
      console.error('Error updating agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to update agent. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleOpenDelete = (agent: SalesAgent) => {
    setAgentToDelete(agent);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;

    try {
      // Delete the agent from the database
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', agentToDelete.id);

      if (error) throw error;

      // Update local state
      setAgents(agents.filter(a => a.id !== agentToDelete.id));

      toast({
        title: 'Success',
        description: `${agentToDelete.name} has been deleted successfully`
      });

      setDeleteDialogOpen(false);
      setAgentToDelete(null);
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete agent. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleResetPassword = (agent: SalesAgent) => {
    setAgentToReset(agent);
    setResetPasswordDialogOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!agentToReset) return;

    setResettingPassword(true);
    try {
      console.log('Resetting password for:', agentToReset.email);

      // Store current admin session before making the call
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const adminUserId = currentSession?.user?.id;

      if (!adminUserId) {
        throw new Error('Admin session not found. Please log in again.');
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

      console.log('Edge Function response:', { data: fnRes, error: fnErr });

      if (fnErr) {
        console.error('Edge Function error:', fnErr);
        throw new Error(fnErr.message || 'Edge Function failed');
      }

      if (!fnRes?.success && !fnRes?.userId) {
        throw new Error('Password reset failed - no success confirmation');
      }

      // Verify admin session is still valid after the call
      const { data: { session: sessionAfter } } = await supabase.auth.getSession();
      if (!sessionAfter || sessionAfter.user?.id !== adminUserId) {
        console.warn('Admin session was invalidated after password reset. This should not happen.');
        // Don't throw error, just log it - the password reset was successful
        // The auth context will handle the logout if needed
      }

      toast({
        title: 'Password Reset',
        description: `Password for ${agentToReset.name} has been reset to "tempPassword123!"`
      });

      setResetPasswordDialogOpen(false);
      setAgentToReset(null);
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset password',
        variant: 'destructive'
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleStatusToggle = (agent: SalesAgent, newStatus: boolean) => {
    setAgentToChangeStatus(agent);
    setNewStatus(newStatus);
    setStatusChangeDialogOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!agentToChangeStatus) return;

    setChangingStatus(true);
    try {
      const status = newStatus ? 'active' : 'inactive';

      // Optimistic update - update UI immediately
      setAgents(prevAgents =>
        prevAgents.map(agent =>
          agent.id === agentToChangeStatus.id
            ? { ...agent, status: status as 'active' | 'inactive' }
            : agent
        )
      );

      // Update in database
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', agentToChangeStatus.id);

      if (error) {
        // Rollback optimistic update on error
        setAgents(prevAgents =>
          prevAgents.map(agent =>
            agent.id === agentToChangeStatus.id
              ? { ...agent, status: agent.status === 'active' ? 'inactive' : 'active' }
              : agent
          )
        );
        throw error;
      }

      toast({
        title: 'Status Updated',
        description: `${agentToChangeStatus.name} is now ${status}`,
      });

      setStatusChangeDialogOpen(false);
      setAgentToChangeStatus(null);
    } catch (error: any) {
      console.error('Status update error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update agent status',
        variant: 'destructive',
      });
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddVariant = () => {
    if (!currentVariant.variantId || currentVariant.quantity <= 0) {
      toast({ title: 'Error', description: 'Please select a variant and enter quantity', variant: 'destructive' });
      return;
    }

    const brand = brands.find(b => b.id === allocation.brandId);
    const allVariants = [...(brand?.flavors || []), ...(brand?.batteries || [])];
    const variant = allVariants.find(v => v.id === currentVariant.variantId);

    if (!variant) {
      toast({ title: 'Error', description: 'Variant not found', variant: 'destructive' });
      return;
    }

    // Check if quantity exceeds available stock
    if (currentVariant.quantity > variant.stock) {
      toast({
        title: 'Error',
        description: `Quantity cannot exceed available stock. Available: ${variant.stock} units`,
        variant: 'destructive'
      });
      return;
    }

    // Check if variant already added
    if (allocationItems.find(item => item.variant_id === currentVariant.variantId)) {
      toast({ title: 'Error', description: 'Variant already added. Remove it first to update quantity.', variant: 'destructive' });
      return;
    }

    setAllocationItems([...allocationItems, {
      variant_id: currentVariant.variantId,
      quantity: currentVariant.quantity,
      price: variant.price,
      dspPrice: variant.dspPrice,
      rspPrice: variant.rspPrice
    }]);
    setCurrentVariant({ variantId: '', quantity: 0 });
    toast({ title: 'Added', description: `${variant.name} added to allocation list` });
  };

  const handleRemoveVariant = (variantId: string) => {
    setAllocationItems(allocationItems.filter(item => item.variant_id !== variantId));
  };

  const handleAllocateStock = async () => {
    if (!allocation.agentId || !allocation.brandId || allocationItems.length === 0) {
      toast({ title: 'Error', description: 'Please select an agent, brand, and add at least one variant', variant: 'destructive' });
      return;
    }

    const agent = agents.find(a => a.id === allocation.agentId);
    const brand = brands.find(b => b.id === allocation.brandId);

    setAllocating(true);

    try {
      // Use UPSERT function for each item to avoid 409 conflicts
      // IMPORTANT: This does NOT deduct from main_inventory!
      for (const item of allocationItems) {
        const { data, error } = await supabase.rpc('allocate_to_agent', {
          p_agent_id: allocation.agentId,
          p_variant_id: item.variant_id,
          p_quantity: item.quantity,
          p_allocated_price: item.price,
          p_dsp_price: item.dspPrice,
          p_rsp_price: item.rspPrice,
          p_performed_by: user?.id
        });

        if (error) throw error;
      }

      const totalUnits = allocationItems.reduce((sum, item) => sum + item.quantity, 0);

      // Create notification for the agent
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: allocation.agentId,
          notification_type: 'inventory_allocated',
          title: 'Stock Allocated 📦',
          message: `You have been allocated ${totalUnits} units (${allocationItems.length} variants) of ${brand?.name} stock. Check your inventory to view the new items.`,
          reference_type: 'agent_inventory',
          reference_id: allocation.agentId
        });

      if (notificationError) {
        console.error('Error creating notification:', notificationError);
        // Don't fail the whole operation if notification fails
      }

      toast({
        title: 'Success',
        description: `Allocated ${totalUnits} units (${allocationItems.length} variants) of ${brand?.name} to ${agent?.name}`,
        duration: 5000
      });

      // Reset and close
      setAllocation({ agentId: '', brandId: '' });
      setAllocationItems([]);
      setCurrentVariant({ variantId: '', quantity: 0 });
      setAllocationOpen(false);

      // Refresh brands to show updated info
      await fetchBrands();
    } catch (error: any) {
      console.error('Error allocating stock:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to allocate stock. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setAllocating(false);
    }
  };

  const selectedBrand = brands.find(b => b.id === allocation.brandId);

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sales Agents</h1>
          <p className="text-muted-foreground">Manage your sales team and their performance</p>
        </div>
        <div className="hidden md:flex gap-2">
          <Button variant="outline" onClick={() => setAllocationOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Allocate Stock
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add Sales Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Sales Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input placeholder="Enter agent name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="agent@company.com" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="+63 917 555 0101"
                    value={newAgent.phone}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      setNewAgent({ ...newAgent, phone: formatted });
                    }}
                    maxLength={17}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input placeholder="e.g., North, South" value={newAgent.region} onChange={(e) => setNewAgent({ ...newAgent, region: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select
                    value={newAgent.position}
                    onValueChange={(value) => setNewAgent({ ...newAgent, position: value as 'Leader' | 'Mobile Sales' | 'Hermanos Sales Agent' | '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mobile Sales">Mobile Sales</SelectItem>
                      <SelectItem value="Leader">Leader</SelectItem>
                      <SelectItem value="Hermanos Sales Agent">Hermanos Sales Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cities</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Manila, Cebu"
                      value={currentCityInput}
                      onChange={(e) => setCurrentCityInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addCityToNewAgent()}
                    />
                    <Button type="button" variant="outline" onClick={addCityToNewAgent}>
                      Add to Tags
                    </Button>
                  </div>
                  {newAgent.cities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {newAgent.cities.map((city, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {city}
                          <button
                            type="button"
                            onClick={() => removeCityFromNewAgent(city)}
                            className="ml-1 hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button className="w-full" onClick={async () => {
                  if (!newAgent.name.trim() || !newAgent.email.trim()) {
                    toast({ title: 'Error', description: 'Name and email are required', variant: 'destructive' });
                    return;
                  }
                  try {
                    setCreatingAgent(true);
                    // 1) Create auth user via Vercel API route
                    const res = await fetch('/api/create-agent', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: newAgent.email,
                        password: 'Agent@123',
                        full_name: newAgent.name,
                        role: 'sales_agent'
                      })
                    });

                    const fnRes = await res.json();

                    if (!res.ok) {
                      throw new Error(fnRes.error || 'Failed to create user');
                    }

                    const userId = fnRes.userId;
                    if (!userId) throw new Error('Auth user not created');

                    // 2) Insert profile row
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
                        role: 'sales_agent',
                        status: 'active',
                        position: newAgent.position || null,
                      } as any);
                    if (profileErr) throw profileErr;

                    toast({ title: 'Agent Created', description: 'Login password set to Agent@123' });
                    setAddDialogOpen(false);
                    setNewAgent({ name: '', email: '', phone: '', region: '', cities: [], position: '' });
                    fetchAgents();
                  } catch (e: any) {
                    console.error('Create agent error:', e);
                    toast({ title: 'Error', description: e.message || 'Failed to create agent', variant: 'destructive' });
                  } finally {
                    setCreatingAgent(false);
                  }
                }} disabled={creatingAgent}>
                  {creatingAgent ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : 'Create Sales Agent'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile quick actions under title */}
      <div className="md:hidden flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setAllocationOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Allocate Stock
        </Button>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex-1">
              <Plus className="h-4 w-4 mr-2" /> Add Agent
            </Button>
          </DialogTrigger>
          {/* existing DialogContent for add agent remains below */}
        </Dialog>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="agents">Sales Agents</TabsTrigger>
          <TabsTrigger value="teams">Team Management</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agents by name, email, region, or cities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Mobile: card list */}
              <div className="md:hidden space-y-3">
                {filteredAgents.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">No agents found</div>
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
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Position</div>
                          <div>
                            {agent.position ? (
                              (() => {
                                const badge = getPositionBadgeStyles(agent.position);
                                return (
                                  <Badge variant={badge.variant} className={`text-xs ${badge.className}`}>
                                    {agent.position}
                                  </Badge>
                                );
                              })()
                            ) : (
                              <span className="text-muted-foreground text-xs">Not set</span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground">Total Sales</div>
                          <div className="font-semibold">₱{(((agent as any).totalSales ?? agent.totalSales) || 0).toLocaleString()}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-muted-foreground">Orders</div>
                          <div>{(agent as any).ordersCount ?? agent.ordersCount ?? 0}</div>
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
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingAgent(agent);
                          setEditForm({
                            name: agent.name,
                            email: agent.email,
                            phone: agent.phone || '',
                            region: agent.region || '',
                            cities: agent.cities || [],
                            status: (agent as any).status || 'active',
                            position: agent.position || ''
                          });
                          setEditDialogOpen(true);
                        }}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleResetPassword(agent)}>Reset</Button>
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                          setAgentToDelete(agent);
                          setDeleteDialogOpen(true);
                        }}>Delete</Button>
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
                      <TableHead className="text-center">Position</TableHead>
                      <TableHead className="text-center">Active Status</TableHead>
                      <TableHead className="text-center">Total Sales</TableHead>
                      <TableHead className="text-center">Orders</TableHead>
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
                          {agent.position ? (
                            (() => {
                              const badge = getPositionBadgeStyles(agent.position);
                              return (
                                <Badge variant={badge.variant} className={`text-xs ${badge.className}`}>
                                  {agent.position}
                                </Badge>
                              );
                            })()
                          ) : (
                            <span className="text-muted-foreground text-xs">Not set</span>
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
                        <TableCell className="text-center font-semibold">
                          ₱{agent.totalSales.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">{agent.ordersCount}</TableCell>
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
                                Edit Agent
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
                                Delete Agent
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
        </TabsContent>

        {/* Stock Allocation Dialog */}
        <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Allocate Stock to Sales Agent</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Agent Selection */}
              <div className="space-y-2">
                <Label>Select Sales Agent</Label>
                <Select
                  value={allocation.agentId}
                  onValueChange={(value) => setAllocation({ ...allocation, agentId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.filter(a => a.status === 'active').map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.region})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand Selection */}
              <div className="space-y-2">
                <Label>Select Brand</Label>
                <Select
                  value={allocation.brandId}
                  onValueChange={(value) => {
                    setAllocation({ ...allocation, brandId: value });
                    setAllocationItems([]);
                    setCurrentVariant({ variantId: '', quantity: 0 });
                  }}
                  disabled={loadingBrands}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingBrands ? "Loading brands..." : "Choose a brand"} />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map(brand => (
                      <SelectItem key={brand.id} value={brand.id}>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {brand.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {allocation.brandId && selectedBrand && (
                <>
                  {/* Add Variants Section with Tabs */}
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <Label className="text-base font-semibold">Add Variants to Allocate</Label>
                    <Tabs defaultValue="flavor" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="flavor">
                          Flavors ({selectedBrand.flavors.length})
                        </TabsTrigger>
                        <TabsTrigger value="battery">
                          Batteries ({selectedBrand.batteries.length})
                        </TabsTrigger>
                      </TabsList>

                      {/* Flavor Tab */}
                      <TabsContent value="flavor" className="space-y-3 mt-4">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-7">
                            <Select
                              value={currentVariant.variantId}
                              onValueChange={(value) => setCurrentVariant({ ...currentVariant, variantId: value, quantity: 0 })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select flavor" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedBrand.flavors
                                  .filter(v => !allocationItems.find(item => item.variant_id === v.id))
                                  .map(variant => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                      <div className="flex items-center justify-between w-full">
                                        <span>{variant.name}</span>
                                        <span className="text-muted-foreground ml-2">
                                          Stock: {variant.stock} | ₱{variant.price.toFixed(2)}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-3">
                            <Input
                              type="number"
                              placeholder="Quantity"
                              min="1"
                              max={
                                currentVariant.variantId
                                  ? selectedBrand.flavors.find(v => v.id === currentVariant.variantId)?.stock || 0
                                  : undefined
                              }
                              value={currentVariant.quantity || ''}
                              onChange={(e) => {
                                const inputValue = parseInt(e.target.value) || 0;
                                const positiveValue = Math.max(0, inputValue); // Prevent negative numbers
                                const maxStock = currentVariant.variantId
                                  ? selectedBrand.flavors.find(v => v.id === currentVariant.variantId)?.stock || 0
                                  : 0;
                                const cappedValue = maxStock > 0 ? Math.min(positiveValue, maxStock) : positiveValue;
                                setCurrentVariant({ ...currentVariant, quantity: cappedValue });
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-full"
                              onClick={handleAddVariant}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {currentVariant.variantId && (
                          <p className="text-xs text-muted-foreground">
                            Max available: {selectedBrand.flavors.find(v => v.id === currentVariant.variantId)?.stock || 0} units
                          </p>
                        )}
                        {selectedBrand.flavors.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No flavors available for this brand
                          </p>
                        )}
                      </TabsContent>

                      {/* Battery Tab */}
                      <TabsContent value="battery" className="space-y-3 mt-4">
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-7">
                            <Select
                              value={currentVariant.variantId}
                              onValueChange={(value) => setCurrentVariant({ ...currentVariant, variantId: value, quantity: 0 })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select battery" />
                              </SelectTrigger>
                              <SelectContent>
                                {selectedBrand.batteries
                                  .filter(v => !allocationItems.find(item => item.variant_id === v.id))
                                  .map(variant => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                      <div className="flex items-center justify-between w-full">
                                        <span>{variant.name}</span>
                                        <span className="text-muted-foreground ml-2">
                                          Stock: {variant.stock} | ₱{variant.price.toFixed(2)}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-3">
                            <Input
                              type="number"
                              placeholder="Quantity"
                              min="1"
                              max={
                                currentVariant.variantId
                                  ? selectedBrand.batteries.find(v => v.id === currentVariant.variantId)?.stock || 0
                                  : undefined
                              }
                              value={currentVariant.quantity || ''}
                              onChange={(e) => {
                                const inputValue = parseInt(e.target.value) || 0;
                                const positiveValue = Math.max(0, inputValue); // Prevent negative numbers
                                const maxStock = currentVariant.variantId
                                  ? selectedBrand.batteries.find(v => v.id === currentVariant.variantId)?.stock || 0
                                  : 0;
                                const cappedValue = maxStock > 0 ? Math.min(positiveValue, maxStock) : positiveValue;
                                setCurrentVariant({ ...currentVariant, quantity: cappedValue });
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="w-full"
                              onClick={handleAddVariant}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {currentVariant.variantId && (
                          <p className="text-xs text-muted-foreground">
                            Max available: {selectedBrand.batteries.find(v => v.id === currentVariant.variantId)?.stock || 0} units
                          </p>
                        )}
                        {selectedBrand.batteries.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            No batteries available for this brand
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* Allocation Items List */}
                  {allocationItems.length > 0 && (
                    <div className="border rounded-lg p-4 space-y-3">
                      <Label className="text-base font-semibold">Variants to Allocate ({allocationItems.length})</Label>
                      <div className="space-y-2">
                        {allocationItems.map((item) => {
                          const allVariants = [...selectedBrand.flavors, ...selectedBrand.batteries];
                          const variant = allVariants.find(v => v.id === item.variant_id);
                          return (
                            <div key={item.variant_id} className="flex items-center justify-between bg-muted p-3 rounded-md">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{variant?.name}</p>
                                  <Badge
                                    variant="secondary"
                                    className={variant?.variant_type === 'flavor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                                  >
                                    {variant?.variant_type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Available Stock: {variant?.stock} units | Price: ₱{item.price.toFixed(2)}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="text-sm font-semibold">{item.quantity} units</p>
                                  <p className="text-xs text-muted-foreground">
                                    ₱{(item.price * item.quantity).toFixed(2)}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveVariant(item.variant_id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-medium">Total Units:</span>
                        <span className="text-lg font-bold">
                          {allocationItems.reduce((sum, item) => sum + item.quantity, 0)} units
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Value:</span>
                        <span className="text-lg font-bold">
                          ₱{allocationItems.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium">ℹ️ Important:</p>
                <p>Allocating stock to agents adds inventory to their account <strong>without deducting from main inventory</strong>.</p>
              </div>

              <Button
                className="w-full"
                onClick={handleAllocateStock}
                disabled={!allocation.agentId || !allocation.brandId || allocationItems.length === 0 || allocating}
              >
                {allocating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Allocating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Allocate {allocationItems.length > 0 ? `${allocationItems.length} Variant(s)` : 'Stock'}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Agent Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agent Details</DialogTitle>
            </DialogHeader>
            {viewingAgent && (
              <div className="space-y-6 py-2">
                {/* Agent Overview */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-semibold text-lg">{viewingAgent.name}</p>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Email</p>
                        <p className="font-medium break-all">{viewingAgent.email}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Phone</p>
                        <p className="font-medium">{viewingAgent.phone}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Region</p>
                        <p className="font-medium">{viewingAgent.region}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cities</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {viewingAgent.cities.length > 0 ? (
                            viewingAgent.cities.map((city, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {city}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">No cities</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant={viewingAgent.status === 'active' ? 'default' : 'secondary'}>
                          {viewingAgent.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <p className="text-sm text-muted-foreground">Summary</p>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-muted-foreground text-sm">Orders</p>
                        <p className="text-2xl font-bold">{viewOrders.length}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-sm">Total Sales</p>
                        <p className="text-2xl font-bold">₱{viewOrders.reduce((s, o) => s + (o.amount || 0), 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orders Partition */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Order History</Label>
                  {/* Mobile: card list */}
                  <div className="md:hidden space-y-2">
                    {loadingOrders ? (
                      <div className="text-center text-muted-foreground py-4">Loading orders…</div>
                    ) : viewOrders.length === 0 ? (
                      <div className="text-center text-muted-foreground py-4">No orders yet</div>
                    ) : (
                      viewOrders.map((o) => (
                        <div key={o.id} className="rounded-lg border bg-background p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs text-muted-foreground">Order #</div>
                              <div className="font-mono font-semibold">{o.orderNumber}</div>
                            </div>
                            <Badge variant={o.status === 'approved' ? 'default' : o.status === 'pending' ? 'secondary' : 'destructive'}>
                              {o.status}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground">Client</div>
                              <div className="truncate">{o.clientName}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Date</div>
                              <div>{new Date(o.date).toLocaleDateString()}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Items</div>
                              <div>{o.items}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Amount</div>
                              <div className="font-semibold">₱{(o.amount || 0).toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Desktop/Tablet: table */}
                  <div className="hidden md:block border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loadingOrders ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">Loading orders…</TableCell>
                          </TableRow>
                        ) : viewOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">No orders yet</TableCell>
                          </TableRow>
                        ) : (
                          viewOrders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell className="font-mono">{o.orderNumber}</TableCell>
                              <TableCell>{o.clientName}</TableCell>
                              <TableCell>{new Date(o.date).toLocaleDateString()}</TableCell>
                              <TableCell className="text-right">{o.items}</TableCell>
                              <TableCell className="text-right">₱{(o.amount || 0).toLocaleString()}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={o.status === 'approved' ? 'default' : o.status === 'pending' ? 'secondary' : 'destructive'}
                                >
                                  {o.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Agent Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Sales Agent</DialogTitle>
            </DialogHeader>
            {editingAgent && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Enter agent name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="agent@company.com"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="555-0000"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input
                    placeholder="e.g., North, South"
                    value={editForm.region}
                    onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select
                    value={editForm.position}
                    onValueChange={(value) => setEditForm({ ...editForm, position: value as 'Leader' | 'Mobile Sales' | 'Hermanos Sales Agent' | '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mobile Sales">Mobile Sales</SelectItem>
                      <SelectItem value="Leader">Leader</SelectItem>
                      <SelectItem value="Hermanos Sales Agent">Hermanos Sales Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cities</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Manila, Cebu"
                      value={editCityInput}
                      onChange={(e) => setEditCityInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addCityToEditAgent()}
                    />
                    <Button type="button" variant="outline" onClick={addCityToEditAgent}>
                      Add to Tags
                    </Button>
                  </div>
                  {editForm.cities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editForm.cities.map((city, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {city}
                          <button
                            type="button"
                            onClick={() => removeCityFromEditAgent(city)}
                            className="ml-1 hover:text-destructive"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {/* <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={editForm.status} 
                  onValueChange={(value: 'active' | 'inactive') => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                {editForm.status === 'inactive' && (
                  <p className="text-xs text-amber-600">
                    ⚠ Inactive agents cannot login. If they are currently logged in, they will be logged out.
                  </p>
                )}
              </div> */}
                <Button className="w-full" onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Update Confirmation Dialog */}
        <AlertDialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Update</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to update {editingAgent?.name}'s information?
                {editForm.status === 'inactive' && editingAgent?.status === 'active' && (
                  <p className="mt-2 text-amber-600 font-medium">
                    ⚠ This agent will be set to inactive and will be logged out if currently logged in.
                  </p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmUpdate}>
                Confirm Update
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sales Agent</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{agentToDelete?.name}</strong>?
                This action cannot be undone. All data associated with this agent will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Agent
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
                The password will be changed to <strong>"tempPassword123!"</strong> and the agent will need to use this new password to log in.
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
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Status Change Confirmation Dialog */}
        <AlertDialog open={statusChangeDialogOpen} onOpenChange={setStatusChangeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change Agent Status</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to change <strong>{agentToChangeStatus?.name}</strong>'s status to{' '}
                <strong className={newStatus ? 'text-green-600' : 'text-gray-600'}>
                  {newStatus ? 'Active' : 'Inactive'}
                </strong>?
                {newStatus ? (
                  <span className="block mt-2 text-sm text-green-600">
                    ✓ Agent will be able to access the system and create orders
                  </span>
                ) : (
                  <span className="block mt-2 text-sm text-gray-600">
                    ⚠ Agent will lose access to the system and cannot create orders
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={changingStatus}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmStatusChange}
                disabled={changingStatus}
                className={newStatus ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}
              >
                {changingStatus ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  `Set to ${newStatus ? 'Active' : 'Inactive'}`
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <TabsContent value="teams" className="space-y-6">
          <TeamManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

