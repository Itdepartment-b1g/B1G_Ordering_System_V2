-- ============================================================================
-- FIX IMPORTED ORDERS (V1 → V2): BEFORE FEB 16, 2026
-- ============================================================================
-- Scope: Orders with order_date < '2026-02-16' (v1 imports have no deposit_id).
-- Company: e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13
-- Agent: Titong only (full_name ILIKE '%Titong%')
-- Exclude: order_number containing '0101'
--
-- Run each block one by one (select block, then execute). Check counts and UI
-- at the places indicated below.
-- ============================================================================

-- ============================================================================
-- WHERE TO CHECK (in the app)
-- ============================================================================
-- 1. Remittance tab (orders "to remit"):
--    - Before fix: imported approved orders may appear here (remitted = FALSE).
--    - After fix: they should NOT appear (remitted = TRUE).
--
-- 2. Leader Cash Deposits page:
--    - If any imported orders were included in a remit run, they got deposit_id
--      and show under a deposit. After STEP 2b we set deposit_id = NULL so they
--      no longer show in Cash Deposits.
--
-- 3. Orders list / filters:
--    - Filter by order_date < 2026-02-16, agent = Titong; verify remitted and
--      deposit_id state after running steps.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- DIAGNOSTIC: Titong's profile (use in manual checks)
-- WHERE TO CHECK: Use the id below in any ad‑hoc query on client_orders.
-- ----------------------------------------------------------------------------
SELECT id AS titong_profile_id, full_name
FROM profiles
WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND full_name ILIKE '%Titong%';


-- ----------------------------------------------------------------------------
-- COUNT 1: Total imported orders (before Feb 16, Titong, excl 0101)
-- WHERE TO CHECK: This is the full set of "imports" we care about.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS total_imported_orders_before_feb16
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%');


-- ----------------------------------------------------------------------------
-- COUNT 2: By status, stage, remitted (before Feb 16, Titong, excl 0101)
-- WHERE TO CHECK: See how many are approved vs other, and remitted vs not.
-- ----------------------------------------------------------------------------
SELECT status, stage, remitted, COUNT(*) AS cnt
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
GROUP BY status, stage, remitted
ORDER BY cnt DESC;


-- ----------------------------------------------------------------------------
-- COUNT 3: By deposit_id (before Feb 16, Titong, excl 0101)
-- WHERE TO CHECK: Imports should have no deposit_id; some may have got one if
-- remit was run. After fix we set deposit_id = NULL for this set.
-- ----------------------------------------------------------------------------
SELECT
  CASE WHEN deposit_id IS NULL THEN 'no_deposit' ELSE 'has_deposit' END AS deposit_state,
  COUNT(*) AS cnt
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
GROUP BY (deposit_id IS NULL)
ORDER BY cnt DESC;


-- ----------------------------------------------------------------------------
-- COUNT 4: Orders we will update (approved, not yet remitted)
-- WHERE TO CHECK: This is the number of rows STEP 2a will set remitted = TRUE.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS will_set_remitted_true
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND (o.remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- COUNT 5: Orders that have deposit_id (will set to NULL in STEP 2b)
-- WHERE TO CHECK: These are the ones that currently show in Cash Deposits;
-- after STEP 2b they will not.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS will_clear_deposit_id
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND o.deposit_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- STEP 1: COUNT BEFORE (approved, not remitted – same filter as STEP 2a)
-- WHERE TO CHECK: Record this number; after STEP 2a, COUNT 6 should be 0.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS count_before_remitted_update
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND (o.remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- STEP 2a: UPDATE – set remitted = TRUE (so they don't show in Remittance tab)
-- WHERE TO CHECK: Run once. Check "Rows updated" in result; should match STEP 1.
-- ----------------------------------------------------------------------------
UPDATE client_orders o
SET remitted = TRUE,
    updated_at = COALESCE(o.updated_at, NOW())
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND (o.remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- STEP 2b: UPDATE – set deposit_id = NULL (so they don't show in Cash Deposits)
-- WHERE TO CHECK: Run once. "Rows updated" should match the result of the
-- "COUNT 5" query above (will_clear_deposit_id), not the number 5.
-- ----------------------------------------------------------------------------
UPDATE client_orders o
SET deposit_id = NULL,
    updated_at = COALESCE(o.updated_at, NOW())
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND o.deposit_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- COUNT 6: After STEP 2a – approved orders still not remitted (should be 0)
-- WHERE TO CHECK: Confirms no approved import is left with remitted = FALSE.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS approved_not_remitted_after_step2a
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND (o.remitted IS NOT TRUE);


-- ----------------------------------------------------------------------------
-- COUNT 7: After STEP 2b – approved orders with deposit_id (should be 0)
-- WHERE TO CHECK: Confirms no import in this set is linked to a deposit.
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS approved_with_deposit_after_step2b
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND o.deposit_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- COUNT 8: Final state – approved + remitted, by deposit_id
-- WHERE TO CHECK: All approved imports should be remitted; deposit_id all NULL.
-- ----------------------------------------------------------------------------
SELECT
  CASE WHEN o.deposit_id IS NULL THEN 'no_deposit' ELSE 'has_deposit' END AS deposit_state,
  COUNT(*) AS cnt
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
  AND o.remitted = TRUE
GROUP BY (o.deposit_id IS NULL);


-- ----------------------------------------------------------------------------
-- SAMPLE: Few rows after fix (for manual spot-check)
-- WHERE TO CHECK: Open a few order_ids in the app; remitted=TRUE, deposit_id=NULL.
-- ----------------------------------------------------------------------------
SELECT id, order_number, order_date, status, stage, remitted, deposit_id, updated_at
FROM client_orders o
WHERE o.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND o.agent_id IN (
    SELECT id FROM profiles
    WHERE company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
      AND full_name ILIKE '%Titong%'
  )
  AND o.order_date < '2026-02-16'
  AND (o.order_number IS NULL OR o.order_number NOT LIKE '%0101%')
  AND (o.status = 'approved' OR o.stage = 'admin_approved')
ORDER BY o.order_date DESC, o.id
LIMIT 10;
