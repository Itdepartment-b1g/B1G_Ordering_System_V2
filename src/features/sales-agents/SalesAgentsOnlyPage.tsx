import { SalesAgentsTab } from './components/SalesAgentsTab';

export default function SalesAgentsOnlyPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Agents</h1>
          <p className="text-muted-foreground">
            Manage sales agents and their information
          </p>
        </div>
      </div>
      
      <SalesAgentsTab />
    </div>
  );
}
