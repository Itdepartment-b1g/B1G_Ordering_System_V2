-- ============================================================================
-- ENABLE SUPABASE REALTIME FOR ALL TABLES
-- ============================================================================
-- This script enables realtime subscriptions (CRUD listening) for ALL tables
-- in the B1G Ordering System. Run this in your Supabase SQL Editor.
--
-- ⚠️ IMPORTANT: This is REQUIRED for real-time updates to work!
-- Without this, users will need to manually refresh pages.
--
-- This script is safe to run multiple times - it will skip tables that are
-- already in the publication.
-- ============================================================================

DO $$
BEGIN
  -- Enable realtime for agent_inventory (CRITICAL - most used table)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_inventory'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_inventory;
    RAISE NOTICE 'Added agent_inventory to realtime';
  ELSE
    RAISE NOTICE 'agent_inventory already in realtime';
  END IF;

  -- Enable realtime for client orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'client_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE client_orders;
    RAISE NOTICE 'Added client_orders to realtime';
  ELSE
    RAISE NOTICE 'client_orders already in realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'client_order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE client_order_items;
    RAISE NOTICE 'Added client_order_items to realtime';
  ELSE
    RAISE NOTICE 'client_order_items already in realtime';
  END IF;

  -- Enable realtime for main inventory
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'main_inventory'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE main_inventory;
    RAISE NOTICE 'Added main_inventory to realtime';
  ELSE
    RAISE NOTICE 'main_inventory already in realtime';
  END IF;

  -- Enable realtime for brands
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'brands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE brands;
    RAISE NOTICE 'Added brands to realtime';
  ELSE
    RAISE NOTICE 'brands already in realtime';
  END IF;

  -- Enable realtime for variants
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'variants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE variants;
    RAISE NOTICE 'Added variants to realtime';
  ELSE
    RAISE NOTICE 'variants already in realtime';
  END IF;

  -- Enable realtime for clients
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
    RAISE NOTICE 'Added clients to realtime';
  ELSE
    RAISE NOTICE 'clients already in realtime';
  END IF;

  -- Enable realtime for team management
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'leader_teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE leader_teams;
    RAISE NOTICE 'Added leader_teams to realtime';
  ELSE
    RAISE NOTICE 'leader_teams already in realtime';
  END IF;

  -- Enable realtime for stock requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'stock_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_requests;
    RAISE NOTICE 'Added stock_requests to realtime';
  ELSE
    RAISE NOTICE 'stock_requests already in realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'stock_request_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_request_items;
    RAISE NOTICE 'Added stock_request_items to realtime';
  ELSE
    RAISE NOTICE 'stock_request_items already in realtime';
  END IF;

  -- Enable realtime for remittances
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'remittances_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE remittances_log;
    RAISE NOTICE 'Added remittances_log to realtime';
  ELSE
    RAISE NOTICE 'remittances_log already in realtime';
  END IF;

  -- Enable realtime for cash deposits
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'cash_deposits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cash_deposits;
    RAISE NOTICE 'Added cash_deposits to realtime';
  ELSE
    RAISE NOTICE 'cash_deposits already in realtime';
  END IF;

  -- Enable realtime for transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'inventory_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_transactions;
    RAISE NOTICE 'Added inventory_transactions to realtime';
  ELSE
    RAISE NOTICE 'inventory_transactions already in realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'financial_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE financial_transactions;
    RAISE NOTICE 'Added financial_transactions to realtime';
  ELSE
    RAISE NOTICE 'financial_transactions already in realtime';
  END IF;

  -- Enable realtime for notifications
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    RAISE NOTICE 'Added notifications to realtime';
  ELSE
    RAISE NOTICE 'notifications already in realtime';
  END IF;

  -- Enable realtime for events
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
    RAISE NOTICE 'Added events to realtime';
  ELSE
    RAISE NOTICE 'events already in realtime';
  END IF;

  -- Enable realtime for profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE 'Added profiles to realtime';
  ELSE
    RAISE NOTICE 'profiles already in realtime';
  END IF;

  -- Enable realtime for companies
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'companies'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE companies;
    RAISE NOTICE 'Added companies to realtime';
  ELSE
    RAISE NOTICE 'companies already in realtime';
  END IF;

  -- Enable realtime for suppliers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'suppliers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE suppliers;
    RAISE NOTICE 'Added suppliers to realtime';
  ELSE
    RAISE NOTICE 'suppliers already in realtime';
  END IF;

  -- Enable realtime for purchase orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
    RAISE NOTICE 'Added purchase_orders to realtime';
  ELSE
    RAISE NOTICE 'purchase_orders already in realtime';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE purchase_order_items;
    RAISE NOTICE 'Added purchase_order_items to realtime';
  ELSE
    RAISE NOTICE 'purchase_order_items already in realtime';
  END IF;

  -- Enable realtime for variant_types
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'variant_types'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE variant_types;
    RAISE NOTICE 'Added variant_types to realtime';
  ELSE
    RAISE NOTICE 'variant_types already in realtime';
  END IF;

