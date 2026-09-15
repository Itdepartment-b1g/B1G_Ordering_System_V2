-- Allow warehouse users to read profile names on SA returns they can already see.
-- Without this, PostgREST embeds for created_by / source_agent / approved_by return null
-- (cross-company profiles), so Disposal log shows "— · date".

CREATE OR REPLACE FUNCTION public.warehouse_can_view_sa_return_participant_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_warehouse()
    AND p_profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.standard_account_stock_return_requests r
      WHERE r.warehouse_company_id = public.get_auth_company_id()
        AND (
          r.created_by = p_profile_id
          OR r.source_agent_id = p_profile_id
          OR r.approved_by = p_profile_id
          OR r.cancelled_by = p_profile_id
        )
    );
$$;

COMMENT ON FUNCTION public.warehouse_can_view_sa_return_participant_profile(uuid) IS
  'True when the caller is warehouse and this profile is created_by, source_agent, approved_by, or cancelled_by on an SA return for their hub.';

GRANT EXECUTE ON FUNCTION public.warehouse_can_view_sa_return_participant_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS "Warehouse can view SA return participant profiles" ON public.profiles;
CREATE POLICY "Warehouse can view SA return participant profiles"
  ON public.profiles
  FOR SELECT
  USING (public.warehouse_can_view_sa_return_participant_profile(profiles.id));
