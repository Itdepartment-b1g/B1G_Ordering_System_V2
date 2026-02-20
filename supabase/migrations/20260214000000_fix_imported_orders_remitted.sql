-- ============================================================================
-- FIX IMPORTED ORDERS: SET REMITTED = TRUE FOR ALREADY-APPROVED ORDERS
-- ============================================================================
-- Problem:
--   Import process sets status/stage from CSV (e.g. 'approved', 'admin_approved')
--   but remitted is not in the import payload, so it defaults to FALSE.
-- Solution:
--   Mark as remitted any order that is already in a final approved state.
-- Run each section below one by one (select block, then execute).
-- This run: company e1d4a1f8, agent = Titong only, EXCEPT order 0101, date = 02/16/2026.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DIAGNOSTIC: If STEP 1 returns 0, run this to see what data exists.
-- Scope: company e1d4a1f8, agent Titong only, excluding order 0101, order_date = 02/16/2026.
-- ----------------------------------------------------------------------------
-- Titong's profile id (use in checks):
SELECT id, full_name FROM profiles
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND full_name ILIKE '%Titong%';

-- Total orders for Titong in this company, date 02/16/2026 (excluding order 0101):
SELECT COUNT(*) AS total_titong_orders_20260216_excl_0101
FROM client_orders
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND agent_id IN (SELECT id FROM profiles WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13' AND full_name ILIKE '%Titong%')
  AND order_date = '2026-02-16'
  AND (order_number IS NULL OR order_number NOT LIKE '%0101%');

-- Distinct status, stage, remitted for Titong, 02/16/2026 (excluding 0101):
SELECT status, stage, remitted, COUNT(*) AS cnt
FROM client_orders
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND agent_id IN (SELECT id FROM profiles WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13' AND full_name ILIKE '%Titong%')
  AND order_date = '2026-02-16'
  AND (order_number IS NULL OR order_number NOT LIKE '%0101%')
GROUP BY status, stage, remitted
ORDER BY cnt DESC;


-- ----------------------------------------------------------------------------
-- STEP 1: COUNT BEFORE (Titong only, 02/16/2026, excluding order 0101)
-- Run this first to see the count, then run STEP 2, then STEP 3.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS count_before
FROM client_orders
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND agent_id IN (SELECT id FROM profiles WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13' AND full_name ILIKE '%Titong%')
  AND order_date = '2026-02-16'
  AND (order_number IS NULL OR order_number NOT LIKE '%0101%')
  AND (status = 'approved' OR stage = 'admin_approved')
  AND (remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- STEP 2: UPDATE (Titong only, 02/16/2026, exclude order 0101 – other users unaffected)
-- Run after STEP 1. Check row count in result.
-- ----------------------------------------------------------------------------
UPDATE client_orders
SET remitted = TRUE,
    updated_at = COALESCE(updated_at, NOW())
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND agent_id IN (SELECT id FROM profiles WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13' AND full_name ILIKE '%Titong%')
  AND order_date = '2026-02-16'
  AND (order_number IS NULL OR order_number NOT LIKE '%0101%')
  AND (status = 'approved' OR stage = 'admin_approved')
  AND (remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- STEP 3: COUNT AFTER (Titong, 02/16/2026, approved + remitted, excluding 0101)
-- Run after STEP 2 to verify.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS count_after
FROM client_orders
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND agent_id IN (SELECT id FROM profiles WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13' AND full_name ILIKE '%Titong%')
  AND order_date = '2026-02-16'
  AND (order_number IS NULL OR order_number NOT LIKE '%0101%')
  AND (status = 'approved' OR stage = 'admin_approved')
  AND remitted = TRUE;
