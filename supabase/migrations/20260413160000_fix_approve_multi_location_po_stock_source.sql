-- Fix approve_multi_location_po stock source for Main Warehouse locations.
-- The original implementation validated all locations using warehouse_location_inventory,
-- but Main Warehouse stock lives in main_inventory and available = stock - allocated_stock.
--
-- This aligns backend validation with:
-- - existing single-location approve_warehouse_transfer_po logic
-- - the frontend approval preview (requested vs available)

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
  main_available integer;
  v_is_main_location boolean;
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
    -- Ensure location belongs to this warehouse company and determine if it's main.
    SELECT COALESCE(wl.is_main, false) INTO v_is_main_location
    FROM public.warehouse_locations wl
    WHERE wl.id = rec.warehouse_location_id
      AND wl.company_id = po_record.warehouse_company_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid warehouse location for this PO');
    END IF;

    IF v_is_main_location THEN
      SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO main_available
      FROM public.main_inventory mi
      WHERE mi.company_id = po_record.warehouse_company_id
        AND mi.variant_id = rec.variant_id;

      IF main_available IS NULL OR main_available < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
      END IF;
    ELSE
      SELECT COALESCE(wli.stock, 0) INTO loc_stock
      FROM public.warehouse_location_inventory wli
      WHERE wli.company_id = po_record.warehouse_company_id
        AND wli.location_id = rec.warehouse_location_id
        AND wli.variant_id = rec.variant_id;

      IF NOT FOUND OR loc_stock < rec.quantity THEN
        RETURN json_build_object('success', false, 'error', 'Insufficient stock for one or more requested locations');
      END IF;
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

