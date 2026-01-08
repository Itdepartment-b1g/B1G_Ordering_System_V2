-- ============================================================================
-- RETURN INVENTORY TO LEADER FUNCTION
-- ============================================================================
-- This function handles inventory returns from agents to leaders
-- Features:
--   1. Supports both full and partial returns
--   2. Instant transfer (no approval required)
--   3. Validates stock availability
--   4. Creates comprehensive audit trail
--   5. Updates agent_inventory for both agent and receiver
-- ============================================================================

DROP FUNCTION IF EXISTS return_inventory_to_leader(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT);

CREATE OR REPLACE FUNCTION return_inventory_to_leader(
  p_agent_id UUID,
  p_receiver_id UUID,
  p_return_type TEXT,
  p_return_reason TEXT,
  p_reason_notes TEXT,
  p_items JSONB,
  p_signature_url TEXT DEFAULT NULL,
  p_signature_path TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_return_id UUID;
  v_item JSONB;
  v_variant_id UUID;
  v_quantity INTEGER;
  v_agent_stock INTEGER;
  v_allocated_price NUMERIC(10,2);
  v_dsp_price NUMERIC(10,2);
  v_rsp_price NUMERIC(10,2);
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
BEGIN
  -- 1. Validate agent and get company
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = p_agent_id;
  
  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Agent not found');
  END IF;

  -- 2. Validate receiver belongs to same company
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = p_receiver_id 
    AND company_id = v_company_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Invalid receiver or company mismatch');
  END IF;

  -- 3. Validate return type
  IF p_return_type NOT IN ('full', 'partial') THEN
    RETURN json_build_object('success', false, 'message', 'Invalid return type');
  END IF;

  -- 4. Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'No items specified for return');
  END IF;

  -- 5. Create return record
  INSERT INTO inventory_returns (
    company_id, agent_id, receiver_id, return_type,
    return_reason, reason_notes, signature_url, signature_path
  ) VALUES (
    v_company_id, p_agent_id, p_receiver_id, p_return_type,
    p_return_reason, p_reason_notes, p_signature_url, p_signature_path
  ) RETURNING id INTO v_return_id;

  -- 6. Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_variant_id := (v_item->>'variant_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    -- Validate quantity
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity % for variant %', v_quantity, v_variant_id;
    END IF;

    -- Get agent's current stock and pricing
    SELECT stock, allocated_price, dsp_price, rsp_price
    INTO v_agent_stock, v_allocated_price, v_dsp_price, v_rsp_price
    FROM agent_inventory
    WHERE agent_id = p_agent_id 
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Validate sufficient stock
    IF v_agent_stock IS NULL THEN
      RAISE EXCEPTION 'Variant % not found in agent inventory', v_variant_id;
    END IF;

    IF v_agent_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for variant %. Available: %, Requested: %', 
        v_variant_id, v_agent_stock, v_quantity;
    END IF;

    -- Deduct from agent's inventory
    UPDATE agent_inventory
    SET stock = stock - v_quantity, 
        updated_at = NOW()
    WHERE agent_id = p_agent_id
      AND variant_id = v_variant_id
      AND company_id = v_company_id;

    -- Add to receiver's inventory (check if exists first, then update or insert)
    -- This approach works with or without the unique constraint
    IF EXISTS (
      SELECT 1 FROM agent_inventory 
      WHERE agent_id = p_receiver_id 
        AND variant_id = v_variant_id 
        AND company_id = v_company_id
    ) THEN
      -- Update existing record
      UPDATE agent_inventory
      SET 
        stock = stock + v_quantity,
        updated_at = NOW()
      WHERE agent_id = p_receiver_id
        AND variant_id = v_variant_id
        AND company_id = v_company_id;
    ELSE
      -- Insert new record
      INSERT INTO agent_inventory (
        agent_id, variant_id, company_id, stock, 
        allocated_price, dsp_price, rsp_price, updated_at
      ) VALUES (
        p_receiver_id, v_variant_id, v_company_id, v_quantity,
        v_allocated_price, v_dsp_price, v_rsp_price, NOW()
      );
    END IF;

    -- Log return item
    INSERT INTO inventory_return_items (
      return_id, variant_id, quantity, allocated_price
    ) VALUES (
      v_return_id, v_variant_id, v_quantity, v_allocated_price
    );

    -- Note: Transaction log removed per user request
    -- All return details are tracked in inventory_returns and inventory_return_items tables
    -- Agent inventory is updated directly (deduct from agent, add to receiver)

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_quantity;
  END LOOP;

  -- 7. Return success with summary
  RETURN json_build_object(
    'success', true,
    'message', 'Inventory returned successfully',
    'return_id', v_return_id,
    'items_returned', v_total_items,
    'total_quantity', v_total_quantity,
    'return_type', p_return_type
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'message', SQLERRM
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION return_inventory_to_leader(UUID, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

