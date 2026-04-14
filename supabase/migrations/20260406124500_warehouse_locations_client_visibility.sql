-- Allow tenant users (super_admin/admin) to view warehouse locations for their linked hub

-- warehouse_locations: client company can select locations for its assigned hub
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
    AND EXISTS (
      SELECT 1
      FROM public.warehouse_company_assignments wca
      JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
      WHERE wca.client_company_id = public.get_auth_company_id()
        AND wp.company_id = warehouse_locations.company_id
    )
  );

