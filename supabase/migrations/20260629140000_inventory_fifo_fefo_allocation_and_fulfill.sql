-- FIFO across batches (received_at), then FEFO within the same batch (expiration_date).
-- Used for main -> sub-warehouse allocation and PO fulfillment.

-- ---------------------------------------------------------------------------
-- 1) transfer_inventory_lots — add fifo_fefo transfer order
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

  IF p_transfer_order NOT IN ('fifo', 'fifo_fefo', 'lifo') THEN
    RETURN jsonb_build_object('success', false, 'error', 'transfer_order must be fifo, fifo_fefo, or lifo');
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
      CASE WHEN p_transfer_order IN ('fifo', 'fifo_fefo') THEN ibl.received_at END ASC NULLS LAST,
      CASE WHEN p_transfer_order = 'fifo_fefo' THEN ibl.batch_id END ASC NULLS LAST,
      CASE WHEN p_transfer_order = 'fifo_fefo' THEN ibl.expiration_date END ASC NULLS LAST,
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

COMMENT ON FUNCTION public.transfer_inventory_lots(uuid, uuid, uuid, uuid, integer, text, text, text, text, uuid, uuid, text) IS
  'Transfer batch lots between locations. fifo = receive-time FIFO; fifo_fefo = FIFO across batches then FEFO within batch; lifo = newest first.';

-- ---------------------------------------------------------------------------
-- 2) consume_inventory_lots_fifo_fefo — consume with FIFO then FEFO within batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_inventory_lots_fifo_fefo(
  p_company_id uuid,
  p_warehouse_location_id uuid,
  p_variant_id uuid,
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
  v_remaining integer;
  v_lot RECORD;
  v_take integer;
  v_consumed jsonb := '[]'::jsonb;
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
    ORDER BY
      ibl.received_at ASC NULLS LAST,
      ibl.batch_id ASC,
      ibl.expiration_date ASC NULLS LAST,
      ibl.created_at ASC
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
      from_location_id, performed_by, notes
    ) VALUES (
      p_company_id, v_lot.id, v_lot.batch_id, p_variant_id, p_warehouse_location_id,
      p_movement_type, v_take, p_reference_type, p_reference_id,
      p_warehouse_location_id, p_performed_by, p_notes
    );

    v_consumed := v_consumed || jsonb_build_object(
      'lot_id', v_lot.id,
      'batch_id', v_lot.batch_id,
      'quantity', v_take
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient batch lot stock',
      'shortfall', v_remaining
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'consumed', v_consumed, 'quantity', p_quantity);
END;
$$;

COMMENT ON FUNCTION public.consume_inventory_lots_fifo_fefo(uuid, uuid, uuid, integer, text, text, uuid, uuid, text) IS
  'Consume batch lots: FIFO by received_at across batches, then FEFO by expiration_date within the same batch.';

