-- Hubs: physical / logical hub locations with geocoordinates (super_admin only via RLS).
-- BEFORE INSERT trigger stamps created_by (session user), created_at, and updated_at server-side.

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hubs (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  hub_name text NOT NULL,
  hub_location text,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  longitude double precision NOT NULL,
  latitude double precision NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hubs IS 'Hub locations; audit columns set on insert via hubs_before_insert_fn.';
COMMENT ON COLUMN public.hubs.hub_location IS 'Free-text address or geocoder label for the hub.';

CREATE INDEX IF NOT EXISTS idx_hubs_created_by ON public.hubs (created_by);
CREATE INDEX IF NOT EXISTS idx_hubs_created_at ON public.hubs (created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) BEFORE INSERT: persist created_by, created_at, updated_at from server
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hubs_before_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always use the authenticated user as creator (profile id = auth.users id).
  NEW.created_by := auth.uid();

  -- Single source of truth for row timestamps on create.
  NEW.created_at := now();
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hubs_before_insert ON public.hubs;
CREATE TRIGGER trg_hubs_before_insert
  BEFORE INSERT ON public.hubs
  FOR EACH ROW
  EXECUTE FUNCTION public.hubs_before_insert_fn();

-- ---------------------------------------------------------------------------
-- 3) updated_at on row updates
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_hubs_updated_at ON public.hubs;
CREATE TRIGGER update_hubs_updated_at
  BEFORE UPDATE ON public.hubs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hubs: super_admin read" ON public.hubs;
DROP POLICY IF EXISTS "Hubs: super_admin and system_administrator read" ON public.hubs;
CREATE POLICY "Hubs: super_admin read"
  ON public.hubs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Hubs: super_admin insert" ON public.hubs;
DROP POLICY IF EXISTS "Hubs: super_admin and system_administrator insert" ON public.hubs;
CREATE POLICY "Hubs: super_admin insert"
  ON public.hubs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Hubs: super_admin update" ON public.hubs;
DROP POLICY IF EXISTS "Hubs: super_admin and system_administrator update" ON public.hubs;
CREATE POLICY "Hubs: super_admin update"
  ON public.hubs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Hubs: super_admin delete" ON public.hubs;
DROP POLICY IF EXISTS "Hubs: super_admin and system_administrator delete" ON public.hubs;
CREATE POLICY "Hubs: super_admin delete"
  ON public.hubs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hubs TO authenticated;
