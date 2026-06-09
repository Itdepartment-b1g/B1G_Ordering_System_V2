-- Allow executives to read hubs for team leaders in their assigned companies
-- (used for hub labels on the executive inventory board)

DROP POLICY IF EXISTS "Executives can view hubs from assigned companies" ON public.hubs;
CREATE POLICY "Executives can view hubs from assigned companies"
  ON public.hubs FOR SELECT
  USING (
    public.is_executive()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = hubs.created_by
        AND p.company_id = ANY(public.get_my_executive_company_ids())
    )
  );
