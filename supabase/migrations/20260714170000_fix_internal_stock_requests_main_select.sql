-- Fix empty main-warehouse reads for internal stock requests.
-- Symptom: SQL Editor shows rows; app returns [] with no error for main users.
-- Cause: SELECT grants missing and/or policy over-reliant on helper edge cases.
-- Fix: grants + explicit inline main/sub checks in SELECT policies.

GRANT SELECT ON public.internal_stock_requests TO authenticated;
GRANT SELECT ON public.internal_stock_request_items TO authenticated;
GRANT SELECT ON public.internal_stock_request_events TO authenticated;
GRANT SELECT ON public.internal_stock_request_receives TO authenticated;

-- Resilient main check: same company + linked to an is_main location
CREATE OR REPLACE FUNCTION public.is_main_warehouse_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_location_users wlu
    JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
    JOIN public.profiles p ON p.id = wlu.user_id
    WHERE wlu.user_id = COALESCE(p_user_id, auth.uid())
      AND wl.is_main = true
      AND wl.company_id = p.company_id
      AND (
        public.get_auth_company_id() IS NULL
        OR wl.company_id = public.get_auth_company_id()
        OR p.company_id = public.get_auth_company_id()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_main_warehouse_user(uuid) TO authenticated;

-- Debug helper for the app console
CREATE OR REPLACE FUNCTION public.debug_internal_stock_request_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid := public.get_auth_company_id();
  v_loc uuid := public.get_warehouse_location_id(v_uid);
  v_is_main boolean := public.is_main_warehouse_user(v_uid);
  v_role text;
  v_total integer;
  v_visible integer;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;

  SELECT count(*) INTO v_total
  FROM public.internal_stock_requests r
  WHERE r.company_id = v_company;

  -- Count using the same rule as the SELECT policy (manual, since DEFINER bypasses RLS)
  SELECT count(*) INTO v_visible
  FROM public.internal_stock_requests r
  WHERE r.company_id = v_company
    AND v_role = 'warehouse'
    AND (
      v_is_main
      OR r.from_location_id = v_loc
    );

  RETURN jsonb_build_object(
    'auth_uid', v_uid,
    'auth_company_id', v_company,
    'role', v_role,
    'location_id', v_loc,
    'is_main_warehouse_user', v_is_main,
    'company_request_total', v_total,
    'expected_visible_count', v_visible
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_internal_stock_request_access() TO authenticated;

DROP POLICY IF EXISTS "Internal stock requests: select by warehouse role" ON public.internal_stock_requests;
CREATE POLICY "Internal stock requests: select by warehouse role"
  ON public.internal_stock_requests FOR SELECT
  USING (
    company_id = public.get_auth_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'warehouse'
    )
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR from_location_id = public.get_warehouse_location_id(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.warehouse_location_users wlu
        JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
        WHERE wlu.user_id = auth.uid()
          AND wl.is_main = true
          AND wl.company_id = internal_stock_requests.company_id
      )
    )
  );

DROP POLICY IF EXISTS "Internal stock request items: select via parent" ON public.internal_stock_request_items;
CREATE POLICY "Internal stock request items: select via parent"
  ON public.internal_stock_request_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_items.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.warehouse_location_users wlu
            JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
            WHERE wlu.user_id = auth.uid()
              AND wl.is_main = true
              AND wl.company_id = r.company_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "Internal stock request events: select via parent" ON public.internal_stock_request_events;
CREATE POLICY "Internal stock request events: select via parent"
  ON public.internal_stock_request_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_events.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.warehouse_location_users wlu
            JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
            WHERE wlu.user_id = auth.uid()
              AND wl.is_main = true
              AND wl.company_id = r.company_id
          )
        )
    )
  );

DROP POLICY IF EXISTS "Internal stock request receives: select via parent" ON public.internal_stock_request_receives;
CREATE POLICY "Internal stock request receives: select via parent"
  ON public.internal_stock_request_receives FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_stock_requests r
      WHERE r.id = internal_stock_request_receives.request_id
        AND r.company_id = public.get_auth_company_id()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
        AND (
          public.is_main_warehouse_user(auth.uid())
          OR r.from_location_id = public.get_warehouse_location_id(auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.warehouse_location_users wlu
            JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
            WHERE wlu.user_id = auth.uid()
              AND wl.is_main = true
              AND wl.company_id = r.company_id
          )
        )
    )
  );
