import { createContext, useContext, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthContext } from '@/features/auth/hooks';

export interface Variant {
  id: string;
  name: string;
  variantType: string;
  stock: number;
  allocatedStock: number;
  price: number;
  sellingPrice?: number;
  dspPrice?: number;
  rspPrice?: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  /** Present when this row is backed by `main_inventory` (used for warehouse remove-stock). */
  mainInventoryId?: string;
}

export interface Brand {
  id: string;
  name: string;
  flavors: Variant[];
  batteries: Variant[];
  posms: Variant[];
  // Dynamic variants grouped by type
  variantsByType: Map<string, Variant[]>;
  allVariants: Variant[];
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
  /** When `stockOnly` is true, only `main_inventory.stock` is updated; price columns are left unchanged (warehouse role). */
  updateVariant: (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number, skipRefresh?: boolean, stockOnly?: boolean) => Promise<void>;
  setBrands: (brands: Brand[]) => void;
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

/** Variants with stock at or below this are shown as low stock. */
export const LOW_STOCK_THRESHOLD = 10;

const calculateStatus = (stock: number, reorderLevel: number = LOW_STOCK_THRESHOLD): 'in-stock' | 'low-stock' | 'out-of-stock' => {
  if (stock === 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
};

const fetchInventory = async (companyId?: string): Promise<Brand[]> => {
  if (!companyId) return [];
  const { data: brandsData, error } = await supabase
    .from('brands')
    .select(`
      id,
      name,
      is_active,
      variants (
        id,
        name,
        variant_type,
        created_at,
        is_active,
        main_inventory (
          id,
          stock,
          allocated_stock,
          unit_price,
          selling_price,
          dsp_price,
          rsp_price,
          reorder_level
        )
      )
    `)
    .eq('company_id', companyId)
    .or('is_active.eq.true,is_active.is.null')
    .order('name');

  if (error) throw error;

  const transformedBrands: Brand[] = (brandsData || []).map(brand => {
    // Process all variants
    const allVariants: Variant[] = (brand.variants || [])
      .filter((v: any) => v.is_active !== false)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((v: any) => {
        const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
        if (!inventory) return null;
        return {
          id: v.id,
          name: v.name,
          variantType: v.variant_type,
          stock: inventory.stock,
          allocatedStock: inventory.allocated_stock || 0,
          price: inventory.unit_price,
          sellingPrice: inventory.selling_price ?? 0,
          dspPrice: inventory.dsp_price ?? 0,
          rspPrice: inventory.rsp_price ?? 0,
          status: calculateStatus(inventory.stock, inventory.reorder_level ?? LOW_STOCK_THRESHOLD),
          mainInventoryId: inventory.id,
        };
      })
      .filter(Boolean) as Variant[];

    // Group variants by type
    const variantsByType = new Map<string, Variant[]>();
    allVariants.forEach(variant => {
      const type = variant.variantType;
      if (!variantsByType.has(type)) {
        variantsByType.set(type, []);
      }
      variantsByType.get(type)!.push(variant);
    });

    return {
      id: brand.id,
      name: brand.name,
      // Keep legacy arrays for backward compatibility
      flavors: allVariants.filter(v => v.variantType === 'flavor'),
      batteries: allVariants.filter(v => v.variantType === 'battery'),
      posms: allVariants.filter(v => v.variantType === 'POSM' || v.variantType === 'posm'),
      // New dynamic structure
      variantsByType,
      allVariants,
    };
  });

  return transformedBrands.filter(b => b.allVariants.length > 0);
};

/**
 * Maps do not round-trip through JSON (e.g. persisted React Query cache). Rebuild from `allVariants`
 * so `variantsByType` stays correct after hard refresh / localStorage restore.
 */
function rebuildVariantsByType(allVariants: Variant[]): Map<string, Variant[]> {
  const m = new Map<string, Variant[]>();
  for (const variant of allVariants) {
    const type = variant.variantType;
    if (!m.has(type)) m.set(type, []);
    m.get(type)!.push(variant);
  }
  return m;
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useContext(AuthContext) || {};

  const { data: brands = [], isLoading: loading } = useQuery({
    queryKey: ['inventory', user?.company_id],
    queryFn: () => fetchInventory(user?.company_id),
    enabled: !!user?.company_id,
    select: (data) =>
      data.map((b) => ({
        ...b,
        variantsByType: rebuildVariantsByType(b.allVariants),
      })),
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
    mutationFn: async ({ brandName, variantName, variantType, quantity, unitPrice, companyId }: { brandName: string; variantName: string; variantType: 'flavor' | 'battery' | 'posm'; quantity: number; unitPrice: number; companyId: string }) => {
      let { data: brand } = await supabase.from('brands').select('id').eq('name', brandName).eq('company_id', companyId).maybeSingle();
      if (!brand) {
        const { data: newBrand } = await supabase.from('brands').insert({ name: brandName, description: `${brandName} products`, company_id: companyId, is_active: true } as any).select('id').maybeSingle();
        brand = newBrand;
      }
      if (!brand) return;

      let { data: variant } = await supabase.from('variants').select('id').eq('brand_id', brand.id).eq('name', variantName).eq('variant_type', variantType).maybeSingle();
      if (!variant) {
        const sku = `${brandName.toUpperCase()}-${variantType === 'flavor' ? 'F' : variantType === 'battery' ? 'B' : 'P'}-${variantName.toUpperCase().replace(/\s+/g, '')}`;
        const { data: newVariant } = await supabase.from('variants').insert({ brand_id: brand.id, name: variantName, variant_type: variantType, sku, company_id: companyId } as any).select('id').maybeSingle();
        variant = newVariant;
      }
      if (!variant) return;

      const { data: inventory } = await supabase.from('main_inventory').select('stock').eq('variant_id', variant.id).eq('company_id', companyId).maybeSingle();
      if (inventory) {
        await supabase.from('main_inventory').update({ stock: (inventory.stock as number) + quantity, unit_price: unitPrice } as any).eq('variant_id', variant.id).eq('company_id', companyId);
      } else {
        await supabase.from('main_inventory').insert({
          variant_id: variant.id,
          company_id: companyId,
          stock: quantity,
          unit_price: unitPrice,
          reorder_level: variantType === 'flavor' ? 50 : variantType === 'battery' ? 30 : 20
        } as any);
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
    mutationFn: async ({ variantId, name, stock, price, sellingPrice, dspPrice, rspPrice, companyId, stockOnly }: { variantId: string; name: string; stock: number; price: number; sellingPrice?: number; dspPrice?: number; rspPrice?: number; companyId?: string; stockOnly?: boolean }) => {
      await supabase.from('variants').update({ name } as any).eq('id', variantId);
      const invSelect = () => supabase.from('main_inventory').select('id').eq('variant_id', variantId);
      const { data: existingInventory } = companyId
        ? await invSelect().eq('company_id', companyId).maybeSingle()
        : await invSelect().maybeSingle();

      if (existingInventory) {
        if (stockOnly) {
          await supabase.from('main_inventory').update({ stock } as any).eq('variant_id', variantId);
        } else {
          await supabase.from('main_inventory').update({
            stock,
            unit_price: price,
            ...(sellingPrice !== undefined ? { selling_price: sellingPrice } : {}),
            ...(dspPrice !== undefined ? { dsp_price: dspPrice } : {}),
            ...(rspPrice !== undefined ? { rsp_price: rspPrice } : {})
          } as any).eq('variant_id', variantId);
        }
      } else {
        if (!companyId) throw new Error('companyId required to create main_inventory row');
        if (stockOnly) {
          await supabase.from('main_inventory').insert({
            variant_id: variantId,
            company_id: companyId,
            stock,
            unit_price: 0,
            selling_price: 0,
            dsp_price: 0,
            rsp_price: 0,
            reorder_level: 50
          } as any);
        } else {
          await supabase.from('main_inventory').insert({
            variant_id: variantId,
            company_id: companyId,
            stock,
            unit_price: price,
            selling_price: sellingPrice ?? 0,
            dsp_price: dspPrice ?? 0,
            rsp_price: rspPrice ?? 0,
            reorder_level: 50
          } as any);
        }
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inventory'] })
  });

  const addOrUpdateInventory = async (brandName: string, variantName: string, variantType: 'flavor' | 'battery' | 'posm', quantity: number, unitPrice: number) => {
    const companyId = user?.company_id;
    if (!companyId) throw new Error('Missing company');
    await addUpdateMutation.mutateAsync({ brandName, variantName, variantType, quantity, unitPrice, companyId });
  };

  const updateBrandName = async (brandId: string, newName: string) => {
    await updateBrandMutation.mutateAsync({ brandId, newName });
  };

  const updateVariant = async (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number, skipRefresh?: boolean, stockOnly?: boolean) => {
    await updateVariantMutation.mutateAsync({
      variantId,
      name,
      stock,
      price,
      sellingPrice,
      dspPrice,
      rspPrice,
      companyId: user?.company_id,
      stockOnly
    });
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
