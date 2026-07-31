-- Client returns: choose destination location (main or sub). Fix receive inventory for both.

-- ---------------------------------------------------------------------------
-- 1) Destination location on return requests
-- ---------------------------------------------------------------------------
ALTER TABLE public.standard_account_stock_return_requests
  ADD COLUMN IF NOT EXISTS destination_location_id uuid
  REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.standard_account_stock_return_requests.destination_location_id IS
  'Warehouse location (main or sub) where the client is returning stock.';

-- Backfill existing rows to warehouse main location.
UPDATE public.standard_account_stock_return_requests r
SET destination_location_id = public.get_main_warehouse_location_id(r.warehouse_company_id)
WHERE r.destination_location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sa_stock_return_requests_destination_location
  ON public.standard_account_stock_return_requests(destination_location_id, status);

-- ---------------------------------------------------------------------------
-- 2) Create: require destination location (main or linked sub)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_standard_account_stock_return_request(
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_destination_location_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_creator uuid;
  v_client_company_id uuid;
  v_warehouse_company_id uuid;
  v_account_type text;
  v_request_id uuid;
  v_request_number text;
  v_item jsonb;
  v_client_variant_id uuid;
  v_warehouse_variant_id uuid;
  v_qty integer;
  v_available integer;
  v_inv RECORD;
  v_dest_loc RECORD;
BEGIN
  v_creator := COALESCE(p_created_by, auth.uid());
  v_client_company_id := public.get_auth_company_id();

  IF v_client_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_creator AND p.company_id = v_client_company_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Only company admins can create warehouse returns');
  END IF;

  SELECT c.company_account_type INTO v_account_type
  FROM public.companies c
  WHERE c.id = v_client_company_id;

  IF v_account_type IS DISTINCT FROM 'Standard Accounts' THEN
    RETURN json_build_object('success', false, 'error', 'Only Standard Accounts can return stock to the warehouse');
  END IF;

  v_warehouse_company_id := public.get_linked_warehouse_company_id();
  IF v_warehouse_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'This company is not linked to a warehouse');
  END IF;

  IF p_destination_location_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Select a warehouse location to return to (main or sub)');
  END IF;

  SELECT wl.id, wl.company_id, wl.name, COALESCE(wl.is_main, false) AS is_main
  INTO v_dest_loc
  FROM public.warehouse_locations wl
  WHERE wl.id = p_destination_location_id
    AND wl.company_id = v_warehouse_company_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Selected warehouse location is not valid for your linked warehouse');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one return line is required');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::int, 0);

    IF v_client_variant_id IS NULL OR v_qty <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line needs a valid product and quantity');
    END IF;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    IF v_warehouse_variant_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No warehouse product mapping found for a selected variant',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    SELECT * INTO v_inv
    FROM public.main_inventory
    WHERE company_id = v_client_company_id
      AND variant_id = v_client_variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Product not found in company inventory',
        'client_variant_id', v_client_variant_id
      );
    END IF;

    v_available := GREATEST(0, COALESCE(v_inv.stock, 0) - COALESCE(v_inv.allocated_stock, 0));
    IF v_qty > v_available THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Insufficient available stock for return',
        'client_variant_id', v_client_variant_id,
        'available', v_available,
        'requested', v_qty
      );
    END IF;
  END LOOP;

  v_request_number := public.generate_standard_account_stock_return_number(v_client_company_id);

  INSERT INTO public.standard_account_stock_return_requests (
    request_number, client_company_id, warehouse_company_id, destination_location_id,
    status, notes, created_by
  ) VALUES (
    v_request_number, v_client_company_id, v_warehouse_company_id, p_destination_location_id,
    'pending_receive', NULLIF(trim(p_notes), ''), v_creator
  )
  RETURNING id INTO v_request_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_client_variant_id := (v_item->>'client_variant_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    SELECT m.warehouse_variant_id INTO v_warehouse_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = v_client_company_id
      AND m.warehouse_company_id = v_warehouse_company_id
      AND m.client_variant_id = v_client_variant_id
    LIMIT 1;

    UPDATE public.main_inventory
    SET stock = COALESCE(stock, 0) - v_qty,
        updated_at = now()
    WHERE company_id = v_client_company_id
      AND variant_id = v_client_variant_id;

    INSERT INTO public.standard_account_stock_return_request_items (
      request_id, client_variant_id, warehouse_variant_id, return_quantity
    ) VALUES (
      v_request_id, v_client_variant_id, v_warehouse_variant_id, v_qty
    );

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_client_company_id, v_client_variant_id, 'client_return_out', v_qty,
      'standard_account_stock_return', v_request_id, v_creator,
      'Return to warehouse ' || v_request_number || ' @ ' || v_dest_loc.name,
      now()
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'request_number', v_request_number,
    'destination_location_id', p_destination_location_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'Duplicate product on return request');
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Receive: credit destination location (main or sub); allow assigned sub inspect
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
        -- Main may inspect sub-destined returns
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
        COALESCE((elem->>'qty_good')::int, 0) + COALESCE((elem->>'qty_damaged')::int, 0)
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
    v_total_qty := v_qty_good + v_qty_damaged;
    v_destination_lot_id := (v_line->>'destination_lot_id')::uuid;

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
        'Client return (damaged) ' || v_request.request_number || ' @ ' || v_dest_loc.name,
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
    'fully_received', v_all_complete
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_standard_account_stock_return_request(jsonb, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_standard_account_stock_return_request(uuid, jsonb, text, uuid) TO authenticated;

-- Keep 3-arg create overload callable by dropping old signature if present (recreate wrapper).
DROP FUNCTION IF EXISTS public.create_standard_account_stock_return_request(jsonb, text, uuid);

-- Allow assigned sub-warehouse users to cancel pending returns destined to their location.
CREATE OR REPLACE FUNCTION public.cancel_standard_account_stock_return_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL,
  p_cancelled_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid;
  v_request RECORD;
  v_item RECORD;
  v_remaining integer;
  v_rows integer;
  v_user_location_id uuid;
BEGIN
  v_actor := COALESCE(p_cancelled_by, auth.uid());

  SELECT * INTO v_request
  FROM public.standard_account_stock_return_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF v_request.status = 'cancelled' THEN
    RETURN json_build_object('success', false, 'error', 'Return request already cancelled');
  END IF;

  IF v_request.status NOT IN ('pending_receive') THEN
    RETURN json_build_object('success', false, 'error', 'Only pending returns can be cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.standard_account_stock_return_request_items i
    WHERE i.request_id = p_request_id AND i.inspected_quantity > 0
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot cancel a return that has already been inspected');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(v_actor);

  IF NOT (
    public.is_system_administrator()
    OR (
      public.is_admin_or_super_admin()
      AND v_request.client_company_id = public.get_auth_company_id()
    )
    OR (
      public.is_warehouse()
      AND v_request.warehouse_company_id = public.get_auth_company_id()
      AND (
        public.is_main_warehouse_user(v_actor)
        OR (
          v_request.destination_location_id IS NOT NULL
          AND v_user_location_id = v_request.destination_location_id
        )
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized to cancel this return');
  END IF;

  FOR v_item IN
    SELECT * FROM public.standard_account_stock_return_request_items
    WHERE request_id = p_request_id
  LOOP
    v_remaining := v_item.return_quantity - v_item.inspected_quantity;
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.main_inventory
    SET stock = COALESCE(stock, 0) + v_remaining,
        updated_at = now()
    WHERE company_id = v_request.client_company_id
      AND variant_id = v_item.client_variant_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
      ) VALUES (
        v_request.client_company_id, v_item.client_variant_id, v_remaining, 0, 100, now(), now()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      v_request.client_company_id, v_item.client_variant_id, 'client_return_cancel_in', v_remaining,
      'standard_account_stock_return', p_request_id, v_actor,
      'Cancelled return ' || v_request.request_number,
      now()
    );
  END LOOP;

  UPDATE public.standard_account_stock_return_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_actor,
      cancellation_reason = NULLIF(trim(p_reason), ''),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('success', true, 'request_number', v_request.request_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
