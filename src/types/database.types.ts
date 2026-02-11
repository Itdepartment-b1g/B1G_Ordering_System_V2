// B1G Ordering System - Database Types
// Auto-generated TypeScript types for Supabase tables

export type UserRole = 'system_administrator' | 'super_admin' | 'admin' | 'finance' | 'manager' | 'team_leader' | 'mobile_sales' | 'sales_agent' | 'executive';
export type UserStatus = 'active' | 'inactive';
export type VariantType = 'flavor' | 'battery' | 'posm';
export type InventoryStatus = 'in-stock' | 'low-stock' | 'out-of-stock';
export type AgentInventoryStatus = 'available' | 'low' | 'none';
export type OrderStatus = 'pending' | 'approved' | 'rejected';
export type PurchaseOrderStatus = 'pending' | 'approved' | 'rejected' | 'delivered';
export type TransactionType = 'purchase_order_received' | 'allocated_to_agent' | 'order_fulfilled' | 'adjustment' | 'return';
export type FinancialTransactionType = 'revenue' | 'expense' | 'commission' | 'refund';
export type FinancialTransactionStatus = 'pending' | 'completed' | 'cancelled';
export type StockRequestStatus = 'pending' | 'approved_by_leader' | 'approved_by_admin' | 'rejected' | 'fulfilled';
export type NotificationType =
  | 'order_created'
  | 'order_approved'
  | 'order_rejected'
  | 'inventory_low'
  | 'inventory_allocated'
  | 'purchase_order_approved'
  | 'new_client'
  | 'system_message'
  | 'stock_request_created'
  | 'stock_request_approved'
  | 'stock_request_rejected'
  | 'audit_system_change'
  | 'audit_critical_action';

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE';

// Pricing types for order creation
export type PricingColumn = 'selling_price' | 'dsp_price' | 'rsp_price';
export type PricingStrategy = 'custom' | 'dsp' | 'rsp';

// ============================================================================
// TABLE TYPES
// ============================================================================

export interface Company {
  id: string;
  company_name: string;
  company_email: string;
  super_admin_name: string;
  super_admin_email: string;
  role: string; // Default: 'Super Admin'
  status: UserStatus;
  company_account_type: 'Key Accounts' | 'Standard Accounts';
  team_leader_allowed_pricing?: PricingColumn[];
  mobile_sales_allowed_pricing?: PricingColumn[];
  created_at: string;
  updated_at: string;
}

// Helper to map pricing strategy to column
export const PRICING_STRATEGY_MAP: Record<PricingStrategy, PricingColumn> = {
  rsp: 'rsp_price',
  dsp: 'dsp_price',
  custom: 'selling_price'
};

// Reverse map for UI display
export const PRICING_COLUMN_MAP: Record<PricingColumn, PricingStrategy> = {
  rsp_price: 'rsp',
  dsp_price: 'dsp',
  selling_price: 'custom'
};

// Pricing option metadata for UI
export const PRICING_OPTIONS = {
  selling_price: {
    label: 'Special Pricing',
    description: 'Custom Unit Prices',
    badge: 'Custom'
  },
  dsp_price: {
    label: 'DSP Pricing',
    description: 'Distributor Price',
    badge: 'DSP'
  },
  rsp_price: {
    label: 'RSP Pricing',
    description: 'Standard Retail Price',
    badge: 'RSP'
  }
} as const;

