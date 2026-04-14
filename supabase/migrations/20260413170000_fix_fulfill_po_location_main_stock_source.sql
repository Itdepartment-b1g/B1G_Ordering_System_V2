-- Fix fulfill_po_location stock source for Main Warehouse locations.
-- Previously it always validated/deducted from warehouse_location_inventory, which is incorrect for main locations.
-- Main Warehouse stock is stored in main_inventory (available = stock - allocated_stock).

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
    v_remaining := (res.quantity_reserved - res.quantity_fulfilled);
    IF v_remaining <= 0 THEN
      CONTINUE;
    END IF;

    IF v_is_main_location THEN
      -- Main Warehouse: validate/deduct from main_inventory (available = stock - allocated_stock).
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = res.variant_id;

      IF main_available IS NULL OR main_available < v_remaining THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock at fulfillment time');
      END IF;

      UPDATE public.main_inventory
      SET stock = GREATEST(0, stock - v_remaining),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    ELSE
      -- Sub-warehouse: validate/deduct from warehouse_location_inventory.
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = p_location_id
        AND wli.variant_id = res.variant_id;

      IF NOT FOUND OR loc_stock < v_remaining THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock at fulfillment time');
      END IF;

      UPDATE public.warehouse_location_inventory
      SET stock = stock - v_remaining,
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND location_id = p_location_id
        AND variant_id = res.variant_id;

      -- For sub-warehouse stock, decrement allocated_stock at hub main inventory.
      UPDATE public.main_inventory
      SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_remaining),
          updated_at = NOW()
      WHERE company_id = po_record.warehouse_company_id
        AND variant_id = res.variant_id;
    END IF;

    -- Out transaction (warehouse side)
    INSERT INTO public.inventory_transactions (
      company_id, variant_id, transaction_type, quantity,
      reference_type, reference_id, performed_by, notes, created_at
    ) VALUES (
      po_record.warehouse_company_id, res.variant_id, 'warehouse_transfer_out', v_remaining,
      'purchase_order', p_po_id, p_fulfiller_id,
      'Warehouse transfer out PO ' || po_record.po_number || ' from location ' || p_location_id::text,
      NOW()
    );

    -- Resolve mapping / ensure client variant exists
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

