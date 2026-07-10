export type VariantBatchLotRow = {
  lot_id: string;
  batch_id: string;
  batch_number: string;
  source_type: string;
  quantity_remaining: number;
  quantity_received: number;
  received_at: string;
  manufactured_date: string | null;
  expiration_date: string | null;
};

export type VariantBatchLotGroup = {
  batch_id: string;
  batch_number: string;
  source_type: string;
  received_at: string;
  lots: VariantBatchLotRow[];
  total_remaining: number;
  total_received: number;
};

export function groupVariantBatchLots(lots: VariantBatchLotRow[]): VariantBatchLotGroup[] {
  const map = new Map<string, VariantBatchLotGroup>();

  for (const lot of lots) {
    const existing = map.get(lot.batch_id);
    if (!existing) {
      map.set(lot.batch_id, {
        batch_id: lot.batch_id,
        batch_number: lot.batch_number,
        source_type: lot.source_type,
        received_at: lot.received_at,
        lots: [lot],
        total_remaining: lot.quantity_remaining,
        total_received: lot.quantity_received,
      });
      continue;
    }

    existing.lots.push(lot);
    existing.total_remaining += lot.quantity_remaining;
    existing.total_received += lot.quantity_received;
    if (new Date(lot.received_at).getTime() < new Date(existing.received_at).getTime()) {
      existing.received_at = lot.received_at;
    }
  }

  return [...map.values()].sort(
    (a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
  );
}
