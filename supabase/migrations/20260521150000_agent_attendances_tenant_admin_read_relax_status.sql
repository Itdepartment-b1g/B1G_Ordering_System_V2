-- Tenant admin attendance read: do not require me.status = 'active' (aligns with other
-- company-scoped policies; inactive accounts typically cannot authenticate anyway).

DROP POLICY IF EXISTS "Agent attendances: tenant admin read company" ON public.agent_attendances;
CREATE POLICY "Agent attendances: tenant admin read company"
  ON public.agent_attendances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      INNER JOIN public.profiles agent ON agent.id = agent_attendances.user_id
      WHERE me.id = auth.uid()
        AND me.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
        AND agent.company_id IS NOT DISTINCT FROM me.company_id
    )
  );
