-- Batch-targeted stock adjustments: select a specific lot before adjusting.

-- Replace prior 6-arg signature with lot-aware version
DROP FUNCTION IF EXISTS public.apply_warehouse_stock_adjustment(uuid, uuid, integer, text, text, uuid);

-- ---------------------------------------------------------------------------
-- 1) Link adjustments to a specific batch lot
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_stock_adjustments
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.inventory_batch_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_adjustments_lot
  ON public.warehouse_stock_adjustments(lot_id);

-- ---------------------------------------------------------------------------
-- 2) Consume quantity from one specific lot (not FIFO)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_inventory_lot(
  p_lot_id uuid,
  p_quantity integer,
  p_movement_type text,
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
      'error', 'Insufficient quantity in selected batch',
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
    from_location_id, performed_by, notes
  ) VALUES (
    v_lot.company_id, v_lot.id, v_lot.batch_id, v_lot.variant_id, v_lot.warehouse_location_id,
    p_movement_type, p_quantity, p_reference_type, p_reference_id,
    v_lot.warehouse_location_id, p_performed_by, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot.id,
    'batch_id', v_lot.batch_id,
    'quantity', p_quantity,
    'remaining_after', v_lot.quantity_remaining - p_quantity
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Add quantity to an existing batch lot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_inventory_lot_quantity(
  p_lot_id uuid,
  p_quantity integer,
  p_movement_type text,
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

  UPDATE public.inventory_batch_lots
  SET quantity_received = quantity_received + p_quantity,
      quantity_remaining = quantity_remaining + p_quantity,
      updated_at = now()
  WHERE id = p_lot_id;

  INSERT INTO public.inventory_batch_movements (
    company_id, lot_id, batch_id, variant_id, warehouse_location_id,
    movement_type, quantity, reference_type, reference_id,
    to_location_id, performed_by, notes
  ) VALUES (
    v_lot.company_id, v_lot.id, v_lot.batch_id, v_lot.variant_id, v_lot.warehouse_location_id,
    p_movement_type, p_quantity, p_reference_type, p_reference_id,
    v_lot.warehouse_location_id, p_performed_by, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'lot_id', v_lot.id,
    'batch_id', v_lot.batch_id,
    'quantity', p_quantity,
    'remaining_after', v_lot.quantity_remaining + p_quantity
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) apply_warehouse_stock_adjustment — batch lot aware
--    p_lot_id: required for OUT; optional for IN (null = new ADJ batch)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_warehouse_stock_adjustment(
  p_warehouse_location_id uuid,
  p_variant_id uuid,
  p_quantity_delta integer,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_company_id uuid;
  v_is_main boolean;
  v_qty integer;
  v_batch_id uuid;
  v_batch_number text;
  v_adjustment_id uuid;
  v_received_at timestamptz;
  v_lot RECORD;
  v_receive_result jsonb;
  v_lot_result jsonb;
  v_direction text;
  v_new_lot_id uuid;
BEGIN
  v_actor := COALESCE(p_performed_by, auth.uid());
  v_received_at := now();

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Adjustment quantity cannot be zero');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN json_build_object('success', false, 'error', 'A reason of at least 3 characters is required');
  END IF;

  SELECT wl.company_id, wl.is_main INTO v_company_id, v_is_main
  FROM public.warehouse_locations wl
  WHERE wl.id = p_warehouse_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse location not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_warehouse()
      AND public.is_main_warehouse_user(v_actor)
      AND v_company_id = public.get_auth_company_id()
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can apply stock adjustments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.variants v
    WHERE v.id = p_variant_id AND v.company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found');
  END IF;

  v_qty := abs(p_quantity_delta);
  v_direction := CASE WHEN p_quantity_delta > 0 THEN 'in' ELSE 'out' END;

  IF p_lot_id IS NOT NULL THEN
    SELECT ibl.*, ib.batch_number
    INTO v_lot
    FROM public.inventory_batch_lots ibl
    JOIN public.inventory_batches ib ON ib.id = ibl.batch_id
    WHERE ibl.id = p_lot_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Selected batch lot not found');
    END IF;

    IF v_lot.company_id IS DISTINCT FROM v_company_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot does not belong to this company');
    END IF;

    IF v_lot.warehouse_location_id IS DISTINCT FROM p_warehouse_location_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot location does not match selected location');
    END IF;

    IF v_lot.variant_id IS DISTINCT FROM p_variant_id THEN
      RETURN json_build_object('success', false, 'error', 'Batch lot variant does not match selected variant');
    END IF;
  END IF;

  IF v_direction = 'out' THEN
    IF p_lot_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Select a batch to remove stock from');
    END IF;

    v_lot_result := public.consume_inventory_lot(
      p_lot_id,
      v_qty,
      'adjustment_out',
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    IF NOT COALESCE((v_lot_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_lot_result->>'error', 'Failed to consume from batch lot')
      );
    END IF;

    IF v_is_main THEN
      UPDATE public.main_inventory
      SET stock = GREATEST(0, stock - v_qty),
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_qty,
          updated_at = now()
      WHERE company_id = v_company_id
        AND location_id = p_warehouse_location_id
        AND variant_id = p_variant_id;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_qty),
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, performed_by, notes, created_at
    ) VALUES (
      v_company_id, p_variant_id, 'adjustment', v_qty,
      'warehouse_stock_adjustment', v_actor,
      'Adjustment out (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      now()
    );

    INSERT INTO public.warehouse_stock_adjustments (
      company_id, warehouse_location_id, variant_id,
      direction, quantity, reason, notes, batch_id, lot_id, performed_by
    ) VALUES (
      v_company_id, p_warehouse_location_id, p_variant_id,
      'out', v_qty, trim(p_reason), p_notes, v_lot.batch_id, p_lot_id, v_actor
    )
    RETURNING id INTO v_adjustment_id;

    RETURN json_build_object(
      'success', true,
      'adjustment_id', v_adjustment_id,
      'batch_id', v_lot.batch_id,
      'batch_number', v_lot.batch_number,
      'lot_id', p_lot_id,
      'direction', 'out',
      'quantity', v_qty,
      'remaining_after', v_lot_result->>'remaining_after'
    );
  END IF;

  -- Direction IN
  IF p_lot_id IS NOT NULL THEN
    v_lot_result := public.add_inventory_lot_quantity(
      p_lot_id,
      v_qty,
      'adjustment_in',
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      'Adjustment in (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    IF NOT COALESCE((v_lot_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_lot_result->>'error', 'Failed to add to batch lot')
      );
    END IF;

    IF v_is_main THEN
      IF EXISTS (
        SELECT 1 FROM public.main_inventory mi
        WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id
      ) THEN
        UPDATE public.main_inventory
        SET stock = stock + v_qty,
            last_restocked_at = v_received_at,
            updated_at = now()
        WHERE company_id = v_company_id AND variant_id = p_variant_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, last_restocked_at, created_at, updated_at
        ) VALUES (
          v_company_id, p_variant_id, v_qty, 0, 10, v_received_at, now(), now()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, performed_by, notes, created_at
      ) VALUES (
        v_company_id, p_variant_id, 'adjustment', v_qty,
        'warehouse_stock_adjustment', v_actor,
        'Adjustment in (' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
        now()
      );
    ELSE
      INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock)
      VALUES (v_company_id, p_warehouse_location_id, p_variant_id, v_qty)
      ON CONFLICT (location_id, variant_id)
      DO UPDATE SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
                    updated_at = now();

      IF EXISTS (
        SELECT 1 FROM public.main_inventory mi
        WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id
      ) THEN
        UPDATE public.main_inventory
        SET stock = stock + v_qty,
            allocated_stock = COALESCE(allocated_stock, 0) + v_qty,
            last_restocked_at = v_received_at,
            updated_at = now()
        WHERE company_id = v_company_id AND variant_id = p_variant_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, allocated_stock,
          unit_price, reorder_level, last_restocked_at, created_at, updated_at
        ) VALUES (
          v_company_id, p_variant_id, v_qty, v_qty,
          0, 10, v_received_at, now(), now()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, performed_by, notes, created_at
      ) VALUES (
        v_company_id, p_variant_id, 'adjustment', v_qty,
        'warehouse_stock_adjustment', v_actor,
        'Adjustment in (sub, ' || v_lot.batch_number || '): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
        now()
      );
    END IF;

    INSERT INTO public.warehouse_stock_adjustments (
      company_id, warehouse_location_id, variant_id,
      direction, quantity, reason, notes, batch_id, lot_id, performed_by
    ) VALUES (
      v_company_id, p_warehouse_location_id, p_variant_id,
      'in', v_qty, trim(p_reason), p_notes, v_lot.batch_id, p_lot_id, v_actor
    )
    RETURNING id INTO v_adjustment_id;

    RETURN json_build_object(
      'success', true,
      'adjustment_id', v_adjustment_id,
      'batch_id', v_lot.batch_id,
      'batch_number', v_lot.batch_number,
      'lot_id', p_lot_id,
      'direction', 'in',
      'quantity', v_qty,
      'remaining_after', v_lot_result->>'remaining_after'
    );
  END IF;

  -- IN without lot: create new ADJ batch
  v_batch_number := public.generate_inventory_adjustment_batch_number(v_company_id);

  INSERT INTO public.inventory_batches (
    company_id, batch_number, source_type, status, received_at, notes, created_by
  ) VALUES (
    v_company_id, v_batch_number, 'adjustment_in', 'complete',
    v_received_at, 'Stock adjustment in: ' || trim(p_reason), v_actor
  )
  RETURNING id INTO v_batch_id;

  IF v_is_main THEN
    v_receive_result := public.receive_inventory_lots_to_main(
      v_company_id,
      v_batch_id,
      p_warehouse_location_id,
      p_variant_id,
      v_qty,
      v_received_at,
      'warehouse_stock_adjustment',
      NULL,
      v_actor,
      'Adjustment in: ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      'adjustment'
    );

    IF NOT COALESCE((v_receive_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_receive_result->>'error', 'Failed to receive adjustment lots')
      );
    END IF;

    v_new_lot_id := (v_receive_result->>'lot_id')::uuid;
  ELSE
    INSERT INTO public.inventory_batch_lots (
      company_id, batch_id, variant_id, warehouse_location_id,
      quantity_received, quantity_remaining, received_at
    ) VALUES (
      v_company_id, v_batch_id, p_variant_id, p_warehouse_location_id,
      v_qty, v_qty, v_received_at
    )
    RETURNING id INTO v_new_lot_id;

    INSERT INTO public.inventory_batch_movements (
      company_id, lot_id, batch_id, variant_id, warehouse_location_id,
      movement_type, quantity, reference_type,
      to_location_id, performed_by, notes
    ) VALUES (
      v_company_id, v_new_lot_id, v_batch_id, p_variant_id, p_warehouse_location_id,
      'adjustment_in', v_qty, 'warehouse_stock_adjustment',
      p_warehouse_location_id, v_actor,
      'Adjustment in: ' || trim(p_reason) || COALESCE(' — ' || p_notes, '')
    );

    INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock)
    VALUES (v_company_id, p_warehouse_location_id, p_variant_id, v_qty)
    ON CONFLICT (location_id, variant_id)
    DO UPDATE SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
                  updated_at = now();

    IF EXISTS (
      SELECT 1 FROM public.main_inventory mi
      WHERE mi.company_id = v_company_id AND mi.variant_id = p_variant_id
    ) THEN
      UPDATE public.main_inventory
      SET stock = stock + v_qty,
          allocated_stock = COALESCE(allocated_stock, 0) + v_qty,
          last_restocked_at = v_received_at,
          updated_at = now()
      WHERE company_id = v_company_id AND variant_id = p_variant_id;
    ELSE
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, allocated_stock,
        unit_price, reorder_level, last_restocked_at, created_at, updated_at
      ) VALUES (
        v_company_id, p_variant_id, v_qty, v_qty,
        0, 10, v_received_at, now(), now()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, performed_by, notes, created_at
    ) VALUES (
      v_company_id, p_variant_id, 'adjustment', v_qty,
      'warehouse_stock_adjustment', v_actor,
      'Adjustment in (sub): ' || trim(p_reason) || COALESCE(' — ' || p_notes, ''),
      now()
    );
  END IF;

  INSERT INTO public.warehouse_stock_adjustments (
    company_id, warehouse_location_id, variant_id,
    direction, quantity, reason, notes, batch_id, lot_id, performed_by
  ) VALUES (
    v_company_id, p_warehouse_location_id, p_variant_id,
    'in', v_qty, trim(p_reason), p_notes, v_batch_id, v_new_lot_id, v_actor
  )
  RETURNING id INTO v_adjustment_id;

  RETURN json_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'lot_id', v_new_lot_id,
    'direction', 'in',
    'quantity', v_qty
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_inventory_lot(uuid, integer, text, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_inventory_lot_quantity(uuid, integer, text, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_warehouse_stock_adjustment(uuid, uuid, integer, text, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.apply_warehouse_stock_adjustment(uuid, uuid, integer, text, text, uuid, uuid) IS
  'Apply stock adjustment. OUT requires p_lot_id. IN uses p_lot_id to add to existing batch, or creates new ADJ- batch when null.';
