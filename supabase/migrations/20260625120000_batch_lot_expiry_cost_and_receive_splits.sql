-- Batch lot expiry / mfg / unit cost, batch total_amount, and split receive lines.

-- ---------------------------------------------------------------------------
-- 1) Schema: lot metadata + batch total
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS total_amount numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.inventory_batch_lots
  ADD COLUMN IF NOT EXISTS manufactured_date date,
  ADD COLUMN IF NOT EXISTS expiration_date date,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14, 2),
  ADD COLUMN IF NOT EXISTS line_amount numeric(14, 2);

ALTER TABLE public.inventory_batch_lots
  DROP CONSTRAINT IF EXISTS inventory_batch_lots_batch_variant_location_key;

-- ---------------------------------------------------------------------------
-- 1b) Merge helper for legacy flows (rebate restore, transfers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_inventory_batch_lot_at_location(
  p_company_id uuid,
  p_batch_id uuid,
  p_variant_id uuid,
  p_warehouse_location_id uuid,
  p_quantity integer,
  p_received_at timestamptz,
  p_manufactured_date date DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot_id uuid;
  v_line_amount numeric(14, 2);
BEGIN
  SELECT ibl.id INTO v_lot_id
  FROM public.inventory_batch_lots ibl
  WHERE ibl.batch_id = p_batch_id
    AND ibl.variant_id = p_variant_id
    AND ibl.warehouse_location_id = p_warehouse_location_id
    AND ibl.manufactured_date IS NOT DISTINCT FROM p_manufactured_date
    AND ibl.expiration_date IS NOT DISTINCT FROM p_expiration_date
    AND ibl.unit_cost IS NOT DISTINCT FROM p_unit_cost
  FOR UPDATE;

  v_line_amount := CASE
    WHEN p_unit_cost IS NOT NULL THEN round((p_quantity::numeric * p_unit_cost), 2)
    ELSE NULL
  END;

  IF FOUND THEN
    UPDATE public.inventory_batch_lots
    SET quantity_received = quantity_received + p_quantity,
        quantity_remaining = quantity_remaining + p_quantity,
        line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
        updated_at = now()
    WHERE id = v_lot_id;
    RETURN v_lot_id;
  END IF;

  INSERT INTO public.inventory_batch_lots (
    company_id, batch_id, variant_id, warehouse_location_id,
    quantity_received, quantity_remaining, received_at,
    manufactured_date, expiration_date, unit_cost, line_amount
  ) VALUES (
    p_company_id, p_batch_id, p_variant_id, p_warehouse_location_id,
    p_quantity, p_quantity, p_received_at,
    p_manufactured_date, p_expiration_date, p_unit_cost, v_line_amount
  )
  RETURNING id INTO v_lot_id;

  RETURN v_lot_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) receive_inventory_lots_to_main — always insert distinct lot rows
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.receive_inventory_lots_to_main(
  uuid, uuid, uuid, uuid, integer, timestamptz, text, uuid, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.receive_inventory_lots_to_main(
  p_company_id uuid,
  p_batch_id uuid,
  p_main_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_received_at timestamptz,
  p_reference_type text,
  p_reference_id uuid,
  p_performed_by uuid,
  p_notes text DEFAULT NULL,
  p_transaction_type text DEFAULT 'warehouse_stock_receive',
  p_manufactured_date date DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot_id uuid;
  v_line_amount numeric(14, 2);
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  IF p_unit_cost IS NOT NULL AND p_unit_cost < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unit cost cannot be negative');
  END IF;

  IF p_manufactured_date IS NOT NULL AND p_expiration_date IS NOT NULL
     AND p_manufactured_date > p_expiration_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'Manufactured date cannot be after expiration date');
  END IF;

  v_line_amount := CASE
    WHEN p_unit_cost IS NOT NULL THEN round((p_quantity::numeric * p_unit_cost), 2)
    ELSE NULL
  END;

  INSERT INTO public.inventory_batch_lots (
    company_id, batch_id, variant_id, warehouse_location_id,
    quantity_received, quantity_remaining, received_at,
    manufactured_date, expiration_date, unit_cost, line_amount
  ) VALUES (
    p_company_id, p_batch_id, p_variant_id, p_main_location_id,
    p_quantity, p_quantity, p_received_at,
    p_manufactured_date, p_expiration_date, p_unit_cost, v_line_amount
  )
  RETURNING id INTO v_lot_id;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    to_location_id, performed_by, notes
  ) VALUES (
    p_company_id, v_lot_id, p_batch_id, p_variant_id, p_main_location_id,
    'receive', p_quantity, p_reference_type, p_reference_id,
    p_main_location_id, p_performed_by, p_notes
  );

  IF EXISTS (
    SELECT 1 FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id AND mi.variant_id = p_variant_id
  ) THEN
    UPDATE public.main_inventory
    SET stock = stock + p_quantity,
        last_restocked_at = p_received_at,
        updated_at = now()
    WHERE company_id = p_company_id AND variant_id = p_variant_id;
  ELSE
    INSERT INTO public.main_inventory (
      company_id, variant_id, stock, unit_price, reorder_level, last_restocked_at, created_at, updated_at
    ) VALUES (
      p_company_id, p_variant_id, p_quantity, COALESCE(p_unit_cost, 0), 10, p_received_at, now(), now()
    );
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id, variant_id, transaction_type, quantity,
    reference_type, reference_id, performed_by, notes, created_at
  ) VALUES (
    p_company_id, p_variant_id, p_transaction_type, p_quantity,
    p_reference_type, p_reference_id, p_performed_by, p_notes, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot_id,
    'quantity', p_quantity,
    'line_amount', v_line_amount
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) transfer_inventory_lots — preserve lot metadata at destination
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_inventory_lots(
  p_company_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_transfer_order text,
  p_out_movement_type text,
  p_in_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
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
  v_dest_lot_id uuid;
  v_line_amount numeric(14, 2);
  v_transferred jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  IF p_transfer_order NOT IN ('fifo', 'lifo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'transfer_order must be fifo or lifo');
  END IF;

  v_remaining := p_quantity;

  FOR v_lot IN
    SELECT ibl.*
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = p_company_id
      AND ibl.warehouse_location_id = p_from_location_id
      AND ibl.variant_id = p_variant_id
      AND ibl.quantity_remaining > 0
    ORDER BY
      CASE WHEN p_transfer_order = 'lifo' THEN ibl.received_at END DESC NULLS LAST,
      CASE WHEN p_transfer_order = 'fifo' THEN ibl.received_at END ASC NULLS LAST,
      ibl.created_at ASC
    FOR UPDATE OF ibl
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_lot.quantity_remaining, v_remaining);

    UPDATE public.inventory_batch_lots
    SET quantity_remaining = quantity_remaining - v_take,
        updated_at = now()
    WHERE id = v_lot.id;

    v_dest_lot_id := NULL;
    SELECT ibl.id INTO v_dest_lot_id
    FROM public.inventory_batch_lots ibl
    WHERE ibl.batch_id = v_lot.batch_id
      AND ibl.variant_id = p_variant_id
      AND ibl.warehouse_location_id = p_to_location_id
      AND ibl.manufactured_date IS NOT DISTINCT FROM v_lot.manufactured_date
      AND ibl.expiration_date IS NOT DISTINCT FROM v_lot.expiration_date
      AND ibl.unit_cost IS NOT DISTINCT FROM v_lot.unit_cost
    FOR UPDATE;

    IF FOUND THEN
      v_line_amount := CASE
        WHEN v_lot.unit_cost IS NOT NULL THEN round((v_take::numeric * v_lot.unit_cost), 2)
        ELSE NULL
      END;

      UPDATE public.inventory_batch_lots
      SET quantity_received = quantity_received + v_take,
          quantity_remaining = quantity_remaining + v_take,
          line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
          updated_at = now()
      WHERE id = v_dest_lot_id;
    ELSE
      v_line_amount := CASE
        WHEN v_lot.unit_cost IS NOT NULL THEN round((v_take::numeric * v_lot.unit_cost), 2)
        ELSE NULL
      END;

      INSERT INTO public.inventory_batch_lots (
        company_id, batch_id, variant_id, warehouse_location_id,
        quantity_received, quantity_remaining, received_at,
        manufactured_date, expiration_date, unit_cost, line_amount
      ) VALUES (
        p_company_id, v_lot.batch_id, p_variant_id, p_to_location_id,
        v_take, v_take, v_lot.received_at,
        v_lot.manufactured_date, v_lot.expiration_date, v_lot.unit_cost, v_line_amount
      )
      RETURNING id INTO v_dest_lot_id;
    END IF;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      from_location_id, to_location_id, performed_by, notes
    ) VALUES
    (
      p_company_id, v_lot.id, v_lot.batch_id, p_variant_id, p_from_location_id,
      p_out_movement_type, v_take, p_reference_type, p_reference_id,
      p_from_location_id, p_to_location_id, p_performed_by, p_notes
    ),
    (
      p_company_id, v_dest_lot_id, v_lot.batch_id, p_variant_id, p_to_location_id,
      p_in_movement_type, v_take, p_reference_type, p_reference_id,
      p_from_location_id, p_to_location_id, p_performed_by, p_notes
    );

    v_transferred := v_transferred || jsonb_build_object(
      'batch_id', v_lot.batch_id,
      'from_lot_id', v_lot.id,
      'to_lot_id', v_dest_lot_id,
      'quantity', v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient batch lot stock to transfer',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'transferred', v_transferred, 'quantity', p_quantity);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) transfer_inventory_lot — single-lot transfer with metadata match
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_inventory_lot(
  p_lot_id uuid,
  p_to_location_id uuid,
  p_quantity integer,
  p_out_movement_type text,
  p_in_movement_type text,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lot RECORD;
  v_dest_lot_id uuid;
  v_line_amount numeric(14, 2);
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

  IF v_lot.warehouse_location_id = p_to_location_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source and destination location are the same');
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

  v_dest_lot_id := NULL;
  SELECT ibl.id INTO v_dest_lot_id
  FROM public.inventory_batch_lots ibl
  WHERE ibl.batch_id = v_lot.batch_id
    AND ibl.variant_id = v_lot.variant_id
    AND ibl.warehouse_location_id = p_to_location_id
    AND ibl.manufactured_date IS NOT DISTINCT FROM v_lot.manufactured_date
    AND ibl.expiration_date IS NOT DISTINCT FROM v_lot.expiration_date
    AND ibl.unit_cost IS NOT DISTINCT FROM v_lot.unit_cost
  FOR UPDATE;

  v_line_amount := CASE
    WHEN v_lot.unit_cost IS NOT NULL THEN round((p_quantity::numeric * v_lot.unit_cost), 2)
    ELSE NULL
  END;

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
      v_lot.company_id, v_lot.batch_id, v_lot.variant_id, p_to_location_id,
      p_quantity, p_quantity, v_lot.received_at,
      v_lot.manufactured_date, v_lot.expiration_date, v_lot.unit_cost, v_line_amount
    )
    RETURNING id INTO v_dest_lot_id;
  END IF;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    from_location_id, to_location_id, performed_by, notes
  ) VALUES
  (
    v_lot.company_id, v_lot.id, v_lot.batch_id, v_lot.variant_id, v_lot.warehouse_location_id,
    p_out_movement_type, p_quantity, p_reference_type, p_reference_id,
    v_lot.warehouse_location_id, p_to_location_id, p_performed_by, p_notes
  ),
  (
    v_lot.company_id, v_dest_lot_id, v_lot.batch_id, v_lot.variant_id, p_to_location_id,
    p_in_movement_type, p_quantity, p_reference_type, p_reference_id,
    v_lot.warehouse_location_id, p_to_location_id, p_performed_by, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'from_lot_id', v_lot.id,
    'to_lot_id', v_dest_lot_id,
    'batch_id', v_lot.batch_id,
    'quantity', p_quantity
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) receive_warehouse_stock_request — split lots per variant
--    Payload per item:
--      { "variant_id": "...", "lots": [ { "quantity", "manufactured_date", "expiration_date", "unit_cost" } ] }
--    Legacy: { "variant_id": "...", "quantity": N } still supported.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_warehouse_stock_request(
  p_request_id uuid,
  p_items jsonb,
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
  v_batch_id uuid;
  v_batch_number text;
  v_receive_id uuid;
  v_received_at timestamptz;
  v_item jsonb;
  v_lot jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_variant_total integer;
  v_line RECORD;
  v_remaining integer;
  v_total_received integer := 0;
  v_total_amount numeric(14, 2) := 0;
  v_line_amount numeric(14, 2);
  v_receive_result jsonb;
  v_all_complete boolean;
  v_mfg_date date;
  v_exp_date date;
  v_unit_cost numeric(14, 2);
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.warehouse_stock_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Stock request not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(v_receiver)
        AND v_request.company_id = public.get_auth_company_id())
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can receive stock');
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Stock request is not open for receiving');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_request.company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one receive line is required');
  END IF;

  -- Validate all variant / lot lines before writing
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    IF v_variant_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid receive item: variant_id required');
    END IF;

    SELECT i.* INTO v_line
    FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id AND i.variant_id = v_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Variant is not on this stock request');
    END IF;

    v_remaining := v_line.ordered_quantity - v_line.received_quantity;
    v_variant_total := 0;

    IF v_item ? 'lots' AND jsonb_typeof(v_item->'lots') = 'array' THEN
      FOR v_lot IN SELECT * FROM jsonb_array_elements(v_item->'lots')
      LOOP
        v_quantity := (v_lot->>'quantity')::integer;
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
          CONTINUE;
        END IF;

        v_exp_date := NULLIF(trim(v_lot->>'expiration_date'), '')::date;
        IF v_exp_date IS NULL THEN
          RETURN json_build_object('success', false, 'error', 'Expiration date is required for each receive lot');
        END IF;

        v_mfg_date := NULLIF(trim(v_lot->>'manufactured_date'), '')::date;
        IF v_mfg_date IS NOT NULL AND v_mfg_date > v_exp_date THEN
          RETURN json_build_object('success', false, 'error', 'Manufactured date cannot be after expiration date');
        END IF;

        v_unit_cost := (v_lot->>'unit_cost')::numeric(14, 2);
        IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
          RETURN json_build_object('success', false, 'error', 'Unit cost is required and cannot be negative');
        END IF;

        v_variant_total := v_variant_total + v_quantity;
      END LOOP;
    ELSE
      v_quantity := (v_item->>'quantity')::integer;
      IF v_quantity IS NULL OR v_quantity <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Invalid receive item payload');
      END IF;
      v_variant_total := v_quantity;
    END IF;

    IF v_variant_total <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each variant must have at least one lot with quantity');
    END IF;

    IF v_variant_total > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Receive quantity exceeds remaining for variant',
        'variant_id', v_variant_id,
        'remaining', v_remaining
      );
    END IF;
  END LOOP;

  v_batch_number := public.generate_inventory_batch_number(v_request.company_id);

  INSERT INTO public.inventory_batches (
    company_id, batch_number, source_type, stock_request_id,
    status, received_at, notes, created_by, total_amount
  ) VALUES (
    v_request.company_id, v_batch_number, 'stock_request_receive', p_request_id,
    'complete', v_received_at, p_notes, v_receiver, 0
  )
  RETURNING id INTO v_batch_id;

  INSERT INTO public.warehouse_stock_request_receives (
    request_id, batch_id, received_by, received_at, notes
  ) VALUES (
    p_request_id, v_batch_id, v_receiver, v_received_at, p_notes
  )
  RETURNING id INTO v_receive_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_variant_total := 0;

    IF v_item ? 'lots' AND jsonb_typeof(v_item->'lots') = 'array' THEN
      FOR v_lot IN SELECT * FROM jsonb_array_elements(v_item->'lots')
      LOOP
        v_quantity := (v_lot->>'quantity')::integer;
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
          CONTINUE;
        END IF;

        v_mfg_date := NULLIF(trim(v_lot->>'manufactured_date'), '')::date;
        v_exp_date := NULLIF(trim(v_lot->>'expiration_date'), '')::date;
        v_unit_cost := (v_lot->>'unit_cost')::numeric(14, 2);

        v_receive_result := public.receive_inventory_lots_to_main(
          v_request.company_id,
          v_batch_id,
          v_main_loc_id,
          v_variant_id,
          v_quantity,
          v_received_at,
          'warehouse_stock_request',
          p_request_id,
          v_receiver,
          'Receive ' || v_request.request_number || ' batch ' || v_batch_number,
          'warehouse_stock_receive',
          v_mfg_date,
          v_exp_date,
          v_unit_cost
        );

        IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
          RETURN json_build_object(
            'success', false,
            'error', COALESCE(v_receive_result->>'error', 'Failed to receive inventory lots'),
            'variant_id', v_variant_id
          );
        END IF;

        v_line_amount := COALESCE((v_receive_result->>'line_amount')::numeric(14, 2), 0);
        v_total_amount := v_total_amount + v_line_amount;
        v_variant_total := v_variant_total + v_quantity;
        v_total_received := v_total_received + v_quantity;
      END LOOP;
    ELSE
      v_quantity := (v_item->>'quantity')::integer;
      IF v_quantity <= 0 THEN
        CONTINUE;
      END IF;

      v_receive_result := public.receive_inventory_lots_to_main(
        v_request.company_id,
        v_batch_id,
        v_main_loc_id,
        v_variant_id,
        v_quantity,
        v_received_at,
        'warehouse_stock_request',
        p_request_id,
        v_receiver,
        'Receive ' || v_request.request_number || ' batch ' || v_batch_number
      );

      IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
        RETURN json_build_object(
          'success', false,
          'error', COALESCE(v_receive_result->>'error', 'Failed to receive inventory lots'),
          'variant_id', v_variant_id
        );
      END IF;

      v_variant_total := v_quantity;
      v_total_received := v_total_received + v_quantity;
    END IF;

    IF v_variant_total > 0 THEN
      UPDATE public.warehouse_stock_request_items
      SET received_quantity = received_quantity + v_variant_total
      WHERE request_id = p_request_id AND variant_id = v_variant_id;
    END IF;
  END LOOP;

  IF v_total_received <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'No quantity received');
  END IF;

  UPDATE public.inventory_batches
  SET total_amount = v_total_amount,
      updated_at = now()
  WHERE id = v_batch_id;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_stock_request_items i
    WHERE i.request_id = p_request_id
      AND i.received_quantity < i.ordered_quantity
  ) INTO v_all_complete;

  UPDATE public.warehouse_stock_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'request_number', v_request.request_number,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'receive_id', v_receive_id,
    'total_received', v_total_received,
    'total_amount', v_total_amount,
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_inventory_lots_to_main(
  uuid, uuid, uuid, uuid, integer, timestamptz, text, uuid, uuid, text, text, date, date, numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.transfer_inventory_lots(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, uuid, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.transfer_inventory_lot(
  uuid, uuid, integer, text, text, text, uuid, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.receive_warehouse_stock_request(uuid, jsonb, text, uuid) TO authenticated;

COMMENT ON COLUMN public.inventory_batches.total_amount IS
  'Sum of line_amount for all lots received in this batch (stock request receive).';

COMMENT ON COLUMN public.inventory_batch_lots.expiration_date IS
  'Product expiration date for this lot. Multiple lots per variant allowed when expiry or unit cost differs.';

-- ---------------------------------------------------------------------------
-- 6) restore_rebate_return_inventory_lots — use merge helper (no unique constraint)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_rebate_return_inventory_lots(
  p_company_id uuid,
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_original_po_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_performed_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining integer;
  v_mov RECORD;
  v_take integer;
  v_lot_id uuid;
  v_opening_batch_id uuid;
  v_opening_received_at timestamptz;
  v_restored jsonb := '[]'::jsonb;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be positive');
  END IF;

  v_remaining := p_quantity;

  FOR v_mov IN
    SELECT
      ibm.batch_id,
      ibm.quantity,
      ibl.received_at AS lot_received_at,
      ibl.manufactured_date,
      ibl.expiration_date,
      ibl.unit_cost
    FROM public.inventory_batch_movements ibm
    JOIN public.inventory_batch_lots ibl ON ibl.id = ibm.lot_id
    WHERE ibm.company_id = p_company_id
      AND ibm.variant_id = p_variant_id
      AND ibm.warehouse_location_id = p_warehouse_location_id
      AND ibm.movement_type = 'fulfill_out'
      AND ibm.reference_type = 'purchase_order'
      AND ibm.reference_id = p_original_po_id
    ORDER BY ibm.created_at DESC, ibm.id DESC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_mov.quantity, v_remaining);

    v_lot_id := public.merge_inventory_batch_lot_at_location(
      p_company_id,
      v_mov.batch_id,
      p_variant_id,
      p_warehouse_location_id,
      v_take,
      v_mov.lot_received_at,
      v_mov.manufactured_date,
      v_mov.expiration_date,
      v_mov.unit_cost
    );

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      to_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot_id, v_mov.batch_id, p_variant_id, p_warehouse_location_id,
      'rebate_return_in', v_take, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by, p_notes
    );

    v_restored := v_restored || jsonb_build_object(
      'batch_id', v_mov.batch_id,
      'quantity', v_take,
      'source', 'fulfill_out_replay'
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    SELECT ib.id, ib.received_at
    INTO v_opening_batch_id, v_opening_received_at
    FROM public.inventory_batches ib
    WHERE ib.company_id = p_company_id
      AND ib.source_type = 'opening_balance'
    ORDER BY ib.received_at ASC, ib.created_at ASC
    LIMIT 1;

    IF v_opening_batch_id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'No opening balance batch found for rebate return fallback'
      );
    END IF;

    v_lot_id := public.merge_inventory_batch_lot_at_location(
      p_company_id,
      v_opening_batch_id,
      p_variant_id,
      p_warehouse_location_id,
      v_remaining,
      COALESCE(v_opening_received_at, now())
    );

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type, reference_id,
      to_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot_id, v_opening_batch_id, p_variant_id, p_warehouse_location_id,
      'rebate_return_in', v_remaining, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by,
      COALESCE(p_notes, '') || ' (opening balance fallback)'
    );

    v_restored := v_restored || jsonb_build_object(
      'batch_id', v_opening_batch_id,
      'quantity', v_remaining,
      'source', 'opening_balance_fallback'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'restored', v_restored,
    'quantity', p_quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_inventory_batch_lot_at_location(
  uuid, uuid, uuid, uuid, integer, timestamptz, date, date, numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.restore_rebate_return_inventory_lots(
  uuid, uuid, uuid, integer, uuid, text, uuid, uuid, text
) TO authenticated;
