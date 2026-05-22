-- Agent attendance: time in/out with hub geofence; end-of-day absent via SQL function (schedule externally).

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_attendances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  hub_id uuid REFERENCES public.hubs (id) ON DELETE SET NULL,
  team_leader_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  photo text NOT NULL DEFAULT '',
  address text,
  longitude double precision,
  latitude double precision,
  time_in timestamptz,
  time_out timestamptz,
  status text NOT NULL,
  note text,
  business_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_attendances_status_check CHECK (status = ANY (ARRAY['present'::text, 'absent'::text])),
  CONSTRAINT agent_attendances_present_shape CHECK (
    status <> 'present'::text
    OR (
      time_in IS NOT NULL
      AND hub_id IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude IS NOT NULL
      AND length(trim(photo)) > 0
    )
  ),
  CONSTRAINT agent_attendances_absent_shape CHECK (
    status <> 'absent'::text
    OR (time_in IS NULL AND time_out IS NULL)
  )
);

COMMENT ON TABLE public.agent_attendances IS 'Daily agent attendance; business_date is calendar day (Asia/Manila) for uniqueness.';
COMMENT ON COLUMN public.agent_attendances.photo IS 'Storage object path or URL for time-in proof; empty for system absent rows.';
COMMENT ON COLUMN public.agent_attendances.team_leader_id IS 'Hub assigned_team_leader_id at time-in; optional for absent without hub.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_attendances_user_business_date
  ON public.agent_attendances (user_id, business_date);

CREATE INDEX IF NOT EXISTS idx_agent_attendances_hub_id ON public.agent_attendances (hub_id);
CREATE INDEX IF NOT EXISTS idx_agent_attendances_team_leader_id ON public.agent_attendances (team_leader_id);
CREATE INDEX IF NOT EXISTS idx_agent_attendances_business_date ON public.agent_attendances (business_date DESC);

-- ---------------------------------------------------------------------------
-- 2) BEFORE INSERT: business_date (present), team_leader_id from hub
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_attendances_before_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'present'::text THEN
    IF NEW.time_in IS NULL THEN
      RAISE EXCEPTION 'time_in is required for present attendance';
    END IF;
    IF NEW.business_date IS NULL THEN
      NEW.business_date := (NEW.time_in AT TIME ZONE 'Asia/Manila')::date;
    END IF;
    IF NEW.hub_id IS NOT NULL THEN
      SELECT h.assigned_team_leader_id INTO NEW.team_leader_id
      FROM public.hubs h
      WHERE h.id = NEW.hub_id;
    END IF;
  ELSIF NEW.status = 'absent'::text THEN
    IF NEW.business_date IS NULL THEN
      RAISE EXCEPTION 'business_date is required for absent attendance';
    END IF;
    NEW.photo := coalesce(nullif(trim(NEW.photo), ''), '');
    NEW.time_in := NULL;
    NEW.time_out := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_attendances_before_insert ON public.agent_attendances;
CREATE TRIGGER trg_agent_attendances_before_insert
  BEFORE INSERT ON public.agent_attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_attendances_before_insert_fn();

-- ---------------------------------------------------------------------------
-- 3) BEFORE UPDATE: mobile_sales may only set time_out (and timestamps)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_attendances_before_update_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me_role text;
BEGIN
  SELECT p.role INTO me_role FROM public.profiles p WHERE p.id = auth.uid();

  IF me_role = 'mobile_sales'::text AND OLD.user_id = auth.uid() THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.hub_id IS DISTINCT FROM OLD.hub_id
      OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
      OR NEW.photo IS DISTINCT FROM OLD.photo
      OR NEW.address IS DISTINCT FROM OLD.address
      OR NEW.longitude IS DISTINCT FROM OLD.longitude
      OR NEW.latitude IS DISTINCT FROM OLD.latitude
      OR NEW.time_in IS DISTINCT FROM OLD.time_in
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.business_date IS DISTINCT FROM OLD.business_date
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Agents may only update time_out on attendance';
    END IF;
    IF OLD.time_out IS NOT NULL AND NEW.time_out IS DISTINCT FROM OLD.time_out THEN
      RAISE EXCEPTION 'time_out is already set';
    END IF;
    IF NEW.time_out IS NOT NULL AND NEW.time_out < OLD.time_in THEN
      RAISE EXCEPTION 'time_out cannot be before time_in';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_attendances_before_update ON public.agent_attendances;
CREATE TRIGGER trg_agent_attendances_before_update
  BEFORE UPDATE ON public.agent_attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_attendances_before_update_fn();

