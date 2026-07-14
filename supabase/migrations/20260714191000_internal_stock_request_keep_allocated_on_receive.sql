-- Option A: keep main allocated_stock for received qty (same as allocate_stock_to_sub_warehouse).
-- Receive transfers lots to sub and upserts warehouse_location_inventory, but does NOT
-- reverse the approve reservation. Only confirmed short qty releases allocated_stock.
-- Available stays reduced after fully_received until returned from sub.

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
  v_item RECORD;
  v_short_line integer;
  v_has_notes boolean;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Receive lines are required for inventory transfer';
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(p_company_id);
  IF v_main_loc_id IS NULL THEN
    RAISE EXCEPTION 'Main warehouse location not found';
  END IF;

  v_note := COALESCE(nullif(btrim(COALESCE(p_notes, '')), ''), 'Internal stock request receive');
  v_has_notes := nullif(btrim(COALESCE(p_notes, '')), '') IS NOT NULL;

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

    -- Keep allocated_stock for received qty (Option A). Available stays reduced until
    -- stock is returned from the sub-warehouse via return_stock_from_sub_warehouse_to_main.

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

  -- Release unused reservation when sub confirms a shortage with notes.
  IF v_has_notes THEN
    FOR v_item IN
      SELECT i.variant_id, i.delivered_quantity, i.received_quantity
      FROM public.internal_stock_request_items i
      WHERE i.request_id = p_request_id
    LOOP
      v_short_line := GREATEST(0, v_item.delivered_quantity - v_item.received_quantity);
      IF v_short_line <= 0 THEN
        CONTINUE;
      END IF;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_short_line),
          updated_at = now()
      WHERE company_id = p_company_id
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
        p_company_id,
        v_item.variant_id,
        'internal_stock_request_short_release',
        v_short_line,
        'main_inventory',
        'main_inventory',
        p_actor,
        'internal_stock_requests',
        p_request_id,
        COALESCE(v_note, 'Released unused reservation for confirmed shortage')
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.internal_stock_request_receive_to_sub(uuid, uuid, uuid, jsonb, uuid, text) IS
  'Transfers batch lots main->sub and updates warehouse_location_inventory. Received qty stays on main allocated_stock until returned from sub; short qty releases reservation.';
