-- Lower main Total Stock when approving / allocating remaining internal requests.
-- Available (= stock - allocated) falls with Total because we decrement stock only
-- (we do not also bump allocated_stock, which would double-count Available).
--
-- On wave receive: restore only unused unlock for this wave (leftover open_receive),
-- not the entire request short (delivered - received).

-- ---------------------------------------------------------------------------
-- 1) reserve_main — decrement stock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_stock_request_reserve_main(
  p_company_id uuid,
  p_request_id uuid,
  p_lines jsonb,
  p_actor uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_note text;
  v_stock integer;
  v_allocated integer;
  v_available integer;
BEGIN
  v_note := COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), 'Released for internal stock request');

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_quantity := COALESCE((v_line->>'quantity')::integer, 0);

    IF v_variant_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT mi.stock, COALESCE(mi.allocated_stock, 0)
      INTO v_stock, v_allocated
    FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id
      AND mi.variant_id = v_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % is not stocked at main warehouse', v_variant_id;
    END IF;

    v_available := GREATEST(0, COALESCE(v_stock, 0) - v_allocated);
    IF v_available < v_quantity THEN
      RAISE EXCEPTION
        'Insufficient available stock for variant % (need %, have %)',
        v_variant_id, v_quantity, v_available;
    END IF;

    UPDATE public.main_inventory
    SET stock = GREATEST(0, COALESCE(stock, 0) - v_quantity),
        updated_at = now()
    WHERE company_id = p_company_id
      AND variant_id = v_variant_id;

    INSERT INTO public.inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      p_company_id,
      v_variant_id,
      'internal_stock_request_reserve',
      v_quantity,
      'main_inventory',
      CONCAT('internal_stock_request:', p_request_id),
      p_actor,
      'internal_stock_requests',
      p_request_id,
      v_note
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_stock_request_reserve_main(uuid, uuid, jsonb, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.internal_stock_request_reserve_main(uuid, uuid, jsonb, uuid, text) IS
  'Decrements main_inventory.stock for internal stock request approve / allocate-remaining so Total and Available fall on release.';

-- ---------------------------------------------------------------------------
-- 2) receive_to_sub — lot transfer only (no short stock restore here)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_stock_request_receive_to_sub(
  p_company_id uuid,
  p_from_location_id uuid,
  p_request_id uuid,
  p_lines jsonb,
  p_actor uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_main_loc_id uuid;
  v_transfer_result jsonb;
  v_note text;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Receive lines are required for inventory transfer';
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(p_company_id);
  IF v_main_loc_id IS NULL THEN
    RAISE EXCEPTION 'Main warehouse location not found';
  END IF;

  v_note := COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), 'Internal stock request receive');

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_quantity := COALESCE(
      (v_line->>'quantity')::integer,
      (v_line->>'quantity_this_receive')::integer,
      0
    );

    IF v_variant_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_transfer_result := public.transfer_inventory_lots(
      p_company_id,
      v_main_loc_id,
      p_from_location_id,
      v_variant_id,
      v_quantity,
      'fifo_fefo',
      'internal_request_out',
      'internal_request_in',
      'internal_stock_requests',
      p_request_id,
      p_actor,
      v_note
    );

    IF NOT COALESCE((v_transfer_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_transfer_result->>'error', 'Batch lot transfer failed');
    END IF;

    INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock)
    VALUES (p_company_id, p_from_location_id, v_variant_id, v_quantity)
    ON CONFLICT (location_id, variant_id)
    DO UPDATE SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
                  updated_at = now();

    INSERT INTO public.inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      reference_type,
      reference_id,
      notes
    ) VALUES (
      p_company_id,
      v_variant_id,
      'internal_stock_request_receive',
      v_quantity,
      'main_inventory',
      CONCAT('warehouse_location:', p_from_location_id),
      p_actor,
      'internal_stock_requests',
      p_request_id,
      v_note
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) IS
  'Transfers batch lots main->sub and updates warehouse_location_inventory. Stock restore for unused unlock is handled in confirm_internal_stock_request_receive.';

-- ---------------------------------------------------------------------------
-- 3) confirm receive — restore leftover unlock to main stock before clearing
-- ---------------------------------------------------------------------------
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
  v_unused integer;
  v_item RECORD;
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

  -- Restore unused unlock for this wave to main Total Stock, then lock leftover short.
  IF v_next_status = 'partially_received' THEN
    FOR v_item IN
      SELECT i.variant_id, i.open_receive_quantity
      FROM public.internal_stock_request_items i
      WHERE i.request_id = p_request_id
        AND i.open_receive_quantity > 0
    LOOP
      v_unused := v_item.open_receive_quantity;

      UPDATE public.main_inventory
      SET stock = COALESCE(stock, 0) + v_unused,
          updated_at = now()
      WHERE company_id = v_company_id
        AND variant_id = v_item.variant_id;

      INSERT INTO public.inventory_transactions (
        company_id,
        variant_id,
        transaction_type,
        quantity,
        from_location,
        to_location,
        performed_by,
        reference_type,
        reference_id,
        notes
      ) VALUES (
        v_company_id,
        v_item.variant_id,
        'internal_stock_request_short_release',
        v_unused,
        'main_inventory',
        'main_inventory',
        v_actor,
        'internal_stock_requests',
        p_request_id,
        COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), 'Restored main stock for unused unlock this wave')
      );
    END LOOP;

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
    'short_quantity', v_short
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_internal_stock_request_receive(
  uuid, jsonb, text, text, text, text, text, text, uuid
) TO authenticated;
