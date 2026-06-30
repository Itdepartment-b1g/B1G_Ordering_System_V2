import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type { PhysicalCountBatchOption } from '../types';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function usePhysicalCountBatches({
  companyId,
  locationId,
  enabled,
}: {
  companyId?: string;
  locationId?: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['physical-count-batches', companyId, locationId],
    enabled: enabled && !!companyId && !!locationId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<PhysicalCountBatchOption[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          quantity_remaining,
          variant_id,
          batch:inventory_batches (
            id,
            batch_number,
            source_type,
            received_at
          )
        `
        )
        .eq('company_id', companyId!)
        .eq('warehouse_location_id', locationId!);

      if (error) throw error;

      const batchMap = new Map<
        string,
        {
          batchId: string;
          batchNumber: string;
          receivedAt: string;
          sourceType: string;
          variantIds: Set<string>;
          lotCount: number;
          totalUnits: number;
        }
      >();

      for (const raw of data ?? []) {
        const row = raw as Record<string, unknown>;
        const batch = firstRelation(
          row.batch as {
            id: string;
            batch_number: string;
            source_type: string;
            received_at: string;
          } | null
        );
        if (!batch) continue;

        const qty = Number(row.quantity_remaining) || 0;
        const variantId = row.variant_id as string;

        let acc = batchMap.get(batch.id);
        if (!acc) {
          acc = {
            batchId: batch.id,
            batchNumber: batch.batch_number,
            receivedAt: batch.received_at,
            sourceType: batch.source_type,
            variantIds: new Set(),
            lotCount: 0,
            totalUnits: 0,
          };
          batchMap.set(batch.id, acc);
        }

        acc.variantIds.add(variantId);
        acc.lotCount += 1;
        acc.totalUnits += qty;
      }

      return [...batchMap.values()]
        .map(
          (b) =>
            ({
              batchId: b.batchId,
              batchNumber: b.batchNumber,
              receivedAt: b.receivedAt,
              sourceType: b.sourceType,
              skuCount: b.variantIds.size,
              lotCount: b.lotCount,
              totalUnits: b.totalUnits,
            }) satisfies PhysicalCountBatchOption
        )
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
    },
  });
}
