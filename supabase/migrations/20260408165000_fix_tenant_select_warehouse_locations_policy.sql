-- Fix tenant ability to SELECT linked hub warehouse_locations.
-- Previous policy joined to profiles wp (warehouse_user), which can be blocked by RLS and cause empty results.
-- Use SECURITY DEFINER helper get_linked_warehouse_company_id() instead.

DROP POLICY IF EXISTS "Warehouse locations: tenant select linked hub" ON public.warehouse_locations;
CREATE POLICY "Warehouse locations: tenant select linked hub"
  ON public.warehouse_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
    )
    AND public.get_linked_warehouse_company_id() IS NOT NULL
    AND warehouse_locations.company_id = public.get_linked_warehouse_company_id()
  );

