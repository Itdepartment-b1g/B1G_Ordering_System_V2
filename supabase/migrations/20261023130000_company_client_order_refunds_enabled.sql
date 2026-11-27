-- Per-company toggle: allow filing client order refunds (CR return_type = refund).
-- Default false. Change-item returns are always allowed. Super Admin toggles via System Settings.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS client_order_refunds_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.client_order_refunds_enabled IS
  'When true, mobile sales / team leaders may file client order returns of type refund. Default false; change_item is always allowed.';

-- Backfill any nulls if column existed without NOT NULL somehow
UPDATE public.companies
SET client_order_refunds_enabled = false
WHERE client_order_refunds_enabled IS NULL;

-- ---------------------------------------------------------------------------
-- Super Admin (and admin, same as pricing page access) can update only this flag
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_company_client_order_refunds_enabled(
  p_refunds_enabled boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Unauthorized: No user session');
  END IF;

  SELECT company_id, role
  INTO v_company_id, v_user_role
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'User does not belong to any company');
  END IF;

  IF v_user_role IS DISTINCT FROM 'super_admin' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Unauthorized: Only Super Admin can update client refund settings'
    );
  END IF;

  UPDATE public.companies
  SET
    client_order_refunds_enabled = COALESCE(p_refunds_enabled, false),
    updated_at = now()
  WHERE id = v_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Company not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'client_order_refunds_enabled', COALESCE(p_refunds_enabled, false)
  );
END;
$$;

COMMENT ON FUNCTION public.update_company_client_order_refunds_enabled(boolean) IS
  'Super Admin only: enable/disable filing of client order refunds for the caller company.';

GRANT EXECUTE ON FUNCTION public.update_company_client_order_refunds_enabled(boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enforce on create_client_order_return (patch live body)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  def text;
  patched text;
  insert_block text :=
    E'\n  IF v_return_type = ''refund'' THEN\n'
    || E'    IF NOT COALESCE((\n'
    || E'      SELECT c.client_order_refunds_enabled\n'
    || E'      FROM public.companies c\n'
    || E'      WHERE c.id = v_company_id\n'
    || E'    ), false) THEN\n'
    || E'      RETURN json_build_object(''success'', false, ''error'', ''Client refunds are disabled for this company'');\n'
    || E'    END IF;\n'
    || E'  END IF;';
BEGIN
  BEGIN
    def := pg_get_functiondef(
      'public.create_client_order_return(uuid, date, text, text, text, jsonb, jsonb, jsonb, text)'::regprocedure
    );
  EXCEPTION
    WHEN undefined_function THEN
      RAISE NOTICE 'create_client_order_return not found; skip refunds-enabled patch';
      RETURN;
  END;

  IF position('Client refunds are disabled for this company' in def) > 0 THEN
    RAISE NOTICE 'create_client_order_return already enforces refunds-enabled; skip';
    RETURN;
  END IF;

  patched := regexp_replace(def, '^CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');

  -- Flexible match on the return-type validation block, then append refund gate
  IF patched !~* 'Return type must be change item or refund' THEN
    RAISE EXCEPTION 'Could not find return-type validation in create_client_order_return';
  END IF;

  patched := regexp_replace(
    patched,
    'IF[[:space:]]+v_return_type[[:space:]]+NOT[[:space:]]+IN[[:space:]]*\([[:space:]]*''change_item''[[:space:]]*,[[:space:]]*''refund''[[:space:]]*\)[[:space:]]+THEN[[:space:]]+'
      || 'RETURN[[:space:]]+json_build_object\(''success'',[[:space:]]*false,[[:space:]]*''error'',[[:space:]]*''Return type must be change item or refund''\);[[:space:]]*'
      || 'END[[:space:]]+IF;',
    E'IF v_return_type NOT IN (''change_item'', ''refund'') THEN\n'
      || E'    RETURN json_build_object(''success'', false, ''error'', ''Return type must be change item or refund'');\n'
      || E'  END IF;'
      || insert_block,
    'g'
  );

  IF position('Client refunds are disabled for this company' in patched) = 0 THEN
    RAISE EXCEPTION 'Failed to inject client_order_refunds_enabled check into create_client_order_return';
  END IF;

  EXECUTE patched;
END;
$$;
