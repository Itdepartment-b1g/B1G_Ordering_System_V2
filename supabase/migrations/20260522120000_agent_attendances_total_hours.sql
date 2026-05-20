-- Total hours: office window (10 AM–7 PM Manila) clamped to time in/out, max 8 h per day.

ALTER TABLE public.agent_attendances
  ADD COLUMN IF NOT EXISTS total_hours numeric(5, 2);

COMMENT ON COLUMN public.agent_attendances.total_hours IS
  'Billable hours for present rows: overlap of time_in/time_out with 10:00–19:00 Asia/Manila, capped at 8. NULL until time_out is set.';

CREATE OR REPLACE FUNCTION public.compute_agent_attendance_total_hours(
  p_business_date date,
  p_time_in timestamptz,
  p_time_out timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  office_start timestamptz;
  office_end timestamptz;
  effective_start timestamptz;
  effective_end timestamptz;
  hours numeric;
  max_hours constant numeric := 8;
BEGIN
  IF p_business_date IS NULL OR p_time_in IS NULL OR p_time_out IS NULL THEN
    RETURN NULL;
  END IF;

  office_start := (p_business_date::text || ' 10:00:00')::timestamp AT TIME ZONE 'Asia/Manila';
  office_end := (p_business_date::text || ' 19:00:00')::timestamp AT TIME ZONE 'Asia/Manila';

  effective_start := GREATEST(p_time_in, office_start);
  effective_end := LEAST(p_time_out, office_end);

  IF effective_end <= effective_start THEN
    RETURN 0;
  END IF;

  hours := round((extract(epoch FROM (effective_end - effective_start)) / 3600.0)::numeric, 2);
  RETURN least(hours, max_hours);
END;
$$;

COMMENT ON FUNCTION public.compute_agent_attendance_total_hours(date, timestamptz, timestamptz) IS
  'Office-window hours (10 AM–7 PM Manila) from time_in/time_out, capped at 8.';

CREATE OR REPLACE FUNCTION public.agent_attendances_before_update_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  me_role text;
BEGIN
  IF NEW.status = 'present'::text AND NEW.time_in IS NOT NULL AND NEW.time_out IS NOT NULL THEN
    NEW.total_hours := public.compute_agent_attendance_total_hours(
      NEW.business_date,
      NEW.time_in,
      NEW.time_out
    );
  ELSIF NEW.time_out IS NULL OR NEW.status <> 'present'::text THEN
    NEW.total_hours := NULL;
  END IF;

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

UPDATE public.agent_attendances
SET total_hours = public.compute_agent_attendance_total_hours(business_date, time_in, time_out)
WHERE status = 'present'::text
  AND time_in IS NOT NULL
  AND time_out IS NOT NULL;
