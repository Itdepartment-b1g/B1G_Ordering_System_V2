-- Fix 42P17 infinite recursion between system_updates ↔ system_update_companies RLS.
-- Use a SECURITY DEFINER helper and stop the junction table from re-querying system_updates.

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

DROP POLICY IF EXISTS "system_updates_users_select_published" ON public.system_updates;
CREATE POLICY "system_updates_users_select_published"
  ON public.system_updates FOR SELECT TO authenticated
  USING (public.user_can_access_system_update(system_updates.id));

DROP POLICY IF EXISTS "system_update_companies_users_select" ON public.system_update_companies;
CREATE POLICY "system_update_companies_users_select"
  ON public.system_update_companies FOR SELECT TO authenticated
  USING (company_id = public.get_auth_company_id());

DROP POLICY IF EXISTS "system_update_attachments_users_select" ON public.system_update_attachments;
CREATE POLICY "system_update_attachments_users_select"
  ON public.system_update_attachments FOR SELECT TO authenticated
  USING (public.user_can_access_system_update(system_update_attachments.update_id));

DROP POLICY IF EXISTS "system_update_acks_own_insert" ON public.system_update_acknowledgments;
CREATE POLICY "system_update_acks_own_insert"
  ON public.system_update_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.user_can_access_system_update(system_update_acknowledgments.update_id)
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
