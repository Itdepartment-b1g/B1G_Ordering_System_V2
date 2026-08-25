export type InventoryVariantDto = {
  id: string;
  name: string;
  variantType: string;
  stock: number;
  allocatedStock: number;
  price: number;
  sellingPrice: number;
  dspPrice: number;
  rspPrice: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock';
  reorderLevel?: number;
  mainInventoryId?: string;
};

export type InventoryBrandDto = {
  id: string;
  name: string;
  flavors: InventoryVariantDto[];
  batteries: InventoryVariantDto[];
  posms: InventoryVariantDto[];
  variantsByType: Record<string, InventoryVariantDto[]>;
  allVariants: InventoryVariantDto[];
};

export type ExecutiveTeamLeaderDto = {
  id: string;
  full_name: string;
  hub_names: string[];
};

export type ExecutiveTeamLeaderMode = 'leader_only' | 'team_total';
