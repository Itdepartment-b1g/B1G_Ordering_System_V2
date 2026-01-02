import { useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentBrand, AgentVariant } from './types';
import { AgentInventoryContext } from './hooks';

export function AgentInventoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Fetcher function
  const fetchAgentInventory = async (): Promise<AgentBrand[]> => {
    if (!user || (user.role !== 'mobile_sales' && user.role !== 'team_leader')) {
      return [];
    }

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

    // 3. Fetch main inventory prices
    const { data: mainInventoryData, error: mainInventoryError } = await supabase
      .from('main_inventory')
      .select('variant_id, unit_price, selling_price');

    if (mainInventoryError) throw mainInventoryError;

    const mainPrices = new Map();
    mainInventoryData?.forEach((item: any) => {
      mainPrices.set(item.variant_id, {
        unit_price: item.unit_price,
        selling_price: item.selling_price
      });
    });

    // 4. Structure the data
    const brandsMap = new Map<string, AgentBrand>();
    brandsData?.forEach((brand: any) => {
      brandsMap.set(brand.id, {
        id: brand.id,
        name: brand.name,
        flavors: [],
        batteries: [],
        posms: []
      });
    });

    inventoryData?.forEach((item: any) => {
      const variant = item.variants;
      if (!variant) return;

      const brand = brandsMap.get(variant.brand_id);
      if (brand) {
        const mainPriceInfo = mainPrices.get(variant.id) || { unit_price: 0, selling_price: 0 };
        const agentVariant: AgentVariant = {
          id: variant.id,
          name: variant.name,
          stock: item.stock,
          price: item.allocated_price || mainPriceInfo.unit_price || 0,
          allocatedPrice: item.allocated_price,
          dspPrice: item.dsp_price,
          rspPrice: item.rsp_price,
          sellingPrice: mainPriceInfo.selling_price,
          unitPrice: mainPriceInfo.unit_price,
          status: item.status
        };

        const vType = (variant.variant_type || '').toLowerCase();
        if (vType === 'flavor') brand.flavors.push(agentVariant);
        else if (vType === 'battery') brand.batteries.push(agentVariant);
        else if (vType === 'posm') brand.posms.push(agentVariant);
      }
    });

    return Array.from(brandsMap.values()).filter(b =>
      b.flavors.length > 0 || b.batteries.length > 0 || b.posms.length > 0
    );
  };

  const { data: agentBrands = [], isLoading: loading } = useQuery({
    queryKey: ['agent_inventory', user?.id],
    queryFn: fetchAgentInventory,
    enabled: !!user && (user.role === 'mobile_sales' || user.role === 'team_leader'),
  });

  // Real-time
  useEffect(() => {
    if (!user || (user.role !== 'mobile_sales' && user.role !== 'team_leader')) return;

    const channel = supabase
      .channel(`agent_inventory_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_inventory',
          filter: `agent_id=eq.${user.id}`
        },
        () => {
          qc.invalidateQueries({ queryKey: ['agent_inventory', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const getAgentInventoryByBrand = useCallback((brandName: string): AgentBrand | undefined => {
    return agentBrands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
  }, [agentBrands]);

  const reduceStock = useCallback((
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery' | 'posm',
    quantity: number
  ) => {
    qc.setQueryData(['agent_inventory', user?.id], (old: AgentBrand[] | undefined) => {
      if (!old) return old;
      return old.map(brand => {
        if (brand.name.toLowerCase() !== brandName.toLowerCase()) return brand;

        const updateVariant = (v: AgentVariant) => {
          if (v.name === variantName) {
            return { ...v, stock: Math.max(0, v.stock - quantity) };
          }
          return v;
        };

        return {
          ...brand,
          flavors: variantType === 'flavor' ? brand.flavors.map(updateVariant) : brand.flavors,
          batteries: variantType === 'battery' ? brand.batteries.map(updateVariant) : brand.batteries,
          posms: variantType === 'posm' ? brand.posms.map(updateVariant) : brand.posms
        };
      });
    });
  }, [qc, user?.id]);

  return (
    <AgentInventoryContext.Provider value={{
      agentBrands,
      loading,
      refreshInventory: () => qc.invalidateQueries({ queryKey: ['agent_inventory', user?.id] }),
      setAgentBrands: (brands: AgentBrand[]) => qc.setQueryData(['agent_inventory', user?.id], brands),
      getAgentInventoryByBrand,
      reduceStock
    }}>
      {children}
    </AgentInventoryContext.Provider>
  );
}
