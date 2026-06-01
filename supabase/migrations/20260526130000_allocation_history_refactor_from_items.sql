-- Upgrade path if 20260526120000 (old items-table version) was already applied.
-- Safe to re-run when only the final 20260526120000 migration was applied (no items table).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'allocation_history_items'
  ) THEN
    DROP POLICY IF EXISTS "Allocation history items: company read"
      ON public.allocation_history_items;
  END IF;
END $$;

DROP TABLE IF EXISTS public.allocation_history_items CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'allocation_history'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocation_history' AND column_name = 'leader_id'
  ) THEN
    ALTER TABLE public.allocation_history RENAME COLUMN leader_id TO allocated_to;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocation_history' AND column_name = 'performed_by'
  ) THEN
    ALTER TABLE public.allocation_history RENAME COLUMN performed_by TO allocated_by;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocation_history' AND column_name = 'total_quantity'
  ) THEN
    ALTER TABLE public.allocation_history DROP COLUMN total_quantity;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocation_history' AND column_name = 'line_count'
  ) THEN
    ALTER TABLE public.allocation_history DROP COLUMN line_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'allocation_history' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.allocation_history DROP COLUMN notes;
  END IF;

  ALTER TABLE public.allocation_history DROP CONSTRAINT IF EXISTS allocation_history_total_quantity_check;
  ALTER TABLE public.allocation_history DROP CONSTRAINT IF EXISTS allocation_history_line_count_check;

  ALTER TABLE public.allocation_history DROP CONSTRAINT IF EXISTS allocation_history_allocation_type_check;
  ALTER TABLE public.allocation_history
    ADD CONSTRAINT allocation_history_allocation_type_check CHECK (
      allocation_type = ANY (ARRAY['main_to_leader'::text, 'leader_to_agent'::text])
    );

  DROP INDEX IF EXISTS public.idx_allocation_history_leader_created;
  CREATE INDEX IF NOT EXISTS idx_allocation_history_allocated_to_created
    ON public.allocation_history (allocated_to, created_at DESC);

  DROP POLICY IF EXISTS "Allocation history: company read" ON public.allocation_history;
  CREATE POLICY "Allocation history: company read"
    ON public.allocation_history
    FOR SELECT
    TO authenticated
    USING (
      company_id = public.get_auth_company_id()
      OR allocated_to = auth.uid()
      OR public.is_system_administrator()
    );
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_allocation_ref
  ON public.inventory_transactions (reference_type, reference_id)
  WHERE reference_type = 'allocation_history';

-- Refresh RPCs (idempotent; ensures reference_type/reference_id linking on allocate)
DROP FUNCTION IF EXISTS public.allocate_to_leader(uuid, uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.allocate_to_leader(uuid, uuid, integer, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.allocate_to_leader(
  p_leader_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_performed_by uuid,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_main_inventory_id UUID;
  v_total_stock INTEGER;
  v_allocated_stock INTEGER;
  v_available_stock INTEGER;
  v_unit_price NUMERIC;
  v_selling_price NUMERIC;
  v_dsp_price NUMERIC;
  v_rsp_price NUMERIC;
  v_company_id UUID;
  v_agent_inventory_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE id = p_leader_id;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Leader not found or has no company');
  END IF;

  SELECT id, stock, COALESCE(allocated_stock, 0), unit_price, selling_price, dsp_price, rsp_price
  INTO v_main_inventory_id, v_total_stock, v_allocated_stock, v_unit_price, v_selling_price, v_dsp_price, v_rsp_price
  FROM main_inventory WHERE variant_id = p_variant_id AND company_id = v_company_id;

  IF v_main_inventory_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found in main inventory');
  END IF;

  v_available_stock := v_total_stock - v_allocated_stock;
  IF v_available_stock < p_quantity THEN
    RETURN json_build_object('success', false, 'error', CONCAT('Insufficient available stock. Available: ', v_available_stock, ', Requested: ', p_quantity));
  END IF;

  UPDATE main_inventory SET allocated_stock = v_allocated_stock + p_quantity, updated_at = NOW() WHERE id = v_main_inventory_id;
  v_allocated_stock := v_allocated_stock + p_quantity;
  v_available_stock := v_total_stock - v_allocated_stock;

  SELECT id INTO v_agent_inventory_id FROM agent_inventory
  WHERE agent_id = p_leader_id AND variant_id = p_variant_id AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    INSERT INTO agent_inventory (agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (p_leader_id, p_variant_id, v_company_id, p_quantity, v_selling_price, v_dsp_price, v_rsp_price)
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    UPDATE agent_inventory SET stock = stock + p_quantity, allocated_price = v_selling_price,
      dsp_price = v_dsp_price, rsp_price = v_rsp_price, updated_at = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  INSERT INTO inventory_transactions (
    company_id, variant_id, transaction_type, quantity, from_location, to_location,
    performed_by, notes, reference_type, reference_id
  ) VALUES (
    v_company_id, p_variant_id, 'allocated_to_agent', p_quantity, 'main_inventory',
    CONCAT('agent_inventory:', p_leader_id), p_performed_by,
    CONCAT('Stock allocated to team leader - Total: ', v_total_stock, ', Allocated: ', v_allocated_stock, ', Avail: ', v_available_stock),
    p_reference_type, p_reference_id
  );

  RETURN json_build_object('success', true, 'allocated_quantity', p_quantity,
    'total_stock', v_total_stock, 'allocated_stock_after', v_allocated_stock, 'available_stock_after', v_available_stock);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_to_leader(uuid, uuid, integer, uuid, text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.allocate_batch_to_leader(uuid, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.allocate_batch_to_leader(
  p_leader_id uuid, p_items jsonb, p_performed_by uuid, p_brand_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_allocation_id uuid;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_result json;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = p_leader_id;
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Leader not found or has no company');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each item must have quantity greater than zero');
    END IF;
  END LOOP;

  INSERT INTO public.allocation_history (company_id, allocated_to, allocated_by, brand_id, allocation_type)
  VALUES (v_company_id, p_leader_id, p_performed_by, p_brand_id, 'main_to_leader')
  RETURNING id INTO v_allocation_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_variant_id IS NULL THEN RAISE EXCEPTION 'Each item must include variant_id'; END IF;

    v_result := public.allocate_to_leader(
      p_leader_id, v_variant_id, v_quantity, p_performed_by, 'allocation_history', v_allocation_id
    );
    IF COALESCE((v_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(v_result->>'error', 'Allocation failed');
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'allocation_id', v_allocation_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_batch_to_leader(uuid, jsonb, uuid, uuid) TO authenticated;
