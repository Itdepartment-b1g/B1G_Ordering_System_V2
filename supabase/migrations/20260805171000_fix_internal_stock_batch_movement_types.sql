-- Fix batch movement types to match inventory_batch_movements_movement_type_check.
-- Allowed internal types: internal_request_out, internal_request_in, return_in (not
-- internal_request_allocate_out / internal_request_return_in).

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
