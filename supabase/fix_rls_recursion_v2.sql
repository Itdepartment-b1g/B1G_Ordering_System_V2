-- ============================================================================
-- FIX RLS RECURSION V2 (CLEAN SLATE)
-- ============================================================================

-- 1. DROP ALL POLICIES ON PROFILES (Dynamic)
-- This ensures no hidden/old policies remain to cause recursion
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON profiles', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- 2. CREATE ROBUST SECURITY DEFINER FUNCTIONS
-- We use a new name 'get_auth_company_id' to avoid conflicts
-- We explicitly set search_path to public to ensure we access the table directly

CREATE OR REPLACE FUNCTION get_auth_company_id()
RETURNS UUID AS $$
BEGIN
    -- This query runs with the privileges of the function creator (postgres)
    -- It BYPASSES RLS on the profiles table
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_auth_system_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role = 'system_administrator'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_auth_super_admin()
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

CREATE OR REPLACE FUNCTION get_auth_super_admin_company_id()
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

CREATE OR REPLACE FUNCTION is_auth_admin_or_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permissions (just in case)
GRANT EXECUTE ON FUNCTION get_auth_company_id TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION is_auth_system_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION is_auth_super_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION get_auth_super_admin_company_id TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION is_auth_admin_or_super_admin TO authenticated, service_role, anon;

-- 3. RE-APPLY POLICIES ON PROFILES
-- Using the new functions

-- Policy 1: View Own Profile (Base case, no recursion)
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- Policy 2: View Company Profiles (Uses SECURITY DEFINER function)
CREATE POLICY "Users can view profiles in their company"
    ON profiles FOR SELECT
    USING (company_id = get_auth_company_id());

-- Policy 3: System Admin View All
CREATE POLICY "System administrators can view all profiles"
    ON profiles FOR SELECT
    USING (is_auth_system_admin());

-- Policy 4: Update Own Profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Policy 5: Admin Insert/Update
CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_auth_company_id()
        AND is_auth_admin_or_super_admin()
    );

CREATE POLICY "Admins can update profiles in their company"
    ON profiles FOR UPDATE
    USING (
        company_id = get_auth_company_id()
        AND is_auth_admin_or_super_admin()
    )
    WITH CHECK (
        company_id = get_auth_company_id()
        AND is_auth_admin_or_super_admin()
    );

-- Policy 6: Super Admin
CREATE POLICY "Super admin can view all profiles in their company"
    ON profiles FOR SELECT
    USING (is_auth_super_admin() AND company_id = get_auth_super_admin_company_id());

CREATE POLICY "Super admin can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (is_auth_super_admin() AND company_id = get_auth_super_admin_company_id());

CREATE POLICY "Super admin can update all profiles in their company"
    ON profiles FOR UPDATE
    USING (is_auth_super_admin() AND company_id = get_auth_super_admin_company_id())
    WITH CHECK (is_auth_super_admin() AND company_id = get_auth_super_admin_company_id());

CREATE POLICY "Super admin can delete profiles in their company"
    ON profiles FOR DELETE
    USING (is_auth_super_admin() AND company_id = get_auth_super_admin_company_id() AND id != auth.uid());

-- 4. UPDATE OTHER TABLES TO USE NEW FUNCTION
-- We need to update the generic policies on other tables to use get_auth_company_id()
-- instead of the old get_my_company_id()

CREATE OR REPLACE FUNCTION update_company_policies(table_name TEXT)
RETURNS void AS $$
BEGIN
    -- Drop old policies
    EXECUTE format('DROP POLICY IF EXISTS "Users can view %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update %I in their company" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete %I in their company" ON %I', table_name, table_name);

    -- Create new policies using NEW function
    EXECUTE format('
        CREATE POLICY "Users can view %I in their company"
            ON %I FOR SELECT
            USING (company_id = get_auth_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can insert %I in their company"
            ON %I FOR INSERT
            WITH CHECK (company_id = get_auth_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can update %I in their company"
            ON %I FOR UPDATE
            USING (company_id = get_auth_company_id())
            WITH CHECK (company_id = get_auth_company_id());
    ', table_name, table_name);

    EXECUTE format('
        CREATE POLICY "Users can delete %I in their company"
            ON %I FOR DELETE
            USING (company_id = get_auth_company_id());
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
        PERFORM update_company_policies(t);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS update_company_policies(TEXT);

-- 5. VERIFY
SELECT count(*) as profile_count FROM profiles;
