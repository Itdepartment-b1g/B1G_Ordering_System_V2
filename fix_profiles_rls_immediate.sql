-- ============================================================================
-- IMMEDIATE FIX FOR PROFILES RLS POLICIES - PREVENTS TIMEOUT
-- ============================================================================
-- This script fixes the RLS policies that are causing timeouts
-- Run this in Supabase SQL Editor

-- 1. Ensure helper functions exist with SECURITY DEFINER
-- ============================================================================

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (SELECT company_id FROM public.profiles WHERE id = auth.uid());
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

-- 2. Fix the problematic policies that use direct EXISTS queries
-- ============================================================================

-- Drop and recreate "Admins can insert profiles in their company" policy
DROP POLICY IF EXISTS "Admins can insert profiles in their company" ON profiles;
CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- Drop and recreate "Admins can update profiles in their company" policy
DROP POLICY IF EXISTS "Admins can update profiles in their company" ON profiles;
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

-- 3. Verify the "Users can view their own profile" policy exists and is first
-- ============================================================================
-- This policy should already exist, but let's make sure it's correct
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- 4. Verify helper function for system administrators
-- ============================================================================
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

-- 5. Verify helper function for super admin
-- ============================================================================
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

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running this script, try logging in again
-- The profile query should complete quickly (under 1 second)

