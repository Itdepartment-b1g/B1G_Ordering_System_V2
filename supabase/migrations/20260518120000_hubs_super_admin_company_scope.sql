-- Hub management: super_admin may only see and mutate hubs created in their own company
-- (join profiles on hubs.created_by vs auth.uid() company_id). Other policies unchanged.

DROP POLICY IF EXISTS "Hubs: super_admin read" ON public.hubs;
CREATE POLICY "Hubs: super_admin read"
  ON public.hubs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles creator ON creator.id = hubs.created_by
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'::text
        AND creator.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Hubs: super_admin insert" ON public.hubs;
CREATE POLICY "Hubs: super_admin insert"
  ON public.hubs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'::text
        AND me.company_id IS NOT NULL
    )
    -- created_by is set to auth.uid() by BEFORE INSERT trigger before RLS WITH CHECK runs
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Hubs: super_admin update" ON public.hubs;
CREATE POLICY "Hubs: super_admin update"
  ON public.hubs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles creator ON creator.id = hubs.created_by
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'::text
        AND creator.company_id IS NOT DISTINCT FROM me.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles creator ON creator.id = hubs.created_by
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'::text
        AND creator.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Hubs: super_admin delete" ON public.hubs;
CREATE POLICY "Hubs: super_admin delete"
  ON public.hubs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles creator ON creator.id = hubs.created_by
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'::text
        AND creator.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

COMMENT ON POLICY "Hubs: super_admin read" ON public.hubs IS
  'Super admins only see hubs whose creating profile shares their company_id.';
