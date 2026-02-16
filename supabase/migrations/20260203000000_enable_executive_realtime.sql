-- ============================================================================
-- ENABLE REAL-TIME LIVE TRACKING FOR EXECUTIVE DASHBOARD
-- ============================================================================
-- This migration enables Supabase Realtime on tables that executives need to
-- monitor. When orders, sales, or transactions occur, the dashboard updates
-- automatically without page refresh!
-- ============================================================================

-- Enable Realtime publication for key executive tables
-- These tables will now send live updates to subscribed clients

-- Helper function to safely add table to publication (idempotent)
DO $$ 
DECLARE
    tables_to_add text[] := ARRAY[
        'client_orders',
        'client_order_items', 
        'financial_transactions',
        'clients',
        'executive_company_assignments'
    ];
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY tables_to_add
    LOOP
        -- Check if table is already in the publication
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND tablename = table_name
        ) THEN
            -- Add table to publication
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
            RAISE NOTICE 'Added table % to supabase_realtime publication', table_name;
        ELSE
            RAISE NOTICE 'Table % already in supabase_realtime publication', table_name;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. After running this migration, executives will see live updates
-- 2. No page refresh needed - data updates automatically
-- 3. Only affects executives - other users unchanged
-- 4. Console will show "🔴 [LIVE]" messages when updates occur
-- ============================================================================
