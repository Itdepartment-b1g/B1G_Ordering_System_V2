-- ============================================================================
-- RECREATE ALL TABLES FOR MULTI-TENANT B2B SYSTEM
-- ============================================================================
-- This script recreates all database tables, indexes, triggers, functions, and RLS policies
-- Run this in Supabase SQL Editor after wiping the database
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. COMPANIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    super_admin_name TEXT NOT NULL,
    super_admin_email TEXT NOT NULL,
    role TEXT DEFAULT 'Super Admin',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(company_email);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
COMMENT ON TABLE companies IS 'Multi-tenant companies table - root of data segregation';

-- ============================================================================
-- 2. PROFILES TABLE (Users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system_administrator', 'super_admin', 'admin', 'finance', 'manager', 'team_leader', 'mobile_sales', 'executive')),
    phone TEXT,
    region TEXT,
    address TEXT,
    city TEXT,
    country TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
COMMENT ON TABLE profiles IS 'User profiles linked to companies for multi-tenant isolation';

-- ============================================================================
-- 3. EXECUTIVE COMPANY ASSIGNMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS executive_company_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    executive_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(executive_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_executive_assignments_executive_id ON executive_company_assignments(executive_id);
CREATE INDEX IF NOT EXISTS idx_executive_assignments_company_id ON executive_company_assignments(company_id);
COMMENT ON TABLE executive_company_assignments IS 'Junction table mapping executives to companies they can view';

-- ============================================================================
-- 4. BRANDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brands_company_id ON brands(company_id);
CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
COMMENT ON TABLE brands IS 'Product brands per company';

-- ============================================================================
-- 5. VARIANT TYPES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS variant_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    color_code TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_variant_types_company_id ON variant_types(company_id);
CREATE INDEX IF NOT EXISTS idx_variant_types_name ON variant_types(name);
CREATE INDEX IF NOT EXISTS idx_variant_types_is_active ON variant_types(is_active);
COMMENT ON TABLE variant_types IS 'Variant types per company - allows dynamic type management';

-- ============================================================================
-- 6. VARIANTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    variant_type_id UUID REFERENCES variant_types(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    variant_type TEXT NOT NULL CHECK (variant_type IN ('flavor', 'battery', 'POSM')),
    description TEXT,
    sku TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_company_id ON variants(company_id);
CREATE INDEX IF NOT EXISTS idx_variants_brand_id ON variants(brand_id);
CREATE INDEX IF NOT EXISTS idx_variants_type ON variants(variant_type);
COMMENT ON TABLE variants IS 'Product variants (flavors/batteries) per company';

-- ============================================================================
-- 7. MAIN INVENTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS main_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    stock INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2) DEFAULT 0,
    selling_price DECIMAL(10,2) DEFAULT 0,
    dsp_price DECIMAL(10,2) DEFAULT 0,
    rsp_price DECIMAL(10,2) DEFAULT 0,
    reorder_level INTEGER DEFAULT 100,
    status TEXT DEFAULT 'in-stock' CHECK (status IN ('in-stock', 'low-stock', 'out-of-stock')),
    last_restocked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_main_inventory_company_id ON main_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_main_inventory_variant_id ON main_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_main_inventory_status ON main_inventory(status);
COMMENT ON TABLE main_inventory IS 'Central inventory per company';

-- ============================================================================
-- 8. AGENT INVENTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    stock INTEGER DEFAULT 0,
    allocated_price DECIMAL(10,2) DEFAULT 0,
    dsp_price DECIMAL(10,2) DEFAULT 0,
    rsp_price DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'low', 'none')),
    allocated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, agent_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_inventory_company_id ON agent_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_agent_id ON agent_inventory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_variant_id ON agent_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_status ON agent_inventory(status);
COMMENT ON TABLE agent_inventory IS 'Agent-allocated inventory per company';

-- ============================================================================
-- 9. SUPPLIERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
COMMENT ON TABLE suppliers IS 'Suppliers per company';

-- ============================================================================
-- 10. PURCHASE ORDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    subtotal DECIMAL(10,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'delivered')),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id),
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
COMMENT ON TABLE purchase_orders IS 'Purchase orders per company';

