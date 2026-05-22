-- Allow team leaders to read hub rows where they are the assigned leader (view-only use case, e.g. My Team).

DROP POLICY IF EXISTS "Hubs: team_leader read assigned hub" ON public.hubs;
CREATE POLICY "Hubs: team_leader read assigned hub"
  ON public.hubs
  FOR SELECT
  USING (
    assigned_team_leader_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'team_leader'
        AND p.status = 'active'
    )
  );
