-- Allow super_admin and admin to read attendance rows for agents in their company (overview UI).

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
        AND me.status = 'active'::text
        AND agent.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

COMMENT ON POLICY "Agent attendances: tenant admin read company" ON public.agent_attendances IS
  'Company-scoped read for super_admin and admin (same company_id as the agent profile).';
