-- SA return to warehouse:
-- 1) Auto-create warehouse brand/variant_type/variant + mapping when missing
--    (mirror of warehouse→client transfer receive), for Stock Return and For Disposal.
-- 2) On warehouse inspect, item_disposal forces all qty to disposal (qty_good = 0).

-- ---------------------------------------------------------------------------
-- ensure_client_warehouse_variant_mapping — match or auto-create
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_client_warehouse_variant_mapping(
  p_client_company_id uuid,
  p_warehouse_company_id uuid,
  p_client_variant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse_variant_id uuid;
  v_existing_client_variant_id uuid;
  v_client RECORD;
  v_warehouse_brand_id uuid;
  v_warehouse_variant_type_id uuid;
  v_type_name text;
  v_type_display text;
  v_actor uuid;
BEGIN
  IF p_client_company_id IS NULL
     OR p_warehouse_company_id IS NULL
     OR p_client_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_actor := auth.uid();

  -- 1) Existing mapping for this client SKU
  SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
  FROM public.warehouse_variant_mappings m
  WHERE m.client_company_id = p_client_company_id
    AND m.warehouse_company_id = p_warehouse_company_id
    AND m.client_variant_id = p_client_variant_id
  LIMIT 1;

  IF v_warehouse_variant_id IS NOT NULL THEN
    RETURN v_warehouse_variant_id;
  END IF;

  -- 2) Load client product identity
  SELECT
    v.id AS client_variant_id,
    v.name AS variant_name,
    v.variant_type AS variant_type,
    v.variant_type_id AS client_variant_type_id,
    b.name AS brand_name
  INTO v_client
  FROM public.variants v
  JOIN public.brands b ON b.id = v.brand_id
  WHERE v.id = p_client_variant_id
    AND v.company_id = p_client_company_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_type_name := lower(trim(COALESCE(v_client.variant_type, '')));
  IF v_type_name = '' AND v_client.client_variant_type_id IS NOT NULL THEN
    SELECT lower(trim(vt.name)), COALESCE(NULLIF(trim(vt.display_name), ''), vt.name)
    INTO v_type_name, v_type_display
    FROM public.variant_types vt
    WHERE vt.id = v_client.client_variant_type_id;
  END IF;

  IF v_type_name IS NULL OR v_type_name = '' THEN
    v_type_name := 'unknown';
    v_type_display := 'Unknown';
  ELSIF v_type_display IS NULL OR v_type_display = '' THEN
    v_type_display := v_client.variant_type;
    IF v_type_display IS NULL OR trim(v_type_display) = '' THEN
      v_type_display := initcap(v_type_name);
    END IF;
  END IF;

  -- 3) Match or create warehouse brand by name
  SELECT br.id INTO v_warehouse_brand_id
  FROM public.brands br
  WHERE br.company_id = p_warehouse_company_id
    AND lower(br.name) = lower(v_client.brand_name)
  LIMIT 1;

  IF v_warehouse_brand_id IS NULL THEN
    INSERT INTO public.brands (company_id, name, description, created_by, created_at, updated_at)
    VALUES (
      p_warehouse_company_id,
      v_client.brand_name,
      NULL,
      v_actor,
      now(),
      now()
    )
    RETURNING id INTO v_warehouse_brand_id;
  END IF;

  -- 4) Match warehouse variant by brand + name (+ type when present)
  SELECT wv.id INTO v_warehouse_variant_id
  FROM public.variants wv
  WHERE wv.company_id = p_warehouse_company_id
    AND wv.brand_id = v_warehouse_brand_id
    AND lower(wv.name) = lower(v_client.variant_name)
    AND (
      v_client.variant_type IS NULL
      OR trim(v_client.variant_type) = ''
      OR lower(COALESCE(wv.variant_type, '')) = lower(v_client.variant_type)
    )
  ORDER BY wv.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_warehouse_variant_id IS NULL THEN
    SELECT wv.id INTO v_warehouse_variant_id
    FROM public.variants wv
    WHERE wv.company_id = p_warehouse_company_id
      AND wv.brand_id = v_warehouse_brand_id
      AND lower(wv.name) = lower(v_client.variant_name)
    ORDER BY wv.created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  -- 5) Auto-create warehouse variant (+ type) when still missing
  IF v_warehouse_variant_id IS NULL THEN
    SELECT vt.id INTO v_warehouse_variant_type_id
    FROM public.variant_types vt
    WHERE vt.company_id = p_warehouse_company_id
      AND lower(vt.name) = v_type_name
    LIMIT 1;

    IF v_warehouse_variant_type_id IS NULL THEN
      INSERT INTO public.variant_types (
        company_id, name, display_name, description, color_code, sort_order
      ) VALUES (
        p_warehouse_company_id,
        v_type_name,
        v_type_display,
        NULL,
        'blue',
        0
      )
      RETURNING id INTO v_warehouse_variant_type_id;
    END IF;

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
      p_warehouse_company_id,
      v_warehouse_brand_id,
      v_warehouse_variant_type_id,
      v_client.variant_name,
      COALESCE(NULLIF(trim(v_client.variant_type), ''), v_type_name),
      NULL,
      NULL,
      now(),
      now()
    )
    RETURNING id INTO v_warehouse_variant_id;
  END IF;

  IF v_warehouse_variant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 6) Do not steal an existing mapping for a different client SKU
  SELECT m.client_variant_id INTO v_existing_client_variant_id
  FROM public.warehouse_variant_mappings m
  WHERE m.client_company_id = p_client_company_id
    AND m.warehouse_company_id = p_warehouse_company_id
    AND m.warehouse_variant_id = v_warehouse_variant_id
  LIMIT 1;

  IF v_existing_client_variant_id IS NOT NULL
     AND v_existing_client_variant_id IS DISTINCT FROM p_client_variant_id THEN
    -- Warehouse SKU already mapped to another client SKU: create a dedicated warehouse copy
    SELECT vt.id INTO v_warehouse_variant_type_id
    FROM public.variant_types vt
    WHERE vt.company_id = p_warehouse_company_id
      AND lower(vt.name) = v_type_name
    LIMIT 1;

    IF v_warehouse_variant_type_id IS NULL THEN
      INSERT INTO public.variant_types (
        company_id, name, display_name, description, color_code, sort_order
      ) VALUES (
        p_warehouse_company_id, v_type_name, v_type_display, NULL, 'blue', 0
      )
      RETURNING id INTO v_warehouse_variant_type_id;
    END IF;

    INSERT INTO public.variants (
      company_id, brand_id, variant_type_id, name, variant_type,
      description, sku, created_at, updated_at
    ) VALUES (
      p_warehouse_company_id,
      v_warehouse_brand_id,
      v_warehouse_variant_type_id,
      v_client.variant_name,
      COALESCE(NULLIF(trim(v_client.variant_type), ''), v_type_name),
      NULL,
      NULL,
      now(),
      now()
    )
    RETURNING id INTO v_warehouse_variant_id;
  END IF;

  INSERT INTO public.warehouse_variant_mappings (
    client_company_id,
    warehouse_company_id,
    warehouse_variant_id,
    client_variant_id
  ) VALUES (
    p_client_company_id,
    p_warehouse_company_id,
    v_warehouse_variant_id,
    p_client_variant_id
  )
  ON CONFLICT (client_company_id, warehouse_variant_id) DO UPDATE
  SET client_variant_id = EXCLUDED.client_variant_id,
      updated_at = now()
  WHERE public.warehouse_variant_mappings.client_variant_id = EXCLUDED.client_variant_id
     OR public.warehouse_variant_mappings.client_variant_id IS NULL;

  SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
  FROM public.warehouse_variant_mappings m
  WHERE m.client_company_id = p_client_company_id
    AND m.warehouse_company_id = p_warehouse_company_id
    AND m.client_variant_id = p_client_variant_id
  LIMIT 1;

  RETURN v_warehouse_variant_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_client_warehouse_variant_mapping(uuid, uuid, uuid) IS
  'Resolves client variant to linked warehouse variant via mapping or brand+name match; auto-creates warehouse brand/type/variant and mapping when missing (same idea as transfer receive).';

