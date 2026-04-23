-- ============================================================================
-- ONE-TIME DATA CORRECTION: Reconcile allocated_stock and stock using
-- ground truth from agent_inventory
-- ============================================================================
--
-- The previous approach (subtracting all-time approved order quantities) was
-- incorrect because it did not account for restocking. This script instead
-- computes correct values from two ground-truth sources:
--
--   allocated_stock = SUM(agent_inventory.stock) per variant per company
--     (what agents/leaders actually hold right now)
--
--   stock (Total Stock) = Available + real allocated
--     where Available = current stock - current allocated_stock
--     (the warehouse portion, which was never affected by the bug)
--
-- This preserves the Available amount and only corrects the allocated portion.
--
-- IMPORTANT: Run STEP 1 first to preview changes. Only run STEP 2 after
-- verifying the preview looks correct. Run STEP 3 only if needed.
-- ============================================================================


-- ============================================================================
-- STEP 1: PREVIEW - Run this SELECT to see current vs corrected values
-- ============================================================================
-- Copy everything between the dash lines below (not the comment markers)
-- and paste into Supabase SQL Editor to run.

-- vvvvvv COPY FROM HERE vvvvvv

WITH real_allocated AS (
  SELECT variant_id, company_id, SUM(stock) AS agent_stock
  FROM agent_inventory
  WHERE stock > 0
  GROUP BY variant_id, company_id
)
SELECT
  v.name AS variant_name,
  mi.stock AS current_total_stock,
  mi.allocated_stock AS current_allocated,
  (mi.stock - COALESCE(mi.allocated_stock, 0)) AS current_available,
  COALESCE(ra.agent_stock, 0) AS real_allocated,
  (mi.stock - COALESCE(mi.allocated_stock, 0)) + COALESCE(ra.agent_stock, 0) AS correct_total_stock,
  COALESCE(ra.agent_stock, 0) AS correct_allocated
FROM main_inventory mi
JOIN variants v ON v.id = mi.variant_id
LEFT JOIN real_allocated ra ON ra.variant_id = mi.variant_id AND ra.company_id = mi.company_id
WHERE COALESCE(mi.allocated_stock, 0) != COALESCE(ra.agent_stock, 0)
ORDER BY mi.company_id, v.name;

-- ^^^^^^ COPY TO HERE ^^^^^^


-- ============================================================================
-- STEP 2: APPLY - Run this UPDATE after verifying the preview above
-- ============================================================================
-- This updates variants that have agent_inventory records.
-- It sets allocated_stock to the real value from agent_inventory,
-- and adjusts stock so that Available (stock - allocated_stock) is preserved.
--
-- Copy everything between the dash lines below and paste into Supabase SQL
-- Editor to run.

-- vvvvvv COPY FROM HERE vvvvvv

/*
WITH real_allocated AS (
  SELECT variant_id, company_id, SUM(stock) AS agent_stock
  FROM agent_inventory
  WHERE stock > 0
  GROUP BY variant_id, company_id
)
UPDATE main_inventory mi
SET
  stock = (mi.stock - COALESCE(mi.allocated_stock, 0)) + COALESCE(ra.agent_stock, 0),
  allocated_stock = COALESCE(ra.agent_stock, 0),
  updated_at = NOW()
FROM real_allocated ra
WHERE mi.variant_id = ra.variant_id
  AND mi.company_id = ra.company_id
  AND COALESCE(mi.allocated_stock, 0) != COALESCE(ra.agent_stock, 0);
*/

-- ^^^^^^ COPY TO HERE ^^^^^^


-- ============================================================================
-- STEP 3: CLEANUP - Run this only if the preview in STEP 1 showed variants
-- with allocated_stock > 0 but NO agent_inventory records (all stock sold).
-- This resets their allocated_stock to 0 and adjusts stock to equal Available.
-- ============================================================================

-- vvvvvv COPY FROM HERE vvvvvv

/*
UPDATE main_inventory mi
SET
  stock = mi.stock - COALESCE(mi.allocated_stock, 0),
  allocated_stock = 0,
  updated_at = NOW()
WHERE COALESCE(mi.allocated_stock, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM agent_inventory ai
    WHERE ai.variant_id = mi.variant_id
      AND ai.company_id = mi.company_id
      AND ai.stock > 0
  );
*/

-- ^^^^^^ COPY TO HERE ^^^^^^
