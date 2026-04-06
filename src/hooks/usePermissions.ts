import { useAuth } from '@/features/auth';

/**
 * Hook to check user permissions
 * Super Admin has full access to all routes
 */
export function usePermissions() {
  const { user, impersonatedCompany } = useAuth();

  const checkPermission = (route: string): boolean => {
    // If impersonating, allow full navigation access to the tenant environment.
    // Read-only restrictions are enforced globally via CSS and checkFeature.
    if (impersonatedCompany) {
      return true;
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

