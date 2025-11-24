-- ============================================================================
-- DISABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================================
-- ⚠️ WARNING: This will make ALL data in these tables accessible to ANYONE
-- who has access to the Supabase project (authenticated or anonymous, 
-- depending on your other settings).
--
-- Use this ONLY for debugging or if you are handling all security 
-- in your application logic (backend).
-- ============================================================================

-- Core Tables
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;

-- Inventory & Products
ALTER TABLE brands DISABLE ROW LEVEL SECURITY;
ALTER TABLE variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE main_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions DISABLE ROW LEVEL SECURITY;

-- Orders & Clients
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE remittances_log DISABLE ROW LEVEL SECURITY;

-- Purchasing
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;

-- Finance & System
ALTER TABLE financial_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Try to disable on other potential tables if they exist (ignoring errors if they don't)
DO $$ 
BEGIN 
    BEGIN ALTER TABLE leader_teams DISABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN ALTER TABLE stock_requests DISABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END;
    BEGIN ALTER TABLE stock_request_items DISABLE ROW LEVEL SECURITY; EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- To verify, run:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- 'rowsecurity' should be false for all tables.
