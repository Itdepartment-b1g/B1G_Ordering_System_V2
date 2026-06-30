export type RebateInspectSplit = {
  id: string;
  destination_lot_id: string;
  qty_good: number;
  qty_damaged: number;
};

export type RebateInspectItem = {
  rebate_line_id: string;
  variant_id: string;
  brand_name: string;
  variant_name: string;
  variant_type: string;
  warehouse_location_id: string;
  warehouse_location_name: string;
  disputed_quantity: number;
  splits: RebateInspectSplit[];
};

export type RebateInspectRpcLine = {
  rebate_line_id: string;
  destination_lot_id: string;
  qty_good: number;
  qty_damaged: number;
};

export function createRebateInspectSplit(
  partial?: Partial<Pick<RebateInspectSplit, 'destination_lot_id' | 'qty_good' | 'qty_damaged'>>
): RebateInspectSplit {
  return {
    id: crypto.randomUUID(),
    destination_lot_id: partial?.destination_lot_id ?? '',
    qty_good: partial?.qty_good ?? 0,
    qty_damaged: partial?.qty_damaged ?? 0,
  };
}

export function getRebateSplitInspectedQty(split: RebateInspectSplit): number {
  return Math.max(0, split.qty_good) + Math.max(0, split.qty_damaged);
}

export function getRebateItemAllocatedQty(item: RebateInspectItem): number {
  return item.splits.reduce((sum, split) => sum + getRebateSplitInspectedQty(split), 0);
}

export function getMaxQtyForRebateInspectSplit(item: RebateInspectItem, splitId: string): number {
  const otherAllocated = item.splits
    .filter((split) => split.id !== splitId)
    .reduce((sum, split) => sum + getRebateSplitInspectedQty(split), 0);
  return Math.max(0, item.disputed_quantity - otherAllocated);
}

export function buildRebateInspectPayload(items: RebateInspectItem[]): RebateInspectRpcLine[] {
  return items.flatMap((item) =>
    item.splits
      .filter((split) => getRebateSplitInspectedQty(split) > 0)
      .map((split) => ({
        rebate_line_id: item.rebate_line_id,
        destination_lot_id: split.destination_lot_id,
        qty_good: Math.max(0, split.qty_good),
        qty_damaged: Math.max(0, split.qty_damaged),
      }))
  );
}

export function getRebateInspectValidationError(items: RebateInspectItem[]): string | null {
  const payload = buildRebateInspectPayload(items);
  if (payload.length === 0) {
    return 'Enter good or damaged quantities for at least one distribution row.';
  }

  for (const item of items) {
    const allocated = getRebateItemAllocatedQty(item);
    if (allocated > item.disputed_quantity) {
      return `${item.variant_name}: distributed qty (${allocated}) exceeds disputed qty (${item.disputed_quantity}).`;
    }

    for (const split of item.splits) {
      const qty = getRebateSplitInspectedQty(split);
      if (qty <= 0) continue;
      if (split.qty_good < 0 || split.qty_damaged < 0) {
        return 'Quantities cannot be negative.';
      }
      if (!split.destination_lot_id) {
        return `Select a warehouse batch for each row with quantity (${item.variant_name}).`;
      }
    }
  }

  for (const line of payload) {
    if (!line.destination_lot_id) {
      return 'Warehouse batch lot selection is required for each distribution row.';
    }
  }

  return null;
}
