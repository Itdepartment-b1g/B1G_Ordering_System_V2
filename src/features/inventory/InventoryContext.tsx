import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
}

interface InventoryContextType {
  brands: Brand[];
  loading: boolean;
  addOrUpdateInventory: (
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery',
    quantity: number,
    unitPrice: number
  ) => Promise<void>;
  updateBrandName: (brandId: string, newName: string) => Promise<void>;
  updateVariant: (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number) => Promise<void>;
  setBrands: (brands: Brand[]) => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);

  const calculateStatus = (stock: number, reorderLevel: number = 50): 'in-stock' | 'low-stock' | 'out-of-stock' => {
    if (stock === 0) return 'out-of-stock';
    if (stock < reorderLevel) return 'low-stock';
    return 'in-stock';
  };

  // Fetch inventory from Supabase
  const fetchInventory = async (showLoading: boolean = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

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
        .order('name');

      if (error) throw error;

      console.log('📦 Raw brands data from Supabase:', brandsData);

      const transformedBrands: Brand[] = (brandsData || []).map(brand => {
        console.log(`\n🏷️ Processing brand: ${brand.name}`);
        console.log('Variants:', brand.variants);

        return {
          id: brand.id,
          name: brand.name,
          flavors: (brand.variants
            ?.filter((v: any) => v.variant_type === 'flavor')
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((v: any) => {
              const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
              console.log(`  🍃 Flavor: ${v.name}`, { inventory, stock: inventory?.stock, price: inventory?.unit_price });
              // Hide variants that don't have a main_inventory row yet (appear only after PO approval)
              if (!inventory) return null;
              return {
                id: v.id,
                name: v.name,
                stock: inventory.stock,
                price: inventory.unit_price,
                sellingPrice: inventory.selling_price,
                dspPrice: inventory.dsp_price,
                rspPrice: inventory.rsp_price,
                status: calculateStatus(
                  inventory.stock,
                  inventory.reorder_level || 50
                ),
              };
            }) || [])
            .filter(Boolean) as any,
          batteries: (brand.variants
            ?.filter((v: any) => v.variant_type === 'battery')
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((v: any) => {
              const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
              console.log(`  🔋 Battery: ${v.name}`, { inventory, stock: inventory?.stock, price: inventory?.unit_price });
              // Hide variants that don't have a main_inventory row yet (appear only after PO approval)
              if (!inventory) return null;
              return {
                id: v.id,
                name: v.name,
                stock: inventory.stock,
                price: inventory.unit_price,
                sellingPrice: inventory.selling_price,
                dspPrice: inventory.dsp_price,
                rspPrice: inventory.rsp_price,
                status: calculateStatus(
                  inventory.stock,
                  inventory.reorder_level || 30
                ),
              };
            }) || [])
            .filter(Boolean) as any,
        };
      });

      // Hide brands that currently have no items in main_inventory (i.e., PO not yet approved)
      const filteredBrands = transformedBrands.filter(b => (b.flavors.length + b.batteries.length) > 0);
      console.log('✅ Transformed brands (filtered):', filteredBrands);
      setBrands(filteredBrands);
    } catch (err) {
      console.error('Error fetching inventory:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // Use the user from AuthContext to control fetching
  const { user } = useContext(AuthContext) || {};

  useEffect(() => {
    // Only fetch inventory if we have a user
    if (user) {
      console.log('📦 [InventoryProvider] User authenticated, fetching inventory...');
      fetchInventory();
    } else {
      setLoading(false);
    }

    // Debounce timer for smooth real-time updates
    let updateTimer: NodeJS.Timeout | null = null;

    const debouncedRefresh = () => {
      // Clear existing timer
      if (updateTimer) {
        clearTimeout(updateTimer);
      }

      // Set new timer to refresh after 300ms of no new changes
      updateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing inventory...');
        fetchInventory(false); // Pass false to skip loading state
      }, 300);
    };

    // Real-time subscriptions
    const channels: RealtimeChannel[] = [
      subscribeToTable('brands', debouncedRefresh),
      subscribeToTable('variants', debouncedRefresh),
      // When a PO is approved, rows are upserted in main_inventory and a transaction is logged.
      // Listen to both to ensure instant UI refresh across all cases.
      subscribeToTable('main_inventory', debouncedRefresh),
      subscribeToTable('inventory_transactions', debouncedRefresh),
    ];

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      channels.forEach(unsubscribe);
    };
  }, [user]);

  const addOrUpdateInventory = async (
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery',
    quantity: number,
    unitPrice: number
  ) => {
    try {
      // Find or create brand
      let { data: brand } = await supabase
        .from('brands')
        .select('id')
        .eq('name', brandName)
        .maybeSingle();

      if (!brand) {
        const { data: newBrand } = await supabase
          .from('brands')
          .insert({ name: brandName, description: `${brandName} products` } as any)
          .select('id')
          .maybeSingle();
        brand = newBrand;
      }

      if (!brand) return;

      // Find or create variant
      let { data: variant } = await supabase
        .from('variants')
        .select('id')
        .eq('brand_id', brand.id)
        .eq('name', variantName)
        .eq('variant_type', variantType)
        .maybeSingle();

      if (!variant) {
        const sku = `${brandName.toUpperCase()}-${variantType === 'flavor' ? 'F' : 'B'}-${variantName.toUpperCase().replace(/\s+/g, '')}`;
        const { data: newVariant } = await supabase
          .from('variants')
          .insert({
            brand_id: brand.id,
            name: variantName,
            variant_type: variantType,
            sku,
          } as any)
          .select('id')
          .maybeSingle();
        variant = newVariant;
      }

      if (!variant) return;

      // Update or create inventory
      const { data: inventory } = await supabase
        .from('main_inventory')
        .select('stock')
        .eq('variant_id', variant.id)
        .maybeSingle();

      if (inventory) {
        await supabase
          .from('main_inventory')
          .update({
            stock: (inventory.stock as number) + quantity,
            unit_price: unitPrice,
          } as any)
          .eq('variant_id', variant.id);
      } else {
        await supabase
          .from('main_inventory')
          .insert({
            variant_id: variant.id,
            stock: quantity,
            unit_price: unitPrice,
            reorder_level: variantType === 'flavor' ? 50 : 30,
          } as any);
      }
    } catch (err) {
      console.error('Error updating inventory:', err);
      throw err;
    }
  };

  const updateBrandName = async (brandId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from('brands')
        .update({ name: newName } as any)
        .eq('id', brandId);

      if (error) throw error;

      console.log(`✅ Brand name updated to: ${newName}`);

      // Real-time will handle updating the list
    } catch (err) {
      console.error('Error updating brand name:', err);
      throw err;
    }
  };

  const updateVariant = async (variantId: string, name: string, stock: number, price: number, sellingPrice?: number, dspPrice?: number, rspPrice?: number) => {
    try {
      // Update variant name
      const { error: variantError } = await supabase
        .from('variants')
        .update({ name } as any)
        .eq('id', variantId);

      if (variantError) {
        console.error('Error updating variant name:', variantError);
        throw variantError;
      }

      // Check if inventory record exists for this variant
      const { data: existingInventory, error: checkError } = await supabase
        .from('main_inventory')
        .select('id')
        .eq('variant_id', variantId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking inventory:', checkError);
        throw checkError;
      }

      if (existingInventory) {
        // Update existing inventory record
        const { error: updateError } = await supabase
          .from('main_inventory')
          .update({
            stock,
            unit_price: price,
            ...(sellingPrice !== undefined ? { selling_price: sellingPrice } : {}),
            ...(dspPrice !== undefined ? { dsp_price: dspPrice } : {}),
            ...(rspPrice !== undefined ? { rsp_price: rspPrice } : {})
          } as any)
          .eq('variant_id', variantId);

        if (updateError) {
          console.error('Error updating inventory:', updateError);
          throw updateError;
        }

        console.log(`✅ Inventory UPDATED for variant ${variantId}: Stock: ${stock}, Price: ₱${price}`);
      } else {
        // Insert new inventory record if it doesn't exist
        const { error: insertError } = await supabase
          .from('main_inventory')
          .insert({
            variant_id: variantId,
            stock,
            unit_price: price,
            selling_price: sellingPrice ?? 0,
            dsp_price: dspPrice ?? 0,
            rsp_price: rspPrice ?? 0,
            reorder_level: 50
          } as any);

        if (insertError) {
          console.error('Error inserting inventory:', insertError);
          throw insertError;
        }

        console.log(`✅ Inventory CREATED for variant ${variantId}: Stock: ${stock}, Price: ₱${price}`);
      }

      console.log(`✅ Variant updated: ${name}, Stock: ${stock}, Price: ₱${price}`);

      // Real-time will handle updating the list
    } catch (err) {
      console.error('Error updating variant:', err);
      throw err;
    }
  };

  return (
    <InventoryContext.Provider value={{ brands, loading, addOrUpdateInventory, updateBrandName, updateVariant, setBrands }}>
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
