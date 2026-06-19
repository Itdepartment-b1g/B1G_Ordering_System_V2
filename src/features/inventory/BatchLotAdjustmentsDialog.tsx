import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Minus, Plus, Scale } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export const BATCH_LOT_ADJUSTMENTS_QUERY_KEY = 'batch-lot-adjustments';

type AdjustmentHistoryRow = {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  notes: string | null;
  created_at: string;
  performed_by_name: string | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type BatchLotAdjustmentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | undefined;
  lotId: string | null;
  batchId: string | null;
  batchNumber: string;
  variantName: string;
};

export function BatchLotAdjustmentsDialog({
  open,
  onOpenChange,
  companyId,
  lotId,
  batchId,
  batchNumber,
  variantName,
}: BatchLotAdjustmentsDialogProps) {
  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: [BATCH_LOT_ADJUSTMENTS_QUERY_KEY, companyId, lotId, batchId],
    enabled: open && !!companyId && (!!lotId || !!batchId),
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<AdjustmentHistoryRow[]> => {
      const filters: string[] = [];
      if (lotId) filters.push(`lot_id.eq.${lotId}`);
      if (batchId) filters.push(`batch_id.eq.${batchId}`);

      const { data, error } = await supabase
        .from('warehouse_stock_adjustments')
        .select(
          `
          id,
          direction,
          quantity,
          reason,
          notes,
          created_at,
          lot_id,
          batch_id,
          performed_by_user:profiles!warehouse_stock_adjustments_performed_by_fkey ( full_name )
        `
        )
        .eq('company_id', companyId!)
        .or(filters.join(','))
        .order('created_at', { ascending: false });

      if (error) throw error;

      const adjustments = (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const performer = firstRelation(
          r.performed_by_user as { full_name: string } | { full_name: string }[] | null
        );
        return {
          id: r.id as string,
          direction: r.direction as 'in' | 'out',
          quantity: Number(r.quantity),
          reason: r.reason as string,
          notes: (r.notes as string | null) ?? null,
          created_at: r.created_at as string,
          performed_by_name: performer?.full_name ?? null,
        } satisfies AdjustmentHistoryRow;
      });

      const adjustmentKeys = new Set(
        adjustments.map((a) => `${a.created_at}|${a.direction}|${a.quantity}`)
      );

      let movementRows: AdjustmentHistoryRow[] = [];
      if (lotId) {
        const { data: movements, error: movementError } = await supabase
          .from('inventory_batch_movements')
          .select(
            `
            id,
            movement_type,
            quantity,
            notes,
            created_at,
            performed_by_user:profiles!inventory_batch_movements_performed_by_fkey ( full_name )
          `
          )
          .eq('company_id', companyId!)
          .eq('lot_id', lotId)
          .in('movement_type', ['adjustment_in', 'adjustment_out'])
          .order('created_at', { ascending: false });

        if (movementError) throw movementError;

        movementRows = (movements ?? [])
          .map((row) => {
            const r = row as Record<string, unknown>;
            const movementType = r.movement_type as string;
            const direction: 'in' | 'out' =
              movementType === 'adjustment_in' ? 'in' : 'out';
            const quantity = Number(r.quantity);
            const created_at = r.created_at as string;
            const key = `${created_at}|${direction}|${quantity}`;
            if (adjustmentKeys.has(key)) return null;

            const performer = firstRelation(
              r.performed_by_user as { full_name: string } | { full_name: string }[] | null
            );
            const notes = (r.notes as string | null) ?? null;

            return {
              id: `movement-${r.id as string}`,
              direction,
              quantity,
              reason: notes?.split(':')[0]?.trim() || 'Stock adjustment',
              notes,
              created_at,
              performed_by_name: performer?.full_name ?? null,
            } satisfies AdjustmentHistoryRow;
          })
          .filter(Boolean) as AdjustmentHistoryRow[];
      }

      return [...adjustments, ...movementRows].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  const summary = useMemo(() => {
    const totalIn = rows
      .filter((r) => r.direction === 'in')
      .reduce((sum, r) => sum + r.quantity, 0);
    const totalOut = rows
      .filter((r) => r.direction === 'out')
      .reduce((sum, r) => sum + r.quantity, 0);
    return { totalIn, totalOut, count: rows.length };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Batch adjustments
          </DialogTitle>
          <DialogDescription>
            {batchNumber} · {variantName}
            {summary.count > 0 && (
              <span className="ml-2 font-medium text-foreground">
                — {summary.count} adjustment{summary.count === 1 ? '' : 's'} (
                <span className="text-emerald-700 dark:text-emerald-400">+{summary.totalIn}</span>
                {' / '}
                <span className="text-red-700 dark:text-red-400">−{summary.totalOut}</span>)
              </span>
            )}
            {isFetching && !isLoading && (
              <span className="ml-2 text-xs text-muted-foreground">Updating…</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading adjustments…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No stock adjustments recorded for this batch.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(row.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.direction === 'in' ? 'default' : 'destructive'}>
                        {row.direction === 'in' ? (
                          <Plus className="h-3 w-3 mr-1" />
                        ) : (
                          <Minus className="h-3 w-3 mr-1" />
                        )}
                        {row.direction === 'in' ? 'In' : 'Out'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {row.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="line-clamp-2 text-sm">{row.reason}</span>
                    </TableCell>
                    <TableCell className="max-w-[180px] text-sm text-muted-foreground">
                      {row.notes ? (
                        <span className="line-clamp-2">{row.notes}</span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.performed_by_name ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
