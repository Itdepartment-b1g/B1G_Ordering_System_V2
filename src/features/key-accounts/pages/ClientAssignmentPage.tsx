import { ClientAssignmentManager } from '../components/ClientAssignmentManager';

/**
 * Client assignment for Sales Admin (all directors/KAMs) and Sales Director (own KAMs only).
 */
export function ClientAssignmentPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Client Assignment</h1>
        <p className="text-muted-foreground">
          Assign Key Account Managers to clients. Sales Directors assign only to KAMs on their team.
        </p>
      </div>
      <ClientAssignmentManager />
    </div>
  );
}
