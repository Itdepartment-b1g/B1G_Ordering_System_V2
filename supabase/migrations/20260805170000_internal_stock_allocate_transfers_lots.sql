-- Internal stock requests: deduct batch lots from main at allocate/deliver,
-- but sub warehouse inventory (batch lots + location stock) only on confirmed receive.
-- Pending lot slices between allocate and receive live in internal_stock_request_pending_lots.

-- ---------------------------------------------------------------------------
-- 0) pending lot pool (allocated off main, not yet received at sub)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_stock_request_pending_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  request_id uuid NOT NULL REFERENCES public.internal_stock_requests(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  quantity_pending integer NOT NULL CHECK (quantity_pending >= 0),
  source_received_at timestamptz,
  manufactured_date date,
  expiration_date date,
  unit_cost numeric,
  source_lot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_stock_request_pending_lots_pending_lte_qty
    CHECK (quantity_pending <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_internal_stock_request_pending_lots_request_variant
  ON public.internal_stock_request_pending_lots (request_id, variant_id)
  WHERE quantity_pending > 0;

ALTER TABLE public.internal_stock_request_pending_lots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.internal_stock_request_pending_lots IS
  'Batch slices consumed from main at allocate/deliver, fulfilled to sub on receive or returned to main on shortage resolve.';

-- ---------------------------------------------------------------------------
-- Helper: insert batch lots at a warehouse location (no main_inventory.stock change)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_stock_request_insert_location_lots(
  p_company_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_batch_id uuid,
  p_quantity integer,
  p_received_at timestamptz,
  p_manufactured_date date,
  p_expiration_date date,
  p_unit_cost numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_performed_by uuid,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_dest_lot_id uuid;
  v_line_amount numeric(14, 2);
BEGIN
  v_line_amount := CASE
    WHEN p_unit_cost IS NOT NULL THEN round((p_quantity::numeric * p_unit_cost), 2)
    ELSE NULL
  END;

  SELECT ibl.id INTO v_dest_lot_id
  FROM public.inventory_batch_lots ibl
  WHERE ibl.batch_id = p_batch_id
    AND ibl.variant_id = p_variant_id
    AND ibl.warehouse_location_id = p_location_id
    AND ibl.manufactured_date IS NOT DISTINCT FROM p_manufactured_date
    AND ibl.expiration_date IS NOT DISTINCT FROM p_expiration_date
    AND ibl.unit_cost IS NOT DISTINCT FROM p_unit_cost
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.inventory_batch_lots
    SET quantity_received = quantity_received + p_quantity,
        quantity_remaining = quantity_remaining + p_quantity,
        line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
        updated_at = now()
    WHERE id = v_dest_lot_id;
  ELSE
    INSERT INTO public.inventory_batch_lots (
      company_id, batch_id, variant_id, warehouse_location_id,
      quantity_received, quantity_remaining, received_at,
      manufactured_date, expiration_date, unit_cost, line_amount
    ) VALUES (
      p_company_id, p_batch_id, p_variant_id, p_location_id,
      p_quantity, p_quantity, COALESCE(p_received_at, now()),
      p_manufactured_date, p_expiration_date, p_unit_cost, v_line_amount
    )
    RETURNING id INTO v_dest_lot_id;
  END IF;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    to_location_id, performed_by, notes
  ) VALUES (
    p_company_id, v_dest_lot_id, p_batch_id, p_variant_id, p_location_id,
    p_movement_type, p_quantity, p_reference_type, p_reference_id,
    p_location_id, p_performed_by, p_notes
  );

  RETURN v_dest_lot_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: return pending slices back to main (shortage resolve)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_stock_request_return_pending_lots_to_main(
  p_company_id uuid,
  p_request_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_main_loc_id uuid,
  p_actor uuid,
  p_notes text,
  p_reference_type text,
  p_reference_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
  v_row RECORD;
  v_take integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', true, 'quantity', 0);
  END IF;

  v_remaining := p_quantity;

  FOR v_row IN
    SELECT *
    FROM public.internal_stock_request_pending_lots pl
    WHERE pl.request_id = p_request_id
      AND pl.variant_id = p_variant_id
      AND pl.quantity_pending > 0
    ORDER BY
      pl.source_received_at ASC NULLS LAST,
      pl.batch_id ASC,
      pl.expiration_date ASC NULLS LAST,
      pl.created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_row.quantity_pending, v_remaining);

    PERFORM public.internal_stock_request_insert_location_lots(
      p_company_id,
      p_main_loc_id,
      p_variant_id,
      v_row.batch_id,
      v_take,
      v_row.source_received_at,
      v_row.manufactured_date,
      v_row.expiration_date,
      v_row.unit_cost,
      'return_in',
      p_reference_type,
      p_reference_id,
      p_actor,
      p_notes
    );

    UPDATE public.internal_stock_request_pending_lots
    SET quantity_pending = quantity_pending - v_take
    WHERE id = v_row.id;

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient pending allocated lots to return to main',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'quantity', p_quantity);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) reserve_main — consume main batch lots + allocated_stock += (sub inventory later)
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
  v_main_loc_id uuid;
  v_consume_result jsonb;
  v_item jsonb;
  v_lot RECORD;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No lines to reserve';
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(p_company_id);
  IF v_main_loc_id IS NULL THEN
    RAISE EXCEPTION 'Main warehouse location not found';
  END IF;

  v_note := COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), 'Reserved for internal stock request');

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_quantity := COALESCE((v_line->>'quantity')::integer, 0);

    IF v_variant_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    v_consume_result := public.consume_inventory_lots_fifo_fefo(
      p_company_id,
      v_main_loc_id,
      v_variant_id,
      v_quantity,
      'internal_request_out',
      'internal_stock_requests',
      p_request_id,
      p_actor,
      v_note
    );

    IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_consume_result->>'error', 'Failed to consume batch lots at main warehouse');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_consume_result->'consumed', '[]'::jsonb))
    LOOP
      SELECT ibl.batch_id, ibl.received_at, ibl.manufactured_date, ibl.expiration_date, ibl.unit_cost
        INTO v_lot
      FROM public.inventory_batch_lots ibl
      WHERE ibl.id = NULLIF(v_item->>'lot_id', '')::uuid;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Consumed lot metadata not found';
      END IF;

      INSERT INTO public.internal_stock_request_pending_lots (
        company_id,
        request_id,
        variant_id,
        batch_id,
        quantity,
        quantity_pending,
        source_received_at,
        manufactured_date,
        expiration_date,
        unit_cost,
        source_lot_id
      ) VALUES (
        p_company_id,
        p_request_id,
        v_variant_id,
        v_lot.batch_id,
        (v_item->>'quantity')::integer,
        (v_item->>'quantity')::integer,
        v_lot.received_at,
        v_lot.manufactured_date,
        v_lot.expiration_date,
        v_lot.unit_cost,
        NULLIF(v_item->>'lot_id', '')::uuid
      );
    END LOOP;

    UPDATE public.main_inventory
    SET allocated_stock = COALESCE(allocated_stock, 0) + v_quantity,
        updated_at = now()
    WHERE company_id = p_company_id
      AND variant_id = v_variant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % is not stocked at main warehouse', v_variant_id;
    END IF;

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

