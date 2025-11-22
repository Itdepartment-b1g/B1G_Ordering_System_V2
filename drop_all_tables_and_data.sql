-- ============================================================================
-- COMPLETE DATABASE CLEANUP SCRIPT
-- This script will delete ALL tables, data, functions, and related objects
-- Run this in Supabase SQL Editor to completely clean the database
-- ============================================================================

-- WARNING: This will permanently delete ALL data and tables!
-- Make sure you have backups if needed before running this script.

-- ============================================================================
-- STEP 1: Drop all tables (in reverse dependency order to avoid FK errors)
-- ============================================================================

-- Drop tables that have foreign keys first, then parent tables
DROP TABLE IF EXISTS client_order_items CASCADE;
DROP TABLE IF EXISTS client_orders CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS agent_inventory CASCADE;
DROP TABLE IF EXISTS main_inventory CASCADE;
DROP TABLE IF EXISTS inventory_requests CASCADE;
DROP TABLE IF EXISTS remittances_log CASCADE;
DROP TABLE IF EXISTS agent_monthly_targets CASCADE;
DROP TABLE IF EXISTS leader_teams CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS variants CASCADE;
DROP TABLE IF EXISTS brands CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- ============================================================================
-- STEP 2: Drop all custom functions
-- ============================================================================

DROP FUNCTION IF EXISTS get_my_company_id() CASCADE;
DROP FUNCTION IF EXISTS generate_order_number() CASCADE;
DROP FUNCTION IF EXISTS generate_po_number() CASCADE;
DROP FUNCTION IF EXISTS approve_purchase_order(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS allocate_to_agent(UUID, UUID, INTEGER, DECIMAL, UUID) CASCADE;
DROP FUNCTION IF EXISTS create_client_order(UUID, UUID, TIMESTAMP WITH TIME ZONE, JSONB, DECIMAL, DECIMAL, DECIMAL, DECIMAL, TEXT) CASCADE;
DROP FUNCTION IF EXISTS approve_client_order(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS reject_client_order(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_admin_dashboard_stats() CASCADE;
DROP FUNCTION IF EXISTS get_agent_dashboard_stats(UUID) CASCADE;

-- Drop any other custom functions (adjust names if you have more)
-- You can check existing functions with: SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';

-- ============================================================================
-- STEP 3: Drop all sequences (if any were created separately)
-- ============================================================================

-- Sequences are usually dropped automatically with tables, but just in case:
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') 
    LOOP
        EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
    END LOOP;
END $$;

-- ============================================================================
-- STEP 4: Drop all views (if any)
-- ============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') 
    LOOP
        EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE';
    END LOOP;
END $$;

-- ============================================================================
-- STEP 5: Drop all types/enums (if any custom types were created)
-- ============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e') 
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;

-- ============================================================================
-- STEP 6: Drop all triggers (if any were created separately)
-- ============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public') 
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.trigger_name) || ' ON ' || quote_ident(r.event_object_table) || ' CASCADE';
    END LOOP;
END $$;

-- ============================================================================
-- STEP 7: Clean up any remaining objects
-- ============================================================================

-- Drop any remaining policies (should be dropped with tables, but just in case)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- ============================================================================
-- VERIFICATION: Check what's left (optional - uncomment to see remaining objects)
-- ============================================================================

-- Uncomment these to verify everything is deleted:

-- SELECT 'Tables' as object_type, table_name as name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- SELECT 'Functions' as object_type, routine_name as name 
-- FROM information_schema.routines 
-- WHERE routine_schema = 'public';

-- SELECT 'Sequences' as object_type, sequence_name as name 
-- FROM information_schema.sequences 
-- WHERE sequence_schema = 'public';

-- SELECT 'Views' as object_type, table_name as name 
-- FROM information_schema.views 
-- WHERE table_schema = 'public';

-- ============================================================================
-- NOTE: This script does NOT delete:
-- - Supabase Auth users (auth.users table) - managed separately in Supabase Dashboard
-- - Storage buckets and files - managed in Supabase Storage
-- - Extensions (like uuid-ossp) - kept for future use
-- ============================================================================

