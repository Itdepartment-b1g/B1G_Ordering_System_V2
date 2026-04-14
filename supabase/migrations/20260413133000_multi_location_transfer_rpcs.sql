-- Multi-location warehouse transfer flow:
-- - approve_multi_location_po: main warehouse approves + creates reservations per location+variant
-- - fulfill_po_location: a (sub)warehouse fulfills its slice; deducts stock and transfers into client inventory

-- 1) Relax header constraint to allow multi-location transfers without a single warehouse_location_id.
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_fulfillment_fields_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_fulfillment_fields_check
  CHECK (
    (fulfillment_type = 'supplier' AND supplier_id IS NOT NULL AND warehouse_company_id IS NULL AND warehouse_location_id IS NULL)
    OR
    (fulfillment_type = 'warehouse_transfer' AND supplier_id IS NULL AND warehouse_company_id IS NOT NULL)
  );

-- 2) Approve + reserve (main warehouse only)
CREATE OR REPLACE FUNCTION public.approve_multi_location_po(p_po_id uuid, p_approver_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_approver RECORD;
  rec RECORD;
  loc_stock integer;
BEGIN
  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.fulfillment_type IS DISTINCT FROM 'warehouse_transfer' THEN
    RETURN json_build_object('success', false, 'error', 'Not a warehouse transfer purchase order');
  END IF;

  -- Approver must be main warehouse user of the PO warehouse company.
  SELECT p.id, p.role, p.company_id INTO v_approver
  FROM public.profiles p
  WHERE p.id = p_approver_id;

  IF NOT FOUND OR v_approver.role IS DISTINCT FROM 'warehouse' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse users can approve this purchase order');
  END IF;
  IF v_approver.company_id IS DISTINCT FROM po_record.warehouse_company_id THEN
    RETURN json_build_object('success', false, 'error', 'Approver warehouse company does not match purchase order warehouse');
  END IF;
  IF NOT public.is_main_warehouse_user(p_approver_id) THEN
    RETURN json_build_object('success', false, 'error', 'Only main warehouse users can approve multi-location POs');
  END IF;

  -- Assignment guard (same as existing transfer approval)
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_company_assignments wca
    JOIN public.profiles wp ON wp.id = wca.warehouse_user_id
    WHERE wca.client_company_id = po_record.company_id
      AND wp.company_id = po_record.warehouse_company_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse is not assigned to fulfill orders for this company');
  END IF;

  -- Validate items (must have per-item location)
  IF EXISTS (
    SELECT 1
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
      AND poi.warehouse_location_id IS NULL
  ) THEN
    RETURN json_build_object('success', false, 'error', 'All items must have a warehouse location for multi-location approval');
  END IF;

  -- Validate stock per location+variant aggregated, and create reservation rows.
  FOR rec IN
    SELECT
      poi.company_id AS client_company_id,
      poi.warehouse_location_id,
      poi.variant_id,
      SUM(poi.quantity)::int AS quantity
    FROM public.purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
    GROUP BY poi.company_id, poi.warehouse_location_id, poi.variant_id
  LOOP
    -- Ensure location belongs to this warehouse company
    IF NOT EXISTS (
      SELECT 1
      FROM public.warehouse_locations wl
      WHERE wl.id = rec.warehouse_location_id
        AND wl.company_id = po_record.warehouse_company_id
    ) THEN
      RETURN json_build_object('success', false, 'error', 'Invalid warehouse location for this PO');
    END IF;

    SELECT COALESCE(wli.stock, 0) INTO loc_stock
    FROM public.warehouse_location_inventory wli
    WHERE wli.company_id = po_record.warehouse_company_id
      AND wli.location_id = rec.warehouse_location_id
      AND wli.variant_id = rec.variant_id;

    IF NOT FOUND OR loc_stock < rec.quantity THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
    END IF;

    INSERT INTO public.warehouse_transfer_reservations (
      purchase_order_id,
      warehouse_company_id,
      warehouse_location_id,
      variant_id,
      quantity_reserved,
      quantity_fulfilled,
      status,
      created_by
    ) VALUES (
      p_po_id,
      po_record.warehouse_company_id,
      rec.warehouse_location_id,
      rec.variant_id,
      rec.quantity,
      0,
      'reserved',
      p_approver_id
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id, variant_id) DO UPDATE
    SET quantity_reserved = EXCLUDED.quantity_reserved,
        quantity_fulfilled = 0,
        status = 'reserved',
        updated_at = NOW();

    INSERT INTO public.warehouse_transfer_location_status (
      purchase_order_id,
      warehouse_company_id,
      warehouse_location_id,
      status
    ) VALUES (
      p_po_id,
      po_record.warehouse_company_id,
      rec.warehouse_location_id,
      'ready'
    )
    ON CONFLICT (purchase_order_id, warehouse_location_id) DO UPDATE
    SET status = 'ready',
        updated_at = NOW();
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'approved_for_fulfillment',
      approved_by = p_approver_id,
      approved_at = NOW()
  WHERE id = p_po_id;

  RETURN json_build_object('success', true, 'po_number', po_record.po_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_multi_location_po(uuid, uuid) TO authenticated;

-- 3) Fulfill a single location’s slice (sub-warehouse or main warehouse)
CREATE OR REPLACE FUNCTION public.fulfill_po_location(p_po_id uuid, p_location_id uuid, p_fulfiller_id uuid DEFAULT auth.uid())
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
  v_client_variant_id uuid;
  v_client_brand_id uuid;
  v_client_variant_type_id uuid;
  existing_client_inv RECORD;
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

  -- Validate there are reservations for this location
  IF NOT EXISTS (
    SELECT 1
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'cancelled'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No reservations found for this location');
  END IF;

  -- Fulfill reservations variant-by-variant
  FOR res IN
    SELECT *
    FROM public.warehouse_transfer_reservations r
    WHERE r.purchase_order_id = p_po_id
      AND r.warehouse_location_id = p_location_id
      AND r.status <> 'fulfilled'
      AND r.status <> 'cancelled'
  LOOP
    IF res.quantity_reserved <= res.quantity_fulfilled THEN
      CONTINUE;
    END IF;

    -- Check location stock just-in-time (should be sufficient due to reservation, but keep safe)
    SELECT COALESCE(wli.stock, 0) INTO loc_stock
    FROM public.warehouse_location_inventory wli
    WHERE wli.company_id = po_record.warehouse_company_id
      AND wli.location_id = p_location_id
      AND wli.variant_id = res.variant_id;

    IF NOT FOUND OR loc_stock < (res.quantity_reserved - res.quantity_fulfilled) THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient stock at fulfillment time');
    END IF;

    -- Deduct from location inventory
    UPDATE public.warehouse_location_inventory
    SET stock = stock - (res.quantity_reserved - res.quantity_fulfilled),
        updated_at = NOW()
    WHERE company_id = po_record.warehouse_company_id
      AND location_id = p_location_id
      AND variant_id = res.variant_id;

    -- Decrement allocated stock at hub main inventory (warehouse side)
    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - (res.quantity_reserved - res.quantity_fulfilled)),
        updated_at = NOW()
    WHERE company_id = po_record.warehouse_company_id
      AND variant_id = res.variant_id;

    -- Out transaction (warehouse side)
    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, res.variant_id, 'warehouse_transfer_out', (res.quantity_reserved - res.quantity_fulfilled),
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from location ' || p_location_id::text,
      NOW()
    );

    -- Resolve mapping / ensure client variant exists (reuse logic from approve_warehouse_transfer_po)
    v_client_variant_id := NULL;
    SELECT m.client_variant_id INTO v_client_variant_id
    FROM public.warehouse_variant_mappings m
    WHERE m.client_company_id = po_record.company_id
      AND m.warehouse_company_id = po_record.warehouse_company_id
      AND m.warehouse_variant_id = res.variant_id;

    IF v_client_variant_id IS NULL THEN
      -- Load source variant + brand names/types
      SELECT
        v.id AS warehouse_variant_id,
        v.name AS variant_name,
        v.variant_type AS variant_type,
        b.name AS brand_name
      INTO item_record
      FROM public.variants v
      JOIN public.brands b ON b.id = v.brand_id
      WHERE v.id = res.variant_id;

      -- Ensure client brand exists
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
          company_id, brand_id, variant_type_id, name, variant_type,
          unit_price, selling_price, created_at, updated_at
        ) VALUES (
          po_record.company_id, v_client_brand_id, v_client_variant_type_id,
          item_record.variant_name, item_record.variant_type,
          NULL, NULL, NOW(), NOW()
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

    -- Client-side inventory update (in)
    SELECT * INTO existing_client_inv
    FROM public.main_inventory
    WHERE variant_id = v_client_variant_id
      AND company_id = po_record.company_id;

    IF FOUND THEN
      UPDATE public.main_inventory
      SET stock = stock + (res.quantity_reserved - res.quantity_fulfilled),
          updated_at = NOW()
      WHERE variant_id = v_client_variant_id
        AND company_id = po_record.company_id;
    ELSE
      INSERT INTO public.main_inventory (
        company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
      ) VALUES (
        po_record.company_id, v_client_variant_id, (res.quantity_reserved - res.quantity_fulfilled),
        0, 10, NOW(), NOW()
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.company_id, v_client_variant_id, 'warehouse_transfer_in', (res.quantity_reserved - res.quantity_fulfilled),
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer in PO ' || po_record.po_number,
      NOW()
    );

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

  -- Update PO header status based on remaining locations
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

GRANT EXECUTE ON FUNCTION public.fulfill_po_location(uuid, uuid, uuid) TO authenticated;

