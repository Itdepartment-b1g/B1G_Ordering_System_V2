import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { PhysicalCountLine } from '../types';
import { formatLotDate } from '../utils/formatLotDate';

type PhysicalCountLineTableProps = {
  lines: PhysicalCountLine[];
  onPhysicalQtyChange: (lineId: string, value: string) => void;
  onRemoveLine: (lineId: string) => void;
};

export function PhysicalCountLineTable({
  lines,
  onPhysicalQtyChange,
  onRemoveLine,
}: PhysicalCountLineTableProps) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Add brand/variant/lot lines or use &quot;Add all lots in batch&quot; to begin counting.
      </p>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Variant</TableHead>
            <TableHead>Expiration</TableHead>
            <TableHead className="w-32">Physical Qty</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">{line.brandName}</TableCell>
                <TableCell>{line.variantName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatLotDate(line.expirationDate)}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={line.physicalQty}
                    onChange={(e) => onPhysicalQtyChange(line.id, e.target.value)}
                    className="h-9"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveLine(line.id)}
                    aria-label={`Remove ${line.variantName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
