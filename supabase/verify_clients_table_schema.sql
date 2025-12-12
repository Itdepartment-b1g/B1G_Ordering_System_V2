-- ============================================================================
-- VERIFY CLIENTS TABLE SCHEMA
-- ============================================================================
-- This script checks if all required columns exist in the clients table
-- and reports any missing columns
-- ============================================================================

-- Check all columns in the clients table
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'clients'
ORDER BY ordinal_position;

-- ============================================================================
-- EXPECTED COLUMNS CHECKLIST
-- ============================================================================
-- Based on ClientsPage.tsx, these columns should exist:

-- ✓ id (uuid, primary key)
-- ✓ company_id (uuid, not null)
-- ✓ agent_id (uuid, nullable after superadmin update)
-- ✓ name (text, not null)
-- ✓ email (text, nullable)
-- ✓ phone (text, nullable)
-- ✓ company (text, nullable)
-- ✓ address (text, nullable)
-- ✓ city (text, nullable) ← THIS IS THE MISSING ONE
-- ✓ photo_url (text, nullable)
-- ✓ photo_timestamp (timestamp, nullable)
-- ✓ location_latitude (numeric/double, nullable)
-- ✓ location_longitude (numeric/double, nullable)
-- ✓ location_accuracy (numeric/double, nullable)
-- ✓ location_captured_at (timestamp, nullable)
-- ✓ total_orders (integer, default 0)
-- ✓ total_spent (numeric, default 0)
-- ✓ account_type (text, not null)
-- ✓ category (text, not null)
-- ✓ status (text, not null)
-- ✓ has_forge (boolean, not null, default false)
-- ✓ approval_status (text, not null)
-- ✓ approval_notes (text, nullable)
-- ✓ approval_requested_at (timestamp, nullable)
-- ✓ approved_at (timestamp, nullable)
-- ✓ approved_by (uuid, nullable)
-- ✓ last_order_date (timestamp, nullable)
-- ✓ created_at (timestamp, not null)
-- ✓ updated_at (timestamp, not null)

-- ============================================================================
-- CHECK FOR MISSING COLUMNS
-- ============================================================================

DO $$ 
DECLARE
    missing_columns TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Check for city column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'city'
    ) THEN
        missing_columns := array_append(missing_columns, 'city');
    END IF;

    -- Check for region column (optional, but used in War Room)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'region'
    ) THEN
        missing_columns := array_append(missing_columns, 'region (optional)');
    END IF;

    -- Report results
    IF array_length(missing_columns, 1) > 0 THEN
        RAISE NOTICE 'MISSING COLUMNS: %', array_to_string(missing_columns, ', ');
        RAISE NOTICE 'Run add_city_column_to_clients.sql to fix missing columns';
    ELSE
        RAISE NOTICE 'All required columns exist in the clients table ✓';
    END IF;
END $$;

-- ============================================================================
-- CHECK INDEXES
-- ============================================================================

SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'clients'
ORDER BY indexname;

-- ============================================================================
-- CHECK FOREIGN KEYS
-- ============================================================================

SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    a.attname AS column_name,
    confrelid::regclass AS foreign_table_name,
    af.attname AS foreign_column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE c.conrelid = 'clients'::regclass
    AND c.contype = 'f'
ORDER BY constraint_name;

-- ============================================================================
-- CHECK RLS POLICIES
-- ============================================================================

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual IS NOT NULL AS has_using_clause,
    with_check IS NOT NULL AS has_check_clause
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename = 'clients'
ORDER BY cmd, policyname;

