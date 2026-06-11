-- Add allocation_history linking for leader -> agent allocations.

DROP FUNCTION IF EXISTS public.allocate_to_agent(uuid, uuid, integer, numeric, numeric, numeric, uuid);
DROP FUNCTION IF EXISTS public.allocate_to_agent(uuid, uuid, integer, numeric, numeric, numeric, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.allocate_to_agent(
  p_agent_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_allocated_price numeric,
  p_dsp_price numeric,
  p_rsp_price numeric,
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
  v_company_id uuid;
  v_agent_inventory_id uuid;
  v_current_stock integer;
  v_leader_inventory_id uuid;
  v_leader_stock integer;
  v_leader_role text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Quantity must be greater than zero');
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agent not found or has no company');
  END IF;

  SELECT role INTO v_leader_role
  FROM public.profiles
  WHERE id = p_performed_by;

  IF v_leader_role = 'team_leader' OR v_leader_role = 'manager' THEN
    SELECT id, stock
    INTO v_leader_inventory_id, v_leader_stock
    FROM public.agent_inventory
    WHERE agent_id = p_performed_by
      AND variant_id = p_variant_id
      AND company_id = v_company_id;

    IF v_leader_inventory_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'You do not have this product in your inventory');
    END IF;

    IF v_leader_stock < p_quantity THEN
      RETURN json_build_object(
        'success', false,
        'error', CONCAT('Insufficient stock. You have ', v_leader_stock, ' units available, but tried to allocate ', p_quantity, ' units')
      );
    END IF;

    UPDATE public.agent_inventory
    SET stock = stock - p_quantity,
        updated_at = now()
    WHERE id = v_leader_inventory_id;
  END IF;

  SELECT id, stock
  INTO v_agent_inventory_id, v_current_stock
  FROM public.agent_inventory
  WHERE agent_id = p_agent_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    INSERT INTO public.agent_inventory (
      agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price
    )
    VALUES (
      p_agent_id, p_variant_id, v_company_id, p_quantity, p_allocated_price, p_dsp_price, p_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    UPDATE public.agent_inventory
    SET stock = stock + p_quantity,
        allocated_price = p_allocated_price,
        dsp_price = coalesce(p_dsp_price, dsp_price),
        rsp_price = coalesce(p_rsp_price, rsp_price),
        updated_at = now()
    WHERE id = v_agent_inventory_id;
  END IF;

  INSERT INTO public.inventory_transactions (
    company_id,
    variant_id,
    transaction_type,
    quantity,
    from_location,
    to_location,
    performed_by,
    notes,
    reference_type,
    reference_id
  )
  VALUES (
    v_company_id,
    p_variant_id,
    'allocated_to_agent',
    p_quantity,
    'leader_inventory',
    CONCAT('agent_inventory:', p_agent_id),
    p_performed_by,
    CONCAT('Allocated ', p_quantity, ' units to agent ', p_agent_id),
    p_reference_type,
    p_reference_id
  );

  RETURN json_build_object(
    'success', true,
    'message',
      CASE
        WHEN v_leader_role = 'team_leader' OR v_leader_role = 'manager'
          THEN CONCAT('Stock allocated successfully. ', p_quantity, ' units deducted from your inventory')
        ELSE 'Stock allocated to agent successfully'
      END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_to_agent(uuid, uuid, integer, numeric, numeric, numeric, uuid, text, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.allocate_batch_to_agent(uuid, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.allocate_batch_to_agent(
  p_agent_id uuid,
  p_items jsonb,
  p_performed_by uuid,
  p_brand_id uuid DEFAULT NULL
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
  v_allocated_price numeric;
  v_dsp_price numeric;
  v_rsp_price numeric;
  v_result json;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'At least one item is required');
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = p_agent_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agent not found or has no company');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'error', 'Each item must have quantity greater than zero');
    END IF;
  END LOOP;

  INSERT INTO public.allocation_history (company_id, allocated_to, allocated_by, brand_id, allocation_type)
  VALUES (v_company_id, p_agent_id, p_performed_by, p_brand_id, 'leader_to_agent')
  RETURNING id INTO v_allocation_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_variant_id := (v_item->>'variant_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_allocated_price := (v_item->>'allocated_price')::numeric;
    v_dsp_price := (v_item->>'dsp_price')::numeric;
    v_rsp_price := (v_item->>'rsp_price')::numeric;

    IF v_variant_id IS NULL THEN
      RAISE EXCEPTION 'Each item must include variant_id';
    END IF;
    IF v_allocated_price IS NULL THEN
      RAISE EXCEPTION 'Each item must include allocated_price';
    END IF;

    v_result := public.allocate_to_agent(
      p_agent_id,
      v_variant_id,
      v_quantity,
      v_allocated_price,
      v_dsp_price,
      v_rsp_price,
      p_performed_by,
      'allocation_history',
      v_allocation_id
    );

    IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_result->>'error', 'Allocation failed');
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'allocation_id', v_allocation_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_batch_to_agent(uuid, jsonb, uuid, uuid) TO authenticated;
