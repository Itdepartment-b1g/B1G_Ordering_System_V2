-- Report: warehouse users missing a warehouse_location_users link
-- Run in Supabase SQL editor as an admin/service role.

SELECT
  p.id AS user_id,
  p.email,
  p.company_id,
  p.full_name,
  p.created_at
FROM public.profiles p
LEFT JOIN public.warehouse_location_users wlu
  ON wlu.user_id = p.id
WHERE p.role = 'warehouse'
  AND p.company_id IS NOT NULL
  AND wlu.user_id IS NULL
ORDER BY p.created_at DESC;

