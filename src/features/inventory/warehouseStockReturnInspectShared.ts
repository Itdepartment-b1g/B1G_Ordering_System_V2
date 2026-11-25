export type InspectMainSplit = {
  id: string;
  destination_lot_id: string;
  qty_good: number;
  qty_damaged: number;
};

export type InspectRequestItem = {
  request_item_id: string;
  variant_id: string;
  brand_name: string;
  variant_name: string;
  variant_type: string;
  sub_batch_number: string | null;
  sub_expiration_date: string | null;
  return_quantity: number;
  inspected_quantity: number;
  splits: InspectMainSplit[];
};

export type InspectRpcLine = {
  request_item_id: string;
  destination_lot_id: string;
  qty_good: number;
  qty_damaged: number;
};

export function createInspectSplit(
  partial?: Partial<Pick<InspectMainSplit, 'destination_lot_id' | 'qty_good' | 'qty_damaged'>>
): InspectMainSplit {
  return {
    id: crypto.randomUUID(),
    destination_lot_id: partial?.destination_lot_id ?? '',
    qty_good: partial?.qty_good ?? 0,
    qty_damaged: partial?.qty_damaged ?? 0,
  };
}

export function getInspectRemaining(item: InspectRequestItem): number {
  return Math.max(0, item.return_quantity - item.inspected_quantity);
}

export function getSplitInspectedQty(split: InspectMainSplit): number {
  return Math.max(0, split.qty_good) + Math.max(0, split.qty_damaged);
}

export function getItemAllocatedQty(item: InspectRequestItem): number {
  return item.splits.reduce((sum, split) => sum + getSplitInspectedQty(split), 0);
}

export function getMaxQtyForInspectSplit(item: InspectRequestItem, splitId: string): number {
  const remaining = getInspectRemaining(item);
  const otherAllocated = item.splits
    .filter((split) => split.id !== splitId)
    .reduce((sum, split) => sum + getSplitInspectedQty(split), 0);
  return Math.max(0, remaining - otherAllocated);
}

export function buildInspectPayload(items: InspectRequestItem[]): InspectRpcLine[] {
  return items.flatMap((item) =>
    item.splits
      .filter((split) => getSplitInspectedQty(split) > 0)
      .map((split) => ({
        request_item_id: item.request_item_id,
        destination_lot_id: split.destination_lot_id,
        qty_good: Math.max(0, split.qty_good),
        qty_damaged: Math.max(0, split.qty_damaged),
      }))
  );
}

export function getInspectValidationError(items: InspectRequestItem[]): string | null {
  const payload = buildInspectPayload(items);
  if (payload.length === 0) {
    return 'Classify at least one quantity as Stock Return or Disposal.';
  }

  for (const item of items) {
    const remaining = getInspectRemaining(item);
    const allocated = getItemAllocatedQty(item);
    if (allocated > remaining) {
      return `${item.variant_name}: Stock Return + Disposal (${allocated}) exceeds remaining returned qty (${remaining}).`;
    }

    for (const split of item.splits) {
      const qty = getSplitInspectedQty(split);
      if (qty <= 0) continue;
      if (split.qty_good < 0 || split.qty_damaged < 0) {
        return 'Quantities cannot be negative.';
      }
      if (!split.destination_lot_id) {
        return `Select a destination batch for each classified row (${item.variant_name}).`;
      }
    }
  }

  for (const line of payload) {
    if (!line.destination_lot_id) {
      return 'Destination batch is required for each Stock Return / Disposal row.';
    }
  }

  return null;
}

export function isInspectConfirmReady(items: InspectRequestItem[]): boolean {
  return getInspectValidationError(items) === null;
}
