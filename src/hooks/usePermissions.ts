import { useAuth } from '@/features/auth';

/**
 * Hook to check user permissions
 * Super Admin has full access to all routes
 */
export function usePermissions() {
  const { user } = useAuth();

  const checkPermission = (route: string): boolean => {
    // Super Admin has full access to all routes
    if (user?.role === 'super_admin') {
      return true;
    }

    // System Administrator has access to system admin routes only
    if (user?.role === 'system_administrator') {
      const systemAdminRoutes = [
        '/sys-admin-dashboard',
        '/system-admin',
        '/profile',
      ];
      return systemAdminRoutes.includes(route) || route.startsWith('/sys-admin');
    }

    // For other roles, you can add specific route checks here
    // For now, return true for all authenticated users (will be refined later)
    return true;
  };

  const checkFeature = (feature: string): boolean => {
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
  };
}