export interface Profile {
  id: string;
  company_id: string | null; // Null for executives and system_administrator
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  region?: string;
  address?: string;
  city?: string;
  country?: string;
  status: UserStatus;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutiveCompanyAssignment {
  id: string;
  executive_id: string;
  company_id: string;
  assigned_by?: string;
  created_at: string;
  updated_at: string;
  // For joined queries
  company?: Company;
  executive?: Profile;
  assigner?: Profile;
}

export interface Brand {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  logo_url?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Variant {
  id: string;
  company_id: string;
  brand_id: string;
  name: string;
  variant_type: VariantType;
  description?: string;
  sku?: string;
  created_at: string;
  updated_at: string;
}

export interface MainInventory {
  id: string;
  company_id: string;
  variant_id: string;
  stock: number;
  allocated_stock: number; // Stock reserved for approved requests but not yet distributed
  unit_price: number;
  selling_price?: number;
  dsp_price?: number;
  rsp_price?: number;
  reorder_level: number;
  status: InventoryStatus;
  last_restocked_at?: string;
  created_at: string;
  updated_at: string;
}

// Computed available stock = stock - allocated_stock
export type MainInventoryWithAvailability = MainInventory & {
  available_stock: number;
};

export interface AgentInventory {
  id: string;
  company_id: string;
  agent_id: string;
  variant_id: string;
  stock: number;
  allocated_price: number;
  dsp_price?: number;
  rsp_price?: number;
  status: AgentInventoryStatus;
  allocated_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  status: UserStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  company_id: string;
  po_number: string;
  supplier_id: string;
  order_date: string;
  expected_delivery_date?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  status: PurchaseOrderStatus;
  notes?: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  company_id: string;
  purchase_order_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

export type ClientApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ClientAccountType = 'Key Accounts' | 'Standard Accounts';
export type ClientCategory = 'Permanently Closed' | 'Renovating' | 'Open';

export interface ShopType {
  id: string;
  company_id: string;
  type_name: string;
  is_default: boolean;
  created_at: string;
  created_by?: string;
}

export interface Client {
  id: string;
  company_id: string;
  agent_id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  photo_url?: string;
  photo_timestamp?: string;
  location_latitude?: number;
  location_longitude?: number;
  location_accuracy?: number;
  location_captured_at?: string;
  total_orders: number;
  total_spent: number;
  account_type: ClientAccountType;
  category: ClientCategory;
  status: UserStatus;
  approval_status: ClientApprovalStatus;
  has_forge: boolean;
  approval_notes?: string;
  approval_requested_at?: string;
  approved_at?: string;
  approved_by?: string;
  last_order_date?: string;
  cor_url?: string;
  contact_person?: string;
  tin?: string;
  tax_status?: 'Tax on Sales' | 'Tax Exempt';
  shop_type?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentSplit {
  method: 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';
  bank?: string; // For BANK_TRANSFER
  amount: number;
  proof_url?: string;
}

export interface ClientOrder {
  id: string;
  company_id: string;
  order_number: string;
  agent_id: string;
  client_id: string;
  client_account_type: ClientAccountType;
  order_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total_amount: number;
  status: OrderStatus;
  notes?: string;
  signature_url?: string;
  payment_method?: 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';
  bank_type?: 'Unionbank' | 'BPI' | 'PBCOM';
  payment_proof_url?: string;
  payment_mode?: 'FULL' | 'SPLIT'; // NEW: Payment mode
  payment_splits?: PaymentSplit[]; // NEW: Split payment data
  stage?: 'agent_pending' | 'leader_approved' | 'admin_approved' | 'leader_rejected' | 'admin_rejected';
  remitted?: boolean;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  updated_at: string;
}

export interface ClientOrderItem {
  id: string;
  company_id: string;
  client_order_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  selling_price?: number;
  dsp_price?: number;
  rsp_price?: number;
  total_price: number;
  created_at: string;
}

export interface InventoryTransaction {
  id: string;
  company_id: string;
  transaction_type: TransactionType;
  variant_id: string;
  quantity: number;
  from_location?: string;
  to_location?: string;
  reference_type?: string;
  reference_id?: string;
  performed_by: string;
  notes?: string;
  created_at: string;
}

export interface RemittanceLog {
  id: string;
  company_id: string;
  agent_id: string;
  leader_id: string;
  remittance_date: string;
  remitted_at: string;
  items_remitted: number;
  total_units: number;
  orders_count: number;
  total_revenue: number;
  order_ids: string[];
  signature_url?: string;
  signature_path?: string;
  created_at: string;
  updated_at: string;
}

export interface FinancialTransaction {
  id: string;
  company_id: string;
  transaction_date: string;
  transaction_type: FinancialTransactionType;
  category?: string;
  amount: number;
  reference_type?: string;
  reference_id?: string;
  agent_id?: string;
  description?: string;
  status: FinancialTransactionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  reference_type?: string;
  reference_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface Event {
  id: string;
  occurred_at: string;
  actor_id: string;
  actor_role: string;
  performed_by: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  target_label?: string | null;
  actor_label?: string | null;
}

export interface LeaderTeam {
  id: string;
  company_id: string;
  leader_id: string;
  agent_id: string;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface StockRequest {
  id: string;
  company_id: string;
  request_number: string;
  agent_id: string;
  leader_id: string;
  variant_id: string;
  requested_quantity: number;
  leader_additional_quantity: number; // Additional qty leader requests for themselves
  is_combined_request: boolean; // True if request includes leader's additional qty
  requested_at: string;
  status: StockRequestStatus;
  leader_approved_at?: string;
  leader_approved_by?: string;
  leader_notes?: string;
  admin_approved_at?: string;
  admin_approved_by?: string;
  admin_notes?: string;
  fulfilled_at?: string;
  fulfilled_by?: string;
  fulfilled_quantity?: number;
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface StockRequestItem {
  id: string;
  company_id: string;
  stock_request_id: string;
  variant_id: string;
  requested_quantity: number;
  fulfilled_quantity: number;
  unit_price?: number;
  notes?: string;
  created_at: string;
}

export interface VisitLog {
  id: string;
  company_id: string;
  agent_id: string;
  client_id: string;
  task_id?: string;
  visited_at: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_within_radius: boolean;
  distance_meters?: number;
  radius_limit_meters?: number;
  photo_url?: string;
  notes?: string;
  created_at: string;
}

export interface Task {
  id: string;
  company_id: string;
  agent_id: string;
  leader_id?: string;
  client_id?: string; // Added
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  time?: string;
  notes?: string;
  attachment_url?: string;
  location_latitude?: number; // Added
  location_longitude?: number; // Added
  location_address?: string; // Added
  given_at: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SystemAuditLog {
  id: string;
  company_id: string;
  table_name: string;
  operation: AuditOperation;
  record_id: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  user_role?: UserRole;
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
  changed_fields?: string[];
  description?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ============================================================================
// EXTENDED/JOINED TYPES (for frontend use)
// ============================================================================

export interface VariantWithBrand extends Variant {
  brand: Brand;
}

export interface InventoryWithVariant extends MainInventory {
  variant: VariantWithBrand;
}

export interface AgentInventoryWithVariant extends AgentInventory {
  variant: VariantWithBrand;
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier: Supplier;
  items: PurchaseOrderItemWithVariant[];
  created_by_profile?: Profile;
  approved_by_profile?: Profile;
}

export interface PurchaseOrderItemWithVariant extends PurchaseOrderItem {
  variant: VariantWithBrand;
}

export interface ClientWithAgent extends Client {
  agent: Profile;
}

export interface ClientOrderWithDetails extends ClientOrder {
  agent: Profile;
  client: Client;
  items: ClientOrderItemWithVariant[];
  approved_by_profile?: Profile;
}

export interface ClientOrderItemWithVariant extends ClientOrderItem {
  variant: VariantWithBrand;
}

export interface LeaderTeamWithDetails extends LeaderTeam {
  leader: Profile;
  agent: Profile;
}

export interface SystemAuditLogWithProfile extends SystemAuditLog {
  user_profile?: Profile;
}

export interface BusinessAuditLog {
  id: string;
  company_id: string;
  action_type: string;
  action_category: string;
  action_description: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  user_role?: UserRole;
  affected_user_id?: string;
  affected_user_name?: string;
  affected_client_id?: string;
  affected_client_name?: string;
  details?: Record<string, any>;
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface StockRequestWithDetails extends StockRequest {
  agent: Profile;
  leader: Profile;
  admin?: Profile;
  rejector?: Profile;
  fulfiller?: Profile;
  variant: VariantWithBrand;
  items?: StockRequestItemWithVariant[];
}

export interface StockRequestItemWithVariant extends StockRequestItem {
  variant: VariantWithBrand;
}

export interface LeaderInventoryItem {
  leader_id: string;
  variant_id: string;
  variant_name: string;
  brand_name: string;
  total_stock: number;
  avg_price: number;
  agents_with_stock: number;
  lowest_status: AgentInventoryStatus;
  last_updated: string;
}

// ============================================================================
// PAYMENT SETTINGS TYPES
// ============================================================================

export interface BankAccount {
  name: string;
  account_number: string;
  enabled: boolean;
  qr_code_url?: string;
}

export interface CompanyPaymentSettings {
  id: string;
  company_id: string;
  bank_accounts: BankAccount[];
  gcash_number?: string;
  gcash_name?: string;
  gcash_qr_url?: string;
  cash_enabled: boolean;
  cheque_enabled: boolean;
  gcash_enabled: boolean;
  bank_transfer_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DASHBOARD STATS TYPES
// ============================================================================

export interface AdminDashboardStats {
  total_revenue: number;
  active_orders: number;
  total_agents: number;
  total_products: number;
  low_stock_items: number;
  pending_orders: number;
  approved_orders_count: number;
}

export interface AgentDashboardStats {
  my_sales: number;
  my_orders: number;
  pending_approval: number;
  my_clients: number;
  inventory_items: number;
  my_commission: number;
}

export interface LeaderDashboardStats {
  team_size: number;
  team_sales: number;
  pending_stock_requests: number;
  team_inventory_items: number;
  team_orders: number;
}

// ============================================================================
// FUNCTION RETURN TYPES
// ============================================================================

export interface FunctionResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

// ============================================================================
// REQUEST/INPUT TYPES
// ============================================================================

export interface CreateClientOrderInput {
  agent_id: string;
  client_id: string;
  order_date: string;
  items: {
    variant_id: string;
    quantity: number;
    unit_price: number;
  }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount: number;
  total: number;
  notes?: string;
}

export interface AllocateInventoryInput {
  agent_id: string;
  variant_id: string;
  quantity: number;
  allocated_price?: number;
  performed_by: string;
}

// ============================================================================
// SUPABASE DATABASE TYPE (for autocomplete)
// ============================================================================

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Company, 'id' | 'created_at'>>;
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      brands: {
        Row: Brand;
        Insert: Omit<Brand, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Brand, 'id' | 'created_at'>>;
      };
      variants: {
        Row: Variant;
        Insert: Omit<Variant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Variant, 'id' | 'created_at'>>;
      };
      main_inventory: {
        Row: MainInventory;
        Insert: Omit<MainInventory, 'id' | 'status' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<MainInventory, 'id' | 'status' | 'created_at'>>;
      };
      agent_inventory: {
        Row: AgentInventory;
        Insert: Omit<AgentInventory, 'id' | 'status' | 'allocated_at' | 'updated_at'>;
        Update: Partial<Omit<AgentInventory, 'id' | 'status' | 'allocated_at'>>;
      };
      suppliers: {
        Row: Supplier;
        Insert: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Supplier, 'id' | 'created_at'>>;
      };
      purchase_orders: {
        Row: PurchaseOrder;
        Insert: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PurchaseOrder, 'id' | 'created_at'>>;
      };
      purchase_order_items: {
        Row: PurchaseOrderItem;
        Insert: Omit<PurchaseOrderItem, 'id' | 'total_price' | 'created_at'>;
        Update: never;
      };
      clients: {
        Row: Client;
        Insert: Omit<Client, 'id' | 'total_orders' | 'total_spent' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Client, 'id' | 'created_at'>>;
      };
      client_orders: {
        Row: ClientOrder;
        Insert: Omit<ClientOrder, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ClientOrder, 'id' | 'created_at'>>;
      };
      client_order_items: {
        Row: ClientOrderItem;
        Insert: Omit<ClientOrderItem, 'id' | 'total_price' | 'created_at'>;
        Update: never;
      };
      remittances_log: {
        Row: RemittanceLog;
        Insert: Omit<RemittanceLog, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<RemittanceLog, 'id' | 'created_at'>>;
      };
      inventory_transactions: {
        Row: InventoryTransaction;
        Insert: Omit<InventoryTransaction, 'id' | 'created_at'>;
        Update: never;
      };
      financial_transactions: {
        Row: FinancialTransaction;
        Insert: Omit<FinancialTransaction, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FinancialTransaction, 'id' | 'created_at'>>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at'>;
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>;
      };
      company_payment_settings: {
        Row: CompanyPaymentSettings;
        Insert: Omit<CompanyPaymentSettings, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<CompanyPaymentSettings, 'id' | 'created_at'>>;
      };
    };
    Functions: {
      generate_po_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      generate_order_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      approve_purchase_order: {
        Args: { po_id: string; approver_id: string };
        Returns: FunctionResponse;
      };
      allocate_to_agent: {
        Args: { p_agent_id: string; p_variant_id: string; p_quantity: number; p_allocated_price: number; p_dsp_price?: number; p_rsp_price?: number; p_performed_by: string };
        Returns: FunctionResponse;
      };
      create_client_order: {
        Args: CreateClientOrderInput;
        Returns: FunctionResponse<{ order_id: string; order_number: string }>;
      };
      approve_client_order: {
        Args: { p_order_id: string; p_approver_id: string };
        Returns: FunctionResponse;
      };
      reject_client_order: {
        Args: { p_order_id: string; p_approver_id: string; p_reason?: string };
        Returns: FunctionResponse;
      };
      get_admin_dashboard_stats: {
        Args: Record<string, never>;
        Returns: AdminDashboardStats;
      };
      get_agent_dashboard_stats: {
        Args: { p_agent_id: string };
        Returns: AgentDashboardStats;
      };
      assign_agent_to_leader: {
        Args: { p_agent_id: string; p_leader_id: string; p_admin_id: string };
        Returns: FunctionResponse;
      };
      remove_agent_from_team: {
        Args: { p_agent_id: string; p_admin_id: string };
        Returns: FunctionResponse;
      };
      approve_stock_request_by_leader: {
        Args: { p_request_id: string; p_leader_id: string; p_notes?: string };
        Returns: FunctionResponse;
      };
      approve_stock_request_by_admin: {
        Args: { p_request_id: string; p_admin_id: string; p_notes?: string };
        Returns: FunctionResponse;
      };
      reject_stock_request: {
        Args: { p_request_id: string; p_rejector_id: string; p_reason?: string };
        Returns: FunctionResponse;
      };
      // New PRE-ORDER system functions
      forward_stock_request_with_leader_qty: {
        Args: {
          p_request_id: string;
          p_leader_id: string;
          p_leader_additional_quantity?: number;
          p_notes?: string;
        };
        Returns: FunctionResponse;
      };
      admin_approve_stock_request: {
        Args: { p_request_id: string; p_admin_id: string; p_notes?: string };
        Returns: FunctionResponse;
      };
      admin_reject_stock_request: {
        Args: { p_request_id: string; p_admin_id: string; p_reason: string };
        Returns: FunctionResponse;
      };
      leader_accept_and_distribute_stock: {
        Args: { p_request_id: string; p_leader_id: string };
        Returns: FunctionResponse;
      };
      get_available_stock: {
        Args: { p_variant_id: string; p_company_id: string };
        Returns: number;
      };
    };
  };
}

