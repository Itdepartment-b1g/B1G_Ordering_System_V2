import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  formatReceivePacking,
  getBoxedUnits,
  getLooseUnits,
  hasReceivePacking,
  type LotReceivePacking,
  type ReceivePackingFields,
} from '../utils/formatReceivePacking';

export type LotPackingDialogTarget = {
  variantName: string;
  batchNumber?: string | null;
  packing: LotReceivePacking | ReceivePackingFields | null;
  /** On-hand / remaining qty shown alongside receive packing when available. */
  remainingQty?: number | null;
};

type LotPackingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LotPackingDialogTarget | null;
};

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString();
}

export function LotPackingDialog({ open, onOpenChange, target }: LotPackingDialogProps) {
  const packing = target?.packing ?? null;
  const hasPacking = hasReceivePacking(packing);
  const boxedUnits = packing ? getBoxedUnits(packing) : null;
  const looseUnits = packing ? getLooseUnits(packing) : 0;

  // Count standard and loose boxes separately so the summary matches older receive records too.
  const notLooseBoxes = packing?.box_count != null ? Number(packing.box_count) : 0;
  const looseBoxes =
    packing == null
      ? 0
      : packing.loose_box_count != null || packing.loose_qty != null
        ? Number(packing.loose_box_count ?? 0)
        : packing.extra_qty
          ? 1
          : 0;
  const totalBoxes = notLooseBoxes + looseBoxes;
  const totalUnits =
    packing && 'quantity' in packing && packing.quantity != null
      ? Number(packing.quantity)
      : (boxedUnits ?? 0) + looseUnits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packing
          </DialogTitle>
          <DialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">{target.variantName}</span>
                {target.batchNumber ? (
                  <span className="text-muted-foreground"> · {target.batchNumber}</span>
                ) : null}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {!hasPacking || !packing ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No box packing was saved for this lot (adjustments, opening balance, or older
            receives).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">Total boxes</div>
                <div className="text-xl font-semibold tabular-nums">{fmt(totalBoxes)}</div>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs text-muted-foreground">Total qty</div>
                <div className="text-xl font-semibold tabular-nums">{fmt(totalUnits)}</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">Qty/box</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Not loose</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(packing.box_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(packing.units_per_box)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {boxedUnits != null ? fmt(boxedUnits) : '—'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Loose</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {packing.loose_box_count != null || packing.loose_qty != null
                      ? fmt(packing.loose_box_count ?? 0)
                      : packing.extra_qty
                        ? '1'
                        : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {packing.loose_qty != null
                      ? fmt(packing.loose_qty)
                      : packing.extra_qty
                        ? fmt(packing.extra_qty)
                        : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {looseUnits > 0 ? fmt(looseUnits) : '—'}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t bg-muted/30">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmt(totalBoxes)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    n/a
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmt(totalUnits)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              {formatReceivePacking(packing)}
              {target?.remainingQty != null
                ? ` · Remaining ${fmt(target.remainingQty)}`
                : ''}
            </p>
          </div>
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
