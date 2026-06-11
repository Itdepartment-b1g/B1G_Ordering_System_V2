-- Super admin may correct mobile_sales attendance (e.g. forgot to time in).

CREATE OR REPLACE FUNCTION public.super_admin_correct_agent_attendance(
  p_attendance_id uuid,
  p_hub_id uuid,
  p_time_in timestamptz,
  p_time_out timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company_id uuid;
  v_row public.agent_attendances%ROWTYPE;
  v_agent public.profiles%ROWTYPE;
  v_hub public.hubs%ROWTYPE;
  v_note text;
  v_photo text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT me.company_id
  INTO v_company_id
  FROM public.profiles me
  WHERE me.id = v_uid
    AND me.role = 'super_admin'::text;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Only super admins can correct attendance');
  END IF;

  IF p_attendance_id IS NULL OR p_hub_id IS NULL OR p_time_in IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Attendance, hub, and time in are required');
  END IF;

  IF coalesce(nullif(trim(p_note), ''), '') = '' THEN
    RETURN json_build_object('success', false, 'message', 'A correction note is required');
  END IF;

  SELECT *
  INTO v_row
  FROM public.agent_attendances
  WHERE id = p_attendance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Attendance record not found');
  END IF;

  IF v_row.status = 'non_working'::text THEN
    RETURN json_build_object('success', false, 'message', 'Non-working days cannot be corrected');
  END IF;

  SELECT *
  INTO v_agent
  FROM public.profiles
  WHERE id = v_row.user_id;

  IF v_agent.role <> 'mobile_sales'::text
    OR v_agent.company_id IS DISTINCT FROM v_company_id THEN
    RETURN json_build_object('success', false, 'message', 'Attendance is not for a mobile sales agent in your company');
  END IF;

  SELECT h.*
  INTO v_hub
  FROM public.hubs h
  INNER JOIN public.profiles creator ON creator.id = h.created_by
  WHERE h.id = p_hub_id
    AND creator.company_id IS NOT DISTINCT FROM v_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Hub not found in your company');
  END IF;

  IF (p_time_in AT TIME ZONE 'Asia/Manila')::date <> v_row.business_date THEN
    RETURN json_build_object(
      'success',
      false,
      'message',
      'Time in must fall on the attendance business date (Asia/Manila)'
    );
  END IF;

  IF p_time_out IS NOT NULL AND p_time_out < p_time_in THEN
    RETURN json_build_object('success', false, 'message', 'Time out cannot be before time in');
  END IF;

  IF p_time_out IS NOT NULL
    AND (p_time_out AT TIME ZONE 'Asia/Manila')::date <> v_row.business_date THEN
    RETURN json_build_object(
      'success',
      false,
      'message',
      'Time out must fall on the attendance business date (Asia/Manila)'
    );
  END IF;

  v_note := trim(p_note);
  v_photo := coalesce(nullif(trim(v_row.photo), ''), 'admin-correction/' || p_attendance_id::text);

  UPDATE public.agent_attendances
  SET
    status = 'present'::text,
    hub_id = p_hub_id,
    team_leader_id = v_hub.assigned_team_leader_id,
    photo = v_photo,
    longitude = v_hub.longitude,
    latitude = v_hub.latitude,
    address = coalesce(nullif(trim(v_row.address), ''), 'Admin correction (no GPS check-in)'),
    time_in = p_time_in,
    time_out = p_time_out,
    note = v_note,
    total_hours = CASE
      WHEN p_time_out IS NOT NULL THEN public.compute_agent_attendance_total_hours(
        v_row.business_date,
        p_time_in,
        p_time_out
      )
      ELSE NULL
    END
  WHERE id = p_attendance_id;

  RETURN json_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.super_admin_correct_agent_attendance(uuid, uuid, timestamptz, timestamptz, text) IS
  'Super admin: mark absent mobile_sales attendance as present or adjust time in/out for a business_date.';

REVOKE ALL ON FUNCTION public.super_admin_correct_agent_attendance(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_correct_agent_attendance(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

-- General validation for all roles on time_out vs time_in.
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

  IF NEW.time_out IS NOT NULL AND NEW.time_in IS NOT NULL AND NEW.time_out < NEW.time_in THEN
    RAISE EXCEPTION 'time_out cannot be before time_in';
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
  END IF;

  RETURN NEW;
END;
$$;
