-- Assign PO-style DR numbers on internal stock request deliver (WH{L}-YYYY-MM-DR-NNNNN).

ALTER TABLE public.internal_stock_requests
  ADD COLUMN IF NOT EXISTS dr_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_stock_requests_company_dr_number
  ON public.internal_stock_requests (company_id, dr_number)
  WHERE dr_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.deliver_internal_stock_request(
  p_request_id uuid,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_delivered_by uuid DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_delivered_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_lines jsonb;
  v_reserve_lines jsonb;
  v_main_loc_id uuid;
  v_dr_number text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'approved' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not approved for delivery');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  v_dr_number := public.generate_dr_number(v_main_loc_id);
  IF v_dr_number IS NULL OR btrim(v_dr_number) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Failed to generate DR number');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'variant_id', i.variant_id,
      'quantity', i.requested_quantity
    )
  ), '[]'::jsonb)
  INTO v_reserve_lines
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  IF jsonb_array_length(v_reserve_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Request has no items');
  END IF;

  PERFORM public.internal_stock_request_assert_main_available(v_company_id, v_reserve_lines);
  PERFORM public.internal_stock_request_reserve_main(
    v_company_id,
    p_request_id,
    v_reserve_lines,
    v_actor,
    format('Reserved for internal stock request %s', p_request_id)
  );

  UPDATE public.internal_stock_request_items
  SET delivered_quantity = requested_quantity,
      received_quantity = 0,
      open_receive_quantity = requested_quantity,
      updated_at = now()
  WHERE request_id = p_request_id;

  UPDATE public.internal_stock_requests
  SET status = 'pending_receive',
      delivered_at = now(),
      delivered_by = v_actor,
      dr_number = v_dr_number,
      approval_signature_url = p_signature_url,
      approval_signature_path = p_signature_path,
      updated_at = now()
  WHERE id = p_request_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'variant_id', i.variant_id,
      'quantity', i.requested_quantity
    )
  ), '[]'::jsonb)
  INTO v_lines
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, lines, proof_image_url, proof_image_path,
    signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'delivered', v_lines, p_proof_image_url, p_proof_image_path,
    p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'pending_receive',
    'dr_number', v_dr_number
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deliver_internal_stock_request(uuid, text, text, uuid, text, text) TO authenticated;

-- Keep list payload in sync with new column.
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
      r.delivered_at,
      r.delivered_by,
      r.dr_number,
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

COMMENT ON COLUMN public.internal_stock_requests.dr_number IS
  'PO-style DR number assigned on deliver via generate_dr_number (main warehouse location).';
