-- Main-initiated stock allocations to sub-warehouses (no prior sub request).
-- Creates AL-{COMPANY_INITIALS}-{####} records that land in pending_receive after
-- deliver-side reserve + DR, reusing existing receive / allocate-remaining paths.

-- ---------------------------------------------------------------------------
-- 1) initiation_type on requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_stock_requests
  ADD COLUMN IF NOT EXISTS initiation_type text NOT NULL DEFAULT 'sub_request';

ALTER TABLE public.internal_stock_requests
  DROP CONSTRAINT IF EXISTS internal_stock_requests_initiation_type_check;

ALTER TABLE public.internal_stock_requests
  ADD CONSTRAINT internal_stock_requests_initiation_type_check
  CHECK (initiation_type IN ('sub_request', 'main_allocation'));

COMMENT ON COLUMN public.internal_stock_requests.initiation_type IS
  'sub_request = raised by sub warehouse; main_allocation = pushed by main without a prior request';

CREATE INDEX IF NOT EXISTS idx_internal_stock_requests_company_initiation
  ON public.internal_stock_requests(company_id, initiation_type);

-- ---------------------------------------------------------------------------
-- 2) Event type: main_allocated
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_stock_request_events
  DROP CONSTRAINT IF EXISTS internal_stock_request_events_event_type_check;

ALTER TABLE public.internal_stock_request_events
  ADD CONSTRAINT internal_stock_request_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'main_allocated',
      'approved',
      'delivered',
      'approved_released',
      'remaining_released',
      'receive_confirmed',
      'rejected'
    )
  );

-- ---------------------------------------------------------------------------
-- 3) AL number generator: AL-{COMPANY_INITIALS}-{####} (company-wide sequence)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_internal_stock_allocation_number(
  p_company_id uuid,
  p_from_location_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_name text;
  v_code text;
  v_counter_key text := 'AL:CO';
  v_next integer;
BEGIN
  SELECT c.company_name INTO v_company_name
  FROM public.companies c
  WHERE c.id = p_company_id;

  IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
    RAISE EXCEPTION 'Company name is missing';
  END IF;

  -- e.g. "B1G Main Warehouse" → BMW (same helper used for order numbers)
  v_code := upper(btrim(public.extract_company_initials(v_company_name)));
  IF v_code IS NULL OR v_code = '' THEN
    RAISE EXCEPTION 'Failed to derive company initials';
  END IF;

  -- One sequence per company (not per destination sub-warehouse).
  INSERT INTO public.internal_stock_request_number_counters (company_id, location_code, last_number)
  VALUES (p_company_id, v_counter_key, 1)
  ON CONFLICT (company_id, location_code)
  DO UPDATE SET last_number = public.internal_stock_request_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN 'AL-' || v_code || '-' || lpad(v_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_internal_stock_allocation_number(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_internal_stock_allocation_number(uuid, uuid) IS
  'Generates AL-{COMPANY_INITIALS}-{####} for main-initiated allocations (e.g. B1G Main Warehouse → AL-BMW-0001). Counter key AL:CO per company.';

-- ---------------------------------------------------------------------------
-- 4) create_and_deliver_main_stock_allocation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_and_deliver_main_stock_allocation(
  p_from_location_id uuid,
  p_items jsonb,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_delivered_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_delivered_by, auth.uid());
  v_company_id uuid;
  v_is_main_loc boolean;
  v_request_id uuid;
  v_request_number text;
  v_dr_number text;
  v_main_loc_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_count integer := 0;
  v_reserve_lines jsonb;
  v_lines jsonb;
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

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = v_actor AND p.role = 'warehouse';

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse access required');
  END IF;

  IF p_from_location_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location required');
  END IF;

  SELECT wl.is_main INTO v_is_main_loc
  FROM public.warehouse_locations wl
  WHERE wl.id = p_from_location_id AND wl.company_id = v_company_id;

  IF v_is_main_loc IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;
  IF v_is_main_loc IS DISTINCT FROM false THEN
    RETURN json_build_object('success', false, 'error', 'Target must be a sub-warehouse');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  -- Aggregate duplicate variants, then assert availability once.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('variant_id', x.variant_id, 'quantity', x.quantity)
  ), '[]'::jsonb)
  INTO v_reserve_lines
  FROM (
    SELECT
      NULLIF(e.elem->>'variant_id', '')::uuid AS variant_id,
      SUM(COALESCE((e.elem->>'quantity')::integer, (e.elem->>'requested_quantity')::integer, 0))::integer AS quantity
    FROM jsonb_array_elements(p_items) AS e(elem)
    GROUP BY NULLIF(e.elem->>'variant_id', '')::uuid
  ) x
  WHERE x.variant_id IS NOT NULL AND x.quantity > 0;

  IF v_reserve_lines IS NULL OR jsonb_array_length(v_reserve_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Each item needs variant_id and positive quantity');
  END IF;

  SELECT COUNT(*)::integer INTO v_count FROM jsonb_array_elements(v_reserve_lines);

  PERFORM public.internal_stock_request_assert_main_available(v_company_id, v_reserve_lines);

  v_request_number := public.generate_internal_stock_allocation_number(v_company_id, p_from_location_id);
  v_dr_number := public.generate_dr_number(v_main_loc_id);
  IF v_dr_number IS NULL OR btrim(v_dr_number) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Failed to generate DR number');
  END IF;

  INSERT INTO public.internal_stock_requests (
    company_id,
    request_number,
    from_location_id,
    status,
    initiation_type,
    notes,
    requested_by,
    delivered_at,
    delivered_by,
    dr_number,
    approval_signature_url,
    approval_signature_path
  ) VALUES (
    v_company_id,
    v_request_number,
    p_from_location_id,
    'pending_receive',
    'main_allocation',
    nullif(btrim(COALESCE(p_notes, '')), ''),
    v_actor,
    now(),
    v_actor,
    v_dr_number,
    p_signature_url,
    p_signature_path
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_reserve_lines)
  LOOP
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);

    INSERT INTO public.internal_stock_request_items (
      request_id,
      variant_id,
      requested_quantity,
      delivered_quantity,
      received_quantity,
      open_receive_quantity
    ) VALUES (
      v_request_id,
      v_variant_id,
      v_qty,
      v_qty,
      0,
      v_qty
    );
  END LOOP;

  PERFORM public.internal_stock_request_reserve_main(
    v_company_id,
    v_request_id,
    v_reserve_lines,
    v_actor,
    format('Reserved for main stock allocation %s', v_request_number)
  );

  v_lines := v_reserve_lines;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, created_by
  ) VALUES (
    v_request_id,
    'main_allocated',
    COALESCE(
      nullif(btrim(COALESCE(p_notes, '')), ''),
      'Allocated by Main Warehouse (no prior sub request)'
    ),
    v_lines,
    v_actor
  );

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, lines, proof_image_url, proof_image_path,
    signature_url, signature_path, created_by
  ) VALUES (
    v_request_id, 'delivered', v_lines, p_proof_image_url, p_proof_image_path,
    p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'dr_number', v_dr_number,
    'status', 'pending_receive',
    'item_count', v_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_and_deliver_main_stock_allocation(
  uuid, jsonb, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_and_deliver_main_stock_allocation(uuid, jsonb, text, text, text, text, text, uuid) IS
  'Main warehouse creates + delivers an allocation to a sub warehouse in one step (pending_receive, DR, reserve).';

-- ---------------------------------------------------------------------------
-- 5) list_internal_stock_requests_for_caller — include initiation_type
-- ---------------------------------------------------------------------------
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
      r.initiation_type,
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
