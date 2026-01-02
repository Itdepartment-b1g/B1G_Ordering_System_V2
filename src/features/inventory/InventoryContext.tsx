import { createContext, useContext, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '@/features/auth/hooks';

export interface Variant {
  id: string;
  name: string;
  stock: number;
  price: number;
  sellingPrice?: number;
  dspPrice?: number;
  rspPrice?: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
}

export interface Brand {
  id: string;
  name: string;
  flavors: Variant[];
  batteries: Variant[];
  posms: Variant[];
}

interface InventoryContextType {
  brands: Brand[];
  loading: boolean;
  addOrUpdateInventory: (
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery' | 'posm',
    quantity: number,
    unitPrice: number
  ) => Promise<void>;
  updateBrandName: (brandId: string, newName: string) => Promise<void>;
  updateVariant: (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number, skipRefresh?: boolean) => Promise<void>;
  setBrands: (brands: Brand[]) => void;
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

const calculateStatus = (stock: number, reorderLevel: number = 50): 'in-stock' | 'low-stock' | 'out-of-stock' => {
  if (stock === 0) return 'out-of-stock';
  if (stock < reorderLevel) return 'low-stock';
  return 'in-stock';
};

const fetchInventory = async (companyId?: string): Promise<Brand[]> => {
  if (!companyId) return [];
  const { data: brandsData, error } = await supabase
    .from('brands')
    .select(`
      id,
      name,
      variants (
        id,
        name,
        variant_type,
        created_at,
        main_inventory (
          stock,
          unit_price,
          selling_price,
          dsp_price,
          rsp_price,
          reorder_level
        )
      )
    `)
    .eq('company_id', companyId)
    .order('name');

  if (error) throw error;

  const transformedBrands: Brand[] = (brandsData || []).map(brand => {
    return {
      id: brand.id,
      name: brand.name,
      flavors: (brand.variants
        ?.filter((v: any) => v.variant_type === 'flavor')
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((v: any) => {
          const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
          if (!inventory) return null;
          return {
            id: v.id,
            name: v.name,
            stock: inventory.stock,
            price: inventory.unit_price,
            sellingPrice: inventory.selling_price,
            dspPrice: inventory.dsp_price,
            rspPrice: inventory.rsp_price,
            status: calculateStatus(inventory.stock, inventory.reorder_level || 50),
          };
        }) || []).filter(Boolean) as any,
      batteries: (brand.variants
        ?.filter((v: any) => v.variant_type === 'battery')
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((v: any) => {
          const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
          if (!inventory) return null;
          return {
            id: v.id,
            name: v.name,
            stock: inventory.stock,
            price: inventory.unit_price,
            sellingPrice: inventory.selling_price,
            dspPrice: inventory.dsp_price,
            rspPrice: inventory.rsp_price,
            status: calculateStatus(inventory.stock, inventory.reorder_level || 30),
          };
        }) || []).filter(Boolean) as any,
      posms: (brand.variants
        ?.filter((v: any) => v.variant_type === 'POSM' || v.variant_type === 'posm')
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((v: any) => {
          const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
          if (!inventory) return null;
          return {
            id: v.id,
            name: v.name,
            stock: inventory.stock,
            price: inventory.unit_price,
            sellingPrice: inventory.selling_price ?? 0,
            dspPrice: inventory.dsp_price ?? 0,
            rspPrice: inventory.rsp_price ?? 0,
            status: calculateStatus(inventory.stock, inventory.reorder_level || 30),
          };
        }) || []).filter(Boolean) as any,
    };
  });

  return transformedBrands.filter(b => (b.flavors.length + b.batteries.length + b.posms.length) > 0);
};

export function InventoryProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useContext(AuthContext) || {};

  const { data: brands = [], isLoading: loading } = useQuery({
    queryKey: ['inventory', user?.company_id],
    queryFn: () => fetchInventory(user?.company_id),
    enabled: !!user?.company_id,
  });

  // Real-time
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('inventory_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brands' }, () => qc.invalidateQueries({ queryKey: ['inventory'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'variants' }, () => qc.invalidateQueries({ queryKey: ['inventory'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'main_inventory' }, () => qc.invalidateQueries({ queryKey: ['inventory'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_transactions' }, () => qc.invalidateQueries({ queryKey: ['inventory'] }))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  const addUpdateMutation = useMutation({
    mutationFn: async ({ brandName, variantName, variantType, quantity, unitPrice }: any) => {
      let { data: brand } = await supabase.from('brands').select('id').eq('name', brandName).maybeSingle();
      if (!brand) {
        const { data: newBrand } = await supabase.from('brands').insert({ name: brandName, description: `${brandName} products` } as any).select('id').maybeSingle();
        brand = newBrand;
      }
      if (!brand) return;

      let { data: variant } = await supabase.from('variants').select('id').eq('brand_id', brand.id).eq('name', variantName).eq('variant_type', variantType).maybeSingle();
      if (!variant) {
        const sku = `${brandName.toUpperCase()}-${variantType === 'flavor' ? 'F' : variantType === 'battery' ? 'B' : 'P'}-${variantName.toUpperCase().replace(/\s+/g, '')}`;
        const { data: newVariant } = await supabase.from('variants').insert({ brand_id: brand.id, name: variantName, variant_type: variantType, sku } as any).select('id').maybeSingle();
        variant = newVariant;
      }
      if (!variant) return;

      const { data: inventory } = await supabase.from('main_inventory').select('stock').eq('variant_id', variant.id).maybeSingle();
      if (inventory) {
        await supabase.from('main_inventory').update({ stock: (inventory.stock as number) + quantity, unit_price: unitPrice } as any).eq('variant_id', variant.id);
      } else {
        await supabase.from('main_inventory').insert({ variant_id: variant.id, stock: quantity, unit_price: unitPrice, reorder_level: variantType === 'flavor' ? 50 : variantType === 'battery' ? 30 : 20 } as any);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] })
  });

  const updateBrandMutation = useMutation({
    mutationFn: async ({ brandId, newName }: { brandId: string, newName: string }) => {
      const { error } = await supabase.from('brands').update({ name: newName } as any).eq('id', brandId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] })
  });

  const updateVariantMutation = useMutation({
    mutationFn: async ({ variantId, name, stock, price, sellingPrice, dspPrice, rspPrice }: any) => {
      await supabase.from('variants').update({ name } as any).eq('id', variantId);
      const { data: existingInventory } = await supabase.from('main_inventory').select('id').eq('variant_id', variantId).maybeSingle();

      if (existingInventory) {
        await supabase.from('main_inventory').update({
          stock,
          unit_price: price,
          ...(sellingPrice !== undefined ? { selling_price: sellingPrice } : {}),
          ...(dspPrice !== undefined ? { dsp_price: dspPrice } : {}),
          ...(rspPrice !== undefined ? { rsp_price: rspPrice } : {})
        } as any).eq('variant_id', variantId);
      } else {
        await supabase.from('main_inventory').insert({
          variant_id: variantId,
          stock,
          unit_price: price,
          selling_price: sellingPrice ?? 0,
          dsp_price: dspPrice ?? 0,
          rsp_price: rspPrice ?? 0,
          reorder_level: 50
        } as any);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] })
  });

  const addOrUpdateInventory = async (brandName: string, variantName: string, variantType: 'flavor' | 'battery', quantity: number, unitPrice: number) => {
    await addUpdateMutation.mutateAsync({ brandName, variantName, variantType, quantity, unitPrice });
  };

  const updateBrandName = async (brandId: string, newName: string) => {
    await updateBrandMutation.mutateAsync({ brandId, newName });
  };

  const updateVariant = async (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number, skipRefresh?: boolean) => {
    await updateVariantMutation.mutateAsync({ variantId, name, stock, price, sellingPrice, dspPrice, rspPrice });
  };

  return (
    <InventoryContext.Provider value={{
      brands,
      loading,
      addOrUpdateInventory,
      updateBrandName,
      updateVariant,
      setBrands: (brands: Brand[]) => qc.setQueryData(['inventory'], brands),
      refreshInventory: () => qc.invalidateQueries({ queryKey: ['inventory'] })
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
}
