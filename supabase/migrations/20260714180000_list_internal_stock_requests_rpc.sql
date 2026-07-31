-- Reliable list for internal stock requests: SECURITY DEFINER bypasses broken
-- PostgREST/RLS empty-select for main warehouse while still enforcing access.

CREATE OR REPLACE FUNCTION public.list_visible_internal_stock_request_ids(
  p_from_location_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_loc uuid;
  v_is_main boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT p.company_id, p.role INTO v_company, v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_company IS NULL OR v_role IS DISTINCT FROM 'warehouse' THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  v_loc := public.get_warehouse_location_id(v_uid);
  v_is_main := public.is_main_warehouse_user(v_uid);

  -- Fallback: treat linked is_main location as main even if helper is flaky
  IF NOT v_is_main AND v_loc IS NOT NULL THEN
    SELECT wl.is_main INTO v_is_main
    FROM public.warehouse_locations wl
    WHERE wl.id = v_loc AND wl.company_id = v_company;
    v_is_main := COALESCE(v_is_main, false);
  END IF;

  RETURN ARRAY(
    SELECT r.id
    FROM public.internal_stock_requests r
    WHERE r.company_id = v_company
      AND (
        v_is_main
        OR (v_loc IS NOT NULL AND r.from_location_id = v_loc)
      )
      AND (p_from_location_id IS NULL OR r.from_location_id = p_from_location_id)
    ORDER BY r.created_at DESC
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_visible_internal_stock_request_ids(uuid) TO authenticated;

-- Full payload for UI (avoids nested brands RLS blowing up the select)
CREATE OR REPLACE FUNCTION public.list_internal_stock_requests_for_caller(
  p_from_location_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role text;
  v_loc uuid;
  v_is_main boolean;
  v_ids uuid[];
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT p.company_id, p.role INTO v_company, v_role
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_company IS NULL OR v_role IS DISTINCT FROM 'warehouse' THEN
    RETURN '[]'::jsonb;
  END IF;

  v_loc := public.get_warehouse_location_id(v_uid);
  v_is_main := public.is_main_warehouse_user(v_uid);

  IF NOT v_is_main AND v_loc IS NOT NULL THEN
    SELECT COALESCE(wl.is_main, false) INTO v_is_main
    FROM public.warehouse_locations wl
    WHERE wl.id = v_loc AND wl.company_id = v_company;
  END IF;

  SELECT ARRAY_AGG(r.id ORDER BY r.created_at DESC)
  INTO v_ids
  FROM public.internal_stock_requests r
  WHERE r.company_id = v_company
    AND (
      v_is_main
      OR (v_loc IS NOT NULL AND r.from_location_id = v_loc)
    )
    AND (p_from_location_id IS NULL OR r.from_location_id = p_from_location_id)
    AND (p_status IS NULL OR btrim(p_status) = '' OR p_status = 'all' OR r.status = p_status);

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      r.id,
      r.company_id,
      r.request_number,
      r.from_location_id,
      r.status,
      r.notes,
      r.receive_notes,
      r.rejection_reason,
      r.requested_by,
      r.approved_at,
      r.approved_by,
      r.approval_signature_url,
      r.rejected_at,
      r.rejected_by,
      r.rejection_signature_url,
      r.created_at,
      r.updated_at,
      jsonb_build_object(
        'id', wl.id,
        'name', wl.name,
        'code', wl.code
      ) AS from_location,
      CASE
        WHEN req_p.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', req_p.id, 'full_name', req_p.full_name)
      END AS requested_by_user,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'request_id', i.request_id,
            'variant_id', i.variant_id,
            'requested_quantity', i.requested_quantity,
            'delivered_quantity', i.delivered_quantity,
            'received_quantity', i.received_quantity,
            'open_receive_quantity', i.open_receive_quantity,
            'variant', jsonb_build_object(
              'id', v.id,
              'name', v.name,
              'brand', CASE
                WHEN b.id IS NULL THEN NULL
                ELSE jsonb_build_object('id', b.id, 'name', b.name)
              END
            )
          )
          ORDER BY v.name NULLS LAST
        )
        FROM public.internal_stock_request_items i
        LEFT JOIN public.variants v ON v.id = i.variant_id
        LEFT JOIN public.brands b ON b.id = v.brand_id
        WHERE i.request_id = r.id
      ), '[]'::jsonb) AS items,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'request_id', e.request_id,
            'event_type', e.event_type,
            'note', e.note,
            'lines', e.lines,
            'short_quantity', e.short_quantity,
            'proof_image_url', e.proof_image_url,
            'signature_url', e.signature_url,
            'created_by', e.created_by,
            'created_at', e.created_at,
            'created_by_user', CASE
              WHEN ep.id IS NULL THEN NULL
              ELSE jsonb_build_object('full_name', ep.full_name)
            END
          )
          ORDER BY e.created_at ASC
        )
        FROM public.internal_stock_request_events e
        LEFT JOIN public.profiles ep ON ep.id = e.created_by
        WHERE e.request_id = r.id
      ), '[]'::jsonb) AS events
    FROM public.internal_stock_requests r
    LEFT JOIN public.warehouse_locations wl ON wl.id = r.from_location_id
    LEFT JOIN public.profiles req_p ON req_p.id = r.requested_by
    WHERE r.id = ANY (v_ids)
  ) x;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_internal_stock_requests_for_caller(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.list_internal_stock_requests_for_caller(uuid, text) IS
  'Returns internal stock requests visible to the current warehouse user (main sees all company requests; sub sees own location). SECURITY DEFINER to avoid RLS empty-select issues.';
