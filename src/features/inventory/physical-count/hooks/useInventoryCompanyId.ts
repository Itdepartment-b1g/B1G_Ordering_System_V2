import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type PhysicalCountTenantContext = {
  inventoryCompanyId: string | null;
  hasWarehouseLink: boolean;
  isHubLinked: boolean;
};

type TenantContextRpcResult = {
  success?: boolean;
  error?: string;
  inventory_company_id?: string | null;
  has_warehouse_link?: boolean;
};

export function useInventoryCompanyId(tenantCompanyId?: string, enabled = true) {
  const query = useQuery({
    queryKey: ['physical-count-tenant-context', tenantCompanyId],
    enabled: enabled && !!tenantCompanyId,
    staleTime: 60_000,
    queryFn: async (): Promise<PhysicalCountTenantContext> => {
      const { data, error } = await supabase.rpc('get_physical_count_tenant_context', {
        p_tenant_company_id: tenantCompanyId!,
      });

      if (error) throw error;

      const result = data as TenantContextRpcResult | null;
      if (!result?.success) {
        throw new Error(result?.error ?? 'Failed to resolve inventory company');
      }

      const inventoryCompanyId = result.inventory_company_id ?? null;
      const hasWarehouseLink = result.has_warehouse_link === true;

      return {
        inventoryCompanyId,
        hasWarehouseLink,
        isHubLinked:
          hasWarehouseLink &&
          !!inventoryCompanyId &&
          inventoryCompanyId !== tenantCompanyId,
      };
    },
  });

  return {
    inventoryCompanyId: query.data?.inventoryCompanyId ?? null,
    hasWarehouseLink: query.data?.hasWarehouseLink ?? false,
    isHubLinked: query.data?.isHubLinked ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
