import { SalesAgentsTab } from './components/SalesAgentsTab';

export default function SalesAgentsOnlyPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users Management</h1>
          <p className="text-muted-foreground">
            Manage Users and their information
          </p>
        </div>
      </div>

      <SalesAgentsTab />
    </div>
  );
}
