-- ============================================================================
-- FIX EXECUTIVE DASHBOARD ACCESS
-- ============================================================================
-- This script fixes the "No Companies Assigned" issue on the Executive Dashboard.
-- It ensures that the necessary helper functions and RLS policies exist so that
-- executives can view their assigned companies and data.
-- ============================================================================

-- 1. Ensure helper functions exist (Required for RLS policies)
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

-- 2. Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_executive_company_ids() TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.is_executive() TO authenticated, service_role, anon;

-- 3. Fix Executive Assignments RLS (So they can see which companies they have)
ALTER TABLE executive_company_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Executives can view their own assignments" ON executive_company_assignments;
CREATE POLICY "Executives can view their own assignments"
    ON executive_company_assignments FOR SELECT
    USING (executive_id = auth.uid());

-- 4. Fix Companies RLS (So they can see company details)
DROP POLICY IF EXISTS "Executives can view assigned companies" ON companies;
CREATE POLICY "Executives can view assigned companies"
    ON companies FOR SELECT
    USING (
        is_executive()
        AND id = ANY(get_my_executive_company_ids())
    );

-- 5. Fix Profiles RLS (So they can see agents in those companies)
DROP POLICY IF EXISTS "Executives can view profiles from assigned companies" ON profiles;
CREATE POLICY "Executives can view profiles from assigned companies"
    ON profiles FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );

-- 6. Fix Client Orders RLS (So they can see orders)
DROP POLICY IF EXISTS "Executives can view orders from assigned companies" ON client_orders;
CREATE POLICY "Executives can view orders from assigned companies"
    ON client_orders FOR SELECT
    USING (
        is_executive()
        AND (
            company_id = ANY(get_my_executive_company_ids())
            -- Also allow if they are the creator (just in case)
            OR auth.uid() = agent_id
        )
    );

-- 7. Fix Clients RLS
DROP POLICY IF EXISTS "Executives can view clients from assigned companies" ON clients;
CREATE POLICY "Executives can view clients from assigned companies"
    ON clients FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );
