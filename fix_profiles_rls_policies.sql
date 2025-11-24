-- ============================================================================
-- FIX PROFILES RLS POLICIES - REMOVE AND RECREATE
-- ============================================================================
-- This script removes all existing RLS policies on the profiles table
-- and recreates them with proper helper functions to prevent recursion
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. DROP ALL EXISTING POLICIES ON PROFILES TABLE
-- ============================================================================

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

-- ============================================================================
-- 2. ENSURE HELPER FUNCTIONS EXIST WITH PROPER SECURITY DEFINER
-- ============================================================================
-- CRITICAL: All functions that query profiles table MUST use:
-- 1. SECURITY DEFINER - Runs with privileges of function creator (bypasses RLS)
-- 2. SET search_path = public - Ensures queries go directly to public schema
-- This prevents infinite recursion when RLS policies call these functions

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper function to check if user is system_administrator
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

-- Helper function to check if user is super_admin
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

-- Helper function to check if user is admin or super_admin
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
-- 3. RECREATE RLS POLICIES IN CORRECT ORDER
-- ============================================================================
-- CRITICAL: Policies must be created in this order to prevent recursion:
-- 1. "Users can view their own profile" - MUST be first (no dependencies)
-- 2. System admin policies - Use helper function (bypasses RLS)
-- 3. Company-based policies - Use helper functions (bypasses RLS)
-- 4. Super admin policies - Use helper functions (bypasses RLS)

-- POLICY 1: Users can view their own profile (NO dependencies - prevents recursion)
-- This is the most permissive policy and must be checked first
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- POLICY 2: System administrators can view all profiles
-- Uses helper function with SECURITY DEFINER (bypasses RLS)
CREATE POLICY "System administrators can view all profiles"
    ON profiles FOR SELECT
    USING (is_system_administrator());

-- POLICY 3: Users can view profiles in their company
-- Uses helper function with SECURITY DEFINER (bypasses RLS)
-- Note: This policy is checked AFTER "Users can view their own profile"
CREATE POLICY "Users can view profiles in their company"
    ON profiles FOR SELECT
    USING (
        company_id = get_my_company_id()
    );

-- POLICY 4: Super admin can view all profiles in their company
-- Uses helper functions with SECURITY DEFINER (bypasses RLS)
CREATE POLICY "Super admin can view all profiles in their company"
    ON profiles FOR SELECT
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

-- POLICY 5: Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- POLICY 6: Admins can insert profiles in their company
-- CRITICAL: Uses helper function instead of direct EXISTS query
CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- POLICY 7: Admins can update profiles in their company
-- CRITICAL: Uses helper function instead of direct EXISTS query
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

-- POLICY 8: Super admin can insert profiles in their company
CREATE POLICY "Super admin can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

-- POLICY 9: Super admin can update all profiles in their company
CREATE POLICY "Super admin can update all profiles in their company"
    ON profiles FOR UPDATE
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    )
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

-- POLICY 10: Super admin can delete profiles in their company
-- Note: Super admin cannot delete their own profile (self-protection)
CREATE POLICY "Super admin can delete profiles in their company"
    ON profiles FOR DELETE
    USING (
        is_super_admin() 
        AND company_id = get_super_admin_company_id()
        AND id != auth.uid()  -- Prevent self-deletion
    );

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this script:
-- 1. Try logging in - profile should load quickly (under 1 second)
-- 2. Check that users can view their own profile
-- 3. Check that admins can view profiles in their company
-- 4. Check that super admins can view all profiles in their company

-- To verify policies were created:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'profiles'
-- ORDER BY policyname;

