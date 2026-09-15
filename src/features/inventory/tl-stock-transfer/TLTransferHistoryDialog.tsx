import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { fetchTlTransferHistory, type TlTransferHistoryPayload } from './tlTransferHistory';
import { TLTransferHistoryTimeline } from './TLTransferHistoryTimeline';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: TLRequestWithDetails[];
};

export function TLTransferHistoryDialog({ open, onOpenChange, lines }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<TlTransferHistoryPayload | null>(null);
  const requestNumber = lines[0]?.request_number;
  const requestId = lines[0]?.request_id;

  useEffect(() => {
    if (!open || !requestId || lines.length === 0) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchTlTransferHistory(lines);
        if (!cancelled) setPayload(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setPayload(null);
          setError(e instanceof Error ? e.message : 'Failed to load transfer history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, requestId, lines]); // lines identity changes with the selected transfer

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History{requestNumber ? ` — ${requestNumber}` : ''}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <TLTransferHistoryTimeline payload={payload} />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
