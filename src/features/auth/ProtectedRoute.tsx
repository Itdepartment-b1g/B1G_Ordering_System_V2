import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/features/shared/components/AppSidebar';
import { NotificationsDropdown } from '@/features/shared/components/NotificationsDropdown';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

  // Super Admin has full access to all routes (within their company via RLS)
  if (user?.role === 'super_admin') {
    // Allow access to all routes
  }
  // Note: Role-based route restrictions can be added here for other roles

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full overflow-x-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          <header className="h-16 border-b flex items-center justify-between px-4 bg-background overflow-x-hidden">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <NotificationsDropdown />
            </div>
          </header>
          <main className="flex-1 overflow-auto overflow-x-hidden bg-muted/30 w-full max-w-full">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

