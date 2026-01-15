import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Package,
  Users,
  TrendingUp,
  Eye,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useInventory } from '@/features/inventory/InventoryContext';
import { unsubscribe } from '@/lib/realtime.helpers';

export default function StockAllocationsPage() {
  const { brands, loading: loadingBrands, refreshInventory } = useInventory();
  const [agentsInventory, setAgentsInventory] = useState<any[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [allocationSearchQuery, setAllocationSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);

  // Full details modal state
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [leaderAgents, setLeaderAgents] = useState<any[]>([]);
  const [loadingLeaderAgents, setLoadingLeaderAgents] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value'>('name');


  // Stock allocation state
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [allocation, setAllocation] = useState({
    agentId: '',
    brandId: ''
  });
  const [allocationItems, setAllocationItems] = useState<any[]>([]);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  const [allocationWarnings, setAllocationWarnings] = useState<string[]>([]);

  const { toast } = useToast();

  // Helper functions for available stock calculation
  const getVariantAvailableStock = (variant: any) => {
    // Use the allocatedStock from the variant object (fetched via InventoryContext)
    const allocated = variant.allocatedStock || 0;
    return variant.stock - allocated;
  };

  const getAvailableVariants = (variants: any[]) => {
    return variants.filter(variant => getVariantAvailableStock(variant) > 0);
  };

  // Fetch all agents inventory data
  const fetchAgentsInventory = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoadingAllocations(true);
      }

      // Fetch agent inventory for leaders only
      const { data, error } = await supabase
        .from('agent_inventory')
        .select(`
          id,
          agent_id,
          variant_id,
          stock,
          allocated_price,
          dsp_price,
          rsp_price,
          profiles!agent_inventory_agent_id_fkey (
            id,
            full_name,
            email,
            role
          ),
          variants (
            id,
            name,
            variant_type,
            brands (
              name
            )
          )
        `)
        .eq('profiles.role', 'team_leader');

      if (error) throw error;

      // Group by agent
      const agentsMap = new Map();

      data?.forEach((item: any) => {
        // Skip items where agent data is null or not a leader
        if (!item.profiles || item.profiles.role !== 'team_leader') {
          console.warn('Skipping inventory item with null/non-leader agent data:', item);
          return;
        }

        const agentId = item.profiles.id;
        const agentName = item.profiles.full_name;
        const agentEmail = item.profiles.email;

        if (!agentsMap.has(agentId)) {
          agentsMap.set(agentId, {
            id: agentId,
            name: agentName,
            email: agentEmail,
            totalStock: 0,
            totalValue: 0,
            totalDspValue: 0,
            totalRspValue: 0,
            items: []
          });
        }

        const agent = agentsMap.get(agentId);
        const unitPrice = item.allocated_price || 0;
        const dspPrice = item.dsp_price || 0;
        const rspPrice = item.rsp_price || 0;

        agent.totalStock += item.stock;
        // Keep totalValue based on unit/allocated price for consistency with other pages
        agent.totalValue += item.stock * unitPrice;
        agent.totalDspValue += item.stock * dspPrice;
        agent.totalRspValue += item.stock * rspPrice;

        agent.items.push({
          id: item.id,
          variantId: item.variants?.id,
          variantName: item.variants?.name || 'Unknown',
          variantType: item.variants?.variant_type || 'unknown',
          brandName: item.variants?.brands?.name || 'Unknown',
          stock: item.stock,
          allocatedPrice: unitPrice,
          dspPrice,
          rspPrice,
          totalValue: item.stock * unitPrice
        });
      });

      const agentsArray = Array.from(agentsMap.values());
      setAgentsInventory(agentsArray);

    } catch (error) {
      console.error('Error fetching agents inventory:', error);
      if (showLoading) {
        toast({
          title: 'Error',
          description: 'Failed to load agents inventory data',
          variant: 'destructive'
        });
      }
    } finally {
      if (showLoading) {
        setLoadingAllocations(false);
      }
    }
  };

  useEffect(() => {
    fetchAgentsInventory();
    fetchAgents();

    // Real-time subscriptions for seamless updates
    let inventoryUpdateTimer: NodeJS.Timeout | null = null;
    let allocatedUpdateTimer: NodeJS.Timeout | null = null;
    let mainInventoryUpdateTimer: NodeJS.Timeout | null = null;

    const debouncedInventoryRefresh = () => {
      if (inventoryUpdateTimer) clearTimeout(inventoryUpdateTimer);
      inventoryUpdateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing agents inventory...');
        fetchAgentsInventory(false); // Pass false to skip loading state
      }, 300);
    };

    const debouncedAllocatedRefresh = () => {
      if (allocatedUpdateTimer) clearTimeout(allocatedUpdateTimer);
      allocatedUpdateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing allocated stock...');
        // Allocated stock is now part of main inventory/brands, so we refresh inventory
        refreshInventory();
      }, 300);
    };

    const debouncedMainInventoryRefresh = () => {
      if (mainInventoryUpdateTimer) clearTimeout(mainInventoryUpdateTimer);
      mainInventoryUpdateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing main inventory...');
        refreshInventory(); // Refresh main inventory for available stock
      }, 300);
    };

    // Subscribe to agent_inventory changes
    const inventoryChannel = supabase
      .channel('stock-allocations-inventory-changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'agent_inventory',
        },
        (payload) => {
          console.log('🔄 Real-time event received:', payload.eventType, payload);
          debouncedInventoryRefresh();
          debouncedAllocatedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for agent_inventory');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error - check Supabase Realtime settings');
        } else {
          console.log('🔄 Real-time subscription status:', status);
        }
      });

    // Subscribe to leader_teams changes
    const teamsChannel = supabase
      .channel('stock-allocations-teams-changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'leader_teams',
        },
        (payload) => {
          console.log('🔄 Real-time event received for leader_teams:', payload.eventType, payload);
          debouncedInventoryRefresh();
          fetchAgents(); // Refresh leaders list
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for leader_teams');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for leader_teams');
        }
      });

    // Subscribe to main_inventory changes (affects available stock)
    const mainInventoryChannel = supabase
      .channel('stock-allocations-main-inventory-changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'main_inventory',
        },
        (payload) => {
          console.log('🔄 Real-time event received for main_inventory:', payload.eventType, payload);
          debouncedMainInventoryRefresh();
          debouncedAllocatedRefresh(); // Also refresh allocated stock calculations
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for main_inventory');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for main_inventory');
        }
      });

    return () => {
      if (inventoryUpdateTimer) clearTimeout(inventoryUpdateTimer);
      if (allocatedUpdateTimer) clearTimeout(allocatedUpdateTimer);
      if (mainInventoryUpdateTimer) clearTimeout(mainInventoryUpdateTimer);
      unsubscribe(inventoryChannel);
      unsubscribe(teamsChannel);
      unsubscribe(mainInventoryChannel);
    };
  }, []);

  // Fetch leaders for allocation
  const fetchAgents = async () => {
    try {
      const { data: leadersData, error: leadersError } = await supabase
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
        .eq('role', 'team_leader')
        .order('created_at', { ascending: false });

      if (leadersError) throw leadersError;

      const leadersWithSales = await Promise.all(
        leadersData.map(async (leader) => {
          // Get sales data for this leader
          const { data: salesData } = await supabase
            .from('client_orders')
            .select('total_amount')
            .eq('agent_id', leader.id)
            .eq('status', 'approved');

          const totalSales = salesData?.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0) || 0;
          const ordersCount = salesData?.length || 0;

          return {
            id: leader.id,
            name: leader.full_name,
            email: leader.email,
            phone: leader.phone || '',
            region: leader.region || '',
            cities: leader.city ? (Array.isArray(leader.city) ? leader.city : leader.city.split(',').map(c => c.trim()).filter(c => c)) : [],
            status: leader.status || 'active',
            role: leader.role || 'team_leader',
            totalSales,
            ordersCount
          };
        })
      );

      setAgents(leadersWithSales);
    } catch (error) {
      console.error('Error fetching leaders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load leaders',
        variant: 'destructive'
      });
    }
  };

  // Fetch agents under a specific leader
  const fetchLeaderAgents = async (leaderId: string) => {
    try {
      setLoadingLeaderAgents(true);

      // Fetch team members under this leader
      const { data: teamData, error: teamError } = await supabase
        .from('leader_teams')
        .select(`
          agent_id,
          profiles!leader_teams_agent_id_fkey(
            id,
            full_name,
            email,
            phone,
            region,
            city,
            status,
            role
          )
        `)
        .eq('leader_id', leaderId);

      if (teamError) throw teamError;

      // Get inventory data for each team member
      const agentsWithInventory = await Promise.all(
        (teamData || []).map(async (teamMember: any) => {
          const agent = teamMember.profiles;

          // Get agent's inventory
          const { data: inventoryData, error: inventoryError } = await supabase
            .from('agent_inventory')
            .select(`
              *,
              variant:variants(
                *,
                brand:brands(*)
              )
            `)
            .eq('agent_id', agent.id)
            .gt('stock', 0);  // Only fetch items with stock > 0

          if (inventoryError) {
            console.error(`Error fetching inventory for agent ${agent.full_name}:`, inventoryError);
            return {
              id: agent.id,
              name: agent.full_name,
              email: agent.email,
              phone: agent.phone || '',
              region: agent.region || '',
              cities: agent.city ? (Array.isArray(agent.city) ? agent.city : agent.city.split(',').map(c => c.trim()).filter(c => c)) : [],
              status: agent.status || 'active',
              role: agent.role || 'mobile_sales',
              totalStock: 0,
              totalValue: 0,
              items: []
            };
          }

          // Process inventory data
          let totalStock = 0;
          let totalValue = 0;
          const items: any[] = [];

          (inventoryData || []).forEach((item: any) => {
            totalStock += item.stock;
            totalValue += item.stock * (item.allocated_price || 0);
            items.push({
              id: item.id,
              variantId: item.variant.id,
              variantName: item.variant.name,
              variantType: item.variant.variant_type,
              brandName: item.variant.brand?.name || 'Unknown',
              stock: item.stock,
              allocatedPrice: item.allocated_price || 0,
              totalValue: item.stock * (item.allocated_price || 0)
            });
          });

          return {
            id: agent.id,
            name: agent.full_name,
            email: agent.email,
            phone: agent.phone || '',
            region: agent.region || '',
            cities: agent.city ? (Array.isArray(agent.city) ? agent.city : agent.city.split(',').map(c => c.trim()).filter(c => c)) : [],
            status: agent.status || 'active',
            role: agent.role || 'mobile_sales',
            totalStock,
            totalValue,
            items
          };
        })
      );

      setLeaderAgents(agentsWithInventory);
    } catch (error) {
      console.error('Error fetching leader agents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team members',
        variant: 'destructive'
      });
    } finally {
      setLoadingLeaderAgents(false);
    }
  };

  // Build allocation items from variant quantities
  const buildAllocationItems = () => {
    if (!allocation.brandId) return { items: [], warnings: [] };

    const selectedBrand = brands.find(b => b.id === allocation.brandId);
    if (!selectedBrand) return { items: [], warnings: [] };

    const items: any[] = [];
    const warnings: string[] = [];

    // Process flavors
    selectedBrand.flavors.forEach(flavor => {
      const quantity = variantQuantities[flavor.id] || 0;
      if (quantity > 0) {
        const sellingPriceRaw = (flavor as any).sellingPrice;
        const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
        // Allow selling price to be 0, only check for NaN or null/undefined
        if (sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0) {
          warnings.push(`${selectedBrand.name} - ${flavor.name} has invalid selling price.`);
          return;
        }
        const availableStock = getVariantAvailableStock(flavor);
        const finalQuantity = Math.min(quantity, availableStock);
        if (finalQuantity > 0) {
          items.push({
            variant_id: flavor.id,
            variant_name: flavor.name,
            variant_type: 'flavor',
            brand_name: selectedBrand.name,
            quantity: finalQuantity,
            selling_price: sellingPrice,
            dsp_price: (flavor as any).dspPrice || null,
            rsp_price: (flavor as any).rspPrice || null,
            total_value: finalQuantity * sellingPrice
          });
        }
      }
    });

    // Process batteries
    selectedBrand.batteries.forEach(battery => {
      const quantity = variantQuantities[battery.id] || 0;
      if (quantity > 0) {
        const sellingPriceRaw = (battery as any).sellingPrice;
        const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
        // Allow selling price to be 0, only check for NaN or null/undefined
        if (sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0) {
          warnings.push(`${selectedBrand.name} - ${battery.name} has invalid selling price.`);
          return;
        }
        const availableStock = getVariantAvailableStock(battery);
        const finalQuantity = Math.min(quantity, availableStock);
        if (finalQuantity > 0) {
          items.push({
            variant_id: battery.id,
            variant_name: battery.name,
            variant_type: 'battery',
            brand_name: selectedBrand.name,
            quantity: finalQuantity,
            selling_price: sellingPrice,
            dsp_price: (battery as any).dspPrice || null,
            rsp_price: (battery as any).rspPrice || null,
            total_value: finalQuantity * sellingPrice
          });
        }
      }
    });

    // Process POSM
    if ((selectedBrand as any).posms) {
      (selectedBrand as any).posms.forEach((posm: any) => {
        const quantity = variantQuantities[posm.id] || 0;
        if (quantity > 0) {
          const sellingPriceRaw = (posm as any).sellingPrice;
          const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
          // Allow selling price to be 0, only check for NaN or null/undefined
          if (sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0) {
            warnings.push(`${selectedBrand.name} - ${posm.name} has invalid selling price.`);
            return;
          }
          const availableStock = getVariantAvailableStock(posm);
          const finalQuantity = Math.min(quantity, availableStock);
          if (finalQuantity > 0) {
            items.push({
              variant_id: posm.id,
              variant_name: posm.name,
              variant_type: 'posm',
              brand_name: selectedBrand.name,
              quantity: finalQuantity,
              selling_price: sellingPrice,
              dsp_price: (posm as any).dspPrice || null,
              rsp_price: (posm as any).rspPrice || null,
              total_value: finalQuantity * sellingPrice
            });
          }
        }
      });
    }

    return { items, warnings };
  };

  // Update allocation items when variant quantities change
  useEffect(() => {
    if (!allocation.brandId) {
      setAllocationItems([]);
      setAllocationWarnings([]);
      return;
    }
    const { items, warnings } = buildAllocationItems();
    setAllocationItems(items);
    setAllocationWarnings(warnings);
  }, [variantQuantities, allocation.brandId, brands]);

  // Handle removing variant from allocation
  const handleRemoveVariant = (variantId: string) => {
    setVariantQuantities(prev => {
      const updated = { ...prev };
      delete updated[variantId];
      return updated;
    });
  };

  // Handle confirming allocation
  const handleConfirmAllocation = async () => {
    if (!allocation.agentId || allocationItems.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select a leader and add items to allocate',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Use RPC to perform allocation atomically on the server
      const userRes = await supabase.auth.getUser();
      const performerId = userRes.data.user?.id;

      // Validate performer
      if (!performerId) throw new Error('User not authenticated');

      // Call RPC per item to ensure stock checks and logging
      for (const item of allocationItems) {
        const { data, error } = await supabase.rpc('allocate_to_leader', {
          p_leader_id: allocation.agentId,
          p_variant_id: item.variant_id,
          p_quantity: item.quantity,
          p_performed_by: performerId,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Allocation failed');
      }

      toast({
        title: 'Success',
        description: 'Stock allocated successfully'
      });

      // Reset form
      setAllocation({ agentId: '', brandId: '' });
      setAllocationItems([]);
      setVariantQuantities({});
      setAllocationOpen(false);

      // Immediately refresh all data for instant UI feedback
      // Immediately refresh all data for instant UI feedback
      await Promise.all([
        fetchAgentsInventory(false),
        refreshInventory() // Refresh main inventory to update available stock
      ]);

      // Real-time subscriptions will also keep data updated in the background
    } catch (error) {
      console.error('Error allocating stock:', error);
      toast({
        title: 'Error',
        description: 'Failed to allocate stock',
        variant: 'destructive'
      });
    }
  };

  const filteredAgents = agentsInventory.filter(agent =>
    agent.name.toLowerCase().includes(allocationSearchQuery.toLowerCase()) ||
    agent.email.toLowerCase().includes(allocationSearchQuery.toLowerCase())
  );

  const sortedAgents = [...filteredAgents].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'stock':
        return b.totalStock - a.totalStock;
      case 'value':
        return b.totalValue - a.totalValue;
      default:
        return 0;
    }
  });

  const totalAgents = agentsInventory.length;
  const totalStock = agentsInventory.reduce((sum, agent) => sum + agent.totalStock, 0);
  const totalValue = agentsInventory.reduce((sum, agent) => sum + agent.totalValue, 0);
  const averageStock = totalAgents > 0 ? Math.round(totalStock / totalAgents) : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Allocations</h1>
          <p className="text-muted-foreground">
            View and manage inventory distribution across all leaders
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAllocationOpen(true)}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Allocate Stock
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{totalAgents}</div>
                <div className="text-xs text-muted-foreground">Total Leaders</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{totalStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">₱{totalValue.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold">{averageStock}</div>
                <div className="text-xs text-muted-foreground">Avg Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leaders by name or email..."
                value={allocationSearchQuery}
                onChange={(e) => setAllocationSearchQuery(e.target.value)}
                className="pl-10 h-11"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex gap-2">
              <Label className="text-sm font-medium text-muted-foreground self-center">Sort by:</Label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'value')}
                className="flex h-11 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="name">Name</option>
                <option value="stock">Stock</option>
                <option value="value">Value</option>
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                Cards
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Content Display */}
      {loadingAllocations ? (
        <Card>
          <CardContent className="p-12">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading leaders inventory...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : sortedAgents.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No leaders found</h3>
              <p className="text-muted-foreground">
                {allocationSearchQuery ? 'Try adjusting your search criteria' : 'No leaders have inventory allocated yet'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card>
          <CardHeader>
            <CardTitle>Leader Inventory Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leader</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cities</TableHead>
                    <TableHead className="text-right">Total Stock</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Total DSP</TableHead>
                    <TableHead className="text-right">Total RSP</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-muted-foreground">{agent.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {agent.cities && agent.cities.length > 0 ? (
                            agent.cities.map((city: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {city}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs italic">No cities assigned</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-semibold">
                        {agent.totalStock.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{agent.totalValue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground">
                        ₱{(agent.totalDspValue || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground">
                        ₱{(agent.totalRspValue || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {agent.items.length} items
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAgent(agent);
                            setShowAgentDetails(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAgents.map((agent) => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{agent.email}</p>
                  </div>
                  <Badge variant="secondary">
                    {agent.items.length} items
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {agent.totalStock.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Stock</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      ₱{agent.totalValue.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Value</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Top Items:</div>
                  {agent.items.slice(0, 3).map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="truncate">{item.brandName} - {item.variantName}</span>
                      <span className="font-medium">{item.stock}</span>
                    </div>
                  ))}
                  {agent.items.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{agent.items.length - 3} more items
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedAgent(agent);
                    setShowAgentDetails(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View All Items
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Agent Details Dialog */}
      <Dialog open={showAgentDetails} onOpenChange={setShowAgentDetails}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              {selectedAgent?.name}'s Inventory
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              View detailed stock allocation and inventory value
            </p>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-6 pt-4">
              {/* Enhanced Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <Package className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-blue-900">{selectedAgent.totalStock.toLocaleString()}</div>
                        <div className="text-sm text-blue-700">Total Units</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-green-900">
                          ₱{selectedAgent.totalValue.toLocaleString()}
                        </div>
                        <div className="text-sm text-green-700">
                          Total Value (Unit Price)
                        </div>
                        <div className="text-xs text-foreground font-medium mt-1">
                          DSP: ₱
                          {selectedAgent.items
                            .reduce(
                              (sum: number, item: any) =>
                                sum + (item.dspPrice || 0) * item.stock,
                              0
                            )
                            .toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          {' • '}
                          RSP: ₱
                          {selectedAgent.items
                            .reduce(
                              (sum: number, item: any) =>
                                sum + (item.rspPrice || 0) * item.stock,
                              0
                            )
                            .toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 bg-purple-50/50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                        <BarChart3 className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-3xl font-bold text-purple-900">{selectedAgent.items.length}</div>
                        <div className="text-sm text-purple-700">Product Types</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Inventory Items with improved styling */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Inventory Breakdown</h3>
                  <Badge variant="outline">{selectedAgent.items.length} items</Badge>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="font-semibold">Product</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="text-center font-semibold">Stock</TableHead>
                        <TableHead className="text-right font-semibold">Unit / DSP / RSP</TableHead>
                        <TableHead className="text-right font-semibold">Totals</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedAgent.items.map((item: any, index: number) => {
                        const unitPrice = item.allocatedPrice || 0;
                        const dspPrice = item.dspPrice || 0;
                        const rspPrice = item.rspPrice || 0;

                        const unitTotal = unitPrice * item.stock;
                        const dspTotal = dspPrice * item.stock;
                        const rspTotal = rspPrice * item.stock;

                        return (
                          <TableRow key={item.id} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{item.brandName}</div>
                                <div className="text-sm text-muted-foreground">{item.variantName}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.variantType === 'flavor' ? 'default' : item.variantType === 'battery' ? 'secondary' : 'outline'}>
                                {item.variantType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{item.stock.toLocaleString()}</span>
                              <span className="text-muted-foreground text-sm"> units</span>
                            </TableCell>
                            <TableCell className="text-right text-xs sm:text-sm">
                              <div className="flex flex-col items-end gap-0.5">
                                <div>
                                  Unit:{' '}
                                  <span className="font-semibold">
                                    ₱{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="text-muted-foreground">
                                  DSP: ₱{dspPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • RSP:{' '}
                                  ₱{rspPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs sm:text-sm">
                              <div className="flex flex-col items-end gap-0.5">
                                <div className="font-bold text-primary">
                                  Total:{' '}
                                  ₱{unitTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-muted-foreground">
                                  DSP: ₱{dspTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • RSP:{' '}
                                  ₱{rspTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* View Team Button */}
              <div className="flex justify-center pt-2 border-t">
                <Button
                  onClick={() => {
                    fetchLeaderAgents(selectedAgent.id);
                    setShowFullDetails(true);
                  }}
                  className="gap-2"
                  size="lg"
                >
                  <Users className="h-5 w-5" />
                  View Team Members' Inventory
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Details Modal - Team Members */}
      <Dialog open={showFullDetails} onOpenChange={setShowFullDetails}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              {selectedAgent?.name}'s Team Inventory
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Complete overview of all team members and their allocated stock
            </p>
          </DialogHeader>
          {loadingLeaderAgents ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <span className="text-lg font-medium">Loading team members...</span>
                <p className="text-sm text-muted-foreground">Please wait while we fetch the data</p>
              </div>
            </div>
          ) : leaderAgents.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No team members found</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                This leader doesn't have any agents assigned to their team yet. Assign agents from the Team Management section.
              </p>
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              {/* Enhanced Team Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-900">{leaderAgents.length}</div>
                      <div className="text-sm text-blue-700 mt-1">Team Members</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-900">
                        {leaderAgents.reduce((sum, agent) => sum + agent.totalStock, 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-green-700 mt-1">Total Units</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-purple-200 bg-purple-50/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-900">
                        ₱{leaderAgents.reduce((sum, agent) => sum + agent.totalValue, 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-purple-700 mt-1">Total Value</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-900">
                        {leaderAgents.reduce((sum, agent) => sum + agent.items.length, 0)}
                      </div>
                      <div className="text-sm text-orange-700 mt-1">Product Types</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Team Members Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Team Members</h3>
                  <Badge variant="outline" className="text-sm">{leaderAgents.length} agents</Badge>
                </div>

                <div className="grid gap-4">
                  {leaderAgents.map((agent) => (
                    <Card key={agent.id} className="hover:shadow-lg transition-all border-2 hover:border-primary/50">
                      <CardHeader className="pb-4 bg-gradient-to-r from-muted/30 to-muted/10">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-lg font-bold text-primary">{agent.name.charAt(0)}</span>
                            </div>
                            <div>
                              <CardTitle className="text-xl">{agent.name}</CardTitle>
                              <p className="text-sm text-muted-foreground mt-1">{agent.email}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">📍 {agent.region}</p>
                            </div>
                          </div>
                          <div className="text-right space-y-2">
                            <Badge variant={agent.role === 'team_leader' ? 'default' : 'secondary'} className="text-xs">
                              {agent.role === 'team_leader' ? '👑 Team Leader' : '📱 Mobile Sales'}
                            </Badge>
                            <div className="space-y-1">
                              <div className="flex items-center justify-end gap-2 text-sm">
                                <Package className="h-4 w-4 text-blue-600" />
                                <span className="font-bold text-blue-900">{agent.totalStock.toLocaleString()}</span>
                                <span className="text-muted-foreground">units</span>
                              </div>
                              <div className="flex items-center justify-end gap-2 text-sm">
                                <TrendingUp className="h-4 w-4 text-green-600" />
                                <span className="font-bold text-green-900">₱{agent.totalValue.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        {agent.items.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No inventory allocated yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold">Inventory Breakdown</div>
                              <Badge variant="outline">{agent.items.length} products</Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {agent.items.map((item: any) => (
                                <div key={item.id} className="border rounded-lg p-3 bg-gradient-to-br from-background to-muted/20 hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-start gap-2 mb-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{item.brandName}</div>
                                      <div className="text-xs text-muted-foreground truncate">{item.variantName}</div>
                                    </div>
                                    <Badge variant={item.variantType === 'flavor' ? 'default' : item.variantType === 'battery' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                                      {item.variantType}
                                    </Badge>
                                  </div>
                                  <div className="flex justify-between items-center pt-2 border-t">
                                    <div className="text-sm">
                                      <span className="font-bold">{item.stock}</span>
                                      <span className="text-muted-foreground text-xs"> units</span>
                                    </div>
                                    <div className="text-sm font-semibold text-primary">
                                      ₱{item.totalValue.toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock Allocation Dialog */}
      <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-primary" />
              </div>
              Allocate Stock to Team Leader
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Select a leader, choose products, and allocate stock from main inventory
            </p>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Selection Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Leader Selection Card */}
              <Card className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Select Team Leader
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={allocation.agentId}
                    onValueChange={(value) => setAllocation({ ...allocation, agentId: value })}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Choose a leader" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.filter(a => a.status === 'active').map(leader => (
                        <SelectItem key={leader.id} value={leader.id}>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                              {leader.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium">{leader.name}</div>
                              <div className="text-xs text-muted-foreground">📍 {leader.region}</div>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Brand Selection Card */}
              <Card className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Select Brand
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select
                    value={allocation.brandId}
                    onValueChange={(value) => {
                      setAllocation({ ...allocation, brandId: value });
                      setAllocationItems([]);
                      setVariantQuantities({});
                      setAllocationWarnings([]);
                    }}
                    disabled={loadingBrands}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={loadingBrands ? "Loading brands..." : "Choose a brand"} />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map(brand => (
                        <SelectItem key={brand.id} value={brand.id}>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            <span className="font-medium">{brand.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {allocation.brandId && brands.find(b => b.id === allocation.brandId) && (
              <>
                {/* Add Variants Section with Enhanced Tabs */}
                <Card className="border-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Select Products to Allocate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="flavor" className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-12">
                        <TabsTrigger value="flavor" className="gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                          Flavors ({brands.find(b => b.id === allocation.brandId)?.flavors.filter(v => getVariantAvailableStock(v) > 0).length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="battery" className="gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500"></div>
                          Batteries ({brands.find(b => b.id === allocation.brandId)?.batteries.filter(v => getVariantAvailableStock(v) > 0).length || 0})
                        </TabsTrigger>
                        <TabsTrigger value="posm" className="gap-2">
                          <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                          POSM ({((brands.find(b => b.id === allocation.brandId) as any)?.posms || []).filter((v: any) => getVariantAvailableStock(v) > 0).length || 0})
                        </TabsTrigger>
                      </TabsList>

                      {/* Flavor Tab */}
                      <TabsContent value="flavor" className="space-y-3 mt-4">
                        {brands.find(b => b.id === allocation.brandId)?.flavors.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No flavors available for this brand
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {brands.find(b => b.id === allocation.brandId)?.flavors
                              .filter(v => getVariantAvailableStock(v) > 0)
                              .map(variant => {
                                const sellingPriceRaw = (variant as any).sellingPrice;
                                const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
                                // Only flag as invalid if null, undefined, NaN, or negative (allow 0)
                                const hasInvalidPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0;
                                const availableStock = getVariantAvailableStock(variant);
                                const quantity = variantQuantities[variant.id] || 0;

                                return (
                                  <div
                                    key={variant.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${hasInvalidPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                      }`}
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        {hasInvalidPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                        <span>{variant.name}</span>
                                      </div>
                                      <div className={`text-sm ${hasInvalidPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                        {hasInvalidPrice ? (
                                          'Invalid Selling Price. Please Proceed To The Main Inventory Page To Set The Selling Price.'
                                        ) : (
                                          <>
                                            Selling Price: ₱{sellingPrice.toFixed(2)}
                                            {(variant as any).dspPrice && ` • DSP: ₱${(variant as any).dspPrice.toFixed(2)}`}
                                            {(variant as any).rspPrice && ` • RSP: ₱${(variant as any).rspPrice.toFixed(2)}`}
                                          </>
                                        )} • Available: {availableStock} units
                                      </div>
                                    </div>
                                    <div className="w-28">
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        min="0"
                                        max={availableStock}
                                        value={quantity === 0 ? '' : quantity}
                                        onChange={(e) => {
                                          const inputValue = parseInt(e.target.value) || 0;
                                          const cappedValue = Math.max(0, Math.min(inputValue, availableStock));
                                          setVariantQuantities(prev => ({
                                            ...prev,
                                            [variant.id]: cappedValue
                                          }));
                                        }}
                                        disabled={hasInvalidPrice}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </TabsContent>

                      {/* Battery Tab */}
                      <TabsContent value="battery" className="space-y-3 mt-4">
                        {brands.find(b => b.id === allocation.brandId)?.batteries.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No batteries available for this brand
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {brands.find(b => b.id === allocation.brandId)?.batteries
                              .filter(v => getVariantAvailableStock(v) > 0)
                              .map(variant => {
                                const sellingPriceRaw = (variant as any).sellingPrice;
                                const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
                                // Only flag as invalid if null, undefined, NaN, or negative (allow 0)
                                const hasInvalidPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0;
                                const availableStock = getVariantAvailableStock(variant);
                                const quantity = variantQuantities[variant.id] || 0;

                                return (
                                  <div
                                    key={variant.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${hasInvalidPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                      }`}
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        {hasInvalidPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                        <span>{variant.name}</span>
                                      </div>
                                      <div className={`text-sm ${hasInvalidPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                        {hasInvalidPrice ? (
                                          'Invalid Selling Price'
                                        ) : (
                                          <>
                                            Selling Price: ₱{sellingPrice.toFixed(2)}
                                            {(variant as any).dspPrice && ` • DSP: ₱${(variant as any).dspPrice.toFixed(2)}`}
                                            {(variant as any).rspPrice && ` • RSP: ₱${(variant as any).rspPrice.toFixed(2)}`}
                                          </>
                                        )} • Available: {availableStock} units
                                      </div>
                                    </div>
                                    <div className="w-28">
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        min="0"
                                        max={availableStock}
                                        value={quantity === 0 ? '' : quantity}
                                        onChange={(e) => {
                                          const inputValue = parseInt(e.target.value) || 0;
                                          const cappedValue = Math.max(0, Math.min(inputValue, availableStock));
                                          setVariantQuantities(prev => ({
                                            ...prev,
                                            [variant.id]: cappedValue
                                          }));
                                        }}
                                        disabled={hasInvalidPrice}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </TabsContent>

                      {/* POSM Tab */}
                      <TabsContent value="posm" className="space-y-3 mt-4">
                        {((brands.find(b => b.id === allocation.brandId) as any)?.posms || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No POSM available for this brand
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {((brands.find(b => b.id === allocation.brandId) as any)?.posms || [])
                              .filter((v: any) => getVariantAvailableStock(v) > 0)
                              .map((variant: any) => {
                                const sellingPriceRaw = variant.sellingPrice;
                                const sellingPrice = typeof sellingPriceRaw === 'number' ? sellingPriceRaw : Number(sellingPriceRaw);
                                // Only flag as invalid if null, undefined, NaN, or negative (allow 0)
                                const hasInvalidPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || Number.isNaN(sellingPrice) || sellingPrice < 0;
                                const availableStock = getVariantAvailableStock(variant);
                                const quantity = variantQuantities[variant.id] || 0;

                                return (
                                  <div
                                    key={variant.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border ${hasInvalidPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                      }`}
                                  >
                                    <div className="flex-1">
                                      <div className="font-medium flex items-center gap-2">
                                        {hasInvalidPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                        <span>{variant.name}</span>
                                      </div>
                                      <div className={`text-sm ${hasInvalidPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                        {hasInvalidPrice ? (
                                          'Invalid Selling Price'
                                        ) : (
                                          <>
                                            Selling Price: ₱{sellingPrice.toFixed(2)}
                                            {variant.dspPrice && ` • DSP: ₱${variant.dspPrice.toFixed(2)}`}
                                            {variant.rspPrice && ` • RSP: ₱${variant.rspPrice.toFixed(2)}`}
                                          </>
                                        )} • Available: {availableStock} units
                                      </div>
                                    </div>
                                    <div className="w-28">
                                      <Input
                                        type="number"
                                        placeholder="0"
                                        min="0"
                                        max={availableStock}
                                        value={quantity === 0 ? '' : quantity}
                                        onChange={(e) => {
                                          const inputValue = parseInt(e.target.value) || 0;
                                          const cappedValue = Math.max(0, Math.min(inputValue, availableStock));
                                          setVariantQuantities(prev => ({
                                            ...prev,
                                            [variant.id]: cappedValue
                                          }));
                                        }}
                                        disabled={hasInvalidPrice}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Enhanced Allocation Items List */}
                {allocationItems.length > 0 && (
                  <Card className="border-2 border-green-200 bg-green-50/20">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          Selected Items ({allocationItems.length})
                        </CardTitle>
                        <Badge variant="default" className="bg-green-600">
                          Total: ₱{allocationItems.reduce((sum, item) => sum + item.total_value, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {allocationItems.map((item, index) => (
                          <div key={index} className="flex items-center justify-between p-4 bg-background rounded-lg border-2 hover:border-primary/50 transition-colors">
                            <div className="flex-1">
                              <div className="font-semibold text-lg">{item.brand_name}</div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                                <span>{item.variant_name}</span>
                                <span>•</span>
                                <Badge variant="outline" className="text-xs">
                                  {item.variant_type}
                                </Badge>
                                <span>•</span>
                                <span>Selling: ₱{item.selling_price.toFixed(2)}</span>
                                {item.dsp_price && (
                                  <>
                                    <span>•</span>
                                    <span>DSP: ₱{item.dsp_price.toFixed(2)}</span>
                                  </>
                                )}
                                {item.rsp_price && (
                                  <>
                                    <span>•</span>
                                    <span>RSP: ₱{item.rsp_price.toFixed(2)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-lg font-bold text-blue-600">
                                  {item.quantity} units
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  ₱{item.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveVariant(item.variant_id)}
                                className="hover:bg-red-100 hover:text-red-600"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Total Summary */}
                      <div className="border-t-2 pt-4 mt-4 space-y-3">
                        <div className="flex justify-between items-center text-lg">
                          <div className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-600" />
                            <span className="font-bold text-blue-900">Total Items: {allocationItems.length}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className="font-bold">Total Units: {allocationItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                          <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
                            <div className="text-xs text-muted-foreground uppercase font-semibold">Total Unit Price</div>
                            <div className="text-xl font-bold text-primary">
                              ₱{allocationItems.reduce((sum, item) => sum + item.total_value, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <div className="text-xs text-blue-700 uppercase font-semibold">Total DSP Price</div>
                            <div className="text-xl font-bold text-blue-900">
                              ₱{allocationItems.reduce((sum, item) => sum + ((item.dsp_price || 0) * item.quantity), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                            <div className="text-xs text-purple-700 uppercase font-semibold">Total RSP Price</div>
                            <div className="text-xl font-bold text-purple-900">
                              ₱{allocationItems.reduce((sum, item) => sum + ((item.rsp_price || 0) * item.quantity), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {allocationWarnings.length > 0 && (
                  <Card className="border-2 border-yellow-400 bg-yellow-50/50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-5 w-5 text-yellow-700" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-yellow-900 mb-2">⚠️ Action Required: Set Prices First</p>
                          <ul className="space-y-1.5 text-sm text-yellow-800">
                            {allocationWarnings.map((warning, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="text-yellow-600 mt-0.5">•</span>
                                <span>{warning}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Enhanced Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t-2">
                  <div className="text-sm text-muted-foreground">
                    {allocationItems.length > 0 ? (
                      <span className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        {allocationItems.length} item{allocationItems.length > 1 ? 's' : ''} ready for allocation
                      </span>
                    ) : (
                      <span>Select products above to begin allocation</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setAllocationOpen(false)}
                      className="gap-2"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="lg"
                      onClick={handleConfirmAllocation}
                      disabled={!allocation.agentId || allocationItems.length === 0 || allocationWarnings.length > 0}
                      className="gap-2"
                    >
                      <CheckCircle className="h-5 w-5" />
                      Allocate Stock Now
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
