import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type { PhysicalCountLine } from '../types';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function usePhysicalCountBatchLots({
  companyId,
  locationId,
  batchId,
  enabled,
}: {
  companyId?: string;
  locationId?: string;
  batchId?: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['physical-count-batch-lots', companyId, locationId, batchId],
    enabled: enabled && !!companyId && !!locationId && !!batchId,
    staleTime: 0,
    queryFn: async (): Promise<PhysicalCountLine[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select(
          `
          id,
          quantity_remaining,
          expiration_date,
          received_at,
          variant:variants (
            id,
            name,
            brand:brands ( id, name )
          )
        `
        )
        .eq('company_id', companyId!)
        .eq('warehouse_location_id', locationId!)
        .eq('batch_id', batchId!)
        .order('expiration_date', { ascending: true, nullsFirst: false })
        .order('received_at', { ascending: true });

      if (error) throw error;

      return (data ?? [])
        .map((raw) => {
          const row = raw as Record<string, unknown>;
          const variant = firstRelation(
            row.variant as {
              id: string;
              name: string;
              brand: { id: string; name: string } | { id: string; name: string }[] | null;
            } | null
          );
          const brand = variant ? firstRelation(variant.brand) : null;
          if (!variant || !brand) return null;

          return {
            id: crypto.randomUUID(),
            lotId: row.id as string,
            brandId: brand.id,
            brandName: brand.name,
            variantId: variant.id,
            variantName: variant.name,
            expirationDate: (row.expiration_date as string | null) ?? null,
            systemQty: Number(row.quantity_remaining) || 0,
            physicalQty: '',
            boxCount: '',
            unitsPerBox: '',
          } satisfies PhysicalCountLine;
        })
        .filter(Boolean) as PhysicalCountLine[];
    },
  });
}
