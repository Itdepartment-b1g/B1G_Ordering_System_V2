-- ============================================================================
-- COMPREHENSIVE FIX FOR CLIENT_ORDERS TABLE AND PROFILES RLS POLICIES
-- Run this script in Supabase SQL Editor to fix:
-- 1. Add missing payment_method, payment_proof_url, and stage columns
-- 2. Fix infinite recursion in profiles RLS policies
-- 3. Ensure all helper functions use SECURITY DEFINER with proper search_path
-- ============================================================================

-- ============================================================================
-- 1. ADD MISSING COLUMNS TO client_orders TABLE
-- ============================================================================

-- Add payment_method column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'client_orders' 
        AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE client_orders 
        ADD COLUMN payment_method TEXT CHECK (payment_method IN ('GCASH', 'BANK_TRANSFER', 'CASH'));
    END IF;
END $$;

-- Add payment_proof_url column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'client_orders' 
        AND column_name = 'payment_proof_url'
    ) THEN
        ALTER TABLE client_orders 
        ADD COLUMN payment_proof_url TEXT;
    END IF;
END $$;

-- Add stage column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'client_orders' 
        AND column_name = 'stage'
    ) THEN
        ALTER TABLE client_orders 
        ADD COLUMN stage TEXT CHECK (stage IN ('agent_pending', 'leader_approved', 'admin_approved', 'leader_rejected', 'admin_rejected'));
    END IF;
END $$;

-- ============================================================================
-- 2. FIX INFINITE RECURSION IN PROFILES RLS POLICIES
-- ============================================================================

-- Drop all existing policies on profiles table to start fresh
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
-- 3. RECREATE ALL HELPER FUNCTIONS WITH PROPER SECURITY DEFINER
-- ============================================================================
-- CRITICAL: All functions that query profiles table MUST use:
-- 1. SECURITY DEFINER - Runs with privileges of function creator (bypasses RLS)
-- 2. SET search_path = public - Ensures queries go directly to public schema
-- This prevents infinite recursion when RLS policies call these functions

-- Helper function to get user's company_id
-- This function queries profiles, so it MUST use SECURITY DEFINER to bypass RLS
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
-- CRITICAL: This replaces the direct EXISTS queries in policies that caused recursion
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
-- 4. RECREATE RLS POLICIES IN CORRECT ORDER
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

-- POLICY 4: Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- POLICY 5: Admins can insert profiles in their company
-- CRITICAL: Uses helper function instead of direct EXISTS query
CREATE POLICY "Admins can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        company_id = get_my_company_id()
        AND is_admin_or_super_admin()
    );

-- POLICY 6: Admins can update profiles in their company
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

-- POLICY 7-10: Super Admin policies for PROFILES table
-- These policies use helper functions with SECURITY DEFINER (bypasses RLS)
CREATE POLICY "Super admin can view all profiles in their company"
    ON profiles FOR SELECT
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

CREATE POLICY "Super admin can insert profiles in their company"
    ON profiles FOR INSERT
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

CREATE POLICY "Super admin can update all profiles in their company"
    ON profiles FOR UPDATE
    USING (
        is_super_admin() AND company_id = get_super_admin_company_id()
    )
    WITH CHECK (
        is_super_admin() AND company_id = get_super_admin_company_id()
    );

CREATE POLICY "Super admin can delete profiles in their company"
    ON profiles FOR DELETE
    USING (
        is_super_admin() 
        AND company_id = get_super_admin_company_id()
        AND id != auth.uid() -- Cannot delete themselves
    );

-- ============================================================================
-- 5. FIX get_my_company_id() FUNCTION USED BY OTHER TABLES
-- ============================================================================
-- The original schema has a get_my_company_id() function without SET search_path
-- This function is used by other tables' RLS policies, so we need to ensure
-- it also has the proper security settings (though it's already recreated above)

-- Note: The function is already created above with proper settings.
-- This comment is here for documentation purposes.

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'client_orders' 
AND column_name IN ('payment_method', 'payment_proof_url', 'stage')
ORDER BY column_name;

-- Verify policies exist
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'profiles' 
ORDER BY policyname;

-- Verify helper functions exist and have SECURITY DEFINER
SELECT 
    p.proname as function_name,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_type,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('get_my_company_id', 'is_system_administrator', 'is_super_admin', 'get_super_admin_company_id', 'is_admin_or_super_admin')
ORDER BY p.proname;
