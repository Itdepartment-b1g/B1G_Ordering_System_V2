-- ============================================================================
-- CREATE ALL TABLES FOR MULTI-TENANT B2B SYSTEM
-- Based on database.types.ts
-- Run this script in Supabase SQL Editor
-- ============================================================================

-- Enable UUID extension if not already enabled
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
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system_administrator', 'super_admin', 'admin', 'finance', 'manager', 'team_leader', 'mobile_sales')),
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
-- 3. BRANDS TABLE XFORGE
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
-- 4. VARIANTS TABLE Flavor Batt POSM
-- ============================================================================
CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
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
-- 5. MAIN INVENTORY TABLE
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
-- 6. AGENT INVENTORY TABLE
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_inventory_company_id ON agent_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_agent_id ON agent_inventory(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_variant_id ON agent_inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_agent_inventory_status ON agent_inventory(status);
COMMENT ON TABLE agent_inventory IS 'Agent-allocated inventory per company';

-- ============================================================================
-- 7. SUPPLIERS TABLE
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
-- 8. PURCHASE ORDERS TABLE
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
    approved_by UUID REFERENCES profiles(id),
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
-- 9. PURCHASE ORDER ITEMS TABLE
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
-- 10. CLIENTS TABLE
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
    approved_by UUID REFERENCES profiles(id),
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
-- 11. CLIENT ORDERS TABLE
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
    stage TEXT CHECK (stage IN ('agent_pending', 'leader_approved', 'admin_approved', 'leader_rejected', 'admin_rejected')),
    approved_by UUID REFERENCES profiles(id),
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
COMMENT ON TABLE client_orders IS 'Client orders per company';

-- ============================================================================
-- 12. CLIENT ORDER ITEMS TABLE
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
-- 13. REMITTANCES LOG TABLE
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
-- 14. INVENTORY TRANSACTIONS TABLE
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
-- 14. FINANCIAL TRANSACTIONS TABLE
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
    agent_id UUID REFERENCES profiles(id),
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
-- 15. NOTIFICATIONS TABLE
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
-- 16. LEADER TEAMS TABLE
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
-- 17. STOCK REQUESTS TABLE
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
    leader_approved_by UUID REFERENCES profiles(id),
    leader_notes TEXT,
    admin_approved_at TIMESTAMP WITH TIME ZONE,
    admin_approved_by UUID REFERENCES profiles(id),
    admin_notes TEXT,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    fulfilled_by UUID REFERENCES profiles(id),
    fulfilled_quantity INTEGER,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by UUID REFERENCES profiles(id),
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
-- 18. STOCK REQUEST ITEMS TABLE
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
-- 19. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE main_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittances_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leader_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_request_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 20. RLS POLICIES FOR COMPANIES TABLE
-- ============================================================================

-- Drop existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "System administrators can view all companies" ON companies;
DROP POLICY IF EXISTS "System administrators can insert companies" ON companies;
DROP POLICY IF EXISTS "System administrators can update companies" ON companies;
DROP POLICY IF EXISTS "System administrators can delete companies" ON companies;

CREATE POLICY "System administrators can view all companies"
    ON companies FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    );

CREATE POLICY "System administrators can insert companies"
    ON companies FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    );

CREATE POLICY "System administrators can update companies"
    ON companies FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    );

CREATE POLICY "System administrators can delete companies"
    ON companies FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    );

-- ============================================================================
-- 21. RLS POLICIES FOR PROFILES TABLE
-- ============================================================================

-- Drop existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "System administrators can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Super admin can view all profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Super admin can insert profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Super admin can update all profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Super admin can delete profiles in their company" ON profiles;

-- CRITICAL: Users must be able to view their own profile first (before company check)
-- This prevents circular dependency when fetching profile during login
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- System administrators can view all profiles (they manage companies)
-- Use SECURITY DEFINER function to avoid recursion
CREATE OR REPLACE FUNCTION is_system_administrator()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE POLICY "System administrators can view all profiles"
    ON profiles FOR SELECT
    USING (is_system_administrator());

