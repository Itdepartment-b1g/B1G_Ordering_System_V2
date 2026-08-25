import { KeyAccountUserManagement } from "../components/KeyAccountUserManagement";

export function KeyAccountUserManagementPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Key Account User Management</h1>
          <p className="text-muted-foreground">Create, edit, and manage Key Account team members.</p>
        </div>
      </div>
      <KeyAccountUserManagement />
    </div>
  );
}