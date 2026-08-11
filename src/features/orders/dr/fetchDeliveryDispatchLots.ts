import { supabase } from '@/lib/supabase';
import type { DrPdfDispatchLine, DrPdfDispatchLot } from '../dr/generateDrPdf';

type DeliveryLotRow = {
  variant_id: string;
  batch_id: string | null;
  batch_number: string | null;
  lot_id: string | null;
  expiration_date: string | null;
  quantity: number;
};

/**
 * Load batch + expiry breakdown for a PO delivery (DR), including multi-batch splits.
 * Returns empty map when RPC is unavailable or no fulfill_out lots were found.
 */
export async function fetchDeliveryDispatchLotsByVariant(
  deliveryId: string
): Promise<Map<string, DrPdfDispatchLot[]>> {
  const byVariant = new Map<string, DrPdfDispatchLot[]>();
  if (!deliveryId) return byVariant;

  try {
    const { data, error } = await supabase.rpc('get_po_delivery_dispatch_lots', {
      p_delivery_id: deliveryId,
    });
    if (error) {
      console.warn('[DR] get_po_delivery_dispatch_lots failed', error);
      return byVariant;
    }

    for (const row of (data || []) as DeliveryLotRow[]) {
      const variantId = String(row.variant_id || '');
      const qty = Number(row.quantity) || 0;
      if (!variantId || qty <= 0) continue;
      const lots = byVariant.get(variantId) || [];
      lots.push({
        batchNumber: row.batch_number?.trim() || null,
        expirationDate: row.expiration_date || null,
        quantity: qty,
      });
      byVariant.set(variantId, lots);
    }
  } catch (e) {
    console.warn('[DR] get_po_delivery_dispatch_lots exception', e);
  }

  return byVariant;
}

/** Attach lot rows onto dispatch lines (multi-batch → multiple lots on one line). */
export function attachLotsToDispatchLines(
  lines: Array<{
    variant_id?: string | null;
    brand_name?: string | null;
    variant_name?: string | null;
    variant_type?: string | null;
    quantity: number;
    unit_price?: number;
  }>,
  lotsByVariant: Map<string, DrPdfDispatchLot[]>
): DrPdfDispatchLine[] {
  return lines.map((line) => {
    const variantId = String(line.variant_id || '');
    const lots = variantId ? lotsByVariant.get(variantId) : undefined;
    return {
      ...line,
      lots: lots && lots.length > 0 ? lots : undefined,
    };
  });
}

export async function enrichDispatchLinesWithLots(
  deliveryId: string | null | undefined,
  lines: Array<{
    variant_id?: string | null;
    brand_name?: string | null;
    variant_name?: string | null;
    variant_type?: string | null;
    quantity: number;
    unit_price?: number;
  }>
): Promise<DrPdfDispatchLine[]> {
  if (!deliveryId || lines.length === 0) return lines;
  const lotsByVariant = await fetchDeliveryDispatchLotsByVariant(deliveryId);
  if (lotsByVariant.size === 0) return lines;
  return attachLotsToDispatchLines(lines, lotsByVariant);
}
