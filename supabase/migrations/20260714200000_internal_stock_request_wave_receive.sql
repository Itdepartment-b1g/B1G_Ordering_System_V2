-- Wave-based partial receive:
-- After a receive that leaves the request partially_received, clear leftover
-- open_receive_quantity so the sub cannot confirm again until main allocates.

CREATE OR REPLACE FUNCTION public.confirm_internal_stock_request_receive(
  p_request_id uuid,
  p_lines jsonb,
  p_proof_image_url text,
  p_signature_url text,
  p_notes text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_proof_image_name text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_received_by, auth.uid());
  v_company_id uuid;
  v_from_location uuid;
  v_status text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_open integer;
  v_received integer;
  v_delivered integer;
  v_history jsonb := '[]'::jsonb;
  v_short integer := 0;
  v_any_open boolean;
  v_any_short boolean;
  v_next_status text;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Receive lines are required');
  END IF;

  SELECT r.company_id, r.from_location_id, r.status
    INTO v_company_id, v_from_location, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Request is not awaiting receive');
  END IF;

  IF NOT public.is_main_warehouse_user(v_actor)
     AND v_from_location IS DISTINCT FROM public.get_warehouse_location_id(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Only the requesting sub-warehouse can confirm receive');
  END IF;

  -- Pre-validate lines and whether shortage notes will be required before mutating rows.
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT i.open_receive_quantity, i.received_quantity, i.delivered_quantity
      INTO v_open, v_received, v_delivered
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;
    IF v_qty > v_open THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity exceeds unlocked quantity');
    END IF;

    v_history := v_history || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
  END LOOP;

  IF jsonb_array_length(v_history) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing received');
  END IF;

  SELECT
    COALESCE(SUM(
      GREATEST(
        0,
        i.delivered_quantity - (i.received_quantity + COALESCE((
          SELECT (elem->>'quantity')::integer
          FROM jsonb_array_elements(v_history) elem
          WHERE NULLIF(elem->>'variant_id', '')::uuid = i.variant_id
          LIMIT 1
        ), 0))
      )
    ), 0)
  INTO v_short
  FROM public.internal_stock_request_items i
  WHERE i.request_id = p_request_id;

  IF v_short > 0 AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RETURN json_build_object('success', false, 'error', 'Notes are required when confirming a shortage');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT i.open_receive_quantity, i.received_quantity, i.delivered_quantity
      INTO v_open, v_received, v_delivered
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;
    IF v_qty > v_open THEN
      RETURN json_build_object('success', false, 'error', 'Receive quantity exceeds unlocked quantity');
    END IF;

    UPDATE public.internal_stock_request_items
    SET received_quantity = received_quantity + v_qty,
        open_receive_quantity = open_receive_quantity - v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;
  END LOOP;

  SELECT
    COALESCE(SUM(GREATEST(0, delivered_quantity - received_quantity)), 0),
    bool_or(open_receive_quantity > 0),
    bool_or(delivered_quantity > received_quantity)
  INTO v_short, v_any_open, v_any_short
  FROM public.internal_stock_request_items
  WHERE request_id = p_request_id;

  IF NOT v_any_short THEN
    v_next_status := 'fully_received';
  ELSE
    v_next_status := 'partially_received';
  END IF;

  -- Lock leftover short until main allocates the next wave.
  IF v_next_status = 'partially_received' THEN
    UPDATE public.internal_stock_request_items
    SET open_receive_quantity = 0,
        updated_at = now()
    WHERE request_id = p_request_id;
    v_any_open := false;
  END IF;

  PERFORM public.internal_stock_request_receive_to_sub(
    v_company_id,
    v_from_location,
    p_request_id,
    v_history,
    v_actor,
    p_notes
  );

  UPDATE public.internal_stock_requests
  SET status = v_next_status,
      receive_notes = COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), receive_notes),
      updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.internal_stock_request_receives (
    request_id, notes, lines, proof_image_url, proof_image_path, proof_image_name,
    signature_url, signature_path, short_quantity, received_by
  ) VALUES (
    p_request_id,
    nullif(btrim(COALESCE(p_notes, '')), ''),
    v_history,
    p_proof_image_url,
    p_proof_image_path,
    p_proof_image_name,
    p_signature_url,
    p_signature_path,
    v_short,
    v_actor
  );

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, short_quantity,
    proof_image_url, proof_image_path, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id, 'receive_confirmed', nullif(btrim(COALESCE(p_notes, '')), ''), v_history, v_short,
    p_proof_image_url, p_proof_image_path, p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', v_next_status,
    'short_quantity', v_short,
    'has_open_receive', COALESCE(v_any_open, false)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) IS
  'Confirms sub receive. On partially_received, clears open_receive so main must allocate the next wave.';

-- Repair stuck rows: leftover open covering full short without a post-receive allocate.
UPDATE public.internal_stock_request_items i
SET open_receive_quantity = 0,
    updated_at = now()
FROM public.internal_stock_requests r
WHERE i.request_id = r.id
  AND r.status = 'partially_received'
  AND i.open_receive_quantity > 0
  AND i.open_receive_quantity >= GREATEST(0, i.delivered_quantity - i.received_quantity)
  AND NOT EXISTS (
    SELECT 1
    FROM public.internal_stock_request_events e_alloc
    WHERE e_alloc.request_id = r.id
      AND e_alloc.event_type = 'remaining_released'
      AND e_alloc.created_at > COALESCE(
        (
          SELECT MAX(e_recv.created_at)
          FROM public.internal_stock_request_events e_recv
          WHERE e_recv.request_id = r.id
            AND e_recv.event_type = 'receive_confirmed'
        ),
        '-infinity'::timestamptz
      )
  );
