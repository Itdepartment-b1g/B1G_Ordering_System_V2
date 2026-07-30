import { supabase } from '@/lib/supabase';

/** Packing fields persisted on warehouse stock request receive lines. */
export type ReceivePackingFields = {
  box_count: number | null;
  units_per_box: number | null;
  loose_box_count?: number | null;
  loose_qty?: number | null;
  /** Legacy leftover units before loose pair existed. */
  extra_qty?: number | null;
  quantity?: number | null;
};

export type LotReceivePacking = ReceivePackingFields & {
  /** Formatted label, or null when unknown. */
  label: string | null;
};

function fmtQty(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Format Not Loose / Loose packing for display.
 * Pattern: `Boxes 10 × 50 + Loose 1 × 12` (or `—` when unknown).
 */
export function formatReceivePacking(line: ReceivePackingFields): string {
  const boxes = line.box_count;
  const perBox = line.units_per_box;
  const looseBoxes = line.loose_box_count ?? 0;
  const looseQty = line.loose_qty ?? 0;
  const legacyExtra = line.extra_qty ?? 0;

  if (boxes != null && perBox != null) {
    const boxed = `Boxes ${fmtQty(boxes)} × ${fmtQty(perBox)}`;
    if (looseBoxes > 0 || looseQty > 0) {
      return `${boxed} + Loose ${fmtQty(looseBoxes)} × ${fmtQty(looseQty)}`;
    }
    // Legacy rows saved as leftover units before loose pair existed
    if (legacyExtra > 0 && looseBoxes === 0 && looseQty === 0) {
      return `${boxed} + Loose ${fmtQty(legacyExtra)}`;
    }
    return boxed;
  }
  if (looseBoxes > 0 || looseQty > 0) {
    return `Loose ${fmtQty(looseBoxes)} × ${fmtQty(looseQty)}`;
  }
  if (legacyExtra > 0) return `Loose ${fmtQty(legacyExtra)}`;
  return '—';
}

export function hasReceivePacking(packing: ReceivePackingFields | null | undefined): boolean {
  if (!packing) return false;
  return formatReceivePacking(packing) !== '—';
}

export function getBoxedUnits(packing: ReceivePackingFields): number | null {
  if (packing.box_count == null || packing.units_per_box == null) return null;
  return packing.box_count * packing.units_per_box;
}

export function getLooseUnits(packing: ReceivePackingFields): number {
  const looseBoxes = packing.loose_box_count ?? 0;
  const looseQty = packing.loose_qty ?? 0;
  if (looseBoxes > 0 || looseQty > 0) return looseBoxes * looseQty;
  return packing.extra_qty ?? 0;
}

/**
 * Load packing for inventory batch lots via receive lines (`lot_id`).
 * When multiple lines share a lot, the first with real packing wins.
 */
export async function fetchReceivePackingByLotIds(
  lotIds: string[]
): Promise<Record<string, LotReceivePacking>> {
  const uniqueIds = [...new Set(lotIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const packingByLotId: Record<string, LotReceivePacking> = {};
  const chunkSize = 200;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('warehouse_stock_request_receive_lines')
      .select('lot_id, quantity, box_count, units_per_box, loose_box_count, loose_qty, extra_qty')
      .in('lot_id', chunk);

    if (error) throw error;

    for (const row of data ?? []) {
      const lotId = String((row as { lot_id?: string | null }).lot_id || '');
      if (!lotId || packingByLotId[lotId]) continue;
      const fields = row as ReceivePackingFields;
      const label = formatReceivePacking(fields);
      if (label === '—') continue;
      packingByLotId[lotId] = {
        box_count: fields.box_count ?? null,
        units_per_box: fields.units_per_box ?? null,
        loose_box_count: fields.loose_box_count ?? null,
        loose_qty: fields.loose_qty ?? null,
        extra_qty: fields.extra_qty ?? null,
        quantity: fields.quantity ?? null,
        label,
      };
    }
  }

  return packingByLotId;
}
