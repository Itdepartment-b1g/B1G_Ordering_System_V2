-- Add Physical Count-style loose packing pair to stock request receive lines.
-- Formula: (boxes × qty/box) + (loose_boxes × loose_qty)

ALTER TABLE public.warehouse_stock_request_receive_lines
  ADD COLUMN IF NOT EXISTS loose_box_count integer,
  ADD COLUMN IF NOT EXISTS loose_qty integer;

ALTER TABLE public.warehouse_stock_request_receive_lines
  DROP CONSTRAINT IF EXISTS warehouse_stock_request_receive_lines_loose_box_count_check;
ALTER TABLE public.warehouse_stock_request_receive_lines
  ADD CONSTRAINT warehouse_stock_request_receive_lines_loose_box_count_check
  CHECK (loose_box_count IS NULL OR loose_box_count >= 0);

ALTER TABLE public.warehouse_stock_request_receive_lines
  DROP CONSTRAINT IF EXISTS warehouse_stock_request_receive_lines_loose_qty_check;
ALTER TABLE public.warehouse_stock_request_receive_lines
  ADD CONSTRAINT warehouse_stock_request_receive_lines_loose_qty_check
  CHECK (loose_qty IS NULL OR loose_qty >= 0);

ALTER TABLE public.warehouse_stock_request_receive_lines
  DROP CONSTRAINT IF EXISTS warehouse_stock_request_receive_lines_loose_pair_check;
ALTER TABLE public.warehouse_stock_request_receive_lines
  ADD CONSTRAINT warehouse_stock_request_receive_lines_loose_pair_check
  CHECK (
    (loose_box_count IS NULL AND loose_qty IS NULL)
    OR (loose_box_count IS NOT NULL AND loose_qty IS NOT NULL)
  );

COMMENT ON COLUMN public.warehouse_stock_request_receive_lines.loose_box_count IS
  'Optional loose boxes counted at receive. Leave null with loose_qty, or set both.';
COMMENT ON COLUMN public.warehouse_stock_request_receive_lines.loose_qty IS
  'Units per loose box. Leave null with loose_box_count, or set both.';

-- Backfill legacy leftover units (extra_qty) as 1 × extra_qty loose pair when possible.
UPDATE public.warehouse_stock_request_receive_lines
SET
  loose_box_count = 1,
  loose_qty = extra_qty
WHERE COALESCE(extra_qty, 0) > 0
  AND loose_box_count IS NULL
  AND loose_qty IS NULL;

-- ---------------------------------------------------------------------------
-- receive_warehouse_stock_request — persist loose box pair
-- Payload lot:
--   { quantity, manufactured_date, expiration_date, unit_cost,
--     box_count, units_per_box, loose_box_count?, loose_qty? }
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
  v_box_count integer;
  v_units_per_box integer;
  v_loose_box_count integer;
  v_loose_qty integer;
  v_lot_id uuid;
  v_expected_qty integer;
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

        v_box_count := NULLIF(v_lot->>'box_count', '')::integer;
        v_units_per_box := NULLIF(v_lot->>'units_per_box', '')::integer;
        v_loose_box_count := NULLIF(v_lot->>'loose_box_count', '')::integer;
        v_loose_qty := NULLIF(v_lot->>'loose_qty', '')::integer;

        IF v_box_count IS NULL OR v_units_per_box IS NULL THEN
          RETURN json_build_object('success', false, 'error', 'Boxes and Qty/box are required for each receive lot');
        END IF;

        IF v_box_count < 0 OR v_units_per_box < 0 THEN
          RETURN json_build_object('success', false, 'error', 'Boxes and Qty/box cannot be negative');
        END IF;

        IF (v_loose_box_count IS NULL) <> (v_loose_qty IS NULL) THEN
          RETURN json_build_object(
            'success', false,
            'error', 'Loose boxes and Loose qty must both be set or both omitted'
          );
        END IF;

        IF COALESCE(v_loose_box_count, 0) < 0 OR COALESCE(v_loose_qty, 0) < 0 THEN
          RETURN json_build_object('success', false, 'error', 'Loose boxes/qty cannot be negative');
        END IF;

        v_expected_qty :=
          (v_box_count * v_units_per_box) + (COALESCE(v_loose_box_count, 0) * COALESCE(v_loose_qty, 0));
        IF v_quantity <> v_expected_qty THEN
          RETURN json_build_object(
            'success', false,
            'error', 'Quantity must equal (boxes × qty/box) + (loose boxes × loose qty)',
            'variant_id', v_variant_id,
            'expected', v_expected_qty,
            'quantity', v_quantity
          );
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
        v_box_count := NULLIF(v_lot->>'box_count', '')::integer;
        v_units_per_box := NULLIF(v_lot->>'units_per_box', '')::integer;
        v_loose_box_count := NULLIF(v_lot->>'loose_box_count', '')::integer;
        v_loose_qty := NULLIF(v_lot->>'loose_qty', '')::integer;

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

        v_lot_id := NULLIF(v_receive_result->>'lot_id', '')::uuid;
        v_line_amount := COALESCE((v_receive_result->>'line_amount')::numeric(14, 2), 0);
        v_total_amount := v_total_amount + v_line_amount;
        v_variant_total := v_variant_total + v_quantity;
        v_total_received := v_total_received + v_quantity;

        INSERT INTO public.warehouse_stock_request_receive_lines (
          receive_id, variant_id, lot_id, quantity,
          box_count, units_per_box, loose_box_count, loose_qty, extra_qty,
          manufactured_date, expiration_date, unit_cost
        ) VALUES (
          v_receive_id, v_variant_id, v_lot_id, v_quantity,
          v_box_count, v_units_per_box, v_loose_box_count, v_loose_qty, 0,
          v_mfg_date, v_exp_date, v_unit_cost
        );
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

      v_lot_id := NULLIF(v_receive_result->>'lot_id', '')::uuid;
      v_variant_total := v_quantity;
      v_total_received := v_total_received + v_quantity;

      INSERT INTO public.warehouse_stock_request_receive_lines (
        receive_id, variant_id, lot_id, quantity,
        box_count, units_per_box, loose_box_count, loose_qty, extra_qty
      ) VALUES (
        v_receive_id, v_variant_id, v_lot_id, v_quantity,
        NULL, NULL, NULL, NULL, 0
      );
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

GRANT EXECUTE ON FUNCTION public.receive_warehouse_stock_request(uuid, jsonb, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.receive_warehouse_stock_request IS
  'Receive stock into main inventory. Persists packing: (boxes × qty/box) + (loose boxes × loose qty).';
