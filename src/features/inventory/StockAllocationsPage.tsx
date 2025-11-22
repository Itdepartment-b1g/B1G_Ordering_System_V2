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
import { getAllAgentsInventory } from '@/lib/database.helpers';
import { supabase } from '@/lib/supabase';
import { useInventory } from '@/features/inventory/InventoryContext';
import { unsubscribe } from '@/lib/realtime.helpers';

export default function StockAllocationsPage() {
  const { brands, loading: loadingBrands } = useInventory();
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
  const [allocatedStock, setAllocatedStock] = useState<Record<string, number>>({});
  const [loadingAllocatedStock, setLoadingAllocatedStock] = useState(false);
  
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

  // Fetch allocated stock data
  const fetchAllocatedStock = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoadingAllocatedStock(true);
      }
      
      const { data: allocationData, error } = await supabase
        .from('agent_inventory')
        .select(`
          variant_id,
          stock
        `);

      if (error) throw error;

      // Group allocations by variant_id
      const allocations: Record<string, number> = {};
      allocationData?.forEach(item => {
        allocations[item.variant_id] = (allocations[item.variant_id] || 0) + item.stock;
      });

      setAllocatedStock(allocations);
    } catch (error) {
      console.error('Error fetching allocated stock:', error);
      if (showLoading) {
        toast({
          title: 'Error',
          description: 'Failed to load allocation data',
          variant: 'destructive'
        });
      }
    } finally {
      if (showLoading) {
        setLoadingAllocatedStock(false);
      }
    }
  };

  // Helper functions for available stock calculation
  const getVariantAllocatedStock = (variantId: string) => {
    return allocatedStock[variantId] || 0;
  };

  const getVariantAvailableStock = (variant: any) => {
    return variant.stock - getVariantAllocatedStock(variant.id);
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
      const data = await getAllAgentsInventory();
      
      // Group by agent
      const agentsMap = new Map();
      
      data.forEach((item: any) => {
        // Skip items where agent data is null (shouldn't happen with proper filtering, but safety check)
        if (!item.profiles) {
          console.warn('Skipping inventory item with null agent data:', item);
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
            items: []
          });
        }
        
        const agent = agentsMap.get(agentId);
        agent.totalStock += item.stock;
        agent.totalValue += item.stock * (item.allocated_price || 0);
        agent.items.push({
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
    fetchAllocatedStock();

    // Real-time subscriptions for seamless updates
    let inventoryUpdateTimer: NodeJS.Timeout | null = null;
    let allocatedUpdateTimer: NodeJS.Timeout | null = null;

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
        fetchAllocatedStock(false); // Pass false to skip loading state
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

    return () => {
      if (inventoryUpdateTimer) clearTimeout(inventoryUpdateTimer);
      if (allocatedUpdateTimer) clearTimeout(allocatedUpdateTimer);
      unsubscribe(inventoryChannel);
      unsubscribe(teamsChannel);
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
          position,
          role
        `)
        .eq('role', 'sales_agent')
        .eq('position', 'Leader')
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
            position: leader.position || undefined,
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
            position
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
              position: agent.position || undefined,
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
            position: agent.position || undefined,
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
        if (!sellingPrice || Number.isNaN(sellingPrice) || sellingPrice <= 0) {
          warnings.push(`${selectedBrand.name} - ${flavor.name} has no selling price set.`);
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
        if (!sellingPrice || Number.isNaN(sellingPrice) || sellingPrice <= 0) {
          warnings.push(`${selectedBrand.name} - ${battery.name} has no selling price set. Please Proceed To The Main Inventory Page To Set The Selling Price.`);
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
            total_value: finalQuantity * sellingPrice
          });
        }
      }
    });

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

      // Data will refresh automatically via real-time subscriptions
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
                    <TableHead className="text-right">Total Stock</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-muted-foreground">{agent.email}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {agent.totalStock.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{agent.totalValue.toLocaleString()}
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAgent?.name}'s Inventory Details
            </DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-6">
              {/* Agent Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedAgent.totalStock.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Stock</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">₱{selectedAgent.totalValue.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Value</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedAgent.items.length}</div>
                  <div className="text-sm text-muted-foreground">Total Categorys</div>
                </div>
              </div>

              {/* Inventory Items Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedAgent.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.brandName}</TableCell>
                        <TableCell>{item.variantName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.variantType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.stock.toLocaleString()}</TableCell>
                        <TableCell className="text-right">₱{item.allocatedPrice.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ₱{item.totalValue.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* View Full Details Button */}
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => {
                    fetchLeaderAgents(selectedAgent.id);
                    setShowFullDetails(true);
                  }}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  View Full Details (Team Members)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full Details Modal - Team Members */}
      <Dialog open={showFullDetails} onOpenChange={setShowFullDetails}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedAgent?.name}'s Team Members Inventory
            </DialogTitle>
          </DialogHeader>
          {loadingLeaderAgents ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading team members...</span>
              </div>
            </div>
          ) : leaderAgents.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No team members found</h3>
              <p className="text-muted-foreground">
                This leader doesn't have any agents assigned to their team yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Team Summary */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{leaderAgents.length}</div>
                  <div className="text-sm text-muted-foreground">Team Members</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {leaderAgents.reduce((sum, agent) => sum + agent.totalStock, 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Stock</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    ₱{leaderAgents.reduce((sum, agent) => sum + agent.totalValue, 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Value</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {leaderAgents.reduce((sum, agent) => sum + agent.items.length, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Categorys</div>
                </div>
              </div>

              {/* Team Members List */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Team Members Inventory</h3>
                <div className="grid gap-4">
                  {leaderAgents.map((agent) => (
                    <Card key={agent.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">{agent.name}</CardTitle>
                            <p className="text-sm text-muted-foreground">{agent.email}</p>
                            <p className="text-xs text-muted-foreground">{agent.region}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="secondary" className="mb-2">
                              {agent.position || 'Mobile Sales'}
                            </Badge>
                            <div className="text-sm">
                              <div className="font-semibold">{agent.totalStock.toLocaleString()} stock</div>
                              <div className="text-muted-foreground">₱{agent.totalValue.toLocaleString()} value</div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {agent.items.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground">
                            No inventory allocated yet
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Inventory Items:</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {agent.items.map((item: any) => (
                                <div key={item.id} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                                  <div className="flex-1">
                                    <div className="font-medium">{item.brandName} - {item.variantName}</div>
                                    <div className="text-muted-foreground">{item.variantType}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold">{item.stock} units</div>
                                    <div className="text-muted-foreground">₱{item.totalValue.toLocaleString()}</div>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Stock to Leader</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Leader Selection */}
            <div className="space-y-2">
              <Label>Select Leader</Label>
              <Select 
                value={allocation.agentId} 
                onValueChange={(value) => setAllocation({...allocation, agentId: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a leader" />
                </SelectTrigger>
                <SelectContent>
                  {agents.filter(a => a.status === 'active').map(leader => (
                    <SelectItem key={leader.id} value={leader.id}>
                      {leader.name} ({leader.region})
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
                  setAllocation({...allocation, brandId: value});
                  setAllocationItems([]);
                  setVariantQuantities({});
                  setAllocationWarnings([]);
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

            {allocation.brandId && brands.find(b => b.id === allocation.brandId) && (
              <>
                {/* Add Variants Section with Tabs */}
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <Label className="text-base font-semibold">Add Variants to Allocate</Label>
                  <Tabs defaultValue="flavor" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="flavor">
                        Flavors ({brands.find(b => b.id === allocation.brandId)?.flavors.filter(v => getVariantAvailableStock(v) > 0).length || 0})
                      </TabsTrigger>
                      <TabsTrigger value="battery">
                        Batteries ({brands.find(b => b.id === allocation.brandId)?.batteries.filter(v => getVariantAvailableStock(v) > 0).length || 0})
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
                              const hasNoPrice = !sellingPrice || Number.isNaN(sellingPrice) || sellingPrice <= 0;
                              const availableStock = getVariantAvailableStock(variant);
                              const quantity = variantQuantities[variant.id] || 0;
                              
                              return (
                                <div 
                                  key={variant.id} 
                                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                  }`}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium flex items-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                      <span>{variant.name}</span>
                                    </div>
                                    <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                      {hasNoPrice ? 'No Selling Price Set. Please Proceed To The Main Inventory Page To Set The Selling Price.' : `Selling Price: ₱${sellingPrice.toFixed(2)}`} • Available: {availableStock} units
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
                                      disabled={hasNoPrice}
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
                              const hasNoPrice = !sellingPrice || Number.isNaN(sellingPrice) || sellingPrice <= 0;
                              const availableStock = getVariantAvailableStock(variant);
                              const quantity = variantQuantities[variant.id] || 0;
                              
                              return (
                                <div 
                                  key={variant.id} 
                                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                                    hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                  }`}
                                >
                                  <div className="flex-1">
                                    <div className="font-medium flex items-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                      <span>{variant.name}</span>
                                    </div>
                                    <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                      {hasNoPrice ? 'No Selling Price Set' : `Selling Price: ₱${sellingPrice.toFixed(2)}`} • Available: {availableStock} units
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
                                      disabled={hasNoPrice}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Allocation Items List */}
                {allocationItems.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <Label className="text-base font-semibold">Items to Allocate</Label>
                    <div className="space-y-2">
                      {allocationItems.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium">{item.brand_name} - {item.variant_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.variant_type} • Selling Price: ₱{item.selling_price.toFixed(2)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {item.quantity} units
                            </Badge>
                            <Badge variant="outline">
                              ₱{item.total_value.toFixed(2)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveVariant(item.variant_id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Total Summary */}
                    <div className="border-t pt-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Total Categorys: {allocationItems.length}</span>
                        <span className="font-semibold">
                          Total Value: ₱{allocationItems.reduce((sum, item) => sum + item.total_value, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {allocationWarnings.length > 0 && (
                  <div className="border border-yellow-300 bg-yellow-50 p-3 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-700 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-yellow-800">Selling price required before allocation</p>
                      <ul className="mt-1 space-y-1 text-sm text-yellow-800 list-disc list-inside">
                        {allocationWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setAllocationOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConfirmAllocation}
                    disabled={!allocation.agentId || allocationItems.length === 0 || allocationWarnings.length > 0}
                  >
                    Allocate Stock
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
