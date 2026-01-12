/**
 * Inventory React Query Hooks
 * 
 * Custom hooks that wrap inventory service functions with React Query.
 * These provide caching, auto-refetching, and cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/services/queryKeys';
import * as inventoryService from '@/services/inventoryService';

/**
 * Fetch all brands with inventory data
 */
export function useInventoryBrands() {
    const { user } = useAuth();

    return useQuery({
        queryKey: queryKeys.inventory.brands(user?.company_id || ''),
        queryFn: () => inventoryService.getBrands(user!.company_id),
        enabled: !!user?.company_id,
    });
}

/**
 * Fetch allocated stock across all agents
 */
export function useAllocatedStock() {
    const { user } = useAuth();

    return useQuery({
        queryKey: queryKeys.inventory.allocations(user?.company_id || ''),
        queryFn: () => inventoryService.getAllocatedStock(user!.company_id),
        enabled: !!user?.company_id,
    });
}

/**
 * Update variant mutation
 */
export function useUpdateVariant() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: inventoryService.updateVariant,
        onSuccess: () => {
            // Invalidate all inventory queries to refetch fresh data
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
        },
    });
}

/**
 * Update brand name mutation
 */
export function useUpdateBrandName() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ brandId, newName }: { brandId: string; newName: string }) =>
            inventoryService.updateBrandName(brandId, newName),
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey:

                    queryKeys.inventory.all
            });
        },
    });
}

/**
 * Add or update inventory mutation
 */
export function useAddOrUpdateInventory() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: (params: Omit<inventoryService.AddInventoryParams, 'companyId'>) =>
            inventoryService.addOrUpdateInventory({
                ...params,
                companyId: user!.company_id,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
        },
    });
}

/**
 * Delete variant mutation
 */
export function useDeleteVariant() {
    const queryClient = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: (variantId: string) =>
            inventoryService.deleteVariant(variantId, user!.company_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
        },
    });
}

/**
 * Bulk update variants (e.g., bulk price updates)
 */
export function useBulkUpdateVariants() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (variants: inventoryService.UpdateVariantParams[]) => {
            // Execute all updates in parallel
            await Promise.all(variants.map(variant => inventoryService.updateVariant(variant)));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
        },
    });
}
