import { useEffect, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchPurchaseOrderHistory } from '../purchaseOrderEventsApi';
import type { PurchaseOrderHistoryPayload } from '../purchaseOrderHistoryTypes';
import type { PurchaseOrder } from '../types';
import { exportPurchaseOrderHistoryPdf } from '../utils/exportPurchaseOrderHistoryPdf';
import { PurchaseOrderHistoryTimeline } from './PurchaseOrderHistoryTimeline';

type PurchaseOrderHistoryDialogProps = {
  purchaseOrderId: string | null;
  poNumber?: string | null;
  /** Full PO used to open DR / received receipts from timeline events. */
  purchaseOrder?: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PurchaseOrderHistoryDialog({
  purchaseOrderId,
  poNumber,
  purchaseOrder = null,
  open,
  onOpenChange,
}: PurchaseOrderHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PurchaseOrderHistoryPayload | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || !purchaseOrderId) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchPurchaseOrderHistory(purchaseOrderId);
        if (!cancelled) setPayload(data);
      } catch (e: unknown) {
        if (!cancelled) {
          setPayload(null);
          setError(e instanceof Error ? e.message : 'Failed to load PO history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, purchaseOrderId]);

  const titleNumber = payload?.poNumber || poNumber || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History{titleNumber ? ` — ${titleNumber}` : ''}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : (
          <PurchaseOrderHistoryTimeline
            history={payload?.history}
            items={payload?.items}
            purchaseOrder={purchaseOrder}
          />
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!payload || exporting}
            onClick={() => {
              if (!payload) return;
              setExporting(true);
              try {
                exportPurchaseOrderHistoryPdf(payload);
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 h-4 w-4" />
            )}
            Export PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
