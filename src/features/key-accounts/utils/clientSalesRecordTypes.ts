export type KASalesRecordPaymentMethod = 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';
export type KASalesRecordOrderKind = 'standard' | 'consignment';

export type KASalesRecordExcelRow = {
  excel_row: number;
  sheet_name: string;
  source_row_key: string;
  external_po_ref: string;
  rfpf_number: string;
  order_date?: string;
  expected_delivery_date?: string;
  client_name?: string;
  shop_name?: string;
  address_label?: string;
  client_category?: string;
  contact_phone?: string;
  province?: string;
  city?: string;
  brand_name?: string;
  variant_name?: string;
  sku?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  agent_name?: string;
  kam_email?: string;
  warehouse_location_name?: string;
  discount?: number;
  notes?: string;
  inventory_kind?: KASalesRecordOrderKind;
  excel_status?: string;
  payment_amount?: number;
  payment_date?: string;
  payment_method?: KASalesRecordPaymentMethod;
  bank_type?: string | null;
  remaining_balance?: number;
  comm_released?: boolean;
  proof_url?: string;
};

export type SalesRecordIdentityField =
  | 'rfpf'
  | 'order_date'
  | 'delivery_date'
  | 'agent'
  | 'client_name'
  | 'shop_name'
  | 'address_label'
  | 'client_category'
  | 'contact_phone'
  | 'province'
  | 'city'
  | 'warehouse_location_name'
  | 'discount'
  | 'notes'
  | 'inventory_kind'
  | 'excel_status'
  | 'payment_amount'
  | 'payment_date'
  | 'payment_method'
  | 'remaining_balance'
  | 'comm_released'
  | 'proof_url'
  | 'device_qty';

export type SalesRecordColumnRole = 'identity' | 'flavor' | 'marker' | 'ignore';

export type SalesRecordColumnOverride = {
  role: SalesRecordColumnRole;
  field?: SalesRecordIdentityField;
};

export type SalesRecordSheetColumn = {
  index: number;
  header: string;
  role: SalesRecordColumnRole;
  field?: SalesRecordIdentityField;
  marker?: 'total_qty' | 'price' | 'amount' | 'total';
};

export type SalesRecordSheetProfile = {
  name: string;
  header_row: number;
  columns: SalesRecordSheetColumn[];
  data_rows: number;
  missing_required: string[];
};

export type SalesRecordTrackerOnly = {
  rfpf: string;
  client_name: string;
  shop_name: string;
  product: string;
};

export type SalesRecordParseResult = {
  rows: KASalesRecordExcelRow[];
  sheets: SalesRecordSheetProfile[];
  agents: string[];
  products: { brand: string; variant: string }[];
  tracker_only: SalesRecordTrackerOnly[];
  needs_column_map: boolean;
  model: SalesRecordWorkbookModel;
};

export type SalesRecordWorkbookModel = {
  sheets: SalesRecordSheetModel[];
  tracker_only: SalesRecordTrackerOnly[];
};

export type SalesRecordSheetModel = {
  name: string;
  header_row: number;
  headers: string[];
  sub_headers: string[];
  rows: { excel_row: number; cells: unknown[] }[];
};

export type SalesRecordAliases = {
  agents: Record<string, string>;
  products: Record<string, { brand_name: string; variant_name: string; sku?: string }>;
};

export const SALES_RECORD_ALIAS_STORAGE_KEY = 'ka-sales-record-aliases-v1';
export const SALES_RECORD_IMPORT_PO_CHUNK = 20;
export const SALES_RECORD_IMPORT_ROLES = ['sales_admin', 'sales_head'] as const;
