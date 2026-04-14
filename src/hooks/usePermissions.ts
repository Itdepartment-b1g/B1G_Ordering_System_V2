import { useAuth } from '@/features/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Hook to check user permissions
 * Super Admin has full access to all routes
 */
export function usePermissions() {
  const { user, impersonatedCompany } = useAuth();

  // If this tenant is linked to a warehouse hub, we lock the standard catalog
  // (brands & variant management) so only the warehouse controls catalog changes.
  const { data: hasWarehouseHubLink } = useQuery({
    queryKey: ['has-warehouse-hub-link', user?.company_id],
    enabled: !!user?.company_id && (user?.role === 'super_admin' || user?.role === 'admin'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_company_assignments')
        .select('id')
        .eq('client_company_id', user!.company_id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    staleTime: 1000 * 60, // 1 minute
  });

  const lockStandardCatalog = hasWarehouseHubLink === true;

  const checkPermission = (route: string): boolean => {
    // If impersonating, allow full navigation access to the tenant environment.
    // Read-only restrictions are enforced globally via CSS and checkFeature.
    if (impersonatedCompany) {
      return true;
    }

    if (lockStandardCatalog && (route === '/brands' || route === '/variant-types')) {
      return false;
    }

    // Super Admin has full access to all routes
    if (user?.role === 'super_admin') {
      return true;
    }

    // System Administrator has access to system admin routes only
    if (user?.role === 'system_administrator') {
      const systemAdminRoutes = [
        '/sys-admin-dashboard',
        '/system-admin',
        '/system-management',
        '/profile',
      ];
      return systemAdminRoutes.includes(route) || route.startsWith('/sys-admin');
    }

    // Executive has read-only access to specific routes
    if (user?.role === 'executive') {
      const executiveRoutes = [
        '/executive-dashboard',
        '/war-room',
        '/profile',
      ];
      return executiveRoutes.includes(route);
    }

    if (user?.role === 'warehouse') {
      const warehouseRoutes = [
        '/purchase-order-management',
        '/purchase-orders',
        '/brands',
        '/variant-types',
        '/inventory',
        '/inventory/board',
        '/inventory/main',
        '/inventory/sub-warehouses',
        '/profile',
      ];
      return warehouseRoutes.includes(route);
    }

    // For other roles, you can add specific route checks here
    // Restrict /orders to admin and finance roles
    if (route === '/orders') {
      return user?.role === 'admin' || user?.role === 'finance';
    }

    // For other roles, return true for all authenticated users (will be refined later)
    return true;
  };

  const checkFeature = (feature: string): boolean => {
    // If impersonating, block all features (mutations/actions)
    if (impersonatedCompany) {
      return false;
    }

    // Super Admin has access to all features
    if (user?.role === 'super_admin') {
      return true;
    }

    // Add feature-based checks for other roles here
    return false;
  };

  return {
    checkPermission,
    checkFeature,
    isSuperAdmin: user?.role === 'super_admin',
    isSystemAdmin: user?.role === 'system_administrator',
    isExecutive: user?.role === 'executive',
    isWarehouse: user?.role === 'warehouse',
  };
}

