import { Navigate } from 'react-router-dom';
import { useAuth } from './hooks';

/**
 * Component that redirects users to their appropriate dashboard based on their role
 */
export function RoleBasedRedirect() {
  const { user, isLoading } = useAuth();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
              Loading...
            </span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If no user, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect based on role
  switch (user.role) {
    case 'system_administrator':
      return <Navigate to="/sys-admin-dashboard" replace />;
    case 'super_admin':
      return <Navigate to="/super-admin-dashboard" replace />;
    default:
      return <Navigate to="/dashboard" replace />;
  }
}

