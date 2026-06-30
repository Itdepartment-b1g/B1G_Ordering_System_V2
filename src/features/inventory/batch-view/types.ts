import type { InventoryBatchSourceType } from '@/types/database.types';

export type BatchInventoryVariantLine = {
  variantId: string;
  variantName: string;
  variantType: string | null;
  quantity: number;
};

export type BatchInventoryBrandGroup = {
  brandId: string;
  brandName: string;
  variants: BatchInventoryVariantLine[];
};

export type BatchInventoryGroup = {
  batchId: string;
  batchNumber: string;
  receivedAt: string;
  sourceType: InventoryBatchSourceType;
  totalAmount: number;
  locationId: string;
  locationName: string;
  skuCount: number;
  totalUnits: number;
  brands: BatchInventoryBrandGroup[];
};
