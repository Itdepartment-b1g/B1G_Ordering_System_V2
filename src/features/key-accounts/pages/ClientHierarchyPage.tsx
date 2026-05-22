import { ClientHierarchyManager } from '../components/ClientHierarchyManager';
import { useAuth } from '@/features/auth';

/**
 * Standalone page for Client Hierarchy management
 * Accessible via sidebar navigation for Sales Admin
 */
export function ClientHierarchyPage() {
  const { user } = useAuth();
  const isKeyAccountManager = user?.role === 'key_account_manager';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isKeyAccountManager ? 'My Clients' : 'Client Hierarchy'}
        </h1>
        <p className="text-muted-foreground">
          {isKeyAccountManager
            ? 'View the Key Account clients assigned to you'
            : 'Manage parent clients, shops, and delivery addresses'}
        </p>
      </div>
      <ClientHierarchyManager />
    </div>
  );
}
