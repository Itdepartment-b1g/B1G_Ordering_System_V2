-- Sub-warehouse (location) stock allocation + returns

-- ---------------------------------------------------------------------------
-- 1) inventory_transactions: extend transaction types
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'purchase_order_received'::text,
    'allocated_to_agent'::text,
    'order_fulfilled'::text,
    'adjustment'::text,
    'return'::text,
    'return_to_main'::text,
    'warehouse_transfer_out'::text,
    'warehouse_transfer_in'::text,
    'warehouse_allocate_to_sub'::text,
    'warehouse_return_from_sub'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) RLS tightening for location inventory visibility
--    - Sub-warehouse user: only their own location
--    - Main-warehouse user (is_main=true): all locations in company
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Warehouse location inventory: warehouse select own company" ON public.warehouse_location_inventory;
CREATE POLICY "Warehouse location inventory: warehouse select by membership"
  ON public.warehouse_location_inventory FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'warehouse')
    AND company_id = public.get_auth_company_id()
    AND (
      -- user belongs to this location
      EXISTS (
        SELECT 1
        FROM public.warehouse_location_users wlu
        WHERE wlu.user_id = auth.uid()
          AND wlu.location_id = warehouse_location_inventory.location_id
      )
      OR
      -- or user belongs to the main location for this company
      EXISTS (
        SELECT 1
        FROM public.warehouse_location_users wlu
        JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
        WHERE wlu.user_id = auth.uid()
          AND wl.company_id = warehouse_location_inventory.company_id
          AND wl.is_main = true
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_warehouse_location_id(p_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT wlu.location_id
  FROM public.warehouse_location_users wlu
  WHERE wlu.user_id = p_user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_main_warehouse_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_location_users wlu
    JOIN public.warehouse_locations wl ON wl.id = wlu.location_id
    WHERE wlu.user_id = p_user_id
      AND wl.company_id = public.get_auth_company_id()
      AND wl.is_main = true
  )
$$;

-- ---------------------------------------------------------------------------
-- 4) Allocate from main warehouse (main_inventory) to sub-warehouse location
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
BEGIN
  v_performer := COALESCE(p_performed_by, auth.uid());

  SELECT wl.company_id INTO v_company_id
  FROM public.warehouse_locations wl
  WHERE wl.id = p_location_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sub-warehouse location not found');
  END IF;

  -- Caller must be sysadmin OR main-warehouse user for that company.
  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(auth.uid()))
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'No items specified');
  END IF;

  -- Validate availability first (avoid partial allocations).
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

  -- Allocate: reserve in main_inventory.allocated_stock and add to location inventory.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

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
      notes
    ) VALUES (
      v_company_id,
      v_variant_id,
      'warehouse_allocate_to_sub',
      v_quantity,
      'main_inventory',
      CONCAT('warehouse_location:', p_location_id),
      v_performer,
      COALESCE(p_notes, 'Allocated from main warehouse to sub-warehouse')
    );
  END LOOP;

  RETURN json_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_stock_to_sub_warehouse(uuid, jsonb, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Return from sub-warehouse location back to main warehouse (decrement reservation)
-- ---------------------------------------------------------------------------
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

  -- Caller must be sysadmin OR main-warehouse user for that company.
  IF NOT (
    public.is_system_administrator()
    OR (public.is_warehouse() AND public.is_main_warehouse_user(auth.uid()))
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