COMMENT ON FUNCTION public.internal_stock_request_reserve_main(uuid, uuid, jsonb, uuid, text) IS
  'Consume main batch lots at allocate/deliver (allocated_stock +=). Sub inventory is updated on receive.';

-- ---------------------------------------------------------------------------
-- 2) receive_to_sub — fulfill pending lots into sub (received qty only)
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
  v_remaining integer;
  v_take integer;
  v_note text;
  v_row RECORD;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Receive lines are required for inventory transfer';
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

    v_remaining := v_quantity;

    FOR v_row IN
      SELECT *
      FROM public.internal_stock_request_pending_lots pl
      WHERE pl.request_id = p_request_id
        AND pl.variant_id = v_variant_id
        AND pl.quantity_pending > 0
      ORDER BY
        pl.source_received_at ASC NULLS LAST,
        pl.batch_id ASC,
        pl.expiration_date ASC NULLS LAST,
        pl.created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_take := LEAST(v_row.quantity_pending, v_remaining);

      PERFORM public.internal_stock_request_insert_location_lots(
        p_company_id,
        p_from_location_id,
        v_variant_id,
        v_row.batch_id,
        v_take,
        v_row.source_received_at,
        v_row.manufactured_date,
        v_row.expiration_date,
        v_row.unit_cost,
        'internal_request_in',
        'internal_stock_requests',
        p_request_id,
        p_actor,
        v_note
      );

      UPDATE public.internal_stock_request_pending_lots
      SET quantity_pending = quantity_pending - v_take
      WHERE id = v_row.id;

      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Insufficient pending allocated lots for variant % (short %)', v_variant_id, v_remaining;
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

