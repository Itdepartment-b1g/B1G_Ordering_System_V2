import type { InventoryBatchSourceType } from '@/types/database.types';
import type { LotReceivePacking } from '../utils/formatReceivePacking';

export type BatchInventoryLotLine = {
  lotId: string;
  batchId: string;
  variantId: string;
  variantName: string;
  variantType: string | null;
  expirationDate: string | null;
  quantity: number;
  /** Receive packing from stock request, when available. */
  packing?: LotReceivePacking | null;
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
