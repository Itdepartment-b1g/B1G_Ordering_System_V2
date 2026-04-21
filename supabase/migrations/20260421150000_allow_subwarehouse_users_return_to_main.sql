-- Allow sub-warehouse users to return stock to main for their own location.
-- Previously, only sysadmin or main-warehouse users could call the return RPC.

CREATE OR REPLACE FUNCTION public.return_stock_from_sub_warehouse_to_main(
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
  v_loc_stock integer;
  v_performer uuid;
BEGIN
  v_performer := COALESCE(p_performed_by, auth.uid());

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;

  -- Caller must be:
  -- - sysadmin, OR
  -- - main-warehouse user for that company, OR
  -- - a warehouse user assigned to the specified sub-warehouse location.
  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(auth.uid()))
    OR (
      public.is_warehouse()
      AND EXISTS (
        SELECT 1
        FROM public.warehouse_location_users wlu
        WHERE wlu.user_id = auth.uid()
          AND wlu.location_id = p_location_id
      )
    )
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No items specified');
  END IF;

  -- Validate stock first.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    IF v_variant_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Invalid item payload');
    END IF;

    SELECT wli.stock INTO v_loc_stock
    FROM public.warehouse_location_inventory wli
    WHERE wli.location_id = p_location_id
      AND wli.variant_id = v_variant_id
      AND wli.company_id = v_company_id;

    IF v_loc_stock IS NULL OR v_loc_stock < v_quantity THEN
      RETURN json_build_object('success', false, 'error', 'Insufficient sub-warehouse stock to return');
    END IF;
  END LOOP;

  -- Apply return
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    UPDATE public.warehouse_location_inventory
    SET stock = stock - v_quantity,
        updated_at = now()
    WHERE location_id = p_location_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    UPDATE public.main_inventory
    SET allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_quantity),
        updated_at = now()
    WHERE company_id = v_company_id
      AND variant_id = v_variant_id;

    INSERT INTO public.inventory_transactions (
      company_id,
      variant_id,
      transaction_type,
      quantity,
      from_location,
      to_location,
      performed_by,
      notes
    ) VALUES (
      v_company_id,
      v_variant_id,
      'warehouse_return_from_sub',
      v_quantity,
      CONCAT('warehouse_location:', p_location_id),
      'main_inventory',
      v_performer,
      COALESCE(p_notes, 'Returned from sub-warehouse to main warehouse')
    );
  END LOOP;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_stock_from_sub_warehouse_to_main(uuid, jsonb, uuid, text) TO authenticated;

