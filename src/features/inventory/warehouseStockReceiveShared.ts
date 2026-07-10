export type ReceiveLotSplit = {
  id: string;
  quantity: number;
  manufacturedDate: string;
  expirationDate: string;
  unitCost: string;
};

export type ReceiveVariantItem = {
  id: string;
  variantId: string;
  variantLabel: string;
  remaining: number;
  orderedQuantity: number;
  splits: ReceiveLotSplit[];
};

export type ReceiveBatchDefaults = {
  manufacturedDate: string;
  expirationDate: string;
  unitCost: string;
};

export function createReceiveLotSplit(quantity = 0): ReceiveLotSplit {
  return {
    id: crypto.randomUUID(),
    quantity,
    manufacturedDate: '',
    expirationDate: '',
    unitCost: '',
  };
}

export function parseUnitCost(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function getVariantAllocatedQty(splits: ReceiveLotSplit[]): number {
  return splits.reduce((sum, split) => sum + Math.max(0, Math.floor(split.quantity)), 0);
}

/** Max quantity allowed on one split row given quantities on sibling rows. */
export function getMaxQtyForSplit(variant: ReceiveVariantItem, splitId: string): number {
  const otherAllocated = variant.splits
    .filter((split) => split.id !== splitId)
    .reduce((sum, split) => sum + Math.max(0, Math.floor(split.quantity)), 0);
  return Math.max(0, variant.remaining - otherAllocated);
}

export function isReceiveConfirmReady(variants: ReceiveVariantItem[]): boolean {
  if (variants.length === 0) return false;

  for (const variant of variants) {
    const allocated = getVariantAllocatedQty(variant.splits);
    if (allocated !== variant.remaining) return false;

    for (const split of variant.splits) {
      const qty = Math.floor(split.quantity);
      if (qty <= 0) continue;

      if (!split.expirationDate.trim()) return false;

      const unitCost = parseUnitCost(split.unitCost);
      if (unitCost === null || unitCost < 0) return false;

      if (
        split.manufacturedDate.trim() &&
        split.expirationDate.trim() &&
        split.manufacturedDate > split.expirationDate
      ) {
        return false;
      }
    }
  }

  return true;
}

export function getSplitLineAmount(split: ReceiveLotSplit): number {
  const qty = Math.max(0, Math.floor(split.quantity));
  const cost = parseUnitCost(split.unitCost);
  if (cost === null || qty === 0) return 0;
  return qty * cost;
}

export function getReceiveBatchTotal(variants: ReceiveVariantItem[]): number {
  return variants.reduce(
    (sum, variant) =>
      sum + variant.splits.reduce((lineSum, split) => lineSum + getSplitLineAmount(split), 0),
    0
  );
}

export function getReceiveTotalUnits(variants: ReceiveVariantItem[]): number {
  return variants.reduce((sum, variant) => sum + getVariantAllocatedQty(variant.splits), 0);
}

export type ReceiveLotPayload = {
  quantity: number;
  manufactured_date: string | null;
  expiration_date: string;
  unit_cost: number;
};

export type ReceiveVariantPayload = {
  variant_id: string;
  lots: ReceiveLotPayload[];
};

export function buildReceivePayload(variants: ReceiveVariantItem[]): ReceiveVariantPayload[] {
  return variants
    .map((variant) => {
      const lots = variant.splits
        .map((split) => {
          const quantity = Math.max(0, Math.floor(split.quantity));
          if (quantity <= 0) return null;
          const unitCost = parseUnitCost(split.unitCost);
          if (unitCost === null || !split.expirationDate.trim()) return null;
          return {
            quantity,
            manufactured_date: split.manufacturedDate.trim() || null,
            expiration_date: split.expirationDate.trim(),
            unit_cost: unitCost,
          } satisfies ReceiveLotPayload;
        })
        .filter((lot): lot is ReceiveLotPayload => lot !== null);

      if (lots.length === 0) return null;
      return { variant_id: variant.variantId, lots };
    })
    .filter((item): item is ReceiveVariantPayload => item !== null);
}

export function validateReceiveVariants(variants: ReceiveVariantItem[]): string | null {
  for (const variant of variants) {
    const allocated = getVariantAllocatedQty(variant.splits);

    if (allocated > variant.remaining) {
      return `${variant.variantLabel}: allocated quantity (${allocated}) exceeds remaining (${variant.remaining}).`;
    }

    if (allocated < variant.remaining) {
      return `${variant.variantLabel}: assign all ${variant.remaining} remaining unit(s) before confirming (currently ${allocated}).`;
    }

    for (const split of variant.splits) {
      const qty = Math.floor(split.quantity);
      if (qty <= 0) continue;

      if (!split.expirationDate.trim()) {
        return `${variant.variantLabel}: expiration date is required for each receive row with quantity.`;
      }

      const unitCost = parseUnitCost(split.unitCost);
      if (unitCost === null || unitCost < 0) {
        return `${variant.variantLabel}: unit cost is required and cannot be negative.`;
      }

      if (
        split.manufacturedDate.trim() &&
        split.expirationDate.trim() &&
        split.manufacturedDate > split.expirationDate
      ) {
        return `${variant.variantLabel}: manufactured date cannot be after expiration date.`;
      }
    }
  }

  const payload = buildReceivePayload(variants);
  if (payload.length === 0) {
    return 'Enter at least one quantity to receive with expiration date and unit cost.';
  }

  return null;
}

export function formatReceiveCurrency(amount: number): string {
  return amount.toLocaleString('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function applyBatchDefaultsToVariants(
  variants: ReceiveVariantItem[],
  defaults: ReceiveBatchDefaults
): ReceiveVariantItem[] {
  return variants.map((variant) => ({
    ...variant,
    splits: variant.splits.map((split) => ({
      ...split,
      manufacturedDate: defaults.manufacturedDate || split.manufacturedDate,
      expirationDate: defaults.expirationDate || split.expirationDate,
      unitCost: defaults.unitCost || split.unitCost,
    })),
  }));
}

export function clearBatchDefaultsFromVariants(
  variants: ReceiveVariantItem[]
): ReceiveVariantItem[] {
  return variants.map((variant) => ({
    ...variant,
    splits: variant.splits.map((split) => ({
      ...split,
      manufacturedDate: '',
      expirationDate: '',
      unitCost: '',
    })),
  }));
}

export const EMPTY_RECEIVE_BATCH_DEFAULTS: ReceiveBatchDefaults = {
  manufacturedDate: '',
  expirationDate: '',
  unitCost: '',
};
