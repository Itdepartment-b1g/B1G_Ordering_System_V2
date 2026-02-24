-- Set allocated_stock = 0 for CHILLAX INFINITE (company e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13).
-- Available (shown as total_stock - allocated_stock) will then equal total_stock (e.g. 0 | 275).

UPDATE main_inventory mi
SET
  allocated_stock = 0,
  updated_at = NOW()
FROM variants v
JOIN brands b ON b.id = v.brand_id
WHERE mi.variant_id = v.id
  AND mi.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
  AND b.name ILIKE '%CHILLAX INFINITE%';

-- Check how many rows were updated (run separately if you want to verify)
-- SELECT COUNT(*) FROM main_inventory mi
-- JOIN variants v ON v.id = mi.variant_id
-- JOIN brands b ON b.id = v.brand_id
-- WHERE mi.company_id = 'e1d4a1f8-bab8-41b9-b8c8-de7e9a910b13'
--   AND b.name ILIKE '%CHILLAX INFINITE%';
