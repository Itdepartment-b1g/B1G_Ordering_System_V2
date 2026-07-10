import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  filterRebateReturnLinesForWarehouseUser,
  type WarehouseReceiveMembership,
} from '@/features/key-accounts/rebates/keyAccountRebateShared';
import {
  buildRebateInspectPayload,
  createRebateInspectSplit,
  getRebateInspectValidationError,
  type RebateInspectItem,
} from './keyAccountRebateReturnInspectShared';
import {
  RebateReturnInspectDialog,
  type RebateInspectLotOption,
} from './RebateReturnInspectDialog';

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string };
    if (e.message) return e.message;
    if (e.details) return e.details;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatLotDate(date: string | null): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

function formatRebateLotLabel(lot: RebateInspectLotOption): string {
  const exp = lot.expiration_date ? ` · exp ${formatLotDate(lot.expiration_date)}` : '';
  return `${lot.batch_number}${exp} · ${lot.quantity_remaining} in lot`;
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
  const [items, setItems] = useState<RebateInspectItem[]>([]);
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
              variant_id,
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
          variant_id: string;
          disputed_quantity: number;
          purchase_order_item?: { warehouse_location_id?: string | null } | null;
          variant?: {
            name?: string;
            variant_type?: string;
            brand?: { name?: string } | null;
          } | null;
        }>;

        let nameById = { ...warehouseNamesById };
        let isMainById = { ...warehouseLocationIsMainById };
        const locationIds = [
          ...new Set(
            raw
              .map((r) => r.purchase_order_item?.warehouse_location_id ?? null)
              .filter((id): id is string => !!id)
          ),
        ];

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

        const mapped: RebateInspectItem[] = raw.map((r) => {
          const whId = r.purchase_order_item?.warehouse_location_id ?? '';
          const disputed = Number(r.disputed_quantity) || 0;
          return {
            rebate_line_id: r.id,
            variant_id: r.variant_id,
            brand_name: r.variant?.brand?.name ?? '—',
            variant_name: r.variant?.name ?? '—',
            variant_type: r.variant?.variant_type ?? '—',
            warehouse_location_id: whId,
            warehouse_location_name: whId ? nameById[whId] || '—' : '—',
            disputed_quantity: disputed,
            splits: [
              createRebateInspectSplit({
                qty_good: disputed,
                qty_damaged: 0,
              }),
            ],
          };
        });

        setItems(filterRebateReturnLinesForWarehouseUser(mapped, warehouseMembership, isMainById));
        setNotes('');
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'Error loading return items',
            description: e instanceof Error ? e.message : 'Failed to load',
          });
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    sourceRebateId,
    warehouseNamesById,
    warehouseLocationIsMainById,
    warehouseMembership,
    hubCompanyId,
    toast,
  ]);

  const variantIds = useMemo(
    () => [...new Set(items.map((item) => item.variant_id))],
    [items]
  );

  const locationIds = useMemo(
    () => [...new Set(items.map((item) => item.warehouse_location_id).filter(Boolean))],
    [items]
  );

  const { data: warehouseLots = [], isLoading: loadingLots } = useQuery({
    queryKey: ['rebate-return-inspect-lots', hubCompanyId, locationIds, variantIds],
    enabled: open && !alreadyReceived && !!hubCompanyId && variantIds.length > 0 && locationIds.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<RebateInspectLotOption[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          variant_id,
          warehouse_location_id,
          quantity_remaining,
          expiration_date,
          batch:inventory_batches ( batch_number )
        `
        )
        .in('variant_id', variantIds)
        .in('warehouse_location_id', locationIds)
        .order('received_at', { ascending: true });
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const batch = firstRelation(r.batch as { batch_number?: string } | null);
          const remaining = Number(r.quantity_remaining);
          if (!Number.isFinite(remaining)) return null;
          return {
            lot_id: r.id as string,
            variant_id: r.variant_id as string,
            warehouse_location_id: r.warehouse_location_id as string,
            batch_number: batch?.batch_number ?? '—',
            expiration_date: (r.expiration_date as string | null) ?? null,
            quantity_remaining: Math.max(0, remaining),
          } satisfies RebateInspectLotOption;
        })
        .filter(Boolean) as RebateInspectLotOption[];
    },
  });

  useEffect(() => {
    if (!open || warehouseLots.length === 0) return;
    setItems((prev) =>
      prev.map((item) => {
        const options = warehouseLots.filter(
          (lot) =>
            lot.variant_id === item.variant_id &&
            lot.warehouse_location_id === item.warehouse_location_id
        );
        if (options.length !== 1) return item;
        return {
          ...item,
          splits: item.splits.map((split) =>
            split.destination_lot_id ? split : { ...split, destination_lot_id: options[0].lot_id }
          ),
        };
      })
    );
  }, [open, warehouseLots]);

  const validationError = useMemo(() => getRebateInspectValidationError(items), [items]);

  const submit = async () => {
    if (validationError) {
      toast({ variant: 'destructive', title: 'Invalid inspection', description: validationError });
      return;
    }

    const lines = buildRebateInspectPayload(items);
    if (lines.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nothing to receive',
        description: 'Enter good or damaged quantities for at least one distribution row.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('receive_key_account_rebate_returns', {
        p_fulfillment_po_id: fulfillmentPoId,
        p_lines: lines,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to receive returns');

      toast({
        title: 'Returns processed',
        description: 'Good units restocked to selected batches; damaged units logged to disposal.',
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
    <RebateReturnInspectDialog
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      onItemsChange={setItems}
      warehouseLots={warehouseLots}
      loadingLots={loadingLots}
      formatLotLabel={formatRebateLotLabel}
      notes={notes}
      onNotesChange={setNotes}
      validationError={validationError}
      submitting={submitting}
      onConfirm={() => void submit()}
      initialLoading={loading}
      blockedMessage={
        alreadyReceived
          ? 'Returns for this rebate were already received and cannot be processed again.'
          : null
      }
    />
  );
}
