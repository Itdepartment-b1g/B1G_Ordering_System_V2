-- Store current team leader assignment on hubs (nullable = unassigned).
-- Replaces public.team_leader_hubs; backfill then drop junction table.

-- ---------------------------------------------------------------------------
-- 1) Column + FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.hubs
  ADD COLUMN IF NOT EXISTS assigned_team_leader_id uuid NULL
    CONSTRAINT hubs_assigned_team_leader_id_fkey
    REFERENCES public.profiles (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.hubs.assigned_team_leader_id IS
  'Team leader assigned to this hub; NULL if unassigned. Must be role team_leader and same company as assigning super_admin.';

CREATE INDEX IF NOT EXISTS idx_hubs_assigned_team_leader_id
  ON public.hubs (assigned_team_leader_id)
  WHERE assigned_team_leader_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Backfill from legacy junction table (if present)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.team_leader_hubs') IS NOT NULL THEN
    UPDATE public.hubs h
    SET assigned_team_leader_id = t.team_leader_id
    FROM public.team_leader_hubs t
    WHERE t.hub_id = h.id
      AND (h.assigned_team_leader_id IS DISTINCT FROM t.team_leader_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Validation (replaces team_leader_hubs RLS WITH CHECK semantics)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hubs_validate_assigned_team_leader_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me_company uuid;
BEGIN
  IF NEW.assigned_team_leader_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.company_id INTO me_company
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles tl
    WHERE tl.id = NEW.assigned_team_leader_id
      AND tl.role = 'team_leader'
      AND tl.company_id IS NOT DISTINCT FROM me_company
  ) THEN
    RAISE EXCEPTION 'assigned_team_leader_id must reference an active-scope team_leader in your company'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hubs_validate_assigned_team_leader ON public.hubs;
CREATE TRIGGER trg_hubs_validate_assigned_team_leader
  BEFORE INSERT OR UPDATE OF assigned_team_leader_id
  ON public.hubs
  FOR EACH ROW
  EXECUTE FUNCTION public.hubs_validate_assigned_team_leader_fn();

-- ---------------------------------------------------------------------------
-- 4) Drop legacy junction table
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.team_leader_hubs CASCADE;
