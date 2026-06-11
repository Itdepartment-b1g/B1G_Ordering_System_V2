-- Allow super_admin and admin to read time-in photos for agents in their company (overview UI).

DROP POLICY IF EXISTS "Agent attendance photos: tenant admin read company" ON storage.objects;
CREATE POLICY "Agent attendance photos: tenant admin read company"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'agent-attendance-photos'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles agent ON agent.id::text = (storage.foldername(name))[1]
      WHERE me.id = auth.uid()
        AND me.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
        AND me.status = 'active'::text
        AND agent.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

COMMENT ON POLICY "Agent attendance photos: tenant admin read company" ON storage.objects IS
  'Company-scoped read for super_admin and admin on agent-attendance-photos paths.';
