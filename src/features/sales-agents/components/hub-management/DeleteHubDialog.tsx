import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

import type { HubRow } from './types';

type DeleteHubDialogProps = {
  hub: HubRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
};

export function DeleteHubDialog({ hub, open, onOpenChange, onDeleted }: DeleteHubDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!hub) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('hubs').delete().eq('id', hub.id);
      if (error) throw error;

      toast.success('Hub deleted', { description: hub.hub_name });
      onDeleted?.();
      onOpenChange(false);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not delete hub. It may still be linked to attendance or team assignments.';
      toast.error('Could not delete hub', { description: message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete hub?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes <span className="font-medium text-foreground">{hub?.hub_name}</span>.
            Attendance records that referenced this hub will keep their history but lose the hub link.
            Team leader hub assignments for this hub will also be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete hub'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
