-- Junction: super admin assigns a hub to one team leader (UNIQUE hub_id).
-- Hub name and coordinates always come from public.hubs via hub_id.

DROP TRIGGER IF EXISTS trg_hubs_refresh_team_leader_hubs ON public.hubs;

DROP FUNCTION IF EXISTS public.team_leader_hubs_refresh_from_hub_on_hub_update_fn() CASCADE;
DROP FUNCTION IF EXISTS public.team_leader_hubs_denorm_from_hub_fn() CASCADE;

CREATE TABLE IF NOT EXISTS public.team_leader_hubs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  team_leader_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  hub_id uuid NOT NULL REFERENCES public.hubs (id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_leader_hubs_hub_id_key UNIQUE (hub_id)
);

-- Upgrade from older migration that added denormalized columns.
ALTER TABLE public.team_leader_hubs DROP COLUMN IF EXISTS hub_name;
ALTER TABLE public.team_leader_hubs DROP COLUMN IF EXISTS long_hub;
ALTER TABLE public.team_leader_hubs DROP COLUMN IF EXISTS lat_hub;

DROP TRIGGER IF EXISTS trg_team_leader_hubs_denorm_from_hub ON public.team_leader_hubs;

COMMENT ON TABLE public.team_leader_hubs IS 'Team leader ↔ hub assignment; join hubs for name and coordinates.';

CREATE INDEX IF NOT EXISTS idx_team_leader_hubs_team_leader_id
  ON public.team_leader_hubs (team_leader_id);

DROP TRIGGER IF EXISTS update_team_leader_hubs_updated_at ON public.team_leader_hubs;
CREATE TRIGGER update_team_leader_hubs_updated_at
  BEFORE UPDATE ON public.team_leader_hubs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_leader_hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team leader hubs: super_admin read" ON public.team_leader_hubs;
CREATE POLICY "Team leader hubs: super_admin read"
  ON public.team_leader_hubs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles tl
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE tl.id = team_leader_hubs.team_leader_id
        AND tl.role = 'team_leader'
        AND tl.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Team leader hubs: super_admin insert" ON public.team_leader_hubs;
CREATE POLICY "Team leader hubs: super_admin insert"
  ON public.team_leader_hubs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles tl
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE tl.id = team_leader_id
        AND tl.role = 'team_leader'
        AND tl.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Team leader hubs: super_admin update" ON public.team_leader_hubs;
CREATE POLICY "Team leader hubs: super_admin update"
  ON public.team_leader_hubs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles tl
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE tl.id = team_leader_hubs.team_leader_id
        AND tl.role = 'team_leader'
        AND tl.company_id IS NOT DISTINCT FROM me.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles tl
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE tl.id = team_leader_id
        AND tl.role = 'team_leader'
        AND tl.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Team leader hubs: super_admin delete" ON public.team_leader_hubs;
CREATE POLICY "Team leader hubs: super_admin delete"
  ON public.team_leader_hubs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'super_admin'
    )
    AND EXISTS (
      SELECT 1
      FROM public.profiles tl
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE tl.id = team_leader_hubs.team_leader_id
        AND tl.role = 'team_leader'
        AND tl.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_leader_hubs TO authenticated;
