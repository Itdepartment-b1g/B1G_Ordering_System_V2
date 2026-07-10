import type { Variant } from '../InventoryContext';

export type MainInventoryVariantSortKey =
  | 'name'
  | 'stock'
  | 'allocated'
  | 'allocatedRemaining'
  | 'available'
  | 'sellingPrice'
  | 'dsp'
  | 'rsp'
  | 'status';

export type MainInventoryVariantSortDirection = 'asc' | 'desc';

export const DEFAULT_MAIN_INVENTORY_VARIANT_SORT_KEY: MainInventoryVariantSortKey = 'name';
export const DEFAULT_MAIN_INVENTORY_VARIANT_SORT_DIRECTION: MainInventoryVariantSortDirection = 'asc';

export type MainInventoryVariantSortContext = {
  getGrossAllocated: (variant: Variant) => number;
  getRemainingAllocated: (variant: Variant) => number;
  getAvailable: (variant: Variant) => number;
  hasNoPrice: (variant: Variant) => boolean;
};

function getStatusSortLabel(variant: Variant, hasNoPrice: boolean): string {
  if (variant.stock === 0) return 'Out of Stock';
  if (hasNoPrice) return 'No Price Set';
  if (variant.status === 'low-stock') return 'Low Stock';
  return 'In Stock';
}

function getNumericPrice(value: number | undefined): number {
  return typeof value === 'number' && !Number.isNaN(value) ? value : -1;
}

export function sortMainInventoryVariants<T extends Variant>(
  variants: T[],
  sortKey: MainInventoryVariantSortKey,
  sortDirection: MainInventoryVariantSortDirection,
  ctx: MainInventoryVariantSortContext
): T[] {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...variants].sort((a, b) => {
    let result = 0;

    switch (sortKey) {
      case 'name':
        result = a.name.localeCompare(b.name);
        break;
      case 'stock':
        result = a.stock - b.stock;
        break;
      case 'allocated':
        result = ctx.getGrossAllocated(a) - ctx.getGrossAllocated(b);
        break;
      case 'allocatedRemaining':
        result = ctx.getRemainingAllocated(a) - ctx.getRemainingAllocated(b);
        break;
      case 'available':
        result = ctx.getAvailable(a) - ctx.getAvailable(b);
        break;
      case 'sellingPrice':
        result = getNumericPrice(a.sellingPrice) - getNumericPrice(b.sellingPrice);
        break;
      case 'dsp':
        result = getNumericPrice(a.dspPrice) - getNumericPrice(b.dspPrice);
        break;
      case 'rsp':
        result = getNumericPrice(a.rspPrice) - getNumericPrice(b.rspPrice);
        break;
      case 'status':
        result = getStatusSortLabel(a, ctx.hasNoPrice(a)).localeCompare(
          getStatusSortLabel(b, ctx.hasNoPrice(b))
        );
        break;
      default:
        result = 0;
    }

    if (result !== 0) return result * direction;
    return a.name.localeCompare(b.name);
  });
}
