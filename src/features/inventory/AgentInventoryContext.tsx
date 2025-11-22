import { useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AgentBrand, AgentVariant } from './types';
import { AgentInventoryContext } from './hooks';

export function AgentInventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [agentBrands, setAgentBrands] = useState<AgentBrand[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch agent inventory from Supabase
  const fetchAgentInventory = async () => {
    if (!user || user.role !== 'mobile_sales') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch all brands
      const { data: brandsData, error: brandsError } = await supabase
        .from('brands')
        .select('id, name')
        .order('name');

      if (brandsError) throw brandsError;

      // 2. Fetch agent's inventory items
      const { data: inventoryData, error: inventoryError } = await supabase
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
        .eq('agent_id', user.id);

      if (inventoryError) throw inventoryError;

      // 3. Fetch main inventory prices (unit_price) for reference
      const { data: mainInventoryData, error: mainInventoryError } = await supabase
        .from('main_inventory')
        .select('variant_id, unit_price, selling_price');

      if (mainInventoryError) throw mainInventoryError;

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
          batteries: []
        });
      });

      // Process inventory items
      inventoryData?.forEach((item: any) => {
        const variant = item.variants;
        if (!variant) return;

        const brand = brandsMap.get(variant.brand_id);
        if (brand) {
          const mainPriceInfo = mainPrices.get(variant.id) || { unit_price: 0, selling_price: 0 };

          // Determine effective price: selling_price (explicit) > allocated_price > unit_price
          // For agents, we primarily care about allocated_price (what they owe) or selling_price (SRP)
          // Let's use allocated_price as the primary "cost" to agent, and selling_price as SRP

          const agentVariant: AgentVariant = {
            id: variant.id,
            name: variant.name,
            stock: item.stock,
            price: item.allocated_price || mainPriceInfo.unit_price || 0, // Default to allocated price
            allocatedPrice: item.allocated_price,
            dspPrice: item.dsp_price,
            rspPrice: item.rsp_price,
            sellingPrice: mainPriceInfo.selling_price,
            unitPrice: mainPriceInfo.unit_price,
            status: item.status
          };

          if (variant.variant_type === 'flavor') {
            brand.flavors.push(agentVariant);
          } else {
            brand.batteries.push(agentVariant);
          }
        }
      });

      // Convert map to array and sort
      const formattedBrands = Array.from(brandsMap.values()).filter(b =>
        b.flavors.length > 0 || b.batteries.length > 0
      );

      setAgentBrands(formattedBrands);
    } catch (error) {
      console.error('Error fetching agent inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgentInventory();

    let channel: RealtimeChannel | null = null;

    if (user?.id && user.role === 'mobile_sales') {
      // Subscribe to agent_inventory changes for this user
      channel = subscribeToTable(
        'agent_inventory',
        () => {
          console.log('🔔 Agent inventory updated, refreshing...');
          fetchAgentInventory();
        },
        '*',
        { column: 'agent_id', value: user.id }
      );
    }

    return () => {
      if (channel) unsubscribe(channel);
    };
  }, [user]);

  const getAgentInventoryByBrand = (brandName: string): AgentBrand | undefined => {
    return agentBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
  };

  const reduceStock = (
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery',
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

        return {
          ...brand,
          flavors: variantType === 'flavor' ? brand.flavors.map(updateVariant) : brand.flavors,
          batteries: variantType === 'battery' ? brand.batteries.map(updateVariant) : brand.batteries
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