COMMENT ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) IS
  'Fulfill pending allocated lots into sub warehouse inventory for the qty actually received.';

-- ---------------------------------------------------------------------------
-- 3) shortage resolve — return unreceived pending lots to main; release reservation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_internal_stock_request_discrepancy(
  p_discrepancy_id uuid,
  p_resolution text,
  p_notes text DEFAULT NULL,
  p_resolved_by uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  disc RECORD;
  v_resolver RECORD;
  v_resolution text;
  v_status text;
  v_event_type text;
  v_notes text;
  v_any_short boolean;
  v_next_request_status text;
  v_delivered integer;
  v_received integer;
  v_open integer;
  v_new_delivered integer;
  v_release_note text;
  v_main_loc_id uuid;
  v_return_result jsonb;
BEGIN
  v_resolution := lower(btrim(COALESCE(p_resolution, '')));
  IF v_resolution IN ('found_redeliver', 'restore_redeliver') THEN
    v_resolution := 'redeliver';
  END IF;
  IF v_resolution IN ('lost_replace', 'write_off_and_replace') THEN
    v_resolution := 'write_off_replace';
  END IF;

  IF v_resolution NOT IN ('redeliver', 'write_off_replace', 'write_off') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Resolution must be redeliver, write_off_replace, or write_off'
    );
  END IF;

  v_notes := nullif(btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Resolution notes are required');
  END IF;

  SELECT * INTO disc
  FROM public.internal_stock_request_discrepancies
  WHERE id = p_discrepancy_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy not found');
  END IF;

  IF disc.status <> 'open' THEN
    RETURN json_build_object('success', false, 'error', 'Discrepancy is already resolved');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_resolver
  FROM public.profiles p
  WHERE p.id = p_resolved_by;

  IF NOT FOUND
     OR v_resolver.role IS DISTINCT FROM 'warehouse'
     OR v_resolver.company_id IS DISTINCT FROM disc.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse staff for this hub can resolve shortages');
  END IF;

  IF NOT public.is_main_warehouse_user(p_resolved_by) THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse access required');
  END IF;

  SELECT i.delivered_quantity, i.received_quantity, i.open_receive_quantity
    INTO v_delivered, v_received, v_open
  FROM public.internal_stock_request_items i
  WHERE i.request_id = disc.request_id AND i.variant_id = disc.variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request line not found');
  END IF;

  v_status := CASE v_resolution
    WHEN 'redeliver' THEN 'resolved_redeliver'
    WHEN 'write_off_replace' THEN 'resolved_write_off_replace'
    ELSE 'resolved_write_off'
  END;

  v_event_type := CASE v_resolution
    WHEN 'redeliver' THEN 'shortage_resolved_redeliver'
    WHEN 'write_off_replace' THEN 'shortage_resolved_write_off_replace'
    ELSE 'shortage_resolved_write_off'
  END;

  IF v_resolution IN ('redeliver', 'write_off_replace', 'write_off') THEN
    v_main_loc_id := public.get_main_warehouse_location_id(disc.company_id);
    IF v_main_loc_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
    END IF;

    v_return_result := public.internal_stock_request_return_pending_lots_to_main(
      disc.company_id,
      disc.request_id,
      disc.variant_id,
      disc.quantity,
      v_main_loc_id,
      p_resolved_by,
      v_notes,
      'internal_stock_request_discrepancies',
      p_discrepancy_id
    );

    IF NOT COALESCE((v_return_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_return_result->>'error', 'Failed to return pending lots to main warehouse')
      );
    END IF;

    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - disc.quantity),
        updated_at = now()
    WHERE company_id = disc.company_id
      AND variant_id = disc.variant_id;

    v_release_note := CASE v_resolution
      WHEN 'redeliver' THEN
        'Shortage found — returned pending lots to main; Allocate Remaining to re-deliver'
      WHEN 'write_off_replace' THEN
        'Shortage write-off & replace — returned pending lots to main'
      ELSE
        'Shortage write-off — returned pending lots to main'
    END || COALESCE(' — ' || v_notes, '');

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
      disc.company_id,
      disc.variant_id,
      'internal_stock_request_short_release',
      disc.quantity,
      CONCAT('internal_stock_request:', disc.request_id),
      'main_inventory',
      p_resolved_by,
      'internal_stock_requests',
      disc.request_id,
      v_release_note
    );

    IF v_resolution = 'write_off' THEN
      v_new_delivered := GREATEST(v_received, v_delivered - disc.quantity);
      UPDATE public.internal_stock_request_items
      SET delivered_quantity = v_new_delivered,
          updated_at = now()
      WHERE request_id = disc.request_id AND variant_id = disc.variant_id;
    END IF;
  END IF;

  UPDATE public.internal_stock_request_discrepancies
  SET status = v_status,
      resolved_by = p_resolved_by,
      resolved_at = now(),
      resolution_notes = v_notes,
      updated_at = now()
  WHERE id = p_discrepancy_id;

  SELECT bool_or(delivered_quantity > received_quantity)
    INTO v_any_short
  FROM public.internal_stock_request_items
  WHERE request_id = disc.request_id;

  IF COALESCE(v_any_short, false) THEN
    v_next_request_status := 'partially_received';
  ELSE
    v_next_request_status := 'fully_received';
  END IF;

  UPDATE public.internal_stock_requests
  SET status = v_next_request_status,
      updated_at = now()
  WHERE id = disc.request_id
    AND status IN ('pending_receive', 'partially_received', 'fully_received');

  INSERT INTO public.internal_stock_request_events (
    request_id, event_type, note, lines, short_quantity,
    discrepancy_id, created_by
  ) VALUES (
    disc.request_id,
    v_event_type,
    v_notes,
    jsonb_build_array(
      jsonb_build_object(
        'variant_id', disc.variant_id,
        'quantity', disc.quantity,
        'resolution', v_resolution
      )
    ),
    disc.quantity,
    p_discrepancy_id,
    p_resolved_by
  );

  RETURN json_build_object(
    'success', true,
    'discrepancy_id', p_discrepancy_id,
    'resolution', v_resolution,
    'status', v_status,
    'quantity', disc.quantity,
    'request_status', v_next_request_status
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.resolve_internal_stock_request_discrepancy(uuid, text, text, uuid) IS
  'Resolve sub-stock shortage: return unreceived pending lots to main and release reservation; re-deliver via Allocate Remaining.';

GRANT EXECUTE ON FUNCTION public.internal_stock_request_insert_location_lots(
  uuid, uuid, uuid, uuid, integer, timestamptz, date, date, numeric, text, text, uuid, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_stock_request_return_pending_lots_to_main(
  uuid, uuid, uuid, integer, uuid, uuid, text, text, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_stock_request_reserve_main(uuid, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_internal_stock_request_discrepancy(uuid, text, text, uuid) TO authenticated;
