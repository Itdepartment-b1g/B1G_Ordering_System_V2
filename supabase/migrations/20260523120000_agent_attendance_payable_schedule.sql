-- Payable hours: overlap with 10:00–12:00 and 13:00–19:00 Asia/Manila (excludes 12:00–13:00 break), max 8 h.

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
  morning_start timestamptz;
  morning_end timestamptz;
  afternoon_start timestamptz;
  afternoon_end timestamptz;
  hours numeric;
  max_hours constant numeric := 8;
BEGIN
  IF p_business_date IS NULL OR p_time_in IS NULL OR p_time_out IS NULL THEN
    RETURN NULL;
  END IF;

  morning_start := (p_business_date::text || ' 10:00:00')::timestamp AT TIME ZONE 'Asia/Manila';
  morning_end := (p_business_date::text || ' 12:00:00')::timestamp AT TIME ZONE 'Asia/Manila';
  afternoon_start := (p_business_date::text || ' 13:00:00')::timestamp AT TIME ZONE 'Asia/Manila';
  afternoon_end := (p_business_date::text || ' 19:00:00')::timestamp AT TIME ZONE 'Asia/Manila';

  hours := 0;

  IF p_time_out > morning_start AND p_time_in < morning_end THEN
    hours := hours + extract(
      epoch FROM (
        LEAST(p_time_out, morning_end) - GREATEST(p_time_in, morning_start)
      )
    ) / 3600.0;
  END IF;

  IF p_time_out > afternoon_start AND p_time_in < afternoon_end THEN
    hours := hours + extract(
      epoch FROM (
        LEAST(p_time_out, afternoon_end) - GREATEST(p_time_in, afternoon_start)
      )
    ) / 3600.0;
  END IF;

  IF hours <= 0 THEN
    RETURN 0;
  END IF;

  RETURN least(round(hours::numeric, 2), max_hours);
END;
$$;

COMMENT ON FUNCTION public.compute_agent_attendance_total_hours(date, timestamptz, timestamptz) IS
  'Payable hours: overlap of time_in/time_out with 10:00–12:00 and 13:00–19:00 Asia/Manila (excludes lunch break), capped at 8.';

COMMENT ON COLUMN public.agent_attendances.total_hours IS
  'Billable hours for present rows: overlap of time_in/time_out with payable schedule (10–12, 13–19 Manila), capped at 8. NULL until time_out is set.';

UPDATE public.agent_attendances
SET total_hours = public.compute_agent_attendance_total_hours(business_date, time_in, time_out)
WHERE status = 'present'::text
  AND time_in IS NOT NULL
  AND time_out IS NOT NULL;
