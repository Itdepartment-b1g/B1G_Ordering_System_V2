-- Add non_working status (e.g. Sunday). mark_absent_attendance_for_business_date inserts non_working on Sundays.

ALTER TABLE public.agent_attendances
  DROP CONSTRAINT IF EXISTS agent_attendances_status_check;

ALTER TABLE public.agent_attendances
  ADD CONSTRAINT agent_attendances_status_check
  CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'non_working'::text]));

ALTER TABLE public.agent_attendances
  DROP CONSTRAINT IF EXISTS agent_attendances_non_working_shape;

ALTER TABLE public.agent_attendances
  ADD CONSTRAINT agent_attendances_non_working_shape CHECK (
    status <> 'non_working'::text
    OR (time_in IS NULL AND time_out IS NULL)
  );

COMMENT ON COLUMN public.agent_attendances.status IS 'present | absent | non_working (system; e.g. Sunday when no check-in).';

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
  ELSIF NEW.status = 'non_working'::text THEN
    IF NEW.business_date IS NULL THEN
      RAISE EXCEPTION 'business_date is required for non_working attendance';
    END IF;
    NEW.photo := coalesce(nullif(trim(NEW.photo), ''), '');
    NEW.time_in := NULL;
    NEW.time_out := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_absent_attendance_for_business_date(p_business_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
  day_status text;
BEGIN
  IF p_business_date IS NULL THEN
    RAISE EXCEPTION 'p_business_date is required';
  END IF;

  IF EXTRACT(DOW FROM p_business_date) = 0 THEN
    day_status := 'non_working';
  ELSE
    day_status := 'absent';
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
    NULL,
    day_status,
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
  'Inserts absent (Mon–Sat) or non_working (Sun) rows for active mobile_sales without any attendance row for p_business_date. Run via service role after the Manila calendar day closes; e.g. pass yesterday: (now() AT TIME ZONE ''Asia/Manila'')::date - 1.';
