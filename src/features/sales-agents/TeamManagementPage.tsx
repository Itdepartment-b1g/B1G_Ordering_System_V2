import { useState } from 'react';
import { TeamManagementTab } from './components/TeamManagementTab';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function TeamManagementPage() {
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      {/* Mobile Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Manage sales teams and assign agents to leaders
          </p>
        </div>
        <Button 
          onClick={() => setCreateTeamDialogOpen(true)}
          className="w-full md:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" /> Create Manager Team
        </Button>
      </div>

      <TeamManagementTab
        createTeamDialogOpen={createTeamDialogOpen}
        setCreateTeamDialogOpen={setCreateTeamDialogOpen}
        showCreateButton={false}
      />
    </div>
  );
}
