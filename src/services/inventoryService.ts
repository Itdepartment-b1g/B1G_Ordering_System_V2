/**
 * Inventory Service
 * 
 * Pure functions for inventory data fetching and mutations.
 * No React hooks - these can be used in tests or non-React contexts.
 */

import { supabase } from '@/lib/supabase';

// Types
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

export interface UpdateVariantParams {
    variantId: string;
    name: string;
    stock: number;
    price: number;
    sellingPrice?: number;
    dspPrice?: number;
    rspPrice?: number;
}

export interface AddInventoryParams {
    brandName: string;
    variantName: string;
    variantType: 'flavor' | 'battery' | 'posm';
    quantity: number;
    unitPrice: number;
    companyId: string;
}

export interface AllocatedStockMap {
    [variantId: string]: number;
}

// Helper functions
const calculateStatus = (stock: number, reorderLevel: number = 50): 'in-stock' | 'low-stock' | 'out-of-stock' => {
    if (stock === 0) return 'out-of-stock';
    if (stock < reorderLevel) return 'low-stock';
    return 'in-stock';
};

/**
 * Fetch all brands with their variants and inventory data
 */
export const getBrands = async (companyId: string): Promise<Brand[]> => {
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
                }) || []).filter(Boolean) as Variant[],
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
                }) || []).filter(Boolean) as Variant[],
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
                }) || []).filter(Boolean) as Variant[],
        };
    });

    return transformedBrands.filter(b => (b.flavors.length + b.batteries.length + b.posms.length) > 0);
};

/**
 * Fetch allocated stock across all agents
 */
export const getAllocatedStock = async (companyId: string): Promise<AllocatedStockMap> => {
    // Get all agents who are assigned to a leader (subordinates)
    const { data: assignments, error: assignmentErr } = await supabase
        .from('leader_teams')
        .select('agent_id')
        .eq('company_id', companyId);

    if (assignmentErr) throw assignmentErr;

    const subordinateIds = (assignments || []).map(a => a.agent_id);

    // Get all agent_inventory records
    const { data: allInventory, error: inventoryErr } = await supabase
        .from('agent_inventory')
        .select('variant_id, stock, agent_id')
        .eq('company_id', companyId);

    if (inventoryErr) throw inventoryErr;

    // Only sum stock for users who are NOT subordinates (Top-Level)
    const allocations: AllocatedStockMap = {};
    allInventory?.forEach(item => {
        if (!subordinateIds.includes(item.agent_id)) {
            allocations[item.variant_id] = (allocations[item.variant_id] || 0) + (item.stock || 0);
        }
    });

    return allocations;
};

/**
 * Update variant details and inventory
 */
export const updateVariant = async (params: UpdateVariantParams): Promise<void> => {
    const { variantId, name, stock, price, sellingPrice, dspPrice, rspPrice } = params;

    // Update variant name
    await supabase.from('variants').update({ name } as any).eq('id', variantId);

    // Check if inventory exists
    const { data: existingInventory } = await supabase
        .from('main_inventory')
        .select('id')
        .eq('variant_id', variantId)
        .maybeSingle();

    if (existingInventory) {
        // Update existing inventory
        await supabase.from('main_inventory').update({
            stock,
            unit_price: price,
            ...(sellingPrice !== undefined ? { selling_price: sellingPrice } : {}),
            ...(dspPrice !== undefined ? { dsp_price: dspPrice } : {}),
            ...(rspPrice !== undefined ? { rsp_price: rspPrice } : {})
        } as any).eq('variant_id', variantId);
    } else {
        // Create new inventory record
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
};

/**
 * Update brand name
 */
export const updateBrandName = async (brandId: string, newName: string): Promise<void> => {
    const { error } = await supabase
        .from('brands')
        .update({ name: newName } as any)
        .eq('id', brandId);

    if (error) throw error;
};

/**
 * Add or update inventory for a brand/variant
 */
export const addOrUpdateInventory = async (params: AddInventoryParams): Promise<void> => {
    const { brandName, variantName, variantType, quantity, unitPrice, companyId } = params;

    // Find or create brand
    let { data: brand } = await supabase
        .from('brands')
        .select('id')
        .eq('name', brandName)
        .eq('company_id', companyId)
        .maybeSingle();

    if (!brand) {
        const { data: newBrand } = await supabase
            .from('brands')
            .insert({ name: brandName, description: `${brandName} products`, company_id: companyId } as any)
            .select('id')
            .maybeSingle();
        brand = newBrand;
    }

    if (!brand) throw new Error('Failed to create or find brand');

    // Find or create variant
    let { data: variant } = await supabase
        .from('variants')
        .select('id')
        .eq('brand_id', brand.id)
        .eq('name', variantName)
        .eq('variant_type', variantType)
        .maybeSingle();

    if (!variant) {
        const sku = `${brandName.toUpperCase()}-${variantType === 'flavor' ? 'F' : variantType === 'battery' ? 'B' : 'P'}-${variantName.toUpperCase().replace(/\s+/g, '')}`;
        const { data: newVariant } = await supabase
            .from('variants')
            .insert({ brand_id: brand.id, name: variantName, variant_type: variantType, sku, company_id: companyId } as any)
            .select('id')
            .maybeSingle();
        variant = newVariant;
    }

    if (!variant) throw new Error('Failed to create or find variant');

    // Update or create inventory
    const { data: inventory } = await supabase
        .from('main_inventory')
        .select('stock')
        .eq('variant_id', variant.id)
        .maybeSingle();

    if (inventory) {
        await supabase
            .from('main_inventory')
            .update({ stock: (inventory.stock as number) + quantity, unit_price: unitPrice } as any)
            .eq('variant_id', variant.id);
    } else {
        await supabase
            .from('main_inventory')
            .insert({
                variant_id: variant.id,
                stock: quantity,
                unit_price: unitPrice,
                company_id: companyId,
                reorder_level: variantType === 'flavor' ? 50 : variantType === 'battery' ? 30 : 20
            } as any);
    }
};

/**
 * Delete a variant and all related records
 */
export const deleteVariant = async (variantId: string, companyId: string): Promise<void> => {
    const { error } = await supabase.rpc('delete_inventory_variant', {
        p_variant_id: variantId,
        p_company_id: companyId
    });

    if (error) throw error;
};