GRANT EXECUTE ON FUNCTION public.consume_inventory_lots_fifo_fefo(uuid, uuid, uuid, integer, text, text, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) allocate_stock_to_sub_warehouse — use fifo_fefo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_stock_to_sub_warehouse(
  p_location_id uuid,
  p_items jsonb,
  p_performed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_company_id uuid;
  v_available integer;
  v_performer uuid;
  v_main_loc_id uuid;
  v_transfer_result jsonb;
  v_history_id uuid;
  v_notes text;
BEGIN
  v_performer := COALESCE(p_performed_by, auth.uid());
  v_notes := COALESCE(p_notes, 'Allocated from main warehouse to sub-warehouse');

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(v_company_id);
  IF v_main_loc_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Main warehouse location not found');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(auth.uid()))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No items specified');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Invalid item payload');
    END IF;

    SELECT (mi.stock - COALESCE(mi.allocated_stock, 0)) INTO v_available
    FROM public.main_inventory mi
    WHERE mi.company_id = v_company_id
      AND mi.variant_id = v_variant_id;

    IF v_available IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Variant not stocked at main warehouse');
    END IF;

    IF v_available < v_quantity THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient available stock for allocation');
    END IF;
  END LOOP;

  INSERT INTO public.warehouse_allocation_history (
    company_id,
    location_id,
    performed_by,
    notes
  ) VALUES (
    v_company_id,
    p_location_id,
    v_performer,
    v_notes
  )
  RETURNING id INTO v_history_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    v_transfer_result := public.transfer_inventory_lots(
      v_company_id,
      v_main_loc_id,
      p_location_id,
      v_variant_id,
      v_quantity,
      'fifo_fefo',
      'allocate_out',
      'allocate_in',
      'warehouse_allocation_history',
      v_history_id,
      v_performer,
      v_notes
    );

    IF NOT COALESCE((v_transfer_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_transfer_result->>'error', 'Batch lot transfer failed'),
        'variant_id', v_variant_id
      );
    END IF;

    UPDATE public.main_inventory
    SET allocated_stock = COALESCE(allocated_stock, 0) + v_quantity,
        updated_at = now()
    WHERE company_id = v_company_id
      AND variant_id = v_variant_id;

    INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock)
    VALUES (v_company_id, p_location_id, v_variant_id, v_quantity)
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
      v_company_id,
      v_variant_id,
      'warehouse_allocate_to_sub',
      v_quantity,
      'main_inventory',
      CONCAT('warehouse_location:', p_location_id),
      v_performer,
      'warehouse_allocation_history',
      v_history_id,
      v_notes
    );
  END LOOP;

  RETURN json_build_object('success', true, 'history_id', v_history_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) fulfill_po_location — use consume_inventory_lots_fifo_fefo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_po_location(
  p_po_id uuid,
  p_location_id uuid,
  p_fulfiller_id uuid DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_fulfiller RECORD;
  v_user_location_id uuid;
  res RECORD;
  item_record RECORD;
  loc_stock integer;
  main_available integer;
  v_is_main_location boolean;
  v_client_variant_id uuid;
  v_client_brand_id uuid;
  v_client_variant_type_id uuid;
  existing_client_inv RECORD;
  v_remaining integer;
  v_consume_result jsonb;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;
  IF po_record.status IS DISTINCT FROM 'approved_for_fulfillment' AND po_record.status IS DISTINCT FROM 'partially_fulfilled' THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order is not ready to fulfill');
  END IF;

  SELECT p.id, p.role, p.company_id INTO v_fulfiller
  FROM public.profiles p
  WHERE p.id = p_fulfiller_id;

  IF NOT FOUND OR v_fulfiller.role IS DISTINCT FROM 'warehouse' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse users can fulfill this purchase order');
  END IF;
  IF v_fulfiller.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Fulfiller warehouse company does not match purchase order warehouse');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(p_fulfiller_id);
  IF NOT (public.is_main_warehouse_user(p_fulfiller_id) OR v_user_location_id = p_location_id) THEN
    RETURN json_build_object('success', false, 'error', 'Fulfiller is not assigned to this sub-warehouse location');
  END IF;

  SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
  FROM public.warehouse_locations wl
  WHERE wl.id = p_location_id
    AND wl.company_id = po_record.warehouse_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid warehouse location');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'cancelled'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No reservations found for this location');
  END IF;

  FOR res IN
    SELECT *
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'fulfilled'
      AND r.status <> 'cancelled'
  LOOP
    v_remaining := (res.quantity_reserved - res.quantity_fulfilled);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = res.variant_id;

      IF main_available IS NULL OR main_available < v_remaining THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock at fulfillment time');
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = p_location_id
        AND wli.variant_id = res.variant_id;

      IF NOT FOUND OR loc_stock < v_remaining THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock at fulfillment time');
      END IF;
    END IF;

    v_consume_result := public.consume_inventory_lots_fifo_fefo(
      po_record.warehouse_company_id,
      p_location_id,
      res.variant_id,
      v_remaining,
      'fulfill_out',
      'purchase_order',
      p_po_id,
      p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number
    );

    IF NOT COALESCE((v_consume_result->>'success')::boolean, false) THEN
      RETURN json_build_object(
        'success', false,
        'error', COALESCE(v_consume_result->>'error', 'Batch lot consumption failed'),
        'variant_id', res.variant_id
      );
    END IF;

    IF v_is_main_location THEN
      UPDATE public.main_inventory
      SET stock = GREATEST(0, stock - v_remaining),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_remaining,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND location_id = p_location_id
        AND variant_id = res.variant_id;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_remaining),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, res.variant_id, 'warehouse_transfer_out', v_remaining,
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from location ' || p_location_id::text,
      NOW()
    );

    IF po_record.company_account_type IS DISTINCT FROM 'Key Accounts' THEN
      v_client_variant_id := NULL;
      SELECT m.client_variant_id INTO v_client_variant_id
      FROM public.warehouse_variant_mappings m
      WHERE m.client_company_id = po_record.company_id
        AND m.warehouse_company_id = po_record.warehouse_company_id
        AND m.warehouse_variant_id = res.variant_id;

      IF v_client_variant_id IS NULL THEN
        SELECT
          v.id AS warehouse_variant_id,
          v.name AS variant_name,
          v.variant_type AS variant_type,
          b.name AS brand_name
        INTO item_record
        FROM public.variants v
        JOIN public.brands b ON b.id = v.brand_id
        WHERE v.id = res.variant_id;

        v_client_brand_id := NULL;
        SELECT br.id INTO v_client_brand_id
        FROM public.brands br
        WHERE br.company_id = po_record.company_id
          AND lower(br.name) = lower(item_record.brand_name)
        LIMIT 1;

        IF v_client_brand_id IS NULL THEN
          INSERT INTO public.brands (company_id, name, description, created_by, created_at, updated_at)
          VALUES (po_record.company_id, item_record.brand_name, NULL, p_fulfiller_id, NOW(), NOW())
          RETURNING id INTO v_client_brand_id;
        END IF;

        v_client_variant_type_id := NULL;
        SELECT vt.id INTO v_client_variant_type_id
        FROM public.variant_types vt
        WHERE vt.company_id = po_record.company_id
          AND lower(vt.name) = lower(item_record.variant_type)
        LIMIT 1;

        IF v_client_variant_type_id IS NULL THEN
          RETURN json_build_object('success', false, 'error', 'Client missing variant type for ' || item_record.variant_type);
        END IF;

        v_client_variant_id := NULL;
        SELECT vv.id INTO v_client_variant_id
        FROM public.variants vv
        WHERE vv.company_id = po_record.company_id
          AND vv.brand_id = v_client_brand_id
          AND lower(vv.name) = lower(item_record.variant_name)
        LIMIT 1;

        IF v_client_variant_id IS NULL THEN
          INSERT INTO public.variants (
            company_id,
            brand_id,
            variant_type_id,
            name,
            variant_type,
            description,
            sku,
            created_at,
            updated_at
          ) VALUES (
            po_record.company_id,
            v_client_brand_id,
            v_client_variant_type_id,
            item_record.variant_name,
            item_record.variant_type,
            NULL,
            NULL,
            NOW(),
            NOW()
          )
          RETURNING id INTO v_client_variant_id;
        END IF;

        INSERT INTO public.warehouse_variant_mappings (
          client_company_id, warehouse_company_id, warehouse_variant_id, client_variant_id
        ) VALUES (
          po_record.company_id, po_record.warehouse_company_id, res.variant_id, v_client_variant_id
        )
        ON CONFLICT (client_company_id, warehouse_variant_id) DO UPDATE
        SET client_variant_id = EXCLUDED.client_variant_id,
            updated_at = NOW();
      END IF;

      SELECT * INTO existing_client_inv
      FROM public.main_inventory
      WHERE variant_id = v_client_variant_id
        AND company_id = po_record.company_id;

      IF FOUND THEN
        UPDATE public.main_inventory
        SET stock = stock + v_remaining,
            updated_at = NOW()
        WHERE variant_id = v_client_variant_id
          AND company_id = po_record.company_id;
      ELSE
        INSERT INTO public.main_inventory (
          company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
        ) VALUES (
          po_record.company_id, v_client_variant_id, v_remaining,
          0, 10, NOW(), NOW()
        );
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.company_id, v_client_variant_id, 'warehouse_transfer_in', v_remaining,
        'purchase_order', p_po_id, p_fulfiller_id,
        'Warehouse transfer in PO ' || po_record.po_number,
        NOW()
      );
    END IF;

    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = quantity_reserved,
        status = 'fulfilled',
        updated_at = NOW()
    WHERE id = res.id;
  END LOOP;

  UPDATE public.warehouse_transfer_location_status
  SET status = 'fulfilled',
      updated_at = NOW()
  WHERE purchase_order_id = p_po_id
    AND warehouse_location_id = p_location_id;

  IF EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_location_status s
    WHERE s.purchase_order_id = p_po_id
      AND s.status <> 'fulfilled'
  ) THEN
    UPDATE public.purchase_orders
    SET status = 'partially_fulfilled',
        updated_at = NOW()
    WHERE id = p_po_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = 'fulfilled',
        updated_at = NOW()
    WHERE id = p_po_id;
  END IF;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

COMMENT ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid) IS
  'Fulfill warehouse transfer PO at a location. Batch lots consumed FIFO across batches, FEFO within batch.';

GRANT EXECUTE ON FUNCTION public.allocate_stock_to_sub_warehouse(uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_inventory_batch_lots_fifo_fefo
  ON public.inventory_batch_lots (
    company_id,
    warehouse_location_id,
    variant_id,
    received_at,
    batch_id,
    expiration_date,
    created_at
  )
  WHERE quantity_remaining > 0;
