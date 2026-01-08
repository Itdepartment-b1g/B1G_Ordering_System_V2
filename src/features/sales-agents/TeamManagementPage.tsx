import { useState } from 'react';
import { TeamManagementTab } from './components/TeamManagementTab';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function TeamManagementPage() {
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage sales teams and assign agents to leaders
          </p>
        </div>
        <Button onClick={() => setCreateTeamDialogOpen(true)}>
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
