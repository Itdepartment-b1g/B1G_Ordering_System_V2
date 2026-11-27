-- Allow Client Order Returns (CR) and Return to Leader (RL) without a warehouse hub link.
-- Return to Warehouse (RT) stays hub-gated. Standard Accounts rule on create is unchanged.

-- ---------------------------------------------------------------------------
-- 1) RLS helpers — drop hub requirement
-- ---------------------------------------------------------------------------
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
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.company_id = p_company_id
          AND (
            p.role IN ('admin', 'super_admin', 'manager', 'executive', 'finance', 'accounting')
            OR (
              p.role IN ('mobile_sales', 'sales_agent')
              AND (p_returned_by = p.id OR p_original_agent_id = p.id)
            )
            OR (
              p.role = 'team_leader'
              AND (
                p_returned_by = p.id
                OR p_original_agent_id = p.id
                OR EXISTS (
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

CREATE OR REPLACE FUNCTION public.can_select_return_leader_handover(
  p_company_id uuid,
  p_submitted_by uuid,
  p_from_holder_id uuid,
  p_to_holder_id uuid
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
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.company_id = p_company_id
          AND (
            p.role IN ('admin', 'super_admin', 'manager', 'executive')
            OR p.id IN (p_submitted_by, p_from_holder_id, p_to_holder_id)
            OR (
              p.role = 'team_leader'
              AND EXISTS (
                SELECT 1
                FROM public.leader_teams lt
                WHERE lt.leader_id = p.id
                  AND lt.company_id = p_company_id
                  AND lt.agent_id IN (p_submitted_by, p_from_holder_id)
              )
            )
          )
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 2) Patch create RPCs — remove hub null-checks from live function bodies
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def text;
  patched text;
BEGIN
  -- create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text)
  BEGIN
    def := pg_get_functiondef(
      'public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text)'::regprocedure
    );
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'create_client_order_return not found; skip hub patch';
      def := NULL;
  END;

  IF def IS NOT NULL THEN
    patched := regexp_replace(def, '^CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    patched := regexp_replace(patched, '[[:space:]]*v_hub[[:space:]]+uuid;', '', 'g');
    patched := regexp_replace(
      patched,
      '[[:space:]]*v_hub[[:space:]]*:=[[:space:]]*public\.get_linked_warehouse_company_id\(\);[[:space:]]*'
      || 'IF[[:space:]]+v_hub[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN[[:space:]]*'
      || 'RETURN[[:space:]]+json_build_object\(''success'',[[:space:]]*false,[[:space:]]*''error'',[[:space:]]*''This company is not linked to a warehouse''\);[[:space:]]*'
      || 'END[[:space:]]+IF;',
      E'\n',
      'g'
    );
    IF position('This company is not linked to a warehouse' in patched) > 0 THEN
      RAISE EXCEPTION 'Failed to remove warehouse hub check from create_client_order_return';
    END IF;
    EXECUTE patched;
  END IF;

  -- create_return_leader_handover(jsonb, text, jsonb, text, text) — latest signature
  BEGIN
    def := pg_get_functiondef(
      'public.create_return_leader_handover(jsonb, text, jsonb, text, text)'::regprocedure
    );
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'create_return_leader_handover not found; skip hub patch';
      def := NULL;
  END;

  IF def IS NOT NULL THEN
    patched := regexp_replace(def, '^CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
    patched := regexp_replace(
      patched,
      '[[:space:]]*IF[[:space:]]+public\.get_linked_warehouse_company_id\(\)[[:space:]]+IS[[:space:]]+NULL[[:space:]]+THEN[[:space:]]*'
      || 'RETURN[[:space:]]+json_build_object\(''success'',[[:space:]]*false,[[:space:]]*''error'',[[:space:]]*''Company is not linked to a warehouse''\);[[:space:]]*'
      || 'END[[:space:]]+IF;',
      E'\n',
      'g'
    );
    IF position('Company is not linked to a warehouse' in patched) > 0 THEN
      RAISE EXCEPTION 'Failed to remove warehouse hub check from create_return_leader_handover';
    END IF;
    EXECUTE patched;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.can_select_client_order_return(uuid, uuid, uuid) IS
  'CR select visibility. Hub link not required; warehouse role still blocked.';

COMMENT ON FUNCTION public.can_select_return_leader_handover(uuid, uuid, uuid, uuid) IS
  'RL select visibility. Hub link not required; warehouse role still blocked.';
