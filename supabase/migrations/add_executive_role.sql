-- ============================================================================
-- ADD EXECUTIVE ROLE TO SYSTEM
-- ============================================================================
-- This migration:
-- 1. Adds 'executive' to the profiles role constraint
-- 2. Creates executive_company_assignments junction table
-- 3. Creates helper functions for executive access
-- 4. Sets up RLS policies for executives
-- ============================================================================

-- ============================================================================
-- 1. UPDATE PROFILES TABLE ROLE CONSTRAINT
-- ============================================================================

-- Drop the existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add new constraint with 'executive' included
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
CHECK (role IN (
    'system_administrator', 
    'super_admin', 
    'admin', 
    'finance', 
    'manager', 
    'team_leader', 
    'mobile_sales',
    'executive'
));

-- Allow company_id to be NULL for executives (they use executive_company_assignments instead)
ALTER TABLE profiles ALTER COLUMN company_id DROP NOT NULL;

-- Also allow NULL in system_audit_log for executive-related audit entries
ALTER TABLE system_audit_log ALTER COLUMN company_id DROP NOT NULL;

-- ============================================================================
-- 2. CREATE EXECUTIVE COMPANY ASSIGNMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS executive_company_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    executive_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(executive_id, company_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_executive_assignments_executive_id 
    ON executive_company_assignments(executive_id);
CREATE INDEX IF NOT EXISTS idx_executive_assignments_company_id 
    ON executive_company_assignments(company_id);

COMMENT ON TABLE executive_company_assignments IS 
    'Junction table mapping executives to companies they can view';

-- ============================================================================
-- 3. ENABLE RLS ON EXECUTIVE ASSIGNMENTS TABLE
-- ============================================================================

ALTER TABLE executive_company_assignments ENABLE ROW LEVEL SECURITY;

-- System administrators can manage all assignments
DROP POLICY IF EXISTS "System administrators can manage executive assignments" 
    ON executive_company_assignments;
CREATE POLICY "System administrators can manage executive assignments"
    ON executive_company_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() 
            AND role = 'system_administrator'
        )
    );

-- Executives can view their own assignments
DROP POLICY IF EXISTS "Executives can view their own assignments" 
    ON executive_company_assignments;
CREATE POLICY "Executives can view their own assignments"
    ON executive_company_assignments FOR SELECT
    USING (executive_id = auth.uid());

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Get array of company IDs assigned to an executive
CREATE OR REPLACE FUNCTION get_executive_company_ids(exec_id UUID)
RETURNS UUID[] 
LANGUAGE SQL 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ARRAY_AGG(company_id) 
    FROM executive_company_assignments 
    WHERE executive_id = exec_id
$$;

-- Get company IDs for current user if they're an executive
CREATE OR REPLACE FUNCTION get_my_executive_company_ids()
RETURNS UUID[] 
LANGUAGE SQL 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ARRAY_AGG(company_id) 
    FROM executive_company_assignments 
    WHERE executive_id = auth.uid()
$$;

-- Check if current user is an executive
CREATE OR REPLACE FUNCTION is_executive()
RETURNS BOOLEAN 
LANGUAGE SQL 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role = 'executive'
    )
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_executive_company_ids(UUID) 
    TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION get_my_executive_company_ids() 
    TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION is_executive() 
    TO authenticated, service_role, anon;

-- ============================================================================
-- 5. ADD RLS POLICIES FOR EXECUTIVE READ ACCESS
-- ============================================================================

-- COMPANIES TABLE: Executives can view their assigned companies
DROP POLICY IF EXISTS "Executives can view assigned companies" ON companies;
CREATE POLICY "Executives can view assigned companies"
    ON companies FOR SELECT
    USING (
        is_executive() 
        AND id = ANY(get_my_executive_company_ids())
    );

-- PROFILES TABLE: Executives can view profiles from assigned companies
DROP POLICY IF EXISTS "Executives can view profiles from assigned companies" ON profiles;
CREATE POLICY "Executives can view profiles from assigned companies"
    ON profiles FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- CLIENTS TABLE: Executives can view clients from assigned companies
DROP POLICY IF EXISTS "Executives can view clients from assigned companies" ON clients;
CREATE POLICY "Executives can view clients from assigned companies"
    ON clients FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- CLIENT_ORDERS TABLE: Executives can view orders from assigned companies
DROP POLICY IF EXISTS "Executives can view orders from assigned companies" ON client_orders;
CREATE POLICY "Executives can view orders from assigned companies"
    ON client_orders FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- CLIENT_ORDER_ITEMS TABLE: Executives can view order items from assigned companies
DROP POLICY IF EXISTS "Executives can view order items from assigned companies" ON client_order_items;
CREATE POLICY "Executives can view order items from assigned companies"
    ON client_order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM client_orders 
            WHERE client_orders.id = client_order_items.client_order_id
            AND client_orders.company_id = ANY(get_my_executive_company_ids())
        )
    );

-- MAIN_INVENTORY TABLE: Executives can view inventory from assigned companies
DROP POLICY IF EXISTS "Executives can view inventory from assigned companies" ON main_inventory;
CREATE POLICY "Executives can view inventory from assigned companies"
    ON main_inventory FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- AGENT_INVENTORY TABLE: Executives can view agent inventory from assigned companies
DROP POLICY IF EXISTS "Executives can view agent inventory from assigned companies" ON agent_inventory;
CREATE POLICY "Executives can view agent inventory from assigned companies"
    ON agent_inventory FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- FINANCIAL_TRANSACTIONS TABLE: Executives can view transactions from assigned companies
DROP POLICY IF EXISTS "Executives can view transactions from assigned companies" ON financial_transactions;
CREATE POLICY "Executives can view transactions from assigned companies"
    ON financial_transactions FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- BRANDS TABLE: Executives can view brands from assigned companies
DROP POLICY IF EXISTS "Executives can view brands from assigned companies" ON brands;
CREATE POLICY "Executives can view brands from assigned companies"
    ON brands FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- VARIANTS TABLE: Executives can view variants from assigned companies
DROP POLICY IF EXISTS "Executives can view variants from assigned companies" ON variants;
CREATE POLICY "Executives can view variants from assigned companies"
    ON variants FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- REMITTANCES_LOG TABLE: Executives can view remittances from assigned companies
DROP POLICY IF EXISTS "Executives can view remittances from assigned companies" ON remittances_log;
CREATE POLICY "Executives can view remittances from assigned companies"
    ON remittances_log FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- INVENTORY_TRANSACTIONS TABLE: Executives can view transactions from assigned companies
DROP POLICY IF EXISTS "Executives can view inventory transactions from assigned companies" ON inventory_transactions;
CREATE POLICY "Executives can view inventory transactions from assigned companies"
    ON inventory_transactions FOR SELECT
    USING (
        is_executive() 
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- ============================================================================
-- 6. ADD TRIGGER FOR UPDATED_AT
-- ============================================================================

DROP TRIGGER IF EXISTS update_executive_company_assignments_updated_at 
    ON executive_company_assignments;
CREATE TRIGGER update_executive_company_assignments_updated_at
    BEFORE UPDATE ON executive_company_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify the role constraint was updated
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conname = 'profiles_role_check';

-- Verify the new table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'executive_company_assignments'
) as table_exists;

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'executive_company_assignments';
