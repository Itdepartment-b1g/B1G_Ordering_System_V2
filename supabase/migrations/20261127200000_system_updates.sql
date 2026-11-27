-- System Updates: publish version notes to selected companies + per-user acknowledgment.

CREATE TABLE IF NOT EXISTS public.system_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_updates_status_idx
  ON public.system_updates (status, published_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.system_update_companies (
  update_id uuid NOT NULL REFERENCES public.system_updates(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  PRIMARY KEY (update_id, company_id)
);

CREATE INDEX IF NOT EXISTS system_update_companies_company_idx
  ON public.system_update_companies (company_id);

CREATE TABLE IF NOT EXISTS public.system_update_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.system_updates(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_update_attachments_update_idx
  ON public.system_update_attachments (update_id);

CREATE TABLE IF NOT EXISTS public.system_update_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.system_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (update_id, user_id)
);

CREATE INDEX IF NOT EXISTS system_update_acks_update_idx
  ON public.system_update_acknowledgments (update_id);
CREATE INDEX IF NOT EXISTS system_update_acks_user_idx
  ON public.system_update_acknowledgments (user_id);

ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_update_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_update_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_update_acknowledgments ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER helper: bypasses RLS so policies do not recurse across
-- system_updates ↔ system_update_companies (and dependents).
CREATE OR REPLACE FUNCTION public.user_can_access_system_update(p_update_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.system_updates u
    JOIN public.system_update_companies suc ON suc.update_id = u.id
    WHERE u.id = p_update_id
      AND u.status = 'published'
      AND suc.company_id = public.get_auth_company_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_system_update(uuid) TO authenticated;

-- system_updates policies
DROP POLICY IF EXISTS "system_updates_sysadmin_all" ON public.system_updates;
CREATE POLICY "system_updates_sysadmin_all"
  ON public.system_updates FOR ALL TO authenticated
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "system_updates_users_select_published" ON public.system_updates;
CREATE POLICY "system_updates_users_select_published"
  ON public.system_updates FOR SELECT TO authenticated
  USING (public.user_can_access_system_update(system_updates.id));

-- companies junction
-- User SELECT only scopes by company_id — do NOT re-check system_updates here
-- (that caused 42P17 infinite recursion with the parent table policy).
DROP POLICY IF EXISTS "system_update_companies_sysadmin_all" ON public.system_update_companies;
CREATE POLICY "system_update_companies_sysadmin_all"
  ON public.system_update_companies FOR ALL TO authenticated
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "system_update_companies_users_select" ON public.system_update_companies;
CREATE POLICY "system_update_companies_users_select"
  ON public.system_update_companies FOR SELECT TO authenticated
  USING (company_id = public.get_auth_company_id());

-- attachments
DROP POLICY IF EXISTS "system_update_attachments_sysadmin_all" ON public.system_update_attachments;
CREATE POLICY "system_update_attachments_sysadmin_all"
  ON public.system_update_attachments FOR ALL TO authenticated
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "system_update_attachments_users_select" ON public.system_update_attachments;
CREATE POLICY "system_update_attachments_users_select"
  ON public.system_update_attachments FOR SELECT TO authenticated
  USING (public.user_can_access_system_update(system_update_attachments.update_id));

-- acknowledgments
DROP POLICY IF EXISTS "system_update_acks_sysadmin_select" ON public.system_update_acknowledgments;
CREATE POLICY "system_update_acks_sysadmin_select"
  ON public.system_update_acknowledgments FOR SELECT TO authenticated
  USING (public.is_system_administrator());

DROP POLICY IF EXISTS "system_update_acks_own_select" ON public.system_update_acknowledgments;
CREATE POLICY "system_update_acks_own_select"
  ON public.system_update_acknowledgments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "system_update_acks_own_insert" ON public.system_update_acknowledgments;
CREATE POLICY "system_update_acks_own_insert"
  ON public.system_update_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_access_system_update(system_update_acknowledgments.update_id)
  );

-- Storage bucket for attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'system-updates',
  'system-updates',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "system-updates: sysadmin insert" ON storage.objects;
CREATE POLICY "system-updates: sysadmin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'system-updates'
    AND public.is_system_administrator()
  );

DROP POLICY IF EXISTS "system-updates: sysadmin select" ON storage.objects;
CREATE POLICY "system-updates: sysadmin select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'system-updates'
    AND public.is_system_administrator()
  );

