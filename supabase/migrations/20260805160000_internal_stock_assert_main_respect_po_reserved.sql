-- internal_stock_request_assert_main_available: exclude open transfer PO holds
-- (matches allocate_stock_to_sub_warehouse and main inventory Available view).

CREATE OR REPLACE FUNCTION public.internal_stock_request_assert_main_available(
  p_company_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_available integer;
  v_po_reserved integer;
  v_lot_qty integer;
  v_main_loc_id uuid;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No lines to validate';
  END IF;

  v_main_loc_id := public.get_main_warehouse_location_id(p_company_id);
  IF v_main_loc_id IS NULL THEN
    RAISE EXCEPTION 'Main warehouse location not found';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_variant_id := NULLIF(v_line->>'variant_id', '')::uuid;
    v_quantity := COALESCE((v_line->>'quantity')::integer, 0);

    IF v_variant_id IS NULL OR v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT (mi.stock - COALESCE(mi.allocated_stock, 0))::int INTO v_available
    FROM public.main_inventory mi
    WHERE mi.company_id = p_company_id
      AND mi.variant_id = v_variant_id;

    IF v_available IS NULL THEN
      RAISE EXCEPTION 'Variant % is not stocked at main warehouse', v_variant_id;
    END IF;

    v_po_reserved := public.warehouse_open_transfer_reserved(
      p_company_id,
      v_variant_id,
      v_main_loc_id,
      NULL
    );

    v_available := GREATEST(0, v_available - COALESCE(v_po_reserved, 0));

    IF v_available < v_quantity THEN
      RAISE EXCEPTION 'Insufficient available stock for variant % (need %, have %)', v_variant_id, v_quantity, v_available;
    END IF;

    SELECT COALESCE(SUM(ibl.quantity_remaining), 0) INTO v_lot_qty
    FROM public.inventory_batch_lots ibl
    WHERE ibl.company_id = p_company_id
      AND ibl.warehouse_location_id = v_main_loc_id
      AND ibl.variant_id = v_variant_id
      AND ibl.quantity_remaining > 0;

    IF v_lot_qty < v_quantity THEN
      RAISE EXCEPTION 'Insufficient batch lot stock at main warehouse for variant % (need %, have %)', v_variant_id, v_quantity, v_lot_qty;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.internal_stock_request_assert_main_available(uuid, jsonb) IS
  'Validates main warehouse can cover lines: available = stock − allocated − open transfer PO holds; batch lots must exist.';

GRANT EXECUTE ON FUNCTION public.internal_stock_request_assert_main_available(uuid, jsonb) TO authenticated;
