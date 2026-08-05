-- Protect open transfer PO holds from sub-warehouse allocation and honor hard
-- reservations at fulfill time when batch lots exist at the fulfilling location.

-- ---------------------------------------------------------------------------
-- allocate_stock_to_sub_warehouse: available = stock − allocated − PO holds
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
  v_po_reserved integer;
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

    SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO v_available
    FROM public.main_inventory mi
    WHERE mi.company_id = v_company_id
      AND mi.variant_id = v_variant_id;

    IF v_available IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Variant not stocked at main warehouse');
    END IF;

    v_po_reserved := public.warehouse_open_transfer_reserved(
      v_company_id,
      v_variant_id,
      v_main_loc_id,
      NULL
    );

    v_available := GREATEST(0, v_available - COALESCE(v_po_reserved, 0));

    IF v_available < v_quantity THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Insufficient available stock for allocation',
        'available', v_available,
        'po_reserved', COALESCE(v_po_reserved, 0)
      );
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

COMMENT ON FUNCTION public.allocate_stock_to_sub_warehouse(uuid, jsonb, uuid, text) IS
  'Allocate main warehouse stock to a sub-warehouse. Available = stock − allocated − open transfer PO holds.';

-- ---------------------------------------------------------------------------
-- fulfill_po_location: honor this PO reservation when batch lots exist
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_po_location(
  p_po_id uuid,
  p_location_id uuid,
  p_fulfiller_id uuid DEFAULT auth.uid(),
  p_items jsonb DEFAULT NULL
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
  loc_stock integer;
  main_available integer;
  v_is_main_location boolean;
  v_remaining integer;
  v_ship_qty integer;
  v_consume_result jsonb;
  v_open_reserved integer;
  v_pool_available integer;
  v_batch_at_loc integer;
  v_requested integer;
  v_fulfilled_items jsonb := '[]'::jsonb;
  v_any_shipped boolean := false;
  v_loc_fully_done boolean;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;
  IF po_record.status IS DISTINCT FROM 'approved_for_fulfillment'
     AND po_record.status IS DISTINCT FROM 'partially_fulfilled' THEN
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

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'p_items must be a non-empty array');
    END IF;
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

    IF p_items IS NULL THEN
      v_ship_qty := v_remaining;
    ELSE
      SELECT COALESCE((
        SELECT (elem->>'quantity')::int
        FROM jsonb_array_elements(p_items) elem
        WHERE (elem->>'variant_id')::uuid = res.variant_id
        LIMIT 1
      ), 0) INTO v_requested;

      IF v_requested <= 0 THEN
        CONTINUE;
      END IF;
      IF v_requested > v_remaining THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Ship quantity exceeds remaining reserved quantity',
          'variant_id', res.variant_id,
          'remaining', v_remaining,
          'requested', v_requested
        );
      END IF;
      v_ship_qty := v_requested;
    END IF;

    v_open_reserved := public.warehouse_open_transfer_reserved(
      po_record.warehouse_company_id,
      res.variant_id,
      p_location_id,
      p_po_id
    );

    SELECT COALESCE(SUM(ibl.quantity_remaining), 0)::int INTO v_batch_at_loc
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = po_record.warehouse_company_id
      AND ibl.warehouse_location_id = p_location_id
      AND ibl.variant_id = res.variant_id
      AND ibl.quantity_remaining > 0;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = res.variant_id;

      v_pool_available := GREATEST(0, COALESCE(main_available, 0) - COALESCE(v_open_reserved, 0));

      IF main_available IS NULL
         OR NOT (
           v_pool_available >= v_ship_qty
           OR (v_remaining >= v_ship_qty AND v_batch_at_loc >= v_ship_qty)
         ) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient stock at fulfillment time',
          'available', v_pool_available,
          'batch_at_location', COALESCE(v_batch_at_loc, 0),
          'po_reserved_remaining', v_remaining,
          'requested', v_ship_qty
        );
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = p_location_id
        AND wli.variant_id = res.variant_id;

      v_pool_available := GREATEST(0, COALESCE(loc_stock, 0) - COALESCE(v_open_reserved, 0));

      IF NOT FOUND
         OR NOT (
           v_pool_available >= v_ship_qty
           OR (v_remaining >= v_ship_qty AND v_batch_at_loc >= v_ship_qty)
         ) THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Insufficient stock at fulfillment time',
          'available', v_pool_available,
          'batch_at_location', COALESCE(v_batch_at_loc, 0),
          'po_reserved_remaining', v_remaining,
          'requested', v_ship_qty
        );
      END IF;
    END IF;

    v_consume_result := public.consume_inventory_lots_fifo_fefo(
      po_record.warehouse_company_id,
      p_location_id,
      res.variant_id,
      v_ship_qty,
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
      SET stock = GREATEST(0, stock - v_ship_qty),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    ELSE
      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_ship_qty,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND location_id = p_location_id
        AND variant_id = res.variant_id;

      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_ship_qty),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, res.variant_id, 'warehouse_transfer_out', v_ship_qty,
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from location ' || p_location_id::text,
      NOW()
    );

    UPDATE public.warehouse_transfer_reservations
    SET quantity_fulfilled = quantity_fulfilled + v_ship_qty,
        status = CASE
          WHEN quantity_fulfilled + v_ship_qty >= quantity_reserved THEN 'fulfilled'
          ELSE 'partial'
        END,
        updated_at = NOW()
    WHERE id = res.id;

    v_any_shipped := true;
    v_fulfilled_items := v_fulfilled_items || jsonb_build_array(
      jsonb_build_object('variant_id', res.variant_id, 'quantity', v_ship_qty)
    );
  END LOOP;

  IF NOT v_any_shipped THEN
    RETURN json_build_object('success', false, 'error', 'No quantities to fulfill');
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'cancelled'
      AND (r.quantity_reserved - r.quantity_fulfilled) > 0
  ) INTO v_loc_fully_done;

  UPDATE public.warehouse_transfer_location_status
  SET status = CASE WHEN v_loc_fully_done THEN 'fulfilled' ELSE 'partial' END,
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

  RETURN json_build_object(
    'success', true,
    'po_number', po_record.po_number,
    'items', v_fulfilled_items,
    'location_fully_fulfilled', v_loc_fully_done
  );
END;
$$;

COMMENT ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid, jsonb) IS
  'Partial-aware warehouse transfer fulfill. Pool check excludes other PO holds; honors this PO hard reservation when batch lots exist at the fulfilling location.';

GRANT EXECUTE ON FUNCTION public.allocate_stock_to_sub_warehouse(uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid, jsonb) TO authenticated;
