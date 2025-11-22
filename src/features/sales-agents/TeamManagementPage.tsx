import { TeamManagementTab } from './components/TeamManagementTab';

export default function TeamManagementPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground">
            Manage sales teams and assign agents to leaders
          </p>
        </div>
      </div>
      
      <TeamManagementTab />
    </div>
  );
}
