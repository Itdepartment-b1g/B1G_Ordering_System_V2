import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AgentBrand, AgentVariant } from './types';
import { AgentInventoryContext } from './hooks';
import { hasInventory } from '@/lib/roleUtils';

export function AgentInventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [agentBrands, setAgentBrands] = useState<AgentBrand[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agent inventory from Supabase
  const fetchAgentInventory = async () => {
    // Support mobile_sales, team_leaders, and managers
    if (!user || !hasInventory(user.role)) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // ⚡ OPTIMIZED: Run all 3 queries in parallel instead of sequentially
      // This is 3x faster than awaiting each query one by one
      const [brandsResult, inventoryResult, mainInventoryResult] = await Promise.all([
        // 1. Fetch all brands
        supabase
          .from('brands')
          .select('id, name')
          .order('name'),

        // 2. Fetch agent's inventory items
        supabase
          .from('agent_inventory')
          .select(`
            variant_id,
            stock,
            allocated_price,
            dsp_price,
            rsp_price,
            status,
            variants (
              id,
              name,
              variant_type,
              brand_id
            )
          `)
          .eq('agent_id', user.id),

        // 3. Fetch main inventory prices (unit_price) for reference
        supabase
          .from('main_inventory')
          .select('variant_id, unit_price, selling_price')
      ]);

      // Check for errors
      if (brandsResult.error) throw brandsResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (mainInventoryResult.error) throw mainInventoryResult.error;

      // Extract data from results
      const brandsData = brandsResult.data;
      const inventoryData = inventoryResult.data;
      const mainInventoryData = mainInventoryResult.data;

      // Create a map of main inventory prices
      const mainPrices = new Map();
      mainInventoryData?.forEach((item: any) => {
        mainPrices.set(item.variant_id, {
          unit_price: item.unit_price,
          selling_price: item.selling_price
        });
      });

      // 4. Structure the data
      const brandsMap = new Map<string, AgentBrand>();

      // Initialize brands
      brandsData?.forEach((brand: any) => {
        brandsMap.set(brand.id, {
          id: brand.id,
          name: brand.name,
          flavors: [],
          batteries: [],
          posms: [],
          allVariants: [],
          variantsByType: new Map<string, AgentVariant[]>()
        });
      });

      // Process inventory items
      inventoryData?.forEach((item: any) => {
        const variant = item.variants;
        if (!variant) return;

        const brand = brandsMap.get(variant.brand_id);
        if (brand) {
          const mainPriceInfo = mainPrices.get(variant.id) || { unit_price: 0, selling_price: 0 };

          const agentVariant: AgentVariant = {
            id: variant.id,
            name: variant.name,
            variantType: variant.variant_type || 'flavor',
            stock: item.stock,
            price: item.allocated_price || mainPriceInfo.unit_price || 0,
            allocatedPrice: item.allocated_price,
            dspPrice: item.dsp_price,
            rspPrice: item.rsp_price,
            sellingPrice: mainPriceInfo.selling_price,
            unitPrice: mainPriceInfo.unit_price,
            status: item.status
          };

          // Add to allVariants
          brand.allVariants.push(agentVariant);

          // Add to variantsByType map
          const typeLower = variant.variant_type?.toLowerCase() || 'flavor';
          if (!brand.variantsByType.has(typeLower)) {
            brand.variantsByType.set(typeLower, []);
          }
          brand.variantsByType.get(typeLower)!.push(agentVariant);

          // Maintain legacy arrays for backward compatibility
          if (typeLower === 'flavor') {
            brand.flavors.push(agentVariant);
          } else if (typeLower === 'battery') {
            brand.batteries.push(agentVariant);
          } else if (typeLower === 'posm') {
            brand.posms.push(agentVariant);
          }
        }
      });

      // Convert map to array and sort
      const formattedBrands = Array.from(brandsMap.values()).filter(b =>
        b.allVariants.length > 0
      );

      setAgentBrands(formattedBrands);
    } catch (error) {
      console.error('Error fetching agent inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      console.log('⚠️ No user ID available, skipping inventory fetch and subscription');
      setLoading(false);
      return;
    }

    console.log(`📦 AgentInventoryContext: Fetching inventory for user ${user.id} (${user.role})`);
    fetchAgentInventory();

    let channel: RealtimeChannel | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    // Debounced refresh to prevent multiple rapid updates
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing agent inventory...');
        fetchAgentInventory();
      }, 300); // 300ms debounce
    };

    // Subscribe to agent_inventory changes for users with inventory (mobile_sales, team_leader, manager)
    if (hasInventory(user.role)) {
      console.log(`🎧 Setting up real-time subscription for agent_inventory (user: ${user.id}, role: ${user.role})`);

      // Subscribe to agent_inventory changes for this user
      channel = subscribeToTable(
        'agent_inventory',
        (payload) => {
          console.log('🔔 Agent inventory change detected:', payload.eventType, payload);
          debouncedRefresh();
        },
        '*',
        { column: 'agent_id', value: user.id }
      );

      console.log(`✅ Subscription initiated for agent_inventory (user: ${user.id})`);
    } else {
      console.log(`ℹ️ User role ${user.role} does not require agent_inventory subscription`);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channel) {
        console.log('🔌 Unsubscribing from agent_inventory');
        unsubscribe(channel);
      }
    };
  }, [user]);

  const getAgentInventoryByBrand = (brandName: string): AgentBrand | undefined => {
    return agentBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
  };

  const reduceStock = (
    brandName: string,
    variantName: string,
    variantType: string,
    quantity: number
  ) => {
    // Optimistic update
    setAgentBrands(prevBrands => {
      return prevBrands.map(brand => {
        if (brand.name.toLowerCase() !== brandName.toLowerCase()) {
          return brand;
        }

        const updateVariant = (v: AgentVariant) => {
          if (v.name === variantName) {
            const newStock = Math.max(0, v.stock - quantity);
            return { ...v, stock: newStock };
          }
          return v;
        };

        const typeLower = variantType.toLowerCase();

        return {
          ...brand,
          allVariants: brand.allVariants.map(updateVariant),
          flavors: typeLower === 'flavor' ? brand.flavors.map(updateVariant) : brand.flavors,
          batteries: typeLower === 'battery' ? brand.batteries.map(updateVariant) : brand.batteries,
          posms: typeLower === 'posm' ? brand.posms.map(updateVariant) : brand.posms,
          variantsByType: new Map(
            Array.from(brand.variantsByType.entries()).map(([type, variants]) => [
              type,
              type === typeLower ? variants.map(updateVariant) : variants
            ])
          )
        };
      });
    });
  };

  return (
    <AgentInventoryContext.Provider value={{
      agentBrands,
      loading,
      refreshInventory: fetchAgentInventory,
      setAgentBrands,
      getAgentInventoryByBrand,
      reduceStock
    }}>
      {children}
    </AgentInventoryContext.Provider>
  );
}
