import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { fetchHubDetails } from './fetchHubDetails';
import { HubLocationMap } from './HubLocationMap';
import type { HubRow } from './types';

type ViewHubLocationDialogProps = {
  hub: HubRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatCoord(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 7,
  });
}

export function ViewHubLocationDialog({
  hub,
  open,
  onOpenChange,
}: ViewHubLocationDialogProps) {
  const [flyToTrigger, setFlyToTrigger] = useState(0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['hub_details', hub?.id],
    queryFn: () => fetchHubDetails(hub!.id),
    enabled: open && !!hub?.id,
  });

  useEffect(() => {
    if (open && data) {
      setFlyToTrigger(n => n + 1);
    }
    if (!open) {
      setFlyToTrigger(0);
    }
  }, [open, data?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{hub?.hub_name ?? 'Hub location'}</DialogTitle>
          <DialogDescription>
            {data?.hub_location?.trim() || hub?.hub_location?.trim() || 'Map view of saved coordinates.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-md border bg-muted/30">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load hub location.'}
          </p>
        ) : data ? (
          <div className="space-y-3">
            <HubLocationMap
              className="min-h-[360px]"
              latitude={data.latitude}
              longitude={data.longitude}
              radiusMeter={data.radius_meter}
              readOnly
              active={open}
              flyToTrigger={flyToTrigger}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatCoord(data.latitude)}°, {formatCoord(data.longitude)}° ·{' '}
              {data.radius_meter} m radius
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
