import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { PhysicalCountLine } from '../types';
import { formatLotDate } from '../utils/formatLotDate';
import { getBoxCountBreakdown } from '../utils/physicalCountQty';

type PhysicalCountLineTableProps = {
  lines: PhysicalCountLine[];
  onBoxCountChange: (lineId: string, value: string) => void;
  onUnitsPerBoxChange: (lineId: string, value: string) => void;
  onRemoveLine: (lineId: string) => void;
};

const qtyInputClassName = 'h-9 tabular-nums';

export function PhysicalCountLineTable({
  lines,
  onBoxCountChange,
  onUnitsPerBoxChange,
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
            <TableHead className="w-24 text-center">Boxes</TableHead>
            <TableHead className="w-8 px-0" />
            <TableHead className="w-28 text-center">Qty/box</TableHead>
            <TableHead className="w-36">Physical Qty</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const breakdown = getBoxCountBreakdown(line);

            return (
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
                    step={1}
                    inputMode="numeric"
                    placeholder="0"
                    value={line.boxCount}
                    onChange={(e) => onBoxCountChange(line.id, e.target.value)}
                    className={qtyInputClassName}
                    aria-label={`Boxes for ${line.variantName}`}
                  />
                </TableCell>
                <TableCell className="px-0 text-center text-muted-foreground text-sm">×</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    placeholder="0"
                    value={line.unitsPerBox}
                    onChange={(e) => onUnitsPerBoxChange(line.id, e.target.value)}
                    className={qtyInputClassName}
                    aria-label={`Quantity per box for ${line.variantName}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div
                      className={`flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm tabular-nums ${
                        line.physicalQty ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                      aria-label={`Physical quantity for ${line.variantName}`}
                    >
                      {line.physicalQty || '—'}
                    </div>
                    {breakdown && (
                      <p className="text-xs text-muted-foreground tabular-nums">= {breakdown}</p>
                    )}
                  </div>
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
