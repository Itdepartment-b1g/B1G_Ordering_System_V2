-- ============================================================================
-- FIX MISSING COMPANY_ID ON CLIENT ORDERS AND ITEMS
-- ============================================================================
-- This script fixes issues where client_orders or client_order_items are missing
-- the company_id, causing them to be hidden by RLS policies.
-- ============================================================================

-- 1. Fix client_orders missing company_id
-- Logic: Update client_orders using the agent's profile company_id
UPDATE client_orders co
SET company_id = p.company_id
FROM profiles p
WHERE co.company_id IS NULL
  AND co.agent_id = p.id;

-- 2. Fix client_order_items missing company_id
-- Logic: Update client_order_items using the parent order's company_id
UPDATE client_order_items coi
SET company_id = co.company_id
FROM client_orders co
WHERE coi.company_id IS NULL
  AND coi.order_id = co.id;

-- 3. Verify the fix
SELECT 
    'client_orders' as table_name,
    COUNT(*) as total_records,
    COUNT(company_id) as records_with_company_id,
    COUNT(*) - COUNT(company_id) as missing_company_id
FROM client_orders
UNION ALL
SELECT 
    'client_order_items' as table_name,
    COUNT(*) as total_records,
    COUNT(company_id) as records_with_company_id,
    COUNT(*) - COUNT(company_id) as missing_company_id
FROM client_order_items;

-- 4. Optional: Check for any remaining orphaned records (no matching agent/order)
-- These might need manual investigation if the count is > 0
SELECT 'Orphaned Orders (No Agent)' as issue, COUNT(*) as count
FROM client_orders 
WHERE company_id IS NULL;

SELECT 'Orphaned Items (No Order)' as issue, COUNT(*) as count
FROM client_order_items 
WHERE company_id IS NULL;
