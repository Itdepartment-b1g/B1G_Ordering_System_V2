-- ============================================================================
-- ENABLE SECURE RLS (NON-RECURSIVE)
-- ============================================================================
-- This script:
-- 1. Enables RLS on all tables
-- 2. Creates SECURITY DEFINER helper functions (prevents recursion)
-- 3. Sets up safe policies for 'profiles'
-- 4. Sets up standard company-isolation policies for all other tables

-- ============================================================================
-- 1. ENABLE RLS ON ALL TABLES
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
-- 2. HELPER FUNCTIONS (SECURITY DEFINER = BYPASS RLS)
-- ============================================================================

-- Get user's company_id (Bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Check if user is system_administrator
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

-- Check if user is super_admin
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

-- Get super_admin's company_id
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

-- Check if user is admin or super_admin
CREATE OR REPLACE FUNCTION is_admin_or_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3. PROFILES TABLE POLICIES (CRITICAL: NON-RECURSIVE)
-- ============================================================================

-- Drop existing policies
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

-- 1. View Own Profile (No dependencies)
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- 2. System Admin View All (Uses helper)
CREATE POLICY "System administrators can view all profiles"
    ON profiles FOR SELECT
    USING (is_system_administrator());

-- 3. View Company Profiles (Uses helper)
CREATE POLICY "Users can view profiles in their company"
    ON profiles FOR SELECT
    USING (company_id = get_my_company_id());

-- 4. Update Own Profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 5. Admin Insert/Update (Uses helpers)
CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

CREATE POLICY "Admins can update profiles in their company"
    ON profiles FOR UPDATE
    USING (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    )
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- 6. Super Admin Policies (Uses helpers)
CREATE POLICY "Super admin can view all profiles in their company"
    ON profiles FOR SELECT
    USING (is_super_admin() AND company_id = get_super_admin_company_id());

CREATE POLICY "Super admin can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (is_super_admin() AND company_id = get_super_admin_company_id());

CREATE POLICY "Super admin can update all profiles in their company"
    ON profiles FOR UPDATE
    USING (is_super_admin() AND company_id = get_super_admin_company_id())
    WITH CHECK (is_super_admin() AND company_id = get_super_admin_company_id());

CREATE POLICY "Super admin can delete profiles in their company"
    ON profiles FOR DELETE
    USING (is_super_admin() AND company_id = get_super_admin_company_id() AND id != auth.uid());

-- ============================================================================
-- 4. GENERIC POLICIES FOR ALL OTHER TABLES
-- ============================================================================

-- Helper functions to generate policies dynamically
CREATE OR REPLACE FUNCTION create_company_policies(table_name TEXT)
RETURNS void AS $$
BEGIN
    -- Drop existing policies
    EXECUTE format('DROP POLICY IF EXISTS "Users can view %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete %I in their company" ON %I', table_name, table_name);

    -- Create new policies using get_my_company_id()
    EXECUTE format('
        CREATE POLICY "Users can view %I in their company"
            ON %I FOR SELECT
            USING (company_id = get_my_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can insert %I in their company"
            ON %I FOR INSERT
            WITH CHECK (company_id = get_my_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can update %I in their company"
            ON %I FOR UPDATE
            USING (company_id = get_my_company_id())
            WITH CHECK (company_id = get_my_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can delete %I in their company"
            ON %I FOR DELETE
            USING (company_id = get_my_company_id());
    ', table_name, table_name);
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'brands', 'variants', 'main_inventory', 'agent_inventory', 'suppliers',
        'purchase_orders', 'purchase_order_items', 'clients', 'client_orders',
        'client_order_items', 'remittances_log', 'inventory_transactions', 'financial_transactions',
        'notifications', 'leader_teams', 'stock_requests', 'stock_request_items'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        PERFORM create_company_policies(t);
    END LOOP;
END $$;

-- Cleanup
DROP FUNCTION IF EXISTS create_company_policies(TEXT);

-- ============================================================================
-- 5. COMPANIES TABLE POLICIES (Special Case)
-- ============================================================================
DROP POLICY IF EXISTS "System administrators can view all companies" ON companies;
CREATE POLICY "System administrators can view all companies"
    ON companies FOR SELECT
    USING (is_system_administrator());

-- Verify
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
