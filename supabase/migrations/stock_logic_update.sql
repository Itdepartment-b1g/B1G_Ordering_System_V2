-- Update stock logic to support "Persistent Allocated Stock" model
-- Total Stock = Warehouse + Distributed
-- Allocated Stock = Distributed + Pending
-- Available Stock = Total - Allocated

-- ============================================================================
-- 1. UPDATE allocate_to_leader
--    - Now increments main_inventory.allocated_stock
--    - Checks availability using main_inventory columns
-- ============================================================================

CREATE OR REPLACE FUNCTION allocate_to_leader(
  p_leader_id UUID,
  p_variant_id UUID,
  p_quantity INTEGER,
  p_performed_by UUID
)
RETURNS JSON
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
  -- Get the company_id from the leader's profile
  SELECT company_id INTO v_company_id
  FROM profiles
  WHERE id = p_leader_id;

  IF v_company_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Leader not found or has no company');
  END IF;

  -- Get total stock, allocated, and prices from main_inventory
  -- We now use the allocated_stock column directly
  SELECT id, stock, COALESCE(allocated_stock, 0), unit_price, selling_price, dsp_price, rsp_price 
  INTO v_main_inventory_id, v_total_stock, v_allocated_stock, v_unit_price, v_selling_price, v_dsp_price, v_rsp_price
  FROM main_inventory
  WHERE variant_id = p_variant_id
    AND company_id = v_company_id;

  -- Check if inventory exists
  IF v_main_inventory_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Variant not found in main inventory');
  END IF;

  -- Calculate available stock (Total - Allocated)
  v_available_stock := v_total_stock - v_allocated_stock;

  -- Check if enough available stock
  IF v_available_stock < p_quantity THEN
    RETURN json_build_object(
      'success', false,
      'error', CONCAT('Insufficient available stock. Available: ', v_available_stock, ', Requested: ', p_quantity)
    );
  END IF;

  -- Update main_inventory: Increase allocated_stock (Persistent Allocation)
  UPDATE main_inventory
  SET allocated_stock = v_allocated_stock + p_quantity,
      updated_at = NOW()
  WHERE id = v_main_inventory_id;
  
  -- Re-fetch new values for response
  v_allocated_stock := v_allocated_stock + p_quantity;
  v_available_stock := v_total_stock - v_allocated_stock;

  -- Check if leader already has this variant in agent_inventory
  SELECT id INTO v_agent_inventory_id
  FROM agent_inventory
  WHERE agent_id = p_leader_id
    AND variant_id = p_variant_id
    AND company_id = v_company_id;

  IF v_agent_inventory_id IS NULL THEN
    -- Insert new record
    INSERT INTO agent_inventory (
      agent_id, variant_id, company_id, stock, allocated_price, dsp_price, rsp_price
    ) VALUES (
      p_leader_id, p_variant_id, v_company_id, p_quantity, v_selling_price, v_dsp_price, v_rsp_price
    )
    RETURNING id INTO v_agent_inventory_id;
  ELSE
    -- Update existing record
    UPDATE agent_inventory
    SET stock = stock + p_quantity,
        allocated_price = v_selling_price,
        dsp_price = v_dsp_price,
        rsp_price = v_rsp_price,
        updated_at = NOW()
    WHERE id = v_agent_inventory_id;
  END IF;

  -- Create transaction record
  INSERT INTO inventory_transactions (
    company_id, variant_id, transaction_type, quantity, from_location, to_location, performed_by, notes
  ) VALUES (
    v_company_id, p_variant_id, 'allocated_to_agent', p_quantity, 'main_inventory', CONCAT('agent_inventory:', p_leader_id), p_performed_by,
    CONCAT('Stock allocated to team leader (Persistent) - Total: ', v_total_stock, ', Allocated: ', v_allocated_stock, ', Avail: ', v_available_stock)
  );

  RETURN json_build_object(
    'success', true,
    'allocated_quantity', p_quantity,
    'total_stock', v_total_stock,
    'allocated_stock_after', v_allocated_stock,
    'available_stock_after', v_available_stock
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- 2. UPDATE leader_accept_and_distribute_stock
--    - NO LONGER reduces main_inventory.stock or allocated_stock
--    - Stock remains "Allocated" (Distributed)
-- ============================================================================

CREATE OR REPLACE FUNCTION leader_accept_and_distribute_stock(
  p_request_id UUID,
  p_leader_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_total_quantity INTEGER;
  v_agent_quantity INTEGER;
  v_leader_quantity INTEGER;
  v_allocated_price DECIMAL(10,2);
  v_dsp_price DECIMAL(10,2);
  v_rsp_price DECIMAL(10,2);
BEGIN
  -- Get the approved request
  SELECT * INTO v_request 
  FROM stock_requests 
  WHERE id = p_request_id AND leader_id = p_leader_id AND status = 'approved_by_admin';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request not found or not approved by admin');
  END IF;
  
  -- Calculate quantities
  v_agent_quantity := v_request.requested_quantity;
  v_leader_quantity := COALESCE(v_request.leader_additional_quantity, 0);
  v_total_quantity := v_agent_quantity + v_leader_quantity;
  
  -- Get pricing from main_inventory
  SELECT 
    COALESCE(selling_price, unit_price, 0),
    COALESCE(dsp_price, 0),
    COALESCE(rsp_price, 0)
  INTO v_allocated_price, v_dsp_price, v_rsp_price
  FROM main_inventory 
  WHERE variant_id = v_request.variant_id AND company_id = v_request.company_id;
  
  -- IMPORTANT CHANGE: We do NOT reduce main_inventory.stock or allocated_stock.
  -- The stock stays "Allocated" in main_inventory to represent it is no longer available.
  
  -- 2. Add leader's portion to leader's inventory (if any)
  IF v_leader_quantity > 0 THEN
    INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
    VALUES (v_request.company_id, p_leader_id, v_request.variant_id, v_leader_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
    ON CONFLICT (agent_id, variant_id) 
    DO UPDATE SET 
      stock = agent_inventory.stock + v_leader_quantity,
      allocated_price = EXCLUDED.allocated_price,
      dsp_price = EXCLUDED.dsp_price,
      rsp_price = EXCLUDED.rsp_price,
      updated_at = NOW();
  END IF;
  
  -- 3. Add agent's portion to agent's inventory
  INSERT INTO agent_inventory (company_id, agent_id, variant_id, stock, allocated_price, dsp_price, rsp_price)
  VALUES (v_request.company_id, v_request.agent_id, v_request.variant_id, v_agent_quantity, v_allocated_price, v_dsp_price, v_rsp_price)
  ON CONFLICT (agent_id, variant_id) 
  DO UPDATE SET 
    stock = agent_inventory.stock + v_agent_quantity,
    allocated_price = EXCLUDED.allocated_price,
    dsp_price = EXCLUDED.dsp_price,
    rsp_price = EXCLUDED.rsp_price,
    updated_at = NOW();
  
  -- 4. Mark request as fulfilled
  UPDATE stock_requests 
  SET 
    status = 'fulfilled',
    fulfilled_at = NOW(),
    fulfilled_by = p_leader_id,
    fulfilled_quantity = v_total_quantity,
    updated_at = NOW()
  WHERE id = p_request_id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Stock distributed successfully (Persisted in Allocated)',
    'total_distributed', v_total_quantity,
    'agent_received', v_agent_quantity,
    'leader_received', v_leader_quantity
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
