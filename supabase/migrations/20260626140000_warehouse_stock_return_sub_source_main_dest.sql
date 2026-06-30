-- Stock returns: sub picks source lot (batch+expiry) at submit; main picks destination lot at inspect.

-- ---------------------------------------------------------------------------
-- 1) Schema (idempotent if prior migrations applied)
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_stock_return_receipt_lines
  ADD COLUMN IF NOT EXISTS source_lot_id uuid
  REFERENCES public.inventory_batch_lots(id) ON DELETE SET NULL;

ALTER TABLE public.warehouse_stock_return_receipt_lines
  ADD COLUMN IF NOT EXISTS destination_lot_id uuid
  REFERENCES public.inventory_batch_lots(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_warehouse_stock_return_request_items_request_variant;
DROP INDEX IF EXISTS public.idx_warehouse_stock_return_request_items_request_lot;

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_stock_return_request_items_request_variant
  ON public.warehouse_stock_return_request_items (request_id, variant_id)
  WHERE lot_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_stock_return_request_items_request_lot
  ON public.warehouse_stock_return_request_items (request_id, lot_id)
  WHERE lot_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Deduct a single batch lot (sub-warehouse source on return inspect)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_inventory_lot(
  p_lot_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_to_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot RECORD;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  SELECT * INTO v_lot
  FROM public.inventory_batch_lots ibl
  WHERE ibl.id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Batch lot not found');
  END IF;

  IF v_lot.quantity_remaining < p_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient quantity in selected batch lot',
      'available', v_lot.quantity_remaining
    );
  END IF;

  UPDATE public.inventory_batch_lots
  SET quantity_remaining = quantity_remaining - p_quantity,
      updated_at = now()
  WHERE id = p_lot_id;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    from_location_id, to_location_id, performed_by, notes
  ) VALUES (
    v_lot.company_id, v_lot.id, v_lot.batch_id, v_lot.variant_id, v_lot.warehouse_location_id,
    p_movement_type, p_quantity, p_reference_type, p_reference_id,
    v_lot.warehouse_location_id, p_to_location_id, p_performed_by, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot.id,
    'batch_id', v_lot.batch_id,
    'quantity', p_quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_lot(
  uuid, integer, text, text, uuid, uuid, text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2b) LIFO deduct at sub (legacy variant-only return lines)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_inventory_lots_lifo(
  p_company_id uuid,
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_to_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
  v_lot RECORD;
  v_take integer;
  v_deducted jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  v_remaining := p_quantity;

  FOR v_lot IN
    SELECT ibl.*
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = p_company_id
      AND ibl.warehouse_location_id = p_warehouse_location_id
      AND ibl.variant_id = p_variant_id
      AND ibl.quantity_remaining > 0
    ORDER BY ibl.received_at DESC, ibl.created_at DESC
    FOR UPDATE OF ibl
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_lot.quantity_remaining, v_remaining);

    UPDATE public.inventory_batch_lots
    SET quantity_remaining = quantity_remaining - v_take,
        updated_at = now()
    WHERE id = v_lot.id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      from_location_id, to_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot.id, v_lot.batch_id, p_variant_id, p_warehouse_location_id,
      p_movement_type, v_take, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_to_location_id, p_performed_by, p_notes
    );

    v_deducted := v_deducted || jsonb_build_object(
      'lot_id', v_lot.id,
      'batch_id', v_lot.batch_id,
      'quantity', v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient batch lot stock at sub-warehouse',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'deducted', v_deducted, 'quantity', p_quantity);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_lots_lifo(
  uuid, uuid, uuid, integer, text, text, uuid, uuid, text, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) create_warehouse_stock_return_request — items: [{ lot_id, quantity }]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_warehouse_stock_return_request(
  p_from_location_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator uuid;
  v_company_id uuid;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_lot_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_lot RECORD;
  v_pending integer;
  v_available integer;
  v_loc_stock integer;
  v_line_count integer := 0;
  v_variant_totals jsonb := '{}'::jsonb;
  v_vid text;
  v_vtotal integer;
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_from_location_id
    AND COALESCE(wl.is_main, false) = false;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_creator)
      AND v_company_id = public.get_auth_company_id()
    )
    OR (
      public.is_warehouse()
      AND EXISTS (
        SELECT 1 FROM public.warehouse_location_users wlu
        WHERE wlu.user_id = v_creator
          AND wlu.location_id = p_from_location_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_lot_id := (v_item->>'lot_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_lot_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line requires lot_id and a positive quantity');
    END IF;

    SELECT ibl.* INTO v_lot
    FROM public.inventory_batch_lots ibl
    WHERE ibl.id = v_lot_id
      AND ibl.company_id = v_company_id
      AND ibl.warehouse_location_id = p_from_location_id
      AND ibl.quantity_remaining > 0;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot not found at this sub-warehouse');
    END IF;

    v_pending := public.get_pending_stock_return_qty_for_lot(v_lot_id);
    v_available := v_lot.quantity_remaining - v_pending;

    IF v_quantity > v_available THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Return quantity exceeds available batch lot quantity (including pending returns)',
        'lot_id', v_lot_id,
        'available', v_available
      );
    END IF;

    v_variant_id := v_lot.variant_id;
    v_vid := v_variant_id::text;
    v_vtotal := COALESCE((v_variant_totals->>v_vid)::integer, 0) + v_quantity;
    v_variant_totals := jsonb_set(v_variant_totals, ARRAY[v_vid], to_jsonb(v_vtotal), true);

    v_line_count := v_line_count + 1;
  END LOOP;

  FOR v_vid, v_vtotal IN
    SELECT key, (value)::text::integer FROM jsonb_each(v_variant_totals)
  LOOP
    SELECT wli.stock INTO v_loc_stock
    FROM public.warehouse_location_inventory wli
    WHERE wli.location_id = p_from_location_id
      AND wli.variant_id = v_vid::uuid
      AND wli.company_id = v_company_id;

    IF v_loc_stock IS NULL OR v_loc_stock < v_vtotal THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient sub-warehouse stock for a variant total');
    END IF;
  END LOOP;

  v_request_number := public.generate_warehouse_stock_return_number(v_company_id);

  INSERT INTO public.warehouse_stock_return_requests (
    company_id, request_number, from_location_id, status, notes, created_by
  ) VALUES (
    v_company_id, v_request_number, p_from_location_id, 'pending_receive',
    NULLIF(trim(p_notes), ''), v_creator
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_lot_id := (v_item->>'lot_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    SELECT variant_id INTO v_variant_id
    FROM public.inventory_batch_lots
    WHERE id = v_lot_id;

    INSERT INTO public.warehouse_stock_return_request_items (
      request_id, variant_id, lot_id, return_quantity
    ) VALUES (
      v_request_id, v_variant_id, v_lot_id, v_quantity
    );

    UPDATE public.warehouse_location_inventory
    SET stock = stock - v_quantity,
        updated_at = now()
    WHERE location_id = p_from_location_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'line_count', v_line_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) receive — deduct sub source lot; credit main destination lot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_warehouse_stock_return_request(
  p_request_id uuid,
  p_lines jsonb,
  p_notes text DEFAULT NULL,
  p_received_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_receiver uuid;
  v_main_loc_id uuid;
  v_receipt_id uuid;
  v_received_at timestamptz;
  v_line jsonb;
  v_request_item_id uuid;
  v_variant_id uuid;
  v_qty_good integer;
  v_qty_damaged integer;
  v_item RECORD;
  v_remaining integer;
  v_total_qty integer;
  v_deduct_result jsonb;
  v_consume_result jsonb;
  v_dest_lot_id uuid;
  v_source_lot_id uuid;
  v_source_lot RECORD;
  v_destination_lot_id uuid;
  v_destination_lot RECORD;
  v_line_amount numeric(14, 2);
  v_all_complete boolean;
  v_total_inspected integer := 0;
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.warehouse_stock_return_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_receiver)
      AND v_request.company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can receive returns');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Return request is not open for receiving');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_request.company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Inspection lines are required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

    IF v_request_item_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid inspection line');
    END IF;
    IF v_destination_lot_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Main warehouse batch lot selection is required');
    END IF;
    IF v_qty_good < 0 OR v_qty_damaged < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Quantities cannot be negative');
    END IF;
    IF v_qty_good + v_qty_damaged <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line must have at least one inspected unit');
    END IF;

    SELECT * INTO v_item
    FROM public.warehouse_stock_return_request_items
    WHERE id = v_request_item_id AND request_id = p_request_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Return line not found on this request');
    END IF;

    v_remaining := v_item.return_quantity - v_item.inspected_quantity;
    IF v_qty_good + v_qty_damaged > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Inspected quantity exceeds remaining for a line',
        'request_item_id', v_request_item_id,
        'remaining', v_remaining
      );
    END IF;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots ibl
    WHERE ibl.id = v_destination_lot_id
      AND ibl.company_id = v_request.company_id
      AND ibl.warehouse_location_id = v_main_loc_id
      AND ibl.variant_id = v_item.variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Selected main warehouse batch lot not found for this product',
        'request_item_id', v_request_item_id
      );
    END IF;

    IF v_item.lot_id IS NOT NULL THEN
      SELECT * INTO v_source_lot
      FROM public.inventory_batch_lots ibl
      WHERE ibl.id = v_item.lot_id
        AND ibl.company_id = v_request.company_id
        AND ibl.warehouse_location_id = v_request.from_location_id
        AND ibl.variant_id = v_item.variant_id;

      IF NOT FOUND THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Sub-warehouse source batch lot not found for this return line',
          'request_item_id', v_request_item_id
        );
      END IF;

      IF v_source_lot.quantity_remaining < (v_qty_good + v_qty_damaged) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient quantity in sub-warehouse source batch lot',
          'request_item_id', v_request_item_id,
          'available', v_source_lot.quantity_remaining
        );
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.warehouse_stock_return_receipts (
    request_id, received_by, received_at, notes
  ) VALUES (
    p_request_id, v_receiver, v_received_at, NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_request_item_id := (v_line->>'request_item_id')::uuid;
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    v_total_qty := v_qty_good + v_qty_damaged;
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

    IF v_total_qty <= 0 OR v_request_item_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item
    FROM public.warehouse_stock_return_request_items
    WHERE id = v_request_item_id;

    v_variant_id := v_item.variant_id;
    v_source_lot_id := v_item.lot_id;

    INSERT INTO public.warehouse_stock_return_receipt_lines (
      receipt_id, request_item_id, variant_id, qty_good, qty_damaged,
      source_lot_id, destination_lot_id
    ) VALUES (
      v_receipt_id, v_item.id, v_variant_id, v_qty_good, v_qty_damaged,
      v_source_lot_id, v_destination_lot_id
    );

    IF v_source_lot_id IS NOT NULL THEN
      v_deduct_result := public.deduct_inventory_lot(
        v_source_lot_id,
        v_total_qty,
        'return_out',
        'warehouse_stock_return',
        p_request_id,
        v_receiver,
        'Return ' || v_request.request_number || ' sub source',
        v_main_loc_id
      );

      IF NOT COALESCE((v_deduct_result->>'success')::boolean, false) THEN
        RETURN json_build_object(
          'success', false,
          'error', COALESCE(v_deduct_result->>'error', 'Failed to deduct sub-warehouse batch lot'),
          'request_item_id', v_request_item_id
        );
      END IF;
    ELSE
      v_deduct_result := public.deduct_inventory_lots_lifo(
        v_request.company_id,
        v_request.from_location_id,
        v_variant_id,
        v_total_qty,
        'return_out',
        'warehouse_stock_return',
        p_request_id,
        v_receiver,
        'Return ' || v_request.request_number || ' sub deduct',
        v_main_loc_id
      );

      IF NOT COALESCE((v_deduct_result->>'success')::boolean, false) THEN
        RETURN json_build_object(
          'success', false,
          'error', COALESCE(v_deduct_result->>'error', 'Failed to deduct sub-warehouse batch lots'),
          'request_item_id', v_request_item_id
        );
      END IF;
    END IF;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots
    WHERE id = v_destination_lot_id
    FOR UPDATE;

    v_line_amount := CASE
      WHEN v_destination_lot.unit_cost IS NOT NULL
        THEN round((v_total_qty::numeric * v_destination_lot.unit_cost), 2)
      ELSE NULL
    END;

    UPDATE public.inventory_batch_lots
    SET quantity_received = quantity_received + v_total_qty,
        quantity_remaining = quantity_remaining + v_total_qty,
        line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
        updated_at = now()
    WHERE id = v_destination_lot_id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      from_location_id, to_location_id, performed_by, notes
    ) VALUES (
      v_request.company_id, v_destination_lot_id, v_destination_lot.batch_id, v_variant_id, v_main_loc_id,
      'return_in', v_total_qty, 'warehouse_stock_return', p_request_id,
      v_request.from_location_id, v_main_loc_id, v_receiver,
      'Return ' || v_request.request_number || ' to main batch'
    );

    v_dest_lot_id := v_destination_lot_id;

    IF v_qty_damaged > 0 AND v_dest_lot_id IS NOT NULL THEN
      v_consume_result := public.consume_inventory_lot(
        v_dest_lot_id,
        v_qty_damaged,
        'warehouse_return_disposed',
        'warehouse_stock_return',
        p_request_id,
        v_receiver,
        'Damaged on return ' || v_request.request_number
      );

      IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
        RETURN json_build_object(
          'success', false,
          'error', COALESCE(v_consume_result->>'error', 'Failed to consume damaged return lots'),
          'request_item_id', v_request_item_id
        );
      END IF;
    END IF;

    IF v_qty_damaged > 0 THEN
      INSERT INTO public.warehouse_inventory_disposals (
        company_id, warehouse_location_id, variant_id, quantity,
        source_type, stock_return_request_id, notes, disposed_by
      ) VALUES (
        v_request.company_id, v_main_loc_id, v_variant_id, v_qty_damaged,
        'sub_warehouse_return', p_request_id,
        NULLIF(trim(p_notes), ''), v_receiver
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.company_id, v_variant_id, 'warehouse_return_disposed', v_qty_damaged,
        'warehouse_stock_return', p_request_id, v_receiver,
        'Sub-warehouse return (damaged) ' || v_request.request_number,
        v_received_at
      );
    END IF;

    IF v_qty_good > 0 THEN
      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        from_location, to_location, reference_type, reference_id,
        performed_by, notes, created_at
      ) VALUES (
        v_request.company_id, v_variant_id, 'warehouse_return_in', v_qty_good,
        CONCAT('warehouse_location:', v_request.from_location_id), 'main_inventory',
        'warehouse_stock_return', p_request_id, v_receiver,
        'Sub-warehouse return (good) ' || v_request.request_number,
        v_received_at
      );
    END IF;

    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_total_qty),
        updated_at = now()
    WHERE company_id = v_request.company_id
      AND variant_id = v_variant_id;

    UPDATE public.warehouse_stock_return_request_items
    SET inspected_quantity = inspected_quantity + v_total_qty
    WHERE id = v_item.id;

    v_total_inspected := v_total_inspected + v_total_qty;
  END LOOP;

  IF v_total_inspected <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'No quantity inspected');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_stock_return_request_items i
    WHERE i.request_id = p_request_id
      AND i.inspected_quantity < i.return_quantity
  ) INTO v_all_complete;

  UPDATE public.warehouse_stock_return_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'request_number', v_request.request_number,
    'receipt_id', v_receipt_id,
    'total_inspected', v_total_inspected,
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_warehouse_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_warehouse_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;
