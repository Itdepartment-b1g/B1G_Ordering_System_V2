export type WarehouseAllocationBatchLine = {
  id: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  expirationDate: string | null;
};

export type WarehouseAllocationLine = {
  id: string;
  variantId: string;
  variantName: string;
  brandId: string | null;
  brandName: string;
  variantType: string | null;
  quantity: number;
  batches: WarehouseAllocationBatchLine[];
};

export type WarehouseAllocationGroup = {
  groupId: string;
  createdAt: string;
  locationId: string;
  locationName: string;
  performedById: string;
  performedByName: string;
  brandId: string | null;
  brandName: string | null;
  totalQuantity: number;
  lineCount: number;
  lines: WarehouseAllocationLine[];
};
