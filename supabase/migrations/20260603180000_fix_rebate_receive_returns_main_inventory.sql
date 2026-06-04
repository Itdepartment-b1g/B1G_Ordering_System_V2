-- Fix: good-condition restock used ON CONFLICT (company_id, variant_id) on main_inventory,
-- but that table has no unique constraint on those columns (only warehouse_location_inventory does).
-- Damaged-only path worked because it never touched main_inventory.

CREATE OR REPLACE FUNCTION public.receive_key_account_rebate_returns(
  p_fulfillment_po_id uuid,
  p_lines jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  po_record RECORD;
  v_rebate RECORD;
  v_user RECORD;
  v_user_location_id uuid;
  v_is_main_user boolean;
  v_line jsonb;
  v_rebate_line RECORD;
  v_qty_good integer;
  v_qty_damaged integer;
  v_wh_loc uuid;
  v_ret_is_main boolean;
  v_receipt_id uuid;
  v_rows integer;
BEGIN
  SELECT p.id, p.role, p.company_id INTO v_user
  FROM public.profiles p
  WHERE p.id = auth.uid();
  IF NOT FOUND OR v_user.role IS DISTINCT FROM 'warehouse' THEN
    RETURN json_build_object('success', false, 'error', 'Only warehouse users can receive returns');
  END IF;

  SELECT * INTO po_record FROM public.purchase_orders WHERE id = p_fulfillment_po_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF po_record.po_order_kind IS DISTINCT FROM 'rebate_fulfillment' OR po_record.source_rebate_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not a rebate replacement purchase order');
  END IF;

  IF po_record.warehouse_company_id IS DISTINCT FROM v_user.company_id THEN
    RETURN json_build_object('success', false, 'error', 'Warehouse company mismatch');
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Inspection lines are required');
  END IF;

  SELECT * INTO v_rebate
  FROM public.key_account_po_rebates r
  WHERE r.id = po_record.source_rebate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Rebate not found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.key_account_po_rebate_return_receipts rr WHERE rr.rebate_id = v_rebate.id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Returns were already received for this rebate');
  END IF;

  v_user_location_id := public.get_warehouse_location_id(auth.uid());
  v_is_main_user := public.is_main_warehouse_user(auth.uid());

  INSERT INTO public.key_account_po_rebate_return_receipts (
    rebate_id, fulfillment_po_id, received_by, notes
  ) VALUES (
    v_rebate.id, p_fulfillment_po_id, auth.uid(), NULLIF(trim(p_notes), '')
  )
  RETURNING id INTO v_receipt_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty_good := COALESCE((v_line->>'qty_good')::int, 0);
    v_qty_damaged := COALESCE((v_line->>'qty_damaged')::int, 0);
    IF v_qty_good < 0 OR v_qty_damaged < 0 THEN
      RETURN json_build_object('success', false, 'error', 'Quantities cannot be negative');
    END IF;
    IF v_qty_good + v_qty_damaged <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each line must have at least one received unit');
    END IF;

    SELECT l.*, poi.warehouse_location_id AS item_wh_loc
    INTO v_rebate_line
    FROM public.key_account_po_rebate_lines l
    JOIN public.purchase_order_items poi ON poi.id = l.purchase_order_item_id
    WHERE l.id = (v_line->>'rebate_line_id')::uuid
      AND l.rebate_id = v_rebate.id;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'Invalid rebate line');
    END IF;

    IF v_qty_good + v_qty_damaged > v_rebate_line.disputed_quantity THEN
      RETURN json_build_object('success', false, 'error', 'Received quantity exceeds disputed quantity for a line');
    END IF;

    v_wh_loc := v_rebate_line.item_wh_loc;
    IF v_wh_loc IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Missing warehouse location on disputed line');
    END IF;

    IF NOT v_is_main_user AND v_user_location_id IS DISTINCT FROM v_wh_loc THEN
      RETURN json_build_object('success', false, 'error', 'You can only receive returns for your assigned warehouse location');
    END IF;

    INSERT INTO public.key_account_po_rebate_return_receipt_lines (
      receipt_id, rebate_line_id, warehouse_location_id, variant_id, qty_good, qty_damaged
    ) VALUES (
      v_receipt_id, v_rebate_line.id, v_wh_loc, v_rebate_line.variant_id, v_qty_good, v_qty_damaged
    );

    SELECT COALESCE(wl.is_main, false) INTO v_ret_is_main
    FROM public.warehouse_locations wl
    WHERE wl.id = v_wh_loc
      AND wl.company_id = po_record.warehouse_company_id;

    IF v_qty_good > 0 THEN
      IF COALESCE(v_ret_is_main, false) THEN
        -- Main warehouse: UPDATE first (no ON CONFLICT — main_inventory has no unique on company+variant)
        UPDATE public.main_inventory
        SET stock = COALESCE(stock, 0) + v_qty_good,
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND variant_id = v_rebate_line.variant_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          INSERT INTO public.main_inventory (
            company_id, variant_id, stock, unit_price, reorder_level, created_at, updated_at
          ) VALUES (
            po_record.warehouse_company_id, v_rebate_line.variant_id, v_qty_good,
            0, 100, NOW(), NOW()
          );
        END IF;
      ELSE
        INSERT INTO public.warehouse_location_inventory (company_id, location_id, variant_id, stock, updated_at)
        VALUES (po_record.warehouse_company_id, v_wh_loc, v_rebate_line.variant_id, v_qty_good, NOW())
        ON CONFLICT (location_id, variant_id) DO UPDATE
        SET stock = public.warehouse_location_inventory.stock + EXCLUDED.stock,
            updated_at = NOW();

        UPDATE public.main_inventory
        SET allocated_stock = COALESCE(allocated_stock, 0) + v_qty_good,
            updated_at = NOW()
        WHERE company_id = po_record.warehouse_company_id
          AND variant_id = v_rebate_line.variant_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows = 0 THEN
          INSERT INTO public.main_inventory (
            company_id, variant_id, stock, allocated_stock, unit_price, reorder_level, created_at, updated_at
          ) VALUES (
            po_record.warehouse_company_id, v_rebate_line.variant_id, 0, v_qty_good,
            0, 100, NOW(), NOW()
          );
        END IF;
      END IF;

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.warehouse_company_id, v_rebate_line.variant_id, 'rebate_return_in', v_qty_good,
        'purchase_order', p_fulfillment_po_id, auth.uid(),
        'Rebate return (good) PO ' || po_record.po_number,
        NOW()
      );
    END IF;

    IF v_qty_damaged > 0 THEN
      INSERT INTO public.warehouse_inventory_disposals (
        company_id, warehouse_location_id, variant_id, quantity,
        source_type, rebate_id, fulfillment_po_id, rebate_line_id,
        notes, disposed_by
      ) VALUES (
        po_record.warehouse_company_id, v_wh_loc, v_rebate_line.variant_id, v_qty_damaged,
        'rebate_return', v_rebate.id, p_fulfillment_po_id, v_rebate_line.id,
        NULLIF(trim(p_notes), ''), auth.uid()
      );

      INSERT INTO public.inventory_transactions (
        company_id, variant_id, transaction_type, quantity,
        reference_type, reference_id, performed_by, notes, created_at
      ) VALUES (
        po_record.warehouse_company_id, v_rebate_line.variant_id, 'rebate_return_disposed', v_qty_damaged,
        'purchase_order', p_fulfillment_po_id, auth.uid(),
        'Rebate return (damaged/disposal) PO ' || po_record.po_number,
        NOW()
      );
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'receipt_id', v_receipt_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_key_account_rebate_returns(uuid, jsonb, text) TO authenticated;
