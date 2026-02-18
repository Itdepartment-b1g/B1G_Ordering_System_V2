-- ============================================================================
-- RETURN INVENTORY TO MAIN (Leader returns stock to company)
-- ============================================================================
-- When a team leader returns stock to the super admin / company, we must:
--   1. Deduct from the leader's agent_inventory
--   2. Decrement main_inventory.allocated_stock so the Main Inventory page
--      shows the correct "Allocated" and "Available" values
-- Without this, allocated_stock never decreases and stays out of sync.
-- ============================================================================

CREATE OR REPLACE FUNCTION return_inventory_to_main(
  p_leader_id UUID,
  p_items JSONB,
  p_performed_by UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_leader_stock INTEGER;
  v_allocated_stock INTEGER;
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
  v_performer UUID;
BEGIN
  v_performer := COALESCE(p_performed_by, p_leader_id);

  -- 1. Get leader's company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Leader not found');
  END IF;

  -- 2. Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified');
  END IF;

  -- 3. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Invalid quantity for variant ' || v_variant_id);
    END IF;

    -- Get leader's current stock
    SELECT stock INTO v_leader_stock
    FROM agent_inventory
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    IF v_leader_stock IS NULL OR v_leader_stock < v_quantity THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Insufficient stock for variant. Leader has: ' || COALESCE(v_leader_stock::TEXT, '0') || ', requested: ' || v_quantity
      );
    END IF;

    -- Deduct from leader's agent_inventory
    UPDATE agent_inventory
    SET stock = stock - v_quantity,
        updated_at = NOW()
    WHERE agent_id = p_leader_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Decrement main_inventory.allocated_stock (never go below 0)
    UPDATE main_inventory
    SET
      allocated_stock = GREATEST(0, COALESCE(allocated_stock, 0) - v_quantity),
      updated_at = NOW()
    WHERE variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Audit log
    INSERT INTO inventory_transactions (
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
      'return_to_main',
      v_quantity,
      CONCAT('agent_inventory:', p_leader_id),
      'main_inventory',
      v_performer,
      COALESCE(p_reason, 'Leader returned stock to main inventory')
    );

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Stock returned to main inventory',
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION return_inventory_to_main(UUID, JSONB, UUID, TEXT) TO authenticated;
COMMENT ON FUNCTION return_inventory_to_main IS 'When a team leader returns stock to the company, deducts from leader agent_inventory and decrements main_inventory.allocated_stock so Main Inventory page shows correct Allocated/Available.';