-- ---------------------------------------------------------------------------
-- receive: force disposal when return_type = item_disposal
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_standard_account_stock_return_request(
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
  v_receiver uuid;
  v_request RECORD;
  v_dest_loc RECORD;
  v_user_location_id uuid;
  v_is_main_user boolean;
  v_receipt_id uuid;
  v_received_at timestamptz;
  v_line jsonb;
  v_request_item_id uuid;
  v_qty_good integer;
  v_qty_damaged integer;
  v_total_qty integer;
  v_item RECORD;
  v_remaining integer;
  v_destination_lot_id uuid;
  v_destination_lot RECORD;
  v_line_amount numeric(14, 2);
  v_all_complete boolean;
  v_total_inspected integer := 0;
  v_agg RECORD;
  v_agg_total integer;
  v_rows integer;
  v_force_disposal boolean := false;
BEGIN
  v_receiver := COALESCE(p_received_by, auth.uid());
  v_received_at := now();

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  v_force_disposal := COALESCE(v_request.return_type, 'my_inventory') = 'item_disposal';

  IF v_request.warehouse_company_id IS DISTINCT FROM public.get_auth_company_id()
     AND NOT public.is_system_administrator() THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse company mismatch');
  END IF;

  IF v_request.destination_location_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Return has no destination warehouse location');
  END IF;

  SELECT wl.id, wl.company_id, wl.name, COALESCE(wl.is_main, false) AS is_main
  INTO v_dest_loc
  FROM public.warehouse_locations wl
  WHERE wl.id = v_request.destination_location_id
    AND wl.company_id = v_request.warehouse_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Destination warehouse location not found');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(v_receiver);
  v_is_main_user := public.is_main_warehouse_user(v_receiver);

  IF NOT public.is_system_administrator() THEN
    IF NOT public.is_warehouse() THEN
      RETURN json_build_object('success', false, 'error', 'Only warehouse users can inspect client returns');
    END IF;

    IF v_dest_loc.is_main THEN
      IF NOT v_is_main_user THEN
        RETURN json_build_object('success', false, 'error', 'Only main warehouse users can inspect returns to main');
      END IF;
    ELSE
      IF v_is_main_user THEN
        NULL;
      ELSIF v_user_location_id IS DISTINCT FROM v_request.destination_location_id THEN
        RETURN json_build_object('success', false, 'error', 'You can only inspect returns for your assigned sub-warehouse');
      END IF;
    END IF;
  END IF;

  IF v_request.status NOT IN ('pending_receive', 'partially_received') THEN
    RETURN json_build_object('success', false, 'error', 'Return request is not open for receiving');
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

    IF v_force_disposal THEN
      v_qty_damaged := v_qty_good + v_qty_damaged;
      v_qty_good := 0;
    END IF;

    IF v_request_item_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid inspection line');
    END IF;
    IF v_destination_lot_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Warehouse batch lot selection is required');
    END IF;
    IF v_qty_good < 0 OR v_qty_damaged < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Quantities cannot be negative');
    END IF;
    IF v_qty_good + v_qty_damaged <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each distribution row must have at least one inspected unit');
    END IF;

    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_request_item_id AND request_id = p_request_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Return line not found on this request');
    END IF;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots ibl
    WHERE ibl.id = v_destination_lot_id
      AND ibl.company_id = v_request.warehouse_company_id
      AND ibl.warehouse_location_id = v_request.destination_location_id
      AND ibl.variant_id = v_item.warehouse_variant_id;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Selected batch lot not found for this product at the return destination',
        'request_item_id', v_request_item_id
      );
    END IF;
  END LOOP;

  FOR v_agg IN
    SELECT
      (elem->>'request_item_id')::uuid AS request_item_id,
      SUM(
        CASE
          WHEN v_force_disposal THEN
            COALESCE((elem->>'qty_good')::int, 0) + COALESCE((elem->>'qty_damaged')::int, 0)
          ELSE
            COALESCE((elem->>'qty_good')::int, 0) + COALESCE((elem->>'qty_damaged')::int, 0)
        END
      )::integer AS total_qty
    FROM jsonb_array_elements(p_lines) AS elem
    GROUP BY (elem->>'request_item_id')::uuid
  LOOP
    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_agg.request_item_id AND request_id = p_request_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Return line not found on this request');
    END IF;

    v_agg_total := v_agg.total_qty;
    v_remaining := v_item.return_quantity - v_item.inspected_quantity;

    IF v_agg_total > v_remaining THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Total distributed quantity exceeds remaining for a return line',
        'request_item_id', v_agg.request_item_id,
        'remaining', v_remaining,
        'requested', v_agg_total
      );
    END IF;
  END LOOP;

  INSERT INTO public.standard_account_stock_return_receipts (
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
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

    IF v_force_disposal THEN
      v_qty_damaged := v_qty_good + v_qty_damaged;
      v_qty_good := 0;
    END IF;

    v_total_qty := v_qty_good + v_qty_damaged;

    IF v_total_qty <= 0 OR v_request_item_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item
    FROM public.standard_account_stock_return_request_items
    WHERE id = v_request_item_id AND request_id = p_request_id
    FOR UPDATE;

    SELECT * INTO v_destination_lot
    FROM public.inventory_batch_lots
    WHERE id = v_destination_lot_id
    FOR UPDATE;

    INSERT INTO public.standard_account_stock_return_receipt_lines (
      receipt_id, request_item_id, warehouse_variant_id, destination_lot_id,
      qty_good, qty_damaged
    ) VALUES (
      v_receipt_id, v_request_item_id, v_item.warehouse_variant_id, v_destination_lot_id,
      v_qty_good, v_qty_damaged
    );

    IF v_qty_good > 0 THEN
      IF v_dest_loc.is_main THEN
        UPDATE public.main_inventory
        SET stock = COALESCE(stock, 0) + v_qty_good,
            updated_at = now()
        WHERE company_id = v_request.warehouse_company_id
          AND variant_id = v_item.warehouse_variant_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          INSERT INTO public.main_inventory (
            company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
          ) VALUES (
            v_request.warehouse_company_id, v_item.warehouse_variant_id, v_qty_good,
            0, 100, now(), now()
          );
        END IF;
      ELSE
        INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock, updated_at)
        VALUES (
          v_request.warehouse_company_id, v_request.destination_location_id,
          v_item.warehouse_variant_id, v_qty_good, now()
        )
        ON CONFLICT (location_id, variant_id) DO UPDATE
        SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
            updated_at = now();

        UPDATE public.main_inventory
        SET allocated_stock = COALESCE(allocated_stock, 0) + v_qty_good,
            updated_at = now()
        WHERE company_id = v_request.warehouse_company_id
          AND variant_id = v_item.warehouse_variant_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          INSERT INTO public.main_inventory (
            company_id, variant_id, stock, allocated_stock, unit_price, reorder_level, created_at, updated_at
          ) VALUES (
            v_request.warehouse_company_id, v_item.warehouse_variant_id, 0, v_qty_good,
            0, 100, now(), now()
          );
        END IF;
      END IF;

      v_line_amount := CASE
        WHEN v_destination_lot.unit_cost IS NOT NULL
          THEN round((v_qty_good::numeric * v_destination_lot.unit_cost), 2)
        ELSE NULL
      END;

      UPDATE public.inventory_batch_lots
      SET quantity_received = quantity_received + v_qty_good,
          quantity_remaining = quantity_remaining + v_qty_good,
          line_amount = COALESCE(line_amount, 0) + COALESCE(v_line_amount, 0),
          updated_at = now()
      WHERE id = v_destination_lot_id;

      INSERT INTO public.inventory_batch_movements (
        company_id, lot_id, batch_id, variant_id, warehouse_location_id,
        movement_type, quantity, reference_type, reference_id,
        to_location_id, performed_by, notes
      ) VALUES (
        v_request.warehouse_company_id, v_destination_lot_id, v_destination_lot.batch_id,
        v_item.warehouse_variant_id, v_request.destination_location_id,
        'client_return_in', v_qty_good, 'standard_account_stock_return', p_request_id,
        v_request.destination_location_id, v_receiver,
        'Client return (good) ' || v_request.request_number
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.warehouse_company_id, v_item.warehouse_variant_id, 'client_return_in', v_qty_good,
        'standard_account_stock_return', p_request_id, v_receiver,
        'Client return (good) ' || v_request.request_number || ' @ ' || v_dest_loc.name,
        now()
      );
    END IF;

    IF v_qty_damaged > 0 THEN
      INSERT INTO public.warehouse_inventory_disposals (
        company_id, warehouse_location_id, variant_id, quantity,
        source_type, standard_account_stock_return_request_id,
        notes, disposed_by
      ) VALUES (
        v_request.warehouse_company_id, v_request.destination_location_id,
        v_item.warehouse_variant_id, v_qty_damaged,
        'standard_account_return', p_request_id,
        NULLIF(trim(p_notes), ''), v_receiver
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        v_request.warehouse_company_id, v_item.warehouse_variant_id, 'client_return_disposed', v_qty_damaged,
        'standard_account_stock_return', p_request_id, v_receiver,
        CASE
          WHEN v_force_disposal THEN
            'Client return (for disposal) ' || v_request.request_number || ' @ ' || v_dest_loc.name
          ELSE
            'Client return (damaged) ' || v_request.request_number || ' @ ' || v_dest_loc.name
        END,
        now()
      );
    END IF;

    UPDATE public.standard_account_stock_return_request_items
    SET inspected_quantity = inspected_quantity + v_total_qty
    WHERE id = v_request_item_id;

    v_total_inspected := v_total_inspected + v_total_qty;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.standard_account_stock_return_request_items i
    WHERE i.request_id = p_request_id
      AND i.inspected_quantity < i.return_quantity
  ) INTO v_all_complete;

  UPDATE public.standard_account_stock_return_requests
  SET status = CASE WHEN v_all_complete THEN 'fully_received' ELSE 'partially_received' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'request_number', v_request.request_number,
    'total_inspected', v_total_inspected,
    'fully_received', v_all_complete,
    'force_disposal', v_force_disposal
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_client_warehouse_variant_mapping(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_standard_account_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;
