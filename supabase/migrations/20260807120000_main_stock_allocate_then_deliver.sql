-- Split main-initiated allocation into:
--   1) create_main_stock_allocation  → package photo + reserve lots → ready_to_deliver
--   2) deliver_main_stock_allocation → rider + signature → pending_receive (no second reserve)
-- Sub-request approve → deliver is unchanged.

-- ---------------------------------------------------------------------------
-- 1) Status: ready_to_deliver
-- ---------------------------------------------------------------------------
ALTER TABLE public.internal_stock_requests
  DROP CONSTRAINT IF EXISTS internal_stock_requests_status_check;

ALTER TABLE public.internal_stock_requests
  ADD CONSTRAINT internal_stock_requests_status_check
  CHECK (
    status IN (
      'pending_approval',
      'approved',
      'ready_to_deliver',
      'pending_receive',
      'partially_received',
      'fully_received',
      'rejected'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) create_main_stock_allocation — package proof + reserve, no rider/DR
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_main_stock_allocation(
  p_from_location_id uuid,
  p_items jsonb,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_proof_image_urls text[] DEFAULT NULL,
  p_proof_image_paths text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_allocated_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_allocated_by, auth.uid());
  v_company_id uuid;
  v_is_main_loc boolean;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_count integer := 0;
  v_reserve_lines jsonb;
  v_lines jsonb;
  v_norm RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_proof_image_urls(
    p_proof_image_urls,
    p_proof_image_paths,
    p_proof_image_url,
    p_proof_image_path
  );

  IF v_norm.first_url IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Package photo is required');
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

  IF public.get_main_warehouse_location_id(v_company_id) IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

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

  INSERT INTO public.internal_stock_requests (
    company_id,
    request_number,
    from_location_id,
    status,
    initiation_type,
    notes,
    requested_by,
    proof_image_urls,
    proof_image_paths
  ) VALUES (
    v_company_id,
    v_request_number,
    p_from_location_id,
    'ready_to_deliver',
    'main_allocation',
    nullif(btrim(COALESCE(p_notes, '')), ''),
    v_actor,
    v_norm.urls,
    v_norm.paths
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
      0,
      0,
      0
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
    request_id,
    event_type,
    note,
    lines,
    proof_image_url,
    proof_image_path,
    proof_image_urls,
    proof_image_paths,
    created_by
  ) VALUES (
    v_request_id,
    'main_allocated',
    COALESCE(
      nullif(btrim(COALESCE(p_notes, '')), ''),
      'Allocated by Main Warehouse (awaiting delivery)'
    ),
    v_lines,
    v_norm.first_url,
    v_norm.first_path,
    v_norm.urls,
    v_norm.paths,
    v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'status', 'ready_to_deliver',
    'item_count', v_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.create_main_stock_allocation(
  uuid, jsonb, text, text, text[], text[], text, uuid
) IS
  'Main→sub allocation step 1: package photo required, reserve lots, status ready_to_deliver (no rider/DR).';

GRANT EXECUTE ON FUNCTION public.create_main_stock_allocation(
  uuid, jsonb, text, text, text[], text[], text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) deliver_main_stock_allocation — rider + signature; unlock receive
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deliver_main_stock_allocation(
  p_request_id uuid,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_rider_name text DEFAULT NULL,
  p_rider_plate_number text DEFAULT NULL,
  p_rider_photo_url text DEFAULT NULL,
  p_rider_photo_path text DEFAULT NULL,
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
  v_status text;
  v_initiation text;
  v_lines jsonb;
  v_main_loc_id uuid;
  v_dr_number text;
  v_rider_name text := nullif(btrim(COALESCE(p_rider_name, '')), '');
  v_rider_plate text := nullif(btrim(COALESCE(p_rider_plate_number, '')), '');
  v_rider_photo text := nullif(btrim(COALESCE(p_rider_photo_url, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF v_rider_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider name is required');
  END IF;
  IF v_rider_plate IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider plate number is required');
  END IF;
  IF v_rider_photo IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Rider photo is required');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT r.company_id, r.status, COALESCE(r.initiation_type, 'sub_request')
    INTO v_company_id, v_status, v_initiation
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_initiation <> 'main_allocation' THEN
    RETURN json_build_object('success', false, 'error', 'Not a main warehouse allocation');
  END IF;
  IF v_status <> 'ready_to_deliver' THEN
    RETURN json_build_object('success', false, 'error', 'Allocation is not ready to deliver');
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
  INTO v_lines
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Allocation has no items');
  END IF;

  -- Lots already reserved at create; unlock receive only.
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
      rider_name = v_rider_name,
      rider_plate_number = v_rider_plate,
      rider_photo_url = v_rider_photo,
      rider_photo_path = nullif(btrim(COALESCE(p_rider_photo_path, '')), ''),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines,
    signature_url, signature_path,
    rider_name, rider_plate_number, rider_photo_url, rider_photo_path,
    dr_number,
    created_by
  ) VALUES (
    p_request_id,
    'delivered',
    format('Rider: %s · Plate: %s', v_rider_name, v_rider_plate),
    v_lines,
    p_signature_url,
    p_signature_path,
    v_rider_name,
    v_rider_plate,
    v_rider_photo,
    nullif(btrim(COALESCE(p_rider_photo_path, '')), ''),
    v_dr_number,
    v_actor
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

COMMENT ON FUNCTION public.deliver_main_stock_allocation(
  uuid, text, text, text, text, text, text, uuid
) IS
  'Main→sub allocation step 2: rider + signature; unlock open_receive → pending_receive (no second reserve).';

GRANT EXECUTE ON FUNCTION public.deliver_main_stock_allocation(
  uuid, text, text, text, text, text, text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Attach package URLs for main_allocated events onto the request row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_internal_stock_proof_image_urls(
  p_request_id uuid,
  p_event_type text,
  p_proof_image_urls text[],
  p_proof_image_paths text[] DEFAULT NULL,
  p_receive_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_company_id uuid;
  v_norm RECORD;
  v_event_id uuid;
  v_event_type text := lower(btrim(COALESCE(p_event_type, '')));
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT r.company_id INTO v_company_id
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  SELECT * INTO v_norm
  FROM public.normalize_proof_image_urls(p_proof_image_urls, p_proof_image_paths, NULL, NULL);

  IF v_norm.first_url IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'At least one package photo URL is required');
  END IF;

  SELECT e.id INTO v_event_id
  FROM public.internal_stock_request_events e
  WHERE e.request_id = p_request_id
    AND e.event_type = v_event_type
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_event_id IS NOT NULL THEN
    UPDATE public.internal_stock_request_events
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = v_event_id;
  END IF;

  IF v_event_type IN ('delivered', 'remaining_released', 'main_allocated') THEN
    UPDATE public.internal_stock_requests
    SET proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths,
        updated_at = now()
    WHERE id = p_request_id;
  END IF;

  IF p_receive_id IS NOT NULL THEN
    UPDATE public.internal_stock_request_receives
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = p_receive_id
      AND request_id = p_request_id;
  ELSIF v_event_type = 'receive_confirmed' THEN
    UPDATE public.internal_stock_request_receives
    SET proof_image_url = v_norm.first_url,
        proof_image_path = v_norm.first_path,
        proof_image_urls = v_norm.urls,
        proof_image_paths = v_norm.paths
    WHERE id = (
      SELECT r.id
      FROM public.internal_stock_request_receives r
      WHERE r.request_id = p_request_id
      ORDER BY r.received_at DESC NULLS LAST, r.id DESC
      LIMIT 1
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'event_id', v_event_id,
    'proof_count', COALESCE(cardinality(v_norm.urls), 0)
  );
END;
$$;
