-- Warehouse allocation history: session header for main -> sub-warehouse allocations
-- Line items: inventory_transactions + inventory_batch_movements linked via reference_type/reference_id

-- ---------------------------------------------------------------------------
-- 1) warehouse_allocation_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.warehouse_allocation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE RESTRICT,
  performed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.warehouse_allocation_history IS
  'Grouped main-to-sub-warehouse stock allocation sessions.';
COMMENT ON COLUMN public.warehouse_allocation_history.location_id IS
  'Sub-warehouse location that received stock.';
COMMENT ON COLUMN public.warehouse_allocation_history.brand_id IS
  'Optional header brand; null for multi-brand batches.';

CREATE INDEX IF NOT EXISTS idx_warehouse_allocation_history_company_created
  ON public.warehouse_allocation_history (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_warehouse_allocation_history_location_created
  ON public.warehouse_allocation_history (location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_wh_allocation_ref
  ON public.inventory_transactions (reference_type, reference_id)
  WHERE reference_type = 'warehouse_allocation_history';

CREATE INDEX IF NOT EXISTS idx_inventory_batch_movements_wh_allocation_ref
  ON public.inventory_batch_movements (reference_type, reference_id)
  WHERE reference_type = 'warehouse_allocation_history';

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.warehouse_allocation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Warehouse allocation history: sysadmin all" ON public.warehouse_allocation_history;
CREATE POLICY "Warehouse allocation history: sysadmin all"
  ON public.warehouse_allocation_history FOR ALL
  USING (public.is_system_administrator())
  WITH CHECK (public.is_system_administrator());

DROP POLICY IF EXISTS "Warehouse allocation history: warehouse select" ON public.warehouse_allocation_history;
CREATE POLICY "Warehouse allocation history: warehouse select"
  ON public.warehouse_allocation_history FOR SELECT
  USING (
    public.is_warehouse()
    AND company_id = public.get_auth_company_id()
    AND (
      public.is_main_warehouse_user(auth.uid())
      OR location_id = public.get_warehouse_location_id(auth.uid())
    )
  );

GRANT SELECT ON public.warehouse_allocation_history TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) allocate_stock_to_sub_warehouse — create history session + link references
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
      'fifo',
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

GRANT EXECUTE ON FUNCTION public.allocate_stock_to_sub_warehouse(uuid, jsonb, uuid, text) TO authenticated;
