import { Link, Navigate, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { useAuth } from './hooks';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/features/shared/components/AppSidebar';
import { NotificationsDropdown } from '@/features/shared/components/NotificationsDropdown';
import { MobileBottomNav, mobileSalesBottomNavItems } from '@/features/shared/components/MobileBottomNav';
import { cn } from '@/lib/utils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
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

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role-based access if allowedRoles is specified
  if (allowedRoles && allowedRoles.length > 0) {
    // Super Admin has access to everything
    if (user?.role !== 'super_admin' && !allowedRoles.includes(user?.role || '')) {
      // User doesn't have permission, redirect to their dashboard
      return <Navigate to="/" replace />;
    }
  }

  // Super Admin has full access to all routes (within their company via RLS)
  if (user?.role === 'super_admin') {
    // Allow access to all routes
  }
  // Note: Role-based route restrictions can be added here for other roles

  return (
    <SidebarProvider className="h-svh max-h-svh overflow-hidden">
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <AppSidebar />
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-30 flex h-16 shrink-0 items-center justify-between overflow-x-hidden border-b bg-background px-4">
            <div className="flex items-center gap-1">
              <SidebarTrigger />
              {user?.role === 'mobile_sales' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('h-7 w-7', location.pathname === '/pages' && 'bg-accent')}
                  asChild
                >
                  <Link to="/pages" aria-label="Pages">
                    <LayoutGrid className="h-5 w-5" />
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
            </div>
          </header>
          <main className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-muted/30">
            {children}
          </main>
          {user?.role === 'mobile_sales' && location.pathname !== '/pages' && (
            <MobileBottomNav items={mobileSalesBottomNavItems} />
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}

