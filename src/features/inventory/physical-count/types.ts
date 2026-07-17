export type PhysicalCountLine = {
  id: string;
  lotId: string | null;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  expirationDate: string | null;
  systemQty: number;
  physicalQty: string;
  boxCount: string;
  unitsPerBox: string;
};

export type PhysicalCountLotOption = {
  lotId: string;
  expirationDate: string | null;
  quantityRemaining: number;
};

export type PhysicalCountBrandOption = { id: string; name: string };

export type PhysicalCountVariantOption = {
  id: string;
  name: string;
  variant_type: string;
  brand_id: string;
};

export type PhysicalCountBatchCatalog = {
  brands: PhysicalCountBrandOption[];
  variantsByBrand: Record<string, PhysicalCountVariantOption[]>;
};

export type PhysicalCountBatchOption = {
  batchId: string;
  batchNumber: string;
  receivedAt: string;
  sourceType: string;
  skuCount: number;
  lotCount: number;
  totalUnits: number;
};

export type PhysicalCountSubmitLine = {
  variant_id: string;
  lot_id: string | null;
  physical_qty: number;
  box_count: number;
  units_per_box: number;
  system_qty_snapshot: number;
  brand_name: string;
  variant_name: string;
  expiration_date?: string | null;
};

export type PhysicalCountHistoryRow = {
  id: string;
  counted_at: string;
  created_at: string;
  signature_url: string;
  signature_path: string;
  notes: string | null;
  batch: { id: string; batch_number: string } | null;
  warehouse_location: { id: string; name: string; is_main: boolean } | null;
  performed_by: string | null;
  performed_by_name: string | null;
  performed_by_user: { id: string; full_name: string } | null;
  line_count: number;
  total_variance: number;
};

export type PhysicalCountHistoryDetail = PhysicalCountHistoryRow & {
  lines: Array<{
    id: string;
    brand_name: string;
    variant_name: string;
    expiration_date: string | null;
    system_qty_snapshot: number;
    physical_qty: number;
    box_count: number | null;
    units_per_box: number | null;
    variance: number;
  }>;
};
