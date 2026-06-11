import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import {
  buildFsnVariantRows,
  type FsnPeriodDays,
  type FsnVariantRow,
} from './warehouseFsnAnalysis';
import type { Brand } from './InventoryContext';

type ReservationRow = {
  variant_id: string;
  quantity_fulfilled: number;
  warehouse_location_id: string;
  updated_at: string;
  purchase_order_id: string;
};

export function useWarehouseFsnAnalysis({
  companyId,
  locationId,
  periodDays,
  brands,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  periodDays: FsnPeriodDays;
  brands: Brand[];
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['warehouse-fsn-movement', companyId, locationId, periodDays],
    enabled: enabled && !!companyId && !!locationId && brands.length >= 0,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<FsnVariantRow[]> => {
      const since = subDays(new Date(), periodDays).toISOString();

      const { data: reservations, error } = await supabase
        .from('warehouse_transfer_reservations')
        .select(
          `
          variant_id,
          quantity_fulfilled,
          warehouse_location_id,
          updated_at,
          purchase_order_id,
          purchase_orders!inner (
            fulfillment_type
          )
        `
        )
        .eq('warehouse_company_id', companyId!)
        .eq('warehouse_location_id', locationId!)
        .eq('purchase_orders.fulfillment_type', 'warehouse_transfer')
        .gt('quantity_fulfilled', 0)
        .gte('updated_at', since);

      if (error) throw error;

      const movementByVariant = new Map<string, { unitsMoved: number; fulfillEvents: number }>();

      for (const row of (reservations ?? []) as ReservationRow[]) {

        const qty = Number(row.quantity_fulfilled) || 0;
        if (qty <= 0) continue;

        const existing = movementByVariant.get(row.variant_id) ?? { unitsMoved: 0, fulfillEvents: 0 };
        existing.unitsMoved += qty;
        existing.fulfillEvents += 1;
        movementByVariant.set(row.variant_id, existing);
      }

      return buildFsnVariantRows(brands, movementByVariant);
    },
  });
}
