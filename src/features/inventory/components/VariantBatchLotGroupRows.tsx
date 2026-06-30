import { useState } from 'react';
import { differenceInDays, format } from 'date-fns';
import { ChevronDown, ChevronRight, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  type VariantBatchLotGroup,
  type VariantBatchLotRow,
} from '../variantBatchLotsGrouping';

const SOURCE_LABELS: Record<string, string> = {
  opening_balance: 'Opening balance',
  stock_request_receive: 'Stock request',
  adjustment_in: 'Adjustment',
};

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

type VariantBatchLotGroupRowsProps = {
  groups: VariantBatchLotGroup[];
  onViewAdjustments: (lot: VariantBatchLotRow) => void;
};

function LotDetailTable({
  lots,
  onViewAdjustments,
}: {
  lots: VariantBatchLotRow[];
  onViewAdjustments: (lot: VariantBatchLotRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mfg date</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="text-right">Days in warehouse</TableHead>
            <TableHead className="text-right w-[90px]">Adjustments</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lots.map((lot) => (
            <TableRow key={lot.lot_id}>
              <TableCell>{formatLotDate(lot.manufactured_date)}</TableCell>
              <TableCell>{formatLotDate(lot.expiration_date)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {lot.quantity_received.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {lot.quantity_remaining.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {differenceInDays(new Date(), new Date(lot.received_at))}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => onViewAdjustments(lot)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SingleLotRow({
  lot,
  onViewAdjustments,
}: {
  lot: VariantBatchLotRow;
  onViewAdjustments: (lot: VariantBatchLotRow) => void;
}) {
  return (
    <TableRow>
      <TableCell className="w-10" />
      <TableCell className="font-medium">{lot.batch_number}</TableCell>
      <TableCell>
        <Badge variant="outline">{SOURCE_LABELS[lot.source_type] ?? lot.source_type}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{lot.quantity_received.toLocaleString()}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {lot.quantity_remaining.toLocaleString()}
      </TableCell>
      <TableCell>{formatLotDate(lot.manufactured_date)}</TableCell>
      <TableCell>{formatLotDate(lot.expiration_date)}</TableCell>
      <TableCell>{format(new Date(lot.received_at), 'MMM d, yyyy')}</TableCell>
      <TableCell className="text-right tabular-nums">
        {differenceInDays(new Date(), new Date(lot.received_at))}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => onViewAdjustments(lot)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          View
        </Button>
      </TableCell>
    </TableRow>
  );
}

function MultiLotGroupRow({
  group,
  onViewAdjustments,
}: {
  group: VariantBatchLotGroup;
  onViewAdjustments: (lot: VariantBatchLotRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const uniqueMfgDates = new Set(
    group.lots.map((lot) => lot.manufactured_date ?? '__none__')
  );
  const uniqueExpiries = new Set(
    group.lots.map((lot) => lot.expiration_date ?? '__none__')
  );

  const mfgSummary =
    uniqueMfgDates.size === 1 && !uniqueMfgDates.has('__none__')
      ? formatLotDate(group.lots.find((lot) => lot.manufactured_date)?.manufactured_date ?? null)
      : uniqueMfgDates.has('__none__') && uniqueMfgDates.size === 1
        ? '—'
        : `${uniqueMfgDates.size} dates`;

  const expirySummary =
    uniqueExpiries.size === 1 && !uniqueExpiries.has('__none__')
      ? formatLotDate(group.lots.find((lot) => lot.expiration_date)?.expiration_date ?? null)
      : uniqueExpiries.has('__none__') && uniqueExpiries.size === 1
        ? '—'
        : `${uniqueExpiries.size} expirations`;

  const toggleOpen = () => setOpen((prev) => !prev);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={toggleOpen}>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={open ? 'Collapse lot details' : 'Expand lot details'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              toggleOpen();
            }}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">{group.batch_number}</TableCell>
        <TableCell>
          <Badge variant="outline">{SOURCE_LABELS[group.source_type] ?? group.source_type}</Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {group.total_received.toLocaleString()}
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">
          {group.total_remaining.toLocaleString()}
        </TableCell>
        <TableCell className="text-muted-foreground">{mfgSummary}</TableCell>
        <TableCell className="text-muted-foreground">{expirySummary}</TableCell>
        <TableCell>{format(new Date(group.received_at), 'MMM d, yyyy')}</TableCell>
        <TableCell className="text-right tabular-nums">
          {differenceInDays(new Date(), new Date(group.received_at))}
        </TableCell>
        <TableCell className="text-right text-muted-foreground text-xs">
          {group.lots.length} lots
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableCell colSpan={10} className="p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Lots in {group.batch_number}
            </p>
            <LotDetailTable lots={group.lots} onViewAdjustments={onViewAdjustments} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function VariantBatchLotGroupRows({
  groups,
  onViewAdjustments,
}: VariantBatchLotGroupRowsProps) {
  return (
    <>
      {groups.map((group) =>
        group.lots.length === 1 ? (
          <SingleLotRow key={group.batch_id} lot={group.lots[0]} onViewAdjustments={onViewAdjustments} />
        ) : (
          <MultiLotGroupRow
            key={group.batch_id}
            group={group}
            onViewAdjustments={onViewAdjustments}
          />
        )
      )}
    </>
  );
}