DROP TRIGGER IF EXISTS update_agent_attendances_updated_at ON public.agent_attendances;
CREATE TRIGGER update_agent_attendances_updated_at
  BEFORE UPDATE ON public.agent_attendances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_attendances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agent attendances: self read" ON public.agent_attendances;
CREATE POLICY "Agent attendances: self read"
  ON public.agent_attendances
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Agent attendances: team leader read team" ON public.agent_attendances;
CREATE POLICY "Agent attendances: team leader read team"
  ON public.agent_attendances
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'team_leader'::text
        AND p.status = 'active'::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.leader_teams lt
      WHERE lt.leader_id = auth.uid()
        AND lt.agent_id = agent_attendances.user_id
    )
  );

DROP POLICY IF EXISTS "Agent attendances: mobile_sales insert present" ON public.agent_attendances;
CREATE POLICY "Agent attendances: mobile_sales insert present"
  ON public.agent_attendances
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'present'::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = auth.uid()
        AND me.role = 'mobile_sales'::text
        AND me.status = 'active'::text
    )
    AND EXISTS (
      SELECT 1
      FROM public.leader_teams lt
      INNER JOIN public.hubs h ON h.id = agent_attendances.hub_id
      INNER JOIN public.profiles me ON me.id = auth.uid()
      WHERE lt.agent_id = auth.uid()
        AND lt.leader_id = h.assigned_team_leader_id
        AND h.assigned_team_leader_id IS NOT NULL
        AND lt.company_id IS NOT DISTINCT FROM me.company_id
    )
  );

DROP POLICY IF EXISTS "Agent attendances: mobile_sales update time out" ON public.agent_attendances;
CREATE POLICY "Agent attendances: mobile_sales update time out"
  ON public.agent_attendances
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND status = 'present'::text
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      WHERE me.id = auth.uid() AND me.role = 'mobile_sales'::text
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'present'::text
  );

GRANT SELECT, INSERT, UPDATE ON public.agent_attendances TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Hubs: mobile_sales can read hubs assigned to their team leader
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Hubs: mobile_sales read leader hub" ON public.hubs;
CREATE POLICY "Hubs: mobile_sales read leader hub"
  ON public.hubs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'mobile_sales'::text
        AND p.status = 'active'::text
    )
    AND assigned_team_leader_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.leader_teams lt
      WHERE lt.agent_id = auth.uid()
        AND lt.leader_id = hubs.assigned_team_leader_id
    )
  );

-- ---------------------------------------------------------------------------
-- 6) Mark absent (call from Supabase cron / Edge Function with service role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_absent_attendance_for_business_date(p_business_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'p_business_date is required';
  END IF;

  INSERT INTO public.agent_attendances (
    user_id,
    hub_id,
    team_leader_id,
    photo,
    address,
    longitude,
    latitude,
    time_in,
    time_out,
    status,
    note,
    business_date
  )
  SELECT
    p.id,
    hub_pick.hub_id,
    lt.leader_id,
    '',
    NULL,
    NULL,
    NULL,
    NULL,
    'absent',
    NULL,
    p_business_date
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT lt2.leader_id
    FROM public.leader_teams lt2
    WHERE lt2.agent_id = p.id
      AND lt2.company_id IS NOT DISTINCT FROM p.company_id
    ORDER BY lt2.assigned_at DESC NULLS LAST
    LIMIT 1
  ) lt ON true
  LEFT JOIN LATERAL (
    SELECT h2.id AS hub_id
    FROM public.hubs h2
    INNER JOIN public.profiles creator ON creator.id = h2.created_by
    WHERE lt.leader_id IS NOT NULL
      AND h2.assigned_team_leader_id = lt.leader_id
      AND creator.company_id IS NOT DISTINCT FROM p.company_id
    ORDER BY h2.hub_name
    LIMIT 1
  ) hub_pick ON true
  WHERE p.role = 'mobile_sales'::text
    AND p.status = 'active'::text
    AND p.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.agent_attendances a
      WHERE a.user_id = p.id
        AND a.business_date = p_business_date
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION public.mark_absent_attendance_for_business_date(date) IS
  'Inserts absent rows for active mobile_sales without any attendance row for p_business_date. Run at end of day (e.g. via Edge Function + pg_net or external cron) using the service role. Example local day: mark_absent_attendance_for_business_date((now() AT TIME ZONE ''Asia/Manila'')::date).';

REVOKE ALL ON FUNCTION public.mark_absent_attendance_for_business_date(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_absent_attendance_for_business_date(date) TO service_role;