-- Users can view profiles in their company (after they can view their own)
CREATE POLICY "Users can view profiles in their company"
    ON profiles FOR SELECT
    USING (
        company_id = get_my_company_id()
    );

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update profiles in their company"
    ON profiles FOR UPDATE
    USING (
        company_id = get_my_company_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    )
    WITH CHECK (
        company_id = get_my_company_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- ============================================================================
-- 22. RLS POLICIES FOR ALL DATA TABLES (Multi-tenant isolation)
-- ============================================================================
-- All data tables use the same pattern: users can only access data from their company

-- Helper function to check if user belongs to a company
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Generic policy function for SELECT (view) operations
CREATE OR REPLACE FUNCTION create_company_select_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        CREATE POLICY "Users can view %I in their company"
            ON %I FOR SELECT
            USING (company_id = get_my_company_id());
    ', table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Generic policy function for INSERT operations
CREATE OR REPLACE FUNCTION create_company_insert_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Users can insert %I in their company" ON %I;
        CREATE POLICY "Users can insert %I in their company"
            ON %I FOR INSERT
            WITH CHECK (company_id = get_my_company_id());
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Generic policy function for UPDATE operations
CREATE OR REPLACE FUNCTION create_company_update_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Users can update %I in their company" ON %I;
        CREATE POLICY "Users can update %I in their company"
            ON %I FOR UPDATE
            USING (company_id = get_my_company_id())
            WITH CHECK (company_id = get_my_company_id());
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Generic policy function for DELETE operations
CREATE OR REPLACE FUNCTION create_company_delete_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Users can delete %I in their company" ON %I;
        CREATE POLICY "Users can delete %I in their company"
            ON %I FOR DELETE
            USING (company_id = get_my_company_id());
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply policies to all data tables
DO $$
DECLARE
    table_name TEXT;
    tables TEXT[] := ARRAY[
        'brands', 'variants', 'main_inventory', 'agent_inventory', 'suppliers',
        'purchase_orders', 'purchase_order_items', 'clients', 'client_orders',
        'client_order_items', 'remittances_log', 'inventory_transactions', 'financial_transactions',
        'notifications', 'leader_teams', 'stock_requests', 'stock_request_items'
    ];
BEGIN
    FOREACH table_name IN ARRAY tables LOOP
        PERFORM create_company_select_policy(table_name);
        PERFORM create_company_insert_policy(table_name);
        PERFORM create_company_update_policy(table_name);
        PERFORM create_company_delete_policy(table_name);
    END LOOP;
END $$;

-- Clean up helper functions
DROP FUNCTION IF EXISTS create_company_select_policy(TEXT);
DROP FUNCTION IF EXISTS create_company_insert_policy(TEXT);
DROP FUNCTION IF EXISTS create_company_update_policy(TEXT);
DROP FUNCTION IF EXISTS create_company_delete_policy(TEXT);

-- ============================================================================
-- 22.5. RLS POLICIES FOR SUPER ADMIN (Full Access Within Company)
-- ============================================================================
-- Super Admin has full access to all tables within their company

-- Helper function to check if user is super_admin in their company
-- Uses SECURITY DEFINER and SET search_path to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to get super_admin's company_id
-- Uses SECURITY DEFINER and SET search_path to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION get_super_admin_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT company_id FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'super_admin'
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Super Admin policies for PROFILES table
-- Note: These policies must come AFTER the "Users can view their own profile" policy
-- to avoid infinite recursion. The helper functions use SECURITY DEFINER to bypass RLS.
DROP POLICY IF EXISTS "Super admin can view all profiles in their company" ON profiles;
CREATE POLICY "Super admin can view all profiles in their company"
    ON profiles FOR SELECT
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

DROP POLICY IF EXISTS "Super admin can insert profiles in their company" ON profiles;
CREATE POLICY "Super admin can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

DROP POLICY IF EXISTS "Super admin can update all profiles in their company" ON profiles;
CREATE POLICY "Super admin can update all profiles in their company"
    ON profiles FOR UPDATE
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    )
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

DROP POLICY IF EXISTS "Super admin can delete profiles in their company" ON profiles;
CREATE POLICY "Super admin can delete profiles in their company"
    ON profiles FOR DELETE
    USING (
        is_super_admin() 
        AND company_id = get_super_admin_company_id()
        AND id != auth.uid() -- Cannot delete themselves
    );

