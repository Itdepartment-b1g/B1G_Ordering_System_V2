import { KeyAccountTeamManagement } from '../components/KeyAccountTeamManagement';

/**
 * Standalone page for Key Account Team Management
 * Accessible via sidebar navigation for Sales Admin
 * Shows Sales Directors and KAMs
 */
export function KeyAccountTeamPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Management</h1>
        <p className="text-muted-foreground">
          Manage Sales Directors and Key Account Managers
        </p>
      </div>
      <KeyAccountTeamManagement />
    </div>
  );
}
