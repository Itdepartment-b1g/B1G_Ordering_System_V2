import { useState, useEffect, useMemo } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import IncomingTLRequestsSection from './components/IncomingTLRequestsSection';
import ReturnRequestsSection from './components/ReturnRequestsSection';

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
  const [isMobile, setIsMobile] = useState(false);

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

  // Return to Admin (main inventory) - so main_inventory.allocated_stock decreases
  const [returnToMainOpen, setReturnToMainOpen] = useState(false);
  const [returnToMainQuantities, setReturnToMainQuantities] = useState<Record<string, number>>({});
  const [returnToMainSubmitting, setReturnToMainSubmitting] = useState(false);

  const { toast } = useToast();

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        // For leader, show team members directly assigned OR in their sub-team

        // 1. Check if this leader manages a sub-team
        const { data: subTeamData } = await supabase
          .from('sub_teams')
          .select('id')
          .eq('leader_id', user.id)
          .single();

        let query = supabase
          .from('leader_teams')
          .select(`
            agent_id,
            leader_id,
            sub_team_id,
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
          `);

        if (subTeamData) {
          // Fetch agents where leader_id matches OR sub_team_id matches
          query = query.or(`leader_id.eq.${user.id},sub_team_id.eq.${subTeamData.id}`);
        } else {
          // plain direct assignment
          query = query.eq('leader_id', user.id);
        }

        const { data, error } = await query;
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

  // Return leader's stock to main inventory (decrements main_inventory.allocated_stock)
  const handleReturnToMain = async () => {
    const items = Object.entries(returnToMainQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([variantId, quantity]) => ({ variant_id: variantId, quantity }));
    if (items.length === 0) {
      toast({ title: 'No quantities', description: 'Enter quantities to return', variant: 'destructive' });
      return;
    }
    setReturnToMainSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('return_inventory_to_main', {
        p_leader_id: user!.id,
        p_items: items,
        p_performed_by: user!.id,
        p_reason: 'Leader returned stock to admin'
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message || 'Return failed');
      toast({
        title: 'Success',
        description: `Returned ${(data as any).total_quantity} units to main inventory. Allocated stock will update on the Main Inventory page.`,
        variant: 'default'
      });
      setReturnToMainOpen(false);
      setReturnToMainQuantities({});
      fetchLeaderInventory(false).catch(() => {});
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to return stock', variant: 'destructive' });
    } finally {
      setReturnToMainSubmitting(false);
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

  // Display label for variant type (scalable for custom types: FOC, NCV, etc.)
  const getVariantTypeDisplay = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'posm') return 'POSM';
    if (t === 'foc') return 'FOC';
    if (t === 'ncv') return 'NCV';
    return (type || 'variant').charAt(0).toUpperCase() + (type || 'variant').slice(1).toLowerCase();
  };

  // Tab label with plural (e.g. "Flavors", "FOC", "POSM")
  const getVariantTypeTabLabel = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'posm' || t === 'foc' || t === 'ncv') return getVariantTypeDisplay(type);
    return getVariantTypeDisplay(type) + 's';
  };

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
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {user.role === 'admin' ? 'All Leader Inventory' : 'Team Inventory'}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {user.role === 'admin'
              ? 'View all leader inventory'
              : 'Manage and distribute inventory'
            }
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Package className="h-3 w-3 md:h-4 md:w-4 text-blue-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg md:text-2xl font-bold truncate">{leaderTotalStock.toLocaleString()}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">Your Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-green-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg md:text-2xl font-bold truncate">₱{(leaderTotalValue / 1000).toFixed(0)}k</div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">Your Value</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <Users className="h-3 w-3 md:h-4 md:w-4 text-purple-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg md:text-2xl font-bold truncate">{totalTeamMembers}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3 w-3 md:h-4 md:w-4 text-orange-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg md:text-2xl font-bold truncate">{totalTeamStock.toLocaleString()}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">Team Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-indigo-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-lg md:text-2xl font-bold truncate">₱{(totalTeamValue / 1000).toFixed(0)}k</div>
                <div className="text-[10px] md:text-xs text-muted-foreground truncate">Team Value</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Your Allocated Inventory Section */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="space-y-3 md:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Crown className="h-4 w-4 md:h-5 md:w-5 text-yellow-600 flex-shrink-0" />
                <span className="truncate">Your Inventory</span>
              </CardTitle>
              <div className="flex gap-2">
                {user.role !== 'admin' && user.role !== 'manager' && (
                  <Button
                    onClick={() => setAllocationOpen(true)}
                    disabled={leaderInventory.filter(item => item.availableStock > 0).length === 0}
                    size="sm"
                    className="w-full sm:w-auto h-9 text-xs"
                  >
                    <ArrowRight className="mr-2 h-3 w-3" />
                    Allocate
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setReturnToMainQuantities({});
                    setReturnToMainOpen(true);
                  }}
                  disabled={leaderInventory.filter(item => item.stock > 0).length === 0}
                  size="sm"
                  className="w-full sm:w-auto h-9 text-xs"
                >
                  <Package className="mr-2 h-3 w-3" />
                  Return to Admin
                </Button>
              </div>
            </div>

            {/* Filters and Controls */}
            <div className="flex flex-col gap-2">
              {/* Search Bar */}
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
                <Input
                  placeholder="Search inventory..."
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="pl-9 md:pl-10 h-9 md:h-10 text-sm"
                />
              </div>

              {/* Filters Row */}
              <div className="flex gap-2">
                {/* Type Filter */}
                <select
                  value={inventoryTypeFilter}
                  onChange={(e) => setInventoryTypeFilter(e.target.value)}
                  className="flex h-9 md:h-10 flex-1 rounded-md border border-input bg-background px-2 md:px-3 py-2 text-xs md:text-sm"
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
                  className="flex h-9 md:h-10 flex-1 rounded-md border border-input bg-background px-2 md:px-3 py-2 text-xs md:text-sm"
                >
                  <option value="name">Name</option>
                  <option value="stock">Stock</option>
                  <option value="value">Value</option>
                  <option value="available">Available</option>
                </select>

                {/* Expand/Collapse All */}
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
                  className="h-9 md:h-10 text-xs px-2 md:px-4"
                >
                  {expandedBrands.length === paginatedBrands.length ? 'Collapse' : 'Expand'}
                </Button>
              </div>
            </div>

            {/* Summary Stats */}
            {filteredInventory.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-2 border-t">
                <div>
                  <div className="text-[10px] md:text-sm text-muted-foreground">Brands</div>
                  <div className="text-sm md:text-lg font-semibold">{sortedBrandsWithStats.length}</div>
                </div>
                <div>
                  <div className="text-[10px] md:text-sm text-muted-foreground">Variants</div>
                  <div className="text-sm md:text-lg font-semibold">{filteredInventory.length}</div>
                </div>
                <div>
                  <div className="text-[10px] md:text-sm text-muted-foreground">Stock</div>
                  <div className="text-sm md:text-lg font-semibold">
                    {sortedBrandsWithStats.reduce((sum, b) => sum + b.totalStock, 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] md:text-sm text-muted-foreground">Available</div>
                  <div className="text-sm md:text-lg font-semibold text-green-600">
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
                      <AccordionItem key={brand} value={brand} className="border rounded-lg bg-card">
                        <AccordionTrigger className="hover:no-underline px-3 md:px-4 py-3">
                          <div className="flex items-center justify-between w-full pr-2 md:pr-4 gap-2">
                            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                              <Package className="h-4 w-4 md:h-5 md:w-5 text-blue-600 shrink-0" />
                              <div className="text-left min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm md:text-base font-semibold truncate">{brand}</h3>
                                  {lowStockItems > 0 && (
                                    <Badge variant="destructive" className="text-[9px] md:text-xs h-5 md:h-auto whitespace-nowrap">
                                      {lowStockItems} low
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] md:text-xs text-muted-foreground">
                                  {itemCount} {itemCount === 1 ? 'variant' : 'variants'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 md:gap-6 text-xs shrink-0">
                              <div className="text-right hidden sm:block">
                                <div className="text-muted-foreground text-[10px] md:text-xs">Stock</div>
                                <div className="font-semibold text-xs md:text-sm">{totalStock.toLocaleString()}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-muted-foreground text-[10px] md:text-xs">Available</div>
                                <div className="font-semibold text-xs md:text-sm text-green-600">{totalAvailable.toLocaleString()}</div>
                              </div>
                              <div className="text-right hidden md:block">
                                <div className="text-muted-foreground text-xs">Value</div>
                                <div className="font-semibold">₱{(totalValue / 1000).toFixed(0)}k</div>
                              </div>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="pt-2 pb-2">
                            {isMobile ? (
                              // Mobile Cards View
                              <div className="space-y-2">
                                {items.map((item) => (
                                  <div
                                    key={item.id}
                                    className={`border rounded-lg p-3 space-y-2 ${item.availableStock < 10 ? 'bg-orange-50 border-orange-200' : 'bg-background'}`}
                                  >
                                    {/* Header */}
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate">{item.variantName}</div>
                                        <Badge variant="outline" className="text-[9px] h-5 mt-1 uppercase">
                                          {item.variantType}
                                        </Badge>
                                      </div>
                                    </div>

                                    {/* Stock Info */}
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs border-t pt-2">
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">Total</div>
                                        <div className="font-semibold">{item.stock.toLocaleString()}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">Allocated</div>
                                        <div className="font-semibold text-orange-600">{item.allocatedStock.toLocaleString()}</div>
                                      </div>
                                      <div>
                                        <div className="text-[10px] text-muted-foreground">Available</div>
                                        <div className={`font-semibold ${item.availableStock < 10 ? 'text-red-600' : 'text-green-600'}`}>
                                          {item.availableStock.toLocaleString()}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Prices */}
                                    <div className="grid grid-cols-3 gap-2 text-[10px] border-t pt-2">
                                      <div>
                                        <div className="text-muted-foreground">Unit</div>
                                        <div className="font-semibold">₱{item.allocatedPrice.toFixed(2)}</div>
                                      </div>
                                      {item.dspPrice && (
                                        <div>
                                          <div className="text-muted-foreground">DSP</div>
                                          <div className="font-semibold">₱{item.dspPrice.toFixed(2)}</div>
                                        </div>
                                      )}
                                      {item.rspPrice && (
                                        <div>
                                          <div className="text-muted-foreground">RSP</div>
                                          <div className="font-semibold">₱{item.rspPrice.toFixed(2)}</div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Total Value */}
                                    <div className="border-t pt-2">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">Total Value:</span>
                                        <span className="font-bold text-primary">₱{item.totalValue.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              // Desktop Table View
                              <div className="overflow-x-auto">
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
                            )}
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

      {/* Incoming TL Stock Requests Section */}
      {user.role === 'team_leader' && <IncomingTLRequestsSection />}

      {/* Pending Return Requests (mobile sales -> team leader or manager) */}
      {canLeadTeam(user.role) && <ReturnRequestsSection />}

      {/* Team Members Inventory Section */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-600 flex-shrink-0" />
              <span className="truncate">Team Members</span>
            </CardTitle>

          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {/* Controls */}
          <div className="flex flex-col gap-3 mb-4">
            {/* Search */}
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 md:pl-10 h-9 md:h-10 text-sm"
              />
            </div>

            {/* Sort and View Toggle Row */}
            <div className="flex gap-2">
              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'value')}
                className="flex h-9 md:h-10 flex-1 rounded-md border border-input bg-background px-2 md:px-3 py-2 text-xs md:text-sm"
              >
                <option value="name">Name</option>
                <option value="stock">Stock</option>
                <option value="value">Value</option>
              </select>

              {/* View Toggle - Hidden on mobile */}
              {!isMobile && (
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    className="gap-2 h-9 md:h-10 text-xs"
                  >
                    <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
                    Table
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    className="gap-2 h-9 md:h-10 text-xs"
                  >
                    <Package className="h-3 w-3 md:h-4 md:w-4" />
                    Cards
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Team Members Display */}
          {loadingTeam ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
                <span className="text-sm md:text-base">Loading...</span>
              </div>
            </div>
          ) : sortedTeamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-6 w-6 md:h-8 md:w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm md:text-base">No team members found</p>
              <p className="text-xs md:text-sm">Team members will appear here once assigned</p>
            </div>
          ) : (isMobile || viewMode === 'cards') ? (
            // Mobile Cards View
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {paginatedTeamMembers.map((member) => (
                  <Card key={member.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{member.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                        </div>
                        <Badge variant="secondary" className="ml-2 text-[10px] h-5 flex-shrink-0">
                          {member.items.length} items
                        </Badge>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="text-center p-2 rounded-lg bg-blue-50/50 border border-blue-100">
                          <div className="text-lg font-bold text-blue-600">
                            {member.totalStock.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Stock</div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-green-50/50 border border-green-100">
                          <div className="text-lg font-bold text-green-600">
                            ₱{(member.totalValue / 1000).toFixed(0)}k
                          </div>
                          <div className="text-[10px] text-muted-foreground">Value</div>
                        </div>
                      </div>

                      {/* Top Items */}
                      {member.items.length > 0 && (
                        <div className="space-y-1 mb-3 pb-3 border-b">
                          <div className="text-xs font-medium text-muted-foreground">Top Items:</div>
                          {member.items.slice(0, 2).map((item: any) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="truncate flex-1 mr-2">{item.brandName}</span>
                              <span className="font-medium flex-shrink-0">{item.stock}</span>
                            </div>
                          ))}
                          {member.items.length > 2 && (
                            <div className="text-[10px] text-muted-foreground">
                              +{member.items.length - 2} more
                            </div>
                          )}
                        </div>
                      )}

                      {/* View Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          setSelectedMember(member);
                          setShowMemberDetails(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-2" />
                        View Details
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-xs md:text-sm text-muted-foreground">
                    {startIndex + 1}-{Math.min(endIndex, sortedTeamMembers.length)} of {sortedTeamMembers.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="h-8 md:h-9"
                    >
                      <ChevronLeft className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                    <div className="text-xs md:text-sm">
                      {currentPage}/{totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="h-8 md:h-9"
                    >
                      <ChevronRight className="h-3 w-3 md:h-4 md:w-4" />
                    </Button>
                  </div>
                </div>
              )}
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
      {isMobile ? (
        <Sheet open={showMemberDetails} onOpenChange={setShowMemberDetails}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">
                    {selectedMember?.name}'s Inventory
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    View member inventory details
                  </SheetDescription>
                </SheetHeader>

                {selectedMember && (
                  <>
                    {/* Member Summary */}
                    <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
                      <div className="text-center">
                        <div className="text-lg font-bold">{selectedMember.totalStock.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">Stock</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">₱{(selectedMember.totalValue / 1000).toFixed(0)}k</div>
                        <div className="text-[10px] text-muted-foreground">Value</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">{selectedMember.items.length}</div>
                        <div className="text-[10px] text-muted-foreground">Items</div>
                      </div>
                    </div>

                    {/* Inventory Items Cards */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold">Inventory Items</h3>
                      {selectedMember.items.map((item: any) => (
                        <div key={item.id} className="border rounded-lg p-3 space-y-2 bg-background">
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{item.brandName}</div>
                              <div className="text-xs text-muted-foreground truncate">{item.variantName}</div>
                            </div>
                            <Badge variant="outline" className="ml-2 text-[9px] h-5 flex-shrink-0 uppercase">
                              {item.variantType}
                            </Badge>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div>
                              <div className="text-muted-foreground text-[10px]">Stock</div>
                              <div className="font-semibold">{item.stock.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-[10px]">Price</div>
                              <div className="font-semibold">₱{item.allocatedPrice.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-[10px]">Value</div>
                              <div className="font-semibold text-primary">₱{item.totalValue.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Close Button */}
                    <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t">
                      <Button variant="outline" onClick={() => setShowMemberDetails(false)} className="w-full h-10 text-xs">
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
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
      )}

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
                    {/* Variant Selection - Show All Variants with Quantity Inputs (dynamic types: Flavor, Battery, POSM, FOC, NCV, etc.) */}
                    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                      <Label className="text-base font-semibold">Select Variants to Allocate</Label>
                      <p className="text-xs text-muted-foreground">Enter quantities for the variants you want to allocate. Leave as 0 to skip.</p>

                      {(() => {
                        const brandItems = groupedInventory[allocation.brandId] || [];
                        const typeStrings = brandItems.map((i: any) => String(i.variantType || 'flavor').toLowerCase());
                        const variantTypes = ([...new Set(typeStrings)] as string[]).sort((a, b) => {
                          const order: Record<string, number> = { flavor: 1, battery: 2, posm: 3 };
                          const aOrder = order[a] ?? 99;
                          const bOrder = order[b] ?? 99;
                          if (aOrder !== bOrder) return aOrder - bOrder;
                          return a.localeCompare(b);
                        });
                        const firstType: string = variantTypes[0] || 'flavor';

                        return (
                          <Tabs defaultValue={firstType} className="w-full">
                            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${variantTypes.length}, minmax(0, 1fr))` }}>
                              {variantTypes.map((variantType: string) => {
                                const count = brandItems.filter((item: any) => String(item.variantType || 'flavor').toLowerCase() === variantType).length;
                                return (
                                  <TabsTrigger key={variantType} value={variantType} className="text-xs sm:text-sm">
                                    {getVariantTypeTabLabel(variantType)} ({count})
                                  </TabsTrigger>
                                );
                              })}
                            </TabsList>

                            {variantTypes.map((variantType: string) => {
                              const itemsOfType = brandItems.filter((item: any) => String(item.variantType || 'flavor').toLowerCase() === variantType);
                              const typeLabel = getVariantTypeDisplay(variantType);
                              return (
                                <TabsContent key={variantType} value={variantType} className="space-y-3 mt-4">
                                  {itemsOfType.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                      No {['posm', 'foc', 'ncv'].includes(variantType) ? typeLabel : typeLabel.toLowerCase() + 's'} available for this brand
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {itemsOfType.map((item: any) => {
                                        const hasNoPrice = item.allocatedPrice === null || item.allocatedPrice === undefined || (typeof item.allocatedPrice === 'number' && Number.isNaN(item.allocatedPrice));
                                        const currentQty = variantQuantities[item.variantId] || 0;
                                        return (
                                          <div
                                            key={item.variantId}
                                            className={`flex items-center gap-3 p-3 rounded-lg border ${hasNoPrice ? 'bg-yellow-50/50 border-yellow-300' : 'bg-background'}`}
                                          >
                                            <div className="flex-1">
                                              <div className="font-medium flex items-center gap-2">
                                                {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                                                <span>{item.variantName}</span>
                                              </div>
                                              <div className={`text-sm ${hasNoPrice ? 'text-red-600' : 'text-muted-foreground'}`}>
                                                {getVariantTypeDisplay(item.variantType)} • {hasNoPrice ? 'No Price Set' : (
                                                  <span className="inline-flex flex-wrap gap-x-2">
                                                    <span>Allocated: ₱{item.allocatedPrice.toFixed(2)}</span>
                                                    {item.dspPrice != null && <span>DSP: ₱{item.dspPrice.toFixed(2)}</span>}
                                                    {item.rspPrice != null && <span>RSP: ₱{item.rspPrice.toFixed(2)}</span>}
                                                  </span>
                                                )} • Available: {item.stock} units
                                              </div>
                                              {currentQty > 0 && !hasNoPrice && (
                                                <div className="text-xs font-semibold text-green-600 mt-1">
                                                  Total: Allocated ₱{(item.allocatedPrice * currentQty).toFixed(2)}
                                                  {item.dspPrice != null && ` | DSP ₱${(item.dspPrice * currentQty).toFixed(2)}`}
                                                  {item.rspPrice != null && ` | RSP ₱${(item.rspPrice * currentQty).toFixed(2)}`}
                                                </div>
                                              )}
                                            </div>
                                            <div className="w-28">
                                              <Input
                                                type="number"
                                                placeholder="0"
                                                min="0"
                                                max={item.stock}
                                                value={variantQuantities[item.variantId] ?? ''}
                                                onChange={(e) => {
                                                  const inputValue = parseInt(e.target.value, 10) || 0;
                                                  const cappedValue = Math.max(0, Math.min(inputValue, item.stock));
                                                  setVariantQuantities(prev => ({ ...prev, [item.variantId]: cappedValue }));
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
                              );
                            })}
                          </Tabs>
                        );
                      })()}
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

      {/* Return to Admin Dialog - decrements main_inventory.allocated_stock */}
      <Dialog open={returnToMainOpen} onOpenChange={setReturnToMainOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Return Stock to Admin
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Return stock from your inventory back to main. This will reduce the &quot;Allocated&quot; count on the Main Inventory page.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {leaderInventory.filter(i => i.stock > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">You have no stock to return.</p>
            ) : (
              <div className="space-y-3">
                <Label>Enter quantity to return per variant</Label>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                  {((): Array<[string, any[]]> => {
                    const grouped = leaderInventory
                      .filter(i => i.stock > 0)
                      .reduce((acc, item) => {
                        if (!acc[item.brandName]) acc[item.brandName] = [];
                        acc[item.brandName].push(item);
                        return acc;
                      }, {} as Record<string, any[]>);
                    return Object.entries(grouped);
                  })().map(([brandName, items]) => (
                    <div key={brandName} className="border rounded-lg p-3 space-y-2">
                      <div className="font-medium text-sm text-muted-foreground">{brandName}</div>
                      {items.map((item: any) => (
                        <div key={item.variantId} className="flex items-center justify-between gap-2">
                          <span className="text-sm truncate flex-1">{item.variantName}</span>
                          <span className="text-xs text-muted-foreground shrink-0">max {item.stock}</span>
                          <Input
                            type="number"
                            min={0}
                            max={item.stock}
                            className="w-24"
                            placeholder="0"
                            value={returnToMainQuantities[item.variantId] ?? ''}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10) || 0;
                              setReturnToMainQuantities(prev => ({ ...prev, [item.variantId]: Math.min(item.stock, Math.max(0, v)) }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setReturnToMainOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleReturnToMain}
                    disabled={returnToMainSubmitting || Object.values(returnToMainQuantities).every(q => !q || q === 0)}
                  >
                    {returnToMainSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Return to Admin
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}