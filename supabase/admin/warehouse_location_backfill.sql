-- Backfill warehouse locations + user links
-- Run in Supabase SQL editor as an admin/service role.
--
-- Ensures:
-- 1) Each warehouse company has exactly one MAIN location (if missing, creates it).
-- 2) Each warehouse user has a row in warehouse_location_users (if missing, links to MAIN).

-- 1) Create MAIN location per warehouse company (if missing)
INSERT INTO public.warehouse_locations (company_id, name, is_main, created_by)
SELECT DISTINCT
  p.company_id,
  'Main Warehouse',
  true,
  CAST(NULL AS uuid)
FROM public.profiles p
WHERE p.role = 'warehouse'
  AND p.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.warehouse_locations wl
    WHERE wl.company_id = p.company_id
      AND wl.is_main = true
  );

-- 2) Link any warehouse users without a location to their company MAIN location
INSERT INTO public.warehouse_location_users (location_id, user_id)
SELECT wl.id AS location_id, p.id AS user_id
FROM public.profiles p
JOIN public.warehouse_locations wl
  ON wl.company_id = p.company_id
 AND wl.is_main = true
LEFT JOIN public.warehouse_location_users wlu
  ON wlu.user_id = p.id
WHERE p.role = 'warehouse'
  AND p.company_id IS NOT NULL
  AND wlu.user_id IS NULL;

