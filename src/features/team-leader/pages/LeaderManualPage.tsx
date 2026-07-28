import { Loader2 } from 'lucide-react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';

import LeaderManualList from '../components/leader-manual/LeaderManualList';

export default function LeaderManualPage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();

  if (!user || user.role !== 'team_leader') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only team leaders can access this page</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="w-full p-4 md:p-6">
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking warehouse link...
        </div>
      </div>
    );
  }

  if (!hasWarehouseHubLink) {
    return (
      <div className="w-full p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Warehouse not linked</CardTitle>
            <CardDescription>
              This manual is only available after your company is assigned to a warehouse hub.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <LeaderManualList />;
}