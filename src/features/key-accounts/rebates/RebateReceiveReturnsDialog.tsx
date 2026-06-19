import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import {
  filterRebateReturnLinesForWarehouseUser,
  type WarehouseReceiveMembership,
} from '@/features/key-accounts/rebates/keyAccountRebateShared';

export type RebateReturnInspectLine = {
  rebate_line_id: string;
  brand_name: string;
  variant_name: string;
  variant_type: string;
  warehouse_location_id: string;
  warehouse_location_name: string;
  disputed_quantity: number;
  qty_good: number;
  qty_damaged: number;
};

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string };
    if (e.message) return e.message;
    if (e.details) return e.details;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fulfillmentPoId: string;
  sourceRebateId: string;
  warehouseNamesById?: Record<string, string>;
  warehouseLocationIsMainById?: Record<string, boolean>;
  warehouseMembership?: WarehouseReceiveMembership;
  hubCompanyId?: string | null;
  onSuccess?: () => void;
};

export function RebateReceiveReturnsDialog({
  open,
  onOpenChange,
  fulfillmentPoId,
  sourceRebateId,
  warehouseNamesById = {},
  warehouseLocationIsMainById = {},
  warehouseMembership = { isMain: true, locationId: null },
  hubCompanyId,
  onSuccess,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<RebateReturnInspectLine[]>([]);
  const [alreadyReceived, setAlreadyReceived] = useState(false);

  useEffect(() => {
    if (!open || !sourceRebateId) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [{ data: receipt }, { data: linesData, error: linesErr }] = await Promise.all([
          supabase
            .from('key_account_po_rebate_return_receipts')
            .select('id')
            .eq('rebate_id', sourceRebateId)
            .maybeSingle(),
          supabase
            .from('key_account_po_rebate_lines')
            .select(
              `
              id,
              disputed_quantity,
              purchase_order_item:purchase_order_items (
                warehouse_location_id
              ),
              variant:variants (
                name,
                variant_type,
                brand:brands ( name )
              )
            `
            )
            .eq('rebate_id', sourceRebateId),
        ]);
        if (linesErr) throw linesErr;
        if (cancelled) return;

        setAlreadyReceived(!!receipt?.id);

        const raw = (linesData || []) as Array<{
          id: string;
          disputed_quantity: number;
          purchase_order_item?: { warehouse_location_id?: string | null } | null;
          variant?: {
            name?: string;
            variant_type?: string;
            brand?: { name?: string } | null;
          } | null;
        }>;

        const locationIds = [
          ...new Set(
            raw
              .map((r) => r.purchase_order_item?.warehouse_location_id ?? null)
              .filter((id): id is string => !!id)
          ),
        ];

        let nameById = { ...warehouseNamesById };
        let isMainById = { ...warehouseLocationIsMainById };
        if (hubCompanyId && locationIds.length > 0) {
          const missing = locationIds.filter((id) => !nameById[id] || isMainById[id] === undefined);
          if (missing.length > 0) {
            const { data: locRows } = await supabase
              .from('warehouse_locations')
              .select('id, name, is_main')
              .eq('company_id', hubCompanyId)
              .in('id', missing);
            for (const row of locRows || []) {
              if (row?.id && row?.name) nameById[row.id] = row.name;
              if (row?.id) isMainById[row.id] = !!row.is_main;
            }
          }
        }

        const mapped = raw.map((r) => {
          const whId = r.purchase_order_item?.warehouse_location_id ?? '';
          const disputed = Number(r.disputed_quantity) || 0;
          return {
            rebate_line_id: r.id,
            brand_name: r.variant?.brand?.name ?? '—',
            variant_name: r.variant?.name ?? '—',
            variant_type: r.variant?.variant_type ?? '—',
            warehouse_location_id: whId,
            warehouse_location_name: whId ? nameById[whId] || '—' : '—',
            disputed_quantity: disputed,
            qty_good: disputed,
            qty_damaged: 0,
          };
        });

        setLines(
          filterRebateReturnLinesForWarehouseUser(mapped, warehouseMembership, isMainById)
        );
        setNotes('');
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Error loading return items',
            description: e instanceof Error ? e.message : 'Failed to load',
          });
          setLines([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sourceRebateId, warehouseNamesById, warehouseLocationIsMainById, warehouseMembership, hubCompanyId, toast]);

  const validationError = useMemo(() => {
    for (const l of lines) {
      if (l.qty_good < 0 || l.qty_damaged < 0) return 'Quantities cannot be negative';
      if (l.qty_good + l.qty_damaged <= 0) return 'Each line needs at least one received unit';
      if (l.qty_good + l.qty_damaged > l.disputed_quantity) {
        return `${l.variant_name}: good + damaged cannot exceed disputed qty (${l.disputed_quantity})`;
      }
    }
    return null;
  }, [lines]);

  const updateLine = (rebateLineId: string, patch: Partial<Pick<RebateReturnInspectLine, 'qty_good' | 'qty_damaged'>>) => {
    setLines((prev) =>
      prev.map((l) => (l.rebate_line_id === rebateLineId ? { ...l, ...patch } : l))
    );
  };

  const setAllGood = (line: RebateReturnInspectLine) => {
    updateLine(line.rebate_line_id, { qty_good: line.disputed_quantity, qty_damaged: 0 });
  };

  const setAllDamaged = (line: RebateReturnInspectLine) => {
    updateLine(line.rebate_line_id, { qty_good: 0, qty_damaged: line.disputed_quantity });
  };

  const submit = async () => {
    if (validationError) {
      toast({ variant: 'destructive', title: 'Invalid inspection', description: validationError });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('receive_key_account_rebate_returns', {
        p_fulfillment_po_id: fulfillmentPoId,
        p_lines: lines.map((l) => ({
          rebate_line_id: l.rebate_line_id,
          qty_good: l.qty_good,
          qty_damaged: l.qty_damaged,
        })),
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to receive returns');

      toast({
        title: 'Returns processed',
        description: 'Good units restocked; damaged units logged to disposal.',
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Receive failed',
        description: rpcErrorMessage(e, 'Could not receive returns'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Inspect returned items</DialogTitle>
          <DialogDescription>
            For each disputed line, split quantity between good condition (restock) and damaged (disposal).
            Good stock returns to the original ship-from warehouse; damaged is recorded in disposal only.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
          </div>
        ) : alreadyReceived ? (
          <p className="text-sm text-muted-foreground py-4">
            Returns for this rebate were already received and cannot be processed again.
          </p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No disputed lines to inspect.</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto space-y-4">
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">Disputed</TableHead>
                    <TableHead className="text-right w-24">Good</TableHead>
                    <TableHead className="text-right w-24">Damaged</TableHead>
                    <TableHead className="text-right">Quick</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.rebate_line_id}>
                      <TableCell>
                        <div className="font-medium">{l.brand_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.variant_name} ({l.variant_type})
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.warehouse_location_name}</TableCell>
                      <TableCell className="text-right font-semibold">{l.disputed_quantity}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={l.disputed_quantity}
                          className="w-20 ml-auto text-right"
                          value={l.qty_good}
                          onChange={(e) =>
                            updateLine(l.rebate_line_id, {
                              qty_good: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={l.disputed_quantity}
                          className="w-20 ml-auto text-right"
                          value={l.qty_damaged}
                          onChange={(e) =>
                            updateLine(l.rebate_line_id, {
                              qty_damaged: Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1 items-end">
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAllGood(l)}>
                            All good
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive"
                            onClick={() => setAllDamaged(l)}
                          >
                            All damaged
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Inspection notes…"
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={loading || submitting || alreadyReceived || lines.length === 0 || !!validationError}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
