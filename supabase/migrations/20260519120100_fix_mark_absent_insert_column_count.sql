-- Fix: INSERT listed time_in and time_out but SELECT had one fewer expression (missing time_out NULL).

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
