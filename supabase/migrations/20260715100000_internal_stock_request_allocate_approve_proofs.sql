-- Require proof photo (+ signature on allocate) for approve and allocate-remaining.
-- Event table already has proof_image_* / signature_* columns.

DROP FUNCTION IF EXISTS public.approve_internal_stock_request(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.allocate_internal_stock_request_remaining(uuid, jsonb, text, uuid);

-- ---------------------------------------------------------------------------
-- approve_internal_stock_request — require proof photo + signature
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_internal_stock_request(
  p_request_id uuid,
  p_signature_url text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
  p_approved_by uuid DEFAULT NULL,
  p_proof_image_url text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := COALESCE(p_approved_by, auth.uid());
  v_company_id uuid;
  v_status text;
  v_lines jsonb;
  v_reserve_lines jsonb;
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
  IF v_status <> 'pending_approval' THEN
    RETURN json_build_object('success', false, 'error', 'Request is not pending approval');
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
      approved_at = now(),
      approved_by = v_actor,
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
    p_request_id, 'approved_released', v_lines, p_proof_image_url, p_proof_image_path,
    p_signature_url, p_signature_path, v_actor
  );

  RETURN json_build_object('success', true, 'request_id', p_request_id, 'status', 'pending_receive');
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_internal_stock_request(uuid, text, text, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- allocate_internal_stock_request_remaining — require proof + signature
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_internal_stock_request_remaining(
  p_request_id uuid,
  p_lines jsonb,
  p_proof_image_url text,
  p_signature_url text,
  p_note text DEFAULT NULL,
  p_proof_image_path text DEFAULT NULL,
  p_signature_path text DEFAULT NULL,
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
  v_status text;
  v_line jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_allocatable integer;
  v_open integer;
  v_history jsonb := '[]'::jsonb;
  v_reserve_lines jsonb := '[]'::jsonb;
  v_total integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF NOT public.is_main_warehouse_user(v_actor) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;
  IF p_proof_image_url IS NULL OR btrim(p_proof_image_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Proof image is required');
  END IF;
  IF p_signature_url IS NULL OR btrim(p_signature_url) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Signature is required');
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Allocate lines are required');
  END IF;

  SELECT r.company_id, r.status INTO v_company_id, v_status
  FROM public.internal_stock_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.get_auth_company_id() THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;
  IF v_status <> 'partially_received' THEN
    RETURN json_build_object('success', false, 'error', 'Only partially received requests can allocate remaining');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT GREATEST(0, (i.delivered_quantity - i.received_quantity) - i.open_receive_quantity),
           i.open_receive_quantity
      INTO v_allocatable, v_open
    FROM public.internal_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant not on request');
    END IF;

    IF v_qty > v_allocatable THEN
      RETURN json_build_object(
        'success', false,
        'error', format('Cannot allocate more than %s for a line', v_allocatable)
      );
    END IF;

    v_reserve_lines := v_reserve_lines || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
  END LOOP;

  IF jsonb_array_length(v_reserve_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to allocate');
  END IF;

  PERFORM public.internal_stock_request_assert_main_available(v_company_id, v_reserve_lines);
  PERFORM public.internal_stock_request_reserve_main(
    v_company_id,
    p_request_id,
    v_reserve_lines,
    v_actor,
    COALESCE(nullif(btrim(COALESCE(p_note, '')), ''), 'Allocated remaining short for internal stock request')
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.internal_stock_request_items
    SET open_receive_quantity = open_receive_quantity + v_qty,
        updated_at = now()
    WHERE request_id = p_request_id AND variant_id = v_variant_id;

    v_history := v_history || jsonb_build_array(
      jsonb_build_object('variant_id', v_variant_id, 'quantity', v_qty)
    );
    v_total := v_total + v_qty;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Nothing to allocate');
  END IF;

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines,
    proof_image_url, proof_image_path, signature_url, signature_path, created_by
  ) VALUES (
    p_request_id,
    'remaining_released',
    COALESCE(nullif(btrim(COALESCE(p_note, '')), ''), format('Allocated %s unit(s) of remaining short', v_total)),
    v_history,
    p_proof_image_url,
    p_proof_image_path,
    p_signature_url,
    p_signature_path,
    v_actor
  );

  RETURN json_build_object(
    'success', true,
    'request_id', p_request_id,
    'allocated', v_total,
    'status', 'partially_received'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_internal_stock_request_remaining(uuid, jsonb, text, text, text, text, text, uuid) TO authenticated;