-- ============================================================================
-- 11. PURCHASE ORDER ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_company_id ON purchase_order_items(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_variant_id ON purchase_order_items(variant_id);
COMMENT ON TABLE purchase_order_items IS 'Purchase order line items';

-- ============================================================================
-- 12. CLIENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    address TEXT,
    city TEXT,
    photo_url TEXT,
    photo_timestamp TIMESTAMP WITH TIME ZONE,
    location_latitude DECIMAL(10,8),
    location_longitude DECIMAL(11,8),
    location_accuracy DECIMAL(10,2),
    location_captured_at TIMESTAMP WITH TIME ZONE,
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0,
    account_type TEXT DEFAULT 'Standard Accounts' CHECK (account_type IN ('Key Accounts', 'Standard Accounts')),
    category TEXT DEFAULT 'Open' CHECK (category IN ('Permanently Closed', 'Renovating', 'Open')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    approval_notes TEXT,
    approval_requested_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_order_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_agent_id ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_approval_status ON clients(approval_status);
CREATE INDEX IF NOT EXISTS idx_clients_account_type ON clients(account_type);
CREATE INDEX IF NOT EXISTS idx_clients_category ON clients(category);
COMMENT ON TABLE clients IS 'Clients per company';

-- ============================================================================
-- 12.5. CASH DEPOSITS TABLE (Must be before client_orders due to FK reference)
-- ============================================================================
CREATE TABLE IF NOT EXISTS cash_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id),
    performed_by UUID NOT NULL REFERENCES profiles(id),
    amount DECIMAL(10,2) NOT NULL,
    bank_account TEXT NOT NULL,
    reference_number TEXT,
    deposit_slip_url TEXT,
    deposit_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_deposits_company_id ON cash_deposits(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_agent_id ON cash_deposits(agent_id);
CREATE INDEX IF NOT EXISTS idx_cash_deposits_date ON cash_deposits(deposit_date);
COMMENT ON TABLE cash_deposits IS 'Cash deposit records per company';

-- ============================================================================
-- 13. CLIENT ORDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL UNIQUE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    client_account_type TEXT NOT NULL CHECK (client_account_type IN ('Key Accounts', 'Standard Accounts')),
    order_date DATE NOT NULL,
    subtotal DECIMAL(10,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    notes TEXT,
    signature_url TEXT,
    payment_method TEXT CHECK (payment_method IN ('GCASH', 'BANK_TRANSFER', 'CASH')),
    payment_proof_url TEXT,
    deposit_id UUID REFERENCES cash_deposits(id) ON DELETE SET NULL,
    stage TEXT CHECK (stage IN ('agent_pending', 'leader_approved', 'admin_approved', 'leader_rejected', 'admin_rejected')),
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_orders_company_id ON client_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_agent_id ON client_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_client_id ON client_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_client_orders_status ON client_orders(status);
CREATE INDEX IF NOT EXISTS idx_client_orders_order_number ON client_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_client_orders_client_account_type ON client_orders(client_account_type);
CREATE INDEX IF NOT EXISTS idx_client_orders_deposit_id ON client_orders(deposit_id);
COMMENT ON TABLE client_orders IS 'Client orders per company';

-- ============================================================================
-- 14. CLIENT ORDER ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_order_id UUID NOT NULL REFERENCES client_orders(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) DEFAULT 0,
    dsp_price DECIMAL(10,2) DEFAULT 0,
    rsp_price DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_order_items_company_id ON client_order_items(company_id);
CREATE INDEX IF NOT EXISTS idx_client_order_items_order_id ON client_order_items(client_order_id);
CREATE INDEX IF NOT EXISTS idx_client_order_items_variant_id ON client_order_items(variant_id);
COMMENT ON TABLE client_order_items IS 'Client order line items';

-- ============================================================================
-- 15. REMITTANCES LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS remittances_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    remittance_date DATE NOT NULL,
    remitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    items_remitted INTEGER DEFAULT 0,
    total_units INTEGER DEFAULT 0,
    orders_count INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    order_ids UUID[] DEFAULT ARRAY[]::UUID[],
    signature_url TEXT,
    signature_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remittances_log_company_id ON remittances_log(company_id);
CREATE INDEX IF NOT EXISTS idx_remittances_log_agent_id ON remittances_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_remittances_log_leader_id ON remittances_log(leader_id);
CREATE INDEX IF NOT EXISTS idx_remittances_log_remittance_date ON remittances_log(remittance_date);
CREATE INDEX IF NOT EXISTS idx_remittances_log_remitted_at ON remittances_log(remitted_at);
COMMENT ON TABLE remittances_log IS 'Log of stock remittances from agents to leaders';

-- ============================================================================
-- 16. INVENTORY TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase_order_received', 'allocated_to_agent', 'order_fulfilled', 'adjustment', 'return')),
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    from_location TEXT,
    to_location TEXT,
    reference_type TEXT,
    reference_id UUID,
    performed_by UUID NOT NULL REFERENCES profiles(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_id ON inventory_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_variant_id ON inventory_transactions(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);
COMMENT ON TABLE inventory_transactions IS 'Inventory transaction history per company';

-- ============================================================================
-- 17. FINANCIAL TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('revenue', 'expense', 'commission', 'refund')),
    category TEXT,
    amount DECIMAL(10,2) NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_id ON financial_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_type ON financial_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_status ON financial_transactions(status);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_agent_id ON financial_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_date ON financial_transactions(transaction_date);
COMMENT ON TABLE financial_transactions IS 'Financial transactions per company';

-- ============================================================================
-- 18. NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('order_created', 'order_approved', 'order_rejected', 'inventory_low', 'inventory_allocated', 'purchase_order_approved', 'new_client', 'system_message', 'stock_request_created', 'stock_request_approved', 'stock_request_rejected')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_company_id ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
COMMENT ON TABLE notifications IS 'User notifications per company';

-- ============================================================================
-- 19. LEADER TEAMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leader_teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(leader_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_leader_teams_company_id ON leader_teams(company_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_leader_id ON leader_teams(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_teams_agent_id ON leader_teams(agent_id);
COMMENT ON TABLE leader_teams IS 'Team assignments (leader-agent relationships) per company';

-- ============================================================================
-- 20. STOCK REQUESTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    request_number TEXT NOT NULL UNIQUE,
    agent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    leader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    requested_quantity INTEGER NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved_by_leader', 'approved_by_admin', 'rejected', 'fulfilled')),
    leader_approved_at TIMESTAMP WITH TIME ZONE,
    leader_approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    leader_notes TEXT,
    admin_approved_at TIMESTAMP WITH TIME ZONE,
    admin_approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    admin_notes TEXT,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    fulfilled_quantity INTEGER,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_requests_company_id ON stock_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_agent_id ON stock_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_leader_id ON stock_requests(leader_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_stock_requests_request_number ON stock_requests(request_number);
COMMENT ON TABLE stock_requests IS 'Stock requests per company';

-- ============================================================================
-- 21. STOCK REQUEST ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stock_request_id UUID NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
    requested_quantity INTEGER NOT NULL,
    fulfilled_quantity INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_request_items_company_id ON stock_request_items(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_request_id ON stock_request_items(stock_request_id);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_variant_id ON stock_request_items(variant_id);
COMMENT ON TABLE stock_request_items IS 'Stock request line items';

-- ============================================================================
-- 22. INVENTORY RETURNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES profiles(id),
    receiver_id UUID NOT NULL REFERENCES profiles(id),
    return_date TIMESTAMP NOT NULL DEFAULT NOW(),
    return_type TEXT NOT NULL CHECK (return_type IN ('full', 'partial')),
    return_reason TEXT NOT NULL,
    reason_notes TEXT,
    signature_url TEXT,
    signature_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_returns_agent ON inventory_returns(agent_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_returns_receiver ON inventory_returns(receiver_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_returns_company ON inventory_returns(company_id, return_date DESC);
COMMENT ON TABLE inventory_returns IS 'Inventory returns from agents to leaders';

-- ============================================================================
-- 23. INVENTORY RETURN ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_id UUID NOT NULL REFERENCES inventory_returns(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    allocated_price NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_return_items_return ON inventory_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_inventory_return_items_variant ON inventory_return_items(variant_id);
COMMENT ON TABLE inventory_return_items IS 'Inventory return line items';

-- ============================================================================
-- 25. EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('system', 'admin', 'leader', 'sales_agent', 'finance', 'manager')),
    performed_by TEXT NOT NULL,
    actor_label TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_label TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_company_id ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_actor_id ON events(actor_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_company_occurred ON events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_action ON events(action);
CREATE INDEX IF NOT EXISTS idx_events_target_type ON events(target_type);
CREATE INDEX IF NOT EXISTS idx_events_details ON events USING GIN (details);
COMMENT ON TABLE events IS 'Centralized event logging table for audit trail and history tracking';

-- ============================================================================
-- 26. SYSTEM AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    user_role TEXT,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    description TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_company_id ON system_audit_log(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_name ON system_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON system_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON system_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON system_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_record_id ON system_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_company_table_date ON system_audit_log(company_id, table_name, created_at DESC);
COMMENT ON TABLE system_audit_log IS 'Comprehensive audit trail for all database operations';

-- ============================================================================
-- DONE: All tables created
-- ============================================================================
-- Next steps:
-- 1. Run migrations to add RLS policies, triggers, and functions
-- 2. Use the "Seed System Admin" button on login page to create system administrator
-- ============================================================================
