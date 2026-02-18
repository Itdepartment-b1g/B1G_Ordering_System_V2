-- ============================================================================
-- COMPREHENSIVE EXECUTIVE ACCESS FIX (DASHBOARD & WAR ROOM)
-- ============================================================================
-- This script ensures valid RLS policies for ALL tables accessed by 
-- Executive Dashboard and War Room.
-- ============================================================================

-- 1. UTILITY: Ensure helper functions exist (Required for RLS policies)
-- (Redundant if previous script ran, but safe to repeat with OR REPLACE)
CREATE OR REPLACE FUNCTION public.get_my_executive_company_ids()
RETURNS UUID[]
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ARRAY_AGG(company_id)
    FROM executive_company_assignments
    WHERE executive_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_executive()
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

GRANT EXECUTE ON FUNCTION public.get_my_executive_company_ids() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_executive() TO authenticated, service_role, anon;

-- ============================================================================
-- 2. CORE TABLES (Already fixed, but re-applying to be safe)
-- ============================================================================

-- Companies
DROP POLICY IF EXISTS "Executives can view assigned companies" ON companies;
CREATE POLICY "Executives can view assigned companies"
    ON companies FOR SELECT
    USING (
        is_executive()
        AND id = ANY(get_my_executive_company_ids())
    );

-- Executive Assignments
ALTER TABLE executive_company_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Executives can view their own assignments" ON executive_company_assignments;
CREATE POLICY "Executives can view their own assignments"
    ON executive_company_assignments FOR SELECT
    USING (executive_id = auth.uid());

-- Profiles (Agents, Managers, etc.)
DROP POLICY IF EXISTS "Executives can view profiles from assigned companies" ON profiles;
CREATE POLICY "Executives can view profiles from assigned companies"
    ON profiles FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- Clients
DROP POLICY IF EXISTS "Executives can view clients from assigned companies" ON clients;
CREATE POLICY "Executives can view clients from assigned companies"
    ON clients FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- Client Orders
DROP POLICY IF EXISTS "Executives can view orders from assigned companies" ON client_orders;
CREATE POLICY "Executives can view orders from assigned companies"
    ON client_orders FOR SELECT
    USING (
        is_executive()
        AND (
            company_id = ANY(get_my_executive_company_ids())
            OR auth.uid() = agent_id -- Backup check
        )
    );

-- ============================================================================
-- 3. ADDITIONAL TABLES (Required for War Room & Advanced Stats)
-- ============================================================================

-- VISIT LOGS (Critical for War Room)
ALTER TABLE visit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Executives can view visit logs from assigned companies" ON visit_logs;
CREATE POLICY "Executives can view visit logs from assigned companies"
    ON visit_logs FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- BRANDS (Critical for War Room & Dashboard Brand Performance)
DROP POLICY IF EXISTS "Executives can view brands from assigned companies" ON brands;
CREATE POLICY "Executives can view brands from assigned companies"
    ON brands FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- CLIENT ORDER ITEMS (Critical for Dashboard Brand Performance)
DROP POLICY IF EXISTS "Executives can view order items from assigned companies" ON client_order_items;
CREATE POLICY "Executives can view order items from assigned companies"
    ON client_order_items FOR SELECT
    USING (
        is_executive()
        AND EXISTS (
             SELECT 1 FROM client_orders 
             WHERE client_orders.id = client_order_items.client_order_id
             AND client_orders.company_id = ANY(get_my_executive_company_ids())
        )
    );

-- VARIANTS (Critical for Dashboard Brand Performance)
DROP POLICY IF EXISTS "Executives can view variants from assigned companies" ON variants;
CREATE POLICY "Executives can view variants from assigned companies"
    ON variants FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- FINANCIAL TRANSACTIONS (For Revenue stats)
DROP POLICY IF EXISTS "Executives can view transactions from assigned companies" ON financial_transactions;
CREATE POLICY "Executives can view transactions from assigned companies"
    ON financial_transactions FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- AGENT INVENTORY (Just in case)
DROP POLICY IF EXISTS "Executives can view agent inventory from assigned companies" ON agent_inventory;
CREATE POLICY "Executives can view agent inventory from assigned companies"
    ON agent_inventory FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- MAIN INVENTORY (Just in case)
DROP POLICY IF EXISTS "Executives can view inventory from assigned companies" ON main_inventory;
CREATE POLICY "Executives can view inventory from assigned companies"
    ON main_inventory FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );
