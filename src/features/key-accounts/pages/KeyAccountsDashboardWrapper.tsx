import { useAuth } from '@/features/auth';
import { SalesAdminDashboard } from '../dashboard/SalesAdminDashboard';
import { SalesDirectorDashboard } from '../dashboard/SalesDirectorDashboard';
import { KAMDashboard } from '../dashboard/KAMDashboard';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

/**
 * Wrapper component that renders the appropriate dashboard
 * based on the user's Key Account role
 */
export function KeyAccountsDashboardWrapper() {
  const { user } = useAuth();

  // Show loading while checking auth
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Render appropriate dashboard based on role
  switch (user.role) {
    case 'sales_head':
    case 'sales_admin':
      return <SalesAdminDashboard />;
    case 'sales_director':
      return <SalesDirectorDashboard />;
    case 'key_account_manager':
      return <KAMDashboard />;
    default:
      // If non-Key Account user somehow lands here
      return (
        <div className="p-6">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">
                You don't have permission to access the Key Accounts dashboard.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Your role: <strong>{user.role}</strong>
              </p>
            </CardContent>
          </Card>
        </div>
      );
  }
}
