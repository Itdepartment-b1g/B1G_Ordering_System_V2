-- Return warehouse locations (main + sub) for the current tenant's linked hub.
-- Implemented as SECURITY DEFINER to avoid RLS edge cases when tenant users
-- cannot see all rows needed to derive the hub or locations.

CREATE OR REPLACE FUNCTION public.get_linked_warehouse_locations()
RETURNS TABLE (
  id uuid,
  name text,
  is_main boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wl.id, wl.name, wl.is_main
  FROM public.warehouse_locations wl
  WHERE wl.company_id = public.get_linked_warehouse_company_id()
  ORDER BY wl.is_main DESC, wl.name ASC
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_locations() TO authenticated;

