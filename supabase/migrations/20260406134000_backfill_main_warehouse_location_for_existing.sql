-- Backfill: ensure every warehouse company has a MAIN location
-- and every warehouse user is linked to a location (prefer MAIN if missing).

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
    SELECT 1 FROM public.warehouse_locations wl
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

