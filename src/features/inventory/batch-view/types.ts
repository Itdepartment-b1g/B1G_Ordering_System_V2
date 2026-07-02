import type { InventoryBatchSourceType } from '@/types/database.types';

export type BatchInventoryLotLine = {
  lotId: string;
  batchId: string;
  variantId: string;
  variantName: string;
  variantType: string | null;
  expirationDate: string | null;
  quantity: number;
};

export type BatchInventoryBrandGroup = {
  brandId: string;
  brandName: string;
  lots: BatchInventoryLotLine[];
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