END $$;

-- ============================================================================
-- VERIFY REALTIME IS ENABLED
-- ============================================================================
-- Run this query to see all tables with realtime enabled:

SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
ORDER BY tablename;

-- ============================================================================
-- EXPECTED OUTPUT (ALL 24 TABLES)
-- ============================================================================
-- You should see ALL these tables:
--   ✅ agent_inventory ← CRITICAL
--   ✅ brands
--   ✅ cash_deposits
--   ✅ client_order_items
--   ✅ client_orders ← CRITICAL
--   ✅ clients
--   ✅ companies
--   ✅ events
--   ✅ financial_transactions
--   ✅ inventory_transactions
--   ✅ leader_teams ← CRITICAL
--   ✅ main_inventory ← CRITICAL
--   ✅ notifications
--   ✅ profiles
--   ✅ purchase_order_items
--   ✅ purchase_orders
--   ✅ remittances_log
--   ✅ stock_request_items
--   ✅ stock_requests
--   ✅ suppliers
--   ✅ variant_types
--   ✅ variants
--
-- If any are missing, check the NOTICE messages above or run the script again.
-- ============================================================================

-- ============================================================================
-- SUCCESS INDICATORS
-- ============================================================================
-- After running this script, you should see NOTICE messages like:
--   NOTICE: Added agent_inventory to realtime
--   NOTICE: Added client_orders to realtime
--   NOTICE: Added main_inventory to realtime
--   ... etc ...
--
-- Or if tables were already added:
--   NOTICE: agent_inventory already in realtime
--   ... etc ...
--
-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================
-- 
-- Issue: Permission denied error
-- Solution: Make sure you're running this as a superuser/database owner
--
-- Issue: Tables still not in the verification query
-- Solution: 
--   1. Check for error messages in the SQL editor
--   2. Make sure tables exist (run: SELECT tablename FROM pg_tables WHERE schemaname='public')
--   3. Re-run the script
--
-- Issue: Realtime still not working after running this
-- Solution: 
--   1. Wait 1-2 minutes for changes to propagate
--   2. Refresh your browser (hard refresh: Cmd/Ctrl + Shift + R)
--   3. Check browser console for these messages:
--      ✅ "Subscribed to agent_inventory updates"
--      ✅ "Real-time subscription active"
--   4. Test by opening two windows and making changes
--
-- Issue: Getting "CHANNEL_ERROR" in browser console
-- Solution:
--   1. Check your Supabase project plan (Free tier has limits)
--   2. Verify database is not paused
--   3. Check https://status.supabase.com/ for outages
--   4. Make sure you're authenticated in the browser
--
-- Issue: Some tables show "already in realtime" but still not working
-- Solution:
--   1. The subscription might be on the wrong schema
--   2. Check RLS policies on the tables
--   3. Verify your auth token has proper permissions
--
-- ============================================================================