-- Generic policy functions for super admin
CREATE OR REPLACE FUNCTION create_super_admin_select_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Super admin can view all %I in their company" ON %I;
        CREATE POLICY "Super admin can view all %I in their company"
            ON %I FOR SELECT
            USING (
                is_super_admin() AND company_id = get_super_admin_company_id()
            );
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_super_admin_insert_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Super admin can insert %I in their company" ON %I;
        CREATE POLICY "Super admin can insert %I in their company"
            ON %I FOR INSERT
            WITH CHECK (
                is_super_admin() AND company_id = get_super_admin_company_id()
            );
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_super_admin_update_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Super admin can update all %I in their company" ON %I;
        CREATE POLICY "Super admin can update all %I in their company"
            ON %I FOR UPDATE
            USING (
                is_super_admin() AND company_id = get_super_admin_company_id()
            )
            WITH CHECK (
                is_super_admin() AND company_id = get_super_admin_company_id()
            );
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_super_admin_delete_policy(table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS "Super admin can delete %I in their company" ON %I;
        CREATE POLICY "Super admin can delete %I in their company"
            ON %I FOR DELETE
            USING (
                is_super_admin() AND company_id = get_super_admin_company_id()
            );
    ', table_name, table_name, table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply super admin policies to all data tables
DO $$
DECLARE
    table_name TEXT;
    tables TEXT[] := ARRAY[
        'brands', 'variants', 'main_inventory', 'agent_inventory', 'suppliers',
        'purchase_orders', 'purchase_order_items', 'clients', 'client_orders',
        'client_order_items', 'remittances_log', 'inventory_transactions', 'financial_transactions',
        'notifications', 'leader_teams', 'stock_requests', 'stock_request_items'
    ];
BEGIN
    FOREACH table_name IN ARRAY tables LOOP
        PERFORM create_super_admin_select_policy(table_name);
        PERFORM create_super_admin_insert_policy(table_name);
        PERFORM create_super_admin_update_policy(table_name);
        PERFORM create_super_admin_delete_policy(table_name);
    END LOOP;
END $$;

-- Clean up super admin helper functions
DROP FUNCTION IF EXISTS create_super_admin_select_policy(TEXT);
DROP FUNCTION IF EXISTS create_super_admin_insert_policy(TEXT);
DROP FUNCTION IF EXISTS create_super_admin_update_policy(TEXT);
DROP FUNCTION IF EXISTS create_super_admin_delete_policy(TEXT);

-- ============================================================================
-- 23. TRIGGERS TO UPDATE updated_at TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
DO $$
DECLARE
    table_name TEXT;
    tables_with_updated_at TEXT[] := ARRAY[
        'companies', 'profiles', 'brands', 'variants', 'main_inventory',
        'agent_inventory', 'suppliers', 'purchase_orders', 'clients',
        'client_orders', 'remittances_log', 'financial_transactions', 'leader_teams', 'stock_requests'
    ];
BEGIN
    FOREACH table_name IN ARRAY tables_with_updated_at LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
            CREATE TRIGGER update_%I_updated_at
                BEFORE UPDATE ON %I
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', table_name, table_name, table_name, table_name);
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Optional - uncomment to verify)
-- ============================================================================

-- Check if all tables were created
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN (
--     'companies', 'profiles', 'brands', 'variants', 'main_inventory',
--     'agent_inventory', 'suppliers', 'purchase_orders', 'purchase_order_items',
--     'clients', 'client_orders', 'client_order_items', 'remittances_log', 'inventory_transactions',
--     'financial_transactions', 'notifications', 'leader_teams', 'stock_requests',
--     'stock_request_items'
-- )
-- ORDER BY table_name;

-- Check if RLS is enabled on all tables
-- SELECT tablename, rowsecurity FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN (
--     'companies', 'profiles', 'brands', 'variants', 'main_inventory',
--     'agent_inventory', 'suppliers', 'purchase_orders', 'purchase_order_items',
--     'clients', 'client_orders', 'client_order_items', 'remittances_log', 'inventory_transactions',
--     'financial_transactions', 'notifications', 'leader_teams', 'stock_requests',
--     'stock_request_items'
-- )
-- ORDER BY tablename;
