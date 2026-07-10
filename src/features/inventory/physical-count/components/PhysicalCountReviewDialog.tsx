import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
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

import type { PhysicalCountLine } from '../types';
import { formatLotDate } from '../utils/formatLotDate';

type PhysicalCountReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchNumber: string;
  locationName: string;
  lines: PhysicalCountLine[];
  onConfirm: () => void;
};

export function PhysicalCountReviewDialog({
  open,
  onOpenChange,
  batchNumber,
  locationName,
  lines,
  onConfirm,
}: PhysicalCountReviewDialogProps) {
  const parsedLines = lines
    .map((line) => {
      const physical = Number(line.physicalQty);
      if (!Number.isFinite(physical) || line.physicalQty.trim() === '') return null;
      const variance = physical - line.systemQty;
      return { ...line, physical, variance };
    })
    .filter(Boolean) as Array<PhysicalCountLine & { physical: number; variance: number }>;

  const varianceLines = parsedLines.filter((l) => l.variance !== 0);
  const totalVariance = varianceLines.reduce((sum, l) => sum + l.variance, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review physical count</DialogTitle>
          <DialogDescription>
            Batch <strong>{batchNumber}</strong> at <strong>{locationName}</strong>. Review before
            signing. Variances are recorded for audit; system stock is not changed automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="secondary">{parsedLines.length} line(s) counted</Badge>
            <Badge variant={varianceLines.length > 0 ? 'destructive' : 'outline'}>
              {varianceLines.length} variance(s)
            </Badge>
            {varianceLines.length > 0 && (
              <Badge variant="outline">Net variance: {totalVariance > 0 ? '+' : ''}{totalVariance}</Badge>
            )}
          </div>

          {varianceLines.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead className="text-right">System</TableHead>
                    <TableHead className="text-right">Physical</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {varianceLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.brandName}</TableCell>
                      <TableCell>{line.variantName}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatLotDate(line.expirationDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{line.systemQty}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.physical}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          line.variance > 0 ? 'text-green-600' : 'text-destructive'
                        }`}
                      >
                        {line.variance > 0 ? '+' : ''}
                        {line.variance}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              All counted quantities match system quantities. The session will be recorded with no
              variances.
            </p>
          )}

          {varianceLines.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Use Stock Adjustments to correct inventory if needed.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button type="button" onClick={onConfirm}>
            Continue to signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PhysicalCountHistoryDetailDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    counted_at: string;
    batch: { batch_number: string } | null;
    warehouse_location: { name: string } | null;
    performed_by_user: { full_name: string } | null;
    signature_url: string;
    notes: string | null;
    lines: Array<{
      brand_name: string;
      variant_name: string;
      expiration_date: string | null;
      system_qty_snapshot: number;
      physical_qty: number;
      variance: number;
    }>;
  } | null;
}) {
  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Physical count detail</DialogTitle>
          <DialogDescription>
            {session.batch?.batch_number ?? 'Batch'} · {session.warehouse_location?.name ?? 'Location'}{' '}
            · {format(new Date(session.counted_at), 'MMM d, yyyy h:mm a')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Counted by: <strong>{session.performed_by_user?.full_name ?? 'Unknown'}</strong>
          </p>
          {session.notes && (
            <p className="text-sm text-muted-foreground">Notes: {session.notes}</p>
          )}

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Physical</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.lines.map((line, idx) => (
                  <TableRow key={`${line.variant_name}-${idx}`}>
                    <TableCell>{line.brand_name}</TableCell>
                    <TableCell>{line.variant_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatLotDate(line.expiration_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{line.system_qty_snapshot}</TableCell>
                    <TableCell className="text-right tabular-nums">{line.physical_qty}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${
                        line.variance > 0
                          ? 'text-green-600'
                          : line.variance < 0
                            ? 'text-destructive'
                            : ''
                      }`}
                    >
                      {line.variance > 0 ? '+' : ''}
                      {line.variance}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {session.signature_url && (
            <div className="rounded-md border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Counter signature</p>
              <img
                src={session.signature_url}
                alt="Physical count signature"
                className="max-h-32 mx-auto border rounded bg-white"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