DROP POLICY IF EXISTS "system-updates: sysadmin delete" ON storage.objects;
CREATE POLICY "system-updates: sysadmin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'system-updates'
    AND public.is_system_administrator()
  );

DROP POLICY IF EXISTS "system-updates: users select published" ON storage.objects;
CREATE POLICY "system-updates: users select published"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'system-updates'
    AND EXISTS (
      SELECT 1
      FROM public.system_update_attachments a
      WHERE a.file_path = name
        AND public.user_can_access_system_update(a.update_id)
    )
  );

-- Acknowledge (idempotent)
CREATE OR REPLACE FUNCTION public.acknowledge_system_update(p_update_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.get_auth_company_id();
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF v_company IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No company assigned');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.system_updates u
    JOIN public.system_update_companies suc ON suc.update_id = u.id
    WHERE u.id = p_update_id
      AND u.status = 'published'
      AND suc.company_id = v_company
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Update not available');
  END IF;

  INSERT INTO public.system_update_acknowledgments (update_id, user_id)
  VALUES (p_update_id, v_user)
  ON CONFLICT (update_id, user_id) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_system_update(uuid) TO authenticated;

-- Unacknowledged published updates for current user (oldest first)
CREATE OR REPLACE FUNCTION public.list_unacknowledged_system_updates()
RETURNS TABLE (
  id uuid,
  title text,
  short_description text,
  details jsonb,
  published_at timestamptz,
  attachments json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.get_auth_company_id();
BEGIN
  IF v_user IS NULL OR v_company IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.title,
    u.short_description,
    u.details,
    u.published_at,
    COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', a.id,
            'file_name', a.file_name,
            'file_path', a.file_path,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes
          )
          ORDER BY a.created_at
        )
        FROM public.system_update_attachments a
        WHERE a.update_id = u.id
      ),
      '[]'::json
    ) AS attachments
  FROM public.system_updates u
  JOIN public.system_update_companies suc ON suc.update_id = u.id AND suc.company_id = v_company
  WHERE u.status = 'published'
    AND NOT EXISTS (
      SELECT 1
      FROM public.system_update_acknowledgments ack
      WHERE ack.update_id = u.id
        AND ack.user_id = v_user
    )
  ORDER BY u.published_at ASC NULLS LAST, u.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_unacknowledged_system_updates() TO authenticated;

-- Ack report for one update (sysadmin)
CREATE OR REPLACE FUNCTION public.list_system_update_acknowledgment_report(p_update_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_ids uuid[];
  v_rows json;
  v_total int;
  v_acked int;
BEGIN
  IF NOT public.is_system_administrator() THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.system_updates WHERE id = p_update_id) THEN
    RETURN json_build_object('success', false, 'error', 'Update not found');
  END IF;

  SELECT COALESCE(array_agg(company_id), '{}')
  INTO v_company_ids
  FROM public.system_update_companies
  WHERE update_id = p_update_id;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.full_name), '[]'::json)
  INTO v_rows
  FROM (
    SELECT
      p.id AS user_id,
      p.full_name,
      p.role,
      c.id AS company_id,
      c.company_name,
      CASE WHEN ack.id IS NULL THEN 'pending' ELSE 'acknowledged' END AS acknowledgment_status,
      ack.acknowledged_at
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
    LEFT JOIN public.system_update_acknowledgments ack
      ON ack.update_id = p_update_id AND ack.user_id = p.id
    WHERE p.company_id = ANY (v_company_ids)
      AND COALESCE(p.status, 'active') = 'active'
  ) t;

  SELECT COUNT(*)::int INTO v_total
  FROM public.profiles p
  WHERE p.company_id = ANY (v_company_ids)
    AND COALESCE(p.status, 'active') = 'active';

  SELECT COUNT(*)::int INTO v_acked
  FROM public.system_update_acknowledgments ack
  JOIN public.profiles p ON p.id = ack.user_id
  WHERE ack.update_id = p_update_id
    AND p.company_id = ANY (v_company_ids)
    AND COALESCE(p.status, 'active') = 'active';

  RETURN json_build_object(
    'success', true,
    'rows', COALESCE(v_rows, '[]'::json),
    'stats', json_build_object(
      'total_targeted', v_total,
      'total_acknowledged', v_acked,
      'total_pending', GREATEST(v_total - v_acked, 0),
      'completion_pct', CASE WHEN v_total = 0 THEN 0 ELSE ROUND((v_acked::numeric / v_total::numeric) * 100, 1) END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_system_update_acknowledgment_report(uuid) TO authenticated;
