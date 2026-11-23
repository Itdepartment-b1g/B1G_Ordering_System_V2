-- Client Order Returns (CR): guarantee the filer / original agent can always SELECT their own rows,
-- including pending_leader (Pending TL).
--
-- Previously the "own rows" check for mobile_sales / sales_agent lived inside a profiles lookup that
-- also required an exact role string match. Any drift (older function body still live with the
-- warehouse-hub requirement, role not matching, etc.) hid the MS's own CRs while the team_leader
-- (leader_teams branch) still saw them.
--
-- Now: ownership (auth.uid() = returned_by / original_agent_id) in the same company grants SELECT for
-- every non-warehouse role, independent of role string and warehouse hub link. Team leader team
-- visibility and admin / super_admin / manager / executive / finance / accounting / sysadmin
-- visibility are unchanged. No status filtering anywhere.

CREATE OR REPLACE FUNCTION public.can_select_client_order_return(
  p_company_id uuid,
  p_returned_by uuid,
  p_original_agent_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_system_administrator()
    OR (
      p_company_id IS NOT DISTINCT FROM public.get_auth_company_id()
      AND NOT public.is_warehouse()
      AND (
        -- Own rows: filer or original order agent (MS / sales_agent / TL / anyone), any status.
        auth.uid() IN (p_returned_by, p_original_agent_id)
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.company_id = p_company_id
            AND (
              p.role IN ('admin', 'super_admin', 'manager', 'executive', 'finance', 'accounting')
              OR (
                p.role = 'team_leader'
                AND EXISTS (
                  SELECT 1
                  FROM public.leader_teams lt
                  WHERE lt.leader_id = p.id
                    AND lt.company_id = p_company_id
                    AND lt.agent_id IN (p_returned_by, COALESCE(p_original_agent_id, p_returned_by))
                )
              )
            )
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_select_client_order_return(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.can_select_client_order_return(uuid, uuid, uuid) IS
  'CR select visibility. Own rows (returned_by / original_agent_id) always visible any status; TL team, admin/finance/SA roles; sysadmin all. No hub link required; warehouse role blocked.';

-- Ensure header policy points at the helper (idempotent).
DROP POLICY IF EXISTS "CR header select" ON public.client_order_returns;
CREATE POLICY "CR header select"
  ON public.client_order_returns FOR SELECT TO authenticated
  USING (
    public.can_select_client_order_return(company_id, returned_by, original_agent_id)
  );
