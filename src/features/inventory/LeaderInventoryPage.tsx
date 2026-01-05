import { useState, useEffect, useMemo } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Search,
  Package,
  Users,
  TrendingUp,
  Eye,
  RefreshCw,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  ArrowRight,
  Crown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { canLeadTeam } from '@/lib/roleUtils';

export default function LeaderInventoryPage() {
  const { user } = useAuth();
  const [leaderInventory, setLeaderInventory] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showMemberDetails, setShowMemberDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value'>('name');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Inventory pagination and filtering
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [inventorySortBy, setInventorySortBy] = useState<'name' | 'stock' | 'value' | 'available'>('name');
  const [inventoryTypeFilter, setInventoryTypeFilter] = useState<string>('all');
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);
  const brandsPerPage = 10;

  // Stock allocation state
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocation, setAllocation] = useState({
    agentId: '',
    brandId: ''
  });
  const [allocationItems, setAllocationItems] = useState<any[]>([]);
  // Track quantities for each variant
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});

  const { toast } = useToast();

  // Check if user is a leader or admin
  useEffect(() => {
    if (user && !canLeadTeam(user.role)) {
      toast({
        title: 'Access Denied',
        description: 'Only team leaders and managers can access this page',
        variant: 'destructive'
      });
      // Redirect or show access denied message
    }
  }, [user, toast]);

  // Fetch leader's inventory (allocated by admin)
  const fetchLeaderInventory = async (showLoading = true) => {
    if (!user) return;

    try {
      if (showLoading) {
        setLoadingInventory(true);
      }

      let query = supabase
        .from('agent_inventory')
        .select(`
          id,
          stock,
          allocated_price,
          dsp_price,
          rsp_price,
          agent_id,
          variants!inner(
            id,
            name,
            variant_type,
            brands!inner(name)
          )
        `)
        .gt('stock', 0);  // Only fetch items with stock > 0

      // If user is admin, show all leader inventory
      // If user is leader, show only their inventory
      if (user.role === 'admin') {
        // For admin, get all inventory and filter by leader role
        const { data: inventoryData, error: inventoryError } = await supabase
          .from('agent_inventory')
          .select(`
            id,
            stock,
            allocated_price,
            dsp_price,
            rsp_price,
            agent_id,
            variants!inner(
              id,
              name,
              variant_type,
              brands!inner(name)
            ),
            profiles!agent_inventory_agent_id_fkey(
              id,
              full_name,
              role
            )
          `)
          .eq('profiles.role', 'team_leader')
          .gt('stock', 0);

        if (inventoryError) throw inventoryError;

        const processedInventory = inventoryData.map((item: any) => ({
          id: item.id,
          agentId: item.agent_id,
          variantId: item.variants.id,
          variantName: item.variants.name,
          variantType: item.variants.variant_type,
          brandName: item.variants.brands.name,
          stock: item.stock,
          allocatedStock: 0,
          availableStock: item.stock,
          allocatedPrice: item.allocated_price,
          totalValue: item.stock * item.allocated_price,
          agentName: item.profiles?.full_name || 'Unknown'
        }));

        setLeaderInventory(processedInventory);
        return;
      } else {
        query = query.eq('agent_id', user.id);
      }

      const { data: inventoryData, error: inventoryError } = await query;

      if (inventoryError) throw inventoryError;

      const processedInventory = inventoryData.map((item: any) => ({
        id: item.id,
        variantId: item.variants.id,
        variantName: item.variants.name,
        variantType: item.variants.variant_type,
        brandName: item.variants.brands.name,
        stock: item.stock,
        allocatedStock: 0,
        availableStock: item.stock,
        allocatedPrice: item.allocated_price,
        dspPrice: item.dsp_price,
        rspPrice: item.rsp_price,
        totalValue: item.stock * item.allocated_price
      }));

      // Calculate allocated stock for each variant
      const inventoryWithAllocated = await Promise.all(
        processedInventory.map(async (item) => {
          // Get team members for this leader
          const { data: teamData } = await supabase
            .from('leader_teams')
            .select('agent_id')
            .eq('leader_id', user.id);

          if (!teamData || teamData.length === 0) {
            return {
              ...item,
              allocatedStock: 0,
              availableStock: item.stock
            };
          }

          const teamMemberIds = teamData.map(t => t.agent_id);

          // Get allocated stock for this variant across all team members
          const { data: allocatedData, error: allocatedError } = await supabase
            .from('agent_inventory')
            .select('stock, agent_id')
            .eq('variant_id', item.variantId)
            .in('agent_id', teamMemberIds);

          if (allocatedError) {
            console.error('Error fetching allocated stock:', allocatedError);
          }

          const allocatedStock = allocatedData?.reduce((sum, alloc) => {
            const stockValue = alloc.stock || 0;
            return sum + stockValue;
          }, 0) || 0;

          // Get pending orders quantity
          const { data: allPendingOrders } = await supabase
            .from('client_orders')
            .select('id, stage')
            .in('agent_id', teamMemberIds)
            .eq('status', 'pending');

          const pendingOrders = allPendingOrders?.filter((o: any) =>
            o.stage !== 'leader_approved' && o.stage !== 'admin_approved'
          ) || [];

          const pendingOrderIds = pendingOrders?.map((o: any) => o.id) || [];

          const { data: pendingOrdersData } = pendingOrderIds.length > 0
            ? await supabase
              .from('client_order_items')
              .select('quantity')
              .eq('variant_id', item.variantId)
              .in('client_order_id', pendingOrderIds)
            : { data: [] };

          const pendingOrdersQuantity = (pendingOrdersData || []).reduce((sum: number, orderItem: any) => {
            return sum + (orderItem.quantity || 0);
          }, 0);

          const availableStock = item.stock - allocatedStock - pendingOrdersQuantity;

          return {
            ...item,
            allocatedStock,
            availableStock: Math.max(0, availableStock)
          };
        })
      );

      setLeaderInventory(inventoryWithAllocated);
    } catch (error) {
      console.error('Error fetching leader inventory:', error);
      if (showLoading) {
        toast({
          title: 'Error',
          description: 'Failed to load your inventory',
          variant: 'destructive'
        });
      }
    } finally {
      if (showLoading) {
        setLoadingInventory(false);
      }
    }
  };

  // Fetch team members (agents under this leader)
  const fetchTeamMembers = async (showLoading = true) => {
    if (!user) return;

    try {
      if (showLoading) {
        setLoadingTeam(true);
      }

      let teamData;
      let teamError;

      if (user.role === 'admin') {
        // For admin, show all team members across all leaders
        const { data, error } = await supabase
          .from('leader_teams')
          .select(`
            agent_id,
            leader_id,
            profiles!leader_teams_agent_id_fkey(
              id,
              full_name,
              email,
              phone,
              region,
              city,
              status,
              role
            ),
            leader_profiles:profiles!leader_teams_leader_id_fkey(
              id,
              full_name,
              email
            )
          `);
        teamData = data;
        teamError = error;
      } else {
        // For leader, show only their team members
        const { data, error } = await supabase
          .from('leader_teams')
          .select(`
            agent_id,
            leader_id,
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
          .eq('leader_id', user.id);
        teamData = data;
        teamError = error;
      }

      if (teamError) throw teamError;

      // Get inventory data for each team member
      const teamMembersWithInventory = await Promise.all(
        (teamData || []).map(async (member: any) => {
          if (!member.profiles) {
            return null;
          }

          const { data: memberInventory, error: inventoryError } = await supabase
            .from('agent_inventory')
            .select(`
              id,
              stock,
              allocated_price,
            dsp_price,
            rsp_price,
          variants!inner(
                id,
            name,
            variant_type,
            brands!inner(name)
          )
        `)
            .eq('agent_id', member.agent_id)
            .gt('stock', 0);

          if (inventoryError) {
            console.error('Error fetching member inventory:', inventoryError);
            return {
              id: member.profiles.id,
              name: member.profiles.full_name,
              email: member.profiles.email,
              phone: member.profiles.phone || '',
              region: member.profiles.region || '',
              cities: member.profiles.city ? (Array.isArray(member.profiles.city) ? member.profiles.city : member.profiles.city.split(',').map(c => c.trim()).filter(c => c)) : [],
              status: member.profiles.status || 'active',
              totalStock: 0,
              totalValue: 0,
              items: []
            };
          }

          const processedItems = (memberInventory || []).map((item: any) => ({
            id: item.id,
            variantId: item.variants.id,
            variantName: item.variants.name,
            variantType: item.variants.variant_type,
            brandName: item.variants.brands.name,
            stock: item.stock,
            allocatedPrice: item.allocated_price,
            totalValue: item.stock * item.allocated_price
          }));

          const totalStock = processedItems.reduce((sum, item) => sum + item.stock, 0);
          const totalValue = processedItems.reduce((sum, item) => sum + item.totalValue, 0);

          return {
            id: member.profiles.id,
            name: member.profiles.full_name,
            email: member.profiles.email,
            phone: member.profiles.phone || '',
            region: member.profiles.region || '',
            cities: member.profiles.city ? (Array.isArray(member.profiles.city) ? member.profiles.city : member.profiles.city.split(',').map(c => c.trim()).filter(c => c)) : [],
            status: member.profiles.status || 'active',
            totalStock,
            totalValue,
            items: processedItems
          };
        })
      );

      const validTeamMembers = teamMembersWithInventory.filter(member => member !== null);
      setTeamMembers(validTeamMembers);
    } catch (error) {
      console.error('Error fetching team members:', error);
      if (showLoading) {
        toast({
          title: 'Error',
          description: 'Failed to load team members',
          variant: 'destructive'
        });
      }
    } finally {
      if (showLoading) {
        setLoadingTeam(false);
      }
    }
  };

  useEffect(() => {
    if (user && user.role === 'team_leader') {
      fetchLeaderInventory();
      fetchTeamMembers();
    }
  }, [user]);

  // Real-time subscriptions for seamless updates
  useEffect(() => {
    if (!user || (user.role !== 'team_leader' && user.role !== 'admin')) return;

    // Debounce timer for smooth real-time updates
    let inventoryUpdateTimer: NodeJS.Timeout | null = null;
    let teamUpdateTimer: NodeJS.Timeout | null = null;

    const debouncedInventoryRefresh = () => {
      if (inventoryUpdateTimer) clearTimeout(inventoryUpdateTimer);
      inventoryUpdateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing leader inventory...');
        fetchLeaderInventory(false); // Pass false to skip loading state
      }, 300);
    };

    const debouncedTeamRefresh = () => {
      if (teamUpdateTimer) clearTimeout(teamUpdateTimer);
      teamUpdateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing team members...');
        fetchTeamMembers(false); // Pass false to skip loading state
      }, 300);
    };

    // Subscribe to agent_inventory changes
    // This will trigger when allocations or remittances happen
    const inventoryChannel = supabase
      .channel(`leader-inventory-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'agent_inventory',
        },
        async (payload) => {
          console.log('🔄 Real-time event received:', payload.eventType, payload);

          // Only refresh if it affects this leader's inventory or their team members
          if (user.role === 'admin') {
            // Admin sees all, so refresh on any change
            console.log('🔄 Admin: Refreshing due to inventory change');
            debouncedInventoryRefresh();
            debouncedTeamRefresh();
          } else if (user.role === 'team_leader') {
            // For leaders, check if the change affects them or their team
            const agentId = (payload.new as any)?.agent_id || (payload.old as any)?.agent_id;
            const oldStock = (payload.old as any)?.stock || 0;
            const newStock = (payload.new as any)?.stock || 0;
            const stockChanged = oldStock !== newStock;

            // Always refresh if there's a stock change (including remittances where stock goes to 0)
            if (agentId && stockChanged) {
              // Check if it's the leader themselves
              if (agentId === user.id) {
                console.log(`🔄 Leader inventory changed (${oldStock} → ${newStock}), refreshing...`);
                debouncedInventoryRefresh();
                debouncedTeamRefresh();
              } else {
                // Check if it's one of their team members (cache team IDs to avoid query on every event)
                // We'll refresh for any agent_id change, but verify it's a team member
                const { data: teamData } = await supabase
                  .from('leader_teams')
                  .select('agent_id')
                  .eq('leader_id', user.id);

                const teamIds = teamData?.map(t => t.agent_id) || [];
                if (teamIds.includes(agentId)) {
                  console.log(`🔄 Team member ${agentId} inventory changed (${oldStock} → ${newStock}), refreshing...`);
                  debouncedInventoryRefresh();
                  debouncedTeamRefresh();
                }
              }
            } else if (payload.eventType === 'DELETE') {
              // Handle DELETE events (though remittance shouldn't delete, just update to 0)
              const deletedAgentId = (payload.old as any)?.agent_id;
              if (deletedAgentId === user.id) {
                debouncedInventoryRefresh();
                debouncedTeamRefresh();
              }
            }
          }
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

    // Subscribe to leader_teams changes (team member assignments)
    const teamChannel = supabase
      .channel(`leader-teams-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'leader_teams',
        },
        (payload) => {
          if (user.role === 'admin' || (payload.new as any)?.leader_id === user.id || (payload.old as any)?.leader_id === user.id) {
            debouncedTeamRefresh();
          }
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
      if (teamUpdateTimer) clearTimeout(teamUpdateTimer);
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(teamChannel);
    };
  }, [user?.id]);

  // Filter inventory by brand, variant, or type (memoized for performance)
  const filteredInventory = useMemo(() => {
    return leaderInventory.filter(item => {
      const matchesSearch = item.brandName.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
        item.variantName.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
        item.variantType.toLowerCase().includes(inventorySearchQuery.toLowerCase());

      const matchesType = inventoryTypeFilter === 'all' || item.variantType === inventoryTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [leaderInventory, inventorySearchQuery, inventoryTypeFilter]);

  // Group inventory by brand with calculated totals (memoized)
  const groupedInventoryByBrand = useMemo(() => {
    return filteredInventory.reduce((acc, item) => {
      if (!acc[item.brandName]) {
        acc[item.brandName] = [];
      }
      acc[item.brandName].push(item);
      return acc;
    }, {} as Record<string, typeof filteredInventory>);
  }, [filteredInventory]);

  // Calculate brand stats and sort (memoized)
  const sortedBrandsWithStats = useMemo(() => {
    const brandsWithStats = Object.keys(groupedInventoryByBrand).map(brand => {
      const items = groupedInventoryByBrand[brand];
      const totalStock = items.reduce((sum, item) => sum + item.stock, 0);
      const totalValue = items.reduce((sum, item) => sum + item.totalValue, 0);
      const totalAvailable = items.reduce((sum, item) => sum + item.availableStock, 0);

      return {
        brand,
        items,
        totalStock,
        totalValue,
        totalAvailable,
        itemCount: items.length
      };
    });

    return [...brandsWithStats].sort((a, b) => {
      switch (inventorySortBy) {
        case 'name':
          return a.brand.localeCompare(b.brand);
        case 'stock':
          return b.totalStock - a.totalStock;
        case 'value':
          return b.totalValue - a.totalValue;
        case 'available':
          return b.totalAvailable - a.totalAvailable;
        default:
          return 0;
      }
    });
  }, [groupedInventoryByBrand, inventorySortBy]);

  // Paginate brands (memoized)
  const { paginatedBrands, totalBrandPages, brandStartIndex, brandEndIndex } = useMemo(() => {
    const totalPages = Math.ceil(sortedBrandsWithStats.length / brandsPerPage);
    const startIndex = (inventoryCurrentPage - 1) * brandsPerPage;
    const endIndex = startIndex + brandsPerPage;
    const paginated = sortedBrandsWithStats.slice(startIndex, endIndex);

    return {
      paginatedBrands: paginated,
      totalBrandPages: totalPages,
      brandStartIndex: startIndex,
      brandEndIndex: endIndex
    };
  }, [sortedBrandsWithStats, inventoryCurrentPage, brandsPerPage]);

  // Reset inventory page when filters change
  useEffect(() => {
    setInventoryCurrentPage(1);
    setExpandedBrands([]);
  }, [inventorySearchQuery, inventoryTypeFilter, inventorySortBy]);

  const filteredTeamMembers = teamMembers.filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedTeamMembers = [...filteredTeamMembers].sort((a, b) => {
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

  // Pagination for team members
  const totalPages = Math.ceil(sortedTeamMembers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTeamMembers = sortedTeamMembers.slice(startIndex, endIndex);

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  // Calculate stats
  const totalTeamMembers = teamMembers.length;
  const totalTeamStock = teamMembers.reduce((sum, member) => sum + member.totalStock, 0);
  const totalTeamValue = teamMembers.reduce((sum, member) => sum + member.totalValue, 0);
  const leaderTotalStock = leaderInventory.reduce((sum, item) => sum + item.stock, 0);
  const leaderTotalValue = leaderInventory.reduce((sum, item) => sum + item.totalValue, 0);

  // Build allocation items from variant quantities
  const buildAllocationItems = () => {
    if (!allocation.brandId) return [];

    const items = Object.entries(variantQuantities)
      .filter(([_, quantity]) => quantity > 0)
      .map(([variantId, quantity]) => {
        const variant = groupedInventory[allocation.brandId]?.find((v: any) => v.variantId === variantId);
        if (!variant) return null;

        return {
          variant_id: variantId,
          variant_name: variant.variantName,
          variant_type: variant.variantType,
          brand_name: variant.brandName,
          quantity: quantity,
          price: variant.allocatedPrice,
          dspPrice: variant.dspPrice,
          rspPrice: variant.rspPrice,
          total_value: quantity * variant.allocatedPrice
        };
      })
      .filter(item => item !== null);

    return items;
  };


  // Handle confirming allocation
  const handleConfirmAllocation = async () => {
    // Build allocation items from variant quantities
    const itemsToAllocate = buildAllocationItems();

    if (!allocation.agentId || itemsToAllocate.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select a team member and enter quantities for at least one variant',
        variant: 'destructive'
      });
      return;
    }

    try {
      console.log('Starting allocation process...');
      console.log('Agent ID:', allocation.agentId);
      console.log('Allocation items:', itemsToAllocate);

      // Create allocation records for team member using UPSERT function
      const allocationPromises = itemsToAllocate.map(async (item) => {
        console.log(`Allocating ${item.quantity} units of variant ${item.variant_id} to agent ${allocation.agentId}`);
        console.log(`Allocation params: agent=${allocation.agentId}, variant=${item.variant_id}, qty=${item.quantity}, price=${item.price}`);

        // Use the new UPSERT function to handle both insert and update cases atomically
        const { data, error } = await supabase.rpc('allocate_to_agent', {
          p_agent_id: allocation.agentId,
          p_variant_id: item.variant_id,
          p_quantity: item.quantity,
          p_allocated_price: item.price,
          p_dsp_price: item.dspPrice,
          p_rsp_price: item.rspPrice,
          p_performed_by: user?.id
        });

        if (error) {
          console.error('Allocation error for item:', item, 'Error:', error);
          throw error;
        }

        console.log('Allocation success for item:', item, 'Result:', data);

        // Check if the function returned success: false
        if (data && data.success === false) {
          console.error('Allocation failed:', data.message, data.error);
          throw new Error(data.message || 'Failed to allocate inventory');
        }

        return data;
      });

      const results = await Promise.all(allocationPromises);
      console.log('All allocation results:', results);

      // If we allocated multiple variants, create a consolidated event
      if (itemsToAllocate.length > 1) {
        // Build allocation summary for consolidated event
        const allocationSummary = itemsToAllocate.map(item => ({
          variant_id: item.variant_id,
          variant_name: item.variant_name,
          brand_name: item.brand_name,
          variant_type: item.variant_type,
          quantity: item.quantity
        }));

        // Create consolidated event
        const { data: consolidatedEvent, error: consolidatedError } = await supabase.rpc(
          'create_consolidated_allocation_event',
          {
            p_performed_by: user?.id,
            p_agent_id: allocation.agentId,
            p_allocation_summary: allocationSummary
          }
        );

        if (consolidatedError) {
          console.error('Error creating consolidated event:', consolidatedError);
          // Don't fail the allocation if event creation fails
        } else {
          console.log('Consolidated event created:', consolidatedEvent);
        }
      }

      // Verify the allocation worked by querying the agent's inventory
      console.log('Verifying allocation in database...');
      const { data: verifyData, error: verifyError } = await supabase
        .from('agent_inventory')
        .select('id, stock, variant_id, variants(name, brands(name))')
        .eq('agent_id', allocation.agentId);

      console.log('Agent inventory after allocation:', verifyData);
      if (verifyError) {
        console.error('Error verifying allocation:', verifyError);
      }

      toast({
        title: 'Success',
        description: 'Stock allocated to team member successfully'
      });

      // Send notification to agent
      if (user?.company_id) {
        const totalQty = itemsToAllocate.reduce((sum, item) => sum + item.quantity, 0);
        const productSummary = itemsToAllocate.map(item => `${item.variant_name} (${item.quantity})`).join(', ');

        await sendNotification({
          userId: allocation.agentId,
          companyId: user.company_id,
          type: 'inventory_allocated',
          title: 'Stock Allocated',
          message: `Your leader ${user.full_name} has allocated ${totalQty} units to you: ${productSummary}`,
          referenceType: 'allocation',
          referenceId: results[0]?.id // Using first allocation ID as reference
        });
      }

      // Update leader inventory immediately (optimistic update)
      // IMPORTANT: Also update the actual stock field, not just availableStock
      itemsToAllocate.forEach(item => {
        setLeaderInventory(prev => prev.map(invItem => {
          if (invItem.variantId === item.variant_id) {
            return {
              ...invItem,
              stock: invItem.stock - item.quantity, // Deduct from actual stock
              availableStock: invItem.availableStock - item.quantity,
              allocatedStock: invItem.allocatedStock + item.quantity,
              totalValue: (invItem.stock - item.quantity) * invItem.allocatedPrice // Update total value
            };
          }
          return invItem;
        }));
      });

      // Update team members immediately (optimistic update)
      setTeamMembers(prev => prev.map(member => {
        if (member.id === allocation.agentId) {
          const updatedItems = [...member.items];

          itemsToAllocate.forEach(item => {
            const existingIndex = updatedItems.findIndex(i => i.variantId === item.variant_id);
            if (existingIndex >= 0) {
              // Update existing item
              updatedItems[existingIndex] = {
                ...updatedItems[existingIndex],
                stock: updatedItems[existingIndex].stock + item.quantity,
                totalValue: (updatedItems[existingIndex].stock + item.quantity) * updatedItems[existingIndex].allocatedPrice
              };
            } else {
              // Add new item
              updatedItems.push({
                id: `temp-${item.variant_id}`,
                variantId: item.variant_id,
                variantName: item.variant_name,
                variantType: item.variant_type,
                brandName: item.brand_name,
                stock: item.quantity,
                allocatedPrice: item.price,
                totalValue: item.total_value
              });
            }
          });

          const newTotalStock = updatedItems.reduce((sum, item) => sum + item.stock, 0);
          const newTotalValue = updatedItems.reduce((sum, item) => sum + item.totalValue, 0);

          return {
            ...member,
            totalStock: newTotalStock,
            totalValue: newTotalValue,
            items: updatedItems
          };
        }
        return member;
      }));

      // Reset form
      setAllocation({ agentId: '', brandId: '' });
      setAllocationItems([]);
      setVariantQuantities({});
      setAllocationOpen(false);

      // Silently refresh in background without showing loading
      fetchLeaderInventory(false).catch(err => console.error('Background refresh failed:', err));
      fetchTeamMembers(false).catch(err => console.error('Background refresh failed:', err));
    } catch (error) {
      console.error('Error allocating stock:', error);
      toast({
        title: 'Error',
        description: 'Failed to allocate stock',
        variant: 'destructive'
      });
    }
  };

  // Group leader inventory by brand for allocation (only items with available stock > 0)
  const groupedInventory = leaderInventory
    .filter(item => item.availableStock > 0) // Only show items with available stock
    .reduce((acc, item) => {
      if (!acc[item.brandName]) {
        acc[item.brandName] = [];
      }
      acc[item.brandName].push(item);
      return acc;
    }, {} as Record<string, any[]>);

  if (!user || !canLeadTeam(user.role)) {
    return (
      <div className="p-8 space-y-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Only team leaders and managers can access this page. Please contact your administrator if you believe this is an error.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {user.role === 'admin' ? 'All Leader Inventory' : 'Team Inventory Management'}
          </h1>
          <p className="text-muted-foreground">
            {user.role === 'admin'
              ? 'View and manage inventory allocated to all leaders'
              : 'Manage your allocated inventory and distribute to team members'
            }
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{leaderTotalStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Your Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold">₱{leaderTotalValue.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Your Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">{totalTeamMembers}</div>
                <div className="text-xs text-muted-foreground">Team Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold">{totalTeamStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Team Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <div>
                <div className="text-2xl font-bold">₱{totalTeamValue.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Team Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your Allocated Inventory Section */}
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-600" />
                Your Allocated Inventory
              </CardTitle>
              {user.role !== 'admin' && (
                <Button
                  onClick={() => setAllocationOpen(true)}
                  disabled={leaderInventory.filter(item => item.availableStock > 0).length === 0}
                  size="sm"
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Allocate to Team
                </Button>
              )}
            </div>

            {/* Filters and Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by brand, variant, or type..."
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Type Filter */}
              <select
                value={inventoryTypeFilter}
                onChange={(e) => setInventoryTypeFilter(e.target.value)}
                className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">All Types</option>
                <option value="flavor">Flavors</option>
                <option value="battery">Battery</option>
                <option value="posm">POSM</option>
              </select>

              {/* Sort Dropdown */}
              <select
                value={inventorySortBy}
                onChange={(e) => setInventorySortBy(e.target.value as 'name' | 'stock' | 'value' | 'available')}
                className="flex h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="name">Sort: Name</option>
                <option value="stock">Sort: Total Stock</option>
                <option value="value">Sort: Total Value</option>
                <option value="available">Sort: Available</option>
              </select>

              {/* Expand/Collapse All */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (expandedBrands.length === paginatedBrands.length) {
                      setExpandedBrands([]);
                    } else {
                      setExpandedBrands(paginatedBrands.map(b => b.brand));
                    }
                  }}
                >
                  {expandedBrands.length === paginatedBrands.length ? 'Collapse All' : 'Expand All'}
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            {filteredInventory.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t">
                <div>
                  <div className="text-sm text-muted-foreground">Total Brands</div>
                  <div className="text-lg font-semibold">{sortedBrandsWithStats.length}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Variants</div>
                  <div className="text-lg font-semibold">{filteredInventory.length}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Total Stock</div>
                  <div className="text-lg font-semibold">
                    {sortedBrandsWithStats.reduce((sum, b) => sum + b.totalStock, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Available Stock</div>
                  <div className="text-lg font-semibold text-green-600">
                    {sortedBrandsWithStats.reduce((sum, b) => sum + b.totalAvailable, 0).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingInventory ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading your inventory...</span>
              </div>
            </div>
          ) : leaderInventory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No inventory allocated to you yet</p>
              <p className="text-sm">Contact your administrator to request stock allocation</p>
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No inventory items match your search</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="max-h-[600px] overflow-y-auto pr-2">
                <Accordion
                  type="multiple"
                  className="w-full space-y-2"
                  value={expandedBrands}
                  onValueChange={setExpandedBrands}
                >
                  {paginatedBrands.map((brandData) => {
                    const { brand, items, totalStock, totalValue, totalAvailable, itemCount } = brandData;
                    const totalAllocated = items.reduce((sum, item) => sum + item.allocatedStock, 0);
                    const lowStockItems = items.filter(item => item.availableStock < 10).length;

                    return (
                      <AccordionItem key={brand} value={brand} className="border rounded-lg px-4 bg-card">
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Package className="h-5 w-5 text-blue-600 shrink-0" />
                              <div className="text-left min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-base font-semibold truncate">{brand}</h3>
                                  {lowStockItems > 0 && (
                                    <Badge variant="destructive" className="text-xs">
                                      {lowStockItems} low stock
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {itemCount} {itemCount === 1 ? 'variant' : 'variants'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm shrink-0">
                              <div className="text-right hidden sm:block">
                                <div className="text-muted-foreground text-xs">Stock</div>
                                <div className="font-semibold">{totalStock.toLocaleString()}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-muted-foreground text-xs">Available</div>
                                <div className="font-semibold text-green-600">{totalAvailable.toLocaleString()}</div>
                              </div>
                              <div className="text-right hidden md:block">
                                <div className="text-muted-foreground text-xs">Value</div>
                                <div className="font-semibold">₱{(totalValue / 1000).toFixed(0)}k</div>
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto pt-2 pb-2">
                            <Table className="table-fixed w-full">
                              <colgroup>
                                <col style={{ width: '200px' }} />
                                <col style={{ width: '100px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '100px' }} />
                                <col style={{ width: '100px' }} />
                                <col style={{ width: '120px' }} />
                              </colgroup>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-left" style={{ paddingLeft: '0' }}>Variant</TableHead>
                                  <TableHead className="text-left">Type</TableHead>
                                  <TableHead className="text-right">Total Stock</TableHead>
                                  <TableHead className="text-right">Allocated</TableHead>
                                  <TableHead className="text-right">Available</TableHead>
                                  <TableHead className="text-right">DSP</TableHead>
                                  <TableHead className="text-right">RSP</TableHead>
                                  <TableHead className="text-right">Price</TableHead>
                                  <TableHead className="text-right">Value</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {items.map((item) => (
                                  <TableRow
                                    key={item.id}
                                    className={item.availableStock < 10 ? 'bg-orange-50 dark:bg-orange-950/20' : ''}
                                  >
                                    <TableCell className="font-medium text-left" style={{ paddingLeft: '0' }}>{item.variantName}</TableCell>
                                    <TableCell className="text-left">
                                      <Badge variant="outline" className="text-xs">
                                        {item.variantType}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">{item.stock.toLocaleString()}</TableCell>
                                    <TableCell className="text-right text-orange-600">{item.allocatedStock.toLocaleString()}</TableCell>
                                    <TableCell className={`text-right font-semibold ${item.availableStock < 10 ? 'text-red-600' : 'text-green-600'}`}>
                                      {item.availableStock.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">{item.dspPrice ? `₱${item.dspPrice.toFixed(2)}` : '-'}</TableCell>
                                    <TableCell className="text-right">{item.rspPrice ? `₱${item.rspPrice.toFixed(2)}` : '-'}</TableCell>
                                    <TableCell className="text-right">₱{item.allocatedPrice.toFixed(2)}</TableCell>
                                    <TableCell className="text-right font-semibold">
                                      ₱{item.totalValue.toFixed(2)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>

              {/* Pagination Controls */}
              {totalBrandPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {brandStartIndex + 1} to {Math.min(brandEndIndex, sortedBrandsWithStats.length)} of {sortedBrandsWithStats.length} brands
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInventoryCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={inventoryCurrentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm px-2">
                      Page {inventoryCurrentPage} of {totalBrandPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInventoryCurrentPage(prev => Math.min(totalBrandPages, prev + 1))}
                      disabled={inventoryCurrentPage === totalBrandPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Members Inventory Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Team Members Inventory
            </CardTitle>
            {user.role !== 'admin' && (
              <Button
                onClick={() => setAllocationOpen(true)}
                disabled={leaderInventory.filter(item => item.availableStock > 0).length === 0}
                size="sm"
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Allocate Stock
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="flex flex-col lg:flex-row gap-4 items-center mb-6">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

          {/* Team Members Display */}
          {loadingTeam ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading team members...</span>
              </div>
            </div>
          ) : sortedTeamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No team members found</p>
              <p className="text-sm">Team members will appear here once they are assigned to you</p>
            </div>
          ) : viewMode === 'table' ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Total Stock</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedTeamMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {member.totalStock.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          ₱{member.totalValue.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">
                            {member.items.length} items
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedMember(member);
                              setShowMemberDetails(true);
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
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, sortedTeamMembers.length)} of {sortedTeamMembers.length} members
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedTeamMembers.map((member) => (
                  <Card key={member.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{member.name}</CardTitle>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                        <Badge variant="secondary">
                          {member.items.length} items
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">
                            {member.totalStock.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Stock</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">
                            ₱{member.totalValue.toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">Total Value</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Top Items:</div>
                        {member.items.slice(0, 3).map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <span className="truncate">{item.brandName} - {item.variantName}</span>
                            <span className="font-medium">{item.stock}</span>
                          </div>
                        ))}
                        {member.items.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{member.items.length - 3} more items
                          </div>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setSelectedMember(member);
                          setShowMemberDetails(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View All Items
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, sortedTeamMembers.length)} of {sortedTeamMembers.length} members
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Member Details Dialog */}
      <Dialog open={showMemberDetails} onOpenChange={setShowMemberDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMember?.name}'s Inventory Details
            </DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-6">
              {/* Member Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedMember.totalStock.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Stock</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">₱{selectedMember.totalValue.toFixed(2)}</div>
                  <div className="text-sm text-muted-foreground">Total Value</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedMember.items.length}</div>
                  <div className="text-sm text-muted-foreground">Total Categories</div>
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
                    {selectedMember.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.brandName}</TableCell>
                        <TableCell>{item.variantName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {item.variantType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.stock.toLocaleString()}</TableCell>
                        <TableCell className="text-right">₱{item.allocatedPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          ₱{item.totalValue.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock Allocation Dialog */}
      <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Stock to Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Team Member Selection */}
            <div className="space-y-2">
              <Label>Select Team Member</Label>
              <Select
                value={allocation.agentId}
                onValueChange={(value) => setAllocation({ ...allocation, agentId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.filter(m => m.status === 'active').map(member => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} ({member.region})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Check if there are any brands available for allocation */}
            {Object.keys(groupedInventory).length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Stock Available for Allocation</h3>
                <p className="text-muted-foreground">
                  All your inventory has been allocated to team members.
                  <br />
                  Contact your administrator to request more stock.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Brand Selection */}
                <div className="space-y-2">
                  <Label>Select Brand</Label>
                  <Select
                    value={allocation.brandId}
                    onValueChange={(value) => {
                      setAllocation({ ...allocation, brandId: value });
                      setAllocationItems([]);
                      setVariantQuantities({});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(groupedInventory).map(brandName => (
                        <SelectItem key={brandName} value={brandName}>
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            {brandName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {allocation.brandId && groupedInventory[allocation.brandId] && (
                  <>
                    {/* Variant Selection - Show All Variants with Quantity Inputs */}
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                      <Label className="text-base font-semibold">Select Variants to Allocate</Label>
                      <p className="text-xs text-muted-foreground">Enter quantities for the variants you want to allocate. Leave as 0 to skip.</p>

                      <Tabs defaultValue="flavor" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="flavor">
                            Flavors ({groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'flavor').length})
                          </TabsTrigger>
                          <TabsTrigger value="battery">
                            Batteries ({groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'battery').length})
                          </TabsTrigger>
                          <TabsTrigger value="posm">
                            POSM ({groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'posm').length})
                          </TabsTrigger>
                        </TabsList>

                        {/* Flavor Tab */}
                        <TabsContent value="flavor" className="space-y-3 mt-4">
                          {groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'flavor').length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No flavors available for this brand
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {groupedInventory[allocation.brandId]
                                .filter((item: any) => item.variantType === 'flavor')
                                .map((item: any) => {
                                  // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                                  const hasNoPrice = item.allocatedPrice === null || item.allocatedPrice === undefined || (typeof item.allocatedPrice === 'number' && Number.isNaN(item.allocatedPrice));
                                  const currentQty = variantQuantities[item.variantId] || 0;
                                  return (
                                    <div
                                      key={item.variantId}
                                      className={`flex items-center gap-3 p-3 rounded-lg border ${hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                        }`}
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium flex items-center gap-2">
                                          {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                          <span>{item.variantName}</span>
                                        </div>
                                        <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                          {item.variantType} • {hasNoPrice ? 'No Price Set' : (
                                            <span className="inline-flex flex-wrap gap-x-2">
                                              <span>Allocated: ₱{item.allocatedPrice.toFixed(2)}</span>
                                              {item.dspPrice !== null && item.dspPrice !== undefined && <span>DSP: ₱{item.dspPrice.toFixed(2)}</span>}
                                              {item.rspPrice !== null && item.rspPrice !== undefined && <span>RSP: ₱{item.rspPrice.toFixed(2)}</span>}
                                            </span>
                                          )} • Available: {item.stock} units
                                        </div>
                                        {currentQty > 0 && !hasNoPrice && (
                                          <div className="text-xs font-semibold text-green-600 mt-1">
                                            Total: Allocated ₱{(item.allocatedPrice * currentQty).toFixed(2)}
                                            {item.dspPrice !== null && item.dspPrice !== undefined && ` | DSP ₱${(item.dspPrice * currentQty).toFixed(2)}`}
                                            {item.rspPrice !== null && item.rspPrice !== undefined && ` | RSP ₱${(item.rspPrice * currentQty).toFixed(2)}`}
                                          </div>
                                        )}
                                      </div>
                                      <div className="w-28">
                                        <Input
                                          type="number"
                                          placeholder="0"
                                          min="0"
                                          max={item.stock}
                                          value={variantQuantities[item.variantId] || ''}
                                          onChange={(e) => {
                                            const inputValue = parseInt(e.target.value) || 0;
                                            const cappedValue = Math.max(0, Math.min(inputValue, item.stock));
                                            setVariantQuantities(prev => ({
                                              ...prev,
                                              [item.variantId]: cappedValue
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
                          {groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'battery').length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No batteries available for this brand
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {groupedInventory[allocation.brandId]
                                .filter((item: any) => item.variantType === 'battery')
                                .map((item: any) => {
                                  // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                                  const hasNoPrice = item.allocatedPrice === null || item.allocatedPrice === undefined || (typeof item.allocatedPrice === 'number' && Number.isNaN(item.allocatedPrice));
                                  const currentQty = variantQuantities[item.variantId] || 0;
                                  return (
                                    <div
                                      key={item.variantId}
                                      className={`flex items-center gap-3 p-3 rounded-lg border ${hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                        }`}
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium flex items-center gap-2">
                                          {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                          <span>{item.variantName}</span>
                                        </div>
                                        <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                          {item.variantType} • {hasNoPrice ? 'No Price Set' : (
                                            <span className="inline-flex flex-wrap gap-x-2">
                                              <span>Allocated: ₱{item.allocatedPrice.toFixed(2)}</span>
                                              {item.dspPrice !== null && item.dspPrice !== undefined && <span>DSP: ₱{item.dspPrice.toFixed(2)}</span>}
                                              {item.rspPrice !== null && item.rspPrice !== undefined && <span>RSP: ₱{item.rspPrice.toFixed(2)}</span>}
                                            </span>
                                          )} • Available: {item.stock} units
                                        </div>
                                        {currentQty > 0 && !hasNoPrice && (
                                          <div className="text-xs font-semibold text-green-600 mt-1">
                                            Total: Allocated ₱{(item.allocatedPrice * currentQty).toFixed(2)}
                                            {item.dspPrice !== null && item.dspPrice !== undefined && ` | DSP ₱${(item.dspPrice * currentQty).toFixed(2)}`}
                                            {item.rspPrice !== null && item.rspPrice !== undefined && ` | RSP ₱${(item.rspPrice * currentQty).toFixed(2)}`}
                                          </div>
                                        )}
                                      </div>
                                      <div className="w-28">
                                        <Input
                                          type="number"
                                          placeholder="0"
                                          min="0"
                                          max={item.stock}
                                          value={variantQuantities[item.variantId] || ''}
                                          onChange={(e) => {
                                            const inputValue = parseInt(e.target.value) || 0;
                                            const cappedValue = Math.max(0, Math.min(inputValue, item.stock));
                                            setVariantQuantities(prev => ({
                                              ...prev,
                                              [item.variantId]: cappedValue
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

                        {/* POSM Tab */}
                        <TabsContent value="posm" className="space-y-3 mt-4">
                          {groupedInventory[allocation.brandId].filter((item: any) => item.variantType === 'posm').length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No POSM available for this brand
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {groupedInventory[allocation.brandId]
                                .filter((item: any) => item.variantType === 'posm')
                                .map((item: any) => {
                                  // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                                  const hasNoPrice = item.allocatedPrice === null || item.allocatedPrice === undefined || (typeof item.allocatedPrice === 'number' && Number.isNaN(item.allocatedPrice));
                                  const currentQty = variantQuantities[item.variantId] || 0;
                                  return (
                                    <div
                                      key={item.variantId}
                                      className={`flex items-center gap-3 p-3 rounded-lg border ${hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'
                                        }`}
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium flex items-center gap-2">
                                          {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                          <span>{item.variantName}</span>
                                        </div>
                                        <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                          {item.variantType} • {hasNoPrice ? 'No Price Set' : (
                                            <span className="inline-flex flex-wrap gap-x-2">
                                              <span>Allocated: ₱{item.allocatedPrice.toFixed(2)}</span>
                                              {item.dspPrice !== null && item.dspPrice !== undefined && <span>DSP: ₱{item.dspPrice.toFixed(2)}</span>}
                                              {item.rspPrice !== null && item.rspPrice !== undefined && <span>RSP: ₱{item.rspPrice.toFixed(2)}</span>}
                                            </span>
                                          )} • Available: {item.stock} units
                                        </div>
                                        {currentQty > 0 && !hasNoPrice && (
                                          <div className="text-xs font-semibold text-green-600 mt-1">
                                            Total: Allocated ₱{(item.allocatedPrice * currentQty).toFixed(2)}
                                            {item.dspPrice !== null && item.dspPrice !== undefined && ` | DSP ₱${(item.dspPrice * currentQty).toFixed(2)}`}
                                            {item.rspPrice !== null && item.rspPrice !== undefined && ` | RSP ₱${(item.rspPrice * currentQty).toFixed(2)}`}
                                          </div>
                                        )}
                                      </div>
                                      <div className="w-28">
                                        <Input
                                          type="number"
                                          placeholder="0"
                                          min="0"
                                          max={item.stock}
                                          value={variantQuantities[item.variantId] || ''}
                                          onChange={(e) => {
                                            const inputValue = parseInt(e.target.value) || 0;
                                            const cappedValue = Math.max(0, Math.min(inputValue, item.stock));
                                            setVariantQuantities(prev => ({
                                              ...prev,
                                              [item.variantId]: cappedValue
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

                    {/* Allocation Items Summary */}
                    {(() => {
                      const itemsToAllocate = buildAllocationItems();
                      if (itemsToAllocate.length === 0) return null;

                      return (
                        <div className="border rounded-lg p-4 space-y-3 bg-green-50 dark:bg-green-950/20">
                          <Label className="text-base font-semibold text-green-700 dark:text-green-400">Ready to Allocate</Label>
                          <div className="space-y-2">
                            {itemsToAllocate.map((item, index) => {
                              // Find the full item data to get DSP and RSP prices
                              const fullItem = groupedInventory[allocation.brandId]?.find(
                                (inv: any) => inv.variantId === item.variant_id
                              );
                              
                              return (
                                <div key={index} className="flex items-center justify-between p-3 bg-background rounded-lg border border-green-200 dark:border-green-900">
                                  <div className="flex-1">
                                    <div className="font-medium">{item.brand_name} - {item.variant_name}</div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                      <div>{item.variant_type} • {item.quantity} units</div>
                                      <div className="space-y-0.5">
                                        <div className="font-semibold">Allocated: ₱{item.price.toFixed(2)} each × {item.quantity} = ₱{item.total_value.toFixed(2)}</div>
                                        {fullItem?.dspPrice !== null && fullItem?.dspPrice !== undefined && (
                                          <div className="text-blue-600">DSP: ₱{fullItem.dspPrice.toFixed(2)} each × {item.quantity} = ₱{(fullItem.dspPrice * item.quantity).toFixed(2)}</div>
                                        )}
                                        {fullItem?.rspPrice !== null && fullItem?.rspPrice !== undefined && (
                                          <div className="text-purple-600">RSP: ₱{fullItem.rspPrice.toFixed(2)} each × {item.quantity} = ₱{(fullItem.rspPrice * item.quantity).toFixed(2)}</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setVariantQuantities(prev => ({
                                          ...prev,
                                          [item.variant_id]: 0
                                        }));
                                      }}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Total Summary */}
                          <div className="border-t pt-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Total Categories: {itemsToAllocate.length}</span>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between items-center font-semibold">
                                <span>Total Allocated Value:</span>
                                <span>₱{itemsToAllocate.reduce((sum, item) => sum + item.total_value, 0).toFixed(2)}</span>
                              </div>
                              {(() => {
                                let totalDsp = 0;
                                let totalRsp = 0;
                                let hasDsp = false;
                                let hasRsp = false;
                                
                                itemsToAllocate.forEach(item => {
                                  const fullItem = groupedInventory[allocation.brandId]?.find(
                                    (inv: any) => inv.variantId === item.variant_id
                                  );
                                  if (fullItem?.dspPrice !== null && fullItem?.dspPrice !== undefined) {
                                    totalDsp += fullItem.dspPrice * item.quantity;
                                    hasDsp = true;
                                  }
                                  if (fullItem?.rspPrice !== null && fullItem?.rspPrice !== undefined) {
                                    totalRsp += fullItem.rspPrice * item.quantity;
                                    hasRsp = true;
                                  }
                                });
                                
                                return (
                                  <>
                                    {hasDsp && (
                                      <div className="flex justify-between items-center text-blue-600">
                                        <span>Total DSP Value:</span>
                                        <span>₱{totalDsp.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {hasRsp && (
                                      <div className="flex justify-between items-center text-purple-600">
                                        <span>Total RSP Value:</span>
                                        <span>₱{totalRsp.toFixed(2)}</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Clear All Button */}
                          <div className="pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setVariantQuantities({})}
                              className="w-full text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Clear All Items
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => setAllocationOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleConfirmAllocation}
                        disabled={!allocation.agentId || buildAllocationItems().length === 0}
                      >
                        Allocate to Team Member
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}