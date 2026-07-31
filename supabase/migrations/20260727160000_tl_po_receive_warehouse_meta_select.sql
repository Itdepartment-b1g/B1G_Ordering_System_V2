-- Let assigned team leaders resolve warehouse company + location labels on PO Receiving.
-- Nested selects on warehouse_locations / warehouse companies were blocked for team_leader role.

CREATE OR REPLACE FUNCTION public.get_linked_warehouse_company()
RETURNS TABLE (
  id uuid,
  company_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.company_name
  FROM public.companies c
  WHERE c.id = public.get_linked_warehouse_company_id();
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_warehouse_company() TO authenticated;

COMMENT ON FUNCTION public.get_linked_warehouse_company() IS
  'Linked warehouse hub id + company_name for the current tenant, or empty when not linked.';

DROP POLICY IF EXISTS "Warehouse locations: team leader select linked hub" ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: team leader select linked hub"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'team_leader'
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_locations.company_id = public.get_linked_warehouse_company_id()
  );

DROP POLICY IF EXISTS "Companies: team leader select linked warehouse hub" ON public.companies;
CREATE POLICY "Companies: team leader select linked warehouse hub"
  ON public.companies FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'team_leader'
    )
    AND id = public.get_linked_warehouse_company_id()
  );
